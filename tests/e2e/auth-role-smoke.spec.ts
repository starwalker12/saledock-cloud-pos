import { expect, test, type Page } from "@playwright/test";
import { loginWithCredentials } from "./helpers/auth";
import { isLocalPlaywrightRun } from "./helpers/local-supabase";

const PASSWORD = "Password123!";

const ROLE_CASES = [
  { role: "owner", email: "owner@saledock.local", pos: true, catalogWrite: true, manageUsers: true, manageSettings: true },
  { role: "admin", email: "admin@saledock.local", pos: true, catalogWrite: true, manageUsers: true, manageSettings: true },
  { role: "manager", email: "manager@saledock.local", pos: true, catalogWrite: true, manageUsers: false, manageSettings: false },
  { role: "cashier", email: "cashier@saledock.local", pos: true, catalogWrite: false, manageUsers: false, manageSettings: false },
  { role: "technician", email: "technician@saledock.local", pos: false, catalogWrite: false, manageUsers: false, manageSettings: false },
] as const;

function skipUnlessLocal(): void {
  test.skip(!isLocalPlaywrightRun(), "Local fake-account smoke tests never run against non-local URLs.");
}

async function expectPageTitle(page: Page, title: string): Promise<void> {
  await expect(page.locator("header h1").first()).toHaveText(title, { timeout: 15_000 });
}

test.describe("Local authentication smoke", () => {
  test.beforeEach(skipUnlessLocal);

  test("logged-out protected routes redirect to login", async ({ page }) => {
    for (const route of ["/dashboard", "/pos"]) {
      await page.goto(route);
      await expect(page).toHaveURL(/\/login(?:\?|$)/);
      await expect(page.getByRole("heading", { name: "Sign in to your shop" })).toBeVisible();
    }
  });

  test("owner login survives refresh and logout ends the session", async ({ page }) => {
    expect(await loginWithCredentials(page, "owner@saledock.local", PASSWORD)).toBe(true);
    await expectPageTitle(page, "Dashboard");

    await page.reload();
    await expect(page).toHaveURL(/\/dashboard(?:\?|$)/);
    await expectPageTitle(page, "Dashboard");
    await expect(page.locator("main .animate-pulse")).toHaveCount(0, { timeout: 15_000 });

    const userMenuButton = page
      .locator('header button[aria-haspopup="true"][aria-expanded]', { hasText: "Demo Owner" })
      .last();
    await userMenuButton.click();
    await expect(userMenuButton).toHaveAttribute("aria-expanded", "true");
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Sign out?" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(/\/login(?:\?|$)/, { timeout: 15_000 });

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login(?:\?|$)/);
  });

  test("cashier can log in through the browser flow", async ({ page }) => {
    expect(await loginWithCredentials(page, "cashier@saledock.local", PASSWORD)).toBe(true);
    await expectPageTitle(page, "Dashboard");
  });

  test("wrong credentials show a safe error", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[name="email"]', "owner@saledock.local");
    await page.fill('input[name="password"]', "WrongPassword123!");
    await page.locator('form button[type="submit"]').first().click();

    await expect(page.getByText("Invalid email or password.", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("body")).not.toContainText(/AuthApiError|Supabase|SQLSTATE|invalid login credentials|stack trace/i);
  });
});

test.describe("Local role authorization smoke", () => {
  test.beforeEach(skipUnlessLocal);

  for (const roleCase of ROLE_CASES) {
    test(`${roleCase.role} route access matches the current permission model`, async ({ page }) => {
      test.setTimeout(90_000);
      expect(await loginWithCredentials(page, roleCase.email, PASSWORD)).toBe(true);

      await page.goto("/dashboard");
      await expect(page).toHaveURL(/\/dashboard(?:\?|$)/);
      await expectPageTitle(page, "Dashboard");

      await page.goto("/pos");
      if (roleCase.pos) {
        await expect(page).toHaveURL(/\/pos(?:\?|$)/);
        await expectPageTitle(page, "New sale");
      } else {
        await expect(page).toHaveURL(/\/dashboard(?:\?|$)/);
        await expectPageTitle(page, "Dashboard");
      }

      await page.goto("/products");
      await expect(page).toHaveURL(/\/products(?:\?|$)/);
      await expectPageTitle(page, "Products");
      const addProduct = page.getByRole("button", { name: "Add product", exact: true });
      if (roleCase.catalogWrite) {
        await expect(addProduct).toBeVisible();
      } else {
        await expect(addProduct).toHaveCount(0);
      }

      await page.goto("/users");
      await expect(page).toHaveURL(/\/users(?:\?|$)/);
      await expectPageTitle(page, "Users");
      if (roleCase.manageUsers) {
        await expect(page.getByText("Staff access", { exact: true })).toBeVisible();
        await expect(page.getByRole("heading", { name: "Invite staff" })).toBeVisible();
      } else {
        await expect(page.getByText("Restricted area", { exact: true })).toBeVisible();
        await expect(page.getByRole("heading", { name: "Invite staff" })).toHaveCount(0);
        await expect(page.getByText("owner@saledock.local", { exact: true })).toHaveCount(0);
      }

      await page.goto("/settings");
      await expect(page).toHaveURL(/\/settings(?:\?|$)/);
      await expectPageTitle(page, "Settings");
      const shopName = page.locator('input[name="shopName"]');
      await expect(shopName).toBeVisible();
      if (roleCase.manageSettings) {
        await expect(shopName).toBeEnabled();
      } else {
        await expect(shopName).toBeDisabled();
      }
    });
  }
});
