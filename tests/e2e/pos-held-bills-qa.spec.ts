import { test, expect } from "@playwright/test";
import { login } from "./helpers/auth";
import { hasCredentials } from "./helpers/env";

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
    await page.goto("/pos");
    await expect(page).not.toHaveURL(/.*\/login.*/);

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

    // ---- Resume Customer A ----
    await first('button:has-text("Resume")').click();
    await expect(first('h2:has-text("Resume held bill")')).toBeVisible();
    await page.locator('[role="dialog"]:has-text("Resume held bill") button:has-text("Resume")').click();
    // Resume runs inside an async transition; wait for completion toast.
    await expect(first('text=Held bill resumed.')).toBeVisible({ timeout: 10000 });
    // Resumed bill should appear as the active tab labelled "Customer A".
    // Active tab input is editable; inactive tabs are read-only.
    const resumedTabInput = page.locator('div[class*="group flex shrink-0"] input[type="text"]:not([readonly])').first();
    await expect(resumedTabInput).toHaveValue("Customer A");

    // ---- Hold Customer A again so we can reorder Customer B first ----
    await first('button:has-text("Hold")').click();
    await page.locator('[role="dialog"]:has-text("Hold bill") button:has-text("Hold bill")').click();
    await expect(first('text=Bill held.')).toBeVisible({ timeout: 10000 });

    // ---- Resume Customer B and checkout first ----
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
    await page.goto("/pos");
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

    // ---- Close-tab confirmation: add a new item, click tab X, expect prompt ----
    await page.goto("/pos");
    await addFirstAvailableProduct(0);
    await first('button[aria-label="Close tab"]').click();
    await expect(first('h2:has-text("Close this bill?")')).toBeVisible();
    await expect(page.locator('[role="dialog"]:has-text("Close this bill?") button:has-text("Hold & close")')).toBeVisible();
    await expect(page.locator('[role="dialog"]:has-text("Close this bill?") button:has-text("Discard")')).toBeVisible();
    await page.locator('[role="dialog"]:has-text("Close this bill?") button:has-text("Cancel")').click();
    await expect(first('h2:has-text("Close this bill?")')).not.toBeVisible();
  });
});
