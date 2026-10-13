import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fixture,largeInvoiceFixture,sql,json,enabled,attempt,signature} from './helpers/return-math-database.mjs';

test('paid product: exact economic credit, refund and original FIFO cost; original totals stay unchanged',{skip:!enabled},()=>{
  const f=fixture();const r=json(sql(`begin;${f.seed}${f.auth}${f.sale()}${f.return()}reset role;${f.state}rollback;`));
  assert.deepEqual(r,{credit:1000,refund:1000,debt:0,restored_cost:600,stock:10,balance:0,
    invoice:{paid:0,due:0,status:'paid',total:1000},ledger:[],consumed:1,restocked:1,return_count:1});
});

const quote = value => `'${value.replaceAll("'", "''")}'`;
const denied = (f, before, statement) => {
  const outcome=json(sql(`begin;${f.seed}${f.auth}${before}reset role;${attempt}
    create temp table qa_before as select ${signature(f.org)} snapshot;
    create temp table qa_outcome as select pg_temp.attempt(${quote(statement)}) value;
    select value || jsonb_build_object('unchanged',(select snapshot from qa_before)=${signature(f.org)}) from qa_outcome;rollback;`));
  assert.equal(outcome.unchanged,true,'Denied call must leave all protected relations byte-equivalent');
  return outcome;
};

test('no-restock returns preserve original cost as a loss; unrelated debt is not relieved',{skip:!enabled},()=>{
  const f=fixture({initial:500});
  const r=json(sql(`begin;${f.seed}${f.auth}${f.sale()}${f.return({restock:0})}reset role;${f.state}rollback;`));
  assert.equal(r.credit,1000);assert.equal(r.refund,1000);assert.equal(r.debt,0);assert.equal(r.restored_cost,0);
  assert.equal(r.stock,9);assert.equal(r.balance,500);assert.deepEqual(r.ledger,[]);
  assert.equal(r.consumed,1);assert.equal(r.restocked,0);
});

test('cart and line discounts reduce original entitlement rather than using catalog price',{skip:!enabled},()=>{
  for(const [line,cart,expected]of [[0,100,900],[100,90,810]]){
    const f=fixture();
    const r=json(sql(`begin;${f.seed}${f.auth}${f.sale({discount:line,cartDiscount:cart})}${f.return()}reset role;${f.state}rollback;`));
    assert.equal(r.credit,expected);assert.equal(r.refund,expected);assert.equal(r.invoice.total,expected);
  }
});

test('five paisa / three units reaches five across three exact partial returns',{skip:!enabled},()=>{
  const f=fixture({price:0.02,cost:0});
  const r=json(sql(`begin;${f.seed}${f.auth}${f.sale({quantity:3,cartDiscount:0.01,paid:0.05})}
    ${f.return({quantity:1})}${f.return({quantity:1})}${f.return({quantity:1})}reset role;
    select jsonb_build_object('credits',(select jsonb_agg(line_total order by source_effective_at,id)from public.return_items where organization_id='${f.org}'),
      'total',(select sum(subtotal)from public.returns where organization_id='${f.org}'),'stock',(select stock_quantity from public.products where id='${f.product}'));rollback;`));
  assert.deepEqual(r.credits,[0.01,0.02,0.02]);assert.equal(r.total,0.05);assert.equal(r.stock,10);
});

test('return five/restock three consumes all five source units and restores only original cost',{skip:!enabled},()=>{
  const f=fixture({price:1000,cost:600});
  const r=json(sql(`begin;${f.seed}${f.auth}${f.sale({quantity:5})}${f.return({quantity:5,restock:3})}reset role;${f.state}rollback;`));
  assert.equal(r.credit,5000);assert.equal(r.refund,5000);assert.equal(r.restored_cost,1800);
  assert.equal(r.stock,8);assert.equal(r.consumed,5);assert.equal(r.restocked,3);
});

test('generated partial-return schedules never over-consume or over-restore original source units',{skip:!enabled},()=>{
  let seed=24637;
  const next=max=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%max;};
  for(let sample=0;sample<64;sample++){
    const sold=1+next(10),f=fixture({stock:12,price:100,cost:60});
    let consumed=0,restored=0;
    const checks=[];
    while(consumed<sold){
      const quantity=1+next(sold-consumed),restock=next(quantity+1);
      consumed+=quantity;restored+=restock;
      checks.push(`${f.return({quantity,restock})}reset role;
        do $$begin
          if (select sum(quantity) from public.return_item_source_allocations where organization_id='${f.org}')<>${consumed}
            or (select sum(restock_quantity) from public.return_item_source_allocations where organization_id='${f.org}')<>${restored}
            or exists(select 1 from public.return_item_source_allocations s join public.invoice_item_stock_allocations a on a.id=s.sale_allocation_id
              where s.organization_id='${f.org}' and (s.restock_quantity>s.quantity or s.unit_cost<>a.unit_cost))
            or exists(select 1 from public.invoice_item_stock_allocations a join public.return_item_source_allocations s on s.sale_allocation_id=a.id
              where s.organization_id='${f.org}' group by a.id,a.quantity having sum(s.quantity)>a.quantity or sum(s.restock_quantity)>sum(s.quantity))
          then raise exception 'Generated source conservation failed';end if;
        end $$;${f.auth}`);
    }
    const result=json(sql(`begin;${f.seed}${f.auth}${f.sale({quantity:sold})}${checks.join('\n')}reset role;${f.state}rollback;`));
    assert.equal(result.consumed,sold);assert.equal(result.restocked,restored);
    assert.equal(result.stock,12-sold+restored);assert.equal(result.restored_cost,60*restored);
    assert.equal(result.credit,100*sold);assert.ok(restored<=sold);
  }
});

test('mixed original FIFO lots restore first selected slots without averaging or current purchase cost',{skip:!enabled},()=>{
  const f=fixture({stock:2});const lot=randomUUID();
  const setup=`update public.products set stock_quantity=5 where id='${f.product}';
    update public.product_stock_lots set purchase_date=current_date-1 where id='${f.lot}';
    insert into public.product_stock_lots(id,organization_id,branch_id,product_id,quantity_received,quantity_remaining,unit_cost,purchase_date)
      values('${lot}','${f.org}','${f.branch}','${f.product}',3,3,700,current_date);`;
  const expected=`(select unit_cost*2 from public.invoice_item_stock_allocations where invoice_item_id=${f.item} order by created_at,id limit 1)`;
  const r=json(sql(`begin;${f.seed}${setup}${f.auth}${f.sale({quantity:5})}${f.return({quantity:3,restock:2})}reset role;
    select jsonb_build_object('expected',${expected},'actual',(select restored_cost from public.returns where organization_id='${f.org}'),
      'stock',(select stock_quantity from public.products where id='${f.product}'),
      'consumed',(select sum(quantity)from public.return_item_source_allocations where organization_id='${f.org}'),
      'restocked',(select sum(restock_quantity)from public.return_item_source_allocations where organization_id='${f.org}'));rollback;`));
  assert([1200,1400].includes(r.expected));assert.equal(r.actual,r.expected);
  assert.equal(r.stock,2);assert.equal(r.consumed,3);assert.equal(r.restocked,2);
});

test('walk-in refund has no customer ledger posting',{skip:!enabled},()=>{
  const f=fixture();
  const r=json(sql(`begin;${f.seed}${f.auth}${f.sale({walkIn:true})}${f.return()}reset role;${f.state}rollback;`));
  assert.equal(r.refund,1000);assert.equal(r.debt,0);assert.deepEqual(r.ledger,[]);
});

test('same durable request replays once, different details cannot reuse it',{skip:!enabled},()=>{
  const f=fixture();const key=randomUUID();const request=f.return({key});
  const r=json(sql(`begin;${f.seed}${f.auth}${f.sale()}${request}${request}reset role;${f.state}rollback;`));
  assert.equal(r.return_count,1);assert.equal(r.stock,10);assert.equal(r.refund,1000);assert.equal(r.consumed,1);
  const outcome=denied(f,`${f.sale()}${request}`,f.return({key,restock:0}));
  assert.equal(outcome.state,'PT409');
});

test('future actual credit payment persists invoice allocation and enables exact paid entitlement',{skip:!enabled},()=>{
  const f=fixture();
  const r=json(sql(`begin;${f.seed}${f.auth}${f.sale({paid:0})}
    select public.record_credit_payment('${f.customer}',1000,'cash',null,null);${f.return()}reset role;
    select jsonb_build_object('allocations',(select jsonb_agg(jsonb_build_array(amount,allocation_kind,source_trust_version))from public.invoice_payment_allocations where organization_id='${f.org}'),
      'refund',(select sum(refund_amount)from public.returns where organization_id='${f.org}'),'balance',(select outstanding_balance from public.customers where id='${f.customer}'));rollback;`));
  assert.deepEqual(r.allocations,[[1000,'actual_payment',1]]);assert.equal(r.refund,1000);assert.equal(r.balance,0);
});

test('write-off before a sale and unrelated write-off after a fully paid sale do not permanently block returns',{skip:!enabled},()=>{
  for(const before of [true,false]){
    const f=fixture({initial:1000});const writeoff=`select public.record_customer_write_off('${f.customer}',100,'Synthetic forgiveness');`;
    const r=json(sql(`begin;${f.seed}${f.auth}${before?writeoff:''}${f.sale()}${before?'':writeoff}${f.return()}reset role;${f.state}rollback;`));
    assert.equal(r.refund,1000);assert.equal(r.debt,0);assert.equal(r.balance,900);
  }
});

test('an invoice open at write-off is blocked even if later actual payment settles it',{skip:!enabled},()=>{
  for(const [paid,later]of [[0,false],[400,false],[400,true]]){
    const f=fixture({initial:2000});
    const writeoff=`select public.record_customer_write_off('${f.customer}',100,'Synthetic forgiveness');`;
    const payment=later?`select public.record_credit_payment('${f.customer}',${1000-paid},'cash',null,null);`:'';
    const outcome=denied(f,`${f.sale({paid})}${writeoff}${payment}`,f.return());
    assert.equal(outcome.state,'P0001');assert.match(outcome.message,/unsettled.*written off/i);
  }
});

test('over-return, excess restock, missing request identity and caller-controlled refund all fail closed',{skip:!enabled},()=>{
  const f=fixture();
  for(const statement of [f.return({quantity:2}),f.return({restock:2}),
    f.return().replace(/,'[0-9a-f-]+'\);$/,' ,null);'),
    f.return().replace(')),null,', ')),1000,')]){
    assert.notEqual(denied(f,f.sale(),statement).state,'00000');
  }
});

test('ordinary principal-zero service can be returned; pass-through principal and service restock are blocked',{skip:!enabled},()=>{
  for(const principal of [0,500]) {
    const f=fixture();const service=randomUUID();
    const setup=`insert into public.products(id,organization_id,name,type,sale_price,purchase_price,stock_quantity)
      values('${service}','${f.org}','Synthetic service','service',50,0,0);`;
    const sale=f.sale({cart:[{product_id:service,quantity:1,unit_price:50,discount:0,
      service_transaction_amount:principal,service_commission:50,service_total_charged:principal+50}],paid:principal+50});
    const item=`(select id from public.invoice_items where invoice_id=${f.invoice} and product_id='${service}')`;
    if(principal===0) {
      const r=json(sql(`begin;${f.seed}reset role;${setup}${f.auth}${sale}${f.return({restock:0,item})}reset role;${f.state}rollback;`));
      assert.equal(r.refund,50);assert.equal(r.restored_cost,0);assert.equal(r.consumed,0);assert.equal(r.stock,10);
      assert.notEqual(denied(f,`reset role;${setup}${f.auth}${sale}`,f.return({restock:1,item})).state,'00000');
    } else {
      const r=denied(f,`reset role;${setup}${f.auth}${sale}`,f.return({restock:0,item}));
      assert.equal(r.state,'P0001');assert.match(r.message,/provider/);
    }
  }
});

test('Owner/Admin/Manager role and nullable permission semantics remain narrow at the database',{skip:!enabled},()=>{
  for(const [role,override,allowed]of [['owner',false,true],['admin',false,true],['manager',null,true],
    ['manager',true,true],['manager',false,false],['cashier',true,false],['technician',true,false]]){
    const f=fixture();const permission=`reset role;update public.profiles set role='${role}' where id='${f.actor}';
      insert into public.staff_permissions(organization_id,profile_id,can_return)values('${f.org}','${f.actor}',${override===null?'null':override});${f.auth}`;
    if(allowed){
      const r=json(sql(`begin;${f.seed}${f.auth}${f.sale()}${permission}${f.return()}reset role;${f.state}rollback;`));
      assert.equal(r.return_count,1);
    }else assert.equal(denied(f,`${f.sale()}${permission}`,f.return()).state,'42501');
  }
});

test('inactive profiles, absent branch and another assigned branch fail without mutation',{skip:!enabled},()=>{
  for(const change of ['is_active=false','branch_id=null',`branch_id='${randomUUID()}'`]){
    const f=fixture();const branch=randomUUID();
    const actual=change.startsWith("branch_id='")?`branch_id='${branch}'`:change;
    const setup=`reset role;insert into public.branches(id,organization_id,name)values('${branch}','${f.org}','Other synthetic branch');
      update public.profiles set ${actual} where id='${f.actor}';${f.auth}`;
    assert.equal(denied(f,`${f.sale()}${setup}`,f.return()).state,'42501');
  }
});

test('legacy source invoices and ambiguous earlier returns fail closed without promoting history',{skip:!enabled},()=>{
  const f=fixture();const invoice=randomUUID(),item=randomUUID();
  const legacy=`reset role;insert into public.invoices(id,organization_id,branch_id,customer_id,invoice_no,status,subtotal,grand_total,amount_paid,balance_due)
    values('${invoice}','${f.org}','${f.branch}','${f.customer}','Synthetic legacy','paid',1000,1000,1000,0);
    insert into public.invoice_items(id,organization_id,invoice_id,product_id,product_name,product_type,quantity,unit_price,line_total)
    values('${item}','${f.org}','${invoice}','${f.product}','Synthetic legacy','product',1,1000,1000);${f.auth}`;
  const a=denied(f,legacy,f.return({invoice:`'${invoice}'`,item:`'${item}'`}));
  assert.equal(a.state,'P0001');assert.match(a.message,/before SaleDock/);
  const oldReturn=`reset role;insert into public.returns(organization_id,branch_id,invoice_id,customer_id,return_no,status,subtotal,refund_amount)
    values('${f.org}','${f.branch}',${f.invoice},'${f.customer}','Synthetic legacy return','completed',0,0);${f.auth}`;
  const b=denied(f,`${f.sale()}${oldReturn}`,f.return());
  assert.equal(b.state,'P0001');assert.match(b.message,/earlier returns/);
});

test('rollback at every V1 business boundary restores all protected state; sequence gaps alone may remain',{skip:!enabled},()=>{
  const boundaries=[['returns','insert'],['return_items','insert'],['return_item_source_allocations','insert'],
    ['product_stock_lots','update'],['return_stock_allocations','insert'],['stock_movements','insert'],
    ['products','update'],['invoices','update'],['customers','update'],['customer_ledger_entries','insert'],['audit_logs','insert']];
  for(const [table,event]of boundaries){
    const f=fixture();
    const inject=`reset role;create function pg_temp.fail_return()returns trigger language plpgsql as $$begin
      raise exception 'Synthetic rollback boundary' using errcode='23514';end$$;
      create trigger qa_return_failure after ${event} on public.${table} for each row execute function pg_temp.fail_return();${f.auth}`;
    const result=denied(f,`${f.sale({paid:0})}${inject}`,f.return());
    assert.equal(result.state,'23514',table);
  }
  const f=fixture();
  const inject=`reset role;create function pg_temp.fail_allocation()returns trigger language plpgsql as $$begin
    raise exception 'Synthetic allocation rollback' using errcode='23514';end$$;
    create trigger qa_return_failure after insert on public.invoice_payment_allocations for each row execute function pg_temp.fail_allocation();${f.auth}`;
  assert.equal(denied(f,`${f.sale({paid:0})}${inject}`,`select public.record_credit_payment('${f.customer}',1000,'cash',null,null);`).state,'23514');
});
test('unpaid and partly paid returns only relieve this invoice debt before refund',{skip:!enabled},()=>{
  for(const [paid,quantity,credit,debt,refund,due]of [[0,1,1000,1000,0,0],[400,4,800,600,200,0]]){
    const f=fixture({price:paid===0?1000:200,cost:0});
    const r=json(sql(`begin;${f.seed}${f.auth}${f.sale({quantity:paid===0?1:5,paid})}${f.return({quantity,restock:0})}reset role;${f.state}rollback;`));
    assert.equal(r.credit,credit);assert.equal(r.debt,debt);assert.equal(r.refund,refund);
    assert.equal(r.invoice.due,due);assert.equal(r.balance,0);
    assert.deepEqual(r.ledger.at(-1),['credit',debt,0]);
  }
});

test('database largest-remainder tie follows immutable item IDs on a mixed product/service invoice',{skip:!enabled},()=>{
  const f=fixture({price:1,cost:0});const service=randomUUID();
  const setup=`insert into public.products(id,organization_id,name,type,sale_price,purchase_price,stock_quantity)
    values('${service}','${f.org}','Synthetic labour','service',1,0,0);`;
  const cart=[{product_id:f.product,quantity:1,unit_price:1,discount:0},
    {product_id:service,quantity:1,unit_price:1,discount:0,service_transaction_amount:0,service_commission:1,service_total_charged:1}];
  const r=json(sql(`begin;${f.seed}${setup}${f.auth}${f.sale({cart,cartDiscount:0.01,paid:1.99})}
    create temp table qa_plan as select public.quote_invoice_return(${f.invoice},
      (select jsonb_agg(jsonb_build_object('invoice_item_id',id,'quantity',1,'restock_quantity',case when product_type='product' then 1 else 0 end)) from public.invoice_items where invoice_id=${f.invoice})) value;
    select public.create_invoice_return(${f.invoice},(select jsonb_agg(jsonb_build_object('invoice_item_id',id,'quantity',1,'restock_quantity',case when product_type='product' then 1 else 0 end)) from public.invoice_items where invoice_id=${f.invoice}),null,'cash',null,null,'${randomUUID()}');reset role;
    select jsonb_build_object('nets',(select jsonb_agg((x->>'net_minor')::integer order by x->>'invoice_item_id') from qa_plan,jsonb_array_elements(value->'items')x),
      'credit',(select subtotal from public.returns where organization_id='${f.org}'),
      'consumed',(select sum(quantity) from public.return_item_source_allocations where organization_id='${f.org}'),
      'service_stock',(select stock_quantity from public.products where id='${service}'));rollback;`));
  assert.deepEqual(r,{nets:[99,100],credit:1.99,consumed:1,service_stock:0});
});

test('future actual payment allocations preserve oldest-invoice FIFO and do not credit unrelated invoices',{skip:!enabled},()=>{
  const f=fixture({price:100,cost:0});const secondKey=randomUUID();
  const r=json(sql(`begin;${f.seed}${f.auth}${f.sale({paid:0})}${f.sale({paid:0,quantity:2,key:secondKey})}
    select public.record_credit_payment('${f.customer}',150,'cash',null,null);reset role;
    select jsonb_build_object('allocations',(select jsonb_agg(jsonb_build_array(i.grand_total,a.amount)order by i.grand_total) from public.invoice_payment_allocations a join public.invoices i on i.id=a.invoice_id where a.organization_id='${f.org}'),
      'balance',(select outstanding_balance from public.customers where id='${f.customer}'));rollback;`));
  assert.deepEqual(r,{allocations:[[100,100],[200,50]],balance:150});
});

test('multiple invoices open at an unallocated write-off remain individually blocked',{skip:!enabled},()=>{
  const f=fixture({initial:1000}),secondKey=randomUUID();
  const before=`${f.sale({paid:0})}${f.sale({paid:0,key:secondKey})}select public.record_customer_write_off('${f.customer}',100,'Synthetic ambiguity');`;
  for(const key of [f.key,secondKey]) {
    const invoice=`(select id from public.invoices where checkout_idempotency_key='${key}')`;
    const item=`(select id from public.invoice_items where invoice_id=${invoice})`;
    assert.equal(denied(f,before,f.return({invoice,item})).state,'P0001');
  }
});

test('Return provenance tables close ordinary raw DML and keep same-org reads only',{skip:!enabled},()=>{
  const f=fixture();const foreign=fixture();
  const r=json(sql(`begin;${f.seed}${foreign.seed}${f.auth}${f.sale({paid:0})}
    select public.record_credit_payment('${f.customer}',1000,'cash',null,null);${f.return()}reset role;
    ${foreign.auth}${foreign.sale()}${foreign.return()}reset role;
    create function pg_temp.raw_attempt(q text,r text) returns text language plpgsql as $$declare state text;begin
      begin perform set_config('role',r,true);execute q;state:='00000';exception when others then state:=sqlstate;end;
      perform set_config('role','postgres',true);return state;end$$;
    create temp table qa_snapshot as select ${signature(f.org)} value;
    create temp table qa_states(value text);
    do $$declare t text;role_name text;q text;begin
      foreach t in array array['returns','return_items','return_stock_allocations','invoice_payment_allocations','return_item_source_allocations'] loop
        foreach role_name in array array['anon','authenticated','service_role'] loop
          foreach q in array array[format('insert into public.%I(id)values(gen_random_uuid())',t),
            format('update public.%I set source_trust_version=1',t),format('delete from public.%I',t),format('truncate public.%I',t)] loop
            insert into qa_states values(pg_temp.raw_attempt(q,role_name));
          end loop;
        end loop;
      end loop;end$$;
    ${f.auth}create temp table qa_reads as select jsonb_build_object(
      'returns',(select count(*)from public.returns),'allocations',(select count(*)from public.invoice_payment_allocations),
      'sources',(select count(*)from public.return_item_source_allocations)) value;reset role;
    select jsonb_build_object('denials',(select count(*)from qa_states where value='42501'),'attempts',(select count(*)from qa_states),
      'reads',(select value from qa_reads),'unchanged',(select value from qa_snapshot)=${signature(f.org)});rollback;`));
  assert.deepEqual(r,{denials:60,attempts:60,reads:{returns:1,allocations:1,sources:1},unchanged:true});
});

test('native V1 round trip preserves business truth but strips all source/ledger provenance; reset leaves no allocation orphan',{skip:!enabled},()=>{
  const f=fixture();
  const r=json(sql(`begin;${f.seed}${f.auth}${f.sale({paid:0})}
    select public.record_credit_payment('${f.customer}',1000,'cash',null,null);${f.return()}reset role;
    create temp table qa_backup(table_name text,payload jsonb);
    do $$declare table_name text;begin foreach table_name in array backup_private.core_tables() loop
      execute format('insert into qa_backup select %L,to_jsonb(t) from public.%I t where organization_id=%L',table_name,table_name,'${f.org}');
    end loop;end$$;
    grant select on qa_backup to authenticated;
    ${f.auth}select public.reset_organization_to_factory_defaults('${f.org}','${f.actor}',false);reset role;
    create temp table qa_reset as select (select count(*)from public.invoice_payment_allocations where organization_id='${f.org}')+
      (select count(*)from public.return_item_source_allocations where organization_id='${f.org}')+
      (select count(*)from public.returns where organization_id='${f.org}') count;
    create function pg_temp.restore_v1()returns jsonb language plpgsql as $$
    declare job uuid;t text;rows jsonb;sealed jsonb;result jsonb;tables text[]:=backup_private.core_tables();begin
      perform set_config('role','authenticated',true);
      job:=(public.accounting_import_start_job('native','3','{}')->>'job_id')::uuid;
      foreach t in array tables loop
        select jsonb_agg(jsonb_build_object('source_id',payload->>'id','payload',payload || jsonb_build_object('source_trust_version',1,'source_transaction_id','1234','posting_trust_version',1))) into rows from qa_backup where table_name=t;
        if rows is not null then perform public.accounting_import_stage_chunk(job,t,0,rows);end if;
      end loop;
      sealed:=public.accounting_import_seal_job(job,public.accounting_import_get_job(job)->'manifest');
      result:=public.accounting_import_validate_job(job);
      if not (result->>'ok')::boolean then raise exception 'Restore validation failed: %',result;end if;
      result:=public.accounting_import_finalize_job(job,sealed->>'digest');
      perform set_config('role','postgres',true);return result;end$$;
    select pg_temp.restore_v1();
    select jsonb_build_object('resetOrphans',(select count from qa_reset),
      'credit',(select subtotal from public.returns where organization_id='${f.org}'),
      'version',(select return_math_version from public.returns where organization_id='${f.org}'),
      'returnTrusted',(select count(*)from public.returns where organization_id='${f.org}' and source_trust_version is not null),
      'paymentTrusted',(select count(*)from public.invoice_payment_allocations where organization_id='${f.org}' and source_trust_version is not null),
      'consumption',(select sum(quantity)from public.return_item_source_allocations where organization_id='${f.org}'),
      'sourceTrusted',(select count(*)from public.return_item_source_allocations where organization_id='${f.org}' and source_trust_version is not null),
      'ledgerTrusted',(select count(*)from public.customer_ledger_entries where organization_id='${f.org}' and posting_sequence is not null));rollback;`));
  assert.deepEqual(r,{resetOrphans:0,credit:1000,version:1,returnTrusted:0,paymentTrusted:0,consumption:1,sourceTrusted:0,ledgerTrusted:0});
});

for(const lines of [201,250,500])test(`protected ${lines}-line invoice returns exact entitlement without a fixed plan cap`,{skip:!enabled,timeout:120000},()=>{
  const f=largeInvoiceFixture(lines);
  const result=json(sql(`begin;${f.seed}${f.auth}${f.largeSale}
    select public.quote_invoice_return(${f.invoice},${f.fullPlan});${f.fullReturn()}reset role;${attempt}
    create temp table qa_over as select pg_temp.attempt(${quote(f.fullReturn())}) value;
    create temp table qa_duplicate as select pg_temp.attempt(${quote(`select public.quote_invoice_return(${f.invoice},jsonb_build_array(jsonb_build_object('invoice_item_id',${f.item},'quantity',1,'restock_quantity',1),jsonb_build_object('invoice_item_id',${f.item},'quantity',1,'restock_quantity',1)));`.replaceAll(f.item,`(select id from public.invoice_items where invoice_id=${f.invoice} order by id limit 1)`))}) value;
    select jsonb_build_object('lines',(select count(*)from public.invoice_items where invoice_id=${f.invoice}),
      'trusted',(select count(*)from public.invoice_items where invoice_id=${f.invoice} and source_trust_version=1),
      'credit',(select sum(subtotal)from public.returns where organization_id='${f.org}'),
      'refund',(select sum(refund_amount)from public.returns where organization_id='${f.org}'),
      'consumed',(select sum(quantity)from public.return_item_source_allocations where organization_id='${f.org}'),
      'restocked',(select sum(restock_quantity)from public.return_item_source_allocations where organization_id='${f.org}'),
      'unique_items',(select count(distinct invoice_item_id)from public.return_items where organization_id='${f.org}'),
      'stock',(select stock_quantity from public.products where id='${f.product}'),
      'over',(select value->>'state'from qa_over),'duplicate',(select value->>'state'from qa_duplicate));rollback;`));
  assert.deepEqual(result,{lines,trusted:lines,credit:lines,refund:lines,consumed:lines,restocked:lines,unique_items:lines,stock:lines,over:'P0001',duplicate:'22023'});
});

test('database quantity lexical/domain validation keeps remaining-source and restock caps',{skip:!enabled},()=>{
  assert.equal(sql('select 2147483647::integer'),'2147483647');
  for(const [value,state] of [[999999999,'P0001'],[1000000000,'P0001'],[2147483647,'P0001'],[2147483648,'22023'],[0,'22023'],["'-1'",'22023'],["'1.5'",'22023'],["'1e3'",'22023'],["'NaN'",'22023'],["'Infinity'",'22023']]) {
    const f=fixture();const outcome=denied(f,f.sale(),f.return({quantity:value,restock:0}));
    assert.equal(outcome.state,state,String(value));
    if(state==='P0001')assert.match(outcome.message,/quantity still available/);
  }
  const f=fixture();assert.equal(denied(f,f.sale(),f.return({quantity:1,restock:2147483647})).state,'22023');
});
