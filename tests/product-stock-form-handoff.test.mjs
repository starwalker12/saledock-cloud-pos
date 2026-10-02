import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = (path) => readFileSync(path, "utf8");
function load(path, mocks = {}) {
  const loadedModule = { exports: {} };
  const js = ts.transpileModule(source(path), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText;
  new Function("require", "module", "exports", js)(
    (id) => Object.hasOwn(mocks, id) ? mocks[id] : require(id), loadedModule, loadedModule.exports,
  );
  return loadedModule.exports;
}
const datetime = load("src/lib/datetime.ts");
const inventory = load("src/lib/validation/inventory.ts", { "@/lib/datetime": datetime });
const valid = { quantity_received: "5", unit_cost: "100" };
const optionals = ["lot_number", "notes", "supplier_id", "purchase_date"];

for (const field of optionals) {
  for (const value of [undefined, null, "", " \t "]) {
    test(`${field} accepts and normalizes ${JSON.stringify(value)}`, () => {
      const parsed = inventory.stockLotSchema.parse({ ...valid, [field]: value });
      assert.equal(parsed[field] ?? null, null);
    });
  }
}

test("all blank optionals accept valid stock without internal Zod wording", () => {
  const parsed = inventory.stockLotSchema.parse({ ...valid, ...Object.fromEntries(optionals.map(f => [f, ""])) });
  assert.equal(parsed.quantity_received, 5);
  assert.equal(parsed.unit_cost, 100);
  for (const field of optionals) assert.equal(parsed[field], undefined);
});

for (const [field, values] of Object.entries({ quantity_received: [0, -1, 1.5, "bad", "", undefined], unit_cost: [-1, "bad", "", " ", null, undefined] })) {
  for (const value of values) {
    test(`required ${field} rejects ${JSON.stringify(value)} with a user message`, () => {
      const parsed = inventory.stockLotSchema.safeParse({ ...valid, [field]: value });
      assert.equal(parsed.success, false);
      assert.doesNotMatch(parsed.error.issues[0].message, /Too small|expected string|Invalid input/i);
    });
  }
}
test("zero cost and trimmed optional values are valid; impossible dates and malformed supplier IDs fail", () => {
  const parsed = inventory.stockLotSchema.parse({ ...valid, unit_cost: 0, lot_number: " LOT-1 ", notes: " Restock ", purchase_date: "2026-02-28" });
  assert.equal(parsed.unit_cost, 0); assert.equal(parsed.lot_number, "LOT-1"); assert.equal(parsed.notes, "Restock");
  for (const purchase_date of ["2026-02-30", "not-a-date"]) {
    assert.equal(inventory.stockLotSchema.safeParse({ ...valid, purchase_date }).success, false);
  }
  assert.equal(inventory.stockLotSchema.safeParse({ ...valid, supplier_id: "bad" }).success, false);
});

function actionHarness(allowed = true) {
  const calls = [];
  const actions = load("src/app/products/inventory-actions.ts", {
    "next/cache": { revalidatePath: () => {} },
    "next/navigation": { redirect: () => { throw new Error("Unexpected redirect"); } },
    "@/lib/supabase/server": { createClient: async () => ({ rpc: async (...args) => { calls.push(args); return { error: null }; } }) },
    "@/lib/auth/session": { getCurrentContext: async () => ({ user: { id: "owner" }, profile: { organization_id: "org", role: "owner" } }) },
    "@/lib/staff-permissions": { canManageStockNew: async () => allowed },
    "@/lib/validation/inventory": inventory,
    "@/lib/data/inventory": {},
    "@/lib/audit": { logAudit: () => {} },
    "@/lib/errors/safe-action-error": {},
    "@/lib/datetime": { ...datetime, getKarachiTodayDateString: () => "2026-10-02" },
  });
  return { actions, calls };
}
function form(values) { const fd = new FormData(); for (const [key, value] of Object.entries(values)) fd.set(key, value); return fd; }
test("blank optional Restock form invokes the existing RPC exactly once with nullable payload", async () => {
  const { actions, calls } = actionHarness();
  const result = await actions.addStockLotAction("product-id", { error: null, success: null }, form({ ...valid, ...Object.fromEntries(optionals.map(f => [f, ""])) }));
  assert.equal(result.error, null); assert.ok(result.success);
  assert.deepEqual(calls, [["add_stock_lot", {
    p_product_id: "product-id", p_lot_number: null, p_purchase_date: "2026-10-02", p_qty_received: 5,
    p_unit_cost: 100, p_supplier_id: null, p_notes: null,
  }]]);
});
test("invalid input and permission denial never invoke a stock writer", async () => {
  for (const allowed of [true, false]) {
    const { actions, calls } = actionHarness(allowed);
    const result = await actions.addStockLotAction("product-id", { error: null, success: null }, form({ ...valid, quantity_received: "0" }));
    assert.ok(result.error); assert.equal(calls.length, 0);
  }
});
test("handoff consumes one confirmed saved identity; services and failed saves cannot open inventory", () => {
  const action = source("src/app/products/actions.ts");
  const form = source("src/app/products/product-form.tsx");
  const modal = source("src/app/products/product-form-modal.tsx");
  const tab = source("src/app/products/products-tab.tsx");
  assert.match(action, /const productId = id \?\? crypto.randomUUID\(\)/);
  assert.match(action, /product: \{ id: productId, name: payload.name, type: payload.type \}/);
  assert.match(form, /handledState.current === state/);
  assert.match(form, /state.success && state.product/);
  assert.match(form, /pending \|\| submitting.current/);
  assert.match(form, /!dirty/);
  assert.match(form, /!isService && onManageStock/);
  assert.match(modal, /if \(onSaved\) onSaved\(product, manageStock\);\s*else onClose\(\)/);
  assert.match(tab, /setModal\(null\);\s*setInventoryProduct\(product\)/);
  assert.match(tab, /initialTab="restock"/);
  assert.doesNotMatch(form + tab, /add_stock_lot|\.from\("products"\)\.update/);
});
test("Inventory reuses safe writers, default tabs and shared portal; actual pending disables duplicate submit", () => {
  const ui = source("src/app/products/inventory-section.tsx");
  assert.match(ui, /export type InventoryTab = "lots" \| "movements" \| "restock" \| "adjust"/);
  assert.match(ui, /initialTab = "lots"/);
  assert.match(ui, /<FormModal open/);
  assert.match(ui, /lotState, lotAction, lotPending/);
  assert.match(ui, /adjustState, adjustAction, adjustPending/);
  assert.match(ui, /const pending = lotPending \|\| adjustPending/);
  assert.equal((ui.match(/await addStockLotAction\(/g) ?? []).length, 1);
  assert.equal((ui.match(/await recordStockAdjustmentAction\(/g) ?? []).length, 1);
});
