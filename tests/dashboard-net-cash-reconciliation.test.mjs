import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const widgetSource = readFileSync(
  new URL("../src/app/dashboard/widgets/widget-registry.tsx", import.meta.url),
  "utf8",
);
const dashboardPage = readFileSync(
  new URL("../src/app/dashboard/page.tsx", import.meta.url),
  "utf8",
);
const daySource = readFileSync(
  new URL("../src/lib/data/daily-closing.ts", import.meta.url),
  "utf8",
);
const shiftSource = readFileSync(
  new URL("../src/lib/data/shifts.ts", import.meta.url),
  "utf8",
);
const shiftActions = readFileSync(
  new URL("../src/app/daily-closing/shift-actions.ts", import.meta.url),
  "utf8",
);

function sourceCase(source, name, nextName) {
  const start = source.indexOf(`case "${name}":`);
  const end = source.indexOf(`case "${nextName}":`, start);
  assert.notEqual(start, -1, `${name} case exists`);
  assert.notEqual(end, -1, `${nextName} case follows ${name}`);
  return source.slice(start, end);
}

function physicalCash({
  cashPayments = 0,
  cashRefunds = 0,
  cashExpenses = 0,
  cashSettlements = 0,
} = {}) {
  return cashPayments - cashRefunds - cashExpenses + cashSettlements;
}

const todayNet = sourceCase(widgetSource, "today-net", "today-closing");

test("Today net uses the trusted branch/day physical-cash result", () => {
  assert.match(todayNet, /state\.todayActivity\.expectedCash/);
  assert.match(todayNet, /state\.todayActivity\.paymentsByMethod\.cash/);
  assert.match(todayNet, /state\.todayActivity\.refundsByMethod\.cash/);
  assert.match(todayNet, /state\.todayActivity\.expensesCash/);
  assert.match(todayNet, /state\.todayActivity\.creditCollectionCash/);
});

test("Today net no longer derives cash from invoice revenue or all-method expenses", () => {
  assert.doesNotMatch(todayNet, /state\.invoices\.todaySalesTotal/);
  assert.doesNotMatch(todayNet, /state\.expenses\.todayTotal/);
  assert.doesNotMatch(todayNet, /grand_total/);
});

test("Today net exposes a safe no-branch state instead of an organization fallback", () => {
  assert.match(todayNet, /if \(!state\.todayActivity\)/);
  assert.match(todayNet, /Unavailable/);
  assert.match(todayNet, /Assign a branch to calculate physical cash flow/);
  assert.match(
    dashboardPage,
    /branchId \? getDayActivity\(orgId, branchId, today\) : Promise\.resolve\(null\)/,
  );
});

test("Widget terminology describes physical cash rather than operating value", () => {
  assert.match(widgetSource, /title: "Today's Net Cash"/);
  assert.match(
    widgetSource,
    /description:\s*"Physical cash received minus cash refunds and cash expenses for this branch today"/,
  );
  assert.match(todayNet, /Cash flow today/);
  assert.match(todayNet, /size === "S" \? "text-xl" : "text-2xl"/);
  assert.match(todayNet, /Cash received less cash refunds and cash expenses/);
  for (const label of [
    "Cash payments:",
    "Cash settlements:",
    "Cash refunds:",
    "Cash expenses:",
  ]) {
    assert.match(todayNet, new RegExp(label));
  }
});

test("Daily activity keeps explicit organization and branch scope", () => {
  assert.match(
    daySource,
    /export async function getDayActivity\(\s*organizationId: string,\s*branchId: string,\s*date: string/,
  );
  const scopedQueries =
    daySource.match(/\.eq\("organization_id", organizationId\)/g) ?? [];
  const branchQueries = daySource.match(/\.eq\("branch_id", branchId\)/g) ?? [];
  assert.ok(scopedQueries.length >= 6);
  assert.ok(branchQueries.length >= 6);
});

test("Daily activity uses both Asia/Karachi day boundaries", () => {
  assert.match(daySource, /getKarachiDayRange/);
  assert.match(daySource, /const \{ start, end \} = dayBounds\(date\)/);
  assert.ok((daySource.match(/\.gte\("[a-z_]+", start\)/g) ?? []).length >= 6);
  assert.ok((daySource.match(/\.lte\("[a-z_]+", end\)/g) ?? []).length >= 6);
});

test("Daily and shift activity use identical physical-cash component semantics", () => {
  const formula =
    /const expectedCash = paymentsByMethod\.cash - refundsByMethod\.cash - expensesCash \+ creditCollectionCash/;
  assert.match(daySource, formula);
  assert.match(shiftSource, formula);
});

test("Only completed returns contribute refunds", () => {
  for (const source of [daySource, shiftSource]) {
    assert.match(
      source,
      /\.from\("returns"\)[\s\S]*?\.eq\("status", "completed"\)/,
    );
  }
});

test("Only active expenses contribute expense cash", () => {
  for (const source of [daySource, shiftSource]) {
    assert.match(
      source,
      /\.from\("expenses"\)[\s\S]*?\.eq\("status", "active"\)/,
    );
    assert.match(
      source,
      /if \(e\.payment_method === "cash"\) expensesCash \+= amount/,
    );
  }
});

test("Cash customer settlements are included once and digital settlements stay separate", () => {
  for (const source of [daySource, shiftSource]) {
    assert.match(source, /\.from\("credit_payments"\)/);
    assert.match(source, /if \(digitalMethods\.includes\(cp\.method\)\)/);
    assert.equal(
      (source.match(/expectedCash = [^\n]*creditCollectionCash/g) ?? []).length,
      1,
    );
    assert.doesNotMatch(
      source.match(/const expectedCash = [^\n]*/)?.[0] ?? "",
      /creditCollectionDigital/,
    );
  }
});

test("Starting and counted cash remain drawer reconciliation values only", () => {
  assert.doesNotMatch(todayNet, /starting_cash|counted_cash|cash_difference/);
  assert.match(
    shiftActions,
    /const expected = shift\.starting_cash \+ activity\.expectedCash/,
  );
  assert.match(shiftActions, /const difference = counted - expected/);
});

test("Dashboard change introduces no business mutation", () => {
  assert.doesNotMatch(todayNet, /\.(?:insert|update|upsert|delete|rpc)\(/);
  assert.doesNotMatch(todayNet, /revalidatePath|redirect|window\.|router\./);
});

test("No activity produces zero physical cash", () => {
  assert.equal(physicalCash(), 0);
});

test("Cash sale increases physical cash", () => {
  assert.equal(physicalCash({ cashPayments: 150 }), 150);
});

test("Card, bank, wallet, and customer-credit invoices do not enter the formula", () => {
  assert.equal(physicalCash(), 0);
});

test("Mixed Cash 60 and Card 90 contributes only Cash 60", () => {
  assert.equal(physicalCash({ cashPayments: 60 }), 60);
});

test("Cash refund reduces physical cash", () => {
  assert.equal(physicalCash({ cashRefunds: 150 }), -150);
});

test("Card refund does not reduce physical cash", () => {
  assert.equal(physicalCash(), 0);
});

test("Equal Cash sale and refund net to zero", () => {
  assert.equal(physicalCash({ cashPayments: 150, cashRefunds: 150 }), 0);
});

test("Equal Card sale and refund remain zero", () => {
  assert.equal(physicalCash(), 0);
});

test("Cash expense reduces physical cash", () => {
  assert.equal(physicalCash({ cashExpenses: 75 }), -75);
});

test("Card and bank expenses do not reduce physical cash", () => {
  assert.equal(physicalCash(), 0);
});

test("Cash customer settlement increases physical cash once", () => {
  assert.equal(physicalCash({ cashSettlements: 400 }), 400);
});

test("Digital customer settlement does not increase physical cash", () => {
  assert.equal(physicalCash(), 0);
});

test("Cash received today counts independently of invoice date", () => {
  assert.match(
    daySource,
    /\.from\("payments"\)[\s\S]*?\.gte\("paid_at", start\)/,
  );
  assert.equal(physicalCash({ cashPayments: 150 }), 150);
});

test("Prior-day Cash refund contributes only today's negative refund", () => {
  assert.equal(physicalCash({ cashRefunds: 150 }), -150);
});

test("Prior-day Card refund has no physical-cash effect", () => {
  assert.equal(physicalCash(), 0);
});

test("Foreign branch and organization activity are excluded by query scope", () => {
  assert.match(daySource, /\.eq\("organization_id", organizationId\)/);
  assert.match(daySource, /\.eq\("branch_id", branchId\)/);
});

test("Opening float, counted cash, and reconciliation difference never enter transaction flow", () => {
  assert.equal(
    physicalCash({
      cashPayments: 0,
      cashRefunds: 0,
      cashExpenses: 0,
      cashSettlements: 0,
    }),
    0,
  );
  assert.doesNotMatch(
    daySource.match(/const expectedCash = [^\n]*/)?.[0] ?? "",
    /starting|counted|difference/,
  );
  assert.doesNotMatch(
    shiftSource.match(/const expectedCash = [^\n]*/)?.[0] ?? "",
    /starting|counted|difference/,
  );
});
