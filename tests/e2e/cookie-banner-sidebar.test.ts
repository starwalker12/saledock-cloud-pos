import { test, expect } from "@playwright/test";
import { login } from "./helpers/auth";
import { hasCredentials } from "./helpers/env";

/**
 * Verify the cookie banner only appears when no consent decision exists and that
 * sidebar expand/collapse never reopens it.
 *
 * These tests require analytics to be configured in the test environment
 * (NEXT_PUBLIC_GA_MEASUREMENT_ID or NEXT_PUBLIC_CLARITY_PROJECT_ID). If the
 * banner never appears after clearing storage, the suite is skipped.
 */
test.describe("Cookie banner + sidebar regression", () => {
  test.beforeEach(async ({ page }) => {
    // Clear all site storage so each test starts with no prior consent.
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  });

  test("banner hidden after reject all; sidebar toggle does not reopen it", async ({ page }) => {
    await page.goto("/");

    const banner = page.locator('div[role="region"][aria-label="Cookie consent"]').first();
    await expect(banner).toBeVisible({ timeout: 5000 });

    await page.locator('button[aria-label="Reject optional cookies"]').first().click();
    await expect(banner).not.toBeVisible();

    // Simulate sidebar-triggered preference change (the bug scenario).
    await page.evaluate(() => {
      const prefs = JSON.parse(localStorage.getItem("saledock-sidebar-preferences-v1") || "{}") || {};
      prefs.collapsed = !prefs.collapsed;
      localStorage.setItem("saledock-sidebar-preferences-v1", JSON.stringify(prefs));
      window.dispatchEvent(new Event("saledock-sidebar-preferences-changed"));
    });

    await page.waitForTimeout(500);
    await expect(banner).not.toBeVisible();

    // Reload should still hide the banner.
    await page.reload();
    await expect(banner).not.toBeVisible();
  });

  test("banner hidden after accept all; stays hidden on dashboard after sidebar toggle", async ({ page }) => {
    if (!hasCredentials()) {
      test.skip(true, "PLAYWRIGHT_TEST_EMAIL or PLAYWRIGHT_TEST_PASSWORD missing.");
    }

    // Sign in first so the dashboard sidebar state matches the reported bug.
    const loggedIn = await login(page);
    if (!loggedIn) {
      test.skip(true, "Login helper failed.");
    }

    await page.goto("/dashboard");
    await expect(page).not.toHaveURL(/.*\/login.*/);

    // Clear storage on the authenticated dashboard so the banner appears fresh.
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.reload();

    const banner = page.locator('div[role="region"][aria-label="Cookie consent"]').first();
    await expect(banner).toBeVisible({ timeout: 5000 });

    await page.locator('button[aria-label="Accept all cookies"]').first().click();
    await expect(banner).not.toBeVisible();

    // Toggle sidebar collapse/expand twice.
    const collapseBtn = page.locator('button[aria-label="Collapse sidebar"], button[aria-label="Expand sidebar"]').first();
    for (let i = 0; i < 2; i++) {
      await collapseBtn.click();
      await page.waitForTimeout(300);
    }

    await expect(banner).not.toBeVisible();

    // Reload dashboard and confirm banner stays hidden.
    await page.reload();
    await expect(banner).not.toBeVisible();
  });
});
