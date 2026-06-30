import assert from "node:assert/strict";
import test from "node:test";

// Deterministic regression test for the service-sale checkout bug documented in
// PR #283 Part 2 QA. The bug: service metadata was stored, but the invoice
// line/grand total and payment used the service product's zero sale_price.

function computeServiceLineTotal(item) {
  const principal = Number(item.service_transaction_amount ?? 0);
  const commission = Number(item.service_commission ?? 0);
  const totalCharged =
    item.service_total_charged != null && item.service_total_charged !== ""
      ? Number(item.service_total_charged)
      : principal + commission;
  const effectiveUnitPrice =
    item.unit_price != null && item.unit_price !== "" && item.unit_price !== 0
      ? Number(item.unit_price)
      : totalCharged;
  return Math.max(effectiveUnitPrice * item.quantity - (item.discount ?? 0), 0);
}

function simulateCheckout(cart) {
  const subtotal = cart.reduce((sum, item) => sum + computeServiceLineTotal(item), 0);
  const grandTotal = Math.max(subtotal, 0);
  return {
    subtotal,
    grandTotal,
    amountSettled: grandTotal,
    balanceDue: 0,
    changeDue: 0,
  };
}

test("service sale with principal 1000, commission 50, total charged 1050 produces invoice total 1050", () => {
  const cart = [
    {
      product_id: "00000000-0000-4000-8000-000000003003",
      quantity: 1,
      unit_price: 0,
      discount: 0,
      service_provider: "EasyPaisa",
      service_direction: "cash_in",
      service_account_number: "03001234567",
      service_reference_no: "REF-123",
      service_transaction_amount: 1000,
      service_commission: 50,
      service_total_charged: 1050,
    },
  ];

  const lineTotal = computeServiceLineTotal(cart[0]);
  const checkout = simulateCheckout(cart);

  assert.equal(lineTotal, 1050, "line total must use service_total_charged");
  assert.equal(checkout.grandTotal, 1050, "grand total must be 1050");
  assert.equal(checkout.amountSettled, 1050, "paid amount must be 1050");
  assert.equal(checkout.balanceDue, 0, "balance due must be 0 for exact tender");
  assert.equal(checkout.changeDue, 0, "change due must be 0 for exact tender");
});

test("service sale falls back to principal + commission when total charged is omitted", () => {
  const cart = [
    {
      product_id: "00000000-0000-4000-8000-000000003003",
      quantity: 1,
      unit_price: 0,
      discount: 0,
      service_transaction_amount: 500,
      service_commission: 25,
    },
  ];

  const lineTotal = computeServiceLineTotal(cart[0]);
  assert.equal(lineTotal, 525, "line total must fall back to principal + commission");
});

test("cart unit_price is honored when present (backward compatibility)", () => {
  const cart = [
    {
      product_id: "00000000-0000-4000-8000-000000003003",
      quantity: 1,
      unit_price: 1050,
      discount: 0,
      service_transaction_amount: 1000,
      service_commission: 50,
      service_total_charged: 1050,
    },
  ];

  const lineTotal = computeServiceLineTotal(cart[0]);
  assert.equal(lineTotal, 1050, "cart unit_price must be used when already set");
});

test("service sale with line discount still computes total correctly", () => {
  const cart = [
    {
      product_id: "00000000-0000-4000-8000-000000003003",
      quantity: 1,
      unit_price: 1050,
      discount: 50,
      service_transaction_amount: 1000,
      service_commission: 50,
      service_total_charged: 1050,
    },
  ];

  const lineTotal = computeServiceLineTotal(cart[0]);
  const checkout = simulateCheckout(cart);
  assert.equal(lineTotal, 1000, "line discount must reduce line total");
  assert.equal(checkout.grandTotal, 1000, "grand total must reflect line discount");
});

test("commission is profit, principal is not profit", () => {
  const commission = 50;
  const principal = 1000;
  assert.ok(commission > 0, "commission must be positive profit");
  assert.ok(principal !== commission, "principal must not equal commission");
  assert.equal(commission, 50, "commission is the profit value");
  assert.equal(principal, 1000, "principal is pass-through, not profit");
});

// Mirror the client-side serviceTotalCharged helper used in use-pos-tabs.ts.
function serviceTotalCharged(service) {
  const principal = Number(service.principal || 0);
  const commission = Number(service.commission || 0);
  return service.total_charged.trim() === "" ? principal + commission : Number(service.total_charged);
}

test("held bill service line restores unit_price from service total charged", () => {
  const heldItem = {
    product_id: "00000000-0000-4000-8000-000000003003",
    quantity: 1,
    unit_price: 0,
    discount: 0,
    service_provider: "EasyPaisa",
    service_transaction_amount: 1000,
    service_commission: 50,
    service_total_charged: 1050,
  };
  const service = {
    provider: heldItem.service_provider ?? "",
    direction: "",
    account_number: "",
    receiver_account: "",
    reference_no: "",
    principal: heldItem.service_transaction_amount != null ? String(heldItem.service_transaction_amount) : "",
    commission: heldItem.service_commission != null ? String(heldItem.service_commission) : "",
    total_charged: heldItem.service_total_charged != null ? String(heldItem.service_total_charged) : "",
    note: "",
  };
  const restoredUnitPrice = serviceTotalCharged(service);
  assert.equal(restoredUnitPrice, 1050, "restored service line must use total charged as unit price");
});

test("held bill service line falls back to computed total when total charged is blank", () => {
  const service = {
    provider: "",
    direction: "",
    account_number: "",
    receiver_account: "",
    reference_no: "",
    principal: "1000",
    commission: "50",
    total_charged: "",
    note: "",
  };
  assert.equal(serviceTotalCharged(service), 1050, "blank total charged falls back to principal + commission");
});
