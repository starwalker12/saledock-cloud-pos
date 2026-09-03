import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const actionSource = readFileSync(
  new URL("../src/app/invoices/[id]/returns/actions.ts", import.meta.url),
  "utf8",
);
const formSource = readFileSync(
  new URL("../src/app/invoices/[id]/returns/return-form.tsx", import.meta.url),
  "utf8",
);
const rpcSource = readFileSync(
  new URL(
    "../supabase/migrations/20260621000000_soften_rpc_error_wording.sql",
    import.meta.url,
  ),
  "utf8",
);

function functionBody(source, name, nextName) {
  const start = source.indexOf(`export async function ${name}`);
  const end = nextName
    ? source.indexOf(`export async function ${nextName}`, start + 1)
    : source.length;
  assert.ok(start >= 0 && end > start, `${name} source boundary must exist`);
  return source.slice(start, end);
}

const returnAction = functionBody(actionSource, "createInvoiceReturnAction");

test("the Return mutation remains one authenticated RPC with unchanged inputs", () => {
  assert.equal(
    returnAction.match(/\.rpc\("create_invoice_return"/g)?.length,
    1,
  );
  assert.match(returnAction, /if \(!ctx\.user\) redirect\("\/login"\)/);
  assert.match(returnAction, /if \(!ctx\.profile\?\.organization_id\) redirect\("\/setup"\)/);
  assert.match(returnAction, /canReturnNew\(ctx\.profile\)/);
  assert.match(
    returnAction,
    /p_invoice_id: parsed\.data\.invoice_id,[\s\S]*p_items: selectedItems,[\s\S]*p_refund_amount: parsed\.data\.refund_amount,[\s\S]*p_refund_method: parsed\.data\.refund_method \?\? null/,
  );
  assert.doesNotMatch(returnAction, /retry|setTimeout|setInterval|sleep\s*\(/i);
});

test("cache reconciliation and action audit run after the Action response", () => {
  assert.match(actionSource, /import \{ after \} from "next\/server"/);
  const afterAt = returnAction.indexOf("after(async () => {");
  const resultAt = returnAction.indexOf("return {", afterAt);
  assert.ok(afterAt >= 0 && resultAt > afterAt);

  const postResponse = returnAction.slice(afterAt, resultAt);
  const expectedPaths = [
    "`/invoices/${parsed.data.invoice_id}`",
    '"/invoices"',
    '"/returns"',
    '"/products"',
    '"/customers"',
    '"/dashboard"',
  ];
  for (const path of expectedPaths) {
    assert.ok(postResponse.includes(`revalidatePath(${path})`), path);
  }
  assert.equal(postResponse.match(/revalidatePath\(/g)?.length, 6);
  assert.match(postResponse, /await logAudit\(/);
  assert.doesNotMatch(returnAction.slice(0, afterAt), /revalidatePath\(/);
});

test("success settles before a unique same-route reconciliation", () => {
  assert.match(
    formSource,
    /useActionState\(returnAction, initial\)/,
  );
  assert.match(
    formSource,
    /const result = await createInvoiceReturnAction\(previous, formData\);[\s\S]*if \(result\.success\) setLocalSuccess\(result\);/,
  );
  assert.match(
    formSource,
    /useEffect\(\(\) => \{[\s\S]*if \(!state\.success\) return;[\s\S]*url\.searchParams\.set\("returnstate", crypto\.randomUUID\(\)\);[\s\S]*router\.replace\(`[\s\S]*scroll: false/,
  );
  assert.doesNotMatch(
    formSource,
    /if \(state\.success !== prevSuccess\)[\s\S]*setLocalSuccess/,
  );
  assert.doesNotMatch(
    formSource,
    /useEffect\(\(\) => \{[\s\S]*setLocalSuccess/,
  );
  assert.doesNotMatch(formSource, /setTimeout|setInterval|sleep\s*\(/);
});

test("same-tick repeats and uncertain outcomes cannot resubmit", () => {
  assert.match(formSource, /const submissionLocked = useRef\(false\)/);
  assert.match(
    formSource,
    /if \(submissionLocked\.current \|\| outcomeUncertainRef\.current\) \{[\s\S]*event\.preventDefault\(\);[\s\S]*return;/,
  );
  assert.match(formSource, /submissionLocked\.current = true/);
  assert.match(
    formSource,
    /catch \{[\s\S]*outcomeUncertainRef\.current = true;[\s\S]*setOutcomeUncertain\(true\);[\s\S]*UNCERTAIN_RESULT_MESSAGE/,
  );
  assert.match(
    formSource,
    /disabled=\{pending \|\| refundTotal <= 0 \|\| outcomeUncertain\}/,
  );
  assert.equal(
    formSource.match(/await createInvoiceReturnAction\(/g)?.length,
    1,
  );
});

test("exhausted item rows retain quantity alignment in FormData", () => {
  assert.match(
    formSource,
    /item\.quantity_returnable === 0 && \([\s\S]*type="hidden" name="quantity" value="0"/,
  );
  assert.match(
    formSource,
    /disabled=\{pending \|\| item\.quantity_returnable === 0\}/,
  );
  assert.match(
    returnAction,
    /const itemIds = formData\.getAll\("invoice_item_id"\)[\s\S]*const quantities = formData\.getAll\("quantity"\)/,
  );
});

test("pending, success, and error feedback retain accessible semantics", () => {
  assert.match(formSource, /aria-busy=\{pending\}/);
  assert.match(formSource, /role="status"[\s\S]*aria-live="polite"/);
  assert.match(formSource, /role="alert"/);
  assert.match(formSource, /Return Processed/);
  assert.match(formSource, /View return/);
  assert.match(formSource, /Refresh invoice/);
});

test("the authoritative Return RPC retains refund, FIFO, stock, and ledger rules", () => {
  const start = rpcSource.indexOf("create or replace function public.create_invoice_return(");
  const end = rpcSource.indexOf("create or replace function public.adjust_stock(", start);
  const rpc = rpcSource.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(rpc, /v_balance_credit := least\(coalesce\(v_curr_balance, 0\), v_subtotal\)/);
  assert.match(rpc, /'refund', 'credit'/);
  assert.match(rpc, /quantity_remaining = quantity_remaining \+ v_restore_qty/);
  assert.match(rpc, /stock_quantity = stock_quantity \+ v_requested_qty/);
  assert.match(rpc, /'return_in'/);
  assert.match(rpc, /case when v_invoice_item\.product_type = 'product' then v_restock else false end/);
});
