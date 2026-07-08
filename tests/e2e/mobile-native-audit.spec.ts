import { expect, test, type Page } from "@playwright/test";
import { loginWithCredentials } from "./helpers/auth";
import { isLocalPlaywrightRun, loginLocalOwnerDirectly } from "./helpers/local-supabase";

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

type RequiredViewport = (typeof REQUIRED_VIEWPORTS)[number];
type AppRoute = (typeof APP_ROUTES)[number];

function pickViewports(names: readonly RequiredViewport["name"][]): RequiredViewport[] {
  const byName = new Map(REQUIRED_VIEWPORTS.map((viewport) => [viewport.name, viewport]));
  return names.map((name) => {
    const viewport = byName.get(name);
    if (!viewport) throw new Error(`Unknown required viewport in matrix partition: ${name}`);
    return viewport;
  });
}

function pickRoutes(paths: readonly AppRoute["path"][]): AppRoute[] {
  const byPath = new Map(APP_ROUTES.map((route) => [route.path, route]));
  return paths.map((path) => {
    const route = byPath.get(path);
    if (!route) throw new Error(`Unknown authenticated route in matrix partition: ${path}`);
    return route;
  });
}

const VIEWPORT_FAMILIES = [
  {
    name: "mobile",
    viewports: pickViewports([
      "mobile-320x568",
      "mobile-360x800",
      "mobile-375x667",
      "mobile-390x844",
      "mobile-412x915",
      "mobile-430x932",
    ]),
  },
  {
    name: "tablet",
    viewports: pickViewports(["tablet-768x1024", "tablet-1024x768", "tablet-820x1180"]),
  },
  {
    name: "desktop",
    viewports: pickViewports([
      "desktop-1024x768",
      "desktop-1280x720",
      "desktop-1366x768",
      "desktop-1440x900",
      "desktop-1920x1080",
    ]),
  },
] as const;

const ROUTE_GROUPS = [
  {
    name: "core sales",
    routes: pickRoutes(["/dashboard", "/pos", "/products", "/customers", "/invoices"]),
  },
  {
    name: "operations",
    routes: pickRoutes(["/returns", "/repairs", "/expenses", "/daily-closing"]),
  },
  {
    name: "reports and administration",
    routes: pickRoutes(["/reports", "/users", "/settings", "/settings/permissions"]),
  },
  {
    name: "supply",
    routes: pickRoutes(["/purchases/replenishment", "/suppliers/dues", "/suppliers/purchases"]),
  },
] as const;

function skipUnlessLocal(): void {
  test.skip(!isLocalPlaywrightRun(), "Mobile-native audit mutations and role checks are local-only.");
}

async function rejectCookieBanner(page: Page): Promise<void> {
  const consent = {
    value: "rejected",
    version: "2026-06-analytics-v1",
    timestamp: new Date().toISOString(),
  };
  await page.addInitScript((storedConsent) => {
    window.localStorage.setItem("analytics-consent", JSON.stringify(storedConsent));
  }, consent);
  if (page.url() !== "about:blank") {
    await page.evaluate((storedConsent) => {
      window.localStorage.setItem("analytics-consent", JSON.stringify(storedConsent));
    }, consent);
  }
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

function findDuplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort();
}

async function expectOwnerRouteFitsViewport(
  page: Page,
  route: AppRoute,
  viewport: RequiredViewport,
  context: { routeGroup: string; viewportFamily: string },
): Promise<void> {
  const label = `${context.viewportFamily} ${viewport.name} / ${context.routeGroup} ${route.path}`;
  await test.step(`owner matrix ${label}`, async () => {
    await page.goto(route.path, { waitUntil: "domcontentloaded" });
    await expect(page, `${label} redirected to login`).not.toHaveURL(/\/login(?:\?|$)/);
    await expect(
      page.locator("header h1").first(),
      `${label} did not render the expected page heading`,
    ).toContainText(route.title, { timeout: 15_000 });
    await expectNoFrameworkOverlay(page);
    await expectNoPageLevelHorizontalOverflow(page, label);
  });
}

test.describe("Mobile-native audit route smoke", () => {
  test.beforeEach(skipUnlessLocal);

  test("matrix partition preserves all required owner route coverage", async () => {
    const requiredViewportNames = REQUIRED_VIEWPORTS.map((viewport) => viewport.name);
    const partitionedViewportNames = VIEWPORT_FAMILIES.flatMap((family) =>
      family.viewports.map((viewport) => viewport.name),
    );
    const requiredRoutePaths = APP_ROUTES.map((route) => route.path);
    const partitionedRoutePaths = ROUTE_GROUPS.flatMap((group) =>
      group.routes.map((route) => route.path),
    );

    expect(VIEWPORT_FAMILIES, "owner matrix viewport families").toHaveLength(3);
    expect(ROUTE_GROUPS, "owner matrix route groups").toHaveLength(4);
    expect(REQUIRED_VIEWPORTS, "required viewport count").toHaveLength(14);
    expect(APP_ROUTES, "authenticated route count").toHaveLength(16);
    expect(findDuplicates(requiredViewportNames), "duplicate required viewport names").toEqual([]);
    expect(findDuplicates(partitionedViewportNames), "duplicate partitioned viewport names").toEqual([]);
    expect(findDuplicates(requiredRoutePaths), "duplicate authenticated route paths").toEqual([]);
    expect(findDuplicates(partitionedRoutePaths), "duplicate partitioned route paths").toEqual([]);
    expect(partitionedViewportNames.sort(), "viewport partition must exactly match REQUIRED_VIEWPORTS").toEqual(
      requiredViewportNames.sort(),
    );
    expect(partitionedRoutePaths.sort(), "route partition must exactly match APP_ROUTES").toEqual(
      requiredRoutePaths.sort(),
    );
    expect(partitionedViewportNames.length * partitionedRoutePaths.length, "owner route/viewport combinations").toBe(
      224,
    );
  });

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

  for (const viewportFamily of VIEWPORT_FAMILIES) {
    for (const routeGroup of ROUTE_GROUPS) {
      test(`owner matrix: ${viewportFamily.name} viewports / ${routeGroup.name} routes`, async ({ page }) => {
        test.setTimeout(180_000);
        page.on("dialog", async (dialog) => {
          throw new Error(
            `Native browser dialog appeared during owner matrix ${viewportFamily.name} / ${routeGroup.name} at ${page.url()}: ${dialog.type()}`,
          );
        });

        await rejectCookieBanner(page);
        await loginLocalOwnerDirectly(page);

        for (const viewport of viewportFamily.viewports) {
          await page.setViewportSize({ width: viewport.width, height: viewport.height });
          for (const route of routeGroup.routes) {
            await expectOwnerRouteFitsViewport(page, route, viewport, {
              routeGroup: routeGroup.name,
              viewportFamily: viewportFamily.name,
            });
          }
        }
      });
    }
  }

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
