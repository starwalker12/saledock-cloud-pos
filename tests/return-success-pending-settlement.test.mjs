import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const action = source("src/app/invoices/[id]/returns/actions.ts");
const form = source("src/app/invoices/[id]/returns/return-form.tsx");
const migration = source("supabase/migrations/20261011081701_exact_return_math_v1.sql");

test("Return uses one authenticated RPC with server-calculated settlement and a durable key", () => {
  assert.equal(action.match(/\.rpc\("create_invoice_return"/g)?.length, 1);
  assert.match(action, /canProcessReturns\(ctx\.profile\.role\)/);
  assert.match(action, /canReturnNew\(ctx\.profile\)/);
  assert.match(action, /p_refund_amount: null/);
  assert.match(action, /p_idempotency_key: parsed\.data\.idempotency_key/);
  assert.match(action, /p_items: selectedItems/);
  assert.match(action, /p_refund_method: parsed\.data\.refund_method \?\? null/);
  assert.doesNotMatch(action, /retry\s*\(|setTimeout|setInterval/);
});

test("auth routing remains typed and before mutation without private Next internals", () => {
  const rpcAt = action.indexOf('.rpc("create_invoice_return"');
  for (const path of ["/login", "/setup"]) {
    const at = action.indexOf(`authRedirect: "${path}"`);
    assert.ok(at > 0 && at < rpcAt);
  }
  assert.match(form, /if \(result\.authRedirect\) \{ router\.replace\(result\.authRedirect\); return result; \}/);
  assert.match(form, /supabase\.auth\.getSession\(\)/);
  assert.match(form, /authRedirect: "\/login" as const/);
  assert.doesNotMatch(action + form, /next\/dist\/|NEXT_REDIRECT|digest/);
});

test("post-response cache reconciliation never duplicates the database business audit", () => {
  const afterAt = action.indexOf("after(async () => {");
  const resultAt = action.indexOf("return {", afterAt);
  const postResponse = action.slice(afterAt, resultAt);
  for (const path of ['`/invoices/${parsed.data.invoice_id}`', '"/invoices"', '"/returns"', '"/products"', '"/customers"', '"/dashboard"']) {
    assert.ok(postResponse.includes(`revalidatePath(${path})`));
  }
  assert.equal(postResponse.match(/revalidatePath\(/g)?.length, 6);
  assert.doesNotMatch(postResponse, /logAudit\(/);
  assert.doesNotMatch(action.slice(0, afterAt), /revalidatePath\(/);
  assert.match(migration, /return\.completed/);
});

test("success settles once before same-route reconciliation", () => {
  assert.match(form, /useActionState\(returnAction, initial\)/);
  assert.match(form, /if \(result\.success\) setLocalSuccess\(result\)/);
  assert.match(form, /if \(reconciledReturn\.current === resultKey\) return/);
  assert.match(form, /reconciledReturn\.current = resultKey/);
  assert.match(form, /url\.searchParams\.set\("returnstate", crypto\.randomUUID\(\)\)/);
  assert.match(form, /scroll: false/);
  assert.doesNotMatch(form, /setTimeout|setInterval|sleep\s*\(/);
});

test("uncertain outcome keeps identical request/key and only offers explicit safe replay", () => {
  assert.match(form, /sessionStorage\.setItem\(storageKey, JSON\.stringify\(saved\)\)/);
  assert.ok(form.indexOf("sessionStorage.setItem") < form.indexOf("await createInvoiceReturnAction"));
  assert.match(form, /if \(submissionLocked\.current \|\| outcomeUncertainRef\.current \|\| recovery\)/);
  assert.match(form, /for \(const \[key, value\] of recovery\.entries\) formData\.append\(key, value\)/);
  assert.match(form, /startTransition\(\(\) => action\(formData\)\)/);
  assert.match(form, /Retry saved return/);
  assert.match(form, /outcomeUncertainRef\.current = true/);
  assert.equal(form.match(/await createInvoiceReturnAction\(/g)?.length, 1);
  assert.match(action, /if \(!row\?\.return_id\) return \{[\s\S]*outcomeUncertain: true/);
});

test("all rows preserve hidden quantity/restock alignment while exhausted rows are disabled", () => {
  for (const field of ["invoice_item_id", "quantity", "restock_quantity"]) {
    assert.match(form, new RegExp(`type="hidden" name="${field}"`));
    assert.match(action, new RegExp(`formData\\.getAll\\("${field}"\\)`));
  }
  assert.match(form, /item\.quantity_returnable === 0/);
  assert.match(form, /disabled=\{pending \|\| !!recovery \|\| outcomeUncertain \|\| blocked\}/);
});

test("accessible feedback exposes distinct credit, debt and refund with no editable refund", () => {
  for (const marker of ['aria-busy={pending}', 'role="status"', 'aria-live="polite"', 'role="alert"', "Return processed", "View return", "Refresh invoice", "Debt relieved", "Refund to customer"]) assert.ok(form.includes(marker), marker);
  assert.doesNotMatch(form, /name="refund_amount"/);
  assert.match(form, /Number\(settlement\.refund\) > 0/);
});

test("new RPC keeps source consumption, original cost and debt-only trusted posting", () => {
  assert.match(migration, /return_item_source_allocations/);
  assert.match(migration, /invoice_payment_allocations/);
  assert.match(migration, /'refund', 'credit'/);
  assert.match(migration, /return_math_version/);
  assert.match(migration, /idempotent_replay/);
  assert.match(migration, /quantity_remaining = quantity_remaining \+/);
});
