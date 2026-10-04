import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";
const require = createRequire(import.meta.url);
const root = new URL("../", import.meta.url);
function load(path, mocks = {}) {
  const code = ts.transpileModule(fs.readFileSync(new URL(path, root), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const loaded = { exports: {} };
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`)(
    id => Object.hasOwn(mocks, id) ? mocks[id] : require(id), loaded, loaded.exports);
  return loaded.exports;
}
const core = load("src/lib/backup/accounting-import.ts");
const schema = load("src/lib/backup/source-schema.ts");
const adapter = load("src/lib/backup/source-adapter.ts", { "./accounting-import": core, "./source-schema": schema });
const workflow = load("src/lib/backup/restore-workflow.ts", { "./accounting-import": core, "./source-adapter": adapter });
const id = "77126000-0000-4000-8000-000000000101";
const roots = { actorId: id, branchId: id };

test("fixed 21-table cluster and every legacy alias resolve without prototype fallbacks", () => {
  assert.equal(core.ACCOUNTING_TABLES.length, 21);
  for (const [alias, table] of Object.entries(core.BACKUP_TABLE_ALIASES)) assert.equal(core.accountingTable(alias), table);
  assert.equal(core.accountingTable("__proto__"), undefined);
  assert.equal(core.accountingTable("constructor"), undefined);
});
test("explicit zero and negative NUMERIC are accepted; missing and coercion are rejected", () => {
  for (const value of [0, "0.00", "-10.01", 123.45]) assert.equal(core.explicitOutstanding({ balance: value }, "balance"), String(value));
  for (const value of [null, undefined, false, "", "NaN", "1e3", "1.001", {}, "Infinity"]) assert.throws(() => core.explicitOutstanding({ balance: value }, "balance"));
  assert.throws(() => core.explicitOutstanding({}, "balance", true), /current supplier balance required/);
});
test("native snapshot keeps explicit balances and refuses duplicate/capability gaps", () => {
  const plan = adapter.prepareRestore({ customers: [{ id, name: "Customer", outstanding_balance: "123.45", ledger_anchor_balance: 1 }], suppliers: [{ id, name: "Supplier", outstanding_balance: "-10.00" }] }, "native", roots, false);
  assert.equal(plan.customers[0].payload.outstanding_balance, "123.45");
  assert.equal(plan.suppliers[0].payload.outstanding_balance, "-10.00");
  assert.equal(Object.hasOwn(plan.customers[0].payload, "ledger_anchor_balance"), false);
  assert.throws(() => adapter.prepareRestore({ customers: [{ id, name: "Missing" }] }, "native", roots, false), /current customer balance/);
  assert.throws(() => adapter.prepareRestore({ customers: [{ id }, { id }] }, "native", roots, false), /Duplicate/);
  assert.throws(() => adapter.prepareRestore({ invoiceItems: [{ id, product_type: "product" }] }, "native", roots, false), /lacks the invoice stock allocations/);
  assert.throws(() => adapter.prepareRestore({ futureBusinessRows: [{ id }] }, "native", roots, false), /Unsupported backup relation/);
  assert.throws(() => adapter.prepareRestore({ customers: [], Customers: [] }, "native", roots, false), /Duplicate/);
});
test("desktop uses upload-only mappings and preserves supplied supplier balance", () => {
  const next = () => id;
  const plan = adapter.prepareRestore({ Suppliers: [{ Id: 1, Name: "Supplier", OutstandingBalance: "12.34" }], Products: [{ Id: 2, ItemName: "Product", SupplierId: 1, Stock: 3 }] }, "desktop", roots, false, next);
  assert.equal(plan.suppliers[0].payload.outstanding_balance, "12.34");
  assert.equal(plan.products[0].payload.supplier_id, id);
  assert.equal(plan.products[0].payload.stock_quantity, 3);
  assert.throws(() => adapter.prepareRestore({ Suppliers: [{ Id: 1, Name: "Missing" }] }, "desktop", roots, false), /current supplier balance/);
  assert.throws(() => adapter.prepareRestore({ Products: [{ Id: 1, SupplierId: 8 }] }, "desktop", roots, false), /Unresolved/);
  assert.throws(() => adapter.prepareRestore({ SupplierPurchases: [{ Id: 1, TotalPurchaseValue: 12 }] }, "desktop", roots, false), /explicit supplier purchase headers/);
});
test("chunk serialization includes overhead and never exceeds the bounded transport", () => {
  const rows = Array.from({ length: 1200 }, (_, i) => ({ source_id: String(i), payload: { id, notes: "x".repeat(1000) } }));
  const chunks = core.accountingChunks(id, "customers", rows);
  assert.equal(chunks.flat().length, 1200);
  for (const [index, chunk] of chunks.entries()) {
    assert(core.serializedBytes({ operation: "stage_chunk", args: { p_job: id, p_table: "customers", p_index: index, p_rows: chunk } }) < core.IMPORT_REQUEST_BYTE_LIMIT);
    assert(chunk.length <= 1000);
  }
  assert.equal(core.accountingChunks(id, "customers", [{ source_id: id, payload: { id, notes: "x".repeat(524288) } }]).length, 1);
  assert.throws(() => core.accountingChunks(id, "customers", [{ source_id: id, payload: { id, notes: "x".repeat(1048576) } }]), /safe upload size/);
});

test("workflow stages before finalization, never repeats mutations, and completes ancillary last", async () => {
  const calls = []; const phases = [];
  const action = async (operation, args) => {
    calls.push({ operation, args });
    if (operation === "start_job") return { success: true, data: { ok: true, job_id: id, actor_id: id, branch_id: id } };
    if (operation === "get_job") return { success: true, data: { ok: true, manifest: Object.fromEntries(core.ACCOUNTING_TABLES.map(t => [t, { rows: t === "customers" ? 1 : 0 }])) } };
    return { success: true, data: { ok: true, digest: "sealed", receipt: { counts: { customers: 1 } } } };
  };
  await workflow.restoreBackup(action, { customers: [{ id, name: "Customer", outstanding_balance: 0 }], expenses: [{ id, amount: 0 }] }, "native", "3", false, p => phases.push(p.phase), () => {});
  assert.deepEqual(calls.map(c => c.operation), ["start_job", "stage_chunk", "get_job", "seal_job", "validate_job", "finalize_job", "restore_ancillary", "finish_job"]);
  assert.equal(phases.at(-1), "Completed");
  const failed = async (operation, args) => operation === "finalize_job" ? { success: false, error: "Lost response" } : action(operation, args);
  calls.length = 0;
  await assert.rejects(workflow.restoreBackup(failed, { customers: [{ id, name: "Customer", outstanding_balance: 0 }] }, "native", "3", false, () => {}, () => {}), /Lost response/);
  assert.equal(calls.filter(c => c.operation === "restore_ancillary").length, 0);
});

test("legacy core actions reject before context, mappings, even empty rows", async () => {
  let authCalls = 0;
  const actions = load("src/app/settings/backup-actions.ts", {
    "@/lib/supabase/server": {}, "@/lib/supabase/admin": {},
    "@/lib/auth/session": { getCurrentContext: () => { authCalls++; throw new Error("Must not authenticate"); } },
    "@/lib/audit": {}, "@/lib/errors/safe-action-error": {}, "next/cache": {}, "next/server": {},
    "@/lib/auth/identities": {}, "@/lib/backup/accounting-import": core,
  });
  for (const alias of [...core.ACCOUNTING_TABLES, ...Object.keys(core.BACKUP_TABLE_ALIASES), "unknown", "constructor"]) {
    for (const fn of [actions.importTableChunkAction, actions.importOnlineTableChunkAction]) {
      const result = await fn(id, alias, []);
      assert.equal(result.success, false, alias);
      assert.equal(result.inserted, 0);
    }
  }
  assert.equal(authCalls, 0);
});

test("migration separates required atomic inserts from guarded ancillary chunks without trust allocation", () => {
  const sql = fs.readFileSync(new URL("supabase/migrations/20261001093929_atomic_accounting_import.sql", root), "utf8");
  assert.match(sql, /create role backup_import_executor nologin nosuperuser nobypassrls/);
  assert.match(sql, /create trigger backup_customer_identity_gate before insert or update/);
  assert.match(sql, /create trigger backup_supplier_identity_gate before insert or update/);
  assert.match(sql, /for update nowait/);
  assert.doesNotMatch(sql, /create (sequence|table public\.)|ledger_posting_executor|execute format\(/i);
  const finalizer = sql.slice(sql.indexOf("create function backup_private.finalize_job"), sql.indexOf("create function backup_private.get_job"));
  assert(finalizer.indexOf("lock_identity") < finalizer.indexOf("for update"));
  assert(finalizer.indexOf("check_collisions") < finalizer.indexOf("insert_snapshot"));
  assert(finalizer.indexOf("insert_snapshot") < finalizer.indexOf("insert into backup_private.receipts"));
  assert.doesNotMatch(finalizer, /exception when|on conflict|loop/);
  assert.match(sql, /function backup_private\.actor_id\(\) returns uuid[\s\S]*?security invoker[\s\S]*?begin atomic[\s\S]*?select auth\.uid\(\)/i);
  assert.doesNotMatch(sql, /grant usage on schema auth to backup_/i);
  assert.match(sql, /grant execute on function backup_private\.actor_id\(\) to backup_identity_executor,backup_collision_reader/);
});
