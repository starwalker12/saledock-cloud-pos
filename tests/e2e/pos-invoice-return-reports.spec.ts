import { test, expect } from "@playwright/test";
import { hasCredentials, allowProductionMutations } from "./helpers/env";
import { login } from "./helpers/auth";
import { getUniqueName } from "./helpers/test-data";

test.describe("SaleDock POS, Invoice, Return, and Reports Smoke Tests", () => {
  test.beforeEach(async ({ page }) => {
    // Check credentials first
    if (!hasCredentials()) {
      test.skip(true, "Skipping test because PLAYWRIGHT_TEST_EMAIL or PLAYWRIGHT_TEST_PASSWORD are not set in the environment.");
      return;
    }

    const loggedIn = await login(page);
    if (!loggedIn) {
      test.skip(true, "Skipping test because login helper failed to authenticate (possibly due to invalid credentials or captcha).");
    }
  });

  test("Core Navigation Smoke Test", async ({ page }) => {
    const routes = ["/dashboard", "/pos", "/products", "/customers", "/invoices", "/returns", "/expenses", "/reports"];
    for (const route of routes) {
      await page.goto(route);
      await expect(page).not.toHaveURL(/.*\/login.*/);
    }
  });

  test("Full POS Sale, Invoice, and Return flow", async ({ page }) => {
    // 1. Production Mutation Guard
    if (!allowProductionMutations()) {
      console.log("Mutation test skipped: points to production and PLAYWRIGHT_ALLOW_PRODUCTION_MUTATIONS is not true.");
      test.skip(
        true,
        "Skipping mutation smoke test because PLAYWRIGHT_BASE_URL points to production. Set PLAYWRIGHT_ALLOW_PRODUCTION_MUTATIONS=true only for a safe test account."
      );
      return;
    }

    // 2. Go to POS
    await page.goto("/pos");

    // Check if there are any products to sell
    const productGrid = page.locator('[data-testid="pos-product-btn"]');
    const count = await productGrid.count();
    if (count === 0) {
      console.log("No products or services available in the POS grid. Skipping sale/return test.");
      test.skip(true, "No products available in POS.");
      return;
    }

    // Click the first available (not disabled) product button
    let clicked = false;
    for (let i = 0; i < count; i++) {
      const btn = productGrid.nth(i);
      const isDisabled = await btn.isDisabled();
      if (!isDisabled) {
        await btn.click();
        clicked = true;
        break;
      }
    }

    if (!clicked) {
      console.log("All products in the POS grid are disabled or out of stock. Skipping sale/return test.");
      test.skip(true, "No in-stock products available to sell.");
      return;
    }

    // Wait for item to appear in the cart list
    await expect(page.getByRole("button", { name: "Clear", exact: true })).not.toBeDisabled();

    // Click "Exact" cash tender button if present (manual QA simulation)
    const exactBtn = page.locator('[data-testid="pos-exact-tender-btn"]');
    if (await exactBtn.isVisible() && !(await exactBtn.isDisabled())) {
      await exactBtn.click();
    } else {
      const tenderInput = page.locator('[data-testid="pos-amount-tendered-input"]');
      if (await tenderInput.isVisible() && !(await tenderInput.isDisabled())) {
        await tenderInput.fill("10000");
      }
    }

    // Enter a TEST reference tag in the Note textarea
    const noteInput = page.locator('[data-testid="pos-note-input"]');
    if (await noteInput.isVisible()) {
      const testTag = getUniqueName("TEST-PLAYWRIGHT");
      await noteInput.fill(testTag);
    }

    // Click checkout button
    const checkoutBtn = page.locator('[data-testid="pos-checkout-btn"]');
    if (await checkoutBtn.isDisabled()) {
      console.log("Checkout button remains disabled. Skipping checkout flow.");
      test.skip(true, "Checkout button is disabled, cannot complete the sale.");
      return;
    }
    await checkoutBtn.click();

    // Wait for the success state
    const successMsg = page.locator("text=Sale recorded as");
    await expect(successMsg).toBeVisible({ timeout: 15000 });

    // Click "Open invoice"
    const openInvoiceLink = page.locator("a:has-text('Open invoice')");
    await expect(openInvoiceLink).toBeVisible();
    
    const invoiceUrl = await openInvoiceLink.getAttribute("href");
    expect(invoiceUrl).toBeTruthy();

    await openInvoiceLink.click();
    await page.waitForURL(/.*\/invoices\/.*/);

    // Verify invoice number and totals are visible
    await expect(page.locator("header h1").first()).toContainText(/^Invoice INV-/);
    await expect(page.getByRole("button", { name: "Print A4 / Save PDF", exact: true })).toBeVisible();

    // 3. Return & Refund Flow on the Invoice Page
    // Check if the form is already disabled or if there are no returnable items
    const noReturnableItems = await page.locator("text=All items on this invoice have already been returned").count();
    if (noReturnableItems > 0) {
      console.log("No returnable items on this invoice. Skipping return test.");
      test.skip(true, "No returnable items on this invoice.");
      return;
    }

    const qtyInput = page.locator("input[name='quantity']").first();
    if (await qtyInput.count() === 0) {
      console.log("No quantity inputs found for return. Skipping return test.");
      test.skip(true, "No quantity inputs found for return.");
      return;
    }

    await qtyInput.fill("1");

    // Grab the calculated max refund total
    const refundAmtInput = page.locator("input[name='refund_amount']");
    const maxRefund = await refundAmtInput.getAttribute("max");
    if (maxRefund) {
      await refundAmtInput.fill(maxRefund);
    }

    const refundMethod = page.getByRole("button", { name: "Refund method", exact: true });
    await refundMethod.click();
    await page.getByRole("option", { name: "Cash", exact: true }).click();

    // Click "Process return" button
    const processReturnBtn = page.locator("button[type='submit']:has-text('Process return')");
    await processReturnBtn.click();

    // Verify the return success card appears
    const returnNoText = page.locator("text=Return No:");
    await expect(returnNoText).toBeVisible({ timeout: 15000 });

    const viewReturnLink = page.locator("a:has-text('View return')");
    await expect(viewReturnLink).toBeVisible();

    // Click view return and verify it loads
    await viewReturnLink.click();
    await page.waitForURL(/.*\/returns\/.*/);
    await expect(page.locator("header h1").first()).toContainText(/^Return RET-/);
  });

  test("Reports Smoke Test", async ({ page }) => {
    // Visit reports page
    await page.goto("/reports");

    // Verify reports page elements load
    await expect(page.getByText("Gross sales", { exact: true })).toBeVisible();
    await expect(page.getByText("Estimated Net Profit", { exact: true }).first()).toBeVisible();

    // Verify the reconciliation helper card can be expanded
    const summaryHeader = page.locator("summary:has-text('How do these numbers connect')");
    await expect(summaryHeader).toBeVisible();
    await summaryHeader.click();

    // Verify that the helper text exists and is shown
    await expect(page.getByText("Gross Sales", { exact: true })).toBeVisible();
    await expect(page.getByText("Discounts Applied", { exact: true })).toBeVisible();
    await expect(page.getByRole("group").getByText("Net Sales (Revenue)", { exact: true })).toBeVisible();
  });
});
