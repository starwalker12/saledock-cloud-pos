import { expect, test } from "@playwright/test";
import {
  getLocalAdminClient,
  isLocalPlaywrightRun,
  loginLocalOwnerDirectly,
  LOCAL_QA_ORG_ID,
} from "./helpers/local-supabase";

const baselineMode = process.env.OPENING_STOCK_BASELINE === "1";
const countTables = [
  "products",
  "product_stock_lots",
  "stock_movements",
  "invoices",
  "invoice_items",
  "invoice_item_stock_allocations",
  "payments",
  "cash_shifts",
  "cash_shift_movements",
  "audit_logs",
] as const;

type CountTable = (typeof countTables)[number];

async function tableCounts() {
  const admin = getLocalAdminClient();
  const entries = await Promise.all(
    countTables.map(async (table) => {
      const { count, error } = await admin
        .from(table)
        .select("id", { count: "exact", head: true })
        .eq("organization_id", LOCAL_QA_ORG_ID);
      if (error) throw new Error(`Could not count ${table}: ${error.message}`);
      return [table, count ?? 0] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<CountTable, number>;
}

async function deleteMarkerRows(
  productId: string | null,
  invoiceId: string | null,
  marker: string,
) {
  const admin = getLocalAdminClient();
  if (invoiceId) {
    const { error: invoiceError } = await admin
      .from("invoices")
      .delete()
      .eq("organization_id", LOCAL_QA_ORG_ID)
      .eq("id", invoiceId);
    if (invoiceError) throw new Error(`Invoice cleanup failed: ${invoiceError.message}`);
    const { error: checkoutAuditError } = await admin
      .from("audit_logs")
      .delete()
      .eq("organization_id", LOCAL_QA_ORG_ID)
      .contains("metadata", { invoice_id: invoiceId });
    if (checkoutAuditError) {
      throw new Error(`Checkout audit cleanup failed: ${checkoutAuditError.message}`);
    }
  }
  if (productId) {
    const { error: productError } = await admin
      .from("products")
      .delete()
      .eq("organization_id", LOCAL_QA_ORG_ID)
      .eq("id", productId);
    if (productError) throw new Error(`Product cleanup failed: ${productError.message}`);
  }
  const { error: auditError } = await admin
    .from("audit_logs")
    .delete()
    .eq("organization_id", LOCAL_QA_ORG_ID)
    .like("details", `%${marker}%`);
  if (auditError) throw new Error(`Audit cleanup failed: ${auditError.message}`);
}

test.describe("product opening-stock FIFO atomicity", () => {
  test.skip(!isLocalPlaywrightRun(), "This mutation test is loopback-only.");

  test("normal product create and one-unit checkout preserve stock/FIFO truth", async ({ page }) => {
    test.setTimeout(120_000);
    const marker = `QA-OST-${Date.now().toString(36).slice(-7)}`;
    const productName = `${marker} Product`;
    const admin = getLocalAdminClient();
    const before = await tableCounts();
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("console", (message) => {
      const sourceUrl = message.location().url;
      const isUnavailableLocalVercelInstrumentation =
        sourceUrl.includes("/_vercel/insights") ||
        sourceUrl.includes("/_vercel/speed-insights") ||
        message.text().includes("/_vercel/insights/script.js") ||
        message.text().includes("/_vercel/speed-insights/script.js");
      const isMissingOptionalLocalUiPreferences =
        sourceUrl.startsWith("http://127.0.0.1:54321/rest/v1/user_ui_preferences?") &&
        message.text().includes("status of 406");
      if (
        message.type() === "error" &&
        !isUnavailableLocalVercelInstrumentation &&
        !isMissingOptionalLocalUiPreferences
      ) {
        consoleErrors.push(`${message.text()} @ ${sourceUrl || "unavailable"}`);
      }
    });

    let productId: string | null = null;
    let invoiceId: string | null = null;
    try {
      await loginLocalOwnerDirectly(page);
      await page.goto("/products?tab=products");
      await expect(page.getByRole("heading", { name: "Products" })).toBeVisible();
      await page.getByRole("button", { name: "Add product" }).click();
      const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Add product" }) }).last();
      await form.locator('input[name="name"]').fill(productName);
      await form.locator('input[name="sku"]').fill(marker.replaceAll("-", ""));
      await form.locator('input[name="purchase_price"]').fill("100");
      await form.locator('input[name="sale_price"]').fill("150");
      await form.locator('input[name="stock_quantity"]').fill("10");
      await form.locator('input[name="minimum_stock"]').fill("3");
      await form.locator('textarea[name="notes"]').fill(`${marker} opening stock baseline`);
      await form.getByRole("button", { name: "Add product" }).click();
      await expect(page.getByText(productName, { exact: true }).first()).toBeVisible({ timeout: 20_000 });

      const { data: product, error: productError } = await admin
        .from("products")
        .select("id, stock_quantity")
        .eq("organization_id", LOCAL_QA_ORG_ID)
        .eq("name", productName)
        .single();
      if (productError || !product) throw new Error(`Created product lookup failed: ${productError?.message}`);
      productId = product.id;
      expect(product.stock_quantity).toBe(10);
      await expect
        .poll(async () => {
          const { count, error } = await admin
            .from("audit_logs")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", LOCAL_QA_ORG_ID)
            .eq("action", "product.created")
            .like("details", `%${marker}%`);
          if (error) throw new Error(`Product audit lookup failed: ${error.message}`);
          return count ?? 0;
        })
        .toBe(1);

      const { data: lots, error: lotsError } = await admin
        .from("product_stock_lots")
        .select("id, quantity_received, quantity_remaining, unit_cost")
        .eq("organization_id", LOCAL_QA_ORG_ID)
        .eq("product_id", productId);
      if (lotsError) throw new Error(`Lot lookup failed: ${lotsError.message}`);
      const { data: movements, error: movementError } = await admin
        .from("stock_movements")
        .select("id, movement_type, quantity, unit_cost")
        .eq("organization_id", LOCAL_QA_ORG_ID)
        .eq("product_id", productId)
        .eq("movement_type", "opening_stock");
      if (movementError) throw new Error(`Movement lookup failed: ${movementError.message}`);

      if (baselineMode) {
        expect(lots).toHaveLength(0);
        expect(movements).toHaveLength(0);
      } else {
        expect(lots).toHaveLength(1);
        expect(lots?.[0]).toMatchObject({ quantity_received: 10, quantity_remaining: 10 });
        expect(Number(lots?.[0]?.unit_cost)).toBe(100);
        expect(movements).toHaveLength(1);
        expect(movements?.[0]).toMatchObject({ movement_type: "opening_stock", quantity: 10 });
        expect(Number(movements?.[0]?.unit_cost)).toBe(100);

        const productRow = page.locator("tr").filter({ hasText: productName }).first();
        await productRow.getByRole("button", { name: "Edit" }).click();
        const editForm = page
          .locator("form")
          .filter({ has: page.getByRole("button", { name: "Save changes" }) })
          .last();
        await expect(editForm.getByTestId("product-current-stock")).toHaveText("10");
        await expect(editForm.locator('input[name="stock_quantity"]')).toHaveCount(0);
        await editForm.locator('input[name="name"]').fill(`${productName} Updated`);
        await editForm.locator('input[name="purchase_price"]').fill("110");
        await editForm.locator('input[name="sale_price"]').fill("160");
        await editForm.locator('input[name="minimum_stock"]').fill("4");
        await editForm.locator('textarea[name="notes"]').fill(`${marker} metadata edit`);

        await editForm.getByRole("button", { name: "Product category" }).click();
        const categoryOptions = page.getByRole("option");
        if ((await categoryOptions.count()) > 1) await categoryOptions.nth(1).click();
        else await page.keyboard.press("Escape");
        await editForm.getByRole("button", { name: "Product supplier" }).click();
        const supplierOptions = page.getByRole("option");
        if ((await supplierOptions.count()) > 1) await supplierOptions.nth(1).click();
        else await page.keyboard.press("Escape");

        await editForm.evaluate((form) => {
          const forged = document.createElement("input");
          forged.type = "hidden";
          forged.name = "stock_quantity";
          forged.value = "999";
          form.append(forged);
        });
        await editForm.getByRole("button", { name: "Save changes" }).click();
        await expect(page.getByText(`${productName} Updated`, { exact: true }).first()).toBeVisible({
          timeout: 20_000,
        });

        const { data: editedProduct, error: editedProductError } = await admin
          .from("products")
          .select("stock_quantity, purchase_price, sale_price, minimum_stock, notes")
          .eq("id", productId)
          .single();
        if (editedProductError) throw new Error(`Edited product lookup failed: ${editedProductError.message}`);
        expect(editedProduct).toMatchObject({
          stock_quantity: 10,
          minimum_stock: 4,
          notes: `${marker} metadata edit`,
        });
        expect(Number(editedProduct?.purchase_price)).toBe(110);
        expect(Number(editedProduct?.sale_price)).toBe(160);
        const { data: editedLots } = await admin
          .from("product_stock_lots")
          .select("quantity_received, quantity_remaining, unit_cost")
          .eq("product_id", productId);
        const { data: editedMovements } = await admin
          .from("stock_movements")
          .select("movement_type, quantity")
          .eq("product_id", productId);
        expect(editedLots).toHaveLength(1);
        expect(editedLots?.[0]?.quantity_remaining).toBe(10);
        expect(Number(editedLots?.[0]?.unit_cost)).toBe(100);
        expect(editedMovements).toHaveLength(1);
        expect(editedMovements?.[0]?.movement_type).toBe("opening_stock");
      }

      const beforeCheckout = await tableCounts();
      await page.goto("/pos");
      const productButton = page.locator(`[data-testid="pos-product-btn"][data-product-id="${productId}"]`);
      await expect(productButton).toContainText("10 in stock");
      await productButton.click();
      if (!baselineMode) {
        await page.getByRole("button", { name: "Payment method" }).click();
        await page.getByRole("option", { name: "Card", exact: true }).click();
      }
      await page.getByTestId("pos-exact-tender-btn").click();
      await page.getByTestId("pos-checkout-btn").click();

      if (baselineMode) {
        await expect(page.getByText(/Not enough stock available/i)).toBeVisible({ timeout: 20_000 });
        const afterFailedCheckout = await tableCounts();
        expect(afterFailedCheckout.invoices).toBe(beforeCheckout.invoices);
        expect(afterFailedCheckout.invoice_items).toBe(beforeCheckout.invoice_items);
        expect(afterFailedCheckout.payments).toBe(beforeCheckout.payments);
        expect(afterFailedCheckout.cash_shift_movements).toBe(beforeCheckout.cash_shift_movements);
        const { data: unchanged } = await admin
          .from("products")
          .select("stock_quantity")
          .eq("id", productId)
          .single();
        expect(unchanged?.stock_quantity).toBe(10);
      } else {
        await expect(page.getByText(/Sale recorded as/i)).toBeVisible({ timeout: 20_000 });
        const invoiceLink = page.getByRole("link", { name: "Open invoice" });
        const invoiceHref = await invoiceLink.getAttribute("href");
        invoiceId = invoiceHref?.split("/").at(-1) ?? null;
        expect(invoiceId).toBeTruthy();

        const { data: updatedProduct } = await admin
          .from("products")
          .select("stock_quantity")
          .eq("id", productId)
          .single();
        const { data: updatedLots } = await admin
          .from("product_stock_lots")
          .select("quantity_remaining")
          .eq("product_id", productId);
        const { data: invoiceItems } = await admin
          .from("invoice_items")
          .select("id, purchase_price, quantity")
          .eq("invoice_id", invoiceId);
        const { data: payments } = await admin
          .from("payments")
          .select("id, method")
          .eq("invoice_id", invoiceId);
        const { data: allocations } = await admin
          .from("invoice_item_stock_allocations")
          .select("id, quantity, unit_cost")
          .eq("invoice_id", invoiceId);
        const { data: saleMovements } = await admin
          .from("stock_movements")
          .select("id, quantity, unit_cost")
          .eq("invoice_id", invoiceId)
          .eq("movement_type", "sale");
        expect(updatedProduct?.stock_quantity).toBe(9);
        expect(updatedLots).toEqual([{ quantity_remaining: 9 }]);
        expect(invoiceItems).toHaveLength(1);
        expect(invoiceItems?.[0]?.quantity).toBe(1);
        expect(Number(invoiceItems?.[0]?.purchase_price)).toBe(100);
        expect(payments).toHaveLength(1);
        expect(payments?.[0]?.method).toBe("card");
        expect(allocations).toHaveLength(1);
        expect(allocations?.[0]?.quantity).toBe(1);
        expect(Number(allocations?.[0]?.unit_cost)).toBe(100);
        expect(saleMovements).toHaveLength(1);
        expect(saleMovements?.[0]?.quantity).toBe(1);
        expect(Number(saleMovements?.[0]?.unit_cost)).toBe(100);

        await page.goto("/products?tab=products");
        const updatedRow = page.locator("tr").filter({ hasText: `${productName} Updated` }).first();
        await expect(updatedRow).toContainText("9");
        await updatedRow.getByRole("button", { name: "Stock & FIFO" }).click();
        await expect(page.getByText("9 items", { exact: true })).toBeVisible();
        await expect(page.getByText("1 lots", { exact: true })).toBeVisible();
        await page.getByRole("button", { name: "Close" }).click();

        await page.goto("/pos");
        await expect(
          page.locator(`[data-testid="pos-product-btn"][data-product-id="${productId}"]`),
        ).toContainText("9 in stock");
      }

      expect(pageErrors).toEqual([]);
      expect(consoleErrors).toEqual([]);
    } finally {
      await deleteMarkerRows(productId, invoiceId, marker);
      await expect.poll(async () => (await tableCounts()).products).toBe(before.products);
      const after = await tableCounts();
      expect(after).toEqual(before);
    }
  });
});
