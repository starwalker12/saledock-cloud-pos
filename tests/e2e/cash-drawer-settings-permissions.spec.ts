import { test, expect } from "@playwright/test";
import { hasCredentials } from "./helpers/env";
import { login } from "./helpers/auth";

test.describe("Cash Drawer, Settings, and Permissions Smoke Tests", () => {
  test.beforeEach(async ({ page }) => {
    if (!hasCredentials()) {
      test.skip(true, "Skipping test because PLAYWRIGHT_TEST_EMAIL or PLAYWRIGHT_TEST_PASSWORD are not set in the environment.");
      return;
    }

    const loggedIn = await login(page);
    if (!loggedIn) {
      test.skip(true, "Skipping test because login helper failed to authenticate (possibly due to invalid credentials or captcha).");
    }
  });

  test("Cash Drawer Section Smoke Test", async ({ page }) => {
    await page.goto("/daily-closing");
    await expect(page.locator("header h1").first()).toHaveText("Cash Drawer", { timeout: 10000 });
    await expect(page.getByRole("heading", { name: "Cash Drawer", exact: true })).toBeVisible();
  });

  test("Settings Section Smoke Test", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.locator("header h1").first()).toHaveText("Settings", { timeout: 10000 });
    await expect(page.getByRole("button", { name: "Shop Profile", exact: true })).toBeVisible();

    // Verify sub-tabs
    const connectedAccountsTab = page.getByRole("button", { name: "Connected Accounts", exact: true });
    if (await connectedAccountsTab.count() === 1) {
      await connectedAccountsTab.click();
      await page.waitForURL(/.*tab=accounts.*/);
      await expect(page.getByRole("heading", { name: "Connected Accounts", exact: true })).toBeVisible();
    }

    const securityTab = page.getByRole("button", { name: "Security", exact: true });
    if (await securityTab.count() === 1) {
      await securityTab.click();
      await page.waitForURL(/.*tab=security.*/);
      await expect(page.getByRole("heading", { name: "Sign-in Security", exact: true })).toBeVisible();
    }
  });

  test("User Management and Permissions Smoke Test", async ({ page }) => {
    // Visit users page
    await page.goto("/users");
    await expect(page.locator("header h1").first()).toHaveText("Users", { timeout: 10000 });
    await expect(page.getByText("Staff access", { exact: true })).toBeVisible();

    // Verify sorting exists if staff access is allowed
    const staffAccessHeader = page.locator("text=Staff access");
    if (await staffAccessHeader.count() > 0) {
      const sortBtnStaff = page.locator("button[aria-label^='Sort by Staff']").first();
      await expect(sortBtnStaff).toBeVisible();
    }

    // Visit staff permissions page
    await page.goto("/settings/permissions");
    await expect(page.locator("header h1").first()).toHaveText("Staff Permissions", { timeout: 10000 });
    await expect(page.getByRole("heading", { name: "Staff Permissions", exact: true })).toBeVisible();
  });
});
