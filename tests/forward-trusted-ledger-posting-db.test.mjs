import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';

const enabled = process.env.RUN_LOCAL_LEDGER_TRUST_DB === '1';
function sql(query, sessionProbe = false) {
  const container = process.env.LOCAL_SUPABASE_DB_CONTAINER;
  assert.match(container ?? '', /^supabase_db_qa[0-9]+-[a-z0-9-]+$/, 'Task-isolated local database only');
  const command = sessionProbe
    ? ['sh', '-c', 'PGPASSWORD="$POSTGRES_PASSWORD" exec psql -XqAt -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -f -']
    : ['psql', '-XqAt', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', '-'];
  const result = spawnSync('docker', ['exec', '-i', container, ...command], { input: query, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
const json = text => JSON.parse(text.split('\n').filter(line => line.startsWith('{')).at(-1));
function fixture() {
  const f = Object.fromEntries(['org', 'branch', 'actor', 'customer', 'supplier', 'product'].map(k => [k, randomUUID()]));
  f.seed = `insert into public.organizations(id,name) values('${f.org}','QA forward trust');
    insert into public.branches(id,organization_id,name) values('${f.branch}','${f.org}','QA branch');
    insert into auth.users(id) values('${f.actor}');
    insert into public.profiles(id,organization_id,branch_id,role,is_active,full_name) values('${f.actor}','${f.org}','${f.branch}','owner',true,'Synthetic ledger owner');
    insert into public.customers(id,organization_id,branch_id,name,outstanding_balance) values('${f.customer}','${f.org}','${f.branch}','QA customer',100);
    insert into public.suppliers(id,organization_id,name,outstanding_balance) values('${f.supplier}','${f.org}','QA supplier',100);
    insert into public.products(id,organization_id,name,type,sale_price,purchase_price,stock_quantity,is_active) values('${f.product}','${f.org}','QA physical','product',50,30,10,true);
    insert into public.product_stock_lots(organization_id,branch_id,product_id,quantity_received,quantity_remaining,unit_cost,purchase_date) values('${f.org}','${f.branch}','${f.product}',10,10,30,current_date);
    set local request.jwt.claim.sub='${f.actor}'; set local request.jwt.claim.role='authenticated';`;
  f.sale = `select public.pos_checkout('${f.branch}','${f.customer}','[{"product_id":"${f.product}","quantity":1,"unit_price":50,"discount":0}]',0,'customer_credit',0,null,'QA trust sale',false,'${randomUUID()}');`;
  f.purchase = `select public.create_supplier_purchase('${f.supplier}','${f.branch}',current_date,'[{"product_id":"${f.product}","quantity":1,"unit_cost":50}]',0,null,'QA trust purchase','cash',0,null);`;
  return f;
}
test('all seven writers preserve signed chains, return/FIFO math and local provenance', { skip: !enabled }, () => {
  const f = fixture();
  const result = json(sql(`begin; ${f.seed} set local role authenticated;
    ${f.sale}
    select public.record_credit_payment('${f.customer}',20,'cash',null,null);
    select public.record_customer_write_off('${f.customer}',10,'QA write off');
    select public.create_invoice_return((select id from public.invoices where organization_id='${f.org}'),
      (select jsonb_build_array(jsonb_build_object('invoice_item_id',id,'quantity',1,'restock',true)) from public.invoice_items where organization_id='${f.org}'),0,null,null,'QA return');
    ${f.purchase}
    select public.record_supplier_payment('${f.supplier}',null,'${f.branch}','cash',20,null,null);
    select public.record_supplier_write_off('${f.supplier}','${f.branch}',10,'QA write off');
    reset role;
    select jsonb_build_object('customer',(select outstanding_balance from public.customers where id='${f.customer}'),
      'supplier',(select outstanding_balance from public.suppliers where id='${f.supplier}'),
      'customerChain',(select jsonb_agg(jsonb_build_array(direction,amount,balance_after,posting_trust_version) order by posting_sequence) from public.customer_ledger_entries where customer_id='${f.customer}'),
      'supplierChain',(select jsonb_agg(jsonb_build_array(direction,amount,balance_after,posting_trust_version) order by posting_sequence) from public.supplier_ledger_entries where supplier_id='${f.supplier}'),
      'stock',(select stock_quantity from public.products where id='${f.product}'),
      'restoredCost',(select sum(quantity*unit_cost) from public.return_stock_allocations where organization_id='${f.org}'),
      'anchors',(select anchor_balance from ledger_private.customer_anchors where customer_id='${f.customer}')+(select anchor_balance from ledger_private.supplier_anchors where supplier_id='${f.supplier}'),
      'orderedTimes',(select bool_and(posting_effective_at >= a.trusted_from) from public.customer_ledger_entries l join ledger_private.customer_anchors a using(customer_id) where l.customer_id='${f.customer}'));
    rollback;`));
  assert.deepEqual(result, { customer: 70, supplier: 120, customerChain: [['debit', 50, 150, 1], ['credit', 20, 130, 1], ['credit', 10, 120, 1], ['credit', 50, 70, 1]], supplierChain: [['credit', 50, 150, 1], ['debit', 20, 130, 1], ['debit', 10, 120, 1]], stock: 11, restoredCost: 30, anchors: 200, orderedTimes: true });
});
test('ordinary five-role ledger/balance/provenance writes fail without business residue', { skip: !enabled }, () => {
  const f = fixture();
  const result = json(sql(`begin; ${f.seed} set local role authenticated; ${f.sale} ${f.purchase} reset role;
    create function pg_temp.tenant_callback() returns trigger language plpgsql as $$ begin return new; end $$;
    create function pg_temp.try_denied(q text) returns text language plpgsql as $$ begin
      begin perform set_config('role','authenticated',true); execute q; perform set_config('role','postgres',true); return 'ALLOWED';
      exception when others then perform set_config('role','postgres',true); return sqlstate; end;
    end $$;
    create function pg_temp.denials() returns jsonb language plpgsql as $$
    declare r text; op text; results jsonb := '[]';
    begin
      foreach r in array array['owner','admin','manager','cashier','technician'] loop
        update public.profiles set role=r::public.user_role where id='${f.actor}';
        foreach op in array array[
          'insert into public.customer_ledger_entries(organization_id,customer_id,entry_type,direction,amount,balance_after) values(''${f.org}'',''${f.customer}'',''adjustment'',''debit'',1,1)',
          'insert into public.supplier_ledger_entries(organization_id,supplier_id,entry_type,direction,amount,balance_after) values(''${f.org}'',''${f.supplier}'',''adjustment'',''credit'',1,1)',
          'update public.customer_ledger_entries set amount=1 where customer_id=''${f.customer}''',
          'update public.supplier_ledger_entries set amount=1 where supplier_id=''${f.supplier}''',
          'delete from public.customer_ledger_entries where customer_id=''${f.customer}''',
          'delete from public.supplier_ledger_entries where supplier_id=''${f.supplier}''',
          'update public.customers set outstanding_balance=999 where id=''${f.customer}''',
          'update public.suppliers set outstanding_balance=999 where id=''${f.supplier}''',
          'update ledger_private.customer_anchors set anchor_balance=999 where customer_id=''${f.customer}''',
          'update ledger_private.supplier_anchors set anchor_balance=999 where supplier_id=''${f.supplier}''',
          'update public.customer_ledger_entries set posting_sequence=999 where customer_id=''${f.customer}''',
          'update public.supplier_ledger_entries set posting_trust_version=999 where supplier_id=''${f.supplier}''',
          'insert into public.customers(organization_id,name,outstanding_balance) values(''${f.org}'',''QA forged'',1)',
          'insert into public.suppliers(organization_id,name,outstanding_balance) values(''${f.org}'',''QA forged'',1)',
          'delete from public.customers where id=''${f.customer}''',
          'delete from public.suppliers where id=''${f.supplier}''',
          'delete from public.invoices where organization_id=''${f.org}''',
          'create trigger qa_tenant_callback before update on public.customers for each row execute function pg_temp.tenant_callback()',
          'truncate public.customer_ledger_entries'
        ] loop results := results || jsonb_build_array(jsonb_build_object('role',r,'state',pg_temp.try_denied(op))); end loop;
      end loop;
      return jsonb_build_object('denials',results,'customer',(select outstanding_balance from public.customers where id='${f.customer}'),'supplier',(select outstanding_balance from public.suppliers where id='${f.supplier}'),'customerRows',(select count(*) from public.customer_ledger_entries where customer_id='${f.customer}'),'supplierRows',(select count(*) from public.supplier_ledger_entries where supplier_id='${f.supplier}'));
    end $$;
    select pg_temp.denials(); rollback;`));
  assert.equal(result.denials.length, 95);
  assert(result.denials.every(d => d.state === '42501' || d.state === '23503'), JSON.stringify(result));
  assert.equal(result.customer, 150); assert.equal(result.supplier, 150); assert.equal(result.customerRows, 1); assert.equal(result.supplierRows, 1);
});
test('zero account creation and ordinary contact edits remain available', { skip: !enabled }, () => {
  const f = fixture();
  const result = json(sql(`begin; ${f.seed} set local role authenticated;
    insert into public.customers(organization_id,name,phone,outstanding_balance) values('${f.org}','QA zero customer','synthetic phone',0);
    insert into public.suppliers(organization_id,name,outstanding_balance) values('${f.org}','QA zero supplier',0);
    update public.customers set name='QA renamed',phone='changed synthetic phone',notes='identity only' where id='${f.customer}';
    update public.suppliers set name='QA renamed supplier',notes='identity only' where id='${f.supplier}';
    select jsonb_build_object('customer',(select name from public.customers where id='${f.customer}'),'supplier',(select name from public.suppliers where id='${f.supplier}'),'zeroAnchors',(select count(*) from ledger_private.customer_anchors where organization_id='${f.org}' and anchor_balance=0)+(select count(*) from ledger_private.supplier_anchors where organization_id='${f.org}' and anchor_balance=0)); rollback;`));
  assert.deepEqual(result, { customer: 'QA renamed', supplier: 'QA renamed supplier', zeroAnchors: 2 });
});
test('POS replay has no second balance movement, posting, payment, or stock effect', { skip: !enabled }, () => {
  const f = fixture();
  const result = json(sql(`begin; ${f.seed} set local role authenticated; ${f.sale} ${f.sale} reset role;
    select jsonb_build_object('invoices',(select count(*) from public.invoices where organization_id='${f.org}'),'postings',(select count(*) from public.customer_ledger_entries where customer_id='${f.customer}'),'payments',(select count(*) from public.payments where organization_id='${f.org}'),'movements',(select count(*) from public.stock_movements where organization_id='${f.org}'),'outstanding',(select outstanding_balance from public.customers where id='${f.customer}')); rollback;`));
  assert.deepEqual(result, { invoices: 1, postings: 1, payments: 0, movements: 1, outstanding: 150 });
});
test('ordinary sessions cannot assume executor, and catalog grants/ownership remain narrow', { skip: !enabled }, () => {
  const result = json(sql(`begin; set session authorization authenticated;
    create function pg_temp.role_probe() returns boolean language plpgsql as $$ begin
      begin execute 'set local role ledger_posting_executor'; return false; exception when insufficient_privilege then return true; end;
    end $$;
    select jsonb_build_object('denied',pg_temp.role_probe(),'session',session_user);
    reset session authorization; rollback;`, true));
  assert.deepEqual(result, { denied: true, session: 'authenticated' });
  const catalog = json(sql(`select jsonb_build_object('role',(select jsonb_build_array(rolcanlogin,rolsuper,rolbypassrls) from pg_roles where rolname='ledger_posting_executor'),'cache',(select jsonb_agg(seqcache) from pg_sequence s join pg_class c on c.oid=s.seqrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='ledger_private'),'unsafeMemberships',(select count(*) from pg_roles r where r.rolname=any(array['authenticated','anon','authenticator','service_role','backup_import_executor','backup_identity_executor','backup_collision_reader']) and pg_has_role(r.oid,'ledger_posting_executor','MEMBER')),'businessTablesOwned',(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relowner='ledger_posting_executor'::regrole),'ordinarySequenceRights',has_sequence_privilege('authenticated','ledger_private.customer_posting_sequence','USAGE'))`));
  assert.deepEqual(catalog, { role: [false, false, false], cache: [1, 1], unsafeMemberships: 0, businessTablesOwned: 0, ordinarySequenceRights: false });
  assert.equal(sql("select count(*) from pg_roles r where r.rolname=any(array['authenticated','anon','authenticator','service_role','backup_import_executor','backup_identity_executor','backup_collision_reader']) and pg_has_role(r.oid,'ledger_reset_executor','MEMBER')"),'0');
  assert.equal(sql("select has_function_privilege('authenticated','ledger_private.factory_reset_core(uuid,uuid,boolean)','EXECUTE') or has_function_privilege('authenticated','ledger_private.factory_reset_service(uuid,uuid,boolean)','EXECUTE') or has_table_privilege('service_role','public.customer_ledger_entries','TRUNCATE') or has_table_privilege('authenticated','public.customers','TRIGGER')"),'f');
});

test('anonymous execution of every public writer leaves no business mutation', {skip:!enabled},()=>{
  const f=fixture();
  const calls=[f.sale,f.purchase,
    `select public.record_credit_payment('${f.customer}',1,'cash',null,null)`,
    `select public.record_customer_write_off('${f.customer}',1,'QA anonymous')`,
    `select public.record_supplier_payment('${f.supplier}',null,'${f.branch}','cash',1,null,null)`,
    `select public.record_supplier_write_off('${f.supplier}','${f.branch}',1,'QA anonymous')`,
    `select public.create_invoice_return('${randomUUID()}','[]',0,null,null,'QA anonymous')`];
  const result=json(sql(`begin; ${f.seed}
    create function pg_temp.anonymous_attempt(q text) returns text language plpgsql as $$ begin
      begin perform set_config('role','anon',true); execute q; perform set_config('role','postgres',true); return 'ALLOWED';
      exception when others then perform set_config('role','postgres',true); return sqlstate; end;
    end $$;
    select jsonb_build_object('states',jsonb_build_array(${calls.map(q=>`pg_temp.anonymous_attempt('${q.replaceAll("'","''")}')`).join(',')}),
      'customer',(select outstanding_balance from public.customers where id='${f.customer}'),
      'supplier',(select outstanding_balance from public.suppliers where id='${f.supplier}'),
      'invoices',(select count(*) from public.invoices where organization_id='${f.org}'),
      'customerLedger',(select count(*) from public.customer_ledger_entries where customer_id='${f.customer}'),
      'supplierLedger',(select count(*) from public.supplier_ledger_entries where supplier_id='${f.supplier}'));
    rollback;`));
  assert.deepEqual(result,{states:Array(7).fill('42501'),customer:100,supplier:100,invoices:0,customerLedger:0,supplierLedger:0});
});

test('account lifecycle, higher cascades, forged maintenance and reset rollback preserve all history', { skip: !enabled }, () => {
  const f=fixture();
  const output=sql(`begin; ${f.seed}
    set local role backup_import_executor;
    insert into public.customer_ledger_entries(organization_id,customer_id,entry_type,direction,amount,balance_after,description)
      values('${f.org}','${f.customer}','adjustment','debit',100,100,'Untrusted synthetic history');
    insert into public.supplier_ledger_entries(organization_id,supplier_id,entry_type,direction,amount,balance_after,description)
      values('${f.org}','${f.supplier}','adjustment','credit',100,100,'Untrusted synthetic history');
    reset role; set local role authenticated; ${f.sale} ${f.purchase}
    select public.record_credit_payment('${f.customer}',20,'cash',null,null);
    select public.record_supplier_payment('${f.supplier}',null,'${f.branch}','cash',20,null,null); reset role;
    create function pg_temp.history_snapshot() returns jsonb language plpgsql as $$
    declare t record; v jsonb; result jsonb:='{}'; begin
      for t in select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname in ('public','ledger_private') and c.relkind='r'
        and exists(select from pg_attribute a where a.attrelid=c.oid and a.attname='organization_id' and not a.attisdropped)
      loop
        execute format('select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),''[]''::jsonb) from %I.%I r where organization_id=$1',t.nspname,t.relname) into v using '${f.org}'::uuid;
        if t.relname='profiles' then continue; end if;
        if t.relname='customers' then select jsonb_agg(x-'is_archived'-'archived_at'-'updated_at') into v from jsonb_array_elements(v) x; end if;
        if t.relname='suppliers' then select jsonb_agg(x-'is_active'-'updated_at') into v from jsonb_array_elements(v) x; end if;
        result:=result||jsonb_build_object(t.nspname||'.'||t.relname,v);
      end loop; return result;
    end $$;
    create function pg_temp.attempt(q text) returns text language plpgsql as $$ begin
      begin perform set_config('role','authenticated',true); execute q; perform set_config('role','postgres',true); return 'ALLOWED';
      exception when others then perform set_config('role','postgres',true); return sqlstate; end;
    end $$;
    create function pg_temp.definer_delete() returns void language sql security definer as $$ delete from public.customers where id='${f.customer}'; $$;
    create function pg_temp.lifecycle() returns jsonb language plpgsql as $$
    declare role_name text; states jsonb:='[]'; pre jsonb:=pg_temp.history_snapshot(); current_snapshot jsonb;
    begin
      foreach role_name in array array['owner','admin','manager','cashier','technician'] loop
        update public.profiles set role=role_name::public.user_role where id='${f.actor}';
        states:=states||jsonb_build_array(jsonb_build_object('role',role_name,
          'customer',pg_temp.attempt('delete from public.customers where id=''${f.customer}'''),
          'supplier',pg_temp.attempt('delete from public.suppliers where id=''${f.supplier}'''),
          'reset',case when role_name='owner' then 'Owner exercised separately' else pg_temp.attempt('select public.reset_organization_to_factory_defaults(''${f.org}'',''${f.actor}'',false)') end));
        if pg_temp.history_snapshot() is distinct from pre then raise exception 'Role denial changed protected history'; end if;
      end loop;
      update public.profiles set role='owner' where id='${f.actor}';
      if pg_temp.attempt('select pg_temp.definer_delete()') <> '42501' then raise exception 'Definer cascade bypass'; end if;
      perform pg_temp.attempt('delete from public.organizations where id=''${f.org}''');
      perform pg_temp.attempt('delete from public.branches where id=''${f.branch}''');
      if pg_temp.history_snapshot() is distinct from pre then raise exception 'Higher-parent cascade changed protected history'; end if;
      perform set_config('app.ledger_maintenance','true',true);
      if pg_temp.attempt('delete from public.customers where id=''${f.customer}''') <> '42501' then raise exception 'Forged mode'; end if;
      update public.profiles set role='manager' where id='${f.actor}';
      perform set_config('request.jwt.claim.role','service_role',true);
      if pg_temp.attempt('select public.reset_organization_to_factory_defaults(''${f.org}'',''${f.actor}'',false)')='ALLOWED' then raise exception 'Writable JWT role bypass'; end if;
      perform set_config('request.jwt.claim.role','authenticated',true);
      update public.profiles set role='owner' where id='${f.actor}';
      perform set_config('role','authenticated',true);
      update public.customers set is_archived=true,archived_at=clock_timestamp() where id='${f.customer}';
      update public.suppliers set is_active=false where id='${f.supplier}';
      perform set_config('role','postgres',true);
      if pg_temp.history_snapshot() is distinct from pre then raise exception 'Archive/deactivate changed accounting history'; end if;
      perform set_config('role','authenticated',true);
      update public.customers set is_archived=false,archived_at=null where id='${f.customer}';
      update public.suppliers set is_active=true where id='${f.supplier}';
      insert into public.customers(organization_id,name) values('${f.org}','Zero-history customer');
      insert into public.suppliers(organization_id,name) values('${f.org}','Zero-history supplier');
      perform set_config('role','postgres',true);
      if pg_temp.attempt('delete from public.customers where organization_id=''${f.org}'' and name=''Zero-history customer''') <> '42501' then raise exception 'Zero customer delete'; end if;
      if pg_temp.attempt('delete from public.suppliers where organization_id=''${f.org}'' and name=''Zero-history supplier''') <> '42501' then raise exception 'Zero supplier delete'; end if;
      current_snapshot:=pg_temp.history_snapshot();
      return jsonb_build_object('states',states,'customerBalance',(select outstanding_balance from public.customers where id='${f.customer}'),
        'supplierBalance',(select outstanding_balance from public.suppliers where id='${f.supplier}'),
        'customerHistory',(select count(*) from public.customer_ledger_entries where customer_id='${f.customer}'),
        'supplierHistory',(select count(*) from public.supplier_ledger_entries where supplier_id='${f.supplier}'),
        'customerTrusted',(select count(*) from public.customer_ledger_entries where customer_id='${f.customer}' and posting_sequence is not null),
        'supplierTrusted',(select count(*) from public.supplier_ledger_entries where supplier_id='${f.supplier}' and posting_sequence is not null),
        'anchors',(select count(*) from ledger_private.customer_anchors where organization_id='${f.org}')+(select count(*) from ledger_private.supplier_anchors where organization_id='${f.org}'));
    end $$;
    select pg_temp.lifecycle();
    create function pg_temp.reset_fault() returns trigger language plpgsql as $$ begin raise exception 'QA forced reset rollback'; end $$;
    create trigger aa_qa_reset_fault after delete on public.supplier_ledger_entries for each row execute function pg_temp.reset_fault();
    do $$ declare pre jsonb:=pg_temp.history_snapshot(); state text; begin
      state:=pg_temp.attempt('select public.reset_organization_to_factory_defaults(''${f.org}'',''${f.actor}'',false)');
      if state <> 'P0001' or pg_temp.history_snapshot() is distinct from pre then raise exception 'Reset did not roll back completely'; end if;
    end $$;
    drop trigger aa_qa_reset_fault on public.supplier_ledger_entries;
    set local role authenticated; select public.reset_organization_to_factory_defaults('${f.org}','${f.actor}',false); reset role;
    do $$ begin
      if exists(select from public.customers where organization_id='${f.org}') or exists(select from public.suppliers where organization_id='${f.org}')
        or exists(select from public.customer_ledger_entries where organization_id='${f.org}') or exists(select from public.supplier_ledger_entries where organization_id='${f.org}')
        or exists(select from ledger_private.customer_anchors where organization_id='${f.org}') or exists(select from ledger_private.supplier_anchors where organization_id='${f.org}')
      then raise exception 'Reset orphan state'; end if;
    end $$; rollback;`);
  const records=output.split('\n').filter(line=>line.startsWith('{')).map(JSON.parse);
  const lifecycle=records.find(r=>r.states);
  assert.equal(lifecycle.customerBalance,130);assert.equal(lifecycle.supplierBalance,130);
  assert.equal(lifecycle.customerHistory,3);assert.equal(lifecycle.supplierHistory,3);
  assert.equal(lifecycle.customerTrusted,2);assert.equal(lifecycle.supplierTrusted,2);assert.equal(lifecycle.anchors,4);
  assert(lifecycle.states.every(r=>r.customer==='42501'&&r.supplier==='42501'));
  assert(lifecycle.states.filter(r=>r.role!=='owner').every(r=>r.reset==='P0001'));
  const result=records.at(-1);
  // The reset emits its count object after the lifecycle result.
  assert.equal(result.customers,2); assert.equal(result.suppliers,2);
  assert.equal(result.customer_ledger_entries,3); assert.equal(result.supplier_ledger_entries,3);
});

function session() {
  const child=spawn('docker',['exec','-i',process.env.LOCAL_SUPABASE_DB_CONTAINER,'psql','-XqAt','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{stdio:['pipe','pipe','pipe']});
  let output='',error='';
  child.stdout.on('data',v=>{output+=v;}); child.stderr.on('data',v=>{error+=v;});
  const completed=new Promise((resolve,reject)=>child.on('exit',code=>code===0?resolve(output):reject(new Error(error))));
  const until=async predicate=>{
    const deadline=Date.now()+10000;
    while(!predicate(output)) { if(Date.now()>deadline) throw new Error('Controlled database session did not reach checkpoint'); await new Promise(r=>setTimeout(r,20)); }
  };
  return {child,completed,until};
}
const actorSql=f=>`set local request.jwt.claim.sub='${f.actor}'; set local request.jwt.claim.role='authenticated'; set local role authenticated;`;
function removeFixture(f) {
  sql(`begin; ${actorSql(f)} select public.reset_organization_to_factory_defaults('${f.org}','${f.actor}',false); reset role;
    delete from public.profiles where organization_id='${f.org}'; delete from public.branches where organization_id='${f.org}';
    delete from public.organizations where id='${f.org}'; delete from auth.users where id='${f.actor}'; commit;`);
}
test('same-account customer and supplier writers serialize; other accounts and organizations remain independent', {skip:!enabled},async()=>{
  for(const domain of ['customer','supplier','different-account','cross-org']) {
    const f=fixture(), other=domain==='cross-org'?fixture():null;
    sql(`begin; ${f.seed} ${other?.seed??''} commit;`);
    const a=session(),b=session();
    const otherCustomer=randomUUID();
    if(domain==='different-account') sql(`insert into public.customers(id,organization_id,name,outstanding_balance) values('${otherCustomer}','${f.org}','QA independent',100);`);
    const first=domain==='customer'?f.sale:domain==='supplier'?f.purchase:`select public.record_credit_payment('${f.customer}',20,'cash',null,null);`;
    const bf=other??f;
    const second=domain==='supplier'?`select public.record_supplier_payment('${f.supplier}',null,'${f.branch}','cash',20,null,null);`:
      `select public.record_credit_payment('${domain==='different-account'?otherCustomer:bf.customer}',20,'cash',null,null);`;
    try {
      a.child.stdin.write(`begin; ${actorSql(f)} ${first} select 'QA_READY';\n`);
      await a.until(o=>o.includes('QA_READY'));
      b.child.stdin.end(`set application_name='qa22819-concurrency'; begin; ${actorSql(bf)} ${second} commit; select 'QA_DONE';`);
      if(domain==='customer'||domain==='supplier') {
        let blocked=false;
        for(let i=0;i<100&&!blocked;i++) {
          blocked=sql("select exists(select from pg_stat_activity where application_name='qa22819-concurrency' and wait_event_type='Lock');")==='t';
          if(!blocked) await new Promise(r=>setTimeout(r,20));
        }
        assert.equal(blocked,true,'Second same-account writer must wait on the account transaction');
        a.child.stdin.end('commit;'); await a.completed; await b.completed;
        const result=json(sql(`select jsonb_build_object('balance',(select outstanding_balance from public.${domain}s where id='${f[domain]}'),
          'chain',(select jsonb_agg(balance_after order by posting_sequence) from public.${domain}_ledger_entries where ${domain}_id='${f[domain]}'));`));
        assert.deepEqual(result,{balance:130,chain:[150,130]});
      } else {
        await b.until(o=>o.includes('QA_DONE'));
        await b.completed;
        a.child.stdin.end('commit;'); await a.completed;
        assert.equal(sql(`select outstanding_balance from public.customers where id='${domain==='different-account'?otherCustomer:bf.customer}';`),'80.00');
      }
    } finally {
      if(!a.child.stdin.writableEnded) a.child.stdin.end('rollback;');
      if(!b.child.stdin.writableEnded) b.child.stdin.end('rollback;');
      await Promise.allSettled([a.completed,b.completed]);
      removeFixture(f); if(other) removeFixture(other);
    }
  }
});

test('faults after each mutation boundary roll back business rows, balances and anchors; sequence gaps alone are allowed', {skip:!enabled},()=>{
  const plans=[
    ['customer-parent','invoices','insert','sale'],
    ['customer-balance','customers','update','sale'],
    ['customer-sequence','customer_ledger_entries','insert','sale','before'],
    ['customer-posting','customer_ledger_entries','insert','sale'],
    ['customer-payment','credit_payments','insert','payment'],
    ['customer-write-off','customer_write_offs','insert','writeoff'],
    ['stock-update','products','update','sale'],
    ['supplier-parent','supplier_purchases','insert','purchase'],
    ['supplier-balance','suppliers','update','purchase'],
    ['supplier-sequence','supplier_ledger_entries','insert','purchase','before'],
    ['supplier-posting','supplier_ledger_entries','insert','purchase'],
    ['supplier-payment','supplier_payments','insert','supplierPayment'],
    ['supplier-write-off','supplier_write_offs','insert','supplierWriteoff'],
    ['supplier-stock','product_stock_lots','insert','purchase'],
  ];
  for(const [name,table,event,operation,timing='after'] of plans) {
    const f=fixture();
    const call={sale:f.sale,purchase:f.purchase,
      payment:`select public.record_credit_payment('${f.customer}',20,'cash',null,null);`,
      writeoff:`select public.record_customer_write_off('${f.customer}',20,'QA rollback');`,
      supplierPayment:`select public.record_supplier_payment('${f.supplier}',null,'${f.branch}','cash',20,null,null);`,
      supplierWriteoff:`select public.record_supplier_write_off('${f.supplier}','${f.branch}',20,'QA rollback');`}[operation];
    const result=json(sql(`begin; ${f.seed}
      create function pg_temp.all_state() returns jsonb language plpgsql as $$
      declare t record; v jsonb; result jsonb:='{}'; begin
        for t in select schemaname,tablename from pg_tables where schemaname in ('public','ledger_private') order by 1,2 loop
          execute format('select jsonb_build_object(''n'',count(*),''hash'',md5(coalesce(string_agg(md5(to_jsonb(r)::text),'''' order by md5(to_jsonb(r)::text)),''''))) from %I.%I r',t.schemaname,t.tablename) into v;
          result:=result||jsonb_build_object(t.schemaname||'.'||t.tablename,v);
        end loop; return result;
      end $$;
      create function pg_temp.fail_boundary() returns trigger language plpgsql as $$ begin raise exception 'QA ${name} forced failure'; end $$;
      create trigger zzzz_qa_fault ${timing} ${event} on public.${table} for each row execute function pg_temp.fail_boundary();
      create function pg_temp.probe() returns jsonb language plpgsql as $$ declare pre jsonb:=pg_temp.all_state(); failure text; begin
        begin perform set_config('role','authenticated',true); ${call.replace(/^select /,'perform ')}
          raise exception 'Fault did not fire';
        exception when others then failure:=sqlerrm; end;
        perform set_config('role','postgres',true);
        if failure is distinct from 'QA ${name} forced failure' then raise exception 'Unexpected failure: %',failure; end if;
        if pre is distinct from pg_temp.all_state() then raise exception 'Partial state at ${name}'; end if;
        return jsonb_build_object('boundary','${name}','zeroBusinessResidue',true);
      end $$; select pg_temp.probe(); rollback;`));
    assert.deepEqual(result,{boundary:name,zeroBusinessResidue:true});
  }
});

test('atomic import and native round trip reset historical provenance and anchor the explicit current balance', {skip:!enabled},()=>{
  const f=fixture(),target=fixture(), c=randomUUID(),s=randomUUID();
  const backupTables=['product_categories','suppliers','customers','products','product_stock_lots','invoices','invoice_items','payments','credit_payments','customer_ledger_entries','customer_write_offs','returns','return_items','return_stock_allocations','supplier_purchases','supplier_purchase_items','supplier_payments','supplier_ledger_entries','supplier_write_offs','stock_movements','invoice_item_stock_allocations'];
  const result=json(sql(`begin; ${f.seed}
    create function pg_temp.stage_restore(org uuid,crow jsonb,srow jsonb,cl jsonb,sl jsonb) returns jsonb language plpgsql as $$
    declare job uuid; sealed jsonb; receipt jsonb; begin
      job:=(public.accounting_import_start_job('native','3','{}')->>'job_id')::uuid;
      perform public.accounting_import_stage_chunk(job,'customers',0,jsonb_build_array(jsonb_build_object('source_id',crow->>'id','payload',crow)));
      perform public.accounting_import_stage_chunk(job,'suppliers',0,jsonb_build_array(jsonb_build_object('source_id',srow->>'id','payload',srow)));
      perform public.accounting_import_stage_chunk(job,'customer_ledger_entries',0,(select jsonb_agg(jsonb_build_object('source_id',x->>'id','payload',x)) from jsonb_array_elements(cl) x));
      perform public.accounting_import_stage_chunk(job,'supplier_ledger_entries',0,(select jsonb_agg(jsonb_build_object('source_id',x->>'id','payload',x)) from jsonb_array_elements(sl) x));
      sealed:=public.accounting_import_seal_job(job,public.accounting_import_get_job(job)->'manifest');
      receipt:=public.accounting_import_validate_job(job);
      if receipt->>'ok' is distinct from 'true' then raise exception 'Import validation failed: %',receipt; end if;
      receipt:=public.accounting_import_finalize_job(job,sealed->>'digest');
      if receipt->>'ok' is distinct from 'true' then raise exception 'Import failed: %',receipt; end if;
      if public.accounting_import_finalize_job(job,sealed->>'digest')->'receipt' is distinct from receipt->'receipt' then raise exception 'Completed receipt replay changed'; end if;
      return receipt;
    end $$;
    create function pg_temp.roundtrip() returns jsonb language plpgsql as $$
    declare crow jsonb;srow jsonb;cl jsonb;sl jsonb;old_job uuid;stale_denied boolean:=false;before_reset jsonb;after_restore jsonb;
      backup jsonb:='{}';t text;rows jsonb;job uuid;sealed jsonb;receipt jsonb;begin
      perform set_config('role','authenticated',true);
      perform pg_temp.stage_restore('${f.org}',jsonb_build_object('id','${c}','name','Imported customer','outstanding_balance',100),jsonb_build_object('id','${s}','name','Imported supplier','outstanding_balance',100),
        jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'customer_id','${c}','entry_type','adjustment','direction','debit','amount',5,'balance_after',999,'posting_sequence',999,'posting_trust_version',1,'posting_effective_at','1900-01-01')),
        jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'supplier_id','${s}','entry_type','adjustment','direction','credit','amount',5,'balance_after',999,'posting_sequence',999,'posting_trust_version',1,'posting_effective_at','1900-01-01')));
      perform public.record_credit_payment('${c}',20,'cash',null,null);
      perform public.record_supplier_payment('${s}',null,'${f.branch}','cash',20,null,null);
      perform set_config('role','postgres',true);
      select to_jsonb(r) into crow from public.customers r where id='${c}';
      select to_jsonb(r) into srow from public.suppliers r where id='${s}';
      foreach t in array array[${backupTables.map(t=>`'${t}'`).join(',')}] loop
        execute format('select coalesce(jsonb_agg(to_jsonb(r)),''[]'') from public.%I r where organization_id=$1',t) into rows using '${f.org}'::uuid;
        backup:=backup||jsonb_build_object(t,rows);
      end loop;
      select jsonb_build_object('customerAnchor',(select anchor_balance from ledger_private.customer_anchors where customer_id='${c}'),
        'supplierAnchor',(select anchor_balance from ledger_private.supplier_anchors where supplier_id='${s}'),
        'customerCurrent',crow->'outstanding_balance','supplierCurrent',srow->'outstanding_balance',
        'legacy', (select count(*) from public.customer_ledger_entries where customer_id='${c}' and posting_sequence is null)+(select count(*) from public.supplier_ledger_entries where supplier_id='${s}' and posting_sequence is null),
        'trusted',(select count(*) from public.customer_ledger_entries where customer_id='${c}' and posting_sequence is not null)+(select count(*) from public.supplier_ledger_entries where supplier_id='${s}' and posting_sequence is not null)) into before_reset;
      perform set_config('role','authenticated',true);
      old_job:=(public.accounting_import_start_job('native','3','{}')->>'job_id')::uuid;
      perform public.reset_organization_to_factory_defaults('${f.org}','${f.actor}',false);
      begin perform public.accounting_import_stage_chunk(old_job,'customers',0,'[]'); exception when others then stale_denied:=true; end;
      perform set_config('role','postgres',true);
      ${target.seed.slice(0,target.seed.indexOf('insert into public.customers'))}
      -- Fresh organization with native root identities provisioned by local QA.
      -- The source shop was deliberately reset first, so no target-ID collision is bypassed.
      update public.branches set organization_id='${target.org}' where id='${f.branch}';
      update public.profiles set organization_id='${target.org}' where id='${f.actor}';
      perform set_config('request.jwt.claim.sub','${target.actor}',true);
      perform set_config('role','authenticated',true);
      job:=(public.accounting_import_start_job('native','3','{}')->>'job_id')::uuid;
      foreach t in array array[${backupTables.map(t=>`'${t}'`).join(',')}] loop
        rows:=backup->t;
        if jsonb_array_length(rows)>0 then
          perform public.accounting_import_stage_chunk(job,t,0,(select jsonb_agg(jsonb_build_object('source_id',x->>'id','payload',x)) from jsonb_array_elements(rows) x));
        end if;
      end loop;
      sealed:=public.accounting_import_seal_job(job,public.accounting_import_get_job(job)->'manifest');
      receipt:=public.accounting_import_validate_job(job);
      if receipt->>'ok' is distinct from 'true' then raise exception 'Native validation failed: %',receipt; end if;
      receipt:=public.accounting_import_finalize_job(job,sealed->>'digest');
      if receipt->>'ok' is distinct from 'true' then raise exception 'Full native restore failed: %',receipt; end if;
      perform set_config('role','postgres',true);
      select jsonb_build_object('customerAnchor',(select anchor_balance from ledger_private.customer_anchors where customer_id='${c}'),
        'supplierAnchor',(select anchor_balance from ledger_private.supplier_anchors where supplier_id='${s}'),
        'sourceHistoryRows',(select count(*) from public.customer_ledger_entries where customer_id='${c}')+(select count(*) from public.supplier_ledger_entries where supplier_id='${s}'),
        'trustedImported',(select count(*) from public.customer_ledger_entries where customer_id='${c}' and (posting_sequence is not null or posting_trust_version is not null or posting_effective_at is not null))+(select count(*) from public.supplier_ledger_entries where supplier_id='${s}' and (posting_sequence is not null or posting_trust_version is not null or posting_effective_at is not null)),
        'customerPayments',(select count(*) from public.credit_payments where customer_id='${c}'),
        'supplierPayments',(select count(*) from public.supplier_payments where supplier_id='${s}'),
        'relations',(select count(*) from jsonb_object_keys(backup))) into after_restore;
      perform set_config('role','authenticated',true);
      perform public.record_credit_payment('${c}',0.02,'cash',null,null);
      perform public.record_supplier_payment('${s}',null,'${target.branch}','cash',0.02,null,null);
      perform set_config('role','postgres',true);
      return jsonb_build_object('before',before_reset,'restored',after_restore,'staleJobDenied',stale_denied,
        'customer',(select outstanding_balance from public.customers where id='${c}'),'supplier',(select outstanding_balance from public.suppliers where id='${s}'),
        'newTrusted',(select count(*) from public.customer_ledger_entries where customer_id='${c}' and posting_sequence is not null)+(select count(*) from public.supplier_ledger_entries where supplier_id='${s}' and posting_sequence is not null));
    end $$; select pg_temp.roundtrip(); rollback;`));
  assert.deepEqual(result,{before:{customerAnchor:100,supplierAnchor:100,customerCurrent:80,supplierCurrent:80,legacy:2,trusted:2},
    restored:{customerAnchor:80,supplierAnchor:80,sourceHistoryRows:4,trustedImported:0,customerPayments:1,supplierPayments:1,relations:21},staleJobDenied:true,customer:79.98,supplier:79.98,newTrusted:2});
});

test('period foundation uses anchors, authoritative posting order and effective time, never legacy chronology', {skip:!enabled},()=>{
  const f=fixture();
  const result=json(sql(`begin; ${f.seed} set local role authenticated; ${f.sale} ${f.purchase}
    select public.record_credit_payment('${f.customer}',20,'cash',null,null);
    select public.record_supplier_payment('${f.supplier}',null,'${f.branch}','cash',20,null,null); reset role;
    select jsonb_build_object('customer',(select jsonb_build_object('opening',a.anchor_balance,'closing',a.anchor_balance+sum(case l.direction when 'debit' then l.amount else -l.amount end),
      'last',(array_agg(l.balance_after order by l.posting_sequence desc))[1],'cache',(select outstanding_balance from public.customers where id='${f.customer}'),
      'sameCreatedTime',count(distinct l.created_at)=1,'preTrustSupported',a.trusted_from-interval '1 microsecond'>=a.trusted_from,'postTrustSupported',bool_and(l.posting_effective_at>=a.trusted_from),
      'subOpening',(select balance_after from public.customer_ledger_entries where customer_id='${f.customer}' and posting_effective_at<(select max(posting_effective_at) from public.customer_ledger_entries where customer_id='${f.customer}') order by posting_sequence desc limit 1))
      from ledger_private.customer_anchors a join public.customer_ledger_entries l using(customer_id) where customer_id='${f.customer}' group by a.anchor_balance,a.trusted_from),
      'supplier',(select jsonb_build_object('opening',a.anchor_balance,'closing',a.anchor_balance+sum(case l.direction when 'credit' then l.amount else -l.amount end),
      'last',(array_agg(l.balance_after order by l.posting_sequence desc))[1],'cache',(select outstanding_balance from public.suppliers where id='${f.supplier}'),
      'sameCreatedTime',count(distinct l.created_at)=1,'preTrustSupported',a.trusted_from-interval '1 microsecond'>=a.trusted_from,'postTrustSupported',bool_and(l.posting_effective_at>=a.trusted_from),
      'subOpening',(select balance_after from public.supplier_ledger_entries where supplier_id='${f.supplier}' and posting_effective_at<(select max(posting_effective_at) from public.supplier_ledger_entries where supplier_id='${f.supplier}') order by posting_sequence desc limit 1))
      from ledger_private.supplier_anchors a join public.supplier_ledger_entries l using(supplier_id) where supplier_id='${f.supplier}' group by a.anchor_balance,a.trusted_from)); rollback;`));
  const expected={opening:100,closing:130,last:130,cache:130,sameCreatedTime:true,preTrustSupported:false,postTrustSupported:true,subOpening:150};
  assert.deepEqual(result,{customer:expected,supplier:expected});
});
