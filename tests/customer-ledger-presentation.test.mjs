import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const customerDataSource = readFileSync(
  new URL("../src/lib/data/customers.ts", import.meta.url),
  "utf8",
);
const customerPageSource = readFileSync(
  new URL("../src/app/customers/[id]/page.tsx", import.meta.url),
  "utf8",
);
const customerActionsSource = readFileSync(
  new URL("../src/app/customers/actions.ts", import.meta.url),
  "utf8",
);
const returnActionsSource = readFileSync(
  new URL("../src/app/invoices/[id]/returns/actions.ts", import.meta.url),
  "utf8",
);

function functionSource(source, name, nextName) {
  const start = source.indexOf(`export async function ${name}`);
  assert.notEqual(start, -1, `${name} must exist`);
  const end = nextName
    ? source.indexOf(`export async function ${nextName}`, start)
    : source.length;
  assert.notEqual(end, -1, `${nextName} must exist`);
  return source.slice(start, end);
}

test("customer ledger carries the real invoice ID into invoice links", () => {
  assert.match(
    customerDataSource,
    /export type CustomerLedgerEntry = \{[\s\S]*?invoice_id: string \| null;/,
  );
  assert.match(
    customerDataSource,
    /id, entry_type, direction, amount, balance_after, description, reference_number, created_at, invoice_id,/,
  );
  assert.match(customerDataSource, /invoice_id: r\.invoice_id/);
  assert.match(
    customerPageSource,
    /l\.invoice_id && l\.invoice_no[\s\S]*?href=\{`\/invoices\/\$\{l\.invoice_id\}`\}/,
  );
  assert.doesNotMatch(customerPageSource, /href=\{`\/invoices\/\$\{l\.id\}`\}/);
});

test("customer returns are read-only, organization-scoped, and customer-scoped", () => {
  const returnsSource = functionSource(
    customerDataSource,
    "listCustomerReturns",
    "listCustomerCreditPayments",
  );

  assert.match(returnsSource, /\.from\("returns"\)/);
  assert.match(returnsSource, /\.eq\("organization_id", organizationId\)/);
  assert.match(returnsSource, /\.eq\("customer_id", customerId\)/);
  assert.match(
    returnsSource,
    /\.order\("created_at", \{ ascending: false \}\)/,
  );
  assert.doesNotMatch(returnsSource, /\.(?:insert|update|upsert|delete|rpc)\(/);
  assert.doesNotMatch(returnsSource, /balance_after|outstanding_balance/);
});

test("returns and refunds use real return and invoice routes without fabricating debt", () => {
  assert.match(customerPageSource, /Returns & refunds/);
  assert.match(customerPageSource, /href=\{`\/returns\/\$\{ret\.id\}`\}/);
  assert.match(
    customerPageSource,
    /href=\{`\/invoices\/\$\{ret\.invoice_id\}`\}/,
  );
  assert.doesNotMatch(customerPageSource, /returns\.map[\s\S]*?balance_after/);
  assert.doesNotMatch(customerPageSource, /returns\.map[\s\S]*?direction ===/);
});

test("debt-ledger direction, running balance, and legitimate refund credits remain intact", () => {
  assert.match(
    customerDataSource,
    /entry_type:[\s\S]*?"invoice_credit"[\s\S]*?\| "credit_payment"[\s\S]*?\| "adjustment"[\s\S]*?\| "refund"[\s\S]*?\| "opening_balance"[\s\S]*?\| "write_off";/,
  );
  assert.match(customerPageSource, /Debit \(Debt \+\)/);
  assert.match(customerPageSource, /Credit \(Debt −\)/);
  assert.match(customerPageSource, /Balance After/);
  assert.match(customerPageSource, /l\.balance_after/);
  assert.match(customerPageSource, /l\.direction === "debit"/);
  assert.match(customerPageSource, /l\.direction === "credit"/);
});

test("presentation sources do not alter customer, settlement, or return mutations", () => {
  assert.match(customerActionsSource, /\.rpc\("record_credit_payment"/);
  assert.match(customerActionsSource, /\.rpc\("record_customer_write_off"/);
  assert.match(returnActionsSource, /\.rpc\("create_invoice_return"/);
  assert.doesNotMatch(customerDataSource, /\.rpc\(/);
  assert.doesNotMatch(customerPageSource, /create_invoice_return/);
  assert.doesNotMatch(customerPageSource, /record_credit_payment/);
  assert.doesNotMatch(customerPageSource, /record_customer_write_off/);
});
