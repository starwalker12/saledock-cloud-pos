import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';

test('real authenticated 50k finalizer: four shapes x3 and slowest shape x10',{
 skip:process.env.RUN_LOCAL_ATOMIC_IMPORT_QUALIFY!=='1',timeout:900000,
},async t=>{
 const {isolated,org,work}=await import('./helpers/atomic-import-database.mjs');
 const {payload,tables,countsFor,loadFixtureCatalog}=await import('./helpers/atomic-import-fixtures.mjs');
 const migration=work+'/supabase/migrations/20261001093929_atomic_accounting_import.sql';
 const hash=()=>crypto.createHash('sha256').update(fs.readFileSync(migration)).digest('hex');
 const expected=hash(),accepted=[];
 async function run(shape) {
  assert.equal(hash(),expected,'Migration must remain unchanged during qualification');
  const result=await isolated(async({sql,rpc,result})=>{
   loadFixtureCatalog(sql);
   sql(`insert into public.customers(id,organization_id,name,phone)
    select md5('qa77126-existing-customer-'||n)::uuid,'${org}','Existing customer '||n,'existing-phone-'||n from generate_series(1,10000) n;
    insert into public.suppliers(id,organization_id,name)
    select md5('qa77126-existing-supplier-'||n)::uuid,'${org}','Existing supplier '||n from generate_series(1,10000) n;
    analyze public.customers;analyze public.suppliers;`);
   const counts=countsFor(50000,shape);
   const start=await rpc('start_job',{p_format:'native',p_version:'3',p_ancillary:{}});assert.equal(start.status,200);
   const job=start.data.job_id;let uploaded=0;
   for(const table of tables) {
    const rows=JSON.parse(sql(`select jsonb_agg(to_jsonb(r)) from (${payload(table,counts,32)}) r`));
    let chunk=[],index=0;
    const send=async()=>{
     if(!chunk.length)return;
     const args={p_job:job,p_table:table,p_index:index,p_rows:chunk};
     assert(Buffer.byteLength(JSON.stringify(args))<=524288);
     const r=await rpc('stage_chunk',args);assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.data.ok,true);
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
   const final=await rpc('finalize_job',{p_job:job,p_digest:sealed.data.digest});assert.equal(final.status,200,JSON.stringify(final));
   const committed=JSON.parse(sql(`select jsonb_build_object('rows',${tables.map(table=>`(select count(*)${['customers','suppliers'].includes(table)?'-10000':''} from public.${table})`).join('+')},'mappings',(select count(*) from backup_private.mappings where job_id='${job}'),'receipts',(select count(*) from backup_private.receipts where job_id='${job}'))`));
   assert.deepEqual(committed,{rows:50000,mappings:50000,receipts:1});
   // Full HTTP completion brackets COMMIT; receipt durations do not include COMMIT.
   result.shape=shape;result.rpcCommitUpperBoundMs=final.ms;result.canonicalBytes=get.data.bytes;
   result.receiptTransactionMs=final.data.receipt.transaction_ms;result.receiptIdentityMs=final.data.receipt.identity_ms;
   assert(final.ms<=5000,'Finalizer qualification exceeded 5 seconds: STOP');
   assert(final.ms<=3000,'Identity hold upper bound exceeded 3 seconds: STOP');
  });
  accepted.push(result);t.diagnostic(JSON.stringify(result));
 }
 for(const shape of ['ledger','sales','supplier','mixed'])for(let i=0;i<3;i++)await run(shape);
 const worst=accepted.reduce((a,b)=>a.rpcCommitUpperBoundMs>b.rpcCommitUpperBoundMs?a:b).shape;
 for(let i=0;i<7;i++)await run(worst);
 assert.equal(accepted.length,19);assert.equal(accepted.filter(r=>r.shape===worst).length,10);
 assert.equal(hash(),expected);t.diagnostic(JSON.stringify({migrationSha256:expected,slowestShape:worst,acceptedRuns:19}));
});
