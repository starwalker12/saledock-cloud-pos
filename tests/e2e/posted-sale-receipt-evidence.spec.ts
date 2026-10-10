import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { test, expect } from '@playwright/test';
import { isLocalPlaywrightRun, loginLocalOwnerDirectly } from './helpers/local-supabase';
test.describe.configure({mode:'serial',retries:0});
test.use({trace:'off',video:'off',screenshot:'off'});
test.skip(!isLocalPlaywrightRun(),'Local synthetic evidence only');
const org=randomUUID(),branch=randomUUID(),product=randomUUID(),legacy=randomUUID();
const email=`source-${org}@saledock.local`,password=randomUUID();
let admin:SupabaseClient,owner:SupabaseClient,actor='',invoice='';
const observations:Record<string,unknown>={};
function checked(error:{message:string}|null){if(error)throw new Error(error.message);}
function sql(query:string){
  const container=process.env.LOCAL_SUPABASE_DB_CONTAINER;
  if(!/^supabase_db_qa[0-9]+-[a-z0-9-]+$/.test(container??''))throw new Error('Task-isolated database only');
  return execFileSync('docker',['exec','-i',container!,'psql','-XqAt','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-f','-'],{input:query,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
}
const snapshot=()=>sql(`select jsonb_build_object('invoices',(select jsonb_agg(to_jsonb(r) order by id) from public.invoices r where organization_id='${org}'),
  'items',(select jsonb_agg(to_jsonb(r) order by id) from public.invoice_items r where organization_id='${org}'),
  'payments',(select jsonb_agg(to_jsonb(r) order by id) from public.payments r where organization_id='${org}'),
  'stock',(select stock_quantity from public.products where id='${product}'))`);
test.beforeAll(async()=>{
  const raw=execFileSync('supabase',['status','--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
  const config=JSON.parse(raw.slice(raw.indexOf('{')));
  if(!config.API_URL.startsWith('http://127.0.0.1:')||config.API_URL!==process.env.NEXT_PUBLIC_SUPABASE_URL)throw new Error('Explicit task stack required');
  admin=createClient(config.API_URL,config.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  owner=createClient(config.API_URL,config.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  checked((await admin.from('organizations').insert({id:org,name:'Synthetic protected-sale shop',onboarding_completed:true})).error);
  checked((await admin.from('branches').insert({id:branch,organization_id:org,name:'Synthetic branch'})).error);
  const user=await admin.auth.admin.createUser({email,password,email_confirm:true});checked(user.error);actor=user.data.user!.id;
  checked((await admin.from('profiles').insert({id:actor,organization_id:org,branch_id:branch,role:'owner',is_active:true,full_name:'Synthetic source owner',onboarding_completed:true})).error);
  checked((await admin.from('products').insert({id:product,organization_id:org,branch_id:branch,name:'QA protected physical',type:'product',stock_quantity:10,purchase_price:600,sale_price:1000,is_active:true})).error);
  checked((await admin.from('product_stock_lots').insert({organization_id:org,branch_id:branch,product_id:product,quantity_received:10,quantity_remaining:10,unit_cost:600,purchase_date:'2026-01-01'})).error);
  checked((await owner.auth.signInWithPassword({email,password})).error);
  const sale=await owner.rpc('pos_checkout',{p_branch_id:branch,p_customer_id:null,p_cart:[{product_id:product,quantity:1,unit_price:1000,discount:0}],p_discount_total:0,p_payment_method:'cash',p_amount_paid:1000,p_payment_ref:null,p_note:null,p_allow_loss_override:false,p_idempotency_key:randomUUID()});
  checked(sale.error);invoice=sale.data[0].invoice_id;
  // Local SQL creates a legacy read fixture with NULL provenance. It cannot
  // mark this administrative history as protected producer evidence.
  sql(`insert into public.invoices(id,organization_id,branch_id,invoice_no,status,subtotal,grand_total,amount_paid)
    values('${legacy}','${org}','${branch}','INV-QA-LEGACY','paid',1000,1000,1000);
    insert into public.invoice_items(organization_id,invoice_id,product_id,product_name,quantity,purchase_price,unit_price,line_total)
    values('${org}','${legacy}','${product}','QA legacy physical',1,600,1000,1000);
    insert into public.payments(organization_id,branch_id,invoice_id,method,amount) values('${org}','${branch}','${legacy}','cash',1000);`);
});
test.afterAll(async()=>{
  if(!actor)return;
  checked((await owner.rpc('reset_organization_to_factory_defaults',{p_organization_id:org,p_actor_id:actor,p_reset_settings:false})).error);
  checked((await admin.auth.admin.deleteUser(actor)).error);
  checked((await admin.from('organizations').delete().eq('id',org)).error);
  expect(sql(`select count(*) from public.invoices where organization_id='${org}'`)).toBe('0');
  if(process.env.QA_EVIDENCE_DIR)fs.writeFileSync(`${process.env.QA_EVIDENCE_DIR}/posted-evidence-browser-${process.env.QA_RUN_LABEL}.json`,JSON.stringify({...observations,fixtureCleanup:true,productionAccess:0},null,2),{flag:'wx'});
});
test('protected and legacy invoices stay viewable/printable; reports and export reads remain available',async({page})=>{
  test.setTimeout(90000);
  const before=snapshot(),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await loginLocalOwnerDirectly(page,email,password);
  const reject=page.getByRole('button',{name:'Reject optional cookies',exact:true});if(await reject.count())await reject.click();
  for(const [name,id] of [['protected',invoice],['legacy',legacy]]) {
    await page.goto(`/invoices/${id}`);await expect(page.locator('#invoice-print')).toBeVisible();
    await expect(page.locator('#invoice-print')).toContainText(name==='legacy'?'INV-QA-LEGACY':'QA protected physical');
    await expect(page.locator('main[aria-busy="true"]')).toHaveCount(0);
    const source=await owner.from('invoices').select('grand_total,source_trust_version').eq('id',id).single();checked(source.error);
    expect(source.data).toEqual({grand_total:1000,source_trust_version:name==='legacy'?null:1});
    await page.emulateMedia({media:'print'});
    const pdf=await page.pdf({format:'A4',printBackground:true});expect(pdf.length).toBeGreaterThan(5000);
    if(process.env.QA_EVIDENCE_DIR)fs.writeFileSync(`${process.env.QA_EVIDENCE_DIR}/${name}-invoice-${process.env.QA_RUN_LABEL}.pdf`,pdf);
    await page.emulateMedia({media:'screen'});
  }
  await page.goto('/reports');await expect(page.getByRole('heading',{name:'Management Reports',exact:true})).toBeVisible();
  await expect(page.locator('main[aria-busy="true"]')).toHaveCount(0);
  for(const table of ['invoices','invoice_items','payments','invoice_item_stock_allocations']) {
    const rows=await owner.from(table).select('*').eq('organization_id',org);checked(rows.error);expect(rows.data!.length).toBeGreaterThan(0);
  }
  expect(snapshot()).toBe(before);expect(errors).toEqual([]);
  observations.reads={protectedInvoice:true,legacyInvoice:true,pdfBoth:true,reports:true,nativeExportStarReads:true,evidenceUnchanged:true,pageErrors:errors};
});
test('ordinary authenticated REST cannot forge or rewrite receipt evidence',async()=>{
  const before=snapshot();
  const update=await owner.from('payments').update({amount:2000}).eq('invoice_id',invoice);expect(update.error?.code).toBe('42501');
  const insert=await owner.from('invoices').insert({organization_id:org,branch_id:branch,invoice_no:'FORGED',grand_total:2000,source_trust_version:1});expect(insert.error?.code).toBe('42501');
  const deletion=await owner.from('invoice_items').delete().eq('invoice_id',invoice);expect(deletion.error?.code).toBe('42501');
  expect(snapshot()).toBe(before);observations.rest={update:'42501',insert:'42501',delete:'42501',unchanged:true};
});
