import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { loadMoneyModule } from './helpers/load-money-module.mjs';

const money = loadMoneyModule('src/lib/money.ts');
const customer = loadMoneyModule('src/lib/validation/customers.ts');
const supplier = loadMoneyModule('src/lib/validation/supplier-purchases.ts');
const pos = loadMoneyModule('src/lib/validation/pos.ts');
const tabs = loadMoneyModule('src/app/pos/use-pos-tabs.ts', { react: {} }, '\nexport { tabsReducer };');
const id = '35806000-0000-4000-8000-000000000101';

for (const [input, paisa] of [['0.01',1n],['0.10',10n],['1.23',123n],['1.230',123n],['1.2300',123n],['.010',1n],['1e-2',1n],['0',0n],['999999.99',99999999n]]) {
  test(`exact decimal input ${input}`, () => assert.equal(money.moneyToMinorUnits(input), paisa));
}
for (const input of ['0.001','0.004','0.005','0.009','0.014','0.015','0.019','1.234','1.2300000000000000001',550.3000000000001,NaN,Infinity,null,'','not-money']) {
  test(`reject meaningful sub-paisa or invalid input ${String(input)}`, () => assert.equal(money.moneyToMinorUnits(input), null));
}
for (const [a,b,expected] of [['500.10','50.20','550.30'],['0.10','0.20','0.30'],['999.99','0.01','1000.00'],['0.01','0.01','0.02']]) {
  test(`derived ${a} + ${b} = ${expected}`, () => {
    const result = money.sumMoney([a,b]);
    assert.equal(money.formatMinorUnits(money.moneyToMinorUnits(result)), expected);
    assert.equal(JSON.stringify(result), String(Number(expected)));
  });
}
test('exact subtraction, quantity, discount and bounded overflow', () => {
  assert.equal(money.subtractMoney(100,0.02),99.98);
  assert.equal(money.multiplyMoney(0.1,3),0.3);
  assert.equal(money.lineMoney(500.1,2,50.2),950);
  assert.equal(money.lineMoney(1,1,2),0);
  assert.ok(Number.isNaN(money.sumMoney(['.015'])));
  assert.ok(Number.isNaN(money.multiplyMoney(1,0.5)));
  assert.ok(Number.isNaN(money.sumMoney(['9999999999.99','.01'])));
});
for (const [name,schema,base] of [
  ['customer payment',customer.creditPaymentSchema,{method:'cash'}],
  ['customer write-off',customer.writeOffSchema,{reason:'QA precision'}],
  ['supplier payment',supplier.recordPaymentSchema,{supplier_id:id,method:'cash'}],
]) {
  test(`${name} catches submitted decimal precision before conversion`, () => {
    for (const amount of ['0.01','0.10','1.23','1.230']) assert.equal(schema.safeParse({...base,amount}).success,true,amount);
    for (const amount of ['0.015','1.234','1.2300000000000000001']) {
      const result=schema.safeParse({...base,amount});
      assert.equal(result.success,false,amount);
      assert.equal(result.error.issues[0].message,money.MONEY_PRECISION_MESSAGE);
    }
  });
}
test('supplier purchase uses exact derived subtotal, payment and balance semantics', () => {
  const input={supplier_id:id,items:[{product_id:id,quantity:1,unit_cost:'500.10'},{product_id:id,quantity:1,unit_cost:'50.20'}],amount_paid:'550.30'};
  assert.equal(supplier.createPurchaseSchema.safeParse(input).success,true);
  assert.equal(supplier.createPurchaseSchema.safeParse({...input,amount_paid:'550.31'}).success,false);
  assert.equal(supplier.createPurchaseSchema.safeParse({...input,amount_paid:'0.015'}).success,false);
});
test('service money survives held payload, resume and bill switching without drift', () => {
  const product={id,type:'service',name:'QA service'};
  const service={...tabs.EMPTY_SERVICE,principal:'500.10',commission:'50.20'};
  const total=tabs.serviceTotalCharged(service);
  assert.equal(total,550.3);
  const cart=[{product,service,quantity:1,unit_price:total,discount:0}];
  const payload=tabs.buildHeldBillPayload({cart,discountTotal:0,customerId:''});
  assert.equal(payload.cart[0].service_total_charged,550.3);
  assert.equal(payload.totals_snapshot.grand_total,550.3);
  assert.equal(pos.heldBillPayloadSchema.safeParse(payload).success,true);
  assert.doesNotMatch(JSON.stringify(payload),/550\.3000000000001/);
  const restored=tabs.heldItemsToCart([product],payload.cart);
  assert.equal(restored[0].unit_price,550.3);
  const state=tabs.tabsReducer({tabs:[],activeId:''},{type:'resume',heldBillId:id,cart:restored});
  assert.equal(state.tabs[0].cart[0].unit_price,550.3);
  assert.equal(pos.checkoutSchema.safeParse({cart:payload.cart,amount_paid:0,payment_method:'customer_credit',customer_id:id,idempotency_key:id}).success,true);
  assert.equal(pos.cartItemSchema.safeParse({...payload.cart[0],service_transaction_amount:'0.015'}).success,false);
});
test('supplier write-off checks raw form value, and all four amount inputs retain paisa step', () => {
  const action=readFileSync('src/app/suppliers/purchases/actions.ts','utf8');
  assert.match(action,/moneyToMinorUnits\(submittedAmount\)/);
  for(const path of ['src/app/customers/[id]/settlement-form.tsx','src/app/customers/[id]/write-off-form.tsx','src/app/suppliers/purchases/[id]/record-payment-form.tsx','src/app/suppliers/[id]/ledger/supplier-write-off-form.tsx']) {
    assert.match(readFileSync(path,'utf8'),/step="0\.01"/);
  }
});

test('all four actual Actions reject sub-paisa before opening a mutation client', async () => {
  let clients=0;
  const mocks={
    'next/cache':{revalidatePath(){}},'next/navigation':{redirect(){throw Error('Unexpected redirect');}},
    '@/lib/supabase/server':{createClient(){clients++;throw Error('Mutation client reached');}},
    '@/lib/auth/session':{getCurrentContext:async()=>({user:{id},profile:{id,role:'owner',organization_id:id,branch_id:id}})},
    '@/lib/permissions':{canWriteCatalog:()=>true,canManageSupplierPurchases:()=>true,canManageSupplierWriteOffs:()=>true},
    '@/lib/audit':{logAudit(){throw Error('Audit reached');}},
    '@/lib/errors/safe-action-error':{},
  };
  const customers=loadMoneyModule('src/app/customers/actions.ts',mocks);
  const suppliers=loadMoneyModule('src/app/suppliers/purchases/actions.ts',mocks);
  for(const amount of ['0.015','1.2300000000000000001']){
    const form=new FormData();
    for(const [key,value] of Object.entries({customer_id:id,supplier_id:id,purchase_id:'',amount,method:'cash',reason:'QA precision'}))form.set(key,value);
    for(const action of [customers.recordCreditPaymentAction,customers.recordWriteOffAction,suppliers.recordSupplierPaymentAction]){
      const result=await action({},form);
      assert.equal(result.error,money.MONEY_PRECISION_MESSAGE);
    }
    assert.equal((await suppliers.recordSupplierWriteOffAction(id,amount,'QA precision')).error,money.MONEY_PRECISION_MESSAGE);
  }
  assert.equal(clients,0);
});
