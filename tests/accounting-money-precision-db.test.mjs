import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const enabled = process.env.RUN_LOCAL_MONEY_PRECISION_DB === '1';
function sql(query) {
  const container=process.env.LOCAL_SUPABASE_DB_CONTAINER;
  assert.match(container ?? '', /^supabase_db_qa[0-9]+-[a-z0-9-]+$/,'Task-isolated local database required');
  const result=spawnSync('docker',['exec','-i',container,'psql','-XqAt','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{input:query,encoding:'utf8',maxBuffer:32*1024*1024});
  assert.equal(result.status,0,result.stderr);
  return result.stdout.trim();
}
const org='35806000-0000-4000-8000-000000000001', branch='35806000-0000-4000-8000-000000000002', actor='35806000-0000-4000-8000-000000000003';
const customer='35806000-0000-4000-8000-000000000101', supplier='35806000-0000-4000-8000-000000000201';
const fixture=`
insert into public.organizations(id,name) values('${org}','QA35806 money');
insert into public.branches(id,organization_id,name) values('${branch}','${org}','QA branch');
insert into auth.users(id) values('${actor}');
insert into public.profiles(id,organization_id,branch_id,full_name,role,is_active) values('${actor}','${org}','${branch}','QA Owner','owner',true);
insert into public.customers(id,organization_id,branch_id,name,outstanding_balance) values('${customer}','${org}','${branch}','QA debt',100);
insert into public.suppliers(id,organization_id,name,outstanding_balance) values('${supplier}','${org}','QA supplier',100);
create function pg_temp.money_snapshot() returns jsonb language plpgsql as $$
declare t record; result jsonb := '{}'; signature jsonb;
begin
 for t in select schemaname,tablename from pg_tables where schemaname='public' or (schemaname='auth' and tablename='users') order by 1,2 loop
  execute format('select jsonb_build_object(''count'',count(*),''digest'',md5(coalesce(string_agg(md5(to_jsonb(r)::text),'''' order by md5(to_jsonb(r)::text)),''''))) from %I.%I r',t.schemaname,t.tablename) into signature;
  result:=result||jsonb_build_object(t.schemaname||'.'||t.tablename,signature);
 end loop;
 return result;
end $$;
set local request.jwt.claim.sub='${actor}';
set local request.jwt.claim.role='authenticated';`;
const amounts=['0.001','0.004','0.005','0.009','0.010','0.014','0.015','0.019','0.02','0.1','0.10','1.23','1.230','1.234','0','-1','NULL'];
const valid=new Set(['0.010','0.02','0.1','0.10','1.23','1.230']);
const calls={
 customer_payment:a=>`perform public.record_credit_payment('${customer}',${a},'cash',null,null);`,
 customer_write_off:a=>`perform public.record_customer_write_off('${customer}',${a},'QA money');`,
 supplier_payment:a=>`perform public.record_supplier_payment('${supplier}',null,'${branch}','cash',${a},null,null);`,
 supplier_write_off:a=>`perform public.record_supplier_write_off('${supplier}','${branch}',${a},'QA money');`,
};

test('four direct authenticated RPCs reject sub-paisa before mutation and preserve exact valid chains', {skip:!enabled},()=>{
 const results=[];
 for(const [writer,call] of Object.entries(calls)) for(const amount of amounts){
  const domain=writer.startsWith('customer')?'customer':'supplier', account=domain==='customer'?customer:supplier;
  const query=`begin; ${fixture}
   create function pg_temp.run_case() returns jsonb language plpgsql as $$
   declare pre jsonb:=pg_temp.money_snapshot(); outcome jsonb; failure text;
   begin
    begin
     perform set_config('role','authenticated',true); ${call(amount)}
     perform set_config('role','postgres',true);
     select jsonb_build_object('amount',l.amount,'balance_after',l.balance_after,'outstanding',a.outstanding_balance,'exactChain',l.balance_after=100-l.amount,
       'ledgerCount',(select count(*) from public.${domain}_ledger_entries where ${domain}_id='${account}')) into strict outcome
      from public.${domain}_ledger_entries l join public.${domain}s a on a.id=l.${domain}_id where a.id='${account}';
     raise exception 'Rollback accepted case' using errcode='PT001';
    exception when sqlstate 'PT001' then null; when others then failure:=sqlerrm; outcome:=null; end;
    perform set_config('role','postgres',true);
    if pre is distinct from pg_temp.money_snapshot() then raise exception 'Partial mutation'; end if;
    return jsonb_build_object('writer','${writer}','input','${amount}','accepted',outcome is not null,'error',failure,'result',outcome,'zeroPersistentMutation',true);
   end $$;
   select pg_temp.run_case(); rollback;`;
  const result=JSON.parse(sql(query));
  assert.equal(result.accepted,valid.has(amount),`${writer}/${amount}: ${JSON.stringify(result)}`);
  if(valid.has(amount)) {
   assert.equal(result.result.amount,Number(amount));
   assert.equal(result.result.ledgerCount,1);
   assert.equal(result.result.balance_after,result.result.outstanding);
   assert.equal(result.result.exactChain,true);
   if(amount==='0.02') assert.equal(result.result.balance_after,99.98);
  } else if(!['0','-1','NULL'].includes(amount)) assert.equal(result.error,'Amount must have no more than 2 decimal places.');
  results.push(result);
 }
 if(process.env.QA_EVIDENCE_DIR) fs.writeFileSync(`${process.env.QA_EVIDENCE_DIR}/database-money-boundary-matrix-${process.env.QA_RUN_LABEL || 'run'}.json`,JSON.stringify(results,null,2),{flag:'wx'});
});

test('customer and supplier FIFO payment allocations remain exact across two documents', {skip:!enabled},()=>{
 const result=JSON.parse(sql(`begin; ${fixture}
 insert into public.invoices(organization_id,branch_id,customer_id,invoice_no,status,grand_total,balance_due,invoice_date)
 values('${org}','${branch}','${customer}','QA oldest','unpaid',0.01,0.01,'2026-01-01'),('${org}','${branch}','${customer}','QA newer','unpaid',99.99,99.99,'2026-01-02');
 insert into public.supplier_purchases(organization_id,branch_id,supplier_id,purchase_no,grand_total,balance_due,purchase_date)
 values('${org}','${branch}','${supplier}','QA oldest',0.01,0.01,'2026-01-01'),('${org}','${branch}','${supplier}','QA newer',99.99,99.99,'2026-01-02');
 set local role authenticated;
 select public.record_credit_payment('${customer}',0.02,'cash',null,null);
 select public.record_supplier_payment('${supplier}',null,'${branch}','cash',0.02,null,null);
 reset role;
 select jsonb_build_object('customer',(select jsonb_agg(jsonb_build_array(amount_paid,balance_due) order by invoice_date) from public.invoices where organization_id='${org}'),
 'supplier',(select jsonb_agg(jsonb_build_array(amount_paid,balance_due) order by purchase_date) from public.supplier_purchases where organization_id='${org}')); rollback;`).split('\n').filter(x=>x.startsWith('{')).at(-1));
 assert.deepEqual(result,{customer:[[0.01,0],[0.01,99.98]],supplier:[[0.01,0],[0.01,99.98]]});
});

test('importer independently rejects sub-paisa current balances and accepts ordinary explicit 2dp balances', {skip:!enabled},()=>{
 const outcomes=[];
 for(const table of ['customers','suppliers']) for(const amount of ['0','123.45','-10.00','0.015','1.234']) {
  const result=JSON.parse(sql(`begin; ${fixture}
  create function pg_temp.import_case() returns jsonb language plpgsql as $$
  declare outcome jsonb; failure text;
  begin
   begin
    outcome:=backup_private.normalize_row('${table}',jsonb_build_object('id',gen_random_uuid(),'name','QA import','outstanding_balance','${amount}'),'${org}',now());
   exception when others then failure:=sqlerrm; end;
   return jsonb_build_object('accepted',outcome is not null,'error',failure,'amount',outcome->'outstanding_balance',
    'accounts',(select count(*) from public.${table} where organization_id='${org}'));
  end $$; select pg_temp.import_case(); rollback;`));
  assert.equal(result.accepted,!['0.015','1.234'].includes(amount));
  assert.equal(result.accounts,1);
  if(result.accepted)assert.equal(result.amount,Number(amount));
  outcomes.push({table,input:amount,...result});
 }
 if(process.env.QA_EVIDENCE_DIR)fs.writeFileSync(`${process.env.QA_EVIDENCE_DIR}/importer-money-precision-${process.env.QA_RUN_LABEL || 'run'}.json`,JSON.stringify(outcomes,null,2),{flag:'wx'});
});

test('decimal supplier purchase preserves exact credit/debit, initial payment and FIFO lot creation', {skip:!enabled},()=>{
 const product='35806000-0000-4000-8000-000000000301';
 const result=JSON.parse(sql(`begin; ${fixture}
 insert into public.products(id,organization_id,name,type,sale_price,purchase_price,stock_quantity) values('${product}','${org}','QA decimal physical','product',1,0,0);
 set local role authenticated;
 select public.create_supplier_purchase('${supplier}','${branch}','2026-01-01','[{"product_id":"${product}","quantity":1,"unit_cost":0.10},{"product_id":"${product}","quantity":1,"unit_cost":0.20}]',0,null,null,'cash',0.10,null);
 reset role;
 select jsonb_build_object('purchase',(select jsonb_build_array(subtotal,grand_total,amount_paid,balance_due) from public.supplier_purchases where organization_id='${org}'),
 'ledger',(select jsonb_agg(jsonb_build_array(direction,amount,balance_after) order by case direction when 'credit' then 0 else 1 end) from public.supplier_ledger_entries where supplier_id='${supplier}'),
 'outstanding',(select outstanding_balance from public.suppliers where id='${supplier}'),
 'stock',(select stock_quantity from public.products where id='${product}'),
 'lots',(select count(*) from public.product_stock_lots where product_id='${product}'),
 'movements',(select count(*) from public.stock_movements where product_id='${product}')); rollback;`).split('\n').filter(x=>x.startsWith('{')).at(-1));
 assert.deepEqual(result,{purchase:[0.3,0.3,0.1,0.2],ledger:[['credit',0.3,100.3],['debit',0.1,100.2]],outstanding:100.2,stock:2,lots:2,movements:2});
 if(process.env.QA_EVIDENCE_DIR)fs.writeFileSync(`${process.env.QA_EVIDENCE_DIR}/decimal-supplier-purchase-${process.env.QA_RUN_LABEL || 'run'}.json`,JSON.stringify(result,null,2),{flag:'wx'});
});

test('supplier purchase rejects sub-paisa grand total and initial payment before any write', {skip:!enabled},()=>{
 const product='35806000-0000-4000-8000-000000000301';
 const results=[];
 for(const [label,cost,paid] of [['grand','0.015','0'],['paid','1','0.015']]) {
  const result=JSON.parse(sql(`begin; ${fixture}
  insert into public.products(id,organization_id,name,type,sale_price,purchase_price,stock_quantity) values('${product}','${org}','QA decimal physical','product',1,0,0);
  create function pg_temp.rejected_purchase() returns jsonb language plpgsql as $$
  declare before_rows jsonb:=pg_temp.money_snapshot(); failure text;
  begin
   begin
    perform set_config('role','authenticated',true);
    perform public.create_supplier_purchase('${supplier}','${branch}','2026-01-01','[{"product_id":"${product}","quantity":1,"unit_cost":${cost}}]',0,null,null,'cash',${paid},null);
   exception when others then failure:=sqlerrm; end;
   perform set_config('role','postgres',true);
   return jsonb_build_object('error',failure,'zeroMutation',before_rows=pg_temp.money_snapshot());
  end $$; select pg_temp.rejected_purchase(); rollback;`));
  assert.equal(result.error,'Amount must have no more than 2 decimal places.');
  assert.equal(result.zeroMutation,true);
  results.push({input:label,...result});
 }
 if(process.env.QA_EVIDENCE_DIR)fs.writeFileSync(`${process.env.QA_EVIDENCE_DIR}/supplier-purchase-denials-${process.env.QA_RUN_LABEL || 'run'}.json`,JSON.stringify(results,null,2),{flag:'wx'});
});

test('physical credit sale and prorated return preserve stored 2dp debt and FIFO restoration', {skip:!enabled},()=>{
 const product='35806000-0000-4000-8000-000000000301';
 const result=JSON.parse(sql(`begin; ${fixture}
 insert into public.products(id,organization_id,name,type,sale_price,purchase_price,stock_quantity) values('${product}','${org}','QA decimal physical','product',0.1,0.01,3);
 insert into public.product_stock_lots(organization_id,branch_id,product_id,quantity_received,quantity_remaining,unit_cost,purchase_date) values('${org}','${branch}','${product}',3,3,0.01,'2026-01-01');
 set local role authenticated;
 select public.pos_checkout('${branch}','${customer}','[{"product_id":"${product}","quantity":3,"unit_price":0.10,"discount":0}]',0,'customer_credit',0,null,'QA return',false,'QA35806 return');
 select public.create_invoice_return((select id from public.invoices where organization_id='${org}'),
  (select jsonb_build_array(jsonb_build_object('invoice_item_id',id,'quantity',1,'restock',true)) from public.invoice_items where organization_id='${org}'),0,null,null,'QA decimal return');
 reset role;
 select jsonb_build_object('invoice',(select grand_total from public.invoices where organization_id='${org}'),
 'return',(select subtotal from public.returns where organization_id='${org}'),
 'outstanding',(select outstanding_balance from public.customers where id='${customer}'),
 'ledger',(select jsonb_agg(jsonb_build_array(direction,amount,balance_after) order by case direction when 'debit' then 0 else 1 end) from public.customer_ledger_entries where customer_id='${customer}'),
 'stock',(select stock_quantity from public.products where id='${product}'),
 'remaining',(select sum(quantity_remaining) from public.product_stock_lots where product_id='${product}')); rollback;`).split('\n').filter(x=>x.startsWith('{')).at(-1));
 assert.deepEqual(result,{invoice:0.3,return:0.1,outstanding:100.2,ledger:[['debit',0.3,100.3],['credit',0.1,100.2]],stock:1,remaining:1});
 if(process.env.QA_EVIDENCE_DIR)fs.writeFileSync(`${process.env.QA_EVIDENCE_DIR}/decimal-return-regression-${process.env.QA_RUN_LABEL || 'run'}.json`,JSON.stringify(result,null,2),{flag:'wx'});
});

test('native restore finalizes valid explicit balances and rejects invalid balances while staging only', {skip:!enabled},()=>{
 const result=JSON.parse(sql(`begin; ${fixture}
 create function pg_temp.restore_case() returns jsonb language plpgsql as $$
 declare job uuid; sealed jsonb; result jsonb; failure text; before_rows jsonb; rejected boolean:=false;
 begin
  perform set_config('role','authenticated',true);
  job:=(public.accounting_import_start_job('native','3','{}')->>'job_id')::uuid;
  perform public.accounting_import_stage_chunk(job,'customers',0,jsonb_build_array(jsonb_build_object('source_id','35806000-0000-4000-8000-000000000501','payload',jsonb_build_object('id','35806000-0000-4000-8000-000000000501','name','QA restored customer','outstanding_balance','123.45'))));
  perform public.accounting_import_stage_chunk(job,'suppliers',0,jsonb_build_array(jsonb_build_object('source_id','35806000-0000-4000-8000-000000000502','payload',jsonb_build_object('id','35806000-0000-4000-8000-000000000502','name','QA restored supplier','outstanding_balance','0.00'))));
  sealed:=public.accounting_import_seal_job(job,public.accounting_import_get_job(job)->'manifest');
  perform public.accounting_import_validate_job(job);
  result:=public.accounting_import_finalize_job(job,sealed->>'digest');
  job:=(public.accounting_import_start_job('native','3','{}')->>'job_id')::uuid;
  begin
   perform public.accounting_import_stage_chunk(job,'suppliers',0,jsonb_build_array(jsonb_build_object('source_id','35806000-0000-4000-8000-000000000503','payload',jsonb_build_object('id','35806000-0000-4000-8000-000000000503','name','QA invalid supplier','outstanding_balance','0.015'))));
  exception when others then rejected:=true; failure:=sqlerrm; end;
  perform set_config('role','postgres',true);
  return jsonb_build_object('finalized',result->'ok','customer',(select outstanding_balance from public.customers where id='35806000-0000-4000-8000-000000000501'),
   'supplier',(select outstanding_balance from public.suppliers where id='35806000-0000-4000-8000-000000000502'),
   'subpaisaRejected',rejected,'error',failure,'invalidRows',(select count(*) from public.suppliers where id='35806000-0000-4000-8000-000000000503'));
 end $$; select pg_temp.restore_case(); rollback;`));
 assert.equal(result.finalized,true);assert.equal(result.customer,123.45);assert.equal(result.supplier,0);assert.equal(result.subpaisaRejected,true);assert.equal(result.invalidRows,0);
 if(process.env.QA_EVIDENCE_DIR)fs.writeFileSync(`${process.env.QA_EVIDENCE_DIR}/native-restore-precision-${process.env.QA_RUN_LABEL || 'run'}.json`,JSON.stringify(result,null,2),{flag:'wx'});
});
