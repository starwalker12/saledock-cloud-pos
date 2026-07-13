import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
  type Request,
  type Route,
} from "@playwright/test";
import {
  getLocalAdminClient,
  isLocalPlaywrightRun,
  LOCAL_QA_ORG_ID,
  loginLocalOwnerDirectly,
} from "./helpers/local-supabase";

const ARTIFACT_DIR = "/tmp/saledock-expenses-mobile-touch-and-void-copy";
const SYNTHETIC_AMOUNT = "137.41";
const MIN_TOUCH_HEIGHT = 43.5;

type AdminClient = ReturnType<typeof getLocalAdminClient>;
type Signature = { count: number; hash: string };
type SafetySnapshot = Record<string, Signature>;
type Measurement = { width: number; height: number; centerHit: boolean; unclipped: boolean };
type MeasurementMatrix = Record<string, Record<string, Measurement>>;
type BrowserEvidence = {
  pageErrors: number;
  consoleErrors: number;
  frameworkOverlays: number;
  nativeDialogs: number;
  expectedInstrumentationFailures: number;
  expectedNavigationCancellations: number;
  requestFailures: string[];
  stateChanges: Array<{ sequence: number; route: string; success: boolean | null }>;
  unexpectedWrites: string[];
};

const SAFETY_TABLES = [
  "expenses",
  "audit_logs",
  "products",
  "product_stock_lots",
  "stock_movements",
  "invoice_item_stock_allocations",
  "invoices",
  "invoice_items",
  "returns",
  "return_items",
  "return_stock_allocations",
  "repairs",
  "payments",
  "customers",
  "customer_ledger_entries",
  "suppliers",
  "supplier_purchases",
  "supplier_purchase_items",
  "supplier_payments",
  "supplier_ledger_entries",
  "daily_closings",
  "cash_shifts",
  "branches",
  "profiles",
  "organizations",
] as const;

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function safePath(value: string): string {
  try {
    return new URL(value).pathname.replace(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,
      ":id",
    );
  } catch {
    return "invalid-url";
  }
}

function attachEvidence(page: Page): BrowserEvidence {
  const evidence: BrowserEvidence = {
    pageErrors: 0,
    consoleErrors: 0,
    frameworkOverlays: 0,
    nativeDialogs: 0,
    expectedInstrumentationFailures: 0,
    expectedNavigationCancellations: 0,
    requestFailures: [],
    stateChanges: [],
    unexpectedWrites: [],
  };

  page.on("pageerror", () => {
    evidence.pageErrors += 1;
  });
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = `${message.text()} ${message.location().url}`;
    if (/\/_vercel\/(?:insights|speed-insights)|clarity\.ms\/tag\/dummy-clarity|net::ERR_ABORTED/i.test(text)) {
      evidence.expectedInstrumentationFailures += 1;
    } else {
      evidence.consoleErrors += 1;
    }
  });
  page.on("dialog", async (dialog) => {
    evidence.nativeDialogs += 1;
    await dialog.dismiss();
  });
  page.on("requestfailed", (request) => {
    const pathname = safePath(request.url());
    const error = request.failure()?.errorText;
    if (/^\/_vercel\/(?:insights|speed-insights)\/script\.js$/i.test(pathname)) {
      evidence.expectedInstrumentationFailures += 1;
      return;
    }
    if (
      error === "net::ERR_ABORTED" &&
      ((request.method() === "POST" && pathname === "/expenses") ||
        (request.method() === "GET" && /^\/saledock-logo-(?:full|mark)\.png$/.test(pathname)) ||
        (request.method() === "GET" && /^\/_next\/static\//.test(pathname)) ||
        (request.method() === "GET" && request.resourceType() === "fetch"))
    ) {
      evidence.expectedNavigationCancellations += 1;
      return;
    }
    evidence.requestFailures.push(`${request.method()} ${pathname}`);
  });

  return evidence;
}

function beginWriteTracking(page: Page, evidence: BrowserEvidence): void {
  const tracked = new Map<Request, number>();
  page.on("request", (request) => {
    if (["GET", "HEAD", "OPTIONS"].includes(request.method())) return;
    const pathname = safePath(request.url());
    if (pathname.startsWith("/auth/v1/") || pathname === "/api/csp-report") return;
    if (request.method() === "POST" && pathname === "/expenses") {
      evidence.stateChanges.push({
        sequence: evidence.stateChanges.length + 1,
        route: "expenses-server-action",
        success: null,
      });
      tracked.set(request, evidence.stateChanges.length - 1);
      return;
    }
    evidence.unexpectedWrites.push(`${request.method()} ${pathname}`);
  });
  page.on("response", (response) => {
    const index = tracked.get(response.request());
    if (index === undefined) return;
    evidence.stateChanges[index]!.success = response.ok();
  });
}

async function installRejectedConsent(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem(
      "analytics-consent",
      JSON.stringify({ value: "rejected", version: "expenses-touch-qa", timestamp: new Date().toISOString() }),
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
        sidebar_preferences: { analyticsConsent: "rejected", marketingConsent: "rejected" },
      }),
    });
  });
}

async function visibleFrameworkErrors(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const pattern = /Unhandled Runtime Error|Runtime Error|Build Error|Hydration failed|Application error|error overlay/i;
    const matches = new Set<string>();
    const collect = (root: Document | ShadowRoot | Element) => {
      root.querySelectorAll("*").forEach((element) => {
        const style = getComputedStyle(element);
        const box = element.getBoundingClientRect();
        if (style.display === "none" || style.visibility === "hidden" || box.width === 0 || box.height === 0) return;
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

async function expectNoHorizontalOverflow(page: Page, label: string): Promise<void> {
  const widths = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(widths.document, `${label}: document overflow`).toBeLessThanOrEqual(widths.viewport + 1);
  expect(widths.body, `${label}: body overflow`).toBeLessThanOrEqual(widths.viewport + 1);
}

async function measureControl(locator: Locator, label: string): Promise<Measurement> {
  await locator.evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest" }));
  await expect(locator, `${label}: visible`).toBeVisible();
  const page = locator.page();
  const initialBox = await locator.boundingBox();
  if (!initialBox) throw new Error(`Unable to measure ${label}.`);
  const [headerBox, navBox] = await Promise.all([
    page.locator("header").first().boundingBox(),
    page.locator("nav.fixed.bottom-0").boundingBox().catch(() => null),
  ]);
  const safeTop = headerBox ? headerBox.y + headerBox.height : 0;
  const safeBottom = navBox ? navBox.y : page.viewportSize()?.height ?? initialBox.y + initialBox.height;
  const desiredCenter = safeTop + (safeBottom - safeTop) / 2;
  const currentCenter = initialBox.y + initialBox.height / 2;
  const delta = currentCenter - desiredCenter;
  if (Math.abs(delta) > 1) {
    await page.locator("[data-app-shell-main]").evaluate((element, scrollDelta) => {
      element.scrollTop += scrollDelta;
    }, delta);
  }
  const box = await locator.boundingBox();
  if (!box) throw new Error(`Unable to measure ${label}.`);
  const result = await locator.evaluate((element, center) => {
    const hit = document.elementFromPoint(center.x, center.y);
    return {
      centerHit: Boolean(hit && (hit === element || element.contains(hit))),
      hitTarget: hit
        ? `${hit.tagName.toLowerCase()}[role=${hit.getAttribute("role") ?? "none"}][aria=${hit.getAttribute("aria-label") ?? "none"}][href=${hit.getAttribute("href") ?? "none"}]`
        : "none",
      unclipped:
        element.scrollWidth <= element.clientWidth + 1 &&
        element.scrollHeight <= element.clientHeight + 1,
    };
  }, { x: box.x + box.width / 2, y: box.y + box.height / 2 });

  expect(box.height, `${label}: touch height`).toBeGreaterThanOrEqual(MIN_TOUCH_HEIGHT);
  expect(result.centerHit, `${label}: center-point hit; received ${result.hitTarget}`).toBe(true);
  expect(result.unclipped, `${label}: label clipping`).toBe(true);
  return {
    width: Number(box.width.toFixed(2)),
    height: Number(box.height.toFixed(2)),
    centerHit: result.centerHit,
    unclipped: result.unclipped,
  };
}

async function tableSignature(admin: AdminClient, table: string): Promise<Signature> {
  const { data, error } = await admin.from(table).select("*").order("id", { ascending: true });
  if (error) throw new Error(`Safety signature failed for ${table}: ${error.code}`);
  return { count: data?.length ?? 0, hash: digest(data ?? []) };
}

async function captureSafetySnapshot(admin: AdminClient): Promise<SafetySnapshot> {
  return Object.fromEntries(
    await Promise.all(SAFETY_TABLES.map(async (table) => [table, await tableSignature(admin, table)] as const)),
  );
}

async function matchingExpenses(admin: AdminClient, marker: string) {
  const { data, error } = await admin
    .from("expenses")
    .select("id, organization_id, branch_id, category, status, created_by, archived_at, archived_by")
    .eq("organization_id", LOCAL_QA_ORG_ID)
    .ilike("category", `${marker}%`);
  if (error) throw new Error(`Expense lookup failed: ${error.code}`);
  return data ?? [];
}

async function matchingAuditRows(admin: AdminClient, marker: string, expenseId: string | null) {
  const { data, error } = await admin
    .from("audit_logs")
    .select("id, details, metadata")
    .eq("organization_id", LOCAL_QA_ORG_ID)
    .eq("module", "expenses");
  if (error) throw new Error(`Audit lookup failed: ${error.code}`);
  return (data ?? []).filter((row) => {
    const details = typeof row.details === "string" ? row.details : "";
    const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata as Record<string, unknown> : {};
    return details.includes(marker) || Boolean(expenseId && details.includes(expenseId)) || metadata.expense_id === expenseId;
  });
}

async function cleanupGeneratedRows(admin: AdminClient, marker: string, expenseId: string | null): Promise<void> {
  async function cleanupPass() {
    const auditRows = await matchingAuditRows(admin, marker, expenseId);
    if (auditRows.length > 0) {
      const { error } = await admin.from("audit_logs").delete().in("id", auditRows.map((row) => row.id));
      if (error) throw new Error(`Audit cleanup failed: ${error.code}`);
    }
    const { error } = await admin
      .from("expenses")
      .delete()
      .eq("organization_id", LOCAL_QA_ORG_ID)
      .ilike("category", `${marker}%`);
    if (error) throw new Error(`Expense cleanup failed: ${error.code}`);
  }

  await cleanupPass();
  await new Promise((resolve) => setTimeout(resolve, 800));
  await cleanupPass();
  expect(await matchingExpenses(admin, marker), "generated expense rows remaining").toHaveLength(0);
  expect(await matchingAuditRows(admin, marker, expenseId), "generated audit rows remaining").toHaveLength(0);
}

async function newLocalPage(
  browser: Browser,
  viewport: { width: number; height: number },
  email = "owner@saledock.local",
): Promise<{ context: BrowserContext; page: Page; evidence: BrowserEvidence }> {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  page.setDefaultNavigationTimeout(25_000);
  const evidence = attachEvidence(page);
  await installRejectedConsent(page);
  await loginLocalOwnerDirectly(page, email);
  beginWriteTracking(page, evidence);
  return { context, page, evidence };
}

function assertCleanBrowserEvidence(evidence: BrowserEvidence, label: string): void {
  expect(evidence.pageErrors, `${label}: page errors`).toBe(0);
  expect(evidence.consoleErrors, `${label}: console errors`).toBe(0);
  expect(evidence.nativeDialogs, `${label}: native dialogs`).toBe(0);
  expect(evidence.requestFailures, `${label}: request failures`).toEqual([]);
  expect(evidence.unexpectedWrites, `${label}: unexpected writes`).toEqual([]);
}

async function recordActiveControls(
  browser: Browser,
  expenseId: string,
  marker: string,
  viewport: { width: number; height: number },
  measurements: MeasurementMatrix,
  darkDialog: boolean,
): Promise<void> {
  const key = `${viewport.width}x${viewport.height}`;
  measurements[key] ??= {};
  const { context, page, evidence } = await newLocalPage(browser, viewport);
  try {
    await page.goto("/expenses");
    await expect(page.locator("header h1").first()).toHaveText("Expenses");
    const addDetails = page.locator("details").filter({ hasText: "Add a new expense" }).first();
    measurements[key]!["Add a new expense disclosure"] = await measureControl(addDetails.locator("summary"), `${key} disclosure`);
    await addDetails.locator("summary").click();
    const createForm = addDetails.locator("form");
    measurements[key]!["Add expense"] = await measureControl(
      createForm.getByRole("button", { name: "Add expense", exact: true }),
      `${key} Add expense`,
    );
    const filterForm = page.locator('form[action="/expenses"]').filter({
      has: page.locator('input[placeholder="Search category, vendor, notes"]'),
    }).first();
    measurements[key]!["Apply"] = await measureControl(
      filterForm.getByRole("button", { name: "Apply", exact: true }),
      `${key} Apply`,
    );

    await page.goto(`/expenses?edit=${expenseId}`);
    const editForm = page.locator("details[open]").filter({ hasText: "Edit expense" }).first().locator("form");
    measurements[key]!["Update expense"] = await measureControl(
      editForm.getByRole("button", { name: "Update expense", exact: true }),
      `${key} Update expense`,
    );

    await page.goto("/expenses");
    const row = page.locator("ul li").filter({ hasText: marker }).first();
    const edit = row.getByRole("link", { name: "Edit", exact: true });
    const voidButton = row.getByRole("button", { name: "Void", exact: true });
    measurements[key]!.Edit = await measureControl(edit, `${key} Edit`);
    measurements[key]!.Void = await measureControl(voidButton, `${key} Void`);

    if (darkDialog) {
      await page.evaluate(() => document.documentElement.classList.add("dark"));
    }
    await voidButton.click();
    const dialog = page.getByRole("dialog", { name: "Void this expense?" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("marked as void");
    await expect(dialog).toContainText("hidden from normal expense lists and reports");
    await expect(dialog).toContainText("restore it later");
    await expect(dialog).toContainText("Show voided");
    await expect(dialog).not.toContainText(/cannot be undone|permanently deleted/i);
    await expect.poll(async () => dialog.evaluate((element) =>
      element.getAnimations({ subtree: true }).every((animation) => animation.playState === "finished"),
    )).toBe(true);
    const cancel = dialog.getByRole("button", { name: "Cancel", exact: true });
    const confirm = dialog.getByRole("button", { name: "Void expense", exact: true });
    measurements[key]!["Confirmation Cancel"] = await measureControl(cancel, `${key} confirmation Cancel`);
    measurements[key]!["Confirmation Void expense"] = await measureControl(confirm, `${key} confirmation Void expense`);
    if (darkDialog) {
      await page.screenshot({ path: join(ARTIFACT_DIR, `dialog-${key}-dark.png`), fullPage: true });
    }
    await expect(confirm).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(cancel).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(confirm).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(voidButton).toBeFocused();

    await expectNoHorizontalOverflow(page, key);
    expect(await visibleFrameworkErrors(page), `${key}: framework overlays`).toEqual([]);
    expect(evidence.stateChanges, `${key}: read-only action submissions`).toEqual([]);
    assertCleanBrowserEvidence(evidence, key);
    await page.screenshot({ path: join(ARTIFACT_DIR, `active-${key}${darkDialog ? "-dark" : ""}.png`), fullPage: true });
  } finally {
    await context.close();
  }
}

async function recordRestoreControl(
  browser: Browser,
  marker: string,
  viewport: { width: number; height: number },
  measurements: MeasurementMatrix,
): Promise<void> {
  const key = `${viewport.width}x${viewport.height}`;
  const { context, page, evidence } = await newLocalPage(browser, viewport);
  try {
    await page.goto("/expenses?archived=1");
    const row = page.locator("ul li").filter({ hasText: marker }).first();
    measurements[key]!.Restore = await measureControl(
      row.getByRole("button", { name: "Restore", exact: true }),
      `${key} Restore`,
    );
    await expectNoHorizontalOverflow(page, `${key} archived`);
    expect(await visibleFrameworkErrors(page), `${key} archived framework overlays`).toEqual([]);
    expect(evidence.stateChanges, `${key} archived read-only actions`).toEqual([]);
    assertCleanBrowserEvidence(evidence, `${key} archived`);
  } finally {
    await context.close();
  }
}

async function submitWithPendingState(page: Page, button: Locator): Promise<void> {
  const expensesRoute = /\/expenses(?:\?.*)?$/;
  let startedResolve!: () => void;
  let releaseResolve!: () => void;
  const started = new Promise<void>((resolve) => { startedResolve = resolve; });
  const release = new Promise<void>((resolve) => { releaseResolve = resolve; });
  const handler = async (route: Route) => {
    startedResolve();
    await release;
    await route.continue();
  };
  await page.route(expensesRoute, handler, { times: 1 });

  const click = button.click();
  await started;
  let pendingError: unknown = null;
  try {
    const pendingButton = page.getByRole("button", { name: /Saving/ }).first();
    await expect(pendingButton).toBeVisible();
    await expect(pendingButton).toBeDisabled();
  } catch (error) {
    pendingError = error;
  } finally {
    releaseResolve();
  }
  await click;
  await page.unroute(expensesRoute, handler);
  if (pendingError) throw pendingError;
}

test.describe("Expenses mobile touch targets and Void guidance", () => {
  test.beforeEach(() => {
    test.skip(!isLocalPlaywrightRun(), "Expenses mutation QA is local-only.");
  });

  test("owner lifecycle, responsive controls, shared dialog keyboard, and cashier permissions", async ({ browser }) => {
    test.setTimeout(360_000);
    rmSync(ARTIFACT_DIR, { recursive: true, force: true });
    mkdirSync(ARTIFACT_DIR, { recursive: true });

    const admin = getLocalAdminClient();
    const marker = `QA-EXP-TOUCH-${randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`;
    const updatedMarker = `${marker}-EDIT`;
    const before = await captureSafetySnapshot(admin);
    const measurements: MeasurementMatrix = {};
    let expenseId: string | null = null;
    let observedAuditRows = 0;

    const { context, page, evidence } = await newLocalPage(browser, { width: 390, height: 844 });

    try {
      await page.goto("/expenses");
      const addDetails = page.locator("details").filter({ hasText: "Add a new expense" }).first();
      await addDetails.locator("summary").click();
      const createForm = addDetails.locator("form");
      await createForm.locator('input[name="category"]').fill(marker);
      await createForm.getByRole("spinbutton", { name: /Amount/ }).fill(SYNTHETIC_AMOUNT);
      await createForm.getByRole("textbox", { name: /Vendor \/ paid to/ }).fill("Synthetic local QA vendor");
      await createForm.getByRole("textbox", { name: /Notes/ }).fill("Synthetic local-only Expenses touch verification.");
      const payment = createForm.getByRole("button", { name: "Payment method", exact: true });
      await payment.click();
      await createForm.getByRole("option", { name: "Bank transfer", exact: true }).click();

      const addButton = createForm.getByRole("button", { name: "Add expense", exact: true });
      await submitWithPendingState(page, addButton);
      await expect.poll(() => evidence.stateChanges[0]?.success).toBe(true);
      await expect.poll(async () => (await matchingExpenses(admin, marker)).length).toBe(1);
      console.log("[expenses-touch-qa] create complete");
      const created = (await matchingExpenses(admin, marker))[0];
      expenseId = created?.id ?? null;
      if (!expenseId) throw new Error("Disposable expense was not located safely.");
      expect(created.organization_id).toBe(LOCAL_QA_ORG_ID);
      expect(created.branch_id).toBeTruthy();
      expect(created.created_by).toBeTruthy();

      await page.goto(`/expenses?edit=${expenseId}`);
      const editDetails = page.locator("details[open]").filter({ hasText: "Edit expense" }).first();
      const editForm = editDetails.locator("form");
      await editForm.locator('input[name="category"]').fill(updatedMarker);
      await editForm.getByRole("textbox", { name: /Vendor \/ paid to/ }).fill("Updated synthetic local QA vendor");
      await editForm.getByRole("textbox", { name: /Notes/ }).fill("Updated synthetic local-only note.");
      const updateButton = editForm.getByRole("button", { name: "Update expense", exact: true });
      await submitWithPendingState(page, updateButton);
      await expect.poll(() => evidence.stateChanges[1]?.success).toBe(true);
      await expect.poll(async () => (await matchingExpenses(admin, marker))[0]?.category).toBe(updatedMarker);
      expect(await matchingExpenses(admin, marker), "single disposable expense after update").toHaveLength(1);
      console.log("[expenses-touch-qa] update complete");

      await recordActiveControls(browser, expenseId, updatedMarker, { width: 320, height: 568 }, measurements, false);
      console.log("[expenses-touch-qa] active controls 320 complete");
      await recordActiveControls(browser, expenseId, updatedMarker, { width: 390, height: 844 }, measurements, false);
      console.log("[expenses-touch-qa] active controls 390 complete");
      await recordActiveControls(browser, expenseId, updatedMarker, { width: 430, height: 932 }, measurements, true);
      console.log("[expenses-touch-qa] active controls 430 dark-dialog complete");

      await page.goto("/expenses");
      let row = page.locator("ul li").filter({ hasText: updatedMarker }).first();
      let voidButton = row.getByRole("button", { name: "Void", exact: true });
      const writesBeforeCancel = evidence.stateChanges.length;
      await voidButton.click();
      let dialog = page.getByRole("dialog", { name: "Void this expense?" });
      await expect(dialog).toBeVisible();
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(dialog).toHaveCount(0);
      expect(evidence.stateChanges.length, "Cancel must not submit").toBe(writesBeforeCancel);
      expect((await matchingExpenses(admin, marker))[0]?.status).toBe("active");

      voidButton = row.getByRole("button", { name: "Void", exact: true });
      await voidButton.click();
      dialog = page.getByRole("dialog", { name: "Void this expense?" });
      await expect(dialog.getByRole("button", { name: "Void expense", exact: true })).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(dialog).toHaveCount(0);
      await expect.poll(() => evidence.stateChanges[2]?.success).toBe(true);
      await expect.poll(async () => (await matchingExpenses(admin, marker))[0]?.status).toBe("archived");
      await expect(page.locator("ul li").filter({ hasText: updatedMarker })).toHaveCount(0);
      console.log("[expenses-touch-qa] void complete");

      await recordRestoreControl(browser, updatedMarker, { width: 320, height: 568 }, measurements);
      await recordRestoreControl(browser, updatedMarker, { width: 390, height: 844 }, measurements);
      await recordRestoreControl(browser, updatedMarker, { width: 430, height: 932 }, measurements);
      console.log("[expenses-touch-qa] restore controls complete");

      await page.goto("/expenses?archived=1");
      row = page.locator("ul li").filter({ hasText: updatedMarker }).first();
      await expect(row.getByText("Voided", { exact: true })).toBeVisible();
      await row.getByRole("button", { name: "Restore", exact: true }).click();
      await expect.poll(() => evidence.stateChanges[3]?.success).toBe(true);
      await expect.poll(async () => (await matchingExpenses(admin, marker))[0]?.status).toBe("active");
      const restored = (await matchingExpenses(admin, marker))[0];
      expect(restored.archived_at).toBeNull();
      expect(restored.archived_by).toBeNull();
      expect(await matchingExpenses(admin, marker), "single expense after restore").toHaveLength(1);
      console.log("[expenses-touch-qa] restore complete");

      const deadline = Date.now() + 6_000;
      while (Date.now() < deadline) {
        observedAuditRows = (await matchingAuditRows(admin, marker, expenseId)).length;
        if (observedAuditRows >= 3) break;
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      expect(observedAuditRows, "create/update/void audit rows").toBe(3);

      const cashier = await newLocalPage(browser, { width: 390, height: 844 }, "cashier@saledock.local");
      try {
        await cashier.page.goto("/expenses");
        await expect(cashier.page.getByText(/Your role \(cashier\) cannot create or edit expenses\./)).toBeVisible();
        await expect(cashier.page.locator("summary").filter({ hasText: "Add a new expense" })).toHaveCount(0);
        const cashierRow = cashier.page.locator("ul li").filter({ hasText: updatedMarker }).first();
        await expect(cashierRow).toBeVisible();
        await expect(cashierRow.getByRole("link", { name: "Edit", exact: true })).toHaveCount(0);
        await expect(cashierRow.getByRole("button", { name: /Void|Restore/ })).toHaveCount(0);
        expect(cashier.evidence.stateChanges, "cashier actions").toEqual([]);
        assertCleanBrowserEvidence(cashier.evidence, "cashier");
      } finally {
        await cashier.context.close();
      }
      console.log("[expenses-touch-qa] cashier complete");

      const desktop = await newLocalPage(browser, { width: 1440, height: 900 });
      try {
        await desktop.page.goto(`/expenses?q=${encodeURIComponent(updatedMarker)}`);
        const table = desktop.page.locator("table").filter({ hasText: updatedMarker }).first();
        await expect(table).toBeVisible();
        await expect(table.locator("tbody tr").filter({ hasText: updatedMarker })).toHaveCount(1);
        await expect(table.getByRole("link", { name: "Edit", exact: true })).toBeVisible();
        await expect(table.getByRole("button", { name: "Void", exact: true })).toBeVisible();
        await expect(desktop.page.locator("ul.grid").filter({ hasText: updatedMarker })).toBeHidden();
        await expectNoHorizontalOverflow(desktop.page, "desktop");
        expect(desktop.evidence.stateChanges, "desktop actions").toEqual([]);
        assertCleanBrowserEvidence(desktop.evidence, "desktop");
        await desktop.page.screenshot({ path: join(ARTIFACT_DIR, "desktop.png"), fullPage: true });
      } finally {
        await desktop.context.close();
      }
      console.log("[expenses-touch-qa] desktop complete");

      expect(evidence.stateChanges, "exact four owner submissions").toHaveLength(4);
      expect(evidence.stateChanges.map((change) => change.sequence)).toEqual([1, 2, 3, 4]);
      expect(evidence.stateChanges.every((change) => change.success === true)).toBe(true);
      assertCleanBrowserEvidence(evidence, "owner");
      expect(await visibleFrameworkErrors(page), "owner framework overlays").toEqual([]);
    } finally {
      await context.close();
      await cleanupGeneratedRows(admin, marker, expenseId);
    }

    const after = await captureSafetySnapshot(admin);
    expect(after, "unrelated safety signatures").toEqual(before);
    expect(await matchingExpenses(admin, marker), "final expense cleanup").toHaveLength(0);
    expect(await matchingAuditRows(admin, marker, expenseId), "final audit cleanup").toHaveLength(0);

    writeFileSync(
      join(ARTIFACT_DIR, "evidence.json"),
      JSON.stringify({
        measurements,
        expectedSubmissions: 4,
        observedSubmissions: evidence.stateChanges.length,
        successfulSubmissions: evidence.stateChanges.filter((change) => change.success).length,
        observedAuditRows,
        unexpectedWrites: evidence.unexpectedWrites.length,
        pageErrors: evidence.pageErrors,
        consoleErrors: evidence.consoleErrors,
        requestFailures: evidence.requestFailures.length,
        nativeDialogs: evidence.nativeDialogs,
        expectedInstrumentationFailures: evidence.expectedInstrumentationFailures,
        expectedNavigationCancellations: evidence.expectedNavigationCancellations,
        cleanupExpenseRows: 0,
        cleanupAuditRows: 0,
        safetySignaturesEqual: true,
      }, null, 2),
    );
  });
});
