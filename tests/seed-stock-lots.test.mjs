// Validate that seeded local products with stock_quantity have matching FIFO stock lots.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PostgrestClient } from "@supabase/postgrest-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

describe("seeded stock lots consistency", () => {
  it("physical seeded products have product_stock_lots matching stock_quantity", async () => {
    if (!key) {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY required");
    }
    const client = new PostgrestClient(`${url}/rest/v1`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });

    const { data: products, error } = await client
      .from("products")
      .select("id, name, type, stock_quantity")
      .eq("type", "product")
      .gt("stock_quantity", 0);

    assert.ifError(error);
    assert.ok(products && products.length >= 2, "expected at least two seeded physical products");

    for (const product of products) {
      const { data: lots, error: lotsError } = await client
        .from("product_stock_lots")
        .select("quantity_remaining")
        .eq("product_id", product.id);

      assert.ifError(lotsError);
      const lotRemaining = (lots || []).reduce((sum, lot) => sum + (lot.quantity_remaining ?? 0), 0);
      assert.strictEqual(
        lotRemaining,
        product.stock_quantity,
        `${product.name} stock_quantity (${product.stock_quantity}) must equal total quantity_remaining in stock lots (${lotRemaining})`
      );
    }
  });

  it("seeded service products have no stock lots", async () => {
    if (!key) {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY required");
    }
    const client = new PostgrestClient(`${url}/rest/v1`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });

    const { data: services, error } = await client
      .from("products")
      .select("id")
      .eq("type", "service");

    assert.ifError(error);

    for (const service of services || []) {
      const { data: lots, error: lotsError } = await client
        .from("product_stock_lots")
        .select("id")
        .eq("product_id", service.id);

      assert.ifError(lotsError);
      assert.strictEqual(lots?.length ?? 0, 0, "service product should not have stock lots");
    }
  });
});
