import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";

// Inline copies of the held-bill schemas from src/lib/validation/pos.ts
// so this test is runnable with plain Node (no TS loader).

const optionalString = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}, z.string().min(1).optional());

const optionalNonNegativeNumber = z.preprocess((value) => {
  if (value === "" || value === null || value === undefined) return undefined;
  const n = Number(value);
  return Number.isNaN(n) ? value : n;
}, z.number().min(0, "Must be 0 or more.").optional());

const heldBillCartSchema = z
  .object({
    product_id: z.string().uuid(),
    quantity: z.coerce.number().int().min(1, "Quantity must be at least 1."),
    unit_price: z.coerce.number().min(0, "Unit price must be 0 or more."),
    discount: z.coerce.number().min(0, "Line discount must be 0 or more.").default(0),
    service_provider: optionalString,
    service_direction: optionalString,
    service_account_number: optionalString,
    service_receiver_account: optionalString,
    service_reference_no: optionalString,
    service_transaction_amount: optionalNonNegativeNumber,
    service_commission: optionalNonNegativeNumber,
    service_total_charged: optionalNonNegativeNumber,
    service_note: z
      .preprocess(
        (v) => (typeof v === "string" && v.trim().length === 0 ? undefined : v),
        z.string().max(500),
      )
      .optional(),
  })
  .superRefine((val, ctx) => {
    const principal = val.service_transaction_amount;
    const commission = val.service_commission;
    const totalCharged = val.service_total_charged;
    if (totalCharged !== undefined && commission !== undefined && totalCharged < commission) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Total charged cannot be less than commission.",
        path: ["service_total_charged"],
      });
    }
    if (principal !== undefined && principal < 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Principal must be 0 or more.",
        path: ["service_transaction_amount"],
      });
    }
  });

const heldBillPayloadSchema = z.object({
  label: z.string().trim().max(120).optional().nullable(),
  customer_id: z.string().uuid().optional().nullable(),
  customer_name: z.string().trim().max(160).optional().nullable(),
  note: z.string().trim().max(500).optional().nullable(),
  cart: z.array(heldBillCartSchema).min(1, "Cannot hold an empty bill."),
  totals_snapshot: z
    .object({
      item_count: z.number().int().min(0),
      grand_total: z.number().min(0),
    })
    .optional()
    .nullable(),
});

const validCartItem = {
  product_id: "550e8400-e29b-41d4-a716-446655440000",
  quantity: 2,
  unit_price: 150,
  discount: 10,
};

const validPayload = {
  label: "Counter 2 / Umar",
  customer_id: "550e8400-e29b-41d4-a716-446655440001",
  customer_name: "Umar Khan",
  note: "Will pay on pickup",
  cart: [validCartItem],
  totals_snapshot: { item_count: 2, grand_total: 290 },
};

test("valid held bill payload passes", () => {
  const result = heldBillPayloadSchema.safeParse(validPayload);
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.cart.length, 1);
    assert.equal(result.data.cart[0].quantity, 2);
    assert.equal(result.data.totals_snapshot?.grand_total, 290);
  }
});

test("empty cart fails", () => {
  const result = heldBillPayloadSchema.safeParse({ ...validPayload, cart: [] });
  assert.equal(result.success, false);
  assert.ok(result.error?.issues.some((i) => i.message.includes("empty")));
});

test("missing required cart fields fail", () => {
  const result = heldBillPayloadSchema.safeParse({
    ...validPayload,
    cart: [{ quantity: 1 }],
  });
  assert.equal(result.success, false);
});

test("blank label and note remain blank strings", () => {
  const result = heldBillPayloadSchema.safeParse({
    ...validPayload,
    label: "   ",
    note: "",
  });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.label, "");
    assert.equal(result.data.note, "");
  }
});

test("service total charged cannot be less than commission", () => {
  const result = heldBillPayloadSchema.safeParse({
    ...validPayload,
    cart: [
      {
        ...validCartItem,
        service_commission: 50,
        service_total_charged: 30,
      },
    ],
  });
  assert.equal(result.success, false);
  assert.ok(
    result.error?.issues.some((i) =>
      i.message.toLowerCase().includes("total charged cannot be less than commission"),
    ),
  );
});

test("totals snapshot is optional", () => {
  const result = heldBillPayloadSchema.safeParse({
    label: null,
    customer_id: null,
    customer_name: null,
    note: null,
    cart: [validCartItem],
  });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.totals_snapshot, undefined);
  }
});

// Helpers mirroring src/app/pos/use-pos-tabs.ts
function cartToHeldItems(cart) {
  return cart.map((l) => ({
    product_id: l.product.id,
    quantity: l.quantity,
    unit_price: l.unit_price,
    discount: l.discount,
    service_provider: l.service?.provider || undefined,
    service_direction: l.service?.direction || undefined,
    service_account_number: l.service?.account_number || undefined,
    service_receiver_account: l.service?.receiver_account || undefined,
    service_reference_no: l.service?.reference_no || undefined,
    service_transaction_amount:
      l.service?.principal && l.service.principal !== "" ? Number(l.service.principal) : undefined,
    service_commission:
      l.service?.commission && l.service.commission !== "" ? Number(l.service.commission) : undefined,
    service_total_charged:
      l.service?.total_charged && l.service.total_charged !== ""
        ? Number(l.service.total_charged)
        : undefined,
    service_note: l.service?.note || undefined,
  }));
}

function heldItemsToCart(products, items) {
  return items
    .map((item) => {
      const product = products.find((p) => p.id === item.product_id);
      if (!product) return null;
      const service =
        product.type === "service"
          ? {
              provider: item.service_provider ?? "",
              direction: item.service_direction ?? "",
              account_number: item.service_account_number ?? "",
              receiver_account: item.service_receiver_account ?? "",
              reference_no: item.service_reference_no ?? "",
              principal: item.service_transaction_amount != null ? String(item.service_transaction_amount) : "",
              commission: item.service_commission != null ? String(item.service_commission) : "",
              total_charged: item.service_total_charged != null ? String(item.service_total_charged) : "",
              note: item.service_note ?? "",
            }
          : undefined;
      return {
        product,
        quantity: item.quantity,
        unit_price: item.unit_price,
        discount: item.discount,
        service,
      };
    })
    .filter((x) => x !== null);
}

const sampleProduct = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  name: "Test Product",
  type: "product",
  sale_price: 100,
  stock_quantity: 10,
};

const sampleService = {
  id: "550e8400-e29b-41d4-a716-446655440002",
  name: "Test Service",
  type: "service",
  sale_price: 50,
  stock_quantity: 0,
  service_type: "mobile_load",
  requires_provider: true,
};

test("cartToHeldItems serializes product and service lines", () => {
  const cart = [
    { product: sampleProduct, quantity: 2, unit_price: 100, discount: 5 },
    {
      product: sampleService,
      quantity: 1,
      unit_price: 50,
      discount: 0,
      service: {
        provider: "EasyPaisa",
        direction: "mobile_load",
        account_number: "03001234567",
        receiver_account: "",
        reference_no: "ABC123",
        principal: "100",
        commission: "2",
        total_charged: "102",
        note: "Done",
      },
    },
  ];
  const items = cartToHeldItems(cart);
  assert.equal(items.length, 2);
  assert.equal(items[0].product_id, sampleProduct.id);
  assert.equal(items[0].quantity, 2);
  assert.equal(items[1].service_provider, "EasyPaisa");
  assert.equal(items[1].service_transaction_amount, 100);
  assert.equal(items[1].service_total_charged, 102);
});

test("heldItemsToCart restores product and service lines", () => {
  const items = [
    { product_id: sampleProduct.id, quantity: 2, unit_price: 100, discount: 5 },
    {
      product_id: sampleService.id,
      quantity: 1,
      unit_price: 50,
      discount: 0,
      service_provider: "EasyPaisa",
      service_direction: "mobile_load",
      service_account_number: "03001234567",
      service_reference_no: "ABC123",
      service_transaction_amount: 100,
      service_commission: 2,
      service_total_charged: 102,
      service_note: "Done",
    },
  ];
  const cart = heldItemsToCart([sampleProduct, sampleService], items);
  assert.equal(cart.length, 2);
  assert.equal(cart[0].product.type, "product");
  assert.equal(cart[1].product.type, "service");
  assert.equal(cart[1].service.provider, "EasyPaisa");
  assert.equal(cart[1].service.principal, "100");
});

test("heldItemsToCart skips products no longer in catalog", () => {
  const items = [{ product_id: "deleted-id", quantity: 1, unit_price: 10, discount: 0 }];
  const cart = heldItemsToCart([sampleProduct], items);
  assert.equal(cart.length, 0);
});

test("service fields are not created for physical products", () => {
  const items = [
    {
      product_id: sampleProduct.id,
      quantity: 1,
      unit_price: 10,
      discount: 0,
      service_provider: "ShouldBeIgnored",
    },
  ];
  const cart = heldItemsToCart([sampleProduct], items);
  assert.equal(cart.length, 1);
  assert.equal(cart[0].service, undefined);
});
