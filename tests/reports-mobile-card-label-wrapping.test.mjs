import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const statCard = readFileSync("src/components/ui/stat-card.tsx", "utf8");
const reportsPage = readFileSync("src/app/reports/page.tsx", "utf8");
const expensesPage = readFileSync("src/app/expenses/page.tsx", "utf8");
const reportsData = readFileSync("src/lib/data/reports.ts", "utf8");

const reportStatCardConsumers = [
  "src/app/customers/[id]/page.tsx",
  "src/app/customers/page.tsx",
  "src/app/daily-closing/page.tsx",
  "src/app/products/page.tsx",
  "src/app/repairs/page.tsx",
  "src/app/suppliers/dues/page.tsx",
  "src/app/suppliers/purchases/page.tsx",
  "src/app/users/page.tsx",
];

const reportLabels = [
  "Gross sales",
  "Net Sales (Revenue)",
  "Gross Profit Margin",
  "Service Revenue / Profit",
  "Total Operating Expenses",
];

const expenseLabels = [
  "Today expenses",
  "This month",
  "Top category (month)",
  "Latest expense",
];

function conditionalBranch(source, marker, endMarker) {
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `StatCard contains ${marker}`);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(end, -1, `StatCard terminates ${marker} before ${endMarker}`);
  return source.slice(start, end);
}

test("StatCard exposes a typed wrapping option that defaults off", () => {
  assert.match(statCard, /wrapLabel\?:\s*boolean/);
  assert.match(statCard, /wrapLabel\s*=\s*false/);
});

test("StatCard default mode retains the established one-line truncation contract", () => {
  const defaultBranch = conditionalBranch(
    statCard,
    ") : (\n              <span data-stat-card-label",
    "</span>\n            )}",
  );
  assert.match(defaultBranch, /\btruncate\b/);
  assert.doesNotMatch(defaultBranch, /whitespace-normal|break-words|leading-tight/);
  assert.match(statCard, /wrapLabel\s*\?\s*"flex items-start gap-1"\s*:\s*"flex items-center gap-1"/);
});

test("StatCard wrap mode permits complete flex-safe multi-line labels", () => {
  const wrapBranch = conditionalBranch(
    statCard,
    "{wrapLabel ? (\n              <span data-stat-card-label",
    ") : (",
  );
  for (const className of [
    "min-w-0",
    "flex-1",
    "whitespace-normal",
    "break-words",
    "leading-tight",
  ]) {
    assert.match(wrapBranch, new RegExp(`\\b${className}\\b`), `wrap mode includes ${className}`);
  }
  for (const forbidden of [
    "truncate",
    "text-ellipsis",
    "overflow-hidden",
    "whitespace-nowrap",
    "line-clamp",
  ]) {
    assert.doesNotMatch(wrapBranch, new RegExp(forbidden), `wrap mode excludes ${forbidden}`);
  }
});

test("StatCard tooltip and rendered regions remain stable beside wrapped labels", () => {
  assert.match(statCard, /data-stat-card-tooltip[^>]*className="[^"]*shrink-0/);
  assert.match(statCard, /data-stat-card-value/);
  assert.match(statCard, /data-stat-card-detail/);
});

test("Reports opts all five shared StatCards into wrapping", () => {
  assert.equal((reportsPage.match(/<StatCard\b/g) ?? []).length, 5);
  assert.equal((reportsPage.match(/\bwrapLabel\b/g) ?? []).length, 5);
  for (const label of reportLabels) {
    const labelIndex = reportsPage.indexOf(`label="${label}"`);
    assert.notEqual(labelIndex, -1, `Reports retains label: ${label}`);
    const cardEnd = reportsPage.indexOf("/>", labelIndex);
    assert.match(reportsPage.slice(labelIndex, cardEnd), /\bwrapLabel\b/, `${label} opts into wrapping`);
  }
});

test("Reports keeps the affected labels and value expressions unchanged", () => {
  for (const label of [
    "Net Sales (Revenue)",
    "Gross Profit Margin",
    "Service Revenue / Profit",
  ]) {
    const labelAssignment = `label="${label}"`;
    assert.equal(
      reportsPage.split(labelAssignment).length - 1,
      1,
      `Reports retains one StatCard label assignment for ${label}`,
    );
  }
  for (const valueExpression of [
    "value={formatCurrency(data.sales.grossSales, currency)}",
    "value={formatCurrency(data.profit.salesRevenue, currency)}",
    "value={`${formatNumber(data.profit.grossMarginPercent)}%`}",
    "value={formatCurrency(data.profit.serviceProfit, currency)}",
    "value={formatCurrency(data.expenses.totalExpenses, currency)}",
  ]) {
    assert.ok(reportsPage.includes(valueExpression), `Reports retains ${valueExpression}`);
  }
});

test("Expenses deliberately opts all four summary StatCards into wrapping", () => {
  assert.equal((expensesPage.match(/<StatCard\b/g) ?? []).length, 4);
  assert.equal((expensesPage.match(/\bwrapLabel\b/g) ?? []).length, 4);
  for (const label of expenseLabels) {
    const labelIndex = expensesPage.indexOf(`label="${label}"`);
    assert.notEqual(labelIndex, -1, `Expenses retains label: ${label}`);
    const cardEnd = expensesPage.indexOf("/>", labelIndex);
    assert.match(expensesPage.slice(labelIndex, cardEnd), /\bwrapLabel\b/, `${label} opts into wrapping`);
  }
});

test("Other StatCard consumers retain the default truncation mode", () => {
  for (const file of reportStatCardConsumers) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /<StatCard\b/, `${file} remains a StatCard consumer`);
    assert.doesNotMatch(source, /\bwrapLabel\b/, `${file} does not opt into wrapping`);
  }
});

test("Reports retains its data contract while reconciling restocked FIFO cost", () => {
  assert.match(reportsPage, /getReportsData\(orgId, branchId, start, end\)/);
  assert.match(reportsData, /getRestoredProductCostForReturns/);
  assert.match(reportsData, /restoredProductCost/);
  assert.match(reportsData, /calculateEstimatedNetProfit/);
});
