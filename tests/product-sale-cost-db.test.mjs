import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { enabled, fixture, Session, signature } from './helpers/return-math-database.mjs';
import { loadMoneyModule } from './helpers/load-money-module.mjs';
import { reportingPair, reportingClient } from './helpers/reporting-fixture.mjs';

const { getKarachiTodayDateString } = loadMoneyModule('src/lib/datetime.ts');
const { getProductSaleCostForInvoices } = loadMoneyModule('src/lib/data/product-sale-cost.ts', { 'server-only': {} });
const tables = ['invoices', 'invoice_items', 'invoice_item_stock_allocations', 'returns', 'return_items',
  'return_stock_allocations', 'expenses', 'products', 'product_stock_lots', 'customers', 'customer_write_offs'];
const snapshot = f => `select jsonb_object_agg(name,rows) from (${tables.map(table =>
  `select '${table}' name,coalesce(jsonb_agg(to_jsonb(t) order by id),'[]') rows from public.${table} t where organization_id='${f.org}'`).join(' union all ')}) t;`;
const result = output => JSON.parse(output.text.trim().split('\n').at(-1));
function evidence(name, value) {
  const directory = process.env.QA_EVIDENCE_DIR;
  if (directory) {
    assert.match(directory, /\/return-math-v1-cogs-correction(?:-\d+)?$/);
    fs.writeFileSync(directory + '/' + name + '.json', JSON.stringify(value, null, 2) + '\n');
  }
}
function mixedSetup(f) {
  return `update public.product_stock_lots set purchase_date=current_date-1 where id='${f.lot}';
    update public.products set stock_quantity=3 where id='${f.product}';
    insert into public.product_stock_lots(organization_id,branch_id,product_id,quantity_received,quantity_remaining,unit_cost,purchase_date)
    values('${f.org}','${f.branch}','${f.product}',1,1,600.01,current_date);`;
}

for (const restock of [0, 1, 2, 3]) test(`protected POS mixed-lot core, restock ${restock}: actual reporting modules reconcile exact paisa`, { skip: !enabled }, async () => {
  const f = fixture({ stock: 2 }), session = new Session();
  try {
    await session.ok(`begin;${f.seed}${mixedSetup(f)}${f.auth}${f.sale({ quantity: 3 })}reset role;`);
    const sale = result(await session.ok(snapshot(f)));
    const hashBefore = result(await session.ok(`select ${signature(f.org)};`));
    const salePair = await reportingPair(sale, f.org, f.branch, getKarachiTodayDateString());
    assert.equal(sale.invoice_items[0].purchase_price, 600);
    assert.equal(salePair.dashboard.salesRevenue, 3000);
    assert.equal(salePair.dashboard.productCost, 1800.01);
    assert.equal(salePair.dashboard.todayProfit, 1199.99);
    assert.equal(salePair.reports.profit.productCost, 1800.01);
    assert.equal(salePair.reports.profit.estimatedNetProfit, 1199.99);
    assert.deepEqual(result(await session.ok(`select ${signature(f.org)};`)), hashBefore, 'Reporting reads must not mutate business facts');
    await session.ok(`${f.auth}${f.return({ quantity: 3, restock })}reset role;`);
    const returned = result(await session.ok(snapshot(f)));
    const expectedRestored = Number((await session.ok(`select sum(least(greatest(${restock}-used,0),quantity)*unit_cost) from
      (select quantity,unit_cost,coalesce(sum(quantity)over(order by created_at,id rows between unbounded preceding and 1 preceding),0) used
       from public.invoice_item_stock_allocations where invoice_item_id=${f.item}) a;`)).text.trim());
    const expectedCombined = loadMoneyModule('src/lib/money.ts').subtractMoney(expectedRestored, 1800.01);
    const pair = await reportingPair(returned, f.org, f.branch, getKarachiTodayDateString());
    assert.equal(pair.dashboard.productCost, 1800.01); assert.equal(pair.reports.profit.productCost, 1800.01);
    assert.equal(pair.dashboard.returnsTotal, 3000); assert.equal(pair.reports.returns.returnCreditTotal, 3000);
    assert.equal(pair.dashboard.restoredProductCost, expectedRestored); assert.equal(pair.reports.profit.restoredProductCost, expectedRestored);
    assert.equal(pair.dashboard.todayProfit, expectedCombined); assert.equal(pair.reports.profit.estimatedNetProfit, expectedCombined);
    if (restock === 3) assert.equal(expectedCombined, 0);
    if (restock === 0) assert.equal(expectedCombined, -1800.01);
    assert.equal(returned.invoice_items[0].purchase_price, 600, 'The stored compatibility cache must not be rewritten');
    assert.equal(returned.returns[0].restored_cost, expectedRestored);
    evidence('core-restock-' + restock, { sale: salePair, returned: pair, exactSaleCost: 1800.01,
      saleProfit: 1199.99, returnCredit: 3000, restoredCost: expectedRestored,
      returnAdjustment: loadMoneyModule('src/lib/money.ts').subtractMoney(expectedRestored, 3000),
      combinedProfit: expectedCombined, cacheUnchanged: true, reportingMutations: 0,
      originalAllocations: sale.invoice_item_stock_allocations, passed: true });
  } finally { await session.close(); }
});

test('real protected source snapshots corrupted only in disposable input fail closed, database remains unchanged', { skip: !enabled }, async () => {
  const f = fixture({ stock: 2 }), session = new Session();
  try {
    await session.ok(`begin;${f.seed}${mixedSetup(f)}${f.auth}${f.sale({ quantity: 3 })}reset role;`);
    const rows = result(await session.ok(snapshot(f)));
    const before = result(await session.ok(`select ${signature(f.org)};`));
    for (const mutate of [data => data.invoice_item_stock_allocations.pop(), data => { data.invoice_item_stock_allocations[0].source_transaction_id = 'different'; }]) {
      const invalid = structuredClone(rows); mutate(invalid);
      await assert.rejects(reportingPair(invalid, f.org, f.branch, getKarachiTodayDateString()), /Original sale cost cannot be verified/);
    }
    assert.deepEqual(result(await session.ok(`select ${signature(f.org)};`)), before);
    evidence('trusted-corruption', { protectedProducerSource: true, isolatedRollbackFixture: true,
      corruptionLocation: 'Disposable reporting input snapshot; no production guard disabled', failedClosed: true, databaseUnchanged: true });
  } finally { await session.close(); }
});

test('actual legacy database rows and importer-normalized source keep cached interpretation and Return fail-closed', { skip: !enabled }, async () => {
  const f = fixture({ stock: 2 }), session = new Session(), invoice = randomUUID(), item = randomUUID();
  try {
    await session.ok(`begin;${f.seed}${mixedSetup(f)}
      insert into public.invoices(id,organization_id,branch_id,customer_id,invoice_no,status,subtotal,grand_total,amount_paid,balance_due)
      values('${invoice}','${f.org}','${f.branch}','${f.customer}','LEGACY-COST','paid',3000,3000,3000,0);
      insert into public.invoice_items(id,organization_id,invoice_id,product_id,product_name,product_type,quantity,purchase_price,unit_price,line_total)
      values('${item}','${f.org}','${invoice}','${f.product}','Legacy mixed cost','product',3,600,1000,3000);`);
    const rows = result(await session.ok(snapshot(f)));
    const before = result(await session.ok(`select ${signature(f.org)};`));
    const pair = await reportingPair(rows, f.org, f.branch, getKarachiTodayDateString());
    assert.equal(pair.dashboard.productCost, 1800); assert.equal(pair.reports.profit.productCost, 1800);
    await session.ok(`create function pg_temp.quote_legacy()returns text language plpgsql as $$ begin
      perform set_config('role','authenticated',true);perform public.quote_invoice_return('${invoice}',jsonb_build_array(jsonb_build_object('invoice_item_id','${item}','quantity',1,'restock_quantity',0)));
      return 'unexpected success';exception when others then perform set_config('role','postgres',true);return sqlerrm;end $$;`);
    assert.match((await session.ok(`${f.auth}select pg_temp.quote_legacy();reset role;`)).text, /before SaleDock could fully verify/);
    assert.deepEqual(result(await session.ok(`select ${signature(f.org)};`)), before);
    // Exercise the actual importer normalizer with incoming trust fields.
    const normalized = result(await session.ok(`select backup_private.normalize_row('invoice_items',to_jsonb(i)||
      jsonb_build_object('source_trust_version',1,'source_effective_at',clock_timestamp(),'source_transaction_id','123456'),
      '${f.org}',clock_timestamp()) from public.invoice_items i where id='${item}';`));
    assert.equal(normalized.source_trust_version, undefined);
    assert.equal(normalized.source_effective_at, undefined);
    assert.equal(normalized.source_transaction_id, undefined);
    const importedRows = { ...rows, invoice_items: [{ ...normalized, source_trust_version: null, source_effective_at: null, source_transaction_id: null }] };
    assert.equal(await getProductSaleCostForInvoices(reportingClient(importedRows), f.org, [invoice]), 1800);
    evidence('legacy-imported-cost', { legacyCost: 1800, importedCost: 1800, trustBackfill: false,
      historicalMutation: false, returnEligibilityStillDenied: true, incomingTrustStripped: true });
  } finally { await session.close(); }
});
