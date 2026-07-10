import { expect, test, type ConsoleMessage, type Page } from "@playwright/test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  isLocalPlaywrightRun,
  loginLocalOwnerDirectly,
} from "./helpers/local-supabase";

const ROUTE = "/reports?range=this_month";
const ARTIFACT_DIR = "/tmp/saledock-reports-mobile-label-fix";
const REPORT_LABELS = [
  "Gross sales",
  "Net Sales (Revenue)",
  "Gross Profit Margin",
  "Service Revenue / Profit",
  "Total Operating Expenses",
] as const;
const AFFECTED_LABELS = [
  "Net Sales (Revenue)",
  "Gross Profit Margin",
  "Service Revenue / Profit",
] as const;
const FINAL_SECTION = "Supplier Dues & Purchases Snapshot";

type Evidence = {
  pageErrors: number;
  consoleErrors: number;
  requestFailures: string[];
  dialogs: string[];
  writes: string[];
};

type LabelLayout = {
  text: string;
  whiteSpace: string;
  textOverflow: string;
  overflowX: string;
  overflowY: string;
  clientWidth: number;
  scrollWidth: number;
  clientHeight: number;
  scrollHeight: number;
  lineCount: number;
  labelInsideCard: boolean;
  cardInsideViewport: boolean;
  overlapsTooltip: boolean;
  overlapsValue: boolean;
};

function sanitizedPath(value: string): string {
  try {
    return new URL(value).pathname;
  } catch {
    return "invalid-url";
  }
}

function expectedLocalInstrumentation(message: ConsoleMessage): boolean {
  const evidence = `${message.text()} ${message.location().url}`;
  return (
    /\/_vercel\/(?:insights|speed-insights)\/script\.js/i.test(evidence) ||
    /clarity\.ms\/tag\/dummy-clarity/i.test(evidence)
  );
}

function observeBrowser(page: Page): Evidence {
  const evidence: Evidence = {
    pageErrors: 0,
    consoleErrors: 0,
    requestFailures: [],
    dialogs: [],
    writes: [],
  };

  page.on("pageerror", () => {
    evidence.pageErrors += 1;
  });
  page.on("console", (message) => {
    if (message.type() === "error" && !expectedLocalInstrumentation(message)) {
      evidence.consoleErrors += 1;
    }
  });
  page.on("requestfailed", (request) => {
    const pathname = sanitizedPath(request.url());
    const expectedInstrumentation = /^\/_vercel\/(?:insights|speed-insights)\/script\.js$/i.test(
      pathname,
    );
    const expectedPrefetchAbort =
      request.method() === "GET" &&
      request.resourceType() === "fetch" &&
      request.failure()?.errorText === "net::ERR_ABORTED";
    if (!expectedInstrumentation && !expectedPrefetchAbort) {
      evidence.requestFailures.push(`${request.method()} ${pathname}`);
    }
  });
  page.on("dialog", async (dialog) => {
    evidence.dialogs.push(dialog.type());
    await dialog.dismiss();
  });
  return evidence;
}

function guardWrites(page: Page, evidence: Evidence): void {
  page.on("request", (request) => {
    if (["GET", "HEAD", "OPTIONS"].includes(request.method())) return;
    const pathname = sanitizedPath(request.url());
    if (pathname.startsWith("/auth/v1/") || pathname === "/api/csp-report") return;
    evidence.writes.push(`${request.method()} ${pathname}`);
  });
}

async function installRejectedConsent(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem(
      "analytics-consent",
      JSON.stringify({
        value: "rejected",
        version: "reports-mobile-label-qa",
        timestamp: new Date().toISOString(),
      }),
    );
    localStorage.setItem(
      "saledock-sidebar-preferences-v1",
      JSON.stringify({ analyticsConsent: "rejected", marketingConsent: "rejected" }),
    );
  });
  await page.route("**/rest/v1/user_ui_preferences**", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        sidebar_preferences: {
          analyticsConsent: "rejected",
          marketingConsent: "rejected",
        },
      }),
    });
  });
}

async function visibleFrameworkErrors(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const pattern =
      /Unhandled Runtime Error|Runtime Error|Build Error|Hydration failed|Application error|error overlay/i;
    const matches = new Set<string>();
    const collect = (root: Document | ShadowRoot | Element) => {
      root.querySelectorAll("*").forEach((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        if (
          style.display === "none" ||
          style.visibility === "hidden" ||
          Number.parseFloat(style.opacity || "1") === 0 ||
          rect.width === 0 ||
          rect.height === 0
        ) {
          return;
        }
        const match = (element.textContent || "").match(pattern);
        if (match) matches.add(match[0]);
      });
    };
    collect(document);
    document.querySelectorAll("nextjs-portal").forEach((portal) => {
      collect(portal);
      if (portal.shadowRoot) collect(portal.shadowRoot);
    });
    return [...matches];
  });
}

async function openReports(
  page: Page,
  viewport: { width: number; height: number },
): Promise<Evidence> {
  await page.setViewportSize(viewport);
  const evidence = observeBrowser(page);
  await installRejectedConsent(page);
  await loginLocalOwnerDirectly(page);
  guardWrites(page, evidence);
  const response = await page.goto(ROUTE, { waitUntil: "domcontentloaded" });
  expect(response?.status(), "Reports document status").toBeLessThan(400);
  await expect(page).toHaveURL(/\/reports\?range=this_month$/);
  await expect(page.getByRole("heading", { name: "Management Reports" })).toBeVisible();
  return evidence;
}

async function readLabelLayout(page: Page, label: string): Promise<LabelLayout> {
  const locator = page.locator(`[data-stat-card-label="${label}"]`);
  await expect(locator, `${label} is visible`).toBeVisible();
  return locator.evaluate((element, expectedLabel) => {
    const card = element.closest<HTMLElement>("[data-stat-card]");
    const tooltip = card?.querySelector<HTMLElement>("[data-stat-card-tooltip]");
    const value = card?.querySelector<HTMLElement>("[data-stat-card-value]");
    if (!card || !tooltip || !value) throw new Error(`StatCard regions missing for ${expectedLabel}`);
    const style = getComputedStyle(element);
    const labelRect = element.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const valueRect = value.getBoundingClientRect();
    const overlaps = (a: DOMRect, b: DOMRect) =>
      a.left < b.right - 0.5 &&
      a.right > b.left + 0.5 &&
      a.top < b.bottom - 0.5 &&
      a.bottom > b.top + 0.5;
    const lineHeight = Number.parseFloat(style.lineHeight);
    return {
      text: element.textContent?.trim() ?? "",
      whiteSpace: style.whiteSpace,
      textOverflow: style.textOverflow,
      overflowX: style.overflowX,
      overflowY: style.overflowY,
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      lineCount: Number.isFinite(lineHeight) && lineHeight > 0 ? labelRect.height / lineHeight : 0,
      labelInsideCard:
        labelRect.left >= cardRect.left - 1 &&
        labelRect.right <= cardRect.right + 1 &&
        labelRect.top >= cardRect.top - 1 &&
        labelRect.bottom <= cardRect.bottom + 1,
      cardInsideViewport: cardRect.left >= -1 && cardRect.right <= window.innerWidth + 1,
      overlapsTooltip: overlaps(labelRect, tooltipRect),
      overlapsValue: overlaps(labelRect, valueRect),
    };
  }, label);
}

async function assertCompleteCard(page: Page, label: string): Promise<LabelLayout> {
  const layout = await readLabelLayout(page, label);
  expect(layout.text, `${label} text remains exact`).toBe(label);
  expect(layout.whiteSpace, `${label} permits wrapping`).toBe("normal");
  expect(layout.textOverflow, `${label} has no ellipsis`).not.toBe("ellipsis");
  expect([layout.overflowX, layout.overflowY], `${label} is not clipped`).not.toContain(
    "hidden",
  );
  expect(layout.clientWidth, `${label} has positive width`).toBeGreaterThan(0);
  expect(layout.scrollWidth, `${label} has no internal horizontal overflow`).toBeLessThanOrEqual(
    layout.clientWidth + 1,
  );
  expect(layout.scrollHeight, `${label} has no internal vertical clipping`).toBeLessThanOrEqual(
    layout.clientHeight + 1,
  );
  expect(layout.labelInsideCard, `${label} remains inside its card`).toBe(true);
  expect(layout.cardInsideViewport, `${label} card remains inside the viewport`).toBe(true);
  expect(layout.overlapsTooltip, `${label} does not overlap its tooltip`).toBe(false);
  expect(layout.overlapsValue, `${label} does not overlap its value`).toBe(false);

  const card = page
    .locator(`[data-stat-card-label="${label}"]`)
    .locator("xpath=ancestor::*[@data-stat-card][1]");
  await expect(card.locator("[data-stat-card-tooltip]")).toBeVisible();
  await expect(card.locator("[data-stat-card-value]")).toBeVisible();
  await expect(card.locator("[data-stat-card-detail]")).toBeVisible();
  return layout;
}

async function assertPageSafety(page: Page, evidence: Evidence): Promise<void> {
  const width = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(width.document, "Reports has no horizontal page overflow").toBeLessThanOrEqual(
    width.viewport + 1,
  );
  expect(await visibleFrameworkErrors(page)).toEqual([]);
  expect(evidence).toEqual({
    pageErrors: 0,
    consoleErrors: 0,
    requestFailures: [],
    dialogs: [],
    writes: [],
  });
}

test.describe("Reports mobile card label wrapping", () => {
  test.beforeAll(() => {
    rmSync(ARTIFACT_DIR, { recursive: true, force: true });
    mkdirSync(ARTIFACT_DIR, { recursive: true });
  });

  test.beforeEach(() => {
    test.skip(!isLocalPlaywrightRun(), "Reports label QA is localhost-only.");
  });

  for (const viewport of [
    { width: 320, height: 568, screenshot: "reports-labels-320.png" },
    { width: 390, height: 844, screenshot: "reports-labels-390.png" },
    { width: 430, height: 932, screenshot: "reports-labels-430.png" },
  ]) {
    test(`shows complete labels at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      test.setTimeout(120_000);
      const evidence = await openReports(page, viewport);
      const layouts = new Map<string, LabelLayout>();
      for (const label of REPORT_LABELS) {
        layouts.set(label, await assertCompleteCard(page, label));
      }
      if (viewport.width === 390) {
        for (const label of AFFECTED_LABELS) {
          expect(layouts.get(label)?.lineCount, `${label} uses multiple readable lines`).toBeGreaterThan(
            1.25,
          );
        }
      }
      await page.screenshot({
        path: join(ARTIFACT_DIR, viewport.screenshot),
        fullPage: true,
      });
      await assertPageSafety(page, evidence);
    });
  }

  test("retains desktop card and screen scrolling behavior", async ({ page }) => {
    test.setTimeout(120_000);
    const evidence = await openReports(page, { width: 1440, height: 900 });
    for (const label of REPORT_LABELS) {
      await assertCompleteCard(page, label);
    }
    const main = page.locator("[data-app-shell-main]");
    const finalSection = page.getByRole("heading", { name: FINAL_SECTION, exact: true });
    const initialScroll = await main.evaluate((element) => ({
      overflowY: getComputedStyle(element).overflowY,
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    }));
    expect(["auto", "scroll"]).toContain(initialScroll.overflowY);
    expect(initialScroll.scrollHeight).toBeGreaterThan(initialScroll.clientHeight);
    await finalSection.scrollIntoViewIfNeeded();
    await expect(finalSection).toBeVisible();
    expect(await main.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await page.screenshot({
      path: join(ARTIFACT_DIR, "reports-labels-desktop.png"),
      fullPage: true,
    });
    await assertPageSafety(page, evidence);
  });

  test("keeps complete labels and full-document behavior in print media", async ({ page }) => {
    test.setTimeout(120_000);
    const evidence = await openReports(page, { width: 390, height: 844 });
    await page.emulateMedia({ media: "print" });
    for (const label of AFFECTED_LABELS) {
      await assertCompleteCard(page, label);
    }
    await expect(
      page.locator("div.hidden.print\\:block").filter({ hasText: "Report Date Range" }).first(),
    ).toBeVisible();
    await expect(page.locator("nav:visible, header:visible, aside:visible")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Print Report" })).toBeHidden();
    await expect(page.locator('form[action="/reports"]')).toBeHidden();
    await expect(page.getByTestId("cookie-consent-banner")).toBeHidden();
    await expect(page.getByRole("heading", { name: FINAL_SECTION, exact: true })).toBeVisible();
    await page.screenshot({
      path: join(ARTIFACT_DIR, "reports-labels-print-390.png"),
      fullPage: true,
    });
    await assertPageSafety(page, evidence);
  });
});
