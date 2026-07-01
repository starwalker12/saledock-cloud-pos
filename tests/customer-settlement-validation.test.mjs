import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const source = readFileSync(
  new URL("../src/lib/validation/customers.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const schemaModule = { exports: {} };
new Function("require", "module", "exports", compiled)(
  require,
  schemaModule,
  schemaModule.exports,
);

const { creditPaymentSchema } = schemaModule.exports;

test("blank optional settlement fields normalize to null", () => {
  const result = creditPaymentSchema.safeParse({
    amount: "400",
    method: "cash",
    reference_number: "",
    notes: "",
  });

  assert.equal(result.success, true);
  assert.equal(result.data.reference_number, null);
  assert.equal(result.data.notes, null);
});

test("whitespace-only optional settlement fields normalize to null", () => {
  const result = creditPaymentSchema.safeParse({
    amount: "300",
    method: "cash",
    reference_number: "   ",
    notes: "\n\t ",
  });

  assert.equal(result.success, true);
  assert.equal(result.data.reference_number, null);
  assert.equal(result.data.notes, null);
});

test("filled settlement reference and notes are trimmed and preserved", () => {
  const result = creditPaymentSchema.safeParse({
    amount: "500",
    method: "cash",
    reference_number: "  QA-REF-500  ",
    notes: "  QA final settlement  ",
  });

  assert.equal(result.success, true);
  assert.equal(result.data.reference_number, "QA-REF-500");
  assert.equal(result.data.notes, "QA final settlement");
});

test("invalid settlement amount keeps a friendly validation message", () => {
  const result = creditPaymentSchema.safeParse({
    amount: "0",
    method: "cash",
    reference_number: "",
    notes: "",
  });

  assert.equal(result.success, false);
  assert.equal(result.error.issues[0]?.message, "Must be greater than 0.");
  assert.equal(
    result.error.issues.some((issue) => issue.message.includes("expected string")),
    false,
  );
});
