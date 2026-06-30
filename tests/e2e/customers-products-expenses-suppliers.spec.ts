import { test, expect } from "@playwright/test";
import { hasCredentials } from "./helpers/env";
import { login } from "./helpers/auth";

test.describe("Customers, Products, Expenses, and Suppliers Smoke Tests", () => {
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

  test("Customers Section Smoke Test", async ({ page }) => {
    await page.goto("/customers");
    await expect(page.locator("header h1").first()).toHaveText("Customers", { timeout: 10000 });
    await expect(page.getByRole("heading", { name: "Customer Management", exact: true })).toBeVisible();
    
    await expect(page.getByPlaceholder("Name or phone number")).toBeVisible();

    // If there is at least one customer, click edit/view detail page
    const firstCustomerLink = page.locator("a[href^='/customers/']").first();
    if (await firstCustomerLink.count() > 0) {
      await firstCustomerLink.click();
      await page.waitForURL(/.*\/customers\/.+/);
      await expect(page.getByRole("link", { name: "Ledger", exact: true })).toBeVisible();
    }
  });

  test("Products Section Smoke Test", async ({ page }) => {
    await page.goto("/products");
    await expect(page.locator("header h1").first()).toHaveText("Products", { timeout: 10000 });
    await expect(page.getByRole("heading", { name: "Product catalog", exact: true })).toBeVisible();

    // Verify Tab navigation
    // Click Categories tab
    const categoriesTab = page.getByRole("button", { name: "Categories", exact: true });
    await expect(categoriesTab).toBeVisible();
    await categoriesTab.click();
    await page.waitForURL(/.*tab=categories.*/);
    await expect(page.getByPlaceholder("Search name or description")).toBeVisible();

    // Click Suppliers tab
    const suppliersTab = page.getByRole("button", { name: "Suppliers", exact: true });
    await expect(suppliersTab).toBeVisible();
    await suppliersTab.click();
    await page.waitForURL(/.*tab=suppliers.*/);
    await expect(page.getByPlaceholder("Search supplier details")).toBeVisible();

    // Click Products tab
    const productsTab = page.getByRole("button", { name: "Products", exact: true });
    await expect(productsTab).toBeVisible();
    await productsTab.click();
    await page.waitForURL(/.*tab=products.*/);
    await expect(page.getByRole("heading", { name: "Product catalog", exact: true })).toBeVisible();
  });

  test("Expenses Section Smoke Test", async ({ page }) => {
    await page.goto("/expenses");
    await expect(page.locator("header h1").first()).toHaveText("Expenses", { timeout: 10000 });
    await expect(page.getByRole("heading", { name: "All expenses", exact: true })).toBeVisible();
  });

  test("Suppliers Section Smoke Test", async ({ page }) => {
    // Visit Dues page
    await page.goto("/suppliers/dues");
    await expect(page.locator("header h1").first()).toHaveText("Supplier Dues", { timeout: 10000 });
    await expect(page.getByRole("heading", { name: "Supplier dues", exact: true })).toBeVisible();

    // A fresh seed has no outstanding dues, so the empty state replaces sorting controls.
    const sortLinkSupplier = page.locator("a[aria-label^='Sort by Supplier']");
    const noDues = page.getByText("No outstanding dues.", { exact: true });
    expect((await sortLinkSupplier.count()) > 0 || await noDues.isVisible()).toBe(true);

    // Visit Purchases page
    await page.goto("/suppliers/purchases");
    await expect(page.locator("header h1").first()).toHaveText("Supplier Purchases", { timeout: 10000 });
    await expect(page.getByText("Purchases this month", { exact: true })).toBeVisible();

    const sortLinkDate = page.locator("a[aria-label^='Sort by Date']");
    const noPurchases = page.getByText("No purchases match these filters.", { exact: true });
    expect((await sortLinkDate.count()) > 0 || await noPurchases.isVisible()).toBe(true);
  });

  test("Replenishment Section Smoke Test", async ({ page }) => {
    await page.goto("/purchases/replenishment");
    await expect(page.locator("header h1").first()).toHaveText("Replenishment", { timeout: 10000 });
    await expect(page.getByRole("heading", { name: "Inventory Replenishment", exact: true })).toBeVisible();

    await expect(page.getByRole("button", { name: "Sort", exact: true })).toBeVisible();
  });

  test("Customers Dark Mode Smoke Test", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("theme", "dark");
    });
    await page.goto("/customers");
    await expect(page.getByRole("heading", { name: "Customer Management", exact: true }).first()).toBeVisible({ timeout: 10000 });
  });
});
