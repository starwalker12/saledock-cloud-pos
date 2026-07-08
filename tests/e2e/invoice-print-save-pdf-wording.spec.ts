import { expect, test } from "@playwright/test";
import { isLocalPlaywrightRun, loginLocalOwnerDirectly, SEEDED_PHYSICAL_PRODUCT_ID } from "./helpers/local-supabase";

function skipUnlessLocal(): void {
  test.skip(!isLocalPlaywrightRun(), "Invoice wording QA is restricted to localhost.");
}

test("invoice Share modal action wording matches browser print behavior", async ({ page }) => {
  test.setTimeout(120_000);
  skipUnlessLocal();

  const nativeDialogs: string[] = [];
  page.on("dialog", async (dialog) => {
    nativeDialogs.push(dialog.message());
    await dialog.dismiss();
  });

  // Log in via direct local session injection and create a disposable invoice via POS.
  await loginLocalOwnerDirectly(page);

  // Suppress the analytics cookie consent banner so it does not intercept clicks.
  const acceptCookies = page.getByRole("button", { name: "Accept all cookies", exact: true });
  if (await acceptCookies.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await acceptCookies.click();
    await expect(page.getByTestId("cookie-consent-banner")).toHaveCount(0);
  }

  await page.goto("/pos");
  await expect(page).toHaveURL(/\/pos(?:\?|$)/);

  await page.locator(`[data-testid="pos-product-btn"][data-product-id="${SEEDED_PHYSICAL_PRODUCT_ID}"]`).click();
  await page.locator('[data-testid="pos-exact-tender-btn"]').click();
  await page.locator('[data-testid="pos-note-input"]').fill(`QA invoice wording ${Date.now()}`);
  await page.locator('[data-testid="pos-checkout-btn"]').click();
  await expect(page.getByText(/Sale recorded as INV-/)).toBeVisible({ timeout: 20_000 });

  const invoiceLink = page.getByRole("link", { name: /Open invoice/i });
  await expect(invoiceLink).toBeVisible();
  const invoiceHref = await invoiceLink.getAttribute("href");
  expect(invoiceHref).toBeTruthy();

  await page.goto(invoiceHref!);
  await expect(page.locator("#invoice-print")).toBeVisible();

  // Main action wording remains unchanged.
  const mainPrintButton = page.getByRole("button", { name: "Print A4 / Save PDF", exact: true });
  await expect(mainPrintButton).toBeVisible();

  // Stub window.open so the WhatsApp share does not navigate away.
  await page.evaluate(() => {
    (window as typeof window & { _openCalls: string[] })._openCalls = [];
    window.open = function (url?: string | URL) {
      (window as typeof window & { _openCalls: string[] })._openCalls.push(String(url ?? ""));
      return null;
    };
  });

  // Stub window.print so we can assert it is called without opening the browser dialog.
  await page.evaluate(() => {
    (window as typeof window & { _printCalls: number; _printMode?: string })._printCalls = 0;
    window.print = function () {
      (window as typeof window & { _printCalls: number })._printCalls += 1;
      (window as typeof window & { _printMode?: string })._printMode = document.body.dataset.printMode;
    };
  });

  // Open the Share Invoice modal.
  await page.getByRole("button", { name: "Share WhatsApp", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Share Invoice", level: 3 })).toBeVisible();

  // The modal should contain the corrected wording and should not contain the old wording.
  const correctedAction = page.locator("button").filter({ hasText: "Print / Save as PDF" });
  await expect(correctedAction).toBeVisible();
  await expect(page.locator("button").filter({ hasText: "Download PDF" })).toHaveCount(0);
  await expect(correctedAction).toHaveAttribute("aria-label", "Print or save invoice as PDF");

  // Click the corrected action and verify the browser print flow is invoked with A4 mode.
  await correctedAction.click();
  await expect(page.getByRole("heading", { name: "Share Invoice", level: 3 })).toHaveCount(0);

  const printMetrics = await page.evaluate(() => ({
    calls: (window as typeof window & { _printCalls: number })._printCalls,
    mode: (window as typeof window & { _printMode?: string })._printMode,
  }));
  expect(printMetrics.calls).toBe(1);
  expect(printMetrics.mode).toBe("a4");

  // Invoice financial content remains visible and unchanged.
  await expect(page.locator("#invoice-print")).toContainText("Subtotal");
  await expect(page.locator("#invoice-print")).toContainText("Grand total");
  await expect(page.locator("#invoice-print")).toContainText("Paid");
  await expect(page.locator("#invoice-print")).toContainText("Payment");
  await expect(page.locator("body")).not.toContainText(/Unhandled Runtime Error|Build Error/i);

  expect(nativeDialogs).toEqual([]);
});
