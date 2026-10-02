import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import JSZip from 'jszip';
import initSqlJs from 'sql.js';
import {createClient, type SupabaseClient} from '@supabase/supabase-js';
import {test, expect, type Page} from '@playwright/test';
import {isLocalPlaywrightRun, loginLocalOwnerDirectly} from './helpers/local-supabase';

test.describe.configure({mode:'serial',retries:0});
test.use({trace:'off',video:'off',screenshot:'off'});
test.skip(!isLocalPlaywrightRun(),'Local synthetic restore only');
const org=randomUUID(),branch=randomUUID(),password=randomUUID();
const email=`atomic-${org}@saledock.local`;
let admin:SupabaseClient,ownerClient:SupabaseClient,owner:string,adminId:string;
const adminEmail=`atomic-admin-${org}@saledock.local`;
const evidence:Record<string,unknown>={};
const directory=process.env.QA_EVIDENCE_DIR;
function checked(error:{message:string}|null){if(error)throw new Error(error.message);}
function sql(query:string){
  const container=process.env.LOCAL_SUPABASE_DB_CONTAINER;
  if(!container?.startsWith('supabase_db_qa77126-'))throw new Error('Disposable task stack required');
  return execFileSync('docker',['exec','-i',container,'psql','-XqAt','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-f','-'],{input:query,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
}
async function upload(page:Page,data:Record<string,unknown>){
  const zip=new JSZip();zip.file('manifest.json',JSON.stringify({AppName:'SaleDock Cloud POS',BackupVersion:3,SchemaVersion:1,BackupType:'OnlineBackup',CreatedAt:'2026-01-01T00:00:00Z',CreatedBy:'Synthetic QA'}));
  zip.file('data/gadgetzone-online.json',JSON.stringify(data));
  await page.locator('input[type=file]').setInputFiles({name:'synthetic-atomic.zip',mimeType:'application/zip',buffer:await zip.generateAsync({type:'nodebuffer'})});
  await expect(page.getByText('Online Backup ZIP Detected',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:/Restore options/}).click();
  await page.getByRole('button',{name:/Dry run checks/}).click();
}
async function confirm(page:Page){
  await page.getByRole('button',{name:/Confirm Import/}).click();
  await page.getByRole('checkbox').check();
  await page.locator('#confirm-phrase').fill('RESTORE ONLINE BACKUP');
  await page.getByRole('button',{name:'Begin Online Restore',exact:true}).click();
}
test.beforeAll(async()=>{
  if(!process.env.LOCAL_SUPABASE_DB_CONTAINER?.startsWith('supabase_db_qa77126-')){
    throw new Error('Disposable task stack required before creating any fixtures');
  }
  const raw=execFileSync('supabase',['status','--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
  const config=JSON.parse(raw.slice(raw.indexOf('{')));
  if(!config.API_URL.startsWith('http://127.0.0.1:'))throw new Error('Loopback required');
  admin=createClient(config.API_URL,config.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  checked((await admin.from('organizations').insert({id:org,name:'Synthetic atomic import QA',onboarding_completed:true})).error);
  checked((await admin.from('branches').insert({id:branch,organization_id:org,name:'Main'})).error);
  const created=await admin.auth.admin.createUser({email,password,email_confirm:true});checked(created.error);owner=created.data.user!.id;
  checked((await admin.from('profiles').insert({id:owner,organization_id:org,branch_id:branch,full_name:'Synthetic Owner',role:'owner',is_active:true,onboarding_completed:true})).error);
  ownerClient=createClient(config.API_URL,config.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  checked((await ownerClient.auth.signInWithPassword({email,password})).error);
  const second=await admin.auth.admin.createUser({email:adminEmail,password,email_confirm:true});checked(second.error);adminId=second.data.user!.id;
  checked((await admin.from('profiles').insert({id:adminId,organization_id:org,branch_id:branch,full_name:'Synthetic Admin',role:'admin',is_active:true,onboarding_completed:true})).error);
});
test.beforeEach(async({page},info)=>{
  await loginLocalOwnerDirectly(page,info.title.startsWith('Admin ')?adminEmail:email,password);
  await expect(page.locator('[data-active-workspace-state="active"]')).toBeVisible();
  await page.getByRole('button',{name:'Reject optional cookies',exact:true}).click();
  await page.goto('/settings?tab=backup');
  await expect(page.getByText(info.title.startsWith('Admin ')
    ? 'Only the shop Owner can restore accounting data.'
    : 'Restore Backup ZIP',{exact:true})).toBeVisible();
});
test.afterAll(async()=>{
  if(!admin)return;
  // Test-owned snapshots only, removed in dependency order; never reset another shop.
  sql(`delete from backup_private.jobs where organization_id='${org}';`);
  for(const table of ['expenses','customer_ledger_entries','supplier_ledger_entries','customers','suppliers','audit_logs'])checked((await admin.from(table).delete().eq('organization_id',org)).error);
  if(owner)checked((await admin.auth.admin.deleteUser(owner)).error);
  if(adminId)checked((await admin.auth.admin.deleteUser(adminId)).error);
  checked((await admin.from('organizations').delete().eq('id',org)).error);
  expect(sql(`select count(*) from public.organizations where id='${org}'`)).toBe('0');
  evidence.cleanup='Only test-owned organization, staged jobs, snapshots and synthetic auth account removed';
  if(directory)fs.writeFileSync(`${directory}/import-browser-${process.env.QA_RUN_LABEL||'run'}.json`,JSON.stringify(evidence,null,2),{flag:'wx'});
});

test('native restore stages privately, settles once and retains explicit balances independently of history',async({page})=>{
  test.setTimeout(60_000);
  const customer=randomUUID(),supplier=randomUUID(),ledger=randomUUID(),expense=randomUUID();
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  let posts=0;const operations:string[]=[];
  page.on('request',r=>{if(r.method()==='POST'&&r.headers()['next-action']){
    posts++;operations.push(r.postData()?.match(/start_job|stage_chunk|get_job|seal_job|validate_job|finalize_job|restore_ancillary|finish_job|cancel_job/)?.[0]??'unclassified');
  }});
  await upload(page,{customers:[{id:customer,name:'Atomic Customer',outstanding_balance:'123.45'}],suppliers:[{id:supplier,name:'Atomic Supplier',outstanding_balance:'0.00'}],ledgerEntries:[{id:ledger,customer_id:customer,entry_type:'adjustment',direction:'debit',amount:100,balance_after:900}],expenses:[{id:expense,branch_id:branch,amount:0,category:'other',payment_method:'cash',notes:'Synthetic remaining record'}]});
  await expect(page.getByText('Source checks passed',{exact:true})).toBeVisible();
  let release!:()=>void;const held=new Promise<void>(resolve=>release=resolve);
  let observed=false;
  await page.route('**/settings**',async route=>{
    const request=route.request();
    if(request.headers()['next-action']&&request.postData()?.includes('finalize_job')){
      observed=true;await held;
    }
    await route.continue();
  });
  const saving=confirm(page);
  try { await expect.poll(()=>observed,{timeout:20_000}).toBe(true); }
  catch(error) { evidence.setupFailure={operations,text:await page.locator('main').innerText()};release();throw error; }
  await expect(page.getByRole('heading',{name:'Restoring accounting data',exact:true}).first()).toBeVisible();
  expect(sql(`select count(*) from public.customers where id='${customer}'`)).toBe('0');
  expect(sql(`select state from backup_private.jobs where organization_id='${org}'`)).toBe('ready');
  if(directory)await page.screenshot({path:`${directory}/browser-private-staging.png`});
  release();await saving;
  await expect(page.getByText('Backup Restored Successfully',{exact:true})).toBeVisible();
  const result=JSON.parse(sql(`select jsonb_build_object('customer',(select outstanding_balance from public.customers where id='${customer}'),'supplier',(select outstanding_balance from public.suppliers where id='${supplier}'),'ledger',(select count(*) from public.customer_ledger_entries where id='${ledger}'),'expense',(select count(*) from public.expenses where id='${expense}'),'receipts',(select count(*) from backup_private.receipts where organization_id='${org}'),'state',(select state from backup_private.jobs where organization_id='${org}'))`));
  expect(result).toEqual({customer:123.45,supplier:0,ledger:1,expense:1,receipts:1,state:'completed'});
  const settledPosts=posts;await page.waitForLoadState('networkidle');expect(posts).toBe(settledPosts);
  await page.getByRole('button',{name:'Check Saved Restore Status',exact:true}).click();
  await expect(page.getByText('Backup Restored Successfully',{exact:true})).toBeVisible();
  expect(operations.filter(op=>op==='finalize_job')).toHaveLength(1);
  expect(errors).toEqual([]);evidence.native={...result,actionPosts:settledPosts,operations,noAutomaticRetry:true,privateBeforeFinalize:true,pageErrors:errors};
});

test('missing supplier balance fails before business writes',async({page})=>{
  const before=sql(`select count(*) from public.suppliers where organization_id='${org}'`);
  await upload(page,{suppliers:[{id:randomUUID(),name:'Missing explicit balance'}]});
  await expect(page.getByText('This backup does not contain the current supplier balance required for a safe restore.',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:/Confirm Import/})).toBeDisabled();
  expect(sql(`select count(*) from public.suppliers where organization_id='${org}'`)).toBe(before);
  expect(sql(`select count(*) from backup_private.jobs where organization_id='${org}'`)).toBe('1');
  evidence.missingBalance={blockedBeforeStaging:true,businessRowsUnchanged:true};
});

test('target collision is a truthful failure, not a partial-success completed report',async({page})=>{
  test.setTimeout(60_000);
  const candidate=randomUUID();
  await upload(page,{customers:[{id:candidate,name:'Atomic Customer',outstanding_balance:0}]});
  await confirm(page);
  await expect(page.getByText('Import Process Halted',{exact:true})).toBeVisible();
  await expect(page.getByText('Backup Restored Successfully',{exact:true})).toHaveCount(0);
  expect(sql(`select count(*) from public.customers where id='${candidate}'`)).toBe('0');
  expect(sql(`select count(*) from backup_private.receipts where organization_id='${org}'`)).toBe('1');
  await page.getByRole('button',{name:'Check Saved Restore Status',exact:true}).click();
  await expect(page.getByText('Backup Restored Successfully',{exact:true})).toHaveCount(0);
  evidence.collision={zeroCandidateRows:true,receiptCount:1,noFalseCompletion:true};
});

test('desktop SQLite preserves explicit supplier balance and works at a mobile viewport',async({page})=>{
  test.setTimeout(60_000);
  await page.setViewportSize({width:390,height:844});
  const require=createRequire(`${process.cwd()}/package.json`);
  const SQL=await initSqlJs({locateFile:()=>require.resolve('sql.js/dist/sql-wasm.wasm')});
  const db=new SQL.Database();
  db.run("create table Suppliers(Id integer primary key,Name text,OutstandingBalance numeric);insert into Suppliers values(1,'Desktop Explicit Supplier',-12.34);");
  db.run("create table Customers(Id integer primary key,Name text,OutstandingBalance numeric);insert into Customers values(1,'Desktop Zero Customer',0);");
  const zip=new JSZip();zip.file('manifest.json',JSON.stringify({AppName:'GadgetZonePOS',BackupVersion:2,SchemaVersion:1,BackupType:'DesktopSQLite'}));
  zip.file('data/gadgetzonepos.db',db.export());db.close();
  await page.locator('input[type=file]').setInputFiles({name:'synthetic-desktop.zip',mimeType:'application/zip',buffer:await zip.generateAsync({type:'nodebuffer'})});
  await expect(page.getByText('Restore options',{exact:false}).first()).toBeVisible();
  await page.getByRole('button',{name:/Restore options/}).click();
  await page.getByRole('button',{name:/Dry run checks/}).click();
  await expect(page.getByText('Source checks passed',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:/Confirm Import/}).click();
  await page.getByRole('checkbox').check();
  await page.locator('#confirm-phrase').fill('IMPORT DESKTOP BACKUP');
  await page.getByRole('button',{name:'Begin Desktop Restore',exact:true}).click();
  await expect(page.getByText('Backup Restored Successfully',{exact:true})).toBeVisible();
  expect(sql(`select outstanding_balance from public.suppliers where organization_id='${org}' and name='Desktop Explicit Supplier'`)).toBe('-12.34');
  expect(sql(`select outstanding_balance from public.customers where organization_id='${org}' and name='Desktop Zero Customer'`)).toBe('0.00');
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);
  expect(overflow).toBe(false);
  if(directory)await page.screenshot({path:`${directory}/browser-desktop-format-mobile.png`});
  evidence.desktop={explicitSupplierBalance:-12.34,explicitCustomerZero:true,mobileWidth:390,overflow:false};
});

test('saved uncommitted upload can be discarded; ready job requires intentional finalization',async({page})=>{
  test.setTimeout(60_000);
  const first=await ownerClient.rpc('accounting_import_start_job',{p_format:'native',p_version:'3',p_ancillary:{}});checked(first.error);
  await page.evaluate(job=>sessionStorage.setItem('saledock-accounting-restore-job',job),first.data.job_id);
  await page.getByRole('button',{name:'Check Saved Restore Status',exact:true}).click();
  await expect(page.getByRole('button',{name:'Discard Uncommitted Upload',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Discard Uncommitted Upload',exact:true}).click();
  await expect(page.getByText('Saved restore state: cancelled',{exact:true})).toBeVisible();
  const customer=randomUUID();
  const next=await ownerClient.rpc('accounting_import_start_job',{p_format:'native',p_version:'3',p_ancillary:{}});checked(next.error);
  const job=next.data.job_id;
  checked((await ownerClient.rpc('accounting_import_stage_chunk',{p_job:job,p_table:'customers',p_index:0,p_rows:[{source_id:customer,payload:{id:customer,name:'Recovered Customer',outstanding_balance:'0'}}]})).error);
  const get=await ownerClient.rpc('accounting_import_get_job',{p_job:job});checked(get.error);
  checked((await ownerClient.rpc('accounting_import_seal_job',{p_job:job,p_manifest:get.data.manifest})).error);
  checked((await ownerClient.rpc('accounting_import_validate_job',{p_job:job})).error);
  await page.evaluate(id=>sessionStorage.setItem('saledock-accounting-restore-job',id),job);
  await page.reload();
  await page.getByRole('button',{name:'Check Saved Restore Status',exact:true}).click();
  await expect(page.getByRole('button',{name:'Finalize Saved Restore',exact:true})).toBeVisible();
  expect(sql(`select count(*) from public.customers where id='${customer}'`)).toBe('0');
  await page.getByRole('button',{name:'Finalize Saved Restore',exact:true}).click();
  await expect(page.getByText('Backup Restored Successfully',{exact:true})).toBeVisible();
  expect(sql(`select count(*) from public.customers where id='${customer}'`)).toBe('1');
  expect(sql(`select count(*) from backup_private.receipts where job_id='${job}'`)).toBe('1');
  evidence.recovery={discardBeforeCommit:true,readyReloadDoesNotAutoFinalize:true,intentionalFinalizeOneReceipt:true};
});

test('Admin cannot enter the Owner accounting restore wizard',async({page})=>{
  await expect(page.getByText('Only the shop Owner can restore accounting data.',{exact:true})).toBeVisible();
  await expect(page.locator('input[type=file]')).toHaveCount(0);
  evidence.admin={accountingUploadUnavailable:true};
});
