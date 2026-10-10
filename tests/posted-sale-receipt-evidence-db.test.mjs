import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const enabled=process.env.RUN_LOCAL_POSTED_EVIDENCE_DB==='1';
const tables=['invoices','invoice_items','payments','credit_payments','customer_write_offs','invoice_item_stock_allocations'];
function sql(query,sessionProbe=false) {
  const container=process.env.LOCAL_SUPABASE_DB_CONTAINER;
  assert.match(container??'',/^supabase_db_qa[0-9]+-[a-z0-9-]+$/,'Task-isolated local database only');
  const command=sessionProbe?['sh','-c','PGPASSWORD="$POSTGRES_PASSWORD" exec psql -XqAt -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -f -']:['psql','-XqAt','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-f','-'];
  const r=spawnSync('docker',['exec','-i',container,...command],{input:query,encoding:'utf8',maxBuffer:32*1024*1024});
  assert.equal(r.status,0,r.stderr);return r.stdout.trim();
}
const result=text=>JSON.parse(text.split('\n').filter(x=>x.startsWith('{')).at(-1));
function fixture() {
  const f=Object.fromEntries(['org','branch','actor','customer','product','otherOrg'].map(k=>[k,randomUUID()]));
  f.seed=`insert into public.organizations(id,name) values('${f.org}','QA64185 protected sources'),('${f.otherOrg}','QA64185 other organization');
    insert into public.branches(id,organization_id,name) values('${f.branch}','${f.org}','Synthetic branch');
    insert into auth.users(id) values('${f.actor}');
    insert into public.profiles(id,organization_id,branch_id,role,is_active,full_name) values('${f.actor}','${f.org}','${f.branch}','owner',true,'Synthetic source owner');
    insert into public.customers(id,organization_id,branch_id,name,outstanding_balance) values('${f.customer}','${f.org}','${f.branch}','Synthetic customer',100);
    insert into public.products(id,organization_id,name,type,sale_price,purchase_price,stock_quantity,is_active) values('${f.product}','${f.org}','Synthetic physical','product',1000,600,10,true);
    insert into public.product_stock_lots(organization_id,branch_id,product_id,quantity_received,quantity_remaining,unit_cost,purchase_date) values('${f.org}','${f.branch}','${f.product}',10,10,600,current_date);
    set local request.jwt.claim.sub='${f.actor}'; set local request.jwt.claim.role='authenticated';`;
  f.actorSql=`set local request.jwt.claim.sub='${f.actor}'; set local request.jwt.claim.role='authenticated'; set local role authenticated;`;
  f.sale=(method='cash',paid=1000,key=randomUUID())=>`select public.pos_checkout('${f.branch}','${f.customer}','[{"product_id":"${f.product}","quantity":1,"unit_price":1000,"discount":0,"source_trust_version":99}]',0,'${method}',${paid},null,null,false,'${key}');`;
  return f;
}
function remove(f) {
  sql(`begin; ${f.actorSql} select public.reset_organization_to_factory_defaults('${f.org}','${f.actor}',false); reset role;
    delete from public.profiles where id='${f.actor}'; delete from public.branches where id='${f.branch}';
    delete from public.organizations where id in ('${f.org}','${f.otherOrg}'); delete from auth.users where id='${f.actor}'; commit;`);
}
const probe=`create function pg_temp.denied(q text,r text default 'authenticated') returns text language plpgsql as $$
declare state text;begin
  begin perform set_config('role',r,true);execute q;state:='ALLOWED';exception when others then state:=sqlstate;end;
  perform set_config('role','postgres',true);return state;
end $$;`;

test('raw DML is denied for every role; original identities/economics, timestamps and FIFO are unchanged', {skip:!enabled},()=>{
  const f=fixture(),other=fixture();f.otherOrg=other.org;
  const proof=result(sql(`begin; ${f.seed} ${other.seed} set local role authenticated; ${other.sale()}
    select public.record_credit_payment('${other.customer}',20,'cash',null,null);
    select public.record_customer_write_off('${other.customer}',10,'Synthetic other forgiveness');reset role;
    ${f.actorSql} ${f.sale()}
    select public.record_credit_payment('${f.customer}',20,'cash',null,null);
    select public.record_customer_write_off('${f.customer}',10,'Synthetic forgiveness'); reset role; ${probe}
    create function pg_temp.matrix() returns jsonb language plpgsql as $$
    declare t text;r text;op text;q text;state text;rows jsonb:='[]';before_state jsonb;after_state jsonb;reads jsonb:='[]';n bigint;begin
      select jsonb_object_agg(table_name,snapshot) into before_state from (
        ${tables.map(t=>`select '${t}' as table_name,(select jsonb_agg(to_jsonb(doc) order by id) from public.${t} doc where organization_id='${f.org}') as snapshot`).join(' union all ')}
      ) snapshots;
      foreach r in array array['unauthenticated','owner','admin','manager','cashier','technician','service_role'] loop
        if r not in ('unauthenticated','service_role') then update public.profiles set role=r::public.user_role where id='${f.actor}';end if;
        foreach t in array array[${tables.map(t=>`'${t}'`).join(',')}] loop
          foreach op in array array['insert','update','delete'] loop
            q:=case op when 'insert' then format('insert into public.%I select (jsonb_populate_record(null::public.%I,to_jsonb(x)||jsonb_build_object(''id'',gen_random_uuid()))).* from public.%I x where organization_id=%L limit 1',t,t,t,'${f.org}')
              when 'update' then format('update public.%I set created_at=created_at-interval ''1 day'' where organization_id=%L',t,'${f.org}')
              else format('delete from public.%I where organization_id=%L',t,'${f.org}') end;
            state:=pg_temp.denied(q,case r when 'unauthenticated' then 'anon' when 'service_role' then 'service_role' else 'authenticated' end);
            if state is distinct from '42501' then raise exception 'Unexpected raw access: % % % %',r,t,op,state;end if;
            rows:=rows||jsonb_build_array(jsonb_build_object('role',r,'table',t,'operation',op,'state',state));
          end loop;
          if r not in ('unauthenticated','service_role') then
            perform set_config('role','authenticated',true);
            execute format('select count(*) from public.%I where organization_id=%L',t,'${f.org}') into n;
            if n<>1 then raise exception 'Legitimate read failed: % %',r,t;end if;
            execute format('select count(*) from public.%I where organization_id=%L',t,'${f.otherOrg}') into n;
            if n<>0 then raise exception 'Cross-org read leaked';end if;
            perform set_config('role','postgres',true);reads:=reads||jsonb_build_array(jsonb_build_object('role',r,'table',t,'sameOrg',true,'crossOrgDenied',true));
          end if;
        end loop;
      end loop;
      select jsonb_object_agg(table_name,snapshot) into after_state from (
        ${tables.map(t=>`select '${t}' as table_name,(select jsonb_agg(to_jsonb(doc) order by id) from public.${t} doc where organization_id='${f.org}') as snapshot`).join(' union all ')}
      ) snapshots;
      if before_state is distinct from after_state then raise exception 'Raw matrix changed evidence';end if;
      return jsonb_build_object('denials',jsonb_array_length(rows),'readChecks',jsonb_array_length(reads),'unchanged',before_state=after_state);
    end $$;select pg_temp.matrix();rollback;`));
  assert.deepEqual(proof,{denials:126,readChecks:30,unchanged:true});
});

test('post-cutover producers stamp one transaction; replay, settlement and write-off retain truthful semantics', {skip:!enabled},()=>{
  const f=fixture();const key=randomUUID();
  const proof=result(sql(`begin; ${f.seed} set local role authenticated; ${f.sale('customer_credit',0,key)} ${f.sale('customer_credit',0,key)}
    select public.record_credit_payment('${f.customer}',20,'cash',null,null);
    select public.record_customer_write_off('${f.customer}',10,'Synthetic forgiveness');reset role;
    select jsonb_build_object('invoiceCount',(select count(*) from public.invoices where organization_id='${f.org}'),
      'stock',(select stock_quantity from public.products where id='${f.product}'),
      'settlement',(select jsonb_build_object('paid',amount_paid,'due',balance_due,'status',status) from public.invoices where organization_id='${f.org}'),
      'customer',(select outstanding_balance from public.customers where id='${f.customer}'),
      'trusted',(select bool_and(source_trust_version=1 and source_effective_at is not null and source_transaction_id=pg_current_xact_id()) from (
        ${tables.filter(t=>t!=='payments').map(t=>`select source_trust_version,source_effective_at,source_transaction_id from public.${t} where organization_id='${f.org}'`).join(' union all ')}
      ) sources),'ledger',(select jsonb_agg(jsonb_build_object('amount',amount,'balance',balance_after,'direction',direction) order by posting_sequence) from public.customer_ledger_entries where customer_id='${f.customer}'));
    rollback;`));
  assert.deepEqual(proof,{invoiceCount:1,stock:9,settlement:{paid:20,due:980,status:'partial'},customer:1070,trusted:true,
    ledger:[{amount:1000,balance:1100,direction:'debit'},{amount:20,balance:1080,direction:'credit'},{amount:10,balance:1070,direction:'credit'}]});
  const cash=result(sql(`begin; ${f.seed} set local role authenticated;${f.sale()}reset role;
    select jsonb_build_object('counts',jsonb_build_array(${['invoices','invoice_items','payments','invoice_item_stock_allocations'].map(t=>`(select count(*) from public.${t} where organization_id='${f.org}' and source_trust_version=1)`).join(',')}),
      'sameSource',(select bool_and(s.source_transaction_id=i.source_transaction_id and s.source_effective_at=i.source_effective_at) from public.invoices i join (
        select invoice_id,source_transaction_id,source_effective_at from public.invoice_items union all select invoice_id,source_transaction_id,source_effective_at from public.payments union all select invoice_id,source_transaction_id,source_effective_at from public.invoice_item_stock_allocations
      ) s on s.invoice_id=i.id where i.organization_id='${f.org}'),
      'cost',(select purchase_price from public.invoice_items where organization_id='${f.org}'));rollback;`));
  assert.deepEqual(cash,{counts:[1,1,1,1],sameSource:true,cost:600});
});

test('field-specific attacks and private post-commit rewriting fail; reset is the only destructive exception', {skip:!enabled},()=>{
  const f=fixture();sql(`begin; ${f.seed} set local role authenticated;${f.sale()}commit;`);
  try {
    const attacks=[['invoices','subtotal=2000,discount_total=5,grand_total=2000'],['invoices','customer_id=null'],
      ['invoices','source_trust_version=null,source_effective_at=null,source_transaction_id=null'],
      ['invoice_items','quantity=2,unit_price=2000,line_total=2000'],['payments','amount=2000'],['payments','invoice_id=null'],
      ['payments',"paid_at='1900-01-01',created_at='1900-01-01'"],['invoice_item_stock_allocations','quantity=2,unit_cost=1'],
      ['invoice_item_stock_allocations','stock_lot_id=gen_random_uuid()']];
    const proof=result(sql(`begin; ${f.actorSql} reset role;${probe}
      select jsonb_build_object('raw',jsonb_build_array(${attacks.map(([t,set])=>`pg_temp.denied($q$update public.${t} set ${set} where organization_id='${f.org}'$q$)`).join(',')}),
        'privateCost',pg_temp.denied($q$update public.invoice_items set purchase_price=1 where organization_id='${f.org}'$q$,'ledger_posting_executor'),
        'privateAllocation',pg_temp.denied($q$update public.invoice_item_stock_allocations set quantity=2 where organization_id='${f.org}'$q$,'ledger_posting_executor'),
        'privateOriginal',pg_temp.denied($q$update public.invoices set grand_total=2000 where organization_id='${f.org}'$q$,'ledger_posting_executor'),
        'invoice',(select grand_total from public.invoices where organization_id='${f.org}'),
        'payment',(select amount from public.payments where organization_id='${f.org}'),
        'cost',(select purchase_price from public.invoice_items where organization_id='${f.org}'));
      rollback;`));
    assert.deepEqual(proof,{raw:Array(attacks.length).fill('42501'),privateCost:'42501',privateAllocation:'42501',privateOriginal:'42501',invoice:1000,payment:1000,cost:600});
  } finally {remove(f);}
  assert.equal(sql(`select count(*) from public.invoices where organization_id='${f.org}'`),'0');
});

test('ordinary callers cannot assume private roles or execute source guards; metadata constraints reject partial provenance', {skip:!enabled},()=>{
  const f=fixture();const proof=result(sql(`begin; ${f.seed} ${probe}
    create function pg_temp.escalation() returns jsonb language plpgsql as $$declare r text;s text;a jsonb:='[]';begin
      perform set_config('role','authenticated',true);
      foreach r in array array['ledger_posting_executor','backup_import_executor','ledger_reset_executor'] loop
        begin execute format('set local role %I',r);s:='ALLOWED';exception when others then s:=sqlstate;end;
        a:=a||jsonb_build_array(s);
      end loop;
      return jsonb_build_object('roles',a,'guardExecute',has_function_privilege('authenticated','ledger_private.guard_posted_source()','EXECUTE'));
    end $$;set session authorization authenticated;select pg_temp.escalation();reset session authorization;rollback;`,true));
  assert.deepEqual(proof,{roles:['42501','42501','42501'],guardExecute:false});
  assert.equal(sql(`select count(*) from pg_constraint where conname='posted_source_provenance' and pg_get_constraintdef(oid) like '%source_trust_version IS NOT NULL%'`),'6');
});

test('faults at invoice/item/receipt/FIFO/payment/write-off boundaries roll back protected sources and financial state', {skip:!enabled},()=>{
  for(const [table,operation] of [['invoices','sale'],['invoice_items','sale'],['payments','sale'],['invoice_item_stock_allocations','sale'],['credit_payments','payment'],['customer_write_offs','writeoff']]) {
    const f=fixture();const call=operation==='sale'?f.sale():operation==='payment'?`select public.record_credit_payment('${f.customer}',20,'cash',null,null);`:`select public.record_customer_write_off('${f.customer}',20,'Synthetic rollback');`;
    const proof=result(sql(`begin;${f.seed}
      create function pg_temp.fail_source() returns trigger language plpgsql as $$begin raise exception 'QA source failure';end $$;
      create trigger zzzz_qa_source_fault after insert on public.${table} for each row execute function pg_temp.fail_source();
      create function pg_temp.state() returns jsonb language sql as $$select jsonb_build_object('sources',${tables.map(t=>`(select count(*) from public.${t} where organization_id='${f.org}')`).join('+')},
        'stock',(select stock_quantity from public.products where id='${f.product}'),'balance',(select outstanding_balance from public.customers where id='${f.customer}'),
        'ledger',(select count(*) from public.customer_ledger_entries where customer_id='${f.customer}'),'allocations',(select sum(quantity_remaining) from public.product_stock_lots where organization_id='${f.org}'))$$;
      create function pg_temp.fault() returns jsonb language plpgsql as $$declare before_state jsonb:=pg_temp.state();msg text;begin
        begin perform set_config('role','authenticated',true);${call.replace(/^select /,'perform ')}exception when others then msg:=sqlerrm;end;
        perform set_config('role','postgres',true);
        if msg is distinct from 'QA source failure' or before_state is distinct from pg_temp.state() then raise exception 'Rollback failed: %',msg;end if;
        return jsonb_build_object('boundary','${table}','zeroResidue',true);end $$;
      select pg_temp.fault();rollback;`));
    assert.deepEqual(proof,{boundary:table,zeroResidue:true});
  }
});

test('old and forged-new native snapshots restore all six evidence relations without transferring provenance', {skip:!enabled},()=>{
  for(const variant of ['old','new','forged']) {
    const f=fixture();const proof=result(sql(`begin;${f.seed}set local role authenticated;${f.sale('customer_credit',500)}
      select public.record_credit_payment('${f.customer}',20,'cash',null,null);select public.record_customer_write_off('${f.customer}',10,'Synthetic forgiveness');reset role;
      create function pg_temp.restore() returns jsonb language plpgsql as $$
      declare backup jsonb:='{}';t text;rows jsonb;j uuid;sealed jsonb;r jsonb;n bigint:=0;stale uuid;stale_denied boolean:=false;begin
        foreach t in array array['product_categories','suppliers','customers','products','product_stock_lots','invoices','invoice_items','payments','credit_payments','customer_ledger_entries','customer_write_offs','returns','return_items','return_stock_allocations','supplier_purchases','supplier_purchase_items','supplier_payments','supplier_ledger_entries','supplier_write_offs','stock_movements','invoice_item_stock_allocations'] loop
          execute format('select coalesce(jsonb_agg(to_jsonb(r)),''[]'') from public.%I r where organization_id=$1',t) into rows using '${f.org}'::uuid;
          if t=any(array[${tables.map(t=>`'${t}'`).join(',')}]) then
            ${variant==='old'?`select coalesce(jsonb_agg(x-'source_trust_version'-'source_effective_at'-'source_transaction_id'),'[]') into rows from jsonb_array_elements(rows) x;`:variant==='forged'?`select coalesce(jsonb_agg(x||jsonb_build_object('source_trust_version',99,'source_effective_at','1900-01-01','source_transaction_id','not-a-transaction')),'[]') into rows from jsonb_array_elements(rows) x;`:''}
          end if;
          backup:=backup||jsonb_build_object(t,rows);
        end loop;
        perform set_config('role','authenticated',true);
        stale:=(public.accounting_import_start_job('native','3','{}')->>'job_id')::uuid;
        perform public.reset_organization_to_factory_defaults('${f.org}','${f.actor}',false);
        begin perform public.accounting_import_stage_chunk(stale,'customers',0,'[]');exception when others then stale_denied:=true;end;
        j:=(public.accounting_import_start_job('native','3','{}')->>'job_id')::uuid;
        for t,rows in select key,value from jsonb_each(backup) loop
          if jsonb_array_length(rows)>0 then perform public.accounting_import_stage_chunk(j,t,0,(select jsonb_agg(jsonb_build_object('source_id',x->>'id','payload',x)) from jsonb_array_elements(rows) x));end if;
        end loop;
        sealed:=public.accounting_import_seal_job(j,public.accounting_import_get_job(j)->'manifest');r:=public.accounting_import_validate_job(j);
        if r->>'ok' is distinct from 'true' then raise exception 'Validation failed: %',r;end if;
        r:=public.accounting_import_finalize_job(j,sealed->>'digest');if r->>'ok' is distinct from 'true' then raise exception 'Restore failed: %',r;end if;
        if public.accounting_import_finalize_job(j,sealed->>'digest')->'receipt' is distinct from r->'receipt' then raise exception 'Replay changed';end if;
        perform set_config('role','postgres',true);
        foreach t in array array[${tables.map(t=>`'${t}'`).join(',')}] loop
          execute format('select count(*) from public.%I where organization_id=$1 and (source_trust_version is not null or source_effective_at is not null or source_transaction_id is not null)',t) into n using '${f.org}'::uuid;
          if n<>0 then raise exception 'Imported authority in %',t;end if;
        end loop;
        return jsonb_build_object('variant','${variant}','restoredSources',${tables.map(t=>`(select count(*) from public.${t} where organization_id='${f.org}')`).join('+')},
          'trustedImported',0,'staleDenied',stale_denied,'balance',(select outstanding_balance from public.customers where id='${f.customer}'));
      end $$;select pg_temp.restore();rollback;`));
    assert.deepEqual(proof,{variant,restoredSources:6,trustedImported:0,staleDenied:true,balance:570});
  }
});
