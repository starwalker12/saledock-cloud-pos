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

function queryHarness() {
  const traces = [];
  return {
    traces,
    client: {
      from(table) {
        const trace = { table, operations: [] };
        traces.push(trace);
        const query = {
          select(...args) {
            trace.operations.push(["select", ...args]);
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
            return Promise.resolve({ data: [], error: null }).then(resolve);
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

test("Returns preserves recent 50 by default and never caps an explicit range", async () => {
  const harness = queryHarness();
  const returns = loadTypeScriptModule("src/lib/data/returns.ts", {
    "server-only": {},
    "@/lib/supabase/server": { createClient: async () => harness.client },
  });

  await returns.listReturns("org-a");
  assert.deepEqual(operations(harness.traces[0], "limit"), [["limit", 50]]);

  await returns.listReturns("org-a", {
    from: "2026-07-31T19:00:00.000Z",
    to: "2026-08-31T18:59:59.999Z",
  });
  assert.deepEqual(operations(harness.traces[1], "limit"), []);
  assert.deepEqual(operations(harness.traces[1], "gte"), [
    ["gte", "created_at", "2026-07-31T19:00:00.000Z"],
  ]);
  assert.deepEqual(operations(harness.traces[1], "lte"), [
    ["lte", "created_at", "2026-08-31T18:59:59.999Z"],
  ]);
});

test("movement, closing, and shift histories filter server-side without explicit-range caps", async () => {
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
    const harness = queryHarness();
    const loadedModule = loadTypeScriptModule(entry.path, {
      "server-only": {},
      "@/lib/supabase/server": { createClient: async () => harness.client },
      "@/lib/datetime": datetime,
      "./daily-closing": {
        emptyMethodTotals: () => ({}),
        FINALIZED_INVOICE_STATUSES: ["paid", "partial", "unpaid"],
      },
    });
    await loadedModule[entry.method](...entry.args);
    const trace = harness.traces.find(({ table }) => table === entry.table);
    assert.ok(trace, entry.table);
    assert.deepEqual(operations(trace, "gte"), [
      ["gte", entry.column, entry.args.at(-1).from],
    ]);
    assert.deepEqual(operations(trace, "lte"), [
      ["lte", entry.column, entry.args.at(-1).to],
    ]);
    assert.deepEqual(operations(trace, "limit"), []);
  }
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
          return [];
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
    /historyRange\.error\s*\? Promise\.resolve\(\[\]\)\s*:\s*listRecentClosings/,
  );
  assert.match(
    dailySource,
    /historyRange\.error\s*\? Promise\.resolve\(\[\]\)\s*:\s*getShiftHistory/,
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
});
