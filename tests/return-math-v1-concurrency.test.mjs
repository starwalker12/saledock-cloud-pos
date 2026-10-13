import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,sql,json,Session,enabled} from './helpers/return-math-database.mjs';
import {setTimeout as delay} from 'node:timers/promises';

async function race(first,second,options={}) {
  const f=fixture(options),a=new Session(),b=new Session();
  sql(`begin;${f.seed}${f.auth}${f.sale({quantity:options.quantity??1,paid:options.paid??0})}commit;`);
  let waiting;
  try {
    await a.ok(`begin;${f.auth}${first(f)}`);
    waiting=b.run(`begin;set application_name='qa24637-return-race';${f.auth}${second(f)}`);
    if(options.expectWait!==false){
      let blocked=false;
      for(let i=0;i<100&&!blocked;i++) {
        blocked=sql("select exists(select 1 from pg_stat_activity where application_name='qa24637-return-race' and wait_event_type='Lock')")==='t';
        if(!blocked)await delay(10);
      }
      assert.equal(blocked,true,'Real second session must wait on the first transaction');
    }
    const immediate=options.expectWait===false?await waiting:null;
    await a.ok('commit;');
    const result=immediate??await waiting;
    await b.ok(result.state==='00000'?'commit;':'rollback;');
    return {result,state:json(sql(f.state))};
  } finally {
    await a.close();await b.close();sql(`begin;${f.cleanup}commit;`);
  }
}

test('two simultaneous returns cannot consume four units from a sale of three',{skip:!enabled,timeout:30000},async()=>{
  const r=await race(f=>f.return({quantity:2}),f=>f.return({quantity:2}),{quantity:3,paid:3000});
  assert.equal(r.result.state,'P0001');assert.equal(r.state.return_count,1);assert.equal(r.state.consumed,2);
  assert.equal(r.state.restocked,2);assert.equal(r.state.refund,2000);
});

test('two serialized partial returns consume each original slot once and conserve entitlement',{skip:!enabled,timeout:30000},async()=>{
  const r=await race(f=>f.return({quantity:1,restock:0}),f=>f.return({quantity:2,restock:1}),{quantity:3,paid:3000});
  assert.equal(r.result.state,'00000');assert.equal(r.state.return_count,2);
  assert.equal(r.state.consumed,3);assert.equal(r.state.restocked,1);assert.equal(r.state.refund,3000);
});

test('payment before return becomes proven entitlement; return before payment cannot double-settle debt',{skip:!enabled,timeout:30000},async()=>{
  const pay=f=>`select public.record_credit_payment('${f.customer}',1000,'cash',null,null);`;
  const paymentFirst=await race(pay,f=>f.return());
  assert.equal(paymentFirst.result.state,'00000');assert.equal(paymentFirst.state.refund,1000);
  assert.equal(paymentFirst.state.debt,0);assert.equal(paymentFirst.state.balance,0);
  const returnFirst=await race(f=>f.return(),pay);
  assert.equal(returnFirst.result.state,'P0001');assert.equal(returnFirst.state.refund,0);
  assert.equal(returnFirst.state.debt,1000);assert.equal(returnFirst.state.balance,0);
});

test('a payment paused after its customer lock cannot deadlock Return on organization foreign keys',{skip:!enabled,timeout:30000},async()=>{
  const f=fixture(),a=new Session(),b=new Session();
  sql(`begin;${f.seed}${f.auth}${f.sale({paid:0})}commit;`);
  try{
    await a.ok(`begin;select id from public.customers where id='${f.customer}' for update;`);
    const waiting=b.run(`begin;set application_name='qa24637-mid-payment';${f.auth}${f.return()}`);
    let blocked=false;
    for(let i=0;i<100&&!blocked;i++){
      blocked=sql("select exists(select 1 from pg_stat_activity where application_name='qa24637-mid-payment' and wait_event_type='Lock')")==='t';
      if(!blocked)await delay(10);
    }
    assert.equal(blocked,true);
    await a.ok(`${f.auth}select public.record_credit_payment('${f.customer}',1000,'cash',null,null);`);
    await a.ok('commit;');
    assert.equal((await waiting).state,'00000');await b.ok('commit;');
    const state=json(sql(f.state));
    assert.equal(state.refund,1000);assert.equal(state.debt,0);assert.equal(state.balance,0);
  }finally{await a.close();await b.close();sql(`begin;${f.cleanup}commit;`);}
});

test('write-off first blocks ambiguity; return first leaves only unrelated receivable for write-off',{skip:!enabled,timeout:30000},async()=>{
  const writeoff=f=>`select public.record_customer_write_off('${f.customer}',100,'Synthetic forgiveness');`;
  const first=await race(writeoff,f=>f.return(),{initial:500});
  assert.equal(first.result.state,'P0001');assert.equal(first.state.return_count,0);assert.equal(first.state.balance,1400);
  const second=await race(f=>f.return(),writeoff,{initial:500});
  assert.equal(second.result.state,'00000');assert.equal(second.state.debt,1000);assert.equal(second.state.refund,0);
  assert.equal(second.state.balance,400);
});

test('Factory Reset is bounded and mutation-free while a Return or actual-payment allocation is in flight',{skip:!enabled,timeout:30000},async()=>{
  const reset=f=>`select public.reset_organization_to_factory_defaults('${f.org}','${f.actor}',false);`;
  const returned=await race(f=>f.return(),reset,{expectWait:false});
  assert.equal(returned.result.state,'PT409');assert.equal(returned.state.return_count,1);
  assert.equal(returned.state.debt,1000);assert.equal(returned.state.consumed,1);
  const paid=await race(f=>`select public.record_credit_payment('${f.customer}',1000,'cash',null,null);`,reset,{expectWait:false});
  assert.equal(paid.result.state,'PT409');assert.equal(paid.state.invoice.paid,1000);
  assert.equal(paid.state.balance,0);assert.equal(paid.state.return_count,0);
});

for(const paid of [0,250])for(const replay of [false,true])test(`250-line overlapping concurrent Returns: ${paid?'paid refund':'debt relief'}, ${replay?'same-key replay':'over-return rejected'}`,{skip:!enabled,timeout:120000},async()=>{
  const {largeInvoiceFixture}=await import('./helpers/return-math-database.mjs');
  const {randomUUID}=await import('node:crypto');const f=largeInvoiceFixture(250,{paid}),a=new Session(),b=new Session(),key=randomUUID();
  sql(`begin;${f.seed}${f.auth}${f.largeSale}commit;`);
  try {
    await a.ok(`begin;${f.auth}${f.fullReturn(key)}`);
    const pending=b.run(`begin;set application_name='qa65784-large-return';${f.auth}${f.fullReturn(replay?key:randomUUID())}`);
    let blocked=false;for(let i=0;i<100&&!blocked;i++){
      blocked=sql("select exists(select 1 from pg_stat_activity where application_name='qa65784-large-return'and wait_event_type='Lock')")==='t';
      if(!blocked)await delay(10);
    }
    assert(blocked);await a.ok('commit;');const response=await pending;
    assert.equal(response.state,replay?'00000':'P0001');await b.ok(replay?'commit;':'rollback;');
    const state=json(sql(f.state));assert.equal(state.return_count,1);assert.equal(state.refund,paid);assert.equal(state.debt,250-paid);
    assert.equal(state.balance,0);
    assert.equal(state.consumed,250);assert.equal(state.restocked,250);assert.equal(state.stock,250);
    assert.equal(sql(`select count(distinct invoice_item_id)from public.return_items where organization_id='${f.org}'`),'250');
  }finally{await a.close();await b.close();sql(`begin;${f.cleanup}commit;`);}
});
