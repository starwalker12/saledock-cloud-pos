import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';

const options={skip:process.env.RUN_LOCAL_ATOMIC_IMPORT_DB!=='1',timeout:120000};
const fresh=()=>crypto.randomUUID();
async function stage(rpc,rows,uid) {
 const started=await rpc('start_job',{p_format:'native',p_version:'3',p_ancillary:{}},uid);
 assert.equal(started.status,200,JSON.stringify(started));
 const job=started.data.job_id;
 for(const [table,payloads] of Object.entries(rows)) {
  const r=await rpc('stage_chunk',{p_job:job,p_table:table,p_index:0,p_rows:payloads.map(payload=>({source_id:payload.id,payload}))},uid);
  assert.equal(r.status,200,JSON.stringify(r));
 }
 const get=await rpc('get_job',{p_job:job},uid);
 const sealed=await rpc('seal_job',{p_job:job,p_manifest:get.data.manifest},uid);
 assert.equal(sealed.status,200,JSON.stringify(sealed));
 return {job,digest:sealed.data.digest};
}

test('Owner-only private staging, duplicate rows, missing mutex, and actual Reset fail closed',options,async()=>{
 const {isolated,org,actor}=await import('./helpers/atomic-import-database.mjs');
 await isolated(async({sql,rpc,request,result})=>{
  assert.equal(sql(`select count(*) from backup_private.organization_identity_locks where organization_id='${org}'`),'1');
  const admin=fresh(),inactive=fresh();
  sql(`insert into auth.users(id) values('${admin}'),('${inactive}');
   insert into public.profiles(id,organization_id,role,is_active,full_name) values
   ('${admin}','${org}','admin',true,'Test Admin'),('${inactive}','${org}','owner',false,'Inactive Owner');`);
  const args={p_format:'native',p_version:'3',p_ancillary:{}};
  assert.equal((await rpc('start_job',args,null)).status,401);
  assert.equal((await rpc('start_job',args,admin)).status,403);
  assert.equal((await rpc('start_job',args,inactive)).status,403);
  assert.equal((await rpc('start_job',{...args,p_format:'unsupported'})).status,400);
  const privateGrants=JSON.parse(sql(`select jsonb_build_object(
   'usage',has_schema_privilege('authenticated','backup_private','USAGE'),
   'select',has_table_privilege('authenticated','backup_private.staged_rows','SELECT'),
   'insert',has_table_privilege('authenticated','backup_private.staged_rows','INSERT'),
   'lock',has_function_privilege('authenticated','backup_private.lock_identity(uuid,boolean)','EXECUTE'),
   'snapshot',has_function_privilege('authenticated','backup_private.insert_snapshot(uuid)','EXECUTE'))`));
  assert.deepEqual(privateGrants,{usage:false,select:false,insert:false,lock:false,snapshot:false});
  assert.equal((await request('rpc/insert_snapshot',{p_job:fresh()})).status,404);
  assert.equal((await request('staged_rows',undefined,actor,'GET')).status,404);
  const start=await rpc('start_job',args);assert.equal(start.status,200);
  const job=start.data.job_id,id=fresh();
  const duplicate=await rpc('stage_chunk',{p_job:job,p_table:'customers',p_index:0,p_rows:[
   {source_id:id,payload:{id,name:'Duplicate',outstanding_balance:0}},
   {source_id:id,payload:{id,name:'Duplicate',outstanding_balance:0}},
  ]});
  assert.notEqual(duplicate.status,200,JSON.stringify(duplicate));
  assert.equal(sql(`select count(*) from backup_private.staged_rows where job_id='${job}'`),'0');
  await rpc('cancel_job',{p_job:job});
  const ready=await stage(rpc,{customers:[{id:fresh(),name:'Reset must invalidate',outstanding_balance:0}]});
  assert.equal((await rpc('validate_job',{p_job:ready.job})).data.ok,true);
  const reset=await request('rpc/reset_organization_to_factory_defaults',{p_organization_id:org,p_actor_id:actor,p_reset_settings:false});
  assert.equal(reset.status,200,JSON.stringify(reset));
  assert.equal(sql(`select epoch from backup_private.organization_identity_locks where organization_id='${org}'`),'1');
  assert.notEqual((await rpc('finalize_job',{p_job:ready.job,p_digest:ready.digest})).status,200);
  assert.equal(sql(`select count(*) from public.customers where organization_id='${org}'`),'0');
  sql(`delete from backup_private.organization_identity_locks where organization_id='${org}'`);
  assert.notEqual((await request('customers',{organization_id:org,name:'Must not run unlocked'})).status,201);
  assert.notEqual((await request('suppliers',{organization_id:org,name:'Must not run unlocked'})).status,201);
  assert.notEqual((await rpc('start_job',args)).status,200);
  assert.equal(sql(`select count(*) from public.customers where organization_id='${org}'`),'0');
  result.coverage={anonDenied:true,adminDenied:true,inactiveDenied:true,privateGrants,
   duplicateChunkLeavesNoStaging:true,actualResetEpoch:1,staleJobDenied:true,missingMutexFailsClosed:true};
 });
});

test('account collisions, sealed tamper, job ownership, and expiry fail closed',options,async()=>{
 const {isolated,org,actor,branch}=await import('./helpers/atomic-import-database.mjs');
 await isolated(async({sql,rpc,result})=>{
  const owner2=fresh(),foreignOrg=fresh(),foreignCustomer=fresh();
  sql(`insert into auth.users(id) values('${owner2}');
   insert into public.profiles(id,organization_id,branch_id,role,is_active,full_name) values('${owner2}','${org}','${branch}','owner',true,'Second test Owner');
   insert into public.organizations(id,name) values('${foreignOrg}','Foreign test shop');
   insert into public.customers(id,organization_id,name,outstanding_balance) values('${foreignCustomer}','${foreignOrg}','Foreign UUID',0);
   insert into public.customers(organization_id,name,phone,email,is_archived,archived_at,outstanding_balance)
    values('${org}',' Archived Customer ','555','ARCHIVE@EXAMPLE.INVALID',true,now(),0);
   insert into public.suppliers(organization_id,name,is_active,outstanding_balance)
    values('${org}',' Archived Supplier ',false,0);`);
  const cases=[
   ['customers',{name:'archived customer'}],['customers',{name:'Different',phone:' 555 '}],
   ['customers',{name:'Different',email:' archive@example.invalid '}],['suppliers',{name:'archived supplier'}],
   ['customers',{id:foreignCustomer,name:'UUID collision'}],
  ];
  for(const [table,fields] of cases) {
   const s=await stage(rpc,{[table]:[{id:fresh(),outstanding_balance:'0',...fields}]});
   const r=await rpc('validate_job',{p_job:s.job});assert.equal(r.data.ok,false,JSON.stringify(r));
   assert.match(r.data.message,/conflict|already exists/i);
   assert.equal(sql(`select count(*) from backup_private.receipts where job_id='${s.job}'`),'0');
  }
  for(const table of ['customers','suppliers']) {
   const s=await stage(rpc,{[table]:[{id:fresh(),name:'AMBIGUOUS',outstanding_balance:0},{id:fresh(),name:' ambiguous ',outstanding_balance:0}]});
   assert.equal((await rpc('validate_job',{p_job:s.job})).data.ok,false);
  }
  const missing=fresh();
  const orphan=await stage(rpc,{customer_ledger_entries:[{id:fresh(),customer_id:missing,entry_type:'adjustment',direction:'debit',amount:1,balance_after:0}]});
  assert.equal((await rpc('validate_job',{p_job:orphan.job})).data.ok,false);
  const s=await stage(rpc,{customers:[{id:fresh(),name:'Sealed test',outstanding_balance:0}]});
  assert.equal((await rpc('get_job',{p_job:s.job},owner2)).status,403);
  assert.equal((await rpc('validate_job',{p_job:s.job})).data.ok,true);
  assert.equal((await rpc('stage_chunk',{p_job:s.job,p_table:'customers',p_index:1,p_rows:[{source_id:fresh(),payload:{id:fresh(),name:'Late',outstanding_balance:0}}]})).status,500);
  sql(`update backup_private.staged_rows set payload=jsonb_set(payload,'{name}','"Privileged QA tamper"') where job_id='${s.job}'`);
  const tamper=await rpc('finalize_job',{p_job:s.job,p_digest:s.digest});assert.equal(tamper.status,500,JSON.stringify(tamper));
  assert.equal(sql(`select count(*) from backup_private.receipts where job_id='${s.job}'`),'0');
  await rpc('cancel_job',{p_job:s.job});
  const expired=await stage(rpc,{customers:[{id:fresh(),name:'Expiring test',outstanding_balance:0}]});
  sql(`update backup_private.jobs set expires_at=now()-interval '1 second' where id='${expired.job}'`);
  const expiry=await rpc('get_job',{p_job:expired.job});assert.equal(expiry.data.state,'expired');
  assert.equal(sql(`select count(*) from backup_private.staged_rows where job_id='${expired.job}'`),'0');
  assert.equal((await rpc('finalize_job',{p_job:expired.job,p_digest:expired.digest})).status,500);
  const completed=await stage(rpc,{customers:[{id:fresh(),name:'Receipt retention',outstanding_balance:0}]});
  await rpc('validate_job',{p_job:completed.job});
  assert.equal((await rpc('finalize_job',{p_job:completed.job,p_digest:completed.digest})).status,200);
  sql(`update backup_private.jobs set expires_at=now()-interval '1 second' where id='${completed.job}'`);
  const receipt=await rpc('get_job',{p_job:completed.job});assert.equal(receipt.data.receipt.job_id,completed.job);
  assert.equal(sql(`select count(*) from backup_private.staged_rows where job_id='${completed.job}'`),'0');
  assert.equal((await rpc('finalize_job',{p_job:completed.job,p_digest:completed.digest})).data.replayed,true);
  result.coverage={archivedIdentityCollisions:5,ambiguousSourceAccounts:2,orphanDenied:true,otherOwnerDenied:true,sealedUploadDenied:true,tamperDenied:true,expiryPurged:true,receiptSurvivesExpiry:true,actor};
 });
});

test('live identity races, two jobs, MVCC, independent writes, and Reset use one bounded lock order',options,async()=>{
 const {isolated,org,actor,branch,Session}=await import('./helpers/atomic-import-database.mjs');
 await isolated(async({sql,rpc,request,result})=>{
  const owner2=fresh();
  sql(`insert into auth.users(id) values('${owner2}');insert into public.profiles(id,organization_id,branch_id,role,is_active,full_name) values('${owner2}','${org}','${branch}','owner',true,'Racing test Owner')`);
  for(const table of ['customers','suppliers']) {
   for(const method of ['INSERT','PATCH']) {
    const name=`Live wins ${table} ${method}`;
    const s=await stage(rpc,{[table]:[{id:fresh(),name,outstanding_balance:0}]});
    assert.equal((await rpc('validate_job',{p_job:s.job})).data.ok,true);
    if(method==='INSERT') assert.equal((await request(table,{organization_id:org,name})).status,201);
    else {
     const existing=await request(table,{organization_id:org,name:'Before '+name});
     assert.equal((await request(table+'?id=eq.'+existing.data[0].id,{name},actor,'PATCH')).status,200);
    }
    assert.equal((await rpc('finalize_job',{p_job:s.job,p_digest:s.digest})).status,409);
    assert.equal(sql(`select count(*) from backup_private.receipts where job_id='${s.job}'`),'0');
    await rpc('cancel_job',{p_job:s.job});
   }
  }
  const sameName='Two jobs one account';
  const a=await stage(rpc,{customers:[{id:fresh(),name:sameName,outstanding_balance:0}]});
  const b=await stage(rpc,{customers:[{id:fresh(),name:sameName,outstanding_balance:0}]},owner2);
  assert.equal((await rpc('validate_job',{p_job:a.job})).data.ok,true);
  assert.equal((await rpc('validate_job',{p_job:b.job},owner2)).data.ok,true);
  const raced=await Promise.all([rpc('finalize_job',{p_job:a.job,p_digest:a.digest}),rpc('finalize_job',{p_job:b.job,p_digest:b.digest},owner2)]);
  assert.equal(raced.filter(r=>r.status===200).length,1,JSON.stringify(raced));
  assert.equal(raced.filter(r=>r.status===409).length,1,JSON.stringify(raced));
  await rpc('cancel_job',{p_job:raced[0].status===200?b.job:a.job},raced[0].status===200?owner2:actor);
  const trustedSchema=process.env.ATOMIC_IMPORT_EXISTING_SCHEMA==='1';
  let existingCustomer;
  if(trustedSchema) {
   existingCustomer=fresh();
   sql(`insert into public.customers(id,organization_id,name,outstanding_balance) values('${existingCustomer}','${org}','Independent writer',10)`);
  } else existingCustomer=(await request('customers',{organization_id:org,name:'Independent writer'})).data[0].id;
  const s=await stage(rpc,{customers:[{id:fresh(),name:'Finalizer wins customer',outstanding_balance:0}],suppliers:[{id:fresh(),name:'Finalizer wins supplier',outstanding_balance:0}]});
  await rpc('validate_job',{p_job:s.job});
  sql(`create function public.qa77126_hold_import() returns trigger language plpgsql set search_path='' as $$
   declare budget text:=current_setting('lock_timeout');
   begin
    -- Only the artificial test gate may wait beyond the application's acquisition budget.
    perform set_config('lock_timeout','0',true);
    perform pg_advisory_xact_lock(77126,1);
    perform set_config('lock_timeout',budget,true);
    return new;
   end$$;
   revoke all on function public.qa77126_hold_import() from public,anon,authenticated;
   create trigger qa77126_hold_import before insert on public.customers for each row execute function public.qa77126_hold_import();`);
  const controller=new Session();let pending;
  try {
   await controller.ok('begin;select pg_advisory_xact_lock(77126,1);');
   pending=rpc('finalize_job',{p_job:s.job,p_digest:s.digest});
   for(let i=0;i<100;i++) {
    if(sql("select count(*) from pg_stat_activity where datname=current_database() and wait_event='advisory'")==='1') break;
    await delay(20);
   }
   assert.equal(sql("select count(*) from pg_stat_activity where datname=current_database() and wait_event='advisory'"),'1');
   assert.equal(sql(`select count(*) from public.customers where name='Finalizer wins customer'`),'0');
   for(const table of ['customers','suppliers']) {
    const insert=await request(table,{organization_id:org,name:'Finalizer wins '+table.slice(0,-1)});assert.equal(insert.status,409,JSON.stringify(insert));
    const id=table==='customers'?existingCustomer:sql(`select id from public.suppliers limit 1`);
    const patch=await request(table+'?id=eq.'+id,{name:'Blocked rename'},actor,'PATCH');assert.equal(patch.status,409,JSON.stringify(patch));
   }
   if(trustedSchema) {
    const independent=await request('rpc/record_credit_payment',{p_customer_id:existingCustomer,p_amount:1,p_method:'cash',p_notes:'Independent approved writer',p_reference_number:null});
    assert.equal(independent.status,204,JSON.stringify(independent));
    assert.equal(sql(`select outstanding_balance from public.customers where id='${existingCustomer}'`),'9.00');
    assert.equal(sql(`select count(*) from public.customer_ledger_entries where customer_id='${existingCustomer}' and posting_sequence is not null and balance_after=9`),'1');
    assert.equal((await request('customers?id=eq.'+existingCustomer,{outstanding_balance:999},actor,'PATCH')).status,403);
   } else {
    const independent=await request('customer_ledger_entries',{organization_id:org,customer_id:existingCustomer,entry_type:'adjustment',direction:'debit',amount:1,balance_after:999});
    assert.equal(independent.status,201);
    assert.equal((await request('customers?id=eq.'+existingCustomer,{outstanding_balance:999},actor,'PATCH')).status,200);
   }
   const reset=await request('rpc/reset_organization_to_factory_defaults',{p_organization_id:org,p_actor_id:actor,p_reset_settings:false});assert.equal(reset.status,409,JSON.stringify(reset));
  } finally {await controller.close();if(pending) {const r=await pending;assert.equal(r.status,200,JSON.stringify(r));}}
  sql('drop trigger qa77126_hold_import on public.customers;drop function public.qa77126_hold_import();');
  assert.equal(sql(`select count(*) from public.customers where name='Finalizer wins customer'`),'1');
  // A distinct committed write cannot turn the finalizer's following failure into partial success.
  const failed=await stage(rpc,{customers:[{id:fresh(),name:'Atomic failure customer',outstanding_balance:0}],customer_ledger_entries:[{id:fresh(),customer_id:existingCustomer,entry_type:'adjustment',direction:'debit',amount:1,balance_after:0}]});
  // Existing business-account references are intentionally rejected before any inserts.
  assert.equal((await rpc('validate_job',{p_job:failed.job})).data.ok,false);
  assert.equal(sql(`select count(*) from public.customer_ledger_entries where customer_id='${existingCustomer}'`),'1');
  result.coverage={liveWins:4,twoJobsOneWinner:true,finalizerBlocksInsertAndIdentityPatch:true,invisibleBeforeCommit:true,independentLedgerAndBalanceCommitted:true,independentWriter:trustedSchema?'record_credit_payment':'legacy direct write',resetConflictBounded:true};
 });
});
