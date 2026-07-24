import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  calculateEstimatedNetProfit,
  sumRestoredProductCost,
} from "../src/lib/return-profit.ts";

const dashboardSource = readFileSync(
  new URL("../src/lib/data/dashboard.ts", import.meta.url),
  "utf8",
);
const reportsSource = readFileSync(
  new URL("../src/lib/data/reports.ts", import.meta.url),
  "utf8",
);
const returnProfitDataSource = readFileSync(
  new URL("../src/lib/data/return-profit.ts", import.meta.url),
  "utf8",
);
const reportsPage = readFileSync(
  new URL("../src/app/reports/page.tsx", import.meta.url),
  "utf8",
);
const dashboardWidgets = readFileSync(
  new URL("../src/app/dashboard/widgets/widget-registry.tsx", import.meta.url),
  "utf8",
);

function profit({
  grossProfit,
  refund = 0,
  allocations = [],
  expenses = 0,
  writeOffs = 0,
}) {
  return calculateEstimatedNetProfit({
    grossProfit,
    expenses,
    refunds: refund,
    restoredProductCost: sumRestoredProductCost(allocations),
    writeOffs,
  });
}

test("full restocked return neutralizes original product margin", () => {
  assert.equal(
    profit({
      grossProfit: 50,
      refund: 150,
      allocations: [{ quantity: 1, unit_cost: 100 }],
    }),
    0,
  );
});

test("full non-restocked return leaves consumed product cost as a loss", () => {
  assert.equal(profit({ grossProfit: 50, refund: 150 }), -100);
});

test("partial restocked return preserves margin on the unreturned unit", () => {
  assert.equal(
    profit({
      grossProfit: 100,
      refund: 150,
      allocations: [{ quantity: 1, unit_cost: 100 }],
    }),
    50,
  );
});

test("partial refund with full restock retains the unrefunded amount", () => {
  assert.equal(
    profit({
      grossProfit: 50,
      refund: 100,
      allocations: [{ quantity: 1, unit_cost: 100 }],
    }),
    50,
  );
});

test("multiple FIFO costs use each exact restored allocation", () => {
  assert.equal(
    sumRestoredProductCost([
      { quantity: 1, unit_cost: 80 },
      { quantity: 1, unit_cost: 120 },
    ]),
    200,
  );
  assert.equal(sumRestoredProductCost([{ quantity: 1, unit_cost: 120 }]), 120);
});

test("allocation quantity participates in restored cost without early rounding", () => {
  assert.equal(
    sumRestoredProductCost([
      { quantity: 2, unit_cost: "33.33" },
      { quantity: 1, unit_cost: "33.34" },
    ]),
    100,
  );
});

test("service return invents no product cost restoration", () => {
  assert.equal(profit({ grossProfit: 50, refund: 50, allocations: [] }), 0);
});

test("no returns preserve the existing profit result", () => {
  assert.equal(profit({ grossProfit: 50 }), 50);
});

test("expenses remain subtracted once", () => {
  assert.equal(
    profit({
      grossProfit: 50,
      refund: 150,
      allocations: [{ quantity: 1, unit_cost: 100 }],
      expenses: 25,
    }),
    -25,
  );
});

test("credit write-offs remain subtracted once", () => {
  assert.equal(
    profit({
      grossProfit: 50,
      refund: 150,
      allocations: [{ quantity: 1, unit_cost: 100 }],
      writeOffs: 10,
    }),
    -10,
  );
});

test("same-day sale and restocked return combine to zero", () => {
  assert.equal(
    profit({
      grossProfit: 50,
      refund: 150,
      allocations: [{ quantity: 1, unit_cost: 100 }],
    }),
    0,
  );
});

test("prior-day sale and current-day restocked return produce only the return adjustment", () => {
  assert.equal(
    profit({
      grossProfit: 0,
      refund: 150,
      allocations: [{ quantity: 1, unit_cost: 100 }],
    }),
    -50,
  );
});

test("sale inside range and later return outside range retain original margin", () => {
  assert.equal(profit({ grossProfit: 50 }), 50);
});

test("sale outside range and return inside range include the return adjustment", () => {
  assert.equal(
    profit({
      grossProfit: 0,
      refund: 150,
      allocations: [{ quantity: 1, unit_cost: 100 }],
    }),
    -50,
  );
});

test("Dashboard and Reports select only completed returns inside their Karachi window", () => {
  for (const source of [dashboardSource, reportsSource]) {
    assert.match(source, /\.eq\("organization_id", (?:organizationId|orgId)\)/);
    assert.match(source, /\.eq\("status", "completed"\)/);
    assert.match(source, /\.gte\("created_at", (?:todayStart|start)\)/);
    assert.match(source, /\.lte\("created_at", (?:todayEnd|end)\)/);
    assert.match(source, /if \(branchId\)/);
    assert.match(source, /\.eq\("branch_id", branchId\)/);
    assert.match(source, /getRestoredProductCostForReturns/);
  }
});

test("restored cost comes only from organization-scoped return allocation quantity and unit cost", () => {
  assert.match(returnProfitDataSource, /\.from\("return_stock_allocations"\)/);
  assert.match(returnProfitDataSource, /\.select\("quantity, unit_cost"\)/);
  assert.match(
    returnProfitDataSource,
    /\.eq\("organization_id", organizationId\)/,
  );
  assert.match(
    returnProfitDataSource,
    /\.in\("return_id", completedReturnIds\)/,
  );
  assert.doesNotMatch(returnProfitDataSource, /purchase_price|catalog/i);
  assert.doesNotMatch(
    returnProfitDataSource,
    /\.(?:insert|update|upsert|delete|rpc)\(/,
  );
});

test("Reports also organization-scope returned item quantities", () => {
  assert.match(
    reportsSource,
    /\.from\("return_items"\)[\s\S]*?\.eq\("organization_id", orgId\)[\s\S]*?\.in\("return_id", returnIds\)/,
  );
});

test("visible Dashboard and Reports breakdowns explain restored FIFO cost", () => {
  assert.match(dashboardWidgets, /Restocked cost:/);
  assert.match(reportsPage, /Restocked FIFO Cost/);
  assert.match(reportsPage, /Restocked Product Cost \(Original FIFO\)/);
});

test("return-profit change does not touch net-cash, return mutation, package, or migration files", () => {
  const changed = execFileSync("git", ["diff", "--name-only", "origin/main"], {
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .filter(Boolean);
  assert.equal(
    changed.some((file) =>
      /cash|daily-closing|returns\/actions|return-form|package(?:-lock)?\.json|supabase\/migrations/.test(
        file,
      ),
    ),
    false,
  );
});
