import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type ConsoleMessage,
  type Locator,
  type Page,
} from "@playwright/test";
import {
  getLocalAdminClient,
  isLocalPlaywrightRun,
  LOCAL_QA_ORG_ID,
  loginLocalOwnerDirectly,
} from "./helpers/local-supabase";

const ARTIFACT_DIR = "/tmp/saledock-expenses-filter-and-summary-labels";
const LOCAL_OWNER_PASSWORD = "Password123!";
const SUMMARY_LABELS = [
  "Today expenses",
  "This month",
  "Top category (month)",
  "Latest expense",
] as const;
const VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 1440, height: 900 },
] as const;
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

type AdminClient = ReturnType<typeof getLocalAdminClient>;
type Signature = { count: number; hash: string };
type SafetySnapshot = Record<string, Signature>;
type BrowserEvidence = {
  pageErrors: number;
  consoleErrors: number;
  frameworkOverlays: number;
  nativeDialogs: number;
  expectedAbortedRequests: number;
  instrumentationWarnings: number;
  requestFailures: string[];
  browserGets: number;
  stateChangingRequests: string[];
};
type Rect = {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
};
type PaymentDiagnostic = {
  trigger: Rect;
  menu: Rect;
  option: Rect;
  viewport: { width: number; height: number };
  optionConnected: boolean;
  optionVisible: boolean;
  intersectionRatio: number;
  centerHitsTarget: boolean;
  bottomNavigationOverlap: boolean;
};
type LabelMetric = {
  label: string;
  whiteSpace: string;
  textOverflow: string;
  overflowX: string;
  clientWidth: number;
  scrollWidth: number;
  labelWithinCard: boolean;
  labelValueOverlap: boolean;
  labelIconOverlap: boolean;
  valueIconOverlap: boolean;
  valueDetailOverlap: boolean;
  cardWithinViewport: boolean;
};

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

function expectedInstrumentation(message: ConsoleMessage): boolean {
  const evidence = `${message.text()} ${message.location().url}`;
  return /\/_vercel\/(?:insights|speed-insights)|clarity\.ms\/tag\/dummy-clarity|net::ERR_ABORTED/i.test(
    evidence,
  );
}

function attachBrowserEvidence(page: Page): BrowserEvidence {
  const evidence: BrowserEvidence = {
    pageErrors: 0,
    consoleErrors: 0,
    frameworkOverlays: 0,
    nativeDialogs: 0,
    expectedAbortedRequests: 0,
    instrumentationWarnings: 0,
    requestFailures: [],
    browserGets: 0,
    stateChangingRequests: [],
  };

  page.on("pageerror", () => {
    evidence.pageErrors += 1;
  });
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    if (expectedInstrumentation(message)) evidence.instrumentationWarnings += 1;
    else evidence.consoleErrors += 1;
  });
  page.on("dialog", async (dialog) => {
    evidence.nativeDialogs += 1;
    await dialog.dismiss();
  });
  page.on("request", (request) => {
    if (request.method() === "GET") evidence.browserGets += 1;
    if (["GET", "HEAD", "OPTIONS"].includes(request.method())) return;
    const pathname = safePath(request.url());
    if (pathname.startsWith("/auth/v1/") || pathname === "/api/csp-report") return;
    evidence.stateChangingRequests.push(`${request.method()} ${pathname}`);
  });
  page.on("requestfailed", (request) => {
    const pathname = safePath(request.url());
    const error = request.failure()?.errorText ?? "unknown";
    if (/^\/_vercel\/(?:insights|speed-insights)\/script\.js$/i.test(pathname)) {
      evidence.instrumentationWarnings += 1;
      return;
    }
    if (
      error === "net::ERR_ABORTED" &&
      request.method() === "GET" &&
      (request.resourceType() === "fetch" || /^\/_next\/static\//.test(pathname) || /^\/saledock-logo-/.test(pathname))
    ) {
      evidence.expectedAbortedRequests += 1;
      return;
    }
    evidence.requestFailures.push(`${request.method()} ${pathname}`);
  });
  return evidence;
}

async function installClientPreferences(page: Page, theme: "light" | "dark"): Promise<void> {
  await page.addInitScript((selectedTheme) => {
    localStorage.setItem("theme", selectedTheme);
    localStorage.setItem(
      "analytics-consent",
      JSON.stringify({
        value: "rejected",
        version: "expenses-filter-label-qa",
        timestamp: new Date().toISOString(),
      }),
    );
    localStorage.setItem(
      "saledock-sidebar-preferences-v1",
      JSON.stringify({ analyticsConsent: "rejected", marketingConsent: "rejected" }),
    );
  }, theme);
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

async function newLocalPage(
  browser: Browser,
  viewport: { width: number; height: number },
  theme: "light" | "dark",
  touch = false,
): Promise<{ context: BrowserContext; page: Page; evidence: BrowserEvidence }> {
  const context = await browser.newContext({
    viewport,
    hasTouch: touch,
    isMobile: touch,
    colorScheme: theme,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  page.setDefaultNavigationTimeout(25_000);
  const evidence = attachBrowserEvidence(page);
  await installClientPreferences(page, theme);
  await loginLocalOwnerDirectly(page, "owner@saledock.local", LOCAL_OWNER_PASSWORD);
  return { context, page, evidence };
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

async function assertCleanBrowserEvidence(
  page: Page,
  evidence: BrowserEvidence,
  label: string,
): Promise<void> {
  const overlays = await visibleFrameworkErrors(page);
  evidence.frameworkOverlays += overlays.length;
  expect(evidence.pageErrors, `${label}: page errors`).toBe(0);
  expect(evidence.consoleErrors, `${label}: console errors`).toBe(0);
  expect(evidence.frameworkOverlays, `${label}: framework overlays`).toBe(0);
  expect(evidence.nativeDialogs, `${label}: native dialogs`).toBe(0);
  expect(evidence.requestFailures, `${label}: request failures`).toEqual([]);
  expect(evidence.stateChangingRequests, `${label}: browser state-changing requests`).toEqual([]);
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

async function ownerFixtureContext(admin: AdminClient): Promise<{ ownerId: string; branchId: string }> {
  const { data: owner, error: ownerError } = await admin
    .from("profiles")
    .select("id, organization_id, branch_id, role")
    .eq("organization_id", LOCAL_QA_ORG_ID)
    .eq("role", "owner")
    .limit(1)
    .single();
  if (ownerError || !owner?.id) throw new Error("Local owner fixture context is unavailable.");
  if (owner.branch_id) return { ownerId: owner.id as string, branchId: owner.branch_id as string };

  const { data: branch, error: branchError } = await admin
    .from("branches")
    .select("id")
    .eq("organization_id", LOCAL_QA_ORG_ID)
    .limit(1)
    .single();
  if (branchError || !branch?.id) throw new Error("Local branch fixture context is unavailable.");
  return { ownerId: owner.id as string, branchId: branch.id as string };
}

async function insertFixtures(
  admin: AdminClient,
  marker: string,
): Promise<{ ids: string[]; cashCategory: string; cardCategory: string }> {
  const { ownerId, branchId } = await ownerFixtureContext(admin);
  const ids = [randomUUID(), randomUUID()];
  const cashCategory = `${marker}-CASH`;
  const cardCategory = `${marker}-CARD`;
  const now = new Date().toISOString();
  const { error } = await admin.from("expenses").insert([
    {
      id: ids[0],
      organization_id: LOCAL_QA_ORG_ID,
      branch_id: branchId,
      category: cashCategory,
      amount: 11.11,
      payment_method: "cash",
      vendor_name: "Synthetic local QA",
      notes: "Disposable filter fixture",
      status: "active",
      spent_at: now,
      created_by: ownerId,
    },
    {
      id: ids[1],
      organization_id: LOCAL_QA_ORG_ID,
      branch_id: branchId,
      category: cardCategory,
      amount: 22.22,
      payment_method: "card",
      vendor_name: "Synthetic local QA",
      notes: "Disposable filter fixture",
      status: "active",
      spent_at: now,
      created_by: ownerId,
    },
  ]);
  if (error) throw new Error(`Local Expenses fixture insert failed: ${error.code}`);
  return { ids, cashCategory, cardCategory };
}

async function matchingFixtureExpenses(admin: AdminClient, ids: string[]) {
  const { data, error } = await admin.from("expenses").select("id").in("id", ids);
  if (error) throw new Error(`Fixture expense lookup failed: ${error.code}`);
  return data ?? [];
}

async function matchingFixtureAudits(admin: AdminClient, ids: string[]) {
  const { data, error } = await admin
    .from("audit_logs")
    .select("id, details, metadata")
    .eq("organization_id", LOCAL_QA_ORG_ID)
    .eq("module", "expenses");
  if (error) throw new Error(`Fixture audit lookup failed: ${error.code}`);
  return (data ?? []).filter((row) => {
    const details = typeof row.details === "string" ? row.details : "";
    const metadata = row.metadata && typeof row.metadata === "object"
      ? row.metadata as Record<string, unknown>
      : {};
    return ids.some((id) => details.includes(id) || metadata.expense_id === id);
  });
}

async function cleanupFixtures(
  admin: AdminClient,
  ids: string[],
): Promise<{ expenseRows: number; auditRows: number }> {
  const auditRows = await matchingFixtureAudits(admin, ids);
  if (auditRows.length > 0) {
    const { error } = await admin.from("audit_logs").delete().in("id", auditRows.map((row) => row.id));
    if (error) throw new Error(`Fixture audit cleanup failed: ${error.code}`);
  }
  const expenseRows = (await matchingFixtureExpenses(admin, ids)).length;
  if (expenseRows > 0) {
    const { error } = await admin.from("expenses").delete().in("id", ids);
    if (error) throw new Error(`Fixture expense cleanup failed: ${error.code}`);
  }
  expect(await matchingFixtureExpenses(admin, ids), "generated expense rows remaining").toHaveLength(0);
  expect(await matchingFixtureAudits(admin, ids), "matching audit rows remaining").toHaveLength(0);
  return { expenseRows, auditRows: auditRows.length };
}

function mobileFilterForm(page: Page): Locator {
  return page
    .locator('form[action="/expenses"]')
    .filter({ has: page.locator('input[placeholder="Search category, vendor, notes"]') })
    .first();
}

async function openMobileFilters(form: Locator): Promise<void> {
  const details = form.locator("details");
  if (!(await details.evaluate((element) => (element as HTMLDetailsElement).open))) {
    await details.locator("summary").tap();
  }
  await expect(details).toHaveJSProperty("open", true);
}

async function selectRenderedOption(
  form: Locator,
  ariaLabel: string,
  optionLabel: string,
  expectedValue: string,
): Promise<void> {
  const name = ariaLabel === "Category" ? "category" : "payment_method";
  const trigger = form.getByRole("button", { name: ariaLabel, exact: true });
  const hiddenInput = form.locator(`input[type="hidden"][name="${name}"]`);
  await trigger.tap();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  const option = form.getByRole("option", { name: optionLabel, exact: true });
  await expect(option).toBeVisible();
  await option.tap();
  await expect(hiddenInput).toHaveValue(expectedValue);
  await expect(trigger).toContainText(optionLabel);
  await expect(form.getByRole("listbox")).toHaveCount(0);
}

async function submitFilters(
  page: Page,
  form: Locator,
  expected: (url: URL) => boolean,
): Promise<void> {
  await Promise.all([
    page.waitForURL(expected),
    form.getByRole("button", { name: "Apply", exact: true }).tap(),
  ]);
  await expect(page.locator("header h1").first()).toHaveText("Expenses");
}

function nonEmptySearchParams(url: string): Array<[string, string]> {
  return [...new URL(url).searchParams.entries()].filter(([, value]) => value !== "");
}

async function resetFilters(page: Page): Promise<void> {
  const reset = page.getByRole("link", { name: "Reset filters", exact: true });
  await expect(reset).toBeVisible();
  await Promise.all([
    page.waitForURL((url) => url.pathname === "/expenses" && url.search === ""),
    reset.tap(),
  ]);
  await expect(page).toHaveURL(/\/expenses$/);
  await expect(page.locator("header h1").first()).toHaveText("Expenses");
  const form = mobileFilterForm(page);
  await expect(form.locator('input[type="hidden"][name="category"]')).toHaveValue("", { timeout: 5_000 });
  await expect(form.locator('input[type="hidden"][name="payment_method"]')).toHaveValue("", { timeout: 5_000 });
  await openMobileFilters(form);
  await expect(form.getByRole("button", { name: "Category", exact: true })).toContainText("All", { timeout: 5_000 });
  await expect(form.getByRole("button", { name: "Payment method", exact: true })).toContainText("All", { timeout: 5_000 });
}

function mobileRepairsFilterForm(page: Page): Locator {
  return page
    .locator('form[action="/repairs"]')
    .filter({ has: page.locator('input[placeholder="Search job no, model, serial..."]') })
    .first();
}

async function assertRepairsResetSynchronization(page: Page): Promise<void> {
  await page.goto("/repairs");
  await expect(page.locator("header h1").first()).toHaveText("Repairs");
  let form = mobileRepairsFilterForm(page);
  await openMobileFilters(form);
  const trigger = form.getByRole("button", { name: "Status", exact: true });
  const hiddenInput = form.locator('input[type="hidden"][name="status"]');
  await trigger.tap();
  await form.getByRole("option", { name: "Received", exact: true }).tap();
  await expect(hiddenInput).toHaveValue("received");
  await Promise.all([
    page.waitForURL((url) => url.pathname === "/repairs" && url.searchParams.get("status") === "received"),
    form.getByRole("button", { name: "Apply", exact: true }).tap(),
  ]);
  const reset = page.getByRole("link", { name: "Reset filters", exact: true });
  await expect(reset).toBeVisible();
  await Promise.all([
    page.waitForURL((url) => url.pathname === "/repairs" && url.search === ""),
    reset.tap(),
  ]);
  form = mobileRepairsFilterForm(page);
  await expect(form.locator('input[type="hidden"][name="status"]')).toHaveValue("", { timeout: 5_000 });
  await openMobileFilters(form);
  await expect(form.getByRole("button", { name: "Status", exact: true })).toContainText("All statuses", {
    timeout: 5_000,
  });
  await Promise.all([
    page.waitForURL((url) => url.pathname === "/repairs" && (url.searchParams.get("status") ?? "") === ""),
    form.getByRole("button", { name: "Apply", exact: true }).tap(),
  ]);
  expect(nonEmptySearchParams(page.url()).some(([name]) => name === "status"), "Repairs stale status query").toBe(false);
}

async function assertControlledProductsFilter(page: Page): Promise<void> {
  await page.goto("/products?tab=products");
  await expect(page.locator("header h1").first()).toHaveText("Products");
  const details = page.locator("details").filter({ has: page.locator("summary", { hasText: "Filters" }) }).first();
  if (!(await details.evaluate((element) => (element as HTMLDetailsElement).open))) {
    await details.locator("summary").tap();
  }
  const trigger = details.getByRole("button", { name: "Category", exact: true });
  await expect(trigger).toContainText("All");
  await trigger.tap();
  const options = page.getByRole("option");
  expect(await options.count(), "Products controlled category options").toBeGreaterThan(1);
  const option = options.filter({ hasNotText: /^All$/ }).first();
  const optionLabel = (await option.innerText()).trim();
  await option.tap();
  await expect(trigger).toContainText(optionLabel);
  const reset = page.getByRole("button", { name: "Reset filters", exact: true });
  await expect(reset).toBeVisible();
  await reset.tap();
  if (!(await details.evaluate((element) => (element as HTMLDetailsElement).open))) {
    await details.locator("summary").tap();
  }
  await expect(details.getByRole("button", { name: "Category", exact: true })).toContainText("All");
}

async function paymentDiagnostic(
  page: Page,
  trigger: Locator,
  menu: Locator,
  option: Locator,
): Promise<PaymentDiagnostic> {
  const [triggerHandle, menuHandle, optionHandle] = await Promise.all([
    trigger.elementHandle(),
    menu.elementHandle(),
    option.elementHandle(),
  ]);
  if (!triggerHandle || !menuHandle || !optionHandle) {
    throw new Error("Payment filter controls must remain attached for geometry checks.");
  }
  return page.evaluate(
    ([triggerElement, menuElement, optionElement]) => {
      const rect = (element: Element): Rect => {
        const value = element.getBoundingClientRect();
        return {
          top: Number(value.top.toFixed(2)),
          right: Number(value.right.toFixed(2)),
          bottom: Number(value.bottom.toFixed(2)),
          left: Number(value.left.toFixed(2)),
          width: Number(value.width.toFixed(2)),
          height: Number(value.height.toFixed(2)),
        };
      };
      const optionRect = optionElement.getBoundingClientRect();
      const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const viewportLeft = window.visualViewport?.offsetLeft ?? 0;
      const viewportTop = window.visualViewport?.offsetTop ?? 0;
      const intersectionWidth = Math.max(
        0,
        Math.min(optionRect.right, viewportLeft + viewportWidth) - Math.max(optionRect.left, viewportLeft),
      );
      const intersectionHeight = Math.max(
        0,
        Math.min(optionRect.bottom, viewportTop + viewportHeight) - Math.max(optionRect.top, viewportTop),
      );
      const centerX = optionRect.left + optionRect.width / 2;
      const centerY = optionRect.top + optionRect.height / 2;
      const centerHit = document.elementFromPoint(centerX, centerY);
      const bottomNavigation = document.querySelector("nav.fixed.bottom-0");
      const bottomRect = bottomNavigation?.getBoundingClientRect() ?? null;
      const optionStyle = getComputedStyle(optionElement);
      return {
        trigger: rect(triggerElement),
        menu: rect(menuElement),
        option: rect(optionElement),
        viewport: { width: window.innerWidth, height: window.innerHeight },
        optionConnected: optionElement.isConnected,
        optionVisible:
          optionStyle.display !== "none" &&
          optionStyle.visibility !== "hidden" &&
          Number.parseFloat(optionStyle.opacity || "1") > 0 &&
          optionRect.width > 0 &&
          optionRect.height > 0,
        intersectionRatio: Number(
          ((intersectionWidth * intersectionHeight) / Math.max(1, optionRect.width * optionRect.height)).toFixed(4),
        ),
        centerHitsTarget: Boolean(
          centerHit && (centerHit === optionElement || optionElement.contains(centerHit)),
        ),
        bottomNavigationOverlap: Boolean(
          bottomRect &&
          optionRect.left < bottomRect.right &&
          optionRect.right > bottomRect.left &&
          optionRect.top < bottomRect.bottom &&
          optionRect.bottom > bottomRect.top,
        ),
      };
    },
    [triggerHandle, menuHandle, optionHandle] as const,
  );
}

function boundingBoxesOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 0.5 &&
    Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 0.5;
}

async function labelMetric(label: Locator): Promise<LabelMetric> {
  return label.evaluate((element) => {
    const card = element.closest("[data-stat-card]");
    const value = card?.querySelector("[data-stat-card-value]");
    const detail = card?.querySelector("[data-stat-card-detail]");
    const icon = card?.firstElementChild?.lastElementChild;
    if (!card || !value || !detail || !icon) throw new Error("StatCard regions are incomplete.");
    const asRect = (target: Element) => target.getBoundingClientRect();
    const intersects = (a: DOMRect, b: DOMRect) =>
      Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5 &&
      Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5;
    const labelRect = asRect(element);
    const cardRect = asRect(card);
    const valueRect = asRect(value);
    const detailRect = asRect(detail);
    const iconRect = asRect(icon);
    const style = getComputedStyle(element);
    return {
      label: element.textContent?.trim() ?? "",
      whiteSpace: style.whiteSpace,
      textOverflow: style.textOverflow,
      overflowX: style.overflowX,
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      labelWithinCard:
        labelRect.left >= cardRect.left - 1 &&
        labelRect.right <= cardRect.right + 1 &&
        labelRect.top >= cardRect.top - 1 &&
        labelRect.bottom <= cardRect.bottom + 1,
      labelValueOverlap: intersects(labelRect, valueRect),
      labelIconOverlap: intersects(labelRect, iconRect),
      valueIconOverlap: intersects(valueRect, iconRect),
      valueDetailOverlap: intersects(valueRect, detailRect),
      cardWithinViewport: cardRect.left >= -1 && cardRect.right <= window.innerWidth + 1,
    };
  });
}

async function assertNoHorizontalOverflow(page: Page, label: string): Promise<void> {
  const widths = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(widths.document, `${label}: document overflow`).toBeLessThanOrEqual(widths.viewport + 1);
  expect(widths.body, `${label}: body overflow`).toBeLessThanOrEqual(widths.viewport + 1);
}

async function assertSummaryLayout(
  page: Page,
  viewport: { width: number; height: number },
  theme: "light" | "dark",
): Promise<LabelMetric[]> {
  await page.goto("/expenses");
  await expect(page.locator("header h1").first()).toHaveText("Expenses");
  await expect(page.locator("html")).toHaveClass(theme === "dark" ? /\bdark\b/ : /^(?!.*\bdark\b)/);
  const cards = page.locator("[data-stat-card]");
  await expect(cards).toHaveCount(4);
  const metrics: LabelMetric[] = [];
  for (const expectedLabel of SUMMARY_LABELS) {
    const label = page.locator(`[data-stat-card-label="${expectedLabel}"]`);
    await expect(label).toHaveCount(1);
    await expect(label).toBeVisible();
    await expect(label).toHaveText(expectedLabel);
    const metric = await labelMetric(label);
    expect(metric.whiteSpace, `${expectedLabel}: white-space`).not.toBe("nowrap");
    expect(metric.textOverflow, `${expectedLabel}: text overflow`).not.toBe("ellipsis");
    expect(metric.overflowX, `${expectedLabel}: overflow`).not.toBe("hidden");
    expect(metric.scrollWidth, `${expectedLabel}: clipped width`).toBeLessThanOrEqual(metric.clientWidth + 1);
    expect(metric.labelWithinCard, `${expectedLabel}: label bounds`).toBe(true);
    expect(metric.labelValueOverlap, `${expectedLabel}: label/value overlap`).toBe(false);
    expect(metric.labelIconOverlap, `${expectedLabel}: label/icon overlap`).toBe(false);
    expect(metric.valueIconOverlap, `${expectedLabel}: value/icon overlap`).toBe(false);
    expect(metric.valueDetailOverlap, `${expectedLabel}: value/detail overlap`).toBe(false);
    expect(metric.cardWithinViewport, `${expectedLabel}: card viewport bounds`).toBe(true);
    metrics.push(metric);
  }

  const cardRects = await cards.evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
    }),
  );
  if (viewport.width < 768) {
    expect(Math.abs(cardRects[0]!.top - cardRects[1]!.top), "mobile first card row").toBeLessThanOrEqual(1);
    expect(Math.abs(cardRects[2]!.top - cardRects[3]!.top), "mobile second card row").toBeLessThanOrEqual(1);
    expect(cardRects[1]!.left).toBeGreaterThan(cardRects[0]!.left);
    expect(cardRects[3]!.left).toBeGreaterThan(cardRects[2]!.left);
    expect(Math.abs(cardRects[0]!.width - cardRects[1]!.width), "mobile first row widths").toBeLessThanOrEqual(1);
    expect(Math.abs(cardRects[2]!.width - cardRects[3]!.width), "mobile second row widths").toBeLessThanOrEqual(1);

    const finalCard = cards.nth(3);
    await finalCard.scrollIntoViewIfNeeded();
    const nav = page.locator("nav.fixed.bottom-0");
    const navBox = await nav.boundingBox();
    let finalBox = await finalCard.boundingBox();
    if (navBox && finalBox && boundingBoxesOverlap(finalBox, navBox)) {
      await page.locator("[data-app-shell-main]").evaluate((element, delta) => {
        element.scrollTop += delta;
      }, finalBox.y + finalBox.height - navBox.y + 8);
      finalBox = await finalCard.boundingBox();
    }
    expect(Boolean(navBox && finalBox && boundingBoxesOverlap(finalBox, navBox)), "bottom navigation obstruction").toBe(false);
  } else {
    const heights = cardRects.map((rect) => rect.height);
    expect(Math.max(...heights) - Math.min(...heights), "desktop balanced card heights").toBeLessThanOrEqual(1);
  }

  await assertNoHorizontalOverflow(page, `${viewport.width}x${viewport.height} ${theme}`);
  return metrics;
}

test.describe("EXP-MOBILE-003 payment regression and summary-label readability", () => {
  test.beforeEach(() => {
    test.skip(!isLocalPlaywrightRun(), "Expenses filter and label QA is local-only.");
  });

  test("synchronized filters and responsive labels remain complete", async ({ browser }) => {
    test.setTimeout(360_000);
    rmSync(ARTIFACT_DIR, { recursive: true, force: true });
    mkdirSync(ARTIFACT_DIR, { recursive: true });

    const admin = getLocalAdminClient();
    const before = await captureSafetySnapshot(admin);
    const marker = `QA-EXP-FILTER-${randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`;
    let fixtureIds: string[] = [];
    let cleanup = { expenseRows: 0, auditRows: 0 };
    const allEvidence: BrowserEvidence[] = [];
    const geometry: Record<string, LabelMetric[]> = {};
    let payment: PaymentDiagnostic | null = null;

    try {
      const fixture = await insertFixtures(admin, marker);
      fixtureIds = fixture.ids;
      expect(await matchingFixtureExpenses(admin, fixtureIds), "inserted filter fixtures").toHaveLength(2);
      expect(await matchingFixtureAudits(admin, fixtureIds), "fixture setup audit writes").toHaveLength(0);

      const filterPage = await newLocalPage(browser, { width: 390, height: 844 }, "light", true);
      allEvidence.push(filterPage.evidence);
      try {
        const { page, evidence } = filterPage;
        await page.goto("/expenses");
        await expect(page.locator("header h1").first()).toHaveText("Expenses");

        let form = mobileFilterForm(page);
        await openMobileFilters(form);
        await selectRenderedOption(form, "Category", fixture.cashCategory, fixture.cashCategory);
        await submitFilters(page, form, (url) => url.searchParams.get("category") === fixture.cashCategory);
        await expect(page.locator("ul li").filter({ hasText: fixture.cashCategory })).toHaveCount(1);
        await expect(page.locator("ul li").filter({ hasText: fixture.cardCategory })).toHaveCount(0);
        await resetFilters(page);

        form = mobileFilterForm(page);
        await openMobileFilters(form);
        await selectRenderedOption(form, "Payment method", "Card", "card");
        await submitFilters(
          page,
          form,
          (url) => url.searchParams.get("payment_method") === "card" && (url.searchParams.get("category") ?? "") === "",
        );
        expect(nonEmptySearchParams(page.url()), "Card query non-empty filters").toEqual([
          ["payment_method", "card"],
        ]);
        await expect(mobileFilterForm(page).locator('input[type="hidden"][name="category"]')).toHaveValue("");
        await expect(page.locator("ul li").filter({ hasText: fixture.cashCategory })).toHaveCount(0);
        await expect(page.locator("ul li").filter({ hasText: fixture.cardCategory })).toHaveCount(1);
        await resetFilters(page);

        form = mobileFilterForm(page);
        await openMobileFilters(form);
        await selectRenderedOption(form, "Category", fixture.cardCategory, fixture.cardCategory);
        await submitFilters(page, form, (url) => url.searchParams.get("category") === fixture.cardCategory);
        await resetFilters(page);

        form = mobileFilterForm(page);
        await openMobileFilters(form);
        const paymentTrigger = form.getByRole("button", { name: "Payment method", exact: true });
        const paymentInput = form.locator('input[type="hidden"][name="payment_method"]');
        await paymentTrigger.tap();
        const paymentMenu = form.getByRole("listbox");
        const cashOption = form.getByRole("option", { name: "Cash", exact: true });
        await expect(paymentMenu).toBeVisible();
        await expect(cashOption).toBeVisible();
        payment = await paymentDiagnostic(page, paymentTrigger, paymentMenu, cashOption);
        expect(payment.optionConnected, "Cash option connected").toBe(true);
        expect(payment.optionVisible, "Cash option visible").toBe(true);
        expect(payment.intersectionRatio, "Cash option viewport intersection").toBeGreaterThanOrEqual(0.99);
        expect(payment.centerHitsTarget, "Cash option center hit").toBe(true);
        expect(payment.bottomNavigationOverlap, "Cash option bottom-nav overlap").toBe(false);
        await cashOption.tap();
        await expect(paymentInput).toHaveValue("cash");
        await expect(paymentTrigger).toContainText("Cash");
        await expect(paymentMenu).toHaveCount(0);
        await submitFilters(
          page,
          form,
          (url) => url.searchParams.get("payment_method") === "cash" && (url.searchParams.get("category") ?? "") === "",
        );
        expect(nonEmptySearchParams(page.url()), "Cash query non-empty filters").toEqual([
          ["payment_method", "cash"],
        ]);
        await expect(page.locator("ul li").filter({ hasText: fixture.cashCategory })).toHaveCount(1);
        await expect(page.locator("ul li").filter({ hasText: fixture.cardCategory })).toHaveCount(0);
        await assertNoHorizontalOverflow(page, "payment filter 390x844");

        await assertRepairsResetSynchronization(page);
        await assertNoHorizontalOverflow(page, "Repairs reset 390x844");
        await assertCleanBrowserEvidence(page, evidence, "payment filter");
      } finally {
        await filterPage.context.close();
      }

      const controlledPage = await newLocalPage(browser, { width: 390, height: 844 }, "light", true);
      allEvidence.push(controlledPage.evidence);
      try {
        await assertControlledProductsFilter(controlledPage.page);
        await assertNoHorizontalOverflow(controlledPage.page, "Products controlled filter 390x844");
        await assertCleanBrowserEvidence(controlledPage.page, controlledPage.evidence, "Products controlled filter");
      } finally {
        await controlledPage.context.close();
      }

      for (const theme of ["light", "dark"] as const) {
        for (const viewport of VIEWPORTS) {
          const responsive = await newLocalPage(browser, viewport, theme, viewport.width < 768);
          allEvidence.push(responsive.evidence);
          try {
            geometry[`${viewport.width}x${viewport.height}-${theme}`] = await assertSummaryLayout(
              responsive.page,
              viewport,
              theme,
            );
            await responsive.page.screenshot({
              path: join(ARTIFACT_DIR, `expenses-${viewport.width}x${viewport.height}-${theme}.png`),
              fullPage: true,
            });
            await assertCleanBrowserEvidence(
              responsive.page,
              responsive.evidence,
              `${viewport.width}x${viewport.height} ${theme}`,
            );
          } finally {
            await responsive.context.close();
          }
        }
      }
    } finally {
      if (fixtureIds.length > 0) cleanup = await cleanupFixtures(admin, fixtureIds);
    }

    const after = await captureSafetySnapshot(admin);
    expect(after, "unrelated safety signatures after cleanup").toEqual(before);
    expect(cleanup.expenseRows, "fixture expense cleanup rows").toBe(2);
    expect(cleanup.auditRows, "fixture audit cleanup rows").toBe(0);

    const totals = allEvidence.reduce(
      (result, evidence) => ({
        pageErrors: result.pageErrors + evidence.pageErrors,
        consoleErrors: result.consoleErrors + evidence.consoleErrors,
        frameworkOverlays: result.frameworkOverlays + evidence.frameworkOverlays,
        nativeDialogs: result.nativeDialogs + evidence.nativeDialogs,
        expectedAbortedRequests: result.expectedAbortedRequests + evidence.expectedAbortedRequests,
        instrumentationWarnings: result.instrumentationWarnings + evidence.instrumentationWarnings,
        requestFailures: result.requestFailures + evidence.requestFailures.length,
        browserGets: result.browserGets + evidence.browserGets,
        stateChangingRequests: result.stateChangingRequests + evidence.stateChangingRequests.length,
      }),
      {
        pageErrors: 0,
        consoleErrors: 0,
        frameworkOverlays: 0,
        nativeDialogs: 0,
        expectedAbortedRequests: 0,
        instrumentationWarnings: 0,
        requestFailures: 0,
        browserGets: 0,
        stateChangingRequests: 0,
      },
    );
    expect(totals.pageErrors).toBe(0);
    expect(totals.consoleErrors).toBe(0);
    expect(totals.frameworkOverlays).toBe(0);
    expect(totals.nativeDialogs).toBe(0);
    expect(totals.requestFailures).toBe(0);
    expect(totals.stateChangingRequests).toBe(0);

    writeFileSync(
      join(ARTIFACT_DIR, "evidence.json"),
      JSON.stringify(
        {
          payment,
          geometry,
          browser: totals,
          directFixtureRowsInserted: 2,
          cleanupExpenseRows: cleanup.expenseRows,
          cleanupAuditRows: cleanup.auditRows,
          cleanupRetries: 0,
          cleanupFailures: 0,
          generatedExpenseRowsRemaining: 0,
          matchingAuditRowsRemaining: 0,
          safetySignaturesEqual: true,
        },
        null,
        2,
      ),
    );
  });
});
