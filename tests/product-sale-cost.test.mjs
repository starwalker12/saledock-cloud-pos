import assert from 'node:assert/strict';
import test from 'node:test';
import { loadMoneyModule } from './helpers/load-money-module.mjs';
import { reportingClient, reportingPair } from './helpers/reporting-fixture.mjs';

const { calculateProductSaleCost, getProductSaleCostForInvoices } = loadMoneyModule('src/lib/data/product-sale-cost.ts', { 'server-only': {} });
const { getKarachiTodayDateString, getKarachiDayRange } = loadMoneyModule('src/lib/datetime.ts');
const date = getKarachiTodayDateString(), at = getKarachiDayRange(date).start;
const trust = { source_trust_version: 1, source_effective_at: at, source_transaction_id: '123456' };
const legacy = { source_trust_version: null, source_effective_at: null, source_transaction_id: null };

function fixture(costs, cache, { untrusted = false, service = false, returned = false, restored = false } = {}) {
  const provenance = untrusted ? legacy : trust;
  const identity = { organization_id: 'org', invoice_id: 'invoice', invoice_item_id: 'item', product_id: 'product' };
  return {
    invoices: [{ id: 'invoice', ...provenance, organization_id: 'org', branch_id: 'branch', status: 'paid',
      invoice_date: at, grand_total: service ? 3150 : 3000, subtotal: service ? 3150 : 3000, discount_total: 0, balance_due: 0 }],
    invoice_items: [{ id: 'item', ...provenance, ...identity, product_name: 'Mixed cost', product_type: 'product', quantity: 3,
      purchase_price: cache, unit_price: 1000, item_discount: 0, line_total: 3000 },
      ...(service ? [{ id: 'service', organization_id: 'org', invoice_id: 'invoice', product_type: 'service', quantity: 1,
        product_name: 'Service', purchase_price: 0, line_total: 150, service_transaction_amount: 100, service_commission: 50 }] : [])],
    invoice_item_stock_allocations: costs.map((unit_cost, i) => ({ id: 'allocation-' + i, ...identity, ...provenance, quantity: 1, unit_cost })),
    returns: returned ? [{ id: 'return', organization_id: 'org', branch_id: 'branch', status: 'completed', created_at: at,
      return_math_version: 1, subtotal: 3000, refund_amount: 3000, debt_relief: 0, refund_method: 'cash' }] : [],
    return_stock_allocations: restored ? costs.map(unit_cost => ({ organization_id: 'org', return_id: 'return', quantity: 1, unit_cost })) : [],
    expenses: [],
  };
}

for (const [costs, cache, expected] of [
  [['600.00', '600.00', '600.01'], '600.00', 1800.01],
  [['0.01', '0.02', '0.02'], '0.02', 0.05],
  [['0.01', '0.01', '0.02'], '0.01', 0.04],
  [['1.01', '1.02', '1.02'], '1.02', 3.05],
]) test(`protected original FIFO COGS ${costs.join('+')} is exact despite rounded cache ${cache}`, async () => {
  const rows = fixture(costs, cache, { returned: true, restored: true });
  assert.equal(calculateProductSaleCost('org', rows.invoices, rows.invoice_items, rows.invoice_item_stock_allocations), expected);
  const { dashboard, reports } = await reportingPair(rows, 'org', 'branch', date);
  assert.equal(dashboard.productCost, expected); assert.equal(reports.profit.productCost, expected);
  assert.equal(dashboard.todayProfit, 0); assert.equal(reports.profit.estimatedNetProfit, 0);
});

test('legacy/imported allocations never manufacture exact authority; cached interpretation remains', async () => {
  for (const untrusted of [true]) {
    const rows = fixture(['600.00', '600.00', '600.01'], '600.00', { untrusted });
    const before = JSON.stringify(rows);
    assert.equal(await getProductSaleCostForInvoices(reportingClient(rows), 'org', ['invoice']), 1800);
    const { dashboard, reports } = await reportingPair(rows, 'org', 'branch', date);
    assert.equal(dashboard.productCost, 1800); assert.equal(reports.profit.productCost, 1800);
    assert.equal(JSON.stringify(rows), before);
  }
});

test('trusted incomplete, forged identity or inconsistent provenance fails closed without cache fallback or mutation', async () => {
  const changes = [
    rows => { rows.invoice_item_stock_allocations.pop(); },
    rows => { rows.invoice_item_stock_allocations[0].quantity = 2; },
    ...['organization_id', 'invoice_id', 'invoice_item_id', 'product_id', 'source_transaction_id'].map(key =>
      rows => { rows.invoice_item_stock_allocations[0][key] = 'wrong'; }),
    rows => { rows.invoice_item_stock_allocations[0].source_trust_version = null; },
    rows => { rows.invoice_item_stock_allocations[0].source_effective_at = null; },
    rows => { rows.invoice_item_stock_allocations[0].source_effective_at = '2000-01-01T00:00:00Z'; },
    rows => { rows.invoice_item_stock_allocations[0].source_effective_at = at.replace(/\.000Z$/, '.000001Z'); },
    rows => { rows.invoice_items[0].source_transaction_id = 'wrong'; },
    rows => { rows.invoices[0].source_trust_version = null; },
    rows => { rows.invoice_item_stock_allocations[0].unit_cost = '-0.01'; },
  ];
  for (const change of changes) {
    const rows = fixture(['600.00', '600.00', '600.01'], '999.99'); change(rows);
    const before = JSON.stringify(rows);
    await assert.rejects(getProductSaleCostForInvoices(reportingClient(rows), 'org', ['invoice']), /Original sale cost cannot be verified/);
    await assert.rejects(reportingPair(rows, 'org', 'branch', date), /Original sale cost cannot be verified/);
    assert.equal(JSON.stringify(rows), before);
  }
});

test('shared helper reads more than 1000 source rows without a business limit', async () => {
  const rows = fixture(['0.01', '0.01', '0.01'], '0.01');
  const item = rows.invoice_items[0], allocation = rows.invoice_item_stock_allocations[0];
  rows.invoice_items = Array.from({ length: 1201 }, (_, i) => ({ ...item, id: 'item-' + i, quantity: 1 }));
  rows.invoice_item_stock_allocations = rows.invoice_items.map((item, i) => ({ ...allocation, id: 'allocation-' + i, invoice_item_id: item.id }));
  const trace = [];
  assert.equal(await getProductSaleCostForInvoices(reportingClient(rows, trace), 'org', ['invoice', 'invoice']), 12.01);
  assert(trace.some(read => read.table === 'invoice_items' && read.first === 1000));
});

test('mixed product/service, expenses and Return use identical Dashboard/Reports concepts', async () => {
  const rows = fixture(['600.00', '600.00', '600.01'], '600.00', { service: true });
  rows.expenses = ['0.01', '0.02'].map(amount => ({ organization_id: 'org', branch_id: 'branch', spent_at: at, status: 'active', amount, category: 'other', payment_method: 'cash' }));
  const { dashboard, reports } = await reportingPair(rows, 'org', 'branch', date);
  assert.equal(dashboard.salesRevenue, 3050); assert.equal(reports.profit.salesRevenue, 3050);
  assert.equal(dashboard.productCost, 1800.01); assert.equal(reports.profit.productCost, 1800.01);
  assert.equal(dashboard.expensesTotal, 0.03); assert.equal(reports.expenses.totalExpenses, 0.03);
  assert.equal(dashboard.todayProfit, 1249.96); assert.equal(reports.profit.estimatedNetProfit, 1249.96);
});

test('sale outside range does not move sale COGS into the Return period', async () => {
  const rows = fixture(['600.00', '600.00', '600.01'], '600.00', { returned: true, restored: true });
  rows.invoices[0].invoice_date = '2000-01-01T00:00:00Z';
  const { dashboard, reports } = await reportingPair(rows, 'org', 'branch', date);
  assert.equal(dashboard.productCost, 0); assert.equal(reports.profit.productCost, 0);
  assert.equal(dashboard.salesRevenue, 0); assert.equal(reports.profit.salesRevenue, 0);
  assert.equal(dashboard.todayProfit, -1199.99); assert.equal(reports.profit.estimatedNetProfit, -1199.99);
});
