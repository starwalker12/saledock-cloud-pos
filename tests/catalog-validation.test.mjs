import assert from "node:assert/strict";
import test from "node:test";
import { productSchema } from "../src/lib/validation/catalog.ts";

const validProduct = {
  name: "QA product",
  purchase_price: "100",
  sale_price: "150",
  stock_quantity: "1",
  minimum_stock: "0",
};

test("product with only required and numeric fields passes validation", () => {
  const result = productSchema.safeParse(validProduct);

  assert.equal(result.success, true);
});

test("blank optional product text is normalized to null", () => {
  const result = productSchema.safeParse({
    ...validProduct,
    sku: "",
    barcode: "",
    notes: "",
  });

  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.data.sku, null);
  assert.equal(result.data.barcode, null);
  assert.equal(result.data.notes, null);
});

test("whitespace-only optional product text is normalized to null", () => {
  const result = productSchema.safeParse({
    ...validProduct,
    sku: "   ",
    barcode: "\t",
    notes: "\n  ",
  });

  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.data.sku, null);
  assert.equal(result.data.barcode, null);
  assert.equal(result.data.notes, null);
});

test("filled optional product text is trimmed and preserved", () => {
  const result = productSchema.safeParse({
    ...validProduct,
    sku: "  SKU-123  ",
    barcode: "  99000123  ",
    notes: "  Shelf item  ",
  });

  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.data.sku, "SKU-123");
  assert.equal(result.data.barcode, "99000123");
  assert.equal(result.data.notes, "Shelf item");
});

test("required product name remains required", () => {
  const result = productSchema.safeParse({
    ...validProduct,
    name: "   ",
  });

  assert.equal(result.success, false);
  if (result.success) return;
  assert.equal(result.error.issues[0]?.message, "Product name is required.");
});
