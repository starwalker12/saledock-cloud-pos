import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';

test('real authenticated 50k finalizer: ledger x3, sales x10, supplier x3, mixed x3',{
 skip:process.env.RUN_LOCAL_ATOMIC_IMPORT_QUALIFY!=='1',timeout:900000,
},async t=>{
 const {isolated,org,work}=await import('./helpers/atomic-import-database.mjs');
 const {payload,tables,countsFor,loadFixtureCatalog}=await import('./helpers/atomic-import-fixtures.mjs');
 const hash=()=>crypto.createHash('sha256').update(fs.readdirSync(work+'/supabase/migrations').filter(n=>n.endsWith('.sql')).sort()
  .map(n=>n+'\n'+fs.readFileSync(work+'/supabase/migrations/'+n,'utf8')).join('\n')).digest('hex');
 const expected=hash(),accepted=[];
 const campaignId=crypto.randomUUID();
 const candidateHash=()=>{
  const names=[...new Set([...execFileSync('git',['diff','--name-only','HEAD'],{cwd:work,encoding:'utf8'}).trim().split('\n'),
   ...execFileSync('git',['ls-files','--others','--exclude-standard'],{cwd:work,encoding:'utf8'}).trim().split('\n')].filter(Boolean))].sort();
  return crypto.createHash('sha256').update(names.map(n=>n+'\n'+fs.readFileSync(work+'/'+n,'utf8')).join('\n')).digest('hex');
 };
 const finalCandidate= candidateHash();
 const diagnostic=process.env.ATOMIC_IMPORT_DIAGNOSTIC==='1';
 const {instrumentFinalizer,collectTiming}=await import('./helpers/atomic-import-timing.mjs');
 const evidence=process.env.ATOMIC_IMPORT_TIMING_EVIDENCE;
 if(evidence) assert.match(evidence,/\/return-math-v1-continuation(?:-\d+)?$/);
 let runNumber=0;
 async function run(shape) {
  assert.equal(hash(),expected,'Migration must remain unchanged during qualification');
  assert.equal(candidateHash(),finalCandidate,'All candidate bytes must remain unchanged during qualification');
  const runId=(diagnostic?'diagnostic':'final')+'-'+shape+'-'+(++runNumber);
  const logTag=runId+'-'+campaignId;
  const result=await isolated(async({sql,rpc,result})=>{
   loadFixtureCatalog(sql);
   sql(`insert into public.customers(id,organization_id,name,phone)
    select md5('qa77126-existing-customer-'||n)::uuid,'${org}','Existing customer '||n,'existing-phone-'||n from generate_series(1,10000) n;
    insert into public.suppliers(id,organization_id,name)
    select md5('qa77126-existing-supplier-'||n)::uuid,'${org}','Existing supplier '||n from generate_series(1,10000) n;
    analyze public.customers;analyze public.suppliers;`);
   const counts=countsFor(50000,shape);
   const start=await rpc('start_job',{p_format:'native',p_version:'3',p_ancillary:{}});assert.equal(start.status,200);
   const job=start.data.job_id;let uploaded=0,uploadRequestMs=0;
   for(const table of tables) {
    const rows=JSON.parse(sql(`select jsonb_agg(to_jsonb(r)) from (${payload(table,counts,32)}) r`));
    let chunk=[],index=0;
    const send=async()=>{
     if(!chunk.length)return;
     const args={p_job:job,p_table:table,p_index:index,p_rows:chunk};
     assert(Buffer.byteLength(JSON.stringify(args))<=524288);
     const r=await rpc('stage_chunk',args);assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.data.ok,true);
     uploadRequestMs+=r.ms;
     uploaded+=chunk.length;index++;chunk=[];
    };
    for(const row of rows) {
     const item={source_id:row.id,payload:row};
     if(chunk.length===500||Buffer.byteLength(JSON.stringify({p_job:job,p_table:table,p_index:index,p_rows:[...chunk,item]}))>524288)await send();
     chunk.push(item);
    }
    await send();
   }
   assert.equal(uploaded,50000);
   const get=await rpc('get_job',{p_job:job});assert.equal(get.status,200);assert(get.data.bytes<=33554432);
   const sealed=await rpc('seal_job',{p_job:job,p_manifest:get.data.manifest});assert.equal(sealed.status,200);
   const valid=await rpc('validate_job',{p_job:job});assert.equal(valid.data.ok,true,JSON.stringify(valid));
   const since=instrumentFinalizer(sql,logTag);
   const final=await rpc('finalize_job',{p_job:job,p_digest:sealed.data.digest});assert.equal(final.status,200,JSON.stringify(final));
   const committed=JSON.parse(sql(`select jsonb_build_object('rows',${tables.map(table=>`(select count(*)${['customers','suppliers'].includes(table)?'-10000':''} from public.${table})`).join('+')},'mappings',(select count(*) from backup_private.mappings where job_id='${job}'),'receipts',(select count(*) from backup_private.receipts where job_id='${job}'))`));
   assert.deepEqual(committed,{rows:50000,mappings:50000,receipts:1});
   Object.assign(result,{runId,logTag,campaignId,shape,requestTotalMs:final.ms,
    normalizedRows:uploaded,canonicalBytes:get.data.bytes,relationDistribution:counts,
    receiptTransactionMs:final.data.receipt.transaction_ms,receiptIdentityMs:final.data.receipt.identity_ms,
    committed,migrationSha256:expected,candidateSha256:finalCandidate,diagnostic,
    preFinalRequestMs:{uploadAndNormalization:uploadRequestMs,seal:sealed.ms,validation:valid.ms}});
   if(evidence)fs.writeFileSync(evidence+'/'+runId+'-request.json',JSON.stringify(result,null,2)+'\n',{flag:'wx'});
   Object.assign(result,collectTiming(since,logTag));
   result.passed=result.databaseTransactionMs<=5000&&result.identityLockHeldMs<=3000;
   // Persist and emit BEFORE assertions, including the exact failing run.
   if(evidence)fs.writeFileSync(evidence+'/'+runId+'.json',JSON.stringify(result,null,2)+'\n',{flag:'wx'});
   t.diagnostic(JSON.stringify(result));
   if(!diagnostic){
    assert(result.databaseTransactionMs<=5000,'Finalizer transaction exceeded 5000ms: STOP');
    assert(result.identityLockHeldMs<=3000,'Identity critical section exceeded 3000ms: STOP');
   }
  });
  accepted.push(result);
 }
 const campaign=diagnostic?['ledger','sales','supplier','mixed']:
  [...Array(3).fill('ledger'),...Array(10).fill('sales'),...Array(3).fill('supplier'),...Array(3).fill('mixed')];
 for(const shape of campaign)await run(shape);
 assert.equal(accepted.length,diagnostic?4:19);
 assert.equal(hash(),expected);assert.equal(candidateHash(),finalCandidate);
 t.diagnostic(JSON.stringify({migrationSha256:expected,candidateSha256:finalCandidate,acceptedRuns:accepted.length,diagnostic}));
});
