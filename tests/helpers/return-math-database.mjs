import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {spawn,spawnSync} from 'node:child_process';

export const enabled = process.env.RUN_LOCAL_RETURN_MATH_DB === '1';
export function sql(query) {
  assert.match(process.env.LOCAL_SUPABASE_DB_CONTAINER ?? '', /^supabase_db_qa[0-9]+-[a-z0-9-]+$/);
  const r = spawnSync('docker', ['exec', '-i', process.env.LOCAL_SUPABASE_DB_CONTAINER,
    'psql', '-XqAt', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', '-'],
  {input:query, encoding:'utf8', maxBuffer:32*1024*1024});
  assert.equal(r.status, 0, r.stderr); return r.stdout.trim();
}
export const json = text => JSON.parse(text.split('\n').filter(s => s.startsWith('{')).at(-1));
export function signature(org) {
  const relations=['organizations','customers','products','product_stock_lots','invoices','invoice_items',
    'invoice_item_stock_allocations','payments','credit_payments','customer_write_offs','customer_ledger_entries',
    'returns','return_items','return_stock_allocations','return_item_source_allocations','invoice_payment_allocations',
    'stock_movements','audit_logs'];
  return `(select jsonb_object_agg(name,digest) from (${relations.map(table=>
    `select '${table}' name,md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]')) digest from public.${table} t where ${table==='organizations'?'id':'organization_id'}='${org}'`).join(' union all ')}
    union all select 'customer_anchors',md5(coalesce(jsonb_agg(to_jsonb(t) order by customer_id)::text,'[]')) from ledger_private.customer_anchors t where organization_id='${org}') relations)`;
}
export class Session {
  constructor() {
    assert.match(process.env.LOCAL_SUPABASE_DB_CONTAINER ?? '', /^supabase_db_qa[0-9]+-[a-z0-9-]+$/);
    this.stdout='';this.stderr='';this.pending=null;
    this.process=spawn('docker',['exec','-i',process.env.LOCAL_SUPABASE_DB_CONTAINER,
      'psql','-XqAt','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=0']);
    this.process.stdout.on('data',part=>{this.stdout+=part;this.check();});
    this.process.stderr.on('data',part=>{this.stderr+=part;});
    this.exited=new Promise(resolve=>this.process.on('exit',resolve));
  }
  check() {
    if(!this.pending)return;
    const index=this.stdout.indexOf(this.pending.marker+' '),end=this.stdout.indexOf('\n',index);
    if(index<0||end<0)return;
    const pending=this.pending;this.pending=null;
    const state=this.stdout.slice(index+pending.marker.length+1,end).trim();
    const text=this.stdout.slice(0,index);this.stdout=this.stdout.slice(end+1);
    pending.resolve({state,text});
  }
  run(query) {
    assert.equal(this.pending,null);
    return new Promise(resolve=>{
      const marker='QA_RETURN_'+randomUUID().replaceAll('-','');this.pending={resolve,marker};
      this.process.stdin.write(query+'\n\\echo '+marker+' :SQLSTATE\n');
    });
  }
  async ok(query) {const result=await this.run(query);assert.equal(result.state,'00000',this.stderr);return result;}
  async close() {this.process.stdin.end('rollback;\n\\q\n');await this.exited;}
}
export function fixture({initial=0, price=1000, cost=600, stock=10}={}) {
  const f=Object.fromEntries(['org','branch','actor','customer','product','lot','key'].map(k=>[k,randomUUID()]));
  f.auth=`set local request.jwt.claim.sub='${f.actor}';set local request.jwt.claim.role='authenticated';set local role authenticated;`;
  f.seed=`insert into public.organizations(id,name)values('${f.org}','Synthetic Return Math');
    insert into public.branches(id,organization_id,name)values('${f.branch}','${f.org}','Synthetic branch');
    insert into auth.users(id)values('${f.actor}');
    insert into public.profiles(id,organization_id,branch_id,full_name,role,is_active)values('${f.actor}','${f.org}','${f.branch}','Synthetic Owner','owner',true);
    insert into public.customers(id,organization_id,branch_id,name,outstanding_balance)values('${f.customer}','${f.org}','${f.branch}','Synthetic customer',${initial});
    insert into public.products(id,organization_id,name,type,sale_price,purchase_price,stock_quantity)values('${f.product}','${f.org}','Synthetic product','product',${price},${cost},${stock});
    insert into public.product_stock_lots(id,organization_id,branch_id,product_id,quantity_received,quantity_remaining,unit_cost,purchase_date)values('${f.lot}','${f.org}','${f.branch}','${f.product}',${stock},${stock},${cost},current_date);`;
  f.sale=({quantity=1,unitPrice=price,discount=0,cartDiscount=0,paid=unitPrice*quantity-discount-cartDiscount,walkIn=false,cart=null,key=f.key}={})=>
    `select public.pos_checkout('${f.branch}',${walkIn?'null':`'${f.customer}'`},'${JSON.stringify(cart??[{product_id:f.product,quantity,unit_price:unitPrice,discount}])}',${cartDiscount},'${paid===0?'customer_credit':'cash'}',${paid},null,null,false,'${key}');`;
  f.invoice=`(select id from public.invoices where organization_id='${f.org}' and checkout_idempotency_key='${f.key}')`;
  f.item=`(select id from public.invoice_items where invoice_id=${f.invoice} and product_id='${f.product}')`;
  f.return=({quantity=1,restock=quantity,key=randomUUID(),method='cash',invoice=f.invoice,item=f.item}={})=>
    `select public.create_invoice_return(${invoice},jsonb_build_array(jsonb_build_object('invoice_item_id',${item},'quantity',${quantity},'restock_quantity',${restock})),null,${method?`'${method}'`:'null'},null,null,'${key}');`;
  f.state=`select jsonb_build_object('credit',(select coalesce(sum(subtotal),0)from public.returns where organization_id='${f.org}'),
    'refund',(select coalesce(sum(refund_amount),0)from public.returns where organization_id='${f.org}'),
    'debt',(select coalesce(sum(debt_relief),0)from public.returns where organization_id='${f.org}'),
    'restored_cost',(select coalesce(sum(restored_cost),0)from public.returns where organization_id='${f.org}'),
    'stock',(select stock_quantity from public.products where id='${f.product}'),
    'balance',(select outstanding_balance from public.customers where id='${f.customer}'),
    'invoice',(select jsonb_build_object('paid',amount_paid,'due',balance_due,'status',status,'total',grand_total)from public.invoices where id=${f.invoice}),
    'ledger',(select coalesce(jsonb_agg(jsonb_build_array(direction,amount,balance_after)order by posting_sequence),'[]')from public.customer_ledger_entries where customer_id='${f.customer}'),
    'consumed',(select coalesce(sum(quantity),0)from public.return_item_source_allocations where organization_id='${f.org}'),
    'restocked',(select coalesce(sum(restock_quantity),0)from public.return_item_source_allocations where organization_id='${f.org}'),
    'return_count',(select count(*)from public.returns where organization_id='${f.org}'));`;
  f.cleanup=`${f.auth}select public.reset_organization_to_factory_defaults('${f.org}','${f.actor}',false);reset role;
    delete from public.profiles where id='${f.actor}';delete from public.branches where id='${f.branch}';
    delete from public.organizations where id='${f.org}';delete from auth.users where id='${f.actor}';`;
  return f;
}
export const attempt=`create function pg_temp.attempt(q text)returns jsonb language plpgsql as $$
declare msg text;state text;begin
  begin perform set_config('role','authenticated',true);execute q;state:='00000';
  exception when others then msg:=sqlerrm;state:=sqlstate;end;
  perform set_config('role','postgres',true);return jsonb_build_object('state',state,'message',msg);
end $$;`;

// Protected producer-origin large invoices: the ordinary checkout creates every
// source item and FIFO allocation. No raw posted-history/trust promotion.
export function largeInvoiceFixture(lines, {paid=lines}={}) {
  const f=fixture({price:1,cost:0,stock:lines});
  f.largeSale=f.sale({cart:Array.from({length:lines},()=>({product_id:f.product,quantity:1,unit_price:1,discount:0})),paid});
  f.fullPlan=`(select jsonb_agg(jsonb_build_object('invoice_item_id',id,'quantity',1,'restock_quantity',1) order by id) from public.invoice_items where invoice_id=${f.invoice})`;
  f.fullReturn=(key=randomUUID())=>`select public.create_invoice_return(${f.invoice},${f.fullPlan},null,'cash',null,null,'${key}');`;
  return f;
}
