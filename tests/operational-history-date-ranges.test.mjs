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
const operationalHistory = loadTypeScriptModule(
  "src/lib/operational-history.ts",
);

function queryHarness({ countResults = [], dataResults = [], countErrors = [] } = {}) {
  const traces = [];
  let countIndex = 0;
  let dataIndex = 0;
  return {
    traces,
    client: {
      from(table) {
        const trace = { table, operations: [] };
        traces.push(trace);
        const query = {
          select(...args) {
            trace.operations.push(["select", ...args]);
            trace.isCount = args[1]?.count === "exact" && args[1]?.head === true;
            return query;
          },
          eq(...args) {
            trace.operations.push(["eq", ...args]);
            return query;
          },
          gte(...args) {
            trace.operations.push(["gte", ...args]);
            return query;
          },
          lte(...args) {
            trace.operations.push(["lte", ...args]);
            return query;
          },
          order(...args) {
            trace.operations.push(["order", ...args]);
            return query;
          },
          limit(...args) {
            trace.operations.push(["limit", ...args]);
            return query;
          },
          then(resolve) {
            if (trace.isCount) {
              const error = countErrors[countIndex] ?? null;
              const count = countResults[countIndex] ?? 0;
              countIndex += 1;
              return Promise.resolve({ data: null, error, count }).then(resolve);
            }
            const data = dataResults[dataIndex] ?? [];
            dataIndex += 1;
            return Promise.resolve({ data, error: null, count: null }).then(resolve);
          },
        };
        return query;
      },
    },
  };
}

function operations(trace, name) {
  return trace.operations.filter(([operation]) => operation === name);
}

test("Karachi history presets use exact business calendar dates", () => {
  const now = new Date("2026-09-01T02:00:00.000Z");
  assert.deepEqual(datetime.getKarachiHistoryPresetRange("today", now), {
    from: "2026-09-01",
    to: "2026-09-01",
  });
  assert.deepEqual(datetime.getKarachiHistoryPresetRange("yesterday", now), {
    from: "2026-08-31",
    to: "2026-08-31",
  });
  assert.deepEqual(datetime.getKarachiHistoryPresetRange("this_week", now), {
    from: "2026-08-31",
    to: "2026-09-01",
  });
  assert.deepEqual(datetime.getKarachiHistoryPresetRange("this_month", now), {
    from: "2026-09-01",
    to: "2026-09-01",
  });
  assert.deepEqual(datetime.getKarachiHistoryPresetRange("last_month", now), {
    from: "2026-08-01",
    to: "2026-08-31",
  });
});

test("Returns preserves recent 50 and count-gates an explicit range", async () => {
  const defaultHarness = queryHarness();
  const defaultReturns = loadTypeScriptModule("src/lib/data/returns.ts", {
    "server-only": {},
    "@/lib/supabase/server": { createClient: async () => defaultHarness.client },
    "@/lib/operational-history": operationalHistory,
  });

  const defaultResult = await defaultReturns.listReturns("org-a");
  assert.deepEqual(operations(defaultHarness.traces[0], "limit"), [["limit", 50]]);
  assert.equal(defaultResult.totalCount, null);

  const rangeHarness = queryHarness({ countResults: [55] });
  const rangeReturns = loadTypeScriptModule("src/lib/data/returns.ts", {
    "server-only": {},
    "@/lib/supabase/server": { createClient: async () => rangeHarness.client },
    "@/lib/operational-history": operationalHistory,
  });

  const rangeResult = await rangeReturns.listReturns("org-a", {
    from: "2026-07-31T19:00:00.000Z",
    to: "2026-08-31T18:59:59.999Z",
  });
  assert.equal(rangeResult.totalCount, 55);
  assert.equal(rangeResult.limitExceeded, false);
  assert.equal(rangeHarness.traces.length, 2);
  for (const trace of rangeHarness.traces) {
    assert.deepEqual(operations(trace, "gte"), [
      ["gte", "created_at", "2026-07-31T19:00:00.000Z"],
    ]);
    assert.deepEqual(operations(trace, "lte"), [
      ["lte", "created_at", "2026-08-31T18:59:59.999Z"],
    ]);
  }
  assert.deepEqual(operations(rangeHarness.traces[0], "limit"), []);
  assert.deepEqual(operations(rangeHarness.traces[1], "limit"), [["limit", 1000]]);
});

test("movement, closing, and shift histories count and fetch with identical range scope", async () => {
  const cases = [
    {
      path: "src/lib/data/inventory.ts",
      method: "listStockMovements",
      args: ["product-a", "org-a", { from: "start", to: "end" }],
      table: "stock_movements",
      column: "created_at",
    },
    {
      path: "src/lib/data/daily-closing.ts",
      method: "listRecentClosings",
      args: ["org-a", "branch-a", { from: "2026-08-01", to: "2026-08-31" }],
      table: "daily_closings",
      column: "closing_date",
    },
    {
      path: "src/lib/data/shifts.ts",
      method: "getShiftHistory",
      args: ["org-a", "branch-a", { from: "start", to: "end" }],
      table: "cash_shifts",
      column: "opened_at",
    },
  ];

  for (const entry of cases) {
    const harness = queryHarness({ countResults: [7] });
    const loadedModule = loadTypeScriptModule(entry.path, {
      "server-only": {},
      "@/lib/supabase/server": { createClient: async () => harness.client },
      "@/lib/operational-history": operationalHistory,
      "@/lib/datetime": datetime,
      "./daily-closing": {
        emptyMethodTotals: () => ({}),
        FINALIZED_INVOICE_STATUSES: ["paid", "partial", "unpaid"],
      },
    });
    const result = await loadedModule[entry.method](...entry.args);
    const traces = harness.traces.filter(({ table }) => table === entry.table);
    assert.equal(traces.length, 2, entry.table);
    for (const trace of traces) {
      assert.deepEqual(operations(trace, "gte"), [
        ["gte", entry.column, entry.args.at(-1).from],
      ]);
      assert.deepEqual(operations(trace, "lte"), [
        ["lte", entry.column, entry.args.at(-1).to],
      ]);
    }
    assert.deepEqual(operations(traces[0], "limit"), []);
    assert.deepEqual(operations(traces[1], "limit"), [["limit", 1000]]);
    assert.equal(result.totalCount, 7);
    assert.equal(result.limitExceeded, false);
  }
});

test("all explicit histories fail closed after the exact count exceeds max_rows", async () => {
  const cases = [
    {
      path: "src/lib/data/returns.ts",
      method: "listReturns",
      args: ["org-a", { from: "start", to: "end" }],
      table: "returns",
    },
    {
      path: "src/lib/data/inventory.ts",
      method: "listStockMovements",
      args: ["product-a", "org-a", { from: "start", to: "end" }],
      table: "stock_movements",
    },
    {
      path: "src/lib/data/daily-closing.ts",
      method: "listRecentClosings",
      args: ["org-a", "branch-a", { from: "2020-01-01", to: "2022-12-31" }],
      table: "daily_closings",
    },
    {
      path: "src/lib/data/shifts.ts",
      method: "getShiftHistory",
      args: ["org-a", "branch-a", { from: "start", to: "end" }],
      table: "cash_shifts",
    },
  ];

  for (const entry of cases) {
    const harness = queryHarness({ countResults: [1001] });
    const loadedModule = loadTypeScriptModule(entry.path, {
      "server-only": {},
      "@/lib/supabase/server": { createClient: async () => harness.client },
      "@/lib/operational-history": operationalHistory,
      "@/lib/datetime": datetime,
      "./daily-closing": {
        emptyMethodTotals: () => ({}),
        FINALIZED_INVOICE_STATUSES: ["paid", "partial", "unpaid"],
      },
    });
    const result = await loadedModule[entry.method](...entry.args);
    assert.deepEqual(result.rows, []);
    assert.equal(result.totalCount, 1001);
    assert.equal(result.limitExceeded, true);
    assert.equal(
      harness.traces.filter(({ table }) => table === entry.table).length,
      1,
      `${entry.table} must not run a data query after overflow`,
    );
  }
});

test("an exact-count failure stops before the history data query", async () => {
  const harness = queryHarness({
    countErrors: [{ message: "synthetic count failure" }],
  });
  const loadedReturns = loadTypeScriptModule("src/lib/data/returns.ts", {
    "server-only": {},
    "@/lib/supabase/server": { createClient: async () => harness.client },
    "@/lib/operational-history": operationalHistory,
  });

  await assert.rejects(
    loadedReturns.listReturns("org-a", { from: "start", to: "end" }),
    /Unable to count return history/,
  );
  assert.equal(harness.traces.length, 1);
  assert.equal(harness.traces[0].isCount, true);
});

test("application history limit is locked to the current PostgREST max_rows", () => {
  const config = source("supabase/config.toml");
  const configured = Number(config.match(/^max_rows\s*=\s*(\d+)$/m)?.[1]);
  assert.equal(configured, 1000);
  assert.equal(operationalHistory.OPERATIONAL_HISTORY_MAX_ROWS, configured);
  assert.match(source("src/lib/operational-history.ts"), /OPERATIONAL_HISTORY_MAX_ROWS = 1000/);
});

test("movement read action rejects invalid ranges before querying and preserves reader permission", async () => {
  const movementCalls = [];
  const actions = loadTypeScriptModule(
    "src/app/products/inventory-actions.ts",
    {
      "next/cache": { revalidatePath: () => undefined },
      "next/navigation": { redirect: () => undefined },
      "@/lib/supabase/server": { createClient: async () => ({}) },
      "@/lib/auth/session": {
        getCurrentContext: async () => ({
          user: { id: "user-a" },
          profile: { organization_id: "org-a", role: "owner" },
        }),
      },
      "@/lib/staff-permissions": { canManageStockNew: async () => true },
      "@/lib/validation/inventory": {
        stockLotSchema: {},
        stockAdjustmentSchema: {},
      },
      "@/lib/data/inventory": {
        listStockLots: async () => [],
        getProductStockSummary: async () => ({ marker: "unchanged" }),
        listStockMovements: async (...args) => {
          movementCalls.push(args);
          return { rows: [], totalCount: 0, limitExceeded: false };
        },
      },
      "@/lib/audit": { logAudit: () => undefined },
      "@/lib/errors/safe-action-error": { getSafeActionError: () => "error" },
      "@/lib/datetime": datetime,
    },
  );

  const invalid = await actions.getProductStockMovementsAction("product-a", {
    from: "2026-02-31",
  });
  assert.equal(invalid.errorCode, "invalid_from");
  assert.equal(movementCalls.length, 0);

  const valid = await actions.getProductStockMovementsAction("product-a", {
    from: "2026-09-01",
    to: "2026-09-01",
  });
  assert.equal(valid.error, null);
  assert.equal(movementCalls.length, 1);
  assert.deepEqual(movementCalls[0][2], {
    from: "2026-08-31T19:00:00.000Z",
    to: "2026-09-01T18:59:59.999Z",
  });
  assert.match(
    source("src/app/products/inventory-actions.ts"),
    /canManageStockNew/,
  );
});

test("route validation is strict and Daily Closing keeps operational reads outside history failure", () => {
  const icons = new Proxy({}, { get: () => () => null });
  const common = {
    "next/link": { default: () => null },
    "next/navigation": { redirect: () => undefined },
    "lucide-react": icons,
    "@/components/layout/app-shell": { AppShell: () => null },
    "@/components/ui/sortable-header": { SortableHeader: () => null },
    "@/components/ui/stat-card": { StatCard: () => null },
    "@/lib/auth/session": { getCurrentContext: async () => ({}) },
    "@/lib/datetime": datetime,
    "@/lib/operational-history": operationalHistory,
    "@/lib/env": { env: { isSupabaseConfigured: true } },
    "@/lib/formatters": { formatCurrency: String, formatNumber: String },
    "@/lib/sort": { sortData: (rows) => rows },
  };
  const returnsPage = loadTypeScriptModule("src/app/returns/page.tsx", {
    ...common,
    "@/lib/data/returns": { listReturns: async () => [] },
  });
  const dailyPage = loadTypeScriptModule("src/app/daily-closing/page.tsx", {
    ...common,
    "@/lib/permissions": {
      canCloseDay: () => true,
      canReopenDay: () => true,
      canOpenShift: () => true,
    },
    "@/lib/data/daily-closing": {
      PAYMENT_METHOD_LABELS: {},
      PAYMENT_METHOD_ORDER: [],
      todayLocalDate: () => "2026-09-01",
    },
    "@/lib/data/shifts": {},
    "./closing-form": { CloseDayForm: () => null, ReopenDayForm: () => null },
    "./print-button": {
      ClosingPrintButtons: () => null,
      ShiftPrintButton: () => null,
    },
    "./shift-ui": {
      OpenShiftForm: () => null,
      CloseShiftForm: () => null,
      ShiftHistoryTable: () => null,
      ShiftStaffSummary: () => null,
      ShiftPrintSection: () => null,
    },
  });

  assert.equal(
    returnsPage.parseReturnFilterParams({ from: "2026-02-31" }).errorCode,
    "invalid_from",
  );
  assert.equal(
    returnsPage.parseReturnFilterParams({
      from: "2026-09-02",
      to: "2026-09-01",
    }).errorCode,
    "reversed",
  );
  assert.equal(
    dailyPage.parseDailyClosingHistoryParams({ history_from: "2026-04-31" })
      .errorCode,
    "invalid_from",
  );
  assert.equal(
    dailyPage.parseDailyClosingHistoryParams({
      history_from: "2026-08-01",
      history_to: "2026-08-31",
    }).error,
    null,
  );

  const dailySource = source("src/app/daily-closing/page.tsx");
  assert.match(dailySource, /getDayActivity\(orgId, branchId, date\)/);
  assert.match(dailySource, /getClosing\(orgId, branchId, date\)/);
  assert.match(dailySource, /getCurrentShift\(orgId, branchId\)/);
  assert.match(
    dailySource,
    /historyRange\.error\s*\? Promise\.resolve\(emptyHistoryResult\)\s*:\s*listRecentClosings/,
  );
  assert.match(
    dailySource,
    /historyRange\.error\s*\? Promise\.resolve\(emptyHistoryResult\)\s*:\s*getShiftHistory/,
  );
});

test("new controls retain accessible errors, range-only reset, and isolated history copy", () => {
  const returnsPage = source("src/app/returns/page.tsx");
  const inventorySection = source("src/app/products/inventory-section.tsx");
  const dailyPage = source("src/app/daily-closing/page.tsx");

  for (const page of [returnsPage, inventorySection, dailyPage]) {
    assert.match(page, /role="alert"/);
    assert.match(page, /aria-invalid=/);
    assert.match(page, /Apply/);
    assert.match(page, />\s*Reset\s*</);
  }
  assert.match(returnsPage, /No returns match this date range/);
  assert.match(returnsPage, /This date range is too large to display safely/);
  assert.match(inventorySection, /getProductStockMovementsAction/);
  assert.match(
    inventorySection,
    /getProductInventoryDataAction\(productId, appliedMovementFilters\)/,
  );
  assert.match(dailyPage, /name="history_from"/);
  assert.match(dailyPage, /name="history_to"/);
  assert.match(
    dailyPage,
    /Selected Closing Date and Active Shift stay unchanged/,
  );
  assert.match(dailyPage, /new URLSearchParams\(\{ date \}\)/);
  assert.match(dailyPage, /shifts opened in this history range/);
  assert.match(dailyPage, /closings match this history range/);
});
