
import {org,branch} from "./atomic-import-database.mjs";
let catalog;
export function loadFixtureCatalog(sql) {
 catalog={columns:JSON.parse(sql("select jsonb_agg(to_jsonb(c)) from information_schema.columns c where table_schema='public'"))};
}
export const tables=['product_categories','suppliers','customers','products','product_stock_lots','invoices','invoice_items','payments','credit_payments','customer_ledger_entries','customer_write_offs','returns','return_items','return_stock_allocations','supplier_purchases','supplier_purchase_items','supplier_payments','supplier_ledger_entries','supplier_write_offs','stock_movements','invoice_item_stock_allocations'];
export function countsFor(total,shape='mixed') {
 const weights={
  ledger:[1,5,20,10,15,20,40,20,5,450,1,3,6,6,10,20,10,350,1,25,40],
  sales:[1,5,20,20,40,100,200,100,10,80,1,10,20,20,10,20,10,20,1,210,200],
  supplier:[1,10,10,20,120,10,20,10,5,20,1,2,4,4,150,240,100,240,1,170,20],
  mixed:[1,5,20,20,40,80,160,80,10,100,1,8,16,16,40,80,30,70,1,190,160],
 }[shape];
 const sum=weights.reduce((a,b)=>a+b,0);
 const counts=Object.fromEntries(tables.map((t,i)=>[t,Math.max(1,Math.floor(total*weights[i]/sum))]));
 counts.customer_ledger_entries+=total-Object.values(counts).reduce((a,b)=>a+b,0);
 return counts;
}
const q=s=>"\x27"+s.replaceAll("\x27","\x27\x27")+"\x27";
const uid=(t,n)=>`md5('qa77126-${t}-'||(${n})::text)::uuid`;
const columns=t=>catalog.columns.filter(c=>c.table_name===t);
export function payload(t,c,noteBytes){
 const text=noteBytes>=0?`repeat('x',${noteBytes})`:`left((select string_agg(md5('qa77126-'||n||'-'||g),'') from generate_series(1,${Math.ceil(Math.abs(noteBytes)/32)}) g),${Math.abs(noteBytes)})`;
 const ref=(p,x='n')=>uid(p,`((${x})-1)%${c[p]}+1`);
 const itemN=`(n-1)%${c.invoice_items}+1`;
 const retN=`(n-1)%${c.returns}+1`;
 const retItemN=`(n-1)%${c.return_items}+1`;
 const special={id:uid(t,'n'),organization_id:q(org)+'::uuid',branch_id:q(branch)+'::uuid',name:`'QA44703 ${t} '||n`,outstanding_balance:'0::numeric',
  quantity:'1',quantity_received:'100',quantity_remaining:'50',stock_quantity:'50',amount:'10::numeric',balance_after:'0::numeric',
  unit_cost:'5::numeric',unit_price:'10::numeric',line_total:'10::numeric',purchase_price:'5::numeric',sale_price:'10::numeric',
  product_name:`'QA44703 product'`,item_name:`'QA44703 product'`,item_type:q('product'),
  method:q('cash'),reason:q('Synthetic capacity fixture'),direction:q(t==='supplier_ledger_entries'?'credit':'debit'),entry_type:q('adjustment'),
  movement_type:q('sale'),invoice_no:`'QA44703-I-'||n`,purchase_no:`'QA44703-P-'||n`,return_no:`'QA44703-R-'||n`,
  notes:text,description:text,note:text,
  customer_id:ref('customers'),supplier_id:ref('suppliers'),product_id:ref('products'),category_id:ref('product_categories'),
  stock_lot_id:ref('product_stock_lots'),invoice_id:ref('invoices'),invoice_item_id:ref('invoice_items'),
  purchase_id:ref('supplier_purchases'),payment_id:ref(t==='supplier_ledger_entries'?'supplier_payments':'payments'),
  credit_payment_id:ref('credit_payments'),return_id:ref('returns'),return_item_id:ref('return_items')};
 if(['invoice_item_stock_allocations','stock_movements'].includes(t))special.invoice_id=ref('invoices',itemN);
 if(t==='return_items'){special.invoice_id=ref('invoices',retN);special.invoice_item_id=ref('invoice_items',retN);}
 if(t==='return_stock_allocations')special.return_id=ref('returns',retItemN);
 const expressions=columns(t).map(col=>{
  let value=special[col.column_name];
  if(value===undefined){
   if(col.udt_name==='timestamptz')value="'2024-01-01T00:00:00Z'::timestamptz";
   else if(col.udt_name==='date')value="'2024-01-01'::date";
   else if(col.column_default)value=col.column_default;
   else if(col.is_nullable==='YES')value='NULL::'+(col.data_type==='USER-DEFINED'?'public.':'')+col.udt_name;
   else throw Error(`Missing fixture expression ${t}.${col.column_name}`);
  }
  return `${value} as ${col.column_name}`;
 });
 return `select ${expressions.join(',')} from generate_series(1,${c[t]}) n`;
}
