import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import test from 'node:test';
import ts from 'typescript';
import { loadMoneyModule } from './helpers/load-money-module.mjs';

const component=readFileSync('src/app/pos/pos-money-input.tsx','utf8');
const output=ts.transpileModule(component,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const exported={};
vm.runInNewContext(output,{exports:exported,require:name=>{
  if(name==='react')return{useState:()=>[null,()=>{}]};
  if(name==='react/jsx-runtime')return{jsx:(_type,props)=>props};
  throw Error('Unexpected dependency '+name);
}});

for(const [draft,expected] of [['',0],['.',0],['0',0],['2',2],['20',20],['200',200],['0.',0],['0.5',0.5],['2.50',2.5],['.5',0.5]]){
  test('money draft '+JSON.stringify(draft)+' remains numeric '+expected,()=>assert.equal(exported.parseMoneyDraft(draft),expected));
}
for(const invalid of ['-1','-0.5','NaN','Infinity','1e2','2..5','abc','9'.repeat(400)]){
  test('reject invalid/negative/non-finite draft '+invalid.slice(0,30),()=>assert.equal(exported.parseMoneyDraft(invalid),null));
}
test('editor keeps decimal lexical draft and clears only an exactly-zero value on focus',()=>{
  assert.match(component,/value === 0 \? "" : String\(value\)/);
  assert.match(component,/setDraft\(next\)/);
  assert.match(component,/onValueChange\(numeric\)/);
  assert.match(component,/onBlur=\{\(\) => setDraft\(null\)\}/);
  assert.match(component,/inputMode="decimal"/);
  assert.doesNotMatch(component,/select\(|setTimeout|parseInt/);
});
test('the three numeric cart editors reset per bill; money arithmetic and payload types are preserved',()=>{
  const source=readFileSync('src/app/pos/pos-client.tsx','utf8');
  assert.equal((source.match(/<PosMoneyInput/g)??[]).length,3);
  assert.equal((source.match(/key=\{activeTab.id\}/g)??[]).length,3);
  assert.match(source,/lineMoney\(l.unit_price, l.quantity, l.discount\)/);
  assert.match(source,/Math\.max\(subtractMoney\(subtotal, discountTotal \|\| 0\), 0\)/);
  assert.match(source,/discount_total: discountTotal/);
  assert.match(source,/discount: l.discount/);
});
test('decimal-safe checkout/service fingerprints and unchanged idempotency/quantity/customer boundaries',()=>{
  const source=readFileSync('src/app/pos/pos-client.tsx','utf8');
  const file=ts.createSourceFile('pos.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const expected={
    checkoutPayloadFingerprint:'81f85847aa4c3f2187b53b9f8e10bafaf4e87004f9db60457a5ba53004b65872',
    updateLineService:'47c218a3c9333fa02de1fa43b3a8a39167d0c2d84ef58b9db19da924f97ff782',
    updateQty:'0ca2fd12696805776ec965b148a198e9c6be6d9c353bb8f45728db7c65b1abf7',
    checkout:'2ba40b44bbbc783ffd75fe1cdaac876ae492f54d535799c845c908a10428d8c8',
    createCustomer:'2e48967f9c5d5d756be7d488082d89f5d9241cb42486415246ad2038a700e89d',
  };
  const actual={};
  function walk(node){
    if(ts.isFunctionDeclaration(node)&&node.name&&node.name.text in expected){
      actual[node.name.text]=createHash('sha256').update(node.getText(file)).digest('hex');
    }
    ts.forEachChild(node,walk);
  }
  walk(file);assert.deepEqual(actual,expected);
});
test('A4 white rule is invoice/mode scoped, natural document pagination uses existing shell contract',()=>{
  const css=readFileSync('src/app/globals.css','utf8');
  assert.match(css,/body\[data-print-mode="a4"\]:has\(#invoice-print\) :is\([\s\S]*?\[data-app-shell-root\][\s\S]*?background: #ffffff !important;/);
  assert.match(css,/body\[data-print-mode="a4"\]:has\(#invoice-print\) \{\s+transition: none !important;/);
  const page=readFileSync('src/app/invoices/[id]/page.tsx','utf8');
  assert.match(page,/mainClassName="[^"]*print:p-0"\s+printFullDocument/);
  const button=readFileSync('src/app/invoices/[id]/print-button.tsx','utf8');
  assert.match(button,/document.body.dataset.printMode = "a4"/);
  assert.match(button,/delete document.body.dataset.printMode/);
  assert.match(button,/Print A4 \/ Save PDF/);
  assert.match(button,/Print \/ Save as PDF/);
  assert.match(button,/Print 80mm/);
});

const tabs = loadMoneyModule('src/app/pos/use-pos-tabs.ts', { react: {} }, '\nexport { tabsReducer };');
const schema = loadMoneyModule('src/lib/validation/pos.ts').heldBillPayloadSchema;
test('held bills store and resume the explicit numeric cart discount without changing totals', () => {
  const cart = [{ product: { id: '550e8400-e29b-41d4-a716-446655440000', type: 'product' }, quantity: 1, unit_price: 999, discount: 0.5 }];
  const payload = tabs.buildHeldBillPayload({ cart, discountTotal: 2.5, customerId: '' });
  const parsed = schema.safeParse(payload);
  assert.equal(parsed.success, true);
  assert.equal(parsed.data.totals_snapshot.discount_total, 2.5);
  assert.equal(parsed.data.totals_snapshot.grand_total, 996);
  const resumed = tabs.tabsReducer({ tabs: [], activeId: '' }, { type: 'resume', heldBillId: 'synthetic-held-id', cart, discountTotal: tabs.heldBillDiscountTotal(parsed.data.totals_snapshot) });
  assert.equal(resumed.tabs[0].discountTotal, 2.5);
  assert.equal(resumed.tabs[0].cart[0].discount, 0.5);
});
test('legacy held bills default only the absent cart discount to zero; corrupt snapshots are not inferred', () => {
  for (const snapshot of [null, undefined, { grand_total: 990 }, { discount_total: '2.5' }, { discount_total: -1 }, { discount_total: NaN }, { discount_total: Infinity }]) {
    assert.equal(tabs.heldBillDiscountTotal(snapshot), 0);
  }
  for (const discount of [0, 2, 200, 0.5, 2.5]) assert.equal(tabs.heldBillDiscountTotal({ discount_total: discount }), discount);
});
test('held-bill server validation rejects invalid discount types and permits old snapshots', () => {
  const payload = { cart: [{ product_id: '550e8400-e29b-41d4-a716-446655440000', quantity: 1, unit_price: 999, discount: 0 }], totals_snapshot: { item_count: 1, grand_total: 999 } };
  assert.equal(schema.safeParse(payload).success, true);
  for (const discount_total of ['0200', -1, NaN, Infinity]) assert.equal(schema.safeParse({ ...payload, totals_snapshot: { ...payload.totals_snapshot, discount_total } }).success, false);
});
