import { expect, test, type Page } from "@playwright/test";
import { loginWithCredentials } from "./helpers/auth";
import { isLocalPlaywrightRun } from "./helpers/local-supabase";

const LOCAL_PASSWORD = "Password123!";
const OWNER_EMAIL = "owner@saledock.local";
const CASHIER_EMAIL = "cashier@saledock.local";

const REQUIRED_VIEWPORTS = [
  { name: "mobile-320x568", width: 320, height: 568 },
  { name: "mobile-360x800", width: 360, height: 800 },
  { name: "mobile-375x667", width: 375, height: 667 },
  { name: "mobile-390x844", width: 390, height: 844 },
  { name: "mobile-412x915", width: 412, height: 915 },
  { name: "mobile-430x932", width: 430, height: 932 },
  { name: "tablet-768x1024", width: 768, height: 1024 },
  { name: "tablet-1024x768", width: 1024, height: 768 },
  { name: "tablet-820x1180", width: 820, height: 1180 },
  { name: "desktop-1024x768", width: 1024, height: 768 },
  { name: "desktop-1280x720", width: 1280, height: 720 },
  { name: "desktop-1366x768", width: 1366, height: 768 },
  { name: "desktop-1440x900", width: 1440, height: 900 },
  { name: "desktop-1920x1080", width: 1920, height: 1080 },
] as const;

const PUBLIC_ROUTES = [
  { path: "/", title: "SaleDock" },
  { path: "/login", title: "Sign in" },
  { path: "/auth/invite?error=otp_expired", title: "invite" },
  { path: "/privacy", title: "privacy" },
  { path: "/terms", title: "terms" },
] as const;

const APP_ROUTES = [
  { path: "/dashboard", title: "Dashboard" },
  { path: "/pos", title: "New sale" },
  { path: "/products", title: "Products" },
  { path: "/customers", title: "Customers" },
  { path: "/invoices", title: "Invoices" },
  { path: "/returns", title: "Returns" },
  { path: "/repairs", title: "Repairs" },
  { path: "/expenses", title: "Expenses" },
  { path: "/daily-closing", title: "Cash Drawer" },
  { path: "/reports", title: "Reports" },
  { path: "/users", title: "Users" },
  { path: "/settings", title: "Settings" },
  { path: "/settings/permissions", title: "Staff Permissions" },
  { path: "/purchases/replenishment", title: "Replenishment" },
  { path: "/suppliers/dues", title: "Supplier Dues" },
  { path: "/suppliers/purchases", title: "Purchases" },
] as const;

function skipUnlessLocal(): void {
  test.skip(!isLocalPlaywrightRun(), "Mobile-native audit mutations and role checks are local-only.");
}

async function rejectCookieBanner(page: Page): Promise<void> {
  if (page.url() === "about:blank") {
    await page.goto("/", { waitUntil: "domcontentloaded" });
  }
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
}

async function dismissCookieBannerIfVisible(page: Page): Promise<void> {
  const rejectAll = page.getByRole("button", { name: "Reject all", exact: true });
  if (await rejectAll.isVisible({ timeout: 1_000 }).catch(() => false)) {
    await rejectAll.click();
  }
}

async function expectNoPageLevelHorizontalOverflow(page: Page, label: string): Promise<void> {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;
    const visibleElements = Array.from(document.querySelectorAll<HTMLElement>("body *"))
      .filter((el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.visibility !== "hidden" &&
          style.display !== "none"
        );
      })
      .map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          tag: el.tagName.toLowerCase(),
          id: el.id,
          className: String(el.className || "").slice(0, 160),
          text: (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
        };
      })
      .filter((el) => el.left < -2 || el.right > window.innerWidth + 2)
      .slice(0, 8);

    return {
      viewportWidth: window.innerWidth,
      documentWidth: doc.scrollWidth,
      bodyWidth: body.scrollWidth,
      offenders: visibleElements,
    };
  });

  expect(
    overflow.documentWidth,
    `${label} document width ${overflow.documentWidth} exceeded viewport ${overflow.viewportWidth}. Offenders: ${JSON.stringify(overflow.offenders)}`,
  ).toBeLessThanOrEqual(overflow.viewportWidth + 2);
  expect(
    overflow.bodyWidth,
    `${label} body width ${overflow.bodyWidth} exceeded viewport ${overflow.viewportWidth}. Offenders: ${JSON.stringify(overflow.offenders)}`,
  ).toBeLessThanOrEqual(overflow.viewportWidth + 2);
}

async function expectNoFrameworkOverlay(page: Page): Promise<void> {
  await expect(page.locator("text=/Unhandled Runtime Error|Application error|Build Error/i")).toHaveCount(0);
}

test.describe("Mobile-native audit route smoke", () => {
  test.beforeEach(skipUnlessLocal);

  test("public and auth surfaces fit required viewport matrix", async ({ page }) => {
    test.setTimeout(240_000);
    page.on("dialog", async (dialog) => {
      throw new Error(`Native browser dialog appeared on ${page.url()}: ${dialog.type()}`);
    });

    for (const viewport of REQUIRED_VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      for (const route of PUBLIC_ROUTES) {
        await page.goto(route.path, { waitUntil: "domcontentloaded" });
        await expectNoFrameworkOverlay(page);
        await expectNoPageLevelHorizontalOverflow(page, `${viewport.name} ${route.path}`);
      }
    }
  });

  test("owner app shell modules fit required viewport matrix without global overflow", async ({ page }) => {
    test.setTimeout(420_000);
    page.on("dialog", async (dialog) => {
      throw new Error(`Native browser dialog appeared on ${page.url()}: ${dialog.type()}`);
    });

    await rejectCookieBanner(page);
    if (!(await loginWithCredentials(page, OWNER_EMAIL, LOCAL_PASSWORD))) {
      test.skip(true, "Local owner login was not available for authenticated mobile audit checks.");
    }

    for (const viewport of REQUIRED_VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      for (const route of APP_ROUTES) {
        await page.goto(route.path, { waitUntil: "domcontentloaded" });
        await expect(page).not.toHaveURL(/\/login(?:\?|$)/);
        await expect(page.locator("header h1").first()).toContainText(route.title, { timeout: 15_000 });
        await expectNoFrameworkOverlay(page);
        await expectNoPageLevelHorizontalOverflow(page, `${viewport.name} ${route.path}`);
      }
    }
  });

  test("mobile navigation, dashboard editing, and POS touch surfaces expose reachable controls", async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await rejectCookieBanner(page);
    if (!(await loginWithCredentials(page, OWNER_EMAIL, LOCAL_PASSWORD))) {
      test.skip(true, "Local owner login was not available for authenticated touch-surface checks.");
    }
    await dismissCookieBannerIfVisible(page);

    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await dismissCookieBannerIfVisible(page);
    const openNavigation = page.getByRole("button", { name: "Open navigation menu", exact: true });
    await expect(openNavigation).toBeVisible();
    await page.locator('[role="dialog"][aria-label="Navigation menu"]').first().waitFor({ state: "attached", timeout: 10_000 });
    await openNavigation.click();
    const navigationDrawer = page.getByRole("dialog", { name: "Navigation menu", exact: true });
    await expect(navigationDrawer.first()).toBeVisible();
    expect(await navigationDrawer.count()).toBeGreaterThan(0);
    await page.keyboard.press("Escape");
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });

    await page.getByRole("button", { name: "Edit layout", exact: true }).click();
    await expect(page.getByRole("button", { name: "Add Widget", exact: true })).toBeVisible();
    await expect(page.getByLabel(/Drag .+ widget to reorder/).first()).toBeVisible();
    const widgetSettings = page.getByRole("button", { name: /^Open .+ widget settings$/ }).first();
    await expect(widgetSettings).toBeVisible();
    await widgetSettings.click();
    await expect(page.getByRole("button", { name: /^Move .+ earlier$/ }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /^Move .+ later$/ }).first()).toBeVisible();

    await page.goto("/pos", { waitUntil: "domcontentloaded" });
    await dismissCookieBannerIfVisible(page);
    await expect(page.getByRole("button", { name: "Products", exact: true })).toBeVisible();
    await expect(page.locator('button:has-text("Cart ·")')).toBeVisible();
    await expect(page.getByRole("button", { name: "+ New bill", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /Held(?: bills)?/ })).toBeVisible();
  });

  test("cashier mobile navigation hides owner/admin staff management controls", async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await rejectCookieBanner(page);
    if (!(await loginWithCredentials(page, CASHIER_EMAIL, LOCAL_PASSWORD))) {
      test.skip(true, "Local cashier login was not available for mobile permission checks.");
    }

    await page.goto("/users", { waitUntil: "domcontentloaded" });
    await expect(page.locator("header h1").first()).toHaveText("Users");
    await expect(page.getByText("Restricted area", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Invite staff", exact: true })).toHaveCount(0);
    await expect(page.getByText("owner@saledock.local", { exact: true })).toHaveCount(0);

    await page.locator('[role="dialog"][aria-label="Navigation menu"]').first().waitFor({ state: "attached", timeout: 10_000 });
    await page.getByRole("button", { name: "Open navigation menu", exact: true }).click();
    const drawer = page.getByRole("dialog", { name: "Navigation menu", exact: true }).first();
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole("link", { name: "Users", exact: true })).toHaveCount(0);
  });
});
