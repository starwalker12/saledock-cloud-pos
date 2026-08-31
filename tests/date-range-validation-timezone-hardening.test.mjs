import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = new URL("../", import.meta.url);

function source(path) {
  return readFileSync(new URL(path, root), "utf8");
}

function loadTypeScriptModule(path, mocks = {}) {
  const url = new URL(path, root);
  const output = ts.transpileModule(readFileSync(url, "utf8"), {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: url.pathname,
  }).outputText;
  const evaluatedModule = { exports: {} };
  const localRequire = (id) => {
    if (Object.hasOwn(mocks, id)) return mocks[id];
    return require(id);
  };
  const wrapper = vm.runInThisContext(
    `(function (require, module, exports) { ${output}\n})`,
    { filename: url.pathname },
  );
  wrapper(localRequire, evaluatedModule, evaluatedModule.exports);
  return evaluatedModule.exports;
}

const datetime = loadTypeScriptModule("src/lib/datetime.ts");
const icons = new Proxy({}, { get: () => () => null });
const commonPageMocks = {
  "next/link": { default: () => null },
  "next/navigation": { redirect: () => undefined },
  "lucide-react": icons,
  "@/components/layout/app-shell": { AppShell: () => null },
  "@/components/ui/app-select": { AppSelect: () => null },
  "@/components/ui/empty-state": { EmptyState: () => null },
  "@/components/ui/sortable-header": { SortableHeader: () => null },
  "@/components/ui/stat-card": { StatCard: () => null },
  "@/lib/auth/session": { getCurrentContext: async () => ({}) },
  "@/lib/datetime": datetime,
  "@/lib/env": { env: { isSupabaseConfigured: true } },
  "@/lib/formatters": { formatCurrency: String, formatNumber: String },
  "@/lib/sort": { sortData: (rows) => rows },
};

const invoicePage = loadTypeScriptModule("src/app/invoices/page.tsx", {
  ...commonPageMocks,
  "@/lib/data/invoices": {
    INVOICE_LIST_STATUSES: ["draft", "paid", "partial", "unpaid", "void"],
    RECORDED_INVOICE_PAYMENT_METHODS: [
      "cash",
      "card",
      "easypaisa",
      "jazzcash",
      "bank_transfer",
    ],
    listInvoices: async () => [],
  },
});

const repairPage = loadTypeScriptModule("src/app/repairs/page.tsx", {
  ...commonPageMocks,
  "@/lib/data/repairs": {
    listRepairs: async () => [],
    getRepairsStats: async () => ({}),
  },
  "@/lib/data/customers": { listCustomers: async () => [] },
  "@/lib/permissions": { canCreateRepairs: () => true },
  "./repair-form": { RepairForm: () => null },
});

const expenseMethods = [
  "cash",
  "card",
  "easypaisa",
  "jazzcash",
  "bank_transfer",
];
const expensePage = loadTypeScriptModule("src/app/expenses/page.tsx", {
  ...commonPageMocks,
  "@/lib/data/expenses": {
    expenseCounts: async () => ({}),
    listExpenseCategories: async () => [],
    listExpenses: async () => [],
  },
  "@/lib/permissions": { canManageExpenses: () => true },
  "@/lib/validation/expenses": {
    EXPENSE_PAYMENT_METHODS: expenseMethods,
  },
  "./actions": { restoreExpenseAction: async () => undefined },
  "./expense-form": { ExpenseForm: () => null },
  "./void-expense-form": { VoidExpenseForm: () => null },
});

const reportsPage = loadTypeScriptModule("src/app/reports/page.tsx", {
  ...commonPageMocks,
  "@/lib/data/reports": {
    getReportsData: async () => ({}),
    getPotentialProfitInStock: async () => ({}),
  },
  "@/lib/data/settings": { getBrandingSettings: async () => ({}) },
  "@/lib/data/supplier-purchases": {
    listSuppliersWithBalances: async () => [],
    supplierPurchaseCounts: async () => ({}),
  },
  "@/lib/staff-permissions": { canViewReportsNew: async () => true },
  "./print-button": { PrintButton: () => null },
});

const supplierPage = loadTypeScriptModule(
  "src/app/suppliers/purchases/page.tsx",
  {
    ...commonPageMocks,
    "@/lib/data/supplier-purchases": {
      listSupplierPurchases: async () => [],
      listSuppliersWithBalances: async () => [],
      supplierPurchaseCounts: async () => ({}),
    },
    "@/lib/permissions": { canManageSupplierPurchases: () => true },
    "./filter-select": { PurchaseFilterSelect: () => null },
  },
);

test("strict Gregorian dates reject impossible and malformed values", () => {
  for (const value of [
    "2026-01-01",
    "2026-02-28",
    "2024-02-29",
    "2026-12-31",
  ]) {
    assert.equal(datetime.isValidCalendarDate(value), true, value);
  }
  for (const value of [
    "2025-02-29",
    "2026-02-29",
    "2026-02-30",
    "2026-02-31",
    "2026-04-31",
    "2026-13-01",
    "2026-00-12",
    "2026-01-00",
    "2026-1-01",
    "01-01-2026",
    "garbage",
    "",
  ]) {
    assert.equal(datetime.isValidCalendarDate(value), false, value);
  }
});

test("optional date ranges accept single sides and reject invalid or reversed ranges", () => {
  assert.equal(
    datetime.validateDateRange({ from: "2026-01-01", to: "2026-01-31" }).error,
    null,
  );
  assert.equal(
    datetime.validateDateRange({ from: "2026-01-31", to: "2026-01-01" })
      .errorCode,
    "reversed",
  );
  assert.equal(datetime.validateDateRange({ to: "2026-01-31" }).error, null);
  assert.equal(datetime.validateDateRange({ from: "2026-01-01" }).error, null);
  assert.equal(
    datetime.validateDateRange({ from: "2026-02-31", to: "2026-03-01" })
      .errorCode,
    "invalid_from",
  );
  assert.equal(
    datetime.validateDateRange({ from: "2026-02-28", to: "bad" }).errorCode,
    "invalid_to",
  );
});

test("Karachi boundaries stay exact and impossible dates cannot normalize", () => {
  assert.equal(
    datetime.getKarachiDayStartIso("2026-09-01"),
    "2026-08-31T19:00:00.000Z",
  );
  assert.equal(
    datetime.getKarachiDayEndIso("2026-09-01"),
    "2026-09-01T18:59:59.999Z",
  );
  assert.throws(() => datetime.getKarachiDayStartIso("2026-02-31"), RangeError);
  assert.throws(
    () => datetime.getKarachiRangeIso("2026-09-02", "2026-09-01"),
    RangeError,
  );
});

test("all five existing filter routes share strict, fail-closed parsing", () => {
  const parsers = [
    {
      name: "Invoices",
      parse: invoicePage.parseInvoiceFilterParams,
      valid: { from: "2026-01-01", to: "2026-01-31", status: "paid" },
      invalidStatus: { status: "refunded" },
    },
    {
      name: "Repairs",
      parse: repairPage.parseRepairFilterParams,
      valid: { from: "2026-01-01", to: "2026-01-31", status: "received" },
      invalidStatus: { status: "unknown" },
    },
    {
      name: "Expenses",
      parse: expensePage.parseExpenseFilterParams,
      valid: {
        from: "2026-01-01",
        to: "2026-01-31",
        payment_method: "card",
      },
      invalidStatus: { payment_method: "customer_credit" },
    },
    {
      name: "Supplier Purchases",
      parse: supplierPage.parseSupplierPurchaseFilterParams,
      valid: { from: "2026-01-01", to: "2026-01-31", status: "partial" },
      invalidStatus: { status: "void" },
    },
  ];

  for (const route of parsers) {
    assert.equal(route.parse(route.valid).error, null, `${route.name} valid`);
    assert.match(
      route.parse({ from: "2026-02-31" }).error,
      /valid From date/,
      `${route.name} impossible`,
    );
    assert.match(
      route.parse({ from: "2026-02-02", to: "2026-02-01" }).error,
      /cannot be after/,
      `${route.name} reversed`,
    );
    assert.match(
      route.parse(route.invalidStatus).error,
      /valid|Select/,
      `${route.name} enum`,
    );
  }

  assert.equal(
    reportsPage.parseReportFilterParams(
      { range: "custom", startDate: "2026-01-01", endDate: "2026-01-31" },
      new Date("2026-01-15T12:00:00.000Z"),
    ).error,
    null,
  );
  assert.match(
    reportsPage.parseReportFilterParams({
      range: "custom",
      startDate: "2026-02-31",
      endDate: "2026-03-01",
    }).error,
    /valid Start date/,
  );
  assert.match(
    reportsPage.parseReportFilterParams({
      range: "custom",
      startDate: "2026-03-02",
      endDate: "2026-03-01",
    }).error,
    /cannot be after/,
  );
  assert.equal(
    reportsPage.parseReportFilterParams({ range: "quarter" }).range,
    "this_month",
  );
});

test("report presets retain their Karachi calendar definitions", () => {
  const now = new Date("2026-09-16T07:00:00.000Z");
  assert.deepEqual(
    reportsPage.getRangeDates("today", undefined, undefined, now),
    {
      start: "2026-09-16",
      end: "2026-09-16",
    },
  );
  assert.deepEqual(
    reportsPage.getRangeDates("yesterday", undefined, undefined, now),
    { start: "2026-09-15", end: "2026-09-15" },
  );
  assert.deepEqual(
    reportsPage.getRangeDates("this_week", undefined, undefined, now),
    { start: "2026-09-14", end: "2026-09-16" },
  );
  assert.deepEqual(
    reportsPage.getRangeDates("this_month", undefined, undefined, now),
    { start: "2026-09-01", end: "2026-09-16" },
  );
  assert.deepEqual(
    reportsPage.getRangeDates("last_month", undefined, undefined, now),
    { start: "2026-08-01", end: "2026-08-31" },
  );
  assert.deepEqual(
    reportsPage.getRangeDates("custom", "2026-09-03", "2026-09-07", now),
    { start: "2026-09-03", end: "2026-09-07" },
  );
});

function selectClient(rows) {
  return {
    from: () => ({
      select() {
        return this;
      },
      eq() {
        return Promise.resolve({ data: rows, error: null });
      },
    }),
  };
}

test("repair delivered-this-month uses Karachi rollover instants", async () => {
  const rows = [
    {
      status: "delivered",
      advance_paid: 0,
      delivered_at: "2026-08-31T18:59:59.999Z",
    },
    {
      status: "delivered",
      advance_paid: 0,
      delivered_at: "2026-08-31T19:00:00.000Z",
    },
    {
      status: "delivered",
      advance_paid: 0,
      delivered_at: "2026-09-30T18:59:59.999Z",
    },
    {
      status: "delivered",
      advance_paid: 0,
      delivered_at: "2026-09-30T19:00:00.000Z",
    },
  ];
  const repairsData = loadTypeScriptModule("src/lib/data/repairs.ts", {
    "server-only": {},
    "@/lib/datetime": datetime,
    "@/lib/security/sanitize": { escapeLike: String },
    "@/lib/supabase/server": {
      createClient: async () => selectClient(rows),
    },
  });

  const result = await repairsData.getRepairsStats(
    "00000000-0000-4000-8000-000000000001",
    new Date("2026-08-31T19:00:00.000Z"),
  );
  assert.equal(result.deliveredThisMonth, 2);
});

test("supplier purchase month uses Karachi DATE start without timestamp conversion", async () => {
  const rows = [
    { grand_total: 10, balance_due: 0, purchase_date: "2026-08-31" },
    { grand_total: 20, balance_due: 5, purchase_date: "2026-09-01" },
    { grand_total: 30, balance_due: 0, purchase_date: "2026-09-30" },
    { grand_total: 40, balance_due: 0, purchase_date: "2026-10-01" },
  ];
  const supplierData = loadTypeScriptModule(
    "src/lib/data/supplier-purchases.ts",
    {
      "server-only": {},
      "@/lib/datetime": datetime,
      "@/lib/security/sanitize": { escapeLike: String },
      "@/lib/supabase/server": {
        createClient: async () => selectClient(rows),
      },
    },
  );

  const result = await supplierData.supplierPurchaseCounts(
    "00000000-0000-4000-8000-000000000001",
    new Date("2026-08-31T19:00:00.000Z"),
  );
  assert.deepEqual(result, {
    monthTotal: 50,
    monthCount: 2,
    unpaidTotal: 5,
    unpaidCount: 1,
  });
  assert.match(
    source("src/lib/data/supplier-purchases.ts"),
    /r\.purchase_date >= monthStart && r\.purchase_date <= monthEnd/,
  );
  assert.doesNotMatch(
    source("src/lib/data/supplier-purchases.ts"),
    /new Date\(new Date\(\)\.getFullYear/,
  );
});

test("fixed summaries stay fixed and ambiguous labels identify their scope", () => {
  assert.match(
    source("src/app/expenses/page.tsx"),
    /label="Latest this month"/,
  );
  assert.match(
    source("src/app/reports/page.tsx"),
    /Current Customer Outstanding Ledger/,
  );
  assert.match(
    source("src/app/reports/page.tsx"),
    /independent of the selected\s+report range/,
  );
  assert.match(
    source("src/app/suppliers/purchases/page.tsx"),
    /label="Purchases this month"/,
  );
});

test("valid filter params are preserved for sorting and invalid ranges are not queried", () => {
  for (const path of [
    "src/app/repairs/page.tsx",
    "src/app/expenses/page.tsx",
    "src/app/suppliers/purchases/page.tsx",
  ]) {
    const page = source(path);
    assert.match(page, /sortableParams/);
    assert.match(page, /error[\s\S]*?Promise\.resolve\(\[\]\)/);
  }
  assert.match(
    source("src/app/invoices/page.tsx"),
    /parsedFilters\.error\s*\? \[\]\s*:\s*await listInvoices/,
  );
});
