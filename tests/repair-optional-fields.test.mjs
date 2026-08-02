import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const source = readFileSync(
  new URL("../src/lib/validation/repairs.ts", import.meta.url),
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

const { repairSchema } = schemaModule.exports;
const validCustomerId = "00000000-0000-4000-8000-000000000101";
const optionalTextFields = [
  "customer_phone",
  "device_model",
  "serial_imei",
  "accessories_received",
  "notes",
];

function validPayload(overrides = {}) {
  return {
    customer_name: "QA repair customer",
    device_type: "Mobile",
    problem_description: "Screen issue",
    estimated_cost: "0",
    advance_paid: "0",
    payment_method: "cash",
    status: "received",
    ...overrides,
  };
}

function parse(overrides = {}) {
  return repairSchema.safeParse(validPayload(overrides));
}

test("optional customer IDs normalize blank HTML values without relaxing UUID validation", () => {
  for (const input of [undefined, null, "", "   "]) {
    const result = parse({ customer_id: input });
    assert.equal(result.success, true, `expected ${JSON.stringify(input)} to pass`);
    assert.equal(result.data.customer_id ?? null, null);
  }

  const absent = parse();
  assert.equal(absent.success, true);
  assert.equal("customer_id" in absent.data, false);

  const valid = parse({ customer_id: validCustomerId });
  assert.equal(valid.success, true);
  assert.equal(valid.data.customer_id, validCustomerId);

  for (const input of ["not-a-uuid", "1234", "null", "undefined"]) {
    const result = parse({ customer_id: input });
    assert.equal(result.success, false, `expected ${input} to fail`);
    assert.equal(result.error.issues.some((issue) => issue.path[0] === "customer_id"), true);
  }
});

test("optional repair text accepts blank values and trims only surrounding whitespace", () => {
  for (const field of optionalTextFields) {
    const absent = parse();
    assert.equal(absent.success, true);

    for (const input of [undefined, null, "", " \n\t "]) {
      const result = parse({ [field]: input });
      assert.equal(result.success, true, `${field} should accept ${JSON.stringify(input)}`);
      assert.equal(result.data[field] ?? null, null);
    }

    const filled = parse({ [field]: "  meaningful  internal spaces  " });
    assert.equal(filled.success, true);
    assert.equal(filled.data[field], "meaningful  internal spaces");
  }
});

test("expected delivery accepts no date and exact real calendar dates", () => {
  for (const input of [undefined, null, "", "   "]) {
    const result = parse({ expected_delivery_at: input });
    assert.equal(result.success, true, `expected ${JSON.stringify(input)} to pass`);
    assert.equal(result.data.expected_delivery_at ?? null, null);
  }

  for (const input of ["2026-08-02", "2028-02-29"]) {
    const result = parse({ expected_delivery_at: input });
    assert.equal(result.success, true, `expected ${input} to pass`);
    assert.equal(result.data.expected_delivery_at, input);
  }
});

test("expected delivery rejects malformed formats and impossible calendar dates", () => {
  for (const input of [
    "2027-02-29",
    "2026-02-30",
    "2026-00-10",
    "2026-01-00",
    "2026-13-01",
    "2026-7-01",
    "01-07-2026",
    "2026/07/01",
    "2026-07-01T00:00",
    "not-a-date",
  ]) {
    const result = parse({ expected_delivery_at: input });
    assert.equal(result.success, false, `expected ${input} to fail`);
    assert.equal(
      result.error.issues.some((issue) => issue.path[0] === "expected_delivery_at"),
      true,
    );
  }
});

test("required, numeric, enum, and default repair contracts remain intact", () => {
  for (const field of ["customer_name", "device_type", "problem_description"]) {
    assert.equal(parse({ [field]: "" }).success, false, `${field} must remain required`);
  }

  assert.equal(parse({ estimated_cost: "-1" }).success, false);
  assert.equal(parse({ advance_paid: "-1" }).success, false);
  assert.equal(parse({ estimated_cost: "not-a-number" }).success, false);
  assert.equal(parse({ payment_method: "crypto" }).success, false);
  assert.equal(parse({ status: "unknown" }).success, false);

  const defaults = repairSchema.safeParse({
    customer_name: "QA repair customer",
    device_type: "Mobile",
    problem_description: "Screen issue",
  });
  assert.equal(defaults.success, true);
  assert.equal(defaults.data.estimated_cost, 0);
  assert.equal(defaults.data.advance_paid, 0);
  assert.equal(defaults.data.payment_method, "cash");
  assert.equal(defaults.data.status, "received");
});

test("complete existing repair payloads preserve their validated values", () => {
  const result = parse({
    customer_id: validCustomerId,
    customer_phone: "  03001234567  ",
    device_model: "  Pixel 9  ",
    serial_imei: "  ABC-123  ",
    accessories_received: "  Charger and cable  ",
    expected_delivery_at: "2028-02-29",
    notes: "  Handle  with care  ",
    estimated_cost: "1500",
    advance_paid: "250",
    payment_method: "card",
    status: "in_progress",
  });

  assert.equal(result.success, true);
  assert.deepEqual(result.data, {
    customer_id: validCustomerId,
    customer_name: "QA repair customer",
    customer_phone: "03001234567",
    device_type: "Mobile",
    device_model: "Pixel 9",
    serial_imei: "ABC-123",
    problem_description: "Screen issue",
    accessories_received: "Charger and cable",
    estimated_cost: 1500,
    advance_paid: 250,
    payment_method: "card",
    status: "in_progress",
    expected_delivery_at: "2028-02-29",
    notes: "Handle  with care",
  });
});
