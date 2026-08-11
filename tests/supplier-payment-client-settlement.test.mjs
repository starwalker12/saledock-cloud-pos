import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const actionsSource = read("src/app/suppliers/purchases/actions.ts");
const formSource = read(
  "src/app/suppliers/purchases/[id]/record-payment-form.tsx",
);
const permissionsSource = read("src/lib/permissions.ts");
const validationSource = read("src/lib/validation/supplier-purchases.ts");
const rpcSource = read(
  "supabase/migrations/0031_supplier_payment_fifo_allocation.sql",
);
const customerFormSource = read("src/app/customers/[id]/settlement-form.tsx");

function functionBody(source, name, nextName) {
  const start = source.indexOf(`export async function ${name}`);
  const end = source.indexOf(`export async function ${nextName}`, start + 1);
  assert.ok(start >= 0 && end > start, `${name} source boundary must exist`);
  return source.slice(start, end);
}

const createAction = functionBody(
  actionsSource,
  "createSupplierPurchaseAction",
  "recordSupplierPaymentAction",
);
const paymentAction = functionBody(
  actionsSource,
  "recordSupplierPaymentAction",
  "recordSupplierWriteOffAction",
);
const writeOffAction = actionsSource.slice(
  actionsSource.indexOf("export async function recordSupplierWriteOffAction"),
);

test("supplier payment role policy remains owner, admin, and manager only", () => {
  assert.match(
    permissionsSource,
    /PURCHASE_MANAGERS: Role\[\] = \["owner", "admin", "manager"\]/,
  );
  assert.doesNotMatch(
    permissionsSource,
    /PURCHASE_MANAGERS[^\n]+(?:cashier|technician)/,
  );
  assert.match(paymentAction, /const w = await requireManager\(\)/);
  assert.match(
    paymentAction,
    /You do not have permission to record supplier payments\./,
  );
});

test("the payment action preserves one exact financial RPC contract", () => {
  assert.equal(
    paymentAction.match(/\.rpc\(\s*"record_supplier_payment"/g)?.length,
    1,
  );
  assert.match(
    paymentAction,
    /p_supplier_id: data\.supplier_id,[\s\S]*p_purchase_id: data\.purchase_id \?\? null,[\s\S]*p_branch_id: w\.ctx\.profile!\.branch_id,[\s\S]*p_method: data\.method,[\s\S]*p_amount: data\.amount,[\s\S]*p_reference_no: data\.reference_no \?\? null,[\s\S]*p_note: data\.note \?\? null/,
  );
  assert.equal(
    actionsSource.match(/\.rpc\(\s*"record_supplier_payment"/g)?.length,
    1,
  );
});

test("purchase-specific and on-account IDs retain their established meaning", () => {
  assert.match(
    validationSource,
    /purchase_id:[\s\S]*z\.string\(\)\.uuid\(\)\.optional\(\)/,
  );
  assert.match(paymentAction, /p_purchase_id: data\.purchase_id \?\? null/);
  assert.match(
    rpcSource,
    /if p_purchase_id is null then[\s\S]*order by purchase_date asc, created_at asc[\s\S]*if p_purchase_id is not null then/,
  );
});

test("the RPC retains exact tenant, balance, FIFO, and one-ledger semantics", () => {
  assert.match(rpcSource, /security invoker/);
  assert.match(
    rpcSource,
    /where id = p_supplier_id and organization_id = v_org_id[\s\S]*for update/,
  );
  assert.match(
    rpcSource,
    /where id = p_purchase_id and organization_id = v_org_id[\s\S]*for update/,
  );
  assert.equal(
    rpcSource.match(/insert into public\.supplier_payments/g)?.length,
    1,
  );
  assert.equal(
    rpcSource.match(/insert into public\.supplier_ledger_entries/g)?.length,
    1,
  );
  assert.match(
    rpcSource,
    /v_supplier_balance := v_supplier_balance - p_amount;[\s\S]*update public\.suppliers/,
  );
  assert.match(
    rpcSource,
    /v_alloc := least\(v_remaining, v_inv\.balance_due\)/,
  );
});

test("payment Action validation and RPC errors precede truthful success", () => {
  const parseAt = paymentAction.indexOf("recordPaymentSchema.safeParse");
  const rpcAt = paymentAction.indexOf('"record_supplier_payment"');
  const rpcErrorAt = paymentAction.indexOf("if (error)", rpcAt);
  const idGuardAt = paymentAction.indexOf("if (!paymentId)");
  const successAt = paymentAction.indexOf('success: "Payment recorded."');
  assert.ok(parseAt >= 0 && parseAt < rpcAt);
  assert.ok(rpcAt < rpcErrorAt && rpcErrorAt < idGuardAt);
  assert.ok(idGuardAt < successAt);
  assert.equal(
    paymentAction.match(/action: "supplier_payment\.recorded"/g)?.length,
    1,
  );
});

test("the mutation Action returns without payment-path invalidation", () => {
  assert.doesNotMatch(paymentAction, /revalidatePath\s*\(/);
  for (const path of [
    'revalidatePath("/suppliers/purchases")',
    'revalidatePath("/products")',
    'revalidatePath("/dashboard")',
    'revalidatePath("/reports")',
  ]) {
    assert.match(createAction, new RegExp(path.replace(/[()]/g, "\\$&")));
  }
  assert.match(
    writeOffAction,
    /revalidatePath\(`\/suppliers\/\$\{supplierId\}\/ledger`\)/,
  );
  assert.match(writeOffAction, /revalidatePath\("\/suppliers\/dues"\)/);
  assert.match(writeOffAction, /revalidatePath\("\/dashboard"\)/);
});

test("client settlement finishes before unique same-route reconciliation", () => {
  assert.match(
    formSource,
    /useActionState\(\s*paymentAction,\s*initialState,?\s*\)/,
  );
  assert.match(
    formSource,
    /const next = await recordSupplierPaymentAction\(previous, formData\);[\s\S]*if \(next\.success\) \{[\s\S]*setAmount\(0\);[\s\S]*setRef\(""\);[\s\S]*setNote\(""\);[\s\S]*return next/,
  );
  assert.match(formSource, /<form action=\{action\} onSubmit=\{submit\}/);
  assert.match(
    formSource,
    /useEffect\(\(\) => \{[\s\S]*if \(!state\.success \|\| !state\.payment_id\) return;[\s\S]*url\.searchParams\.set\("suppaystate", crypto\.randomUUID\(\)\);[\s\S]*router\.replace\(`[\s\S]*scroll: false[\s\S]*\);[\s\S]*\}, \[router, state\.payment_id, state\.success\]\)/,
  );
  assert.doesNotMatch(formSource, /router\.refresh\s*\(/);
  assert.doesNotMatch(formSource, /setTimeout|setInterval|sleep\s*\(/);
  assert.doesNotMatch(formSource, /retry|resubmit/i);
});

test("same-tick duplicate activation is synchronously locked and released", () => {
  assert.match(formSource, /const submissionLocked = useRef\(false\)/);
  assert.match(
    formSource,
    /if \(submissionLocked\.current\) \{[\s\S]*e\.preventDefault\(\);[\s\S]*return;[\s\S]*\}[\s\S]*submissionLocked\.current = true/,
  );
  assert.match(
    formSource,
    /if \(!pending\) \{[\s\S]*submissionLocked\.current = false/,
  );
  assert.match(formSource, /disabled=\{pending \|\| amount <= 0\}/);
});

test("success, errors, and form clearing remain visible and truthful", () => {
  assert.match(formSource, /role="alert"/);
  assert.match(formSource, /role="status"/);
  assert.match(formSource, /aria-live="polite"/);
  assert.match(
    formSource,
    /if \(next\.success\) \{[\s\S]*setAmount\(0\);[\s\S]*setRef\(""\);[\s\S]*setNote\(""\)/,
  );
  assert.match(paymentAction, /success: "Payment recorded\."/);
  assert.match(formSource, /Recording…/);
  assert.doesNotMatch(formSource, /window\.location\.reload|location\.reload/);
});

test("the supplier correction leaves the delivered customer mechanism intact", () => {
  assert.match(customerFormSource, /useActionState/);
  assert.match(customerFormSource, /searchParams\.set\("paystate"/);
  assert.match(customerFormSource, /submissionLocked/);
  assert.doesNotMatch(
    formSource,
    /recordCreditPaymentAction|searchParams\.set\("paystate"/,
  );
});
