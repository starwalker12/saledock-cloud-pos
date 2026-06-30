import { test, expect } from "@playwright/test";
import { login, loginWithCredentials } from "./helpers/auth";
import { hasCredentials } from "./helpers/env";
import {
  getLocalAdminClient,
  isLocalPlaywrightRun,
  LOCAL_QA_ORG_ID,
  SEEDED_PHYSICAL_PRODUCT_ID,
} from "./helpers/local-supabase";

async function dismissCookieBanner(page: import("@playwright/test").Page) {
  await page.evaluate(() => {
    window.localStorage.setItem(
      "analytics-consent",
      JSON.stringify({
        value: "rejected",
        version: "2026-06-analytics-v1",
        timestamp: new Date().toISOString(),
      }),
    );
  });
  const reject = page.locator('button[aria-label="Reject optional cookies"]');
  if (await reject.isVisible().catch(() => false)) {
    await reject.click();
  }
}

async function gotoPos(page: import("@playwright/test").Page) {
  try {
    await page.goto("/pos", { waitUntil: "domcontentloaded" });
  } catch (error) {
    const isExpectedAbort = error instanceof Error && error.message.includes("net::ERR_ABORTED");
    if (!isExpectedAbort) throw error;
  }
  await expect(page).toHaveURL(/\/pos(?:\?|$)/);
}

test.describe("POS Held Bills QA", () => {
  test.beforeEach(async ({ page }) => {
    if (!hasCredentials()) {
      test.skip(true, "PLAYWRIGHT_TEST_EMAIL or PLAYWRIGHT_TEST_PASSWORD missing.");
    }
    const loggedIn = await login(page);
    if (!loggedIn) {
      test.skip(true, "Login helper failed.");
    }
  });

  test("held bills lifecycle - tabs, hold, resume, invoice ordering", async ({ page }) => {
    test.setTimeout(120_000);
    await dismissCookieBanner(page);
    await gotoPos(page);
    await expect(page).not.toHaveURL(/.*\/login.*/);
    await expect(page.locator('[role="region"][aria-label="Cookie consent"]')).toHaveCount(0);

    // The tab bar renders in both desktop and mobile layouts; scope to first match.
    const first = (locator: string) => page.locator(locator).first();

    await expect(first('button:has-text("+ New bill")')).toBeVisible({ timeout: 10000 });

    async function addFirstAvailableProduct(nth = 0) {
      const products = page.locator('[data-testid="pos-product-btn"]');
      await expect(products.first()).toBeVisible();
      const count = await products.count();
      for (let i = nth; i < count; i++) {
        const btn = products.nth(i);
        if (await btn.isDisabled().catch(() => true)) continue;
        await btn.click();
        return i;
      }
      throw new Error("No in-stock product available to add");
    }

    // ---- Tab 1: Customer A (service, no stock lots needed) ----
    const tabInput = first('div[class*="group flex shrink-0"] input[type="text"]');
    await expect(tabInput).toBeVisible();
    await tabInput.fill("Customer A");
    await addFirstAvailableProduct(1);
    await expect(first('[data-testid="pos-checkout-btn"]')).toBeEnabled();

    // ---- Tab 2: Customer B (service, no stock lots needed) ----
    await first('button:has-text("+ New bill")').click();
    const firstTab = first('div[class*="group flex shrink-0"]');
    await expect(firstTab).toBeVisible();
    const tab2Input = page.locator('div[class*="group flex shrink-0"] input[type="text"]').nth(1);
    await expect(tab2Input).toBeVisible();
    await tab2Input.fill("Customer B");
    await addFirstAvailableProduct(1);

    // ---- Switch back to Tab 1 and verify it still has Customer A's item ----
    await firstTab.click();
    await expect(first('p:has-text("Cart is empty")')).not.toBeVisible();

    // ---- Hold Tab 1 (Customer A) ----
    await first('button:has-text("Hold")').click();
    await expect(first('h2:has-text("Hold bill")')).toBeVisible();
    await first('input[placeholder="e.g. Counter 2 / Umar"]').fill("Customer A");
    await first('textarea[placeholder="Any details about this held bill"]').fill("QA held bill note");
    await page.locator('[role="dialog"]:has-text("Hold bill") button:has-text("Hold bill")').click();

    // Confirm held: tab should close or clear, no invoice number should appear
    await expect(first('text=Bill held.')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Sale recorded as')).not.toBeVisible();

    // ---- Open Held Bills drawer and verify Customer A ----
    await first('button:has-text("Held bills")').click();
    await expect(first('h2:has-text("Held bills")')).toBeVisible();
    await expect(first('text=Customer A')).toBeVisible();
    await expect(first('text=QA held bill note')).toBeVisible();

    // Keep Customer A held while Customer B checks out first. Re-holding a
    // resumed record would create a second held-bill lifecycle and make this
    // invoice-ordering test less representative of the cashier workflow.
    const heldDrawer = page.getByRole("dialog", { name: "Held bills" });
    await heldDrawer.getByRole("button", { name: "Close", exact: true }).click();

    // ---- Checkout Customer B first ----
    // Customer B should still be on the remaining active tab
    const remainingTabInput = page.locator('div[class*="group flex shrink-0"] input[type="text"]:not([readonly])').first();
    await expect(remainingTabInput).toHaveValue("Customer B");
    await first('[data-testid="pos-exact-tender-btn"]').click();
    await first('[data-testid="pos-checkout-btn"]').click();

    const success1 = first('text=Sale recorded as');
    await expect(success1).toBeVisible({ timeout: 15000 });
    const successText1 = await success1.textContent();
    const invoiceNo1 = successText1?.match(/INV-[\w-]+/)?.[0];
    expect(invoiceNo1).toMatch(/^INV-/);

    // ---- Resume Customer A and checkout ----
    await gotoPos(page);
    await first('button:has-text("Held bills")').click();
    await expect(first('text=Customer A')).toBeVisible();
    await first('button:has-text("Resume")').click();
    await page.locator('[role="dialog"]:has-text("Resume held bill") button:has-text("Resume")').click();
    await expect(first('text=Held bill resumed.')).toBeVisible({ timeout: 10000 });
    await first('[data-testid="pos-exact-tender-btn"]').click();
    await first('[data-testid="pos-checkout-btn"]').click();

    const success2 = first('text=Sale recorded as');
    await expect(success2).toBeVisible({ timeout: 15000 });
    const successText2 = await success2.textContent();
    const invoiceNo2 = successText2?.match(/INV-[\w-]+/)?.[0];
    expect(invoiceNo2).toMatch(/^INV-/);

    // Held bills should not consume invoice numbers; Customer B checked out first so
    // their invoice number should be lower than Customer A's.
    const numeric1 = parseInt(invoiceNo1!.replace(/\D/g, ""), 10);
    const numeric2 = parseInt(invoiceNo2!.replace(/\D/g, ""), 10);
    expect(numeric1).toBeLessThan(numeric2);

    // Completed held bills leave neither a stale drawer row nor a stale cart.
    await gotoPos(page);
    await first('button:has-text("Held bills")').click();
    const completedDrawer = page.getByRole("dialog", { name: "Held bills" });
    await expect(completedDrawer).toBeVisible();
    await expect(completedDrawer.getByText("Customer A", { exact: true })).toHaveCount(0);
    await expect(completedDrawer.getByText("No held bills", { exact: true })).toBeVisible();
    await completedDrawer.getByRole("button", { name: "Close", exact: true }).click();

    // ---- Close-tab confirmation: add a new item, click tab X, expect prompt ----
    await gotoPos(page);
    await addFirstAvailableProduct(0);
    await first('button[aria-label="Close tab"]').click();
    await expect(first('h2:has-text("Close this bill?")')).toBeVisible();
    await expect(page.locator('[role="dialog"]:has-text("Close this bill?") button:has-text("Hold & close")')).toBeVisible();
    await expect(page.locator('[role="dialog"]:has-text("Close this bill?") button:has-text("Discard")')).toBeVisible();
    await page.locator('[role="dialog"]:has-text("Close this bill?") button:has-text("Cancel")').click();
    await expect(first('h2:has-text("Close this bill?")')).not.toBeVisible();
  });
});

test.describe("POS physical-product held bill safety", () => {
  test.beforeEach(() => {
    test.skip(!isLocalPlaywrightRun(), "Physical held-bill checkout QA is local-only.");
  });

  test("holding physical stock does not consume invoice numbers or FIFO until checkout", async ({ page }) => {
    test.setTimeout(120_000);
    const admin = getLocalAdminClient();
    const heldLabel = `Customer A physical ${Date.now()}`;

    async function productSnapshot() {
      const { data: product, error: productError } = await admin
        .from("products")
        .select("id, name, sale_price, stock_quantity")
        .eq("id", SEEDED_PHYSICAL_PRODUCT_ID)
        .eq("organization_id", LOCAL_QA_ORG_ID)
        .single();
      if (productError || !product) throw new Error("Seeded physical QA product was not found.");

      const { data: lots, error: lotsError } = await admin
        .from("product_stock_lots")
        .select("quantity_remaining")
        .eq("product_id", SEEDED_PHYSICAL_PRODUCT_ID)
        .eq("organization_id", LOCAL_QA_ORG_ID);
      if (lotsError) throw new Error("Seeded FIFO lots could not be read.");

      return {
        id: product.id as string,
        name: product.name as string,
        salePrice: Number(product.sale_price),
        stock: Number(product.stock_quantity),
        lotRemaining: (lots ?? []).reduce(
          (sum, lot) => sum + Number(lot.quantity_remaining ?? 0),
          0,
        ),
      };
    }

    async function invoiceNumbers() {
      const { data, error } = await admin
        .from("invoices")
        .select("id, invoice_no")
        .eq("organization_id", LOCAL_QA_ORG_ID);
      if (error) throw new Error("Local invoice state could not be read.");
      return data ?? [];
    }

    function sequence(invoiceNo: string): number {
      const value = Number(invoiceNo.replace(/\D/g, ""));
      if (!Number.isFinite(value)) throw new Error(`Unexpected local invoice number: ${invoiceNo}`);
      return value;
    }

    async function addSeededProduct() {
      await page.getByPlaceholder("Search by name, SKU, or barcode").fill(before.name);
      const productButton = page.locator(
        `[data-testid="pos-product-btn"][data-product-id="${before.id}"]`,
      );
      await expect(productButton).toBeVisible();
      await expect(productButton).toBeEnabled();
      await productButton.click();
    }

    async function checkoutActiveBill(): Promise<{ id: string; no: string }> {
      await page.locator('[data-testid="pos-exact-tender-btn"]').first().click();
      await page.locator('[data-testid="pos-checkout-btn"]').first().click();
      const success = page.getByText(/Sale recorded as INV-/).first();
      await expect(success).toBeVisible({ timeout: 20_000 });
      const text = (await success.textContent()) ?? "";
      const no = text.match(/INV-[\w-]+/)?.[0];
      expect(no).toMatch(/^INV-/);

      const { data, error } = await admin
        .from("invoices")
        .select("id, invoice_no")
        .eq("organization_id", LOCAL_QA_ORG_ID)
        .eq("invoice_no", no!)
        .single();
      if (error || !data) throw new Error("Completed local invoice could not be verified.");
      return { id: data.id as string, no: data.invoice_no as string };
    }

    const before = await productSnapshot();
    expect(before.stock).toBeGreaterThanOrEqual(2);
    expect(before.lotRemaining).toBe(before.stock);
    const invoicesBefore = await invoiceNumbers();
    const maxBefore = invoicesBefore.reduce(
      (max, invoice) => Math.max(max, sequence(invoice.invoice_no as string)),
      0,
    );

    expect(await loginWithCredentials(page, "owner@saledock.local", "Password123!")).toBe(true);
    await dismissCookieBanner(page);
    await gotoPos(page);
    await expect(page).toHaveURL(/\/pos(?:\?|$)/);
    await expect(page.locator('[role="region"][aria-label="Cookie consent"]')).toHaveCount(0);

    const activeLabel = () => page.locator('[data-testid="pos-bill-label"]:not([readonly])').first();
    await activeLabel().fill("Customer A");
    await addSeededProduct();

    await page.getByRole("button", { name: "Hold", exact: true }).click();
    const holdDialog = page.getByRole("dialog", { name: "Hold bill" });
    await holdDialog.getByPlaceholder("e.g. Counter 2 / Umar").fill(heldLabel);
    await holdDialog.getByPlaceholder("Any details about this held bill").fill("Local FIFO held-bill QA");
    await holdDialog.getByRole("button", { name: "Hold bill", exact: true }).click();
    await expect(page.getByText("Bill held.", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Sale recorded as INV-/)).toHaveCount(0);

    const afterHold = await productSnapshot();
    expect(afterHold.stock).toBe(before.stock);
    expect(afterHold.lotRemaining).toBe(before.lotRemaining);
    expect((await invoiceNumbers()).length).toBe(invoicesBefore.length);

    const { data: heldBill, error: heldError } = await admin
      .from("pos_held_bills")
      .select("id, status, cart, completed_invoice_id")
      .eq("organization_id", LOCAL_QA_ORG_ID)
      .eq("label", heldLabel)
      .single();
    if (heldError || !heldBill) throw new Error("Held bill was not saved for local QA.");
    expect(heldBill.status).toBe("held");
    expect(heldBill.completed_invoice_id).toBeNull();
    expect(heldBill.cart).toEqual([
      expect.objectContaining({
        product_id: before.id,
        quantity: 1,
        unit_price: before.salePrice,
      }),
    ]);

    await page.getByRole("button", { name: "+ New bill", exact: true }).first().click();
    await activeLabel().fill("Customer B");
    await addSeededProduct();
    const customerBInvoice = await checkoutActiveBill();
    expect(sequence(customerBInvoice.no)).toBe(maxBefore + 1);

    const afterCustomerB = await productSnapshot();
    expect(afterCustomerB.stock).toBe(before.stock - 1);
    expect(afterCustomerB.lotRemaining).toBe(before.lotRemaining - 1);
    expect(afterCustomerB.lotRemaining).toBe(afterCustomerB.stock);

    await gotoPos(page);
    await page.getByRole("button", { name: "Held bills", exact: true }).click();
    const heldCard = page.locator(`[data-held-bill-id="${heldBill.id}"]`);
    await expect(heldCard).toBeVisible();
    await expect(heldCard).toContainText(heldLabel);
    await heldCard.getByRole("button", { name: "Resume", exact: true }).click();
    const resumeDialog = page.getByRole("dialog", { name: "Resume held bill" });
    await resumeDialog.getByRole("button", { name: "Resume", exact: true }).click();
    await expect(page.getByText("Held bill resumed.", { exact: true })).toBeVisible({ timeout: 15_000 });

    await expect(activeLabel()).toHaveValue(heldLabel);
    const resumedLine = page.locator("li").filter({ hasText: before.name }).first();
    await expect(resumedLine).toBeVisible();
    await expect(resumedLine.locator('input[type="number"]').first()).toHaveValue(String(before.salePrice));
    await expect(page.getByText(/Sale recorded as INV-/)).toHaveCount(0);

    const beforeCustomerACheckout = await productSnapshot();
    expect(beforeCustomerACheckout.stock).toBe(before.stock - 1);
    const customerAInvoice = await checkoutActiveBill();
    expect(sequence(customerAInvoice.no)).toBe(sequence(customerBInvoice.no) + 1);

    await expect.poll(async () => {
      const { data } = await admin
        .from("pos_held_bills")
        .select("status, completed_invoice_id")
        .eq("id", heldBill.id)
        .single();
      return data;
    }).toEqual({ status: "completed", completed_invoice_id: customerAInvoice.id });

    const afterCustomerA = await productSnapshot();
    expect(afterCustomerA.stock).toBe(before.stock - 2);
    expect(afterCustomerA.lotRemaining).toBe(before.lotRemaining - 2);
    expect(afterCustomerA.lotRemaining).toBe(afterCustomerA.stock);
    await expect(page.getByText("Cart is empty. Tap a product to add it.", { exact: true })).toBeVisible();

    const invoicesAfter = await invoiceNumbers();
    expect(invoicesAfter.length).toBe(invoicesBefore.length + 2);
    for (const invoice of [customerBInvoice, customerAInvoice]) {
      const { count: paymentCount, error: paymentError } = await admin
        .from("payments")
        .select("id", { count: "exact", head: true })
        .eq("invoice_id", invoice.id);
      if (paymentError) throw new Error("Payment count could not be verified.");
      expect(paymentCount).toBe(1);

      const { count: itemCount, error: itemError } = await admin
        .from("invoice_items")
        .select("id", { count: "exact", head: true })
        .eq("invoice_id", invoice.id)
        .eq("product_id", before.id);
      if (itemError) throw new Error("Invoice item count could not be verified.");
      expect(itemCount).toBe(1);
    }

    await page.getByRole("button", { name: "Held bills", exact: true }).click();
    await expect(page.locator(`[data-held-bill-id="${heldBill.id}"]`)).toHaveCount(0);
  });
});
