import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';

const enabled=process.env.RUN_LOCAL_SHOP_CURRENCY_DB==='1';
const target=process.env.LOCAL_SUPABASE_DB_CONTAINER;
function sql(q) {
  assert.match(target??'',/^supabase_db_qa[0-9]+-[a-z0-9-]+$/);
  const p=spawnSync('docker',['exec','-i',target,'psql','-XqAt','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-f','-'],{input:q,encoding:'utf8'});
  assert.equal(p.status,0,p.stderr);return p.stdout.trim();
}
function fixture(){
 const f=Object.fromEntries(['org','other','branch','actor','product','customer','supplier'].map(k=>[k,randomUUID()]));
 f.seed=`insert into public.organizations(id,name) values('${f.org}','Synthetic currency shop'),('${f.other}','Synthetic other shop');
 insert into public.branches(id,organization_id,name)values('${f.branch}','${f.org}','Local branch');
 insert into auth.users(id)values('${f.actor}');
 insert into public.profiles(id,organization_id,branch_id,full_name,role,is_active)values('${f.actor}','${f.org}','${f.branch}','Synthetic owner','owner',true);
 set local request.jwt.claim.sub='${f.actor}';set local request.jwt.claim.role='authenticated';`;
 return f;
}
const probe=`create function pg_temp.attempt(q text,r text default 'authenticated')returns text language plpgsql as $$
 declare v_message text;begin
 begin perform set_config('role',r,true);execute q;v_message:='ALLOWED';exception when others then v_message:=sqlerrm;end;
 perform set_config('role','postgres',true);return v_message;end $$;`;
const lockMessage='Currency is locked because this shop already has financial activity. Changing it would make historical amounts incorrect.';

test('empty shop changes only currency metadata; exact existing Owner/Admin authorization and cross-org containment', {skip:!enabled},()=>{
 const f=fixture();const result=sql(`begin;${f.seed}${probe}
 create function pg_temp.matrix()returns jsonb language plpgsql as $$declare r text;v_prior text;v_after text;v_result text;begin
 foreach r in array array['owner','admin','manager','cashier','technician']loop
 update public.profiles set role=r::public.user_role where id='${f.actor}';
 select currency_code into v_prior from public.organizations where id='${f.org}';
 v_result:=pg_temp.attempt('update public.organizations set currency_code=case currency_code when ''USD'' then ''EUR'' else ''USD'' end where id=''${f.org}''');
 if v_result<>'ALLOWED' then raise exception 'Unexpected SQL denial';end if;
 select currency_code into v_after from public.organizations where id='${f.org}';
 if r in('owner','admin') and v_after=v_prior then raise exception 'Authorized currency save failed';end if;
 if r not in('owner','admin') and v_after<>v_prior then raise exception 'Settings authorization broadened';end if;
 end loop;
 update public.profiles set role='owner' where id='${f.actor}';
 perform pg_temp.attempt('update public.organizations set currency_code=''USD'' where id=''${f.other}''');
 if exists(select from public.organizations where id='${f.other}' and currency_code<>'PKR')then raise exception 'Cross org bypass';end if;
 if pg_temp.attempt('update public.organizations set currency_code=''KWD'' where id=''${f.org}''')<>'Choose a supported shop currency.'then raise exception 'Unsupported currency accepted';end if;
 if exists(select from public.organizations where id='${f.org}' and currency_locked_at is not null)then raise exception 'Empty shop locked';end if;
 return jsonb_build_object('ownerAdminAllowed',true,'otherRolesRlsNoop',true,'crossOrgUnchanged',true,'emptyChangesNoFinancialRows',true);
 end $$;select pg_temp.matrix();rollback;`);
 assert.match(result,/"ownerAdminAllowed": true/);
});

for(const kind of ['expense','repair_quote','repair_advance','repair_final','cash_shift','daily_closing','stock','customer_balance','supplier_balance']){
 test(`${kind}: first material financial activity locks currency even for Owner/Admin/service_role; deleting activity never unlocks`,{skip:!enabled},()=>{
  const f=fixture();
  const inserts={
   expense:`insert into public.expenses(organization_id,branch_id,amount)values('${f.org}','${f.branch}',100);`,
   repair_quote:`insert into public.repairs(organization_id,branch_id,job_no,customer_name,problem_description,estimated_cost)values('${f.org}','${f.branch}','REP-CURRENCY','Synthetic','Local',100);`,
   repair_advance:`insert into public.repairs(organization_id,branch_id,job_no,customer_name,problem_description,advance_paid)values('${f.org}','${f.branch}','REP-CURRENCY','Synthetic','Local',100);`,
   repair_final:`insert into public.repairs(organization_id,branch_id,job_no,customer_name,problem_description,final_cost)values('${f.org}','${f.branch}','REP-CURRENCY','Synthetic','Local',100);`,
   cash_shift:`insert into public.cash_shifts(organization_id,branch_id,opened_by,starting_cash)values('${f.org}','${f.branch}','${f.actor}',0);`,
   daily_closing:`insert into public.daily_closings(organization_id,branch_id,closing_date)values('${f.org}','${f.branch}',current_date);`,
   stock:`insert into public.products(organization_id,name,stock_quantity,purchase_price)values('${f.org}','Synthetic opening stock',10,100);`,
   customer_balance:`insert into public.customers(organization_id,name,outstanding_balance)values('${f.org}','Synthetic balance',100);`,
   supplier_balance:`insert into public.suppliers(organization_id,name,outstanding_balance)values('${f.org}','Synthetic balance',100);`,
  };
  const result=sql(`begin;${f.seed}${inserts[kind]}${probe}
  create function pg_temp.check_lock()returns jsonb language plpgsql as $$declare r text;v_result text;begin
   foreach r in array array['owner','admin','service_role']loop
    if r<>'service_role'then update public.profiles set role=r::public.user_role where id='${f.actor}';end if;
    v_result:=pg_temp.attempt('update public.organizations set currency_code=''USD'' where id=''${f.org}''',case when r='service_role'then r else 'authenticated' end);
    if v_result<>'${lockMessage}'then raise exception 'History bypass: % %',r,v_result;end if;
    if pg_temp.attempt('update public.organizations set currency_locked_at=null where id=''${f.org}''',case when r='service_role'then r else 'authenticated' end)<>'The shop currency safety lock cannot be changed.'then raise exception 'Lock tamper allowed';end if;
   end loop;
   if not exists(select from public.organizations where id='${f.org}' and currency_code='PKR' and currency_locked_at is not null)then raise exception 'History relabelled';end if;
   return jsonb_build_object('deniedRoles',3,'codeUnchanged',true,'lockTamperDenied',true);
  end $$;select pg_temp.check_lock();
  ${kind==='expense'?`delete from public.expenses where organization_id='${f.org}';select pg_temp.attempt('update public.organizations set currency_code=''USD'' where id=''${f.org}''','service_role');`:''}
  rollback;`);
  assert.match(result,/"deniedRoles": 3/);
  if(kind==='expense')assert.ok(result.endsWith(lockMessage));
 });
}
test('zero accounts, financially empty repair and service/catalog prices do not lock; failed financial transaction leaves no lock', {skip:!enabled},()=>{
 const f=fixture();assert.equal(sql(`begin;${f.seed}
 insert into public.customers(organization_id,name)values('${f.org}','Zero account');
 insert into public.suppliers(organization_id,name)values('${f.org}','Zero supplier');
 insert into public.products(organization_id,name,type,sale_price)values('${f.org}','Catalog only','service',1250);
 insert into public.repairs(organization_id,branch_id,job_no,customer_name,problem_description)values('${f.org}','${f.branch}','REP-ZERO','Synthetic','No money');
 savepoint financial;insert into public.expenses(organization_id,branch_id,amount)values('${f.org}','${f.branch}',100);rollback to financial;
 update public.organizations set currency_code='USD' where id='${f.org}';update public.organizations set currency_code='EUR' where id='${f.org}';
 select currency_code||':'||(currency_locked_at is null)::text from public.organizations where id='${f.org}';rollback;`),'EUR:true');
});

function session(name){
 assert.match(target??'',/^supabase_db_qa[0-9]+-[a-z0-9-]+$/);
 const p=spawn('docker',['exec','-i',target,'psql','-XqAt','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{stdio:['pipe','pipe','pipe']});
 let output='';p.stdout.on('data',x=>output+=x);p.stderr.on('data',x=>output+=x);
 const done=new Promise(resolve=>p.on('exit',code=>resolve({code,output})));
 p.stdin.write(`set application_name='${name}';\n`);return{p,done,output:()=>output};
}
async function waitFor(predicate){const end=Date.now()+10000;while(Date.now()<end){if(predicate())return;await new Promise(r=>setTimeout(r,25));}throw Error('Local synchronization timeout');}
test('first-activity races serialize both orders; stale REPEATABLE READ cannot relabel committed history', {skip:!enabled,timeout:60000},async()=>{
 for(const order of ['activity-first','currency-first','repeatable-read']){
  const f=fixture();sql(`begin;${f.seed}commit;`);const name='qa53172-'+randomUUID();let a,b;
  try{
   if(order==='repeatable-read'){
    b=session(name);b.p.stdin.write(`begin isolation level repeatable read;select currency_code from public.organizations where id='${f.org}';select 'SNAPSHOT_READY';\n`);
    await waitFor(()=>b.output().includes('SNAPSHOT_READY'));
    sql(`insert into public.expenses(organization_id,branch_id,amount)values('${f.org}','${f.branch}',100);`);
    b.p.stdin.end(`update public.organizations set currency_code='USD'where id='${f.org}';commit;`);
    const result=await b.done;assert.notEqual(result.code,0);assert.match(result.output,/could not serialize access/);
   }else{
    a=session(name+'a');b=session(name+'b');
    const activity=`insert into public.expenses(organization_id,branch_id,amount)values('${f.org}','${f.branch}',100);`;
    const change=`update public.organizations set currency_code='USD'where id='${f.org}';`;
    a.p.stdin.write(`begin;${order==='activity-first'?activity:change}select 'FIRST_READY';\n`);
    await waitFor(()=>a.output().includes('FIRST_READY'));
    b.p.stdin.end(`begin;${order==='activity-first'?change:activity}commit;`);
    await waitFor(()=>sql(`select exists(select from pg_stat_activity where application_name='${name}b'and wait_event_type='Lock');`)==='t');
    a.p.stdin.end('commit;');assert.equal((await a.done).code,0);
    const result=await b.done;
    if(order==='activity-first'){assert.notEqual(result.code,0);assert.match(result.output,/Currency is locked/);}
    else assert.equal(result.code,0,result.output);
   }
   assert.equal(sql(`select currency_code||':'||(currency_locked_at is not null)::text from public.organizations where id='${f.org}';`),`${order==='currency-first'?'USD':'PKR'}:true`);
  }finally{
   for(const s of [a,b])if(s&&!s.p.killed){s.p.stdin.end('rollback;');await s.done;}
   sql(`delete from public.expenses where organization_id='${f.org}';delete from public.profiles where id='${f.actor}';delete from auth.users where id='${f.actor}';delete from public.organizations where id in('${f.org}','${f.other}');`);
  }
 }
});

test('all 27 audited relations have insert/update guards; trigger authority is private and existing authorization policies are intact',{skip:!enabled},()=>{
 assert.equal(sql(`select count(*) from pg_trigger where not tgisinternal and tgname in('lock_currency_insert','lock_currency_update');`),'56');
 assert.equal(sql(`select count(*) from pg_trigger where not tgisinternal and tgname='lock_currency_insert'
  and tgrelid in('public.invoice_payment_allocations'::regclass,'public.return_item_source_allocations'::regclass);`),'2');
 assert.equal(sql(`select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='currency_private' and (has_function_privilege('authenticated',p.oid,'EXECUTE') or has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('service_role',p.oid,'EXECUTE'));`),'0');
 assert.equal(sql(`select count(*)from pg_policies where schemaname='public'and tablename='organizations'and policyname='Owners and admins can update their organization';`),'1');
});
