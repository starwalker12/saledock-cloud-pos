import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const pagePath = new URL("../src/app/invoices/page.tsx", import.meta.url);
const dataPath = new URL("../src/lib/data/invoices.ts", import.meta.url);
const e2ePath = new URL("./e2e/invoice-filters.spec.ts", import.meta.url);
const pageSource = readFileSync(pagePath, "utf8");
const dataSource = readFileSync(dataPath, "utf8");
const sortableSource = readFileSync(
  new URL("../src/components/ui/sortable-header.tsx", import.meta.url),
  "utf8",
);
const posValidationSource = readFileSync(
  new URL("../src/lib/validation/pos.ts", import.meta.url),
  "utf8",
);
const checkoutSource = readFileSync(
  new URL(
    "../supabase/migrations/20260630000000_pos_checkout_service_total_charged.sql",
    import.meta.url,
  ),
  "utf8",
);
const e2eSource = readFileSync(e2ePath, "utf8");

function loadTypeScriptModule(path, mocks) {
  const source = readFileSync(path, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: path.pathname,
  }).outputText;
  const evaluatedModule = { exports: {} };
  const localRequire = (id) => {
    if (Object.hasOwn(mocks, id)) return mocks[id];
    return require(id);
  };
  const wrapper = vm.runInThisContext(
    `(function (require, module, exports) { ${output}\n})`,
    { filename: path.pathname },
  );
  wrapper(localRequire, evaluatedModule, evaluatedModule.exports);
  return evaluatedModule.exports;
}

const recordedMethods = [
  "cash",
  "card",
  "easypaisa",
  "jazzcash",
  "bank_transfer",
];
const statuses = ["draft", "paid", "partial", "unpaid", "void"];
const isValidCalendarDate = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (year < 1 || month < 1 || month > 12) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days =
    month === 2 ? (leap ? 29 : 28) : [4, 6, 9, 11].includes(month) ? 30 : 31;
  return day >= 1 && day <= days;
};
const pageModule = loadTypeScriptModule(pagePath, {
  "next/link": { default: () => null },
  "next/navigation": { redirect: () => undefined },
  "@/components/layout/app-shell": { AppShell: () => null },
  "@/components/ui/empty-state": { EmptyState: () => null },
  "@/components/ui/sortable-header": { SortableHeader: () => null },
  "@/lib/auth/session": { getCurrentContext: async () => ({}) },
  "@/lib/data/invoices": {
    INVOICE_LIST_STATUSES: statuses,
    RECORDED_INVOICE_PAYMENT_METHODS: recordedMethods,
    listInvoices: async () => [],
  },
  "@/lib/datetime": {
    isValidCalendarDate,
    validateDateRange: ({ from = "", to = "" }) => ({
      from,
      to,
      error:
        from && !isValidCalendarDate(from)
          ? "Enter a valid From date."
          : to && !isValidCalendarDate(to)
            ? "Enter a valid To date."
            : from && to && from > to
              ? "From date cannot be after To date."
              : null,
    }),
    getKarachiDayStartIso: (date) =>
      new Date(`${date}T00:00:00.000+05:00`).toISOString(),
    getKarachiDayEndIso: (date) =>
      new Date(`${date}T23:59:59.999+05:00`).toISOString(),
    formatKarachiTimestamp: (value) => value,
  },
  "@/lib/env": { env: { isSupabaseConfigured: true } },
  "@/lib/formatters": { formatCurrency: String },
  "@/lib/sort": { sortData: (rows) => rows },
});

const playwrightTestStub = Object.assign(() => undefined, {
  describe: () => undefined,
  setTimeout: () => undefined,
  skip: () => undefined,
});
const e2eModule = loadTypeScriptModule(e2ePath, {
  "@playwright/test": { expect: () => undefined, test: playwrightTestStub },
  "./helpers/local-supabase": {
    getLocalAdminClient: () => undefined,
    isLocalPlaywrightRun: () => false,
    loginLocalOwnerDirectly: async () => undefined,
  },
});

test("invoice-filter evidence roots are unique and existing targets fail closed", async () => {
  assert.doesNotMatch(
    e2eSource,
    /\/Users\/sw12\/Projects\/saledock-local-evidence\/invoice-filter-fix/,
  );
  assert.match(e2eSource, /process\.env\.INVOICE_FILTER_EVIDENCE_ROOT/);
  assert.match(e2eSource, /mkdtemp\(/);
  assert.doesNotMatch(e2eSource, /mkdir\([^)]*recursive:\s*true/);
  assert.match(e2eSource, /join\(requireEvidenceRoot\(\), name\)/);
  assert.match(
    e2eSource,
    /async function writeManifest[\s\S]*?const root = requireEvidenceRoot\(\)[\s\S]*?join\(root, "evidence-manifest\.sha256"\)/,
  );

  const workflowStart = e2eSource.indexOf("await initializeEvidenceRoot()");
  assert.ok(workflowStart >= 0);
  assert.ok(
    workflowStart < e2eSource.indexOf("getLocalAdminClient()", workflowStart),
  );
  assert.ok(
    workflowStart < e2eSource.indexOf("createFixture(admin)", workflowStart),
  );

  const sandbox = mkdtempSync(
    join(tmpdir(), "invoice-filter-evidence-contract-"),
  );
  const existing = join(sandbox, "existing");
  const screenshot = join(existing, "screenshots", "sealed.png");
  const manifest = join(existing, "evidence-manifest.sha256");
  mkdirSync(join(existing, "screenshots"), { recursive: true });
  writeFileSync(manifest, "sealed manifest\n");
  writeFileSync(screenshot, "sealed screenshot\n");

  try {
    await assert.rejects(
      e2eModule.prepareInvoiceFilterEvidenceRoot(existing),
      new RegExp(
        `Refusing to overwrite existing invoice-filter evidence directory: ${existing}`,
      ),
    );
    assert.equal(readFileSync(manifest, "utf8"), "sealed manifest\n");
    assert.equal(readFileSync(screenshot, "utf8"), "sealed screenshot\n");

    const explicit = join(sandbox, "explicit");
    assert.equal(
      await e2eModule.prepareInvoiceFilterEvidenceRoot(explicit),
      explicit,
    );
    assert.equal(existsSync(explicit), true);

    const disposableA = await e2eModule.prepareInvoiceFilterEvidenceRoot();
    const disposableB = await e2eModule.prepareInvoiceFilterEvidenceRoot();
    try {
      assert.notEqual(disposableA, disposableB);
      assert.match(disposableA, /saledock-invoice-filter-evidence-/);
      assert.match(disposableB, /saledock-invoice-filter-evidence-/);
      assert.equal(
        disposableA.startsWith("/Users/sw12/Projects/saledock-local-evidence/"),
        false,
      );
    } finally {
      rmSync(disposableA, { recursive: true, force: true });
      rmSync(disposableB, { recursive: true, force: true });
    }
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test("URL filters trim search and use exact Karachi calendar boundaries", () => {
  const parsed = pageModule.parseInvoiceFilterParams({
    q: "  inv-100  ",
    from: "2026-08-10",
    to: "2026-08-10",
    payment: "card",
    status: "paid",
  });

  assert.equal(parsed.search, "inv-100");
  assert.equal(parsed.error, null);
  assert.equal(parsed.filters.fromIso, "2026-08-09T19:00:00.000Z");
  assert.equal(parsed.filters.toIso, "2026-08-10T18:59:59.999Z");
  assert.equal(parsed.filters.paymentMethod, "card");
  assert.equal(parsed.filters.status, "paid");
  assert.deepEqual(pageModule.parseInvoiceFilterParams({ q: "   " }).filters, {
    search: undefined,
    fromIso: undefined,
    toIso: undefined,
    paymentMethod: undefined,
    status: undefined,
  });
});

test("date parsing rejects malformed, impossible, and reversed ranges safely", () => {
  assert.equal(pageModule.isValidInvoiceFilterDate("2026-08-10"), true);
  assert.equal(pageModule.isValidInvoiceFilterDate("2026-02-29"), false);
  assert.equal(pageModule.isValidInvoiceFilterDate("2026-8-10"), false);
  assert.equal(
    pageModule.parseInvoiceFilterParams({ from: "2026-02-29" }).error,
    "Enter a valid From date.",
  );
  assert.equal(
    pageModule.parseInvoiceFilterParams({ to: "not-a-date" }).error,
    "Enter a valid To date.",
  );
  assert.equal(
    pageModule.parseInvoiceFilterParams({
      from: "2026-08-11",
      to: "2026-08-10",
    }).error,
    "From date cannot be after To date.",
  );
});

test("status and recorded-payment vocabularies reject unknown values", () => {
  assert.equal(
    pageModule.parseInvoiceFilterParams({ status: "paid" }).status,
    "paid",
  );
  assert.equal(
    pageModule.parseInvoiceFilterParams({ status: "refunded" }).error,
    "Select a valid invoice status.",
  );
  assert.equal(
    pageModule.parseInvoiceFilterParams({ payment: "cash" }).payment,
    "cash",
  );
  assert.equal(
    pageModule.parseInvoiceFilterParams({ payment: "customer_credit" }).error,
    "Select a valid recorded payment method.",
  );
});

class QueryTrace {
  constructor(rowsForSearch, traces) {
    this.rowsForSearch = rowsForSearch;
    this.operations = [];
    traces.push(this.operations);
  }

  record(name, ...args) {
    this.operations.push([name, ...args]);
    return this;
  }

  select(value) {
    return this.record("select", value);
  }

  eq(column, value) {
    return this.record("eq", column, value);
  }

  gte(column, value) {
    return this.record("gte", column, value);
  }

  lte(column, value) {
    return this.record("lte", column, value);
  }

  ilike(column, value) {
    return this.record("ilike", column, value);
  }

  order(column, options) {
    return this.record("order", column, options);
  }

  async limit(value) {
    this.record("limit", value);
    const search = this.operations.find(([name]) => name === "ilike");
    return {
      data: this.rowsForSearch(search?.[1]),
      error: null,
    };
  }
}

function row(id, invoiceDate, customerName) {
  return {
    id,
    invoice_no: `INV-${id}`,
    invoice_date: invoiceDate,
    status: "paid",
    grand_total: 150,
    amount_paid: 150,
    balance_due: 0,
    customers: customerName ? { name: customerName } : null,
  };
}

function loadDataModule(rowsForSearch) {
  const traces = [];
  const client = {
    from(table) {
      assert.equal(table, "invoices");
      return new QueryTrace(rowsForSearch, traces);
    },
  };
  const loadedModule = loadTypeScriptModule(dataPath, {
    "server-only": {},
    "@/lib/supabase/server": { createClient: async () => client },
    "@/lib/datetime": {
      getKarachiDayStartIso: () => "",
      getKarachiTodayDateString: () => "",
    },
  });
  return { loadedModule, traces };
}

test("database queries apply organization, date, status, and payment before limit", async () => {
  const duplicate = row("A", "2026-08-10T10:00:00.000Z", "Shared Customer");
  const invoiceOnly = row("B", "2026-08-10T09:00:00.000Z", null);
  const customerOnly = row("C", "2026-08-10T08:00:00.000Z", "Target Customer");
  const { loadedModule, traces } = loadDataModule((column) =>
    column === "invoice_no"
      ? [duplicate, invoiceOnly]
      : [duplicate, customerOnly],
  );

  const result = await loadedModule.listInvoices(
    "org-a",
    {
      search: "  target%_,()'  ",
      fromIso: "2026-08-09T19:00:00.000Z",
      toIso: "2026-08-10T18:59:59.999Z",
      paymentMethod: "card",
      status: "paid",
    },
    100,
  );

  assert.deepEqual(
    result.map((invoice) => invoice.id),
    ["A", "B", "C"],
  );
  assert.equal(traces.length, 2);
  for (const operations of traces) {
    const limitIndex = operations.findIndex(([name]) => name === "limit");
    for (const required of ["eq", "gte", "lte", "ilike", "order"]) {
      assert.ok(
        operations.findIndex(([name]) => name === required) < limitIndex,
        `${required} must occur before limit`,
      );
    }
    assert.ok(
      operations.some(
        ([name, column, value]) =>
          name === "eq" && column === "organization_id" && value === "org-a",
      ),
    );
    assert.ok(
      operations.some(
        ([name, column, value]) =>
          name === "eq" &&
          column === "payments.organization_id" &&
          value === "org-a",
      ),
    );
    assert.ok(
      operations.some(
        ([name, column, value]) =>
          name === "eq" && column === "payments.method" && value === "card",
      ),
    );
    assert.ok(
      operations.some(
        ([name, column, value]) =>
          name === "eq" && column === "status" && value === "paid",
      ),
    );
  }

  const patterns = traces.map((operations) =>
    operations.find(([name]) => name === "ilike"),
  );
  assert.deepEqual(patterns.map((operation) => operation[1]).sort(), [
    "customers.name",
    "invoice_no",
  ]);
  assert.ok(
    patterns.every((operation) => operation[2] === "%target\\%\\_,()'%"),
  );
});

test("recorded payment filtering uses an inner organization-scoped relationship", async () => {
  const invoice = row("MULTI", "2026-08-10T10:00:00.000Z", "Buyer");
  const { loadedModule, traces } = loadDataModule(() => [invoice]);
  const result = await loadedModule.listInvoices("org-a", {
    paymentMethod: "cash",
  });

  assert.deepEqual(
    result.map(({ id }) => id),
    ["MULTI"],
  );
  assert.equal(traces.length, 1);
  assert.match(traces[0][0][1], /payments!inner\(method, organization_id\)/);
  assert.ok(
    traces[0].some(
      ([name, column, value]) =>
        name === "eq" && column === "payments.method" && value === "cash",
    ),
  );
});

test("payment persistence proves Customer Credit is not a recorded method filter", () => {
  assert.match(posValidationSource, /payment_method === "customer_credit"/);
  assert.match(posValidationSource, /amount_paid !== 0/);
  assert.match(
    checkoutSource,
    /if v_amount_settled > 0 then[\s\S]*?insert into public\.payments/,
  );
  assert.match(checkoutSource, /p_payment_method, v_amount_settled/);
  assert.deepEqual(recordedMethods, [
    "cash",
    "card",
    "easypaisa",
    "jazzcash",
    "bank_transfer",
  ]);
  assert.doesNotMatch(
    dataSource.match(
      /RECORDED_INVOICE_PAYMENT_METHODS = \[[\s\S]*?\] as const;/,
    )?.[0] ?? "",
    /customer_credit/,
  );
});

test("invoice filter UI is complete, GET-only, sort-preserving, and print-independent", () => {
  for (const expected of [
    /key=\{filterFormKey\}/,
    /action="\/invoices"/,
    /method="get"/,
    /name="q"/,
    /name="from"/,
    /name="to"/,
    /name="payment"/,
    /name="status"/,
    />\s*Apply Filters\s*</,
    /href="\/invoices"[\s\S]*?>\s*Reset\s*</,
    /No invoices match these filters/,
    /currentParams=\{sortableParams\}/,
  ]) {
    assert.match(pageSource, expected);
  }
  assert.match(sortableSource, /Object\.entries\(currentParams\)/);
  assert.doesNotMatch(pageSource, /invoice-print|thermal|window\.print/);
  assert.doesNotMatch(dataSource, /\.(?:insert|update|upsert|delete|rpc)\(/);
  assert.doesNotMatch(dataSource, /\.or\(/);
});
