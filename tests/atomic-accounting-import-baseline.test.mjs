import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import crypto from 'node:crypto';

test('unchanged main commits the account before failed history; atomic candidate rolls both back',{
 skip:process.env.RUN_LOCAL_ATOMIC_IMPORT_DB!=='1',timeout:120000,
},async t=>{
 const {isolated,org,actor,branch,work}=await import('./helpers/atomic-import-database.mjs');
 const result=await isolated(async({sql,rpc,client,result})=>{
  const source=execFileSync('git',['show','039759db3ec465eafa373d938afac1f588422e13:src/app/settings/backup-actions.ts'],{cwd:work,encoding:'utf8'});
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  const require=createRequire(import.meta.url),loaded={exports:{}};
  const mocks={
   '@/lib/supabase/server':{createClient:async()=>client},'@/lib/supabase/admin':{createAdminClient:async()=>client},
   '@/lib/auth/session':{getCurrentContext:async()=>({user:{id:actor},profile:{id:actor,organization_id:org,branch_id:branch,role:'owner',is_active:true}})},
   '@/lib/audit':{logAudit:()=>{}},'@/lib/errors/safe-action-error':{getSafeActionError:(_e,fallback)=>fallback},
   'next/cache':{revalidatePath:()=>{}},'@/lib/auth/identities':{},
  };
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`)(id=>Object.hasOwn(mocks,id)?mocks[id]:require(id),loaded,loaded.exports);
  const old=loaded.exports;
  const started=await old.startImportJobAction('QA77126 baseline','2','1',{},{});
  assert.equal(started.success,true,JSON.stringify(started));
  const account=await old.importTableChunkAction(started.jobId,'Customers',[{Id:1,Name:'Baseline partial account',OutstandingBalance:12.34}]);
  assert.equal(account.inserted,1,JSON.stringify(account));
  sql(`create function public.qa77126_history_failure() returns trigger language plpgsql set search_path='' as $$begin raise exception 'QA77126 intentional history failure' using errcode='23514';end$$;
    revoke all on function public.qa77126_history_failure() from public,anon,authenticated;
    create trigger qa77126_history_failure before insert on public.customer_ledger_entries for each row execute function public.qa77126_history_failure();`);
  const history=await old.importTableChunkAction(started.jobId,'CustomerLedgerEntries',[{Id:2,CustomerId:1,EntryType:'adjustment',Direction:'debit',Amount:12.34,BalanceAfter:12.34}]);
  assert.equal(history.success,true);assert.equal(history.failed,1);assert.equal(history.inserted,0);
  assert.equal((await old.updateImportJobStatusAction(started.jobId,'completed')).success,true);
  assert.equal(sql(`select count(*) from public.customers where organization_id='${org}' and name='Baseline partial account'`),'1');
  assert.equal(sql(`select status from public.import_jobs where id='${started.jobId}'`),'completed');
  const customer=crypto.randomUUID(),ledger=crypto.randomUUID();
  const start=await rpc('start_job',{p_format:'native',p_version:'3',p_ancillary:{}});assert.equal(start.status,200);
  const job=start.data.job_id;
  for(const [table,payload] of [
   ['customers',{id:customer,name:'Atomic rollback account',outstanding_balance:'12.34'}],
   ['customer_ledger_entries',{id:ledger,customer_id:customer,entry_type:'adjustment',direction:'debit',amount:'12.34',balance_after:'12.34'}],
  ]) assert.equal((await rpc('stage_chunk',{p_job:job,p_table:table,p_index:0,p_rows:[{source_id:payload.id,payload}]})).status,200);
  const get=await rpc('get_job',{p_job:job});const seal=await rpc('seal_job',{p_job:job,p_manifest:get.data.manifest});
  assert.equal((await rpc('validate_job',{p_job:job})).data.ok,true);
  const fail=await rpc('finalize_job',{p_job:job,p_digest:seal.data.digest});assert.equal(fail.status,400);
  assert.equal(sql(`select count(*) from public.customers where id='${customer}'`),'0');
  assert.equal(sql(`select count(*) from public.customer_ledger_entries where id='${ledger}'`),'0');
  assert.equal(sql(`select count(*) from backup_private.receipts where job_id='${job}'`),'0');
  assert.equal(sql(`select state from backup_private.jobs where id='${job}'`),'ready');
  sql('drop trigger qa77126_history_failure on public.customer_ledger_entries;drop function public.qa77126_history_failure();');
  result.baseline={main:'039759db3ec465eafa373d938afac1f588422e13',accountCommitted:1,historyFailed:1,historyActionReportedSuccess:true,job:'completed'};
  result.candidate={sameHistoryFailure:true,accountCommitted:0,historyCommitted:0,receipts:0,state:'ready'};
 });
 t.diagnostic(JSON.stringify(result));
});
