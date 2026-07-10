import { expect, test, type ConsoleMessage, type Page } from "@playwright/test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  isLocalPlaywrightRun,
  loginLocalOwnerDirectly,
} from "./helpers/local-supabase";

const ROUTE = "/reports?range=this_month";
const ARTIFACT_DIR = "/tmp/saledock-reports-pagination-fix";
const PDF_PATH = join(ARTIFACT_DIR, "reports-this-month-a4.pdf");
const LATER_SECTIONS = [
  "Payment Methods Breakdown",
  "Operating Expenses Breakdown",
  "Returns & Refunds Summary",
  "Customer Outstanding Ledger",
] as const;
const DOCUMENT_FINAL_SECTION = "Supplier Dues & Purchases Snapshot";
const VALUE_SIGNATURE_LABELS = [
  "Gross sales",
  "Net Sales (Revenue)",
  "Estimated Net Profit",
] as const;

type Evidence = {
  pageErrors: number;
  consoleErrors: number;
  requestFailures: string[];
  dialogs: string[];
  writes: string[];
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
        version: "reports-pagination-qa",
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

async function cardSignature(page: Page, label: string): Promise<string> {
  const card = page
    .getByText(label, { exact: true })
    .first()
    .locator(
      'xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " shadow-sm ")][1]',
    );
  await expect(card, `card for ${label}`).toBeAttached();
  return (await card.innerText()).replace(/\s+/g, " ").trim();
}

function chromiumPdfPageCount(buffer: Buffer): number {
  const source = buffer.toString("latin1");
  const pageObjects = source.match(/\/Type\s*\/Page\b/g)?.length ?? 0;
  const treeCounts = [...source.matchAll(/\/Type\s*\/Pages\b[\s\S]{0,500}?\/Count\s+(\d+)/g)]
    .map((match) => Number.parseInt(match[1], 10))
    .filter(Number.isFinite);
  const treeCount = treeCounts.length > 0 ? Math.max(...treeCounts) : 0;
  if (pageObjects > 0 && treeCount > 0) {
    expect(pageObjects, "PDF page objects agree with the page tree").toBe(treeCount);
  }
  return treeCount || pageObjects;
}

test.describe("Reports full-document print pagination", () => {
  test.beforeEach(() => {
    test.skip(!isLocalPlaywrightRun(), "Reports pagination QA is localhost-only.");
  });

  test("prints the complete report while retaining screen scrolling", async ({ page }) => {
    test.setTimeout(180_000);
    rmSync(ARTIFACT_DIR, { recursive: true, force: true });
    mkdirSync(ARTIFACT_DIR, { recursive: true });

    await page.setViewportSize({ width: 1440, height: 900 });
    await installRejectedConsent(page);
    const evidence = observeBrowser(page);
    await loginLocalOwnerDirectly(page);
    guardWrites(page, evidence);

    const response = await page.goto(ROUTE, { waitUntil: "domcontentloaded" });
    expect(response?.status(), "Reports document status").toBeLessThan(400);
    await expect(page).toHaveURL(/\/reports\?range=this_month$/);

    const root = page.locator('[data-app-shell-root][data-print-full-document="true"]');
    const main = page.locator("[data-app-shell-main]");
    const finalSection = page.getByRole("heading", {
      name: DOCUMENT_FINAL_SECTION,
      exact: true,
    });
    await expect(root).toBeVisible();
    await expect(main).toBeVisible();
    for (const section of LATER_SECTIONS) {
      await expect(
        page.locator("h3").filter({ hasText: section }).first(),
        `screen section ${section}`,
      ).toBeAttached();
    }
    await expect(finalSection).toBeAttached();

    const screenState = await main.evaluate((element) => ({
      overflowY: getComputedStyle(element).overflowY,
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      scrollTop: element.scrollTop,
    }));
    expect(["auto", "scroll"]).toContain(screenState.overflowY);
    expect(screenState.scrollHeight).toBeGreaterThan(screenState.clientHeight);
    expect(screenState.scrollTop).toBe(0);
    await finalSection.scrollIntoViewIfNeeded();
    await expect(finalSection).toBeVisible();
    expect(await main.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await main.evaluate((element) => element.scrollTo({ top: 0 }));

    const screenWidth = await page.evaluate(() => ({
      client: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
    }));
    expect(screenWidth.document).toBeLessThanOrEqual(screenWidth.client + 2);
    expect(screenWidth.body).toBeLessThanOrEqual(screenWidth.client + 2);

    const signatures = new Map<string, string>();
    for (const label of VALUE_SIGNATURE_LABELS) {
      signatures.set(label, await cardSignature(page, label));
    }

    await page.emulateMedia({ media: "print" });
    const printState = await page.evaluate((finalLabel) => {
      const root = document.querySelector<HTMLElement>("[data-app-shell-root]");
      const column = document.querySelector<HTMLElement>("[data-app-shell-column]");
      const main = document.querySelector<HTMLElement>("[data-app-shell-main]");
      const content = document.querySelector<HTMLElement>("[data-app-shell-content]");
      const finalHeading = [...document.querySelectorAll("h3")].find(
        (heading) => heading.textContent?.trim() === finalLabel,
      );
      if (!root || !column || !main || !content || !finalHeading) return null;
      const metrics = (element: HTMLElement) => ({
        display: getComputedStyle(element).display,
        overflow: getComputedStyle(element).overflow,
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
      });
      return {
        root: metrics(root),
        column: metrics(column),
        main: {
          ...metrics(main),
          overflowY: getComputedStyle(main).overflowY,
          flexGrow: getComputedStyle(main).flexGrow,
        },
        content: metrics(content),
        rootBottom: root.getBoundingClientRect().bottom,
        contentBottom: content.getBoundingClientRect().bottom,
        finalBottom: finalHeading.getBoundingClientRect().bottom,
        documentWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      };
    }, DOCUMENT_FINAL_SECTION);

    expect(printState, "print AppShell hooks resolve").not.toBeNull();
    expect(printState!.root).toMatchObject({ display: "block", overflow: "visible" });
    expect(printState!.column).toMatchObject({ display: "block", overflow: "visible" });
    expect(printState!.main).toMatchObject({
      display: "block",
      overflow: "visible",
      overflowY: "visible",
      flexGrow: "0",
    });
    expect(printState!.content).toMatchObject({ display: "block", overflow: "visible" });
    expect(printState!.main.scrollHeight).toBeLessThanOrEqual(
      printState!.main.clientHeight + 1,
    );
    expect(printState!.root.scrollHeight).toBeLessThanOrEqual(
      printState!.root.clientHeight + 1,
    );
    expect(printState!.finalBottom).toBeLessThanOrEqual(printState!.contentBottom + 1);
    expect(printState!.finalBottom).toBeLessThanOrEqual(printState!.rootBottom + 1);
    expect(printState!.documentWidth).toBeLessThanOrEqual(printState!.clientWidth + 2);

    const letterhead = page
      .locator("div.hidden.print\\:block")
      .filter({ hasText: "Report Date Range" })
      .first();
    await expect(letterhead).toBeVisible();
    await expect(finalSection).toBeVisible();
    await expect(page.locator("nav:visible, header:visible, aside:visible")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Print Report" })).toBeHidden();
    await expect(page.locator('form[action="/reports"]')).toBeHidden();
    await expect(page.getByTestId("cookie-consent-banner")).toBeHidden();
    await expect(
      page.getByText("How do these numbers connect? (Report breakdown guide)", {
        exact: true,
      }),
    ).toBeHidden();
    for (const section of LATER_SECTIONS) {
      await expect(page.locator("h3").filter({ hasText: section }).first()).toBeVisible();
    }
    for (const label of VALUE_SIGNATURE_LABELS) {
      const valuesMatch = (await cardSignature(page, label)) === signatures.get(label);
      expect(valuesMatch, `screen/print value remains equal for ${label}`).toBe(true);
    }

    const pdf = await page.pdf({
      path: PDF_PATH,
      format: "A4",
      printBackground: true,
      margin: { top: "10mm", right: "10mm", bottom: "10mm", left: "10mm" },
    });
    expect(pdf.subarray(0, 4).toString("ascii")).toBe("%PDF");
    expect(pdf.byteLength).toBeGreaterThan(10_000);
    const pageCount = chromiumPdfPageCount(pdf);
    expect(pageCount, "complete report uses multiple A4 pages").toBeGreaterThanOrEqual(2);

    await page.emulateMedia({ media: "screen" });
    const restoredScreenState = await main.evaluate((element) => ({
      overflowY: getComputedStyle(element).overflowY,
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    }));
    expect(["auto", "scroll"]).toContain(restoredScreenState.overflowY);
    expect(restoredScreenState.scrollHeight).toBeGreaterThan(
      restoredScreenState.clientHeight,
    );

    expect(await visibleFrameworkErrors(page)).toEqual([]);
    expect(evidence).toEqual({
      pageErrors: 0,
      consoleErrors: 0,
      requestFailures: [],
      dialogs: [],
      writes: [],
    });
    test.info().annotations.push({ type: "pdf-pages", description: `${pageCount}` });
  });
});
