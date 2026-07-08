import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  getLocalAdminClient,
  isLocalPlaywrightRun,
  LOCAL_QA_ORG_ID,
  loginLocalOwnerDirectly,
} from "./helpers/local-supabase";

const VIEWPORTS = [
  { name: "mobile-320x568", width: 320, height: 568 },
  { name: "mobile-390x844", width: 390, height: 844 },
  { name: "mobile-430x932", width: 430, height: 932 },
] as const;

const SEEDED_SUPPLIER_ID = "00000000-0000-4000-8000-000000002001";

function skipUnlessLocal(): void {
  test.skip(!isLocalPlaywrightRun(), "Print touch-target QA is restricted to localhost.");
}

async function seedRejectedCookieConsent(page: Page): Promise<void> {
  await page.addInitScript(() => {
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

async function expectNoFrameworkOverlay(page: Page): Promise<void> {
  await expect(page.locator("text=/Unhandled Runtime Error|Application error|Build Error/i")).toHaveCount(0);
}

async function expectNoHorizontalOverflow(page: Page, label: string): Promise<void> {
  const overflow = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
  }));

  expect(
    overflow.documentWidth,
    `${label}: document width ${overflow.documentWidth} exceeded viewport ${overflow.viewportWidth}`,
  ).toBeLessThanOrEqual(overflow.viewportWidth + 2);
  expect(
    overflow.bodyWidth,
    `${label}: body width ${overflow.bodyWidth} exceeded viewport ${overflow.viewportWidth}`,
  ).toBeLessThanOrEqual(overflow.viewportWidth + 2);
}

async function expectTouchTarget(locator: Locator, label: string): Promise<number> {
  await expect(locator, `${label} should be visible`).toBeVisible();
  const box = await locator.boundingBox();
  expect(box, `${label} should have a rendered box`).not.toBeNull();
  expect(box!.height, `${label} should render at least 44px tall`).toBeGreaterThanOrEqual(43.5);

  const clipped = await locator.evaluate((element) => ({
    clientHeight: element.clientHeight,
    clientWidth: element.clientWidth,
    scrollHeight: element.scrollHeight,
    scrollWidth: element.scrollWidth,
  }));
  expect(
    clipped.scrollWidth,
    `${label} text should not be horizontally clipped`,
  ).toBeLessThanOrEqual(clipped.clientWidth + 1);
  expect(
    clipped.scrollHeight,
    `${label} text should not be vertically clipped`,
  ).toBeLessThanOrEqual(clipped.clientHeight + 1);

  return box!.height;
}

async function installPrintStub(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as typeof window & { __printCalls?: Array<string | null> }).__printCalls = [];
    window.print = function () {
      (window as typeof window & { __printCalls: Array<string | null> }).__printCalls.push(
        document.body.dataset.printMode ?? null,
      );
    };
  });
}

async function expectPrintCall(
  page: Page,
  control: Locator,
  expectedMode: string | null,
  label: string,
): Promise<void> {
  await installPrintStub(page);
  await control.click();
  const calls = await page.evaluate(() => (window as typeof window & { __printCalls?: Array<string | null> }).__printCalls ?? []);
  expect(calls, `${label} should invoke window.print exactly once`).toEqual([expectedMode]);
}

async function expectWhatsAppLink(link: Locator, label: string): Promise<void> {
  await expect(link, `${label} should be visible`).toBeVisible();
  const href = await link.getAttribute("href");
  expect(href, `${label} should keep a WhatsApp URL`).toMatch(/^https:\/\/wa\.me\//);
  await expect(link, `${label} target`).toHaveAttribute("target", "_blank");
  await expect(link, `${label} rel`).toHaveAttribute("rel", /noopener/);
  await expect(link, `${label} rel`).toHaveAttribute("rel", /noreferrer/);
}

async function expectHiddenInPrint(page: Page, controls: Locator[], label: string): Promise<void> {
  await page.emulateMedia({ media: "print" });
  for (const control of controls) {
    await expect(control, `${label} should hide print/share controls in print media`).toBeHidden();
  }
  await page.emulateMedia({ media: "screen" });
}

async function findExistingLocalDetail(table: "repairs" | "returns"): Promise<string | null> {
  const { data, error } = await getLocalAdminClient()
    .from(table)
    .select("id")
    .eq("organization_id", LOCAL_QA_ORG_ID)
    .limit(1);

  if (error) return null;
  return data?.[0]?.id ?? null;
}

test.describe("print/share touch targets", () => {
  test.beforeEach(skipUnlessLocal);

  test("deterministic print/share controls meet mobile touch targets", async ({ page }) => {
    test.setTimeout(180_000);
    const nativeDialogs: string[] = [];
    page.on("dialog", async (dialog) => {
      nativeDialogs.push(`${dialog.type()}: ${dialog.message()}`);
      await dialog.dismiss();
    });

    await seedRejectedCookieConsent(page);
    await loginLocalOwnerDirectly(page);

    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });

      await page.goto("/reports", { waitUntil: "domcontentloaded" });
      await expectNoFrameworkOverlay(page);
      const printReport = page.getByRole("button", { name: "Print Report", exact: true });
      await expectTouchTarget(printReport, `${viewport.name} reports Print Report`);
      await expectPrintCall(page, printReport, null, `${viewport.name} reports Print Report`);
      await expectNoHorizontalOverflow(page, `${viewport.name} /reports`);
      await expectHiddenInPrint(page, [printReport], `${viewport.name} /reports`);

      await page.goto("/daily-closing", { waitUntil: "domcontentloaded" });
      await expectNoFrameworkOverlay(page);
      const dailyA4 = page.getByRole("button", { name: "Print A4", exact: true });
      const dailyThermal = page.getByRole("button", { name: "Print 80mm", exact: true });
      await expectTouchTarget(dailyA4, `${viewport.name} daily closing Print A4`);
      await expectTouchTarget(dailyThermal, `${viewport.name} daily closing Print 80mm`);
      await expectPrintCall(page, dailyA4, "a4", `${viewport.name} daily closing Print A4`);
      await expectPrintCall(page, dailyThermal, "thermal", `${viewport.name} daily closing Print 80mm`);
      const shiftReport = page.getByRole("button", { name: "Print shift report", exact: true });
      if (await shiftReport.isVisible().catch(() => false)) {
        await expectTouchTarget(shiftReport, `${viewport.name} daily closing Print shift report`);
        await expectPrintCall(page, shiftReport, "shift-thermal", `${viewport.name} daily closing Print shift report`);
      }
      await expectNoHorizontalOverflow(page, `${viewport.name} /daily-closing`);
      await expectHiddenInPrint(
        page,
        (await shiftReport.count()) > 0 ? [dailyA4, dailyThermal, shiftReport] : [dailyA4, dailyThermal],
        `${viewport.name} /daily-closing`,
      );

      await page.goto(`/suppliers/${SEEDED_SUPPLIER_ID}/statement`, { waitUntil: "domcontentloaded" });
      await expectNoFrameworkOverlay(page);
      const statementA4 = page.getByRole("button", { name: "Print A4 / Save PDF", exact: true });
      const statementThermal = page.getByRole("button", { name: "Print 80mm", exact: true });
      const statementWhatsApp = page.getByRole("link", { name: "Share WhatsApp", exact: true });
      await expectTouchTarget(statementA4, `${viewport.name} supplier statement Print A4 / Save PDF`);
      await expectTouchTarget(statementThermal, `${viewport.name} supplier statement Print 80mm`);
      await expectTouchTarget(statementWhatsApp, `${viewport.name} supplier statement Share WhatsApp`);
      await expectPrintCall(page, statementA4, "a4", `${viewport.name} supplier statement Print A4 / Save PDF`);
      await expectPrintCall(page, statementThermal, "thermal", `${viewport.name} supplier statement Print 80mm`);
      await expectWhatsAppLink(statementWhatsApp, `${viewport.name} supplier statement Share WhatsApp`);
      await expectNoHorizontalOverflow(page, `${viewport.name} supplier statement`);
      await expectHiddenInPrint(
        page,
        [statementA4, statementThermal, statementWhatsApp],
        `${viewport.name} supplier statement`,
      );
    }

    expect(nativeDialogs).toEqual([]);
  });

  test("optional local repair and return detail fixtures keep compliant controls when available", async ({ page }) => {
    test.setTimeout(90_000);
    await seedRejectedCookieConsent(page);
    await loginLocalOwnerDirectly(page);

    const repairId = await findExistingLocalDetail("repairs");
    if (repairId) {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`/repairs/${repairId}`, { waitUntil: "domcontentloaded" });
      await expectNoFrameworkOverlay(page);
      await expectTouchTarget(page.getByRole("button", { name: "Print A4", exact: true }), "repair detail Print A4");
      await expectTouchTarget(page.getByRole("button", { name: "Print 80mm", exact: true }), "repair detail Print 80mm");
      await expectTouchTarget(page.getByRole("link", { name: "Share WhatsApp", exact: true }), "repair detail Share WhatsApp");
      await expectNoHorizontalOverflow(page, "repair detail");
    } else {
      test.info().annotations.push({
        type: "fixture",
        description: "No disposable local repair detail fixture was available; source contract covers repair controls.",
      });
    }

    const returnId = await findExistingLocalDetail("returns");
    if (returnId) {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`/returns/${returnId}`, { waitUntil: "domcontentloaded" });
      await expectNoFrameworkOverlay(page);
      await expectTouchTarget(page.getByRole("button", { name: "Print A4", exact: true }), "return detail Print A4");
      await expectTouchTarget(page.getByRole("button", { name: "Print 80mm", exact: true }), "return detail Print 80mm");
      await expectTouchTarget(page.getByRole("link", { name: "Share WhatsApp", exact: true }), "return detail Share WhatsApp");
      await expectNoHorizontalOverflow(page, "return detail");
    } else {
      test.info().annotations.push({
        type: "fixture",
        description: "No disposable local return detail fixture was available; source contract covers return controls.",
      });
    }
  });
});
