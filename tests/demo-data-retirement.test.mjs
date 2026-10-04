import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const source = readFileSync(new URL("../src/app/settings/demo-actions.ts", import.meta.url), "utf8");
const ast = ts.createSourceFile("demo-actions.ts", source, ts.ScriptTarget.Latest, true);
const actions = [
  { name: "loadDemoDataAction", operation: "create", phrase: "CREATE DEMO DATA", denial: "Only Owners and Admins can create demo data.", audit: "Demo data creation denied", retired: "Demo data creation is temporarily unavailable while SaleDock protects accounting history. Existing shop data was not changed." },
  { name: "removeDemoDataAction", operation: "remove", phrase: "REMOVE DEMO DATA", denial: "Only Owners and Admins can remove demo data.", audit: "Demo data removal denied", retired: "Demo data removal is temporarily unavailable while SaleDock protects accounting history. Existing demo and shop data were left unchanged." },
];
const businessTables = ["product_categories", "suppliers", "products", "product_stock_lots", "stock_movements", "customers", "invoices", "invoice_items", "invoice_item_stock_allocations", "payments", "customer_ledger_entries", "returns", "return_items", "return_stock_allocations", "expenses", "repairs", "repair_status_history", "daily_closings"];
const observations = [];
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function harness({ role = "owner", authenticated = true, missingProfile = false, contextError, flag = true } = {}) {
  const calls = { context: 0, audit: [], client: 0, adminClient: 0, from: [], insert: 0, update: 0, upsert: 0, delete: 0, rpc: 0, flag: 0, invalidate: 0 };
  const existing = Object.fromEntries(businessTables.map(table => [table, [{ id: `existing-${table}`, marker: "[DEMO] existing history", outstanding_balance: table === "customers" ? 360 : 0 }]]));
  const before = structuredClone(existing);
  const forbidden = method => (...args) => {
    if (method === "from") calls.from.push(args[0]); else calls[method]++;
    throw new Error(`Forbidden demo operation: ${method}`);
  };
  const client = Object.fromEntries(["from", "insert", "update", "upsert", "delete", "rpc"].map(method => [method, forbidden(method)]));
  const dependencies = {
    "@/lib/auth/session": { getCurrentContext: async () => {
      calls.context++;
      if (contextError) throw contextError;
      return { user: authenticated ? { id: "synthetic-auth-user" } : null, profile: authenticated && !missingProfile ? { id: "synthetic-auth-user", role, organization_id: "synthetic-org", branch_id: "synthetic-branch", is_active: true } : null };
    } },
    "@/lib/audit": { logAudit: async value => { calls.audit.push(value); } },
    "@/lib/supabase/server": { createClient: async () => { calls.client++; return client; } },
    "@/lib/supabase/admin": { createAdminClient: async () => { calls.adminClient++; return client; } },
    "@/lib/platform/settings": { getPublicPlatformSetting: async () => { calls.flag++; if (flag instanceof Error) throw flag; return flag; } },
    "next/cache": { revalidatePath: forbidden("invalidate") },
  };
  const loaded = { exports: {} };
  new Function("require", "module", "exports", compiled)(id => {
    assert(Object.hasOwn(dependencies, id), `Unexpected dependency: ${id}`);
    return dependencies[id];
  }, loaded, loaded.exports);
  return { exports: loaded.exports, calls, existing, before };
}

function noBusinessAccess(h) {
  for (const name of ["client", "adminClient", "insert", "update", "upsert", "delete", "rpc", "flag", "invalidate"]) assert.equal(h.calls[name], 0, name);
  assert.deepEqual(h.calls.from, []);
  assert.deepEqual(h.existing, h.before);
}
function form(confirmation) {
  const input = new FormData();
  if (confirmation !== undefined) input.set("confirmation", confirmation);
  return input;
}
async function invoke(h, action, input = form(action.phrase), previous = null) {
  const result = await h.exports[action.name](previous, input);
  assert.equal(h.calls.context, 1);
  assert.equal(result.success, false);
  assert.equal(result.message, undefined);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
  noBusinessAccess(h);
  return result;
}

for (const action of actions) {
  for (const role of ["unauthenticated", "owner", "admin", "manager", "cashier", "technician"]) {
    test(`${action.operation}: ${role} is refused without demo reads or writes`, async () => {
      const h = harness({ role, authenticated: role !== "unauthenticated" });
      const result = await invoke(h, action);
      const privileged = role === "owner" || role === "admin";
      assert.equal(result.error, role === "unauthenticated" ? "Not authenticated." : privileged ? action.retired : action.denial);
      assert.deepEqual(h.calls.audit, !privileged && role !== "unauthenticated" ? [{ module: "settings", action: "permission.denied", details: action.audit }] : []);
      observations.push({ action: action.name, role, result, demoBusinessReads: 0, demoBusinessWrites: 0, existingRowsUnchanged: true, existingPermissionDenialAudits: h.calls.audit.length });
    });
  }
  for (const role of ["owner", "admin"]) {
    for (const [label, confirmation] of [["missing", undefined], ["blank", ""], ["wrong", "WRONG"], ["old exact create", "CREATE DEMO DATA"], ["old exact remove", "REMOVE DEMO DATA"]]) {
      test(`${action.operation}: ${role}, ${label} confirmation cannot revive mutation`, async () => {
        const h = harness({ role });
        const result = await invoke(h, action, form(confirmation));
        assert.equal(result.error, action.retired);assert.deepEqual(h.calls.audit, []);
        observations.push({ action: action.name, role, confirmation: label, retired: true, businessWrites: 0 });
      });
    }
    for (const [label, flag] of [["true", true], ["false", false], ["unavailable", new Error("QA platform setting unavailable")]]) {
      test(`${action.operation}: ${role}, platform flag ${label} is never consulted`, async () => {
        const h = harness({ role, flag });
        assert.equal((await invoke(h, action)).error, action.retired);
        assert.equal(h.calls.flag, 0);assert.equal(h.calls.adminClient, 0);assert.deepEqual(h.calls.audit, []);
        observations.push({ action: action.name, role, platformFlag: label, flagReads: 0, retired: true, businessWrites: 0 });
      });
    }
    test(`${action.operation}: direct stale-client payload ignores forged state and identity`, async () => {
      const h = harness({ role });const input = form(action.phrase);
      input.set("role", "owner");input.set("organization_id", "forged-org");input.set("demo_data_enabled", "true");
      assert.equal((await invoke(h, action, input, { success: true, message: "legacy success", confirmation: action.phrase })).error, action.retired);
    });
  }
  for (const role of ["owner", "manager", "unauthenticated"]) {
    test(`${action.operation}: ${role} authorization does not depend on supplied form contents`, async () => {
      const h = harness({ role, authenticated: role !== "unauthenticated" });
      const poison = new Proxy({}, { get() { assert.fail("Retired action must not read supplied form contents"); } });
      const result = await invoke(h, action, poison);
      assert.equal(result.error, role === "owner" ? action.retired : role === "manager" ? action.denial : "Not authenticated.");
    });
  }
  test(`${action.operation}: missing profile retains authentication denial`, async () => {
    const h = harness({ missingProfile: true });assert.equal((await invoke(h, action)).error, "Not authenticated.");assert.deepEqual(h.calls.audit, []);
  });
  test(`${action.operation}: context failure refuses safely without raw detail or writes`, async () => {
    const h = harness({ contextError: { code: "P0001", message: "QA_PRIVATE_CONTEXT_CANARY" } });
    assert.equal((await invoke(h, action)).error, "We couldn't verify your access. Please try again.");assert.deepEqual(h.calls.audit, []);
  });
  test(`${action.operation}: unsupported role cannot acquire Owner response`, async () => {
    const h = harness({ role: "future-role" });assert.equal((await invoke(h, action)).error, action.denial);assert.equal(h.calls.audit.length, 1);
  });
  test(`${action.operation}: existing demo records and nonzero balance remain untouched`, async () => {
    const h = harness();await invoke(h, action);assert.equal(h.existing.customers[0].outstanding_balance, 360);assert.deepEqual(h.existing, h.before);
  });
}

test("active source contains no Supabase business query/mutation or privileged platform client", () => {
  const forbidden = new Set(["from", "insert", "update", "upsert", "delete", "rpc"]);
  const calls = [], imports = [];
  function walk(node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && forbidden.has(node.expression.name.text)) calls.push(node.expression.name.text);
    if (ts.isImportDeclaration(node)) imports.push(node.moduleSpecifier.text);
    ts.forEachChild(node, walk);
  }
  walk(ast);assert.deepEqual(calls, []);assert.deepEqual(imports.sort(), ["@/lib/audit", "@/lib/auth/session"]);
  assert.equal(ast.statements[0].expression.text, "use server");
  const declarations = ast.statements.filter(ts.isFunctionDeclaration);
  assert.deepEqual(declarations.map(node => node.name.text).sort(), actions.map(a => a.name).sort());
});

test("both stable async exports and useActionState contracts remain compatible", () => {
  for (const action of actions) {
    const node = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name.text === action.name);
    assert(node.modifiers.some(m => m.kind === ts.SyntaxKind.ExportKeyword));
    assert(node.modifiers.some(m => m.kind === ts.SyntaxKind.AsyncKeyword));
    assert.deepEqual(node.parameters.map(p => p.type.getText(ast)), ["DemoActionState | null", "FormData"]);
    assert.equal(node.type.getText(ast), "Promise<DemoActionState>");
  }
  const tab = readFileSync(new URL("../src/app/settings/demo-tab.tsx", import.meta.url), "utf8");
  for (const action of actions) assert(tab.includes(action.name));
});

test("Settings still excludes Demo tab navigation and content", () => {
  const settings = readFileSync(new URL("../src/app/settings/page.tsx", import.meta.url), "utf8");
  const page = ts.createSourceFile("page.tsx", settings, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let hidden = false, references = 0;
  function walk(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(page) === "SHOW_DEMO_TAB") hidden = node.initializer.kind === ts.SyntaxKind.FalseKeyword;
    if (ts.isIdentifier(node) && node.text === "SHOW_DEMO_TAB") references++;
    ts.forEachChild(node, walk);
  }
  walk(page);assert.equal(hidden, true);assert(references >= 3);
  assert.match(settings, /SHOW_DEMO_TAB\s*\?\s*\[\{ id: "demo-data"/);
  assert.match(settings, /isPrivileged && SHOW_DEMO_TAB/);
});

test.after(() => {
  if (process.env.QA_EVIDENCE_DIR) writeFileSync(`${process.env.QA_EVIDENCE_DIR}/demo-retirement-${process.env.QA_RUN_LABEL || "run"}.json`, JSON.stringify({ observations, realDatabaseAccess: false, strictBusinessSpies: true, noCleanupAttempt: true, existingDataModelUnchanged: true, directServerFunctionInvocationNotBrowserHttp: true, crossBuildNextActionIdCompatibilityNotClaimed: true }, null, 2)+"\n", { flag: "wx" });
});
