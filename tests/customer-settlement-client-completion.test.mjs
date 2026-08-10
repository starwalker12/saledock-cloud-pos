import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const actionsSource = readFileSync(
  new URL("../src/app/customers/actions.ts", import.meta.url),
  "utf8",
);
const formSource = readFileSync(
  new URL("../src/app/customers/[id]/settlement-form.tsx", import.meta.url),
  "utf8",
);
const validationSource = readFileSync(
  new URL("../src/lib/validation/customers.ts", import.meta.url),
  "utf8",
);
const supplierPaymentSource = readFileSync(
  new URL(
    "../src/app/suppliers/purchases/[id]/record-payment-form.tsx",
    import.meta.url,
  ),
  "utf8",
);

function functionBody(source, name, nextName) {
  const start = source.indexOf(`export async function ${name}`);
  const end = source.indexOf(`export async function ${nextName}`, start + 1);
  assert.ok(start >= 0 && end > start, `${name} source boundary must exist`);
  return source.slice(start, end);
}

const settlementAction = functionBody(
  actionsSource,
  "recordCreditPaymentAction",
  "recordWriteOffAction",
);

test("settlement authorization retains the exact positive role matrix", () => {
  for (const role of ["owner", "admin", "manager", "cashier"]) {
    assert.match(
      settlementAction,
      new RegExp(`ctx\\.profile\\.role !== "${role}"`),
    );
  }
  assert.doesNotMatch(settlementAction, /ctx\.profile\.role !== "technician"/);
  assert.match(
    settlementAction,
    /return err\("You do not have permission to log payments\."\)/,
  );
});

test("organization ownership is confirmed before the one financial RPC", () => {
  const lookupAt = settlementAction.indexOf('.from("customers")');
  const orgScopeAt = settlementAction.indexOf(
    '.eq("organization_id", ctx.profile!.organization_id!)',
  );
  const maybeSingleAt = settlementAction.indexOf(".maybeSingle()", orgScopeAt);
  const rpcAt = settlementAction.indexOf('.rpc("record_credit_payment"');

  assert.ok(lookupAt >= 0 && lookupAt < orgScopeAt);
  assert.ok(orgScopeAt < maybeSingleAt && maybeSingleAt < rpcAt);
  assert.equal(
    settlementAction.match(/\.rpc\("record_credit_payment"/g)?.length,
    1,
  );
  assert.match(
    settlementAction,
    /p_customer_id: customerId,[\s\S]*p_amount: parsed\.data\.amount,[\s\S]*p_method: parsed\.data\.method as CreditPaymentMethod,[\s\S]*p_reference_number: parsed\.data\.reference_number \?\? null,[\s\S]*p_notes: parsed\.data\.notes \?\? null/,
  );
});

test("validation and RPC failures return errors before any success refresh", () => {
  const parseAt = settlementAction.indexOf("creditPaymentSchema.safeParse");
  const parseErrorAt = settlementAction.indexOf("if (!parsed.success)");
  const rpcAt = settlementAction.indexOf('.rpc("record_credit_payment"');
  const rpcErrorAt = settlementAction.indexOf("if (error)", rpcAt);
  const successAt = settlementAction.indexOf(
    'return ok("Credit payment recorded successfully.")',
  );

  assert.ok(parseAt < parseErrorAt && parseErrorAt < rpcAt);
  assert.ok(rpcAt < rpcErrorAt && rpcErrorAt < successAt);
  assert.doesNotMatch(settlementAction, /revalidatePath\s*\(/);
});

test("ActionState settles before a unique same-route reconciliation begins", () => {
  assert.match(
    formSource,
    /useActionState\(\s*recordCreditPaymentAction,\s*initial,?\s*\)/,
  );
  assert.match(
    formSource,
    /if \(state\.success\) \{[\s\S]*formRef\.current\?\.reset\(\);[\s\S]*url\.searchParams\.set\("paystate", crypto\.randomUUID\(\)\);[\s\S]*router\.replace\(`[\s\S]*scroll: false[\s\S]*\);[\s\S]*\}/,
  );
  assert.match(formSource, /\}, \[router, state\]\);/);
  assert.doesNotMatch(formSource, /setTimeout|setInterval|sleep\s*\(/);
});

test("same-tick repeat submission is blocked without a second Action", () => {
  assert.match(formSource, /const submissionLocked = useRef\(false\)/);
  assert.match(
    formSource,
    /if \(submissionLocked\.current\) \{[\s\S]*event\.preventDefault\(\);[\s\S]*return;[\s\S]*\}/,
  );
  assert.match(formSource, /submissionLocked\.current = true/);
  assert.match(
    formSource,
    /if \(!pending\) \{[\s\S]*submissionLocked\.current = false/,
  );
  assert.match(formSource, /onSubmit=\{handleSubmit\}/);
});

test("success and failure remain truthful visible ActionState outcomes", () => {
  assert.match(formSource, /\{state\.error && \(/);
  assert.match(formSource, /role="alert"/);
  assert.match(formSource, /\{state\.success && \(/);
  assert.match(formSource, /role="status"/);
  assert.match(formSource, /disabled=\{pending\}/);
  assert.match(formSource, /Processing\.\.\./);
  assert.match(settlementAction, /Credit payment recorded successfully\./);
  assert.doesNotMatch(formSource, /submit again|try again|assume.*recorded/i);
});

test("settlement validation and audit payload keep their financial contract", () => {
  assert.match(
    validationSource,
    /const positiveNumber = z\.coerce[\s\S]*\.positive\("Must be greater than 0\."\)/,
  );
  assert.match(
    validationSource,
    /creditPaymentSchema = z\.object\(\{[\s\S]*amount: positiveNumber/,
  );
  assert.match(validationSource, /CREDIT_PAYMENT_METHODS/);
  assert.match(settlementAction, /action: "customer\.credit_payment"/);
  assert.match(
    settlementAction,
    /metadata: \{[\s\S]*customer_id: customerId,[\s\S]*amount: parsed\.data\.amount,[\s\S]*method: parsed\.data\.method/,
  );
  assert.equal(
    settlementAction.match(/action: "customer\.credit_payment"/g)?.length,
    1,
  );
});

test("the focused correction does not import queued supplier or global UI work", () => {
  assert.doesNotMatch(formSource, /supplier|thermal|loading\.tsx|AppShell/i);
  assert.doesNotMatch(settlementAction, /supplier|thermal|loading\.tsx/i);
  assert.match(supplierPaymentSource, /recordSupplierPaymentAction/);
  assert.match(supplierPaymentSource, /Recording…/);
});
