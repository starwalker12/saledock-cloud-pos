import test from 'node:test';
import assert from 'node:assert/strict';
import { loadMoneyModule } from './helpers/load-money-module.mjs';

const { allocateReturnBasis, cumulativeReturnCredit, previewReturnSettlement, parseReturnQuantity } = loadMoneyModule('src/lib/return-math.ts');
const { returnRevenueCredit, calculateEstimatedNetProfit } = loadMoneyModule('src/lib/return-profit.ts');
const { createReturnSchema } = loadMoneyModule('src/lib/validation/returns.ts');
const { moneyToMinorUnits } = loadMoneyModule('src/lib/money.ts');

test('five paisa over three units gives 1, 2, 2 paisa, never six', () => {
  assert.deepEqual([0, 1, 2].map(k => cumulativeReturnCredit(5n, 3, k, 1)), [1n, 2n, 2n]);
  assert.throws(() => cumulativeReturnCredit(5n, 3, 2, 2));
});

test('largest-remainder allocation is stable on immutable item ID, not display order', () => {
  const lines = ['c', 'a', 'b'].map(id => ({ id, lineMinor: 100n, quantity: 1 }));
  const expected = new Map([['a', 99n], ['b', 100n], ['c', 100n]]);
  assert.deepEqual(allocateReturnBasis(lines, 299n), expected);
  assert.deepEqual(allocateReturnBasis(lines.toReversed(), 299n), expected);
});

test('10,000 generated integer-paisa invoices conserve discounts and all partial credits', () => {
  let seed = 24637;
  const next = maximum => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % maximum; };
  for (let sample = 0; sample < 10000; sample++) {
    const lines = Array.from({ length: 1 + next(12) }, (_, i) => ({ id: String(i).padStart(3, '0'),
      lineMinor: BigInt(next(100000000)), quantity: 1 + next(80) }));
    const total = lines.reduce((sum, line) => sum + line.lineMinor, 0n);
    const discount = total === 0n ? 0n : BigInt(next(1000000)) % (total + 1n);
    const nets = allocateReturnBasis(lines, total - discount);
    assert.equal([...nets.values()].reduce((sum, value) => sum + value, 0n), total - discount);
    assert.equal(lines.reduce((sum, line) => sum + line.lineMinor - nets.get(line.id), 0n), discount);
    for (const line of lines) {
      const net = nets.get(line.id);
      let credited = 0n;
      assert.equal(cumulativeReturnCredit(net, line.quantity, 0, 0), 0n);
      for (let k = 0; k < line.quantity; k++) {
        const credit = cumulativeReturnCredit(net, line.quantity, k, 1);
        assert.ok(credit >= 0n); credited += credit; assert.ok(credited <= net);
      }
      assert.equal(credited, net);
      assert.equal(cumulativeReturnCredit(net, line.quantity, 0, line.quantity), net);
      const due = next(10000);
      const settlement = previewReturnSettlement(net, `${Math.floor(due / 100)}.${String(due % 100).padStart(2, '0')}`);
      assert.equal(moneyToMinorUnits(settlement.debt) + moneyToMinorUnits(settlement.refund), net);
    }
  }
});

test('V1 revenue reverses credit, cash remains actual refund, legacy interpretation remains unchanged', () => {
  assert.equal(returnRevenueCredit({ return_math_version: 1, subtotal: 1000, refund_amount: 0 }), 1000);
  assert.equal(returnRevenueCredit({ return_math_version: null, subtotal: 1000, refund_amount: 200 }), 200);
  assert.equal(calculateEstimatedNetProfit({ grossProfit: 400, expenses: 0, refunds: 0, returnCredits: 1000, restoredProductCost: 600 }), 0);
  assert.equal(calculateEstimatedNetProfit({ grossProfit: 400, expenses: 0, refunds: 1000, returnCredits: 1000, restoredProductCost: 0 }), -600);
});

test('Daily Closing and Cash Drawer count actual cash refunds, never V1 credit or debt relief', async () => {
  const rows={returns:[
    {return_math_version:1,subtotal:1000,debt_relief:1000,refund_amount:0,refund_method:null,status:'completed'},
    {return_math_version:1,subtotal:1000,debt_relief:600,refund_amount:400,refund_method:'cash',status:'completed'},
    {return_math_version:1,subtotal:1000,debt_relief:0,refund_amount:1000,refund_method:'card',status:'completed'},
  ]};
  const client={from(table){
    const query={then:resolve=>Promise.resolve({data:rows[table]??[],error:null}).then(resolve)};
    for(const method of ['select','eq','in','gte','lte','order','limit'])query[method]=()=>query;
    return query;
  }};
  const mocks={'server-only':{},'@/lib/supabase/server':{createClient:async()=>client}};
  const daily=loadMoneyModule('src/lib/data/daily-closing.ts',mocks);
  const shifts=loadMoneyModule('src/lib/data/shifts.ts',mocks);
  for(const result of [await daily.getDayActivity('org','branch','2026-10-11'),
    await shifts.getShiftActivity('org','branch','2026-10-10T19:00:00Z','2026-10-11T18:59:59Z')]){
    assert.equal(result.refundsTotal,1400);assert.equal(result.refundsByMethod.cash,400);
    assert.equal(result.refundsByMethod.card,1000);assert.equal(result.expectedCash,-400);
  }
});

test('Dashboard and Reports reconcile V1 credit with original net sale and restored cost, including services and cart discounts', async () => {
  for(const [type,total,cost,restored] of [['product',1000,600,600],['product',900,600,600],['product',1000,600,0],['product',50,600,600],['service',1000,0,0]]){
    const rows={invoices:[{id:'invoice',grand_total:total,subtotal:1000,discount_total:1000-total,balance_due:0,status:'paid',invoice_date:'2026-10-11T00:00:00Z'}],
      invoice_items:[{invoice_id:'invoice',product_name:'Synthetic item',product_type:type,quantity:1,purchase_price:cost,unit_price:1000,item_discount:0,line_total:1000,service_transaction_amount:0,service_commission:type==='service'?1000:0}],
      returns:[{id:'return',return_math_version:1,subtotal:total,debt_relief:total,refund_amount:0,refund_method:null}],
      return_items:[{quantity:1}],return_stock_allocations:restored?[{quantity:1,unit_cost:restored}]:[]};
    const client={rpc:async()=>({data:[],error:null}),from(table){
      const query={then:resolve=>Promise.resolve({data:rows[table]??[],error:null,count:0}).then(resolve)};
      for(const method of ['select','eq','in','gte','lte','order','limit','neq','gt'])query[method]=()=>query;
      return query;
    }};
    const mocks={'server-only':{},'@/lib/supabase/server':{createClient:async()=>client}};
    const dashboard=await loadMoneyModule('src/lib/data/dashboard.ts',mocks).getDashboardSummary('org','branch');
    const reports=await loadMoneyModule('src/lib/data/reports.ts',mocks).getReportsData('org','branch','2026-10-11','2026-10-11');
    assert.equal(reports.returns.returnCreditTotal,total);assert.equal(reports.returns.debtReliefTotal,total);
    assert.equal(reports.returns.refundTotal,0);assert.equal(reports.profit.estimatedNetProfit,restored-cost);
    assert.equal(dashboard.returnsTotal,total);assert.equal(dashboard.todayProfit,restored-cost,`${type}, total ${total}`);
  }
});

test('return input accepts only whole return/restock quantities and a request identity', () => {
  const request = { invoice_id: '00000000-0000-4000-8000-000000000001', idempotency_key: '00000000-0000-4000-8000-000000000002',
    items: [{ invoice_item_id: '00000000-0000-4000-8000-000000000003', quantity: '5', restock_quantity: '3' }] };
  assert.equal(createReturnSchema.safeParse(request).success, true);
  for (const [quantity, restock_quantity] of [['1.5', '0'], ['1', '2'], ['1', '-1'], ['1', '0.5']]) {
    assert.equal(createReturnSchema.safeParse({ ...request, items: [{ ...request.items[0], quantity, restock_quantity }] }).success, false);
  }
  assert.equal(createReturnSchema.safeParse({ ...request, idempotency_key: undefined }).success, false);
});

test('quantity parser covers the authoritative INTEGER domain before conversion', () => {
  for (const value of ['0','1','999999999','1000000000','2147483647','01']) {
    assert.equal(parseReturnQuantity(value), Number(value));
  }
  for (const value of ['2147483648','-1','1.5','1e3','1e9','1.0','NaN','Infinity','+1',' ','']) {
    assert.equal(parseReturnQuantity(value), null, value);
  }
  const request={invoice_id:'00000000-0000-4000-8000-000000000001',idempotency_key:'00000000-0000-4000-8000-000000000002',
    items:[{invoice_item_id:'00000000-0000-4000-8000-000000000003',quantity:'0',restock_quantity:'0'}]};
  assert.equal(createReturnSchema.safeParse(request).success,false,'zero cannot select a Return');
  assert.equal(createReturnSchema.safeParse({...request,items:[{...request.items[0],quantity:'2147483647'}]}).success,true);
  assert.equal(createReturnSchema.safeParse({...request,items:[{...request.items[0],quantity:'1'}, {...request.items[0],quantity:'1'}]}).success,false);
});
