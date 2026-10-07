import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
test('authenticated atomic import: all 21 relations, every rollback boundary, and receipt replay', {
 skip:process.env.RUN_LOCAL_ATOMIC_IMPORT_DB!=='1',timeout:120000,
}, async t=>{
 const {isolated,org}=await import('./helpers/atomic-import-database.mjs');
 const {payload,countsFor,tables,loadFixtureCatalog}=await import('./helpers/atomic-import-fixtures.mjs');
 const result=await isolated(async({sql,rpc,result,loseResponseRpc})=>{
 loadFixtureCatalog(sql);
 result.cases=[];
 const jobResponse=await rpc('start_job',{p_format:'native',p_version:'2',p_ancillary:{}});assert.equal(jobResponse.status,200,JSON.stringify(jobResponse));
 const job=jobResponse.data.job_id;const counts=countsFor(100,'mixed');
 for(const table of tables){
  const rows=JSON.parse(sql(`select jsonb_agg(to_jsonb(r)) from (${payload(table,counts,0)}) r`));
  if(table==='customers')for(const row of rows)row.outstanding_balance='123.45';
  if(table==='suppliers')for(const row of rows)row.outstanding_balance='-10.00';
  const stage=await rpc('stage_chunk',{p_job:job,p_table:table,p_index:0,p_rows:rows.map(r=>({source_id:r.id,payload:r}))});
  assert.equal(stage.status,200,JSON.stringify({table,...stage}));
 }
 const get=await rpc('get_job',{p_job:job});const seal=await rpc('seal_job',{p_job:job,p_manifest:get.data.manifest});assert.equal(seal.status,200,JSON.stringify(seal));
 const validate=await rpc('validate_job',{p_job:job});assert.equal(validate.data.ok,true,JSON.stringify(validate));
 const badDigest=await rpc('finalize_job',{p_job:job,p_digest:'0'.repeat(64)});assert.equal(badDigest.status,400,JSON.stringify(badDigest));
 const residue=()=>JSON.parse(sql(`select jsonb_build_object('business',${tables.map(t=>`(select count(*) from public.${t} where organization_id='${org}')`).join('+')},
   'mappings',(select count(*) from backup_private.mappings where job_id='${job}'),
   'receipts',(select count(*) from backup_private.receipts where job_id='${job}'),
   'state',(select state from backup_private.jobs where id='${job}'))`));
 assert.deepEqual(residue(),{business:0,mappings:0,receipts:0,state:'ready'});
 result.cases.push({name:'Wrong digest rejected before business mutation',status:badDigest.status,...residue()});
 sql(`create function public.qa77126_fail_insert() returns trigger language plpgsql set search_path='' as $$
 begin raise exception 'QA77126 intentional required insert failure' using errcode='23514';end $$;
 revoke all on function public.qa77126_fail_insert() from public,anon,authenticated;
 create function public.qa77126_fail_completed() returns trigger language plpgsql set search_path='' as $$
 begin if new.state='accounting_completed' then raise exception 'QA77126 intentional completion failure' using errcode='23514';end if;return new;end $$;
 revoke all on function public.qa77126_fail_completed() from public,anon,authenticated;`);
 for(const relation of ['public.customers','public.suppliers','public.invoices','public.payments','public.supplier_purchases',
  'public.customer_ledger_entries','public.supplier_ledger_entries','public.product_stock_lots','public.invoice_item_stock_allocations',
  'public.return_stock_allocations','backup_private.mappings','backup_private.receipts','backup_private.jobs']){
   const completion=relation==='backup_private.jobs';
   sql(`create trigger qa77126_required_failure before ${completion?'update':'insert'} on ${relation}
     for each row execute function public.${completion?'qa77126_fail_completed':'qa77126_fail_insert'}();`);
   const r=await rpc('finalize_job',{p_job:job,p_digest:seal.data.digest});assert.equal(r.status,400,JSON.stringify({relation,...r}));
   const remaining=residue();assert.deepEqual(remaining,{business:0,mappings:0,receipts:0,state:'ready'});
   result.cases.push({name:'Atomic rollback at '+relation,status:r.status,...remaining});
   sql(`drop trigger qa77126_required_failure on ${relation}`);
 }
 const [a,b]=await Promise.all([rpc('finalize_job',{p_job:job,p_digest:seal.data.digest}),rpc('finalize_job',{p_job:job,p_digest:seal.data.digest})]);
 assert.equal(a.status,200,JSON.stringify(a));assert.equal(b.status,200,JSON.stringify(b));
 assert.equal([a,b].filter(x=>!x.data.replayed).length,1);
 const committed=residue();assert.deepEqual(committed,{business:100,mappings:100,receipts:1,state:'accounting_completed'});
 result.cases.push({name:'Concurrent finalizers have one writer and one receipt replay',statuses:[a.status,b.status],...committed});
 const recovered=await rpc('get_job',{p_job:job});assert.equal(recovered.data.receipt.job_id,job);
 const retry=await rpc('finalize_job',{p_job:job,p_digest:seal.data.digest});assert.equal(retry.data.replayed,true);
 assert.deepEqual(residue(),committed);result.cases.push({name:'Lost response recovery through receipt/retry',replayed:true,...committed});
 const lostId=randomUUID();
 const started=await rpc('start_job',{p_format:'native',p_version:'3',p_ancillary:{}});
 const lostJob=started.data.job_id;
 assert.equal((await rpc('stage_chunk',{p_job:lostJob,p_table:'customers',p_index:0,p_rows:[{source_id:lostId,payload:{id:lostId,name:'Dropped response customer',outstanding_balance:0}}]})).status,200);
 const lostManifest=await rpc('get_job',{p_job:lostJob});
 const lostSeal=await rpc('seal_job',{p_job:lostJob,p_manifest:lostManifest.data.manifest});
 assert.equal((await rpc('validate_job',{p_job:lostJob})).data.ok,true);
 const lost=await loseResponseRpc('finalize_job',{p_job:lostJob,p_digest:lostSeal.data.digest});
 assert.equal((await rpc('get_job',{p_job:lostJob})).data.receipt.job_id,lostJob);
 assert.equal((await rpc('finalize_job',{p_job:lostJob,p_digest:lostSeal.data.digest})).data.replayed,true);
 assert.equal(sql(`select count(*) from public.customers where id='${lostId}'`),'1');
 assert.equal(sql(`select count(*) from backup_private.receipts where job_id='${lostJob}'`),'1');
 result.cases.push({name:'Actual dropped HTTP response after first COMMIT',...lost,receiptRecovered:true,replayDuplicates:0});
 assert.equal(sql(`select count(*) from public.customers where organization_id='${org}' and outstanding_balance=123.45`),String(counts.customers));
 assert.equal(sql(`select count(*) from public.suppliers where organization_id='${org}' and outstanding_balance=-10`),String(counts.suppliers));
 result.cases.push({name:'Explicit current balances preserved independently of historical zero balance_after',customer:'123.45',supplier:'-10.00'});
 const removedOwner=randomUUID(),retainedCustomer=randomUUID();
 sql(`insert into auth.users(id) values('${removedOwner}');
   insert into public.profiles(id,organization_id,full_name,role,is_active)
   values('${removedOwner}','${org}','Disposable import Owner','owner',true)`);
 const ownerJob=await rpc('start_job',{p_format:'native',p_version:'3',p_ancillary:{}},removedOwner);
 assert.equal(ownerJob.status,200,JSON.stringify(ownerJob));
 const ownerJobId=ownerJob.data.job_id;
 assert.equal((await rpc('stage_chunk',{p_job:ownerJobId,p_table:'customers',p_index:0,p_rows:[{
   source_id:retainedCustomer,payload:{id:retainedCustomer,name:'Retained restored customer',outstanding_balance:0},
 }]},removedOwner)).status,200);
 const ownerManifest=await rpc('get_job',{p_job:ownerJobId},removedOwner);
 const ownerSeal=await rpc('seal_job',{p_job:ownerJobId,p_manifest:ownerManifest.data.manifest},removedOwner);
 assert.equal((await rpc('validate_job',{p_job:ownerJobId},removedOwner)).data.ok,true);
 assert.equal((await rpc('finalize_job',{p_job:ownerJobId,p_digest:ownerSeal.data.digest},removedOwner)).status,200);
 sql(`delete from auth.users where id='${removedOwner}'`);
 assert.equal(sql(`select count(*) from backup_private.jobs where id='${ownerJobId}'`),'0');
 assert.equal(sql(`select count(*) from backup_private.receipts where job_id='${ownerJobId}'`),'0');
 assert.equal(sql(`select count(*) from public.customers where id='${retainedCustomer}'`),'1');
 result.cases.push({name:'Owner deletion cleans private job metadata without deleting restored business rows',
   ownerRemoved:true,privateJobRemoved:true,privateReceiptRemoved:true,restoredCustomerRetained:true});
 sql('drop function public.qa77126_fail_insert();drop function public.qa77126_fail_completed();');
});
assert.deepEqual(result.cleanup,process.env.ATOMIC_IMPORT_EXISTING_SCHEMA==='1'
 ? {isolatedDatabaseAbsent:true,rolesAbsent:false,rolesPreserved:true}
 : {isolatedDatabaseAbsent:true,rolesAbsent:true});
t.diagnostic(JSON.stringify(result));
});
