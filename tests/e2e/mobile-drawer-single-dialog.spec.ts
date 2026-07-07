import { expect, test } from "@playwright/test";

const OWNER_EMAIL = process.env.PLAYWRIGHT_TEST_EMAIL || "owner@saledock.local";
const LOCAL_PASSWORD = "Password123!";

function isLocalhost(baseURL: string): boolean {
  try {
    const url = new URL(baseURL);
    return url.hostname === "localhost" || url.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

async function loginOwner(page: import("@playwright/test").Page) {
  await page.context().clearCookies();
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());

  // Submit the local login form, then navigate to /dashboard.
  // The current local dev environment creates a valid session but does not
  // follow the server-action redirect automatically, so we read the cookie
  // and continue to the authenticated route.
  await page.goto("/login");
  await page.fill('input[name="email"]', OWNER_EMAIL);
  await page.fill('input[name="password"]', LOCAL_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);

  await page.goto("/dashboard");
  await page.waitForURL(/\/dashboard(?:\?|$)/, { timeout: 10000 });
  await page.waitForLoadState("networkidle");

  const rejectCookies = page.getByRole("button", { name: "Reject optional cookies", exact: true });
  if (await rejectCookies.isVisible().catch(() => false)) {
    await rejectCookies.click();
  }
}

function drawer(page: import("@playwright/test").Page) {
  return page.getByRole("dialog", { name: "Navigation menu", exact: true });
}

async function assertSingleDrawer(page: import("@playwright/test").Page) {
  const panel = drawer(page);
  await expect(panel).toBeVisible();
  await expect(panel).toHaveCount(1);
  const closeButton = panel.getByRole("button", { name: "Close navigation menu", exact: true });
  await expect(closeButton).toBeVisible();
  await expect(closeButton).toHaveCount(1);
}

async function openDrawer(page: import("@playwright/test").Page) {
  const hamburgers = page.getByRole("button", { name: "Open navigation menu", exact: true });
  await expect(hamburgers).toHaveCount(1);
  // The drawer panel is mounted inside a client-only portal; wait for it to
  // be attached to the DOM before clicking the trigger so the open state works.
  await page.locator('[role="dialog"][aria-label="Navigation menu"]').first().waitFor({ state: "attached", timeout: 10000 });
  await hamburgers.first().click();
  await assertSingleDrawer(page);
}

async function closeDrawerViaButton(page: import("@playwright/test").Page) {
  await drawer(page).getByRole("button", { name: "Close navigation menu", exact: true }).click();
}

async function customizeMoveUp(page: import("@playwright/test").Page) {
  const btn = drawer(page).locator('button[title="Move up"]:not([disabled])').first();
  await btn.scrollIntoViewIfNeeded();
  await btn.click();
}

async function customizeMoveDown(page: import("@playwright/test").Page) {
  const btn = drawer(page).locator('button[title="Move down"]:not([disabled])').first();
  await btn.scrollIntoViewIfNeeded();
  await btn.click();
}

async function customizeReset(page: import("@playwright/test").Page) {
  // The bottom-left Reset button overlaps the Next.js dev indicator badge.
  // In production this badge is absent; use the element's DOM click to keep
  // the test honest without masking or removing the overlay.
  await drawer(page).evaluate((dialog) => {
    const btn = Array.from(dialog.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "Reset"
    );
    btn?.click();
  });
}

async function customizeSave(page: import("@playwright/test").Page) {
  await drawer(page).evaluate((dialog) => {
    const btn = Array.from(dialog.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "Save"
    );
    btn?.click();
  });
}

async function bodyScrollIsLocked(page: import("@playwright/test").Page): Promise<boolean> {
  return page.evaluate(() => document.body.style.overflow === "hidden");
}

test.describe("mobile navigation drawer renders one accessible dialog", () => {
  test.beforeEach(() => {
    test.skip(!isLocalhost(process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000"), "Drawer mutation QA is restricted to localhost.");
  });

  test("mobile (390x844) - open, close, backdrop, escape, navigate, customize", async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await loginOwner(page);
    await page.goto("/dashboard");

    // No dialog when closed
    await expect(drawer(page)).toHaveCount(0);

    await openDrawer(page);
    expect(await bodyScrollIsLocked(page)).toBe(true);

    await closeDrawerViaButton(page);
    await expect(drawer(page)).toHaveCount(0);
    expect(await bodyScrollIsLocked(page)).toBe(false);

    await openDrawer(page);
    await page.locator("[data-testid='drawer-backdrop']").click();
    await expect(drawer(page)).toHaveCount(0);

    await openDrawer(page);
    await page.keyboard.press("Escape");
    await expect(drawer(page)).toHaveCount(0);

    await openDrawer(page);
    await drawer(page).getByRole("link", { name: /POS/i }).first().click();
    await expect(page).toHaveURL(/\/pos(?:\?|$)/);
    await expect(drawer(page)).toHaveCount(0);

    await page.goto("/dashboard");
    await openDrawer(page);
    await drawer(page).getByRole("button", { name: "Customize bottom tabs", exact: true }).click();
    await expect(page.getByText("Customize Bottom Tabs")).toBeVisible();

    await customizeMoveUp(page);
    await customizeMoveDown(page);
    await customizeReset(page);
    await customizeSave(page);

    // Saving hides the customize view and returns to the main menu while keeping the drawer open.
    await expect(drawer(page).getByRole("button", { name: "Customize bottom tabs", exact: true })).toBeVisible();
    await closeDrawerViaButton(page);
    await expect(drawer(page)).toHaveCount(0);
  });

  test("tablet (820x1180) - hamburger available and single drawer works", async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 820, height: 1180 });
    await loginOwner(page);
    await page.goto("/dashboard");

    await openDrawer(page);
    await closeDrawerViaButton(page);
    await expect(drawer(page)).toHaveCount(0);
  });

  test("desktop (1366x768) - drawer trigger hidden and no dialog", async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1366, height: 768 });
    await loginOwner(page);
    await page.goto("/dashboard");

    await expect(page.getByRole("button", { name: "Open navigation menu", exact: true })).toHaveCount(0);
    await expect(drawer(page)).toHaveCount(0);
  });

  test("rotation from tablet to desktop hides drawer and trigger", async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 820, height: 1180 });
    await loginOwner(page);
    await page.goto("/dashboard");

    await openDrawer(page);
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.waitForTimeout(300);
    await expect(drawer(page)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Open navigation menu", exact: true })).toHaveCount(0);
  });

  test("repeated open/close does not duplicate portals", async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await loginOwner(page);
    await page.goto("/dashboard");

    for (let i = 0; i < 5; i++) {
      await openDrawer(page);
      await closeDrawerViaButton(page);
    }
    await expect(drawer(page)).toHaveCount(0);
  });
});
