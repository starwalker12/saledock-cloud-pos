import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type ConsoleMessage, type Locator, type Page } from "@playwright/test";
import {
  getLocalAdminClient,
  getLocalAuthConfig,
  isLocalPlaywrightRun,
  LOCAL_QA_ORG_ID,
  loginLocalOwnerDirectly,
} from "./helpers/local-supabase";

const LOCAL_QA_BRANCH_ID = "00000000-0000-4000-8000-000000000101";
const ARTIFACT_DIR = "/tmp/saledock-returns-thermal-production-fix";
const LONG_RECEIPT = process.env.RETURNS_THERMAL_LONG_RECEIPT === "1";
const RECEIPT_VARIANT = LONG_RECEIPT ? "long" : "standard";
const MOBILE_SCREENSHOT = join(ARTIFACT_DIR, "fixed-screen-mobile.png");
const DESKTOP_SCREENSHOT = join(ARTIFACT_DIR, "fixed-screen-desktop.png");
const A4_SCREENSHOT = join(ARTIFACT_DIR, "fixed-a4-print-dom.png");
const A4_PDF = join(ARTIFACT_DIR, "fixed-a4.pdf");
const A4_RENDER = join(ARTIFACT_DIR, "fixed-a4-render.png");
const THERMAL_SCREENSHOT = join(
  ARTIFACT_DIR,
  `fixed-thermal-${RECEIPT_VARIANT}-print-dom.png`,
);
const THERMAL_CSS_PAGE_PDF = join(
  ARTIFACT_DIR,
  `fixed-thermal-${RECEIPT_VARIANT}.pdf`,
);
const THERMAL_CSS_PAGE_RENDER = join(
  ARTIFACT_DIR,
  `fixed-thermal-${RECEIPT_VARIANT}-render.png`,
);
const THERMAL_CONTRACT = join(
  ARTIFACT_DIR,
  `fixed-thermal-${RECEIPT_VARIANT}-contract.json`,
);

const SHORT_ITEM_NAME = "QA Print Synthetic Service Inspection";
const LONG_ITEM_NAME =
  "QA Print Extended Synthetic Device Diagnostics Configuration and Verification Service";
const STANDARD_RETURN_NOTES = "Synthetic local print verification reason with safe wrapping text.";
const RETURN_NOTES = LONG_RECEIPT
  ? Array.from({ length: 10 }, () => STANDARD_RETURN_NOTES).join(" ")
  : STANDARD_RETURN_NOTES;

type AdminClient = ReturnType<typeof getLocalAdminClient>;

type Fixture = {
  invoiceId: string;
  invoiceItemIds: [string, string];
  returnId: string;
  returnItemIds: [string, string];
  invoiceNo: string;
  returnNo: string;
};

type SafetySnapshot = {
  productQuantities: string;
  lotQuantities: string;
  stockMovementCount: string;
  stockAllocationCount: string;
  returnAllocationCount: string;
  paymentCount: string;
  customerBalances: string;
  customerLedgerCount: string;
  dailyClosingCount: string;
  auditLogCount: string;
};

type BrowserEvidence = {
  pageErrors: number;
  consoleErrors: number;
  requestFailures: string[];
  dialogs: string[];
  writes: string[];
};

type PdfWidthMeasurement = {
  pageCount: number;
  pageWidth: number;
  pageHeight: number;
  overallLeft: number;
  overallRight: number;
  overallSpanPercent: number;
  rows: Record<string, { left: number; right: number; spanPercent: number }>;
};

type PrintElementContract = {
  display: string;
  width: string;
  maxWidth: string;
  minWidth: string;
  marginLeft: string;
  marginRight: string;
  paddingLeft: string;
  paddingRight: string;
  overflow: string;
  flex: string;
  leftPx: number;
  rightPx: number;
  transform: string;
  zoom: string;
  page: string;
  boundingWidthPx: number;
  boundingWidthMm: number;
};

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function makeFixture(): Fixture {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
  return {
    invoiceId: randomUUID(),
    invoiceItemIds: [randomUUID(), randomUUID()],
    returnId: randomUUID(),
    returnItemIds: [randomUUID(), randomUUID()],
    invoiceNo: `QA-PRINT-INV-${suffix}`,
    returnNo: `QA-PRINT-RET-${suffix}`,
  };
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

function expectNoQueryError(error: { message: string } | null, label: string): void {
  if (error) throw new Error(`${label} failed: ${error.message}`);
}

async function captureSafetySnapshot(admin: AdminClient): Promise<SafetySnapshot> {
  const [
    products,
    lots,
    stockMovements,
    stockAllocations,
    returnAllocations,
    payments,
    customers,
    customerLedger,
    dailyClosings,
    auditLogs,
  ] = await Promise.all([
    admin
      .from("products")
      .select("id, stock_quantity")
      .eq("organization_id", LOCAL_QA_ORG_ID)
      .order("id"),
    admin
      .from("product_stock_lots")
      .select("id, quantity_remaining")
      .eq("organization_id", LOCAL_QA_ORG_ID)
      .order("id"),
    admin
      .from("stock_movements")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", LOCAL_QA_ORG_ID),
    admin
      .from("invoice_item_stock_allocations")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", LOCAL_QA_ORG_ID),
    admin
      .from("return_stock_allocations")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", LOCAL_QA_ORG_ID),
    admin
      .from("payments")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", LOCAL_QA_ORG_ID),
    admin
      .from("customers")
      .select("id, outstanding_balance")
      .eq("organization_id", LOCAL_QA_ORG_ID)
      .order("id"),
    admin
      .from("customer_ledger_entries")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", LOCAL_QA_ORG_ID),
    admin
      .from("daily_closings")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", LOCAL_QA_ORG_ID),
    admin
      .from("audit_logs")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", LOCAL_QA_ORG_ID),
  ]);

  for (const [label, result] of [
    ["product quantity snapshot", products],
    ["stock lot snapshot", lots],
    ["stock movement snapshot", stockMovements],
    ["stock allocation snapshot", stockAllocations],
    ["return allocation snapshot", returnAllocations],
    ["payment snapshot", payments],
    ["customer balance snapshot", customers],
    ["customer ledger snapshot", customerLedger],
    ["daily closing snapshot", dailyClosings],
    ["audit log snapshot", auditLogs],
  ] as const) {
    expectNoQueryError(result.error, label);
  }

  return {
    productQuantities: digest(products.data ?? []),
    lotQuantities: digest(lots.data ?? []),
    stockMovementCount: digest(stockMovements.count ?? 0),
    stockAllocationCount: digest(stockAllocations.count ?? 0),
    returnAllocationCount: digest(returnAllocations.count ?? 0),
    paymentCount: digest(payments.count ?? 0),
    customerBalances: digest(customers.data ?? []),
    customerLedgerCount: digest(customerLedger.count ?? 0),
    dailyClosingCount: digest(dailyClosings.count ?? 0),
    auditLogCount: digest(auditLogs.count ?? 0),
  };
}

async function createFixture(admin: AdminClient, fixture: Fixture): Promise<void> {
  const { data: owners, error: ownerError } = await admin
    .from("profiles")
    .select("id")
    .eq("organization_id", LOCAL_QA_ORG_ID)
    .eq("role", "owner")
    .eq("is_active", true)
    .limit(1);
  expectNoQueryError(ownerError, "local owner lookup");
  const ownerId = owners?.[0]?.id ?? null;
  if (!ownerId) throw new Error("Local disposable owner profile is unavailable.");

  const subtotal = 275;
  const createdAt = new Date().toISOString();
  const { error: invoiceError } = await admin.from("invoices").insert({
    id: fixture.invoiceId,
    organization_id: LOCAL_QA_ORG_ID,
    branch_id: LOCAL_QA_BRANCH_ID,
    customer_id: null,
    invoice_no: fixture.invoiceNo,
    status: "paid",
    subtotal,
    discount_total: 0,
    customer_credit_applied: 0,
    grand_total: subtotal,
    amount_paid: subtotal,
    balance_due: 0,
    amount_tendered: subtotal,
    change_due: 0,
    note: "Synthetic local return print fixture.",
    created_by: ownerId,
    invoice_date: createdAt,
    created_at: createdAt,
  });
  expectNoQueryError(invoiceError, "invoice fixture insert");

  const { error: invoiceItemsError } = await admin.from("invoice_items").insert([
    {
      id: fixture.invoiceItemIds[0],
      organization_id: LOCAL_QA_ORG_ID,
      invoice_id: fixture.invoiceId,
      product_id: null,
      product_name: SHORT_ITEM_NAME,
      product_type: "service",
      quantity: 1,
      purchase_price: 0,
      unit_price: 125,
      item_discount: 0,
      line_total: 125,
      service_total_charged: 125,
      created_at: createdAt,
    },
    {
      id: fixture.invoiceItemIds[1],
      organization_id: LOCAL_QA_ORG_ID,
      invoice_id: fixture.invoiceId,
      product_id: null,
      product_name: LONG_ITEM_NAME,
      product_type: "service",
      quantity: 2,
      purchase_price: 0,
      unit_price: 75,
      item_discount: 0,
      line_total: 150,
      service_total_charged: 150,
      created_at: createdAt,
    },
  ]);
  expectNoQueryError(invoiceItemsError, "invoice item fixture inserts");

  const { error: returnError } = await admin.from("returns").insert({
    id: fixture.returnId,
    organization_id: LOCAL_QA_ORG_ID,
    branch_id: LOCAL_QA_BRANCH_ID,
    invoice_id: fixture.invoiceId,
    customer_id: null,
    return_no: fixture.returnNo,
    status: "completed",
    subtotal,
    refund_amount: subtotal,
    refund_method: "cash",
    reference_number: null,
    notes: RETURN_NOTES,
    created_by: ownerId,
    created_at: createdAt,
  });
  expectNoQueryError(returnError, "return fixture insert");

  const { error: returnItemsError } = await admin.from("return_items").insert([
    {
      id: fixture.returnItemIds[0],
      organization_id: LOCAL_QA_ORG_ID,
      return_id: fixture.returnId,
      invoice_id: fixture.invoiceId,
      invoice_item_id: fixture.invoiceItemIds[0],
      product_id: null,
      item_name: SHORT_ITEM_NAME,
      item_type: "service",
      quantity: 1,
      unit_price: 125,
      line_total: 125,
      restock: false,
      created_at: createdAt,
    },
    {
      id: fixture.returnItemIds[1],
      organization_id: LOCAL_QA_ORG_ID,
      return_id: fixture.returnId,
      invoice_id: fixture.invoiceId,
      invoice_item_id: fixture.invoiceItemIds[1],
      product_id: null,
      item_name: LONG_ITEM_NAME,
      item_type: "service",
      quantity: 2,
      unit_price: 75,
      line_total: 150,
      restock: false,
      created_at: createdAt,
    },
  ]);
  expectNoQueryError(returnItemsError, "return item fixture inserts");
}

async function fixtureRowsRemaining(admin: AdminClient, fixture: Fixture) {
  const [invoice, invoiceItems, ret, returnItems] = await Promise.all([
    admin.from("invoices").select("id").eq("id", fixture.invoiceId),
    admin.from("invoice_items").select("id").in("id", fixture.invoiceItemIds),
    admin.from("returns").select("id").eq("id", fixture.returnId),
    admin.from("return_items").select("id").in("id", fixture.returnItemIds),
  ]);
  for (const [label, result] of [
    ["invoice fixture verification", invoice],
    ["invoice item fixture verification", invoiceItems],
    ["return fixture verification", ret],
    ["return item fixture verification", returnItems],
  ] as const) {
    expectNoQueryError(result.error, label);
  }
  return {
    invoices: (invoice.data ?? []).map((row) => row.id),
    invoice_items: (invoiceItems.data ?? []).map((row) => row.id),
    returns: (ret.data ?? []).map((row) => row.id),
    return_items: (returnItems.data ?? []).map((row) => row.id),
  };
}

async function cleanupPass(admin: AdminClient, fixture: Fixture): Promise<string[]> {
  const errors: string[] = [];
  for (const [table, ids] of [
    ["return_items", fixture.returnItemIds],
    ["returns", [fixture.returnId]],
    ["invoice_items", fixture.invoiceItemIds],
    ["invoices", [fixture.invoiceId]],
  ] as const) {
    const { error } = await admin
      .from(table)
      .delete()
      .eq("organization_id", LOCAL_QA_ORG_ID)
      .in("id", [...ids]);
    if (error) errors.push(`${table}: ${error.message}`);
  }
  return errors;
}

async function cleanupWithRetry(
  admin: AdminClient,
  fixture: Fixture,
): Promise<{ retried: boolean; remaining: Awaited<ReturnType<typeof fixtureRowsRemaining>> }> {
  let errors = await cleanupPass(admin, fixture);
  let remaining = await fixtureRowsRemaining(admin, fixture);
  const hasRemaining = () => Object.values(remaining).some((ids) => ids.length > 0);
  let retried = false;

  if (errors.length > 0 || hasRemaining()) {
    retried = true;
    errors = await cleanupPass(admin, fixture);
    remaining = await fixtureRowsRemaining(admin, fixture);
  }

  if (errors.length > 0 || hasRemaining()) {
    const remainingIds = Object.entries(remaining)
      .filter(([, ids]) => ids.length > 0)
      .map(([table, ids]) => `${table}=${ids.join(",")}`)
      .join("; ");
    throw new Error(
      `Disposable fixture cleanup failed after retry. ${remainingIds || errors.join("; ")}`,
    );
  }
  return { retried, remaining };
}

function expectedLocalInstrumentation(message: ConsoleMessage): boolean {
  const evidence = `${message.text()} ${message.location().url}`;
  return (
    /\/_vercel\/(?:insights|speed-insights)\/script\.js/i.test(evidence) ||
    /clarity\.ms\/tag\/dummy-clarity/i.test(evidence)
  );
}

function observeBrowser(page: Page): BrowserEvidence {
  const evidence: BrowserEvidence = {
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
    const pathname = safePath(request.url());
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

function guardBrowserWrites(page: Page, evidence: BrowserEvidence): void {
  page.on("request", (request) => {
    if (["GET", "HEAD", "OPTIONS"].includes(request.method())) return;
    const pathname = safePath(request.url());
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
        version: "returns-print-qa",
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

async function expectNoHorizontalOverflow(page: Page, label: string): Promise<void> {
  const widths = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(widths.document, `${label}: document width`).toBeLessThanOrEqual(widths.viewport + 2);
  expect(widths.body, `${label}: body width`).toBeLessThanOrEqual(widths.viewport + 2);
}

async function expectNotClipped(locator: Locator, label: string): Promise<void> {
  await expect(locator, `${label}: visible`).toBeVisible();
  const metrics = await locator.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  expect(metrics.scrollWidth, `${label}: horizontal clipping`).toBeLessThanOrEqual(
    metrics.clientWidth + 1,
  );
  expect(metrics.scrollHeight, `${label}: vertical clipping`).toBeLessThanOrEqual(
    metrics.clientHeight + 1,
  );
}

async function expectSummaryRowsSeparated(rows: Locator, label: string): Promise<void> {
  const overlaps = await rows.evaluateAll((elements) =>
    elements
      .filter((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" && rect.width > 0 && rect.height > 0;
      })
      .map((element) => {
        const spans = Array.from(element.querySelectorAll(":scope > span"));
        if (spans.length < 2) return false;
        const left = spans[0].getBoundingClientRect();
        const right = spans.at(-1)!.getBoundingClientRect();
        return (
          left.left < right.right - 0.5 &&
          left.right > right.left + 0.5 &&
          left.top < right.bottom - 0.5 &&
          left.bottom > right.top + 0.5
        );
      }),
  );
  expect(overlaps.every((overlap) => !overlap), `${label}: summary values do not overlap`).toBe(
    true,
  );
}

async function expectControl(control: Locator, label: string): Promise<void> {
  await expectNotClipped(control, label);
  const box = await control.boundingBox();
  expect(box, `${label}: rendered box`).not.toBeNull();
  expect(box!.height, `${label}: touch height`).toBeGreaterThanOrEqual(43.5);
}

async function verifyScreen(
  page: Page,
  fixture: Fixture,
  viewport: { width: number; height: number },
  screenshotPath: string,
): Promise<string[]> {
  await page.setViewportSize(viewport);
  const response = await page.goto(`/returns/${fixture.returnId}`, {
    waitUntil: "domcontentloaded",
  });
  expect(response?.status(), "Return detail document request succeeds").toBeLessThan(400);
  await page.waitForLoadState("networkidle");

  const article = page.locator("article.a4-print");
  const thermal = page.locator("article.thermal-print");
  const a4Button = page.getByRole("button", { name: "Print A4", exact: true });
  const thermalButton = page.getByRole("button", { name: "Print 80mm", exact: true });
  const whatsapp = page.getByRole("link", { name: "Share WhatsApp", exact: true });
  await expect(
    page.locator("h1:visible").filter({ hasText: `Return ${fixture.returnNo}` }),
  ).toHaveText(`Return ${fixture.returnNo}`);
  await expect(page.getByRole("link", { name: /Back to returns/i })).toBeVisible();
  await expect(article).toBeVisible();
  await expect(thermal).toBeHidden();
  await expectControl(a4Button, "Print A4");
  await expectControl(thermalButton, "Print 80mm");
  await expectControl(whatsapp, "Share WhatsApp");
  const whatsappSafe = await whatsapp.evaluate((element) => {
    const link = element as HTMLAnchorElement;
    return {
      isWhatsApp: link.href.startsWith("https://wa.me/"),
      target: link.target,
      rel: link.rel,
    };
  });
  expect(whatsappSafe.isWhatsApp, "WhatsApp URL remains external").toBe(true);
  expect(whatsappSafe.target).toBe("_blank");
  expect(whatsappSafe.rel).toContain("noopener");
  expect(whatsappSafe.rel).toContain("noreferrer");

  for (const label of [
    "Return Receipt",
    "Customer",
    "Cashier",
    "Linked Invoice",
    "Notes / Reason",
    "Subtotal",
    "Total Refund",
    "Refund Method",
  ]) {
    await expect(article.getByText(label, { exact: true }).first(), `${label}: screen`).toBeVisible();
  }
  await expect(article.getByText(fixture.returnNo, { exact: true })).toBeVisible();
  await expect(article.getByText(fixture.invoiceNo, { exact: true })).toBeVisible();
  await expect(article.getByText("completed", { exact: true })).toBeVisible();
  await expect(article.locator("footer")).toBeVisible();

  const desktopItems = article.locator("div.hidden.md\\:block.print\\:block");
  const mobileItems = article.locator("div.md\\:hidden.print\\:hidden");
  const isMobile = viewport.width < 768;
  if (isMobile) {
    await expect(desktopItems).toBeHidden();
    await expect(mobileItems).toBeVisible();
    await expect(mobileItems.getByText(SHORT_ITEM_NAME, { exact: true })).toBeVisible();
    await expect(mobileItems.getByText(LONG_ITEM_NAME, { exact: true })).toBeVisible();
    await expect(mobileItems.getByText(/Qty:/).first()).toBeVisible();
    await expect(mobileItems.getByText(/Unit Price:/).first()).toBeVisible();
    await expect(mobileItems.getByText(/Restocked:/).first()).toBeVisible();
    await expect(mobileItems.getByText("No", { exact: true }).first()).toBeVisible();
    await expectNotClipped(
      mobileItems.getByText(LONG_ITEM_NAME, { exact: true }),
      "mobile long item name",
    );
  } else {
    await expect(desktopItems).toBeVisible();
    await expect(mobileItems).toBeHidden();
    await expect(article.getByText(SHORT_ITEM_NAME, { exact: true }).first()).toBeVisible();
    await expect(article.getByText(LONG_ITEM_NAME, { exact: true }).first()).toBeVisible();
    for (const heading of ["Item", "Qty", "Unit Price", "Restocked", "Refund Total"]) {
      await expect(article.getByRole("columnheader", { name: heading, exact: true })).toBeVisible();
    }
  }
  await expect(
    (isMobile ? mobileItems : desktopItems).getByText("Service", { exact: true }).first(),
  ).toBeVisible();

  const articleBounds = await article.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, right: rect.right, viewport: window.innerWidth };
  });
  expect(articleBounds.left, "Return card left bound").toBeGreaterThanOrEqual(-1);
  expect(articleBounds.right, "Return card right bound").toBeLessThanOrEqual(
    articleBounds.viewport + 1,
  );
  await expectSummaryRowsSeparated(
    article.locator("section.mt-6 div.flex.justify-between"),
    "screen summary",
  );
  await expectNoHorizontalOverflow(page, `${viewport.width}x${viewport.height} Return detail`);
  expect(await visibleFrameworkErrors(page)).toEqual([]);
  await page.screenshot({ path: screenshotPath, fullPage: true });

  const screenText = await article.innerText();
  const signatures = [
    fixture.returnNo,
    fixture.invoiceNo,
    SHORT_ITEM_NAME,
    LONG_ITEM_NAME,
    RETURN_NOTES,
  ];
  expect(signatures.every((signature) => screenText.includes(signature))).toBe(true);
  return signatures;
}

type PrintCall = {
  mode: string | null;
  returnsMarker: string | null;
  measuringCount: number;
  styleCount: number;
  styleText: string | null;
  path: string;
};

type PrintObservation = {
  calls: PrintCall[];
  measurementSeen: boolean;
  maxStyleCount: number;
  cleanupTimeoutsScheduled: number;
};

async function installPrintObservation(
  page: Page,
  options: { holdCleanup?: boolean; delayImageDecode?: boolean; holdImageDecode?: boolean } = {},
): Promise<void> {
  await page.evaluate(({ holdCleanup, delayImageDecode, holdImageDecode }) => {
    type ObservationState = typeof window & {
      __returnsPrintObservation?: PrintObservation;
      __returnsPrintObserver?: MutationObserver;
      __returnsOriginalSetTimeout?: typeof window.setTimeout;
      __returnsOriginalImageDecode?: typeof HTMLImageElement.prototype.decode;
      __returnsImageDecodeResolvers?: Array<() => void>;
    };
    const state = window as ObservationState;
    state.__returnsPrintObserver?.disconnect();
    state.__returnsPrintObservation = {
      calls: [],
      measurementSeen: false,
      maxStyleCount: 0,
      cleanupTimeoutsScheduled: 0,
    };
    const sample = () => {
      const evidence = state.__returnsPrintObservation!;
      if (document.querySelector('[data-returns-thermal-measuring="true"]')) {
        evidence.measurementSeen = true;
      }
      evidence.maxStyleCount = Math.max(
        evidence.maxStyleCount,
        document.querySelectorAll("#returns-thermal-page-size").length,
      );
    };
    state.__returnsPrintObserver = new MutationObserver(sample);
    state.__returnsPrintObserver.observe(document.documentElement, {
      attributes: true,
      childList: true,
      subtree: true,
      attributeFilter: [
        "data-returns-thermal-measuring",
        "data-print-mode",
        "data-returns-thermal-print",
      ],
    });
    sample();

    window.print = () => {
      sample();
      state.__returnsPrintObservation!.calls.push({
        mode: document.body.dataset.printMode ?? null,
        returnsMarker: document.body.dataset.returnsThermalPrint ?? null,
        measuringCount: document.querySelectorAll(
          '[data-returns-thermal-measuring="true"]',
        ).length,
        styleCount: document.querySelectorAll("#returns-thermal-page-size").length,
        styleText: document.getElementById("returns-thermal-page-size")?.textContent ?? null,
        path: location.pathname,
      });
    };

    if (holdCleanup || holdImageDecode) {
      const original = window.setTimeout.bind(window);
      state.__returnsOriginalSetTimeout = window.setTimeout;
      window.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
        if (timeout === 1200) {
          state.__returnsPrintObservation!.cleanupTimeoutsScheduled += 1;
        }
        return original(handler, holdCleanup && timeout === 1200 ? 30_000 : timeout, ...args);
      }) as typeof window.setTimeout;
    }

    if (holdImageDecode) {
      const originalDecode = HTMLImageElement.prototype.decode;
      state.__returnsOriginalImageDecode = originalDecode;
      state.__returnsImageDecodeResolvers = [];
      HTMLImageElement.prototype.decode = function decodeWhenReleased() {
        return new Promise<void>((resolve) => {
          state.__returnsImageDecodeResolvers!.push(resolve);
        });
      };
    } else if (delayImageDecode) {
      const originalDecode = HTMLImageElement.prototype.decode;
      state.__returnsOriginalImageDecode = originalDecode;
      HTMLImageElement.prototype.decode = function decodeWithDelay() {
        return new Promise<void>((resolve) => window.setTimeout(resolve, 150));
      };
    }
  }, options);
}

async function releaseHeldImageDecode(page: Page): Promise<void> {
  await page.evaluate(() => {
    const state = window as typeof window & {
      __returnsImageDecodeResolvers?: Array<() => void>;
    };
    const resolvers = state.__returnsImageDecodeResolvers ?? [];
    state.__returnsImageDecodeResolvers = [];
    resolvers.forEach((resolve) => resolve());
  });
}

async function advanceAnimationFrames(page: Page, frameCount = 6): Promise<void> {
  await page.evaluate(
    (count) =>
      new Promise<void>((resolve) => {
        let remainingFrames = count;
        const advance = () => {
          remainingFrames -= 1;
          if (remainingFrames === 0) resolve();
          else requestAnimationFrame(advance);
        };
        requestAnimationFrame(advance);
      }),
    frameCount,
  );
}

async function readPrintObservation(page: Page): Promise<PrintObservation> {
  return page.evaluate(() => {
    const state = window as typeof window & { __returnsPrintObservation?: PrintObservation };
    return (
      state.__returnsPrintObservation ?? {
        calls: [],
        measurementSeen: false,
        maxStyleCount: 0,
        cleanupTimeoutsScheduled: 0,
      }
    );
  });
}

async function restorePrintObservation(page: Page): Promise<void> {
  await page.evaluate(() => {
    type ObservationState = typeof window & {
      __returnsPrintObserver?: MutationObserver;
      __returnsOriginalSetTimeout?: typeof window.setTimeout;
      __returnsOriginalImageDecode?: typeof HTMLImageElement.prototype.decode;
      __returnsImageDecodeResolvers?: Array<() => void>;
    };
    const state = window as ObservationState;
    state.__returnsPrintObserver?.disconnect();
    if (state.__returnsOriginalSetTimeout) {
      window.setTimeout = state.__returnsOriginalSetTimeout;
      delete state.__returnsOriginalSetTimeout;
    }
    if (state.__returnsOriginalImageDecode) {
      HTMLImageElement.prototype.decode = state.__returnsOriginalImageDecode;
      delete state.__returnsOriginalImageDecode;
    }
    delete state.__returnsImageDecodeResolvers;
  });
}

async function expectPrintStateClean(page: Page, label: string): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(() => ({
          mode: document.body.dataset.printMode ?? null,
          returnsMarker: document.body.dataset.returnsThermalPrint ?? null,
          measuringCount: document.querySelectorAll(
            '[data-returns-thermal-measuring="true"]',
          ).length,
          styleCount: document.querySelectorAll("#returns-thermal-page-size").length,
        })),
      { message: `${label}: print state cleanup` },
    )
    .toEqual({ mode: null, returnsMarker: null, measuringCount: 0, styleCount: 0 });
}

function chromiumPdfPageCount(buffer: Buffer): number {
  const source = buffer.toString("latin1");
  const pageObjects = source.match(/\/Type\s*\/Page\b/g)?.length ?? 0;
  const treeCounts = [...source.matchAll(/\/Type\s*\/Pages\b[\s\S]{0,500}?\/Count\s+(\d+)/g)]
    .map((match) => Number.parseInt(match[1], 10))
    .filter(Number.isFinite);
  const treeCount = treeCounts.length > 0 ? Math.max(...treeCounts) : 0;
  if (pageObjects > 0 && treeCount > 0) {
    expect(pageObjects, "PDF page objects agree with page tree").toBe(treeCount);
  }
  return treeCount || pageObjects;
}

function pdfplumberAvailable(): boolean {
  try {
    execFileSync("python3", ["-c", "import pdfplumber"], {
      stdio: ["ignore", "ignore", "ignore"],
    });
    return true;
  } catch {
    return false;
  }
}

function measurePdfWidth(path: string): PdfWidthMeasurement {
  const script = String.raw`
import json, logging, re, sys
logging.getLogger("pdfminer").setLevel(logging.ERROR)
import pdfplumber

labels = ["returnno", "invoiceno", "subtotal", "totalrefund", "method"]
with pdfplumber.open(sys.argv[1]) as pdf:
    if not pdf.pages:
        raise RuntimeError("Generated PDF has no pages")
    page = pdf.pages[0]
    words = page.extract_words()
    if not words:
        raise RuntimeError("Generated PDF has no extractable words")
    grouped = []
    for word in sorted(words, key=lambda item: (item["top"], item["x0"])):
        row = next((item for item in grouped if abs(item["top"] - word["top"]) <= 1.5), None)
        if row is None:
            row = {"top": word["top"], "words": []}
            grouped.append(row)
        row["words"].append(word)
    rows = {}
    for row in grouped:
        ordered = sorted(row["words"], key=lambda item: item["x0"])
        normalized = re.sub(r"[^a-z]", "", "".join(item["text"] for item in ordered).lower())
        for label in labels:
            if label in normalized and label not in rows:
                left = min(item["x0"] for item in ordered)
                right = max(item["x1"] for item in ordered)
                rows[label] = {
                    "left": round(left, 2),
                    "right": round(right, 2),
                    "spanPercent": round((right - left) / page.width * 100, 1),
                }
    left = min(item["x0"] for item in words)
    right = max(item["x1"] for item in words)
    print(json.dumps({
        "pageCount": len(pdf.pages),
        "pageWidth": round(page.width, 2),
        "pageHeight": round(page.height, 2),
        "overallLeft": round(left, 2),
        "overallRight": round(right, 2),
        "overallSpanPercent": round((right - left) / page.width * 100, 1),
        "rows": rows,
    }, sort_keys=True))
`;
  const output = execFileSync("python3", ["-c", script, path], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return JSON.parse(output) as PdfWidthMeasurement;
}

function renderPdfFirstPage(path: string, outputPath: string): void {
  const prefix = outputPath.replace(/\.png$/i, "");
  execFileSync("pdftoppm", ["-png", "-singlefile", path, prefix], {
    stdio: ["ignore", "ignore", "pipe"],
  });
  expect(existsSync(outputPath), `${outputPath}: rendered PDF page`).toBe(true);
}

async function captureThermalPrintContract(
  page: Page,
): Promise<Record<string, PrintElementContract>> {
  return page.evaluate(() => {
    const selectors = {
      html: "html",
      body: "body",
      root: "[data-app-shell-root]",
      column: "[data-app-shell-column]",
      main: "[data-app-shell-main]",
      content: "[data-app-shell-content]",
      thermal: ".thermal-print",
    };
    return Object.fromEntries(
      Object.entries(selectors).map(([name, selector]) => {
        const element = document.querySelector<HTMLElement>(selector);
        if (!element) throw new Error(`Missing print-contract element: ${selector}`);
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        const boundingWidthPx = rect.width;
        return [
          name,
          {
            display: style.display,
            width: style.width,
            maxWidth: style.maxWidth,
            minWidth: style.minWidth,
            marginLeft: style.marginLeft,
            marginRight: style.marginRight,
            paddingLeft: style.paddingLeft,
            paddingRight: style.paddingRight,
            overflow: style.overflow,
            flex: style.flex,
            leftPx: rect.left,
            rightPx: rect.right,
            transform: style.transform,
            zoom: style.zoom,
            page: style.getPropertyValue("page"),
            boundingWidthPx,
            boundingWidthMm: (boundingWidthPx * 25.4) / 96,
          },
        ];
      }),
    );
  });
}

test.describe("Returns A4 and 80mm print artifacts", () => {
  test.beforeEach(() => {
    test.skip(!isLocalPlaywrightRun(), "Returns print QA is restricted to localhost.");
  });

  test(`renders the ${RECEIPT_VARIANT} production Return artifacts and cleans the fixture`, async ({
    page,
  }) => {
    test.setTimeout(240_000);
    mkdirSync(ARTIFACT_DIR, { recursive: true });
    for (const artifact of [
      MOBILE_SCREENSHOT,
      DESKTOP_SCREENSHOT,
      A4_SCREENSHOT,
      A4_PDF,
      A4_RENDER,
      THERMAL_SCREENSHOT,
      THERMAL_CSS_PAGE_PDF,
      THERMAL_CONTRACT,
      THERMAL_CSS_PAGE_RENDER,
    ]) {
      rmSync(artifact, { force: true });
    }

    const { url: supabaseUrl } = getLocalAuthConfig();
    expect(
      ["localhost", "127.0.0.1", "::1"].includes(new URL(supabaseUrl).hostname),
      "Supabase must be loopback-only",
    ).toBe(true);

    const admin = getLocalAdminClient();
    const fixture = makeFixture();
    const beforeSafety = await captureSafetySnapshot(admin);
    let fixtureCreated = false;

    try {
      await createFixture(admin, fixture);
      fixtureCreated = true;
      const createdRows = await fixtureRowsRemaining(admin, fixture);
      expect(createdRows.invoices).toHaveLength(1);
      expect(createdRows.invoice_items).toHaveLength(2);
      expect(createdRows.returns).toHaveLength(1);
      expect(createdRows.return_items).toHaveLength(2);

      const evidence = observeBrowser(page);
      await installRejectedConsent(page);
      await loginLocalOwnerDirectly(page);
      guardBrowserWrites(page, evidence);

      const mobileSignatures = await verifyScreen(
        page,
        fixture,
        { width: 390, height: 844 },
        MOBILE_SCREENSHOT,
      );
      const desktopSignatures = await verifyScreen(
        page,
        fixture,
        { width: 1440, height: 900 },
        DESKTOP_SCREENSHOT,
      );
      expect(mobileSignatures.map(digest)).toEqual(desktopSignatures.map(digest));

      const a4Button = page.getByRole("button", { name: "Print A4", exact: true });
      const thermalButton = page.getByRole("button", { name: "Print 80mm", exact: true });
      const beforePath = await page.evaluate(() => location.pathname);
      await installPrintObservation(page);
      await a4Button.click();
      await expect.poll(async () => (await readPrintObservation(page)).calls.length).toBe(1);
      const a4ButtonEvidence = await readPrintObservation(page);
      expect(a4ButtonEvidence.calls).toEqual([
        {
          mode: "a4",
          returnsMarker: null,
          measuringCount: 0,
          styleCount: 0,
          styleText: null,
          path: beforePath,
        },
      ]);
      await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
      await expectPrintStateClean(page, "A4 afterprint");
      await restorePrintObservation(page);

      await page.setViewportSize({ width: 1440, height: 900 });
      await page.evaluate(() => {
        document.body.dataset.printMode = "a4";
      });
      await page.emulateMedia({ media: "print" });
      const a4 = page.locator("article.a4-print");
      const thermal = page.locator("article.thermal-print");
      await expect(a4).toBeVisible();
      await expect(thermal).toBeHidden();
      await expect(page.locator("nav:visible, aside:visible, header.sticky:visible")).toHaveCount(0);
      await expect(page.getByRole("link", { name: /Back to returns/i })).toBeHidden();
      await expect(page.getByRole("button", { name: "Print A4", exact: true })).toBeHidden();
      await expect(page.getByRole("button", { name: "Print 80mm", exact: true })).toBeHidden();
      await expect(page.getByRole("link", { name: "Share WhatsApp", exact: true })).toBeHidden();
      await expect(page.getByTestId("cookie-consent-banner")).toBeHidden();
      for (const label of [
        "Return Receipt",
        "Customer",
        "Cashier",
        "Linked Invoice",
        "Item",
        "Qty",
        "Unit Price",
        "Restocked",
        "Refund Total",
        "Notes / Reason",
        "Subtotal",
        "Total Refund",
        "Refund Method",
      ]) {
        await expect(a4.getByText(label, { exact: true }).first(), `${label}: A4`).toBeVisible();
      }
      await expect(a4.locator("header h1")).toBeVisible();
      await expect(a4.locator("header p").first()).toBeVisible();
      await expect(a4.getByText(fixture.returnNo, { exact: true })).toBeVisible();
      await expect(a4.getByText(fixture.invoiceNo, { exact: true })).toBeVisible();
      await expect(a4.getByText(SHORT_ITEM_NAME, { exact: true }).first()).toBeVisible();
      await expect(a4.getByText(LONG_ITEM_NAME, { exact: true }).first()).toBeVisible();
      await expect(a4.getByText("No", { exact: true }).first()).toBeVisible();
      await expect(a4.locator("footer")).toBeVisible();
      const a4Text = await a4.innerText();
      expect(desktopSignatures.every((signature) => a4Text.includes(signature))).toBe(true);
      const a4Style = await a4.evaluate((element) => ({
        background: getComputedStyle(element).backgroundColor,
        color: getComputedStyle(element).color,
      }));
      expect(a4Style.background).toBe("rgb(255, 255, 255)");
      expect(a4Style.color).not.toBe("rgba(0, 0, 0, 0)");
      await expectNotClipped(a4.locator("table"), "A4 returned-item table");
      await expectSummaryRowsSeparated(
        a4.locator("section.mt-6 div.flex.justify-between"),
        "A4 summary",
      );
      await expectNoHorizontalOverflow(page, "A4 print media");
      expect(await visibleFrameworkErrors(page)).toEqual([]);
      await a4.screenshot({ path: A4_SCREENSHOT });
      const a4Pdf = await page.pdf({
        path: A4_PDF,
        format: "A4",
        printBackground: true,
        margin: { top: "10mm", right: "10mm", bottom: "10mm", left: "10mm" },
      });
      expect(a4Pdf.subarray(0, 4).toString("ascii")).toBe("%PDF");
      expect(a4Pdf.byteLength).toBeGreaterThan(10_000);
      const a4Pages = chromiumPdfPageCount(a4Pdf);
      expect(a4Pages).toBe(1);
      renderPdfFirstPage(A4_PDF, A4_RENDER);

      await page.emulateMedia({ media: "screen" });
      await page.evaluate(() => {
        delete document.body.dataset.printMode;
      });
      await page.setViewportSize({ width: 390, height: 844 });

      await installPrintObservation(page, { delayImageDecode: true });
      await Promise.all([thermalButton.click(), thermalButton.click()]);
      await expect.poll(async () => (await readPrintObservation(page)).calls.length).toBe(1);
      const repeatedClickEvidence = await readPrintObservation(page);
      expect(repeatedClickEvidence.measurementSeen).toBe(true);
      expect(repeatedClickEvidence.maxStyleCount).toBe(1);
      expect(repeatedClickEvidence.calls[0].measuringCount).toBe(0);
      expect(repeatedClickEvidence.calls[0].styleCount).toBe(1);
      expect(repeatedClickEvidence.calls[0].returnsMarker).toBe("true");
      await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
      await expectPrintStateClean(page, "thermal repeated-click afterprint");
      await restorePrintObservation(page);

      await installPrintObservation(page);
      await thermalButton.click();
      await expect.poll(async () => (await readPrintObservation(page)).calls.length).toBe(1);
      await page.waitForTimeout(1400);
      await expectPrintStateClean(page, "thermal timeout fallback");
      await restorePrintObservation(page);

      await installPrintObservation(page, { holdCleanup: true });
      await thermalButton.click();
      await expect.poll(async () => (await readPrintObservation(page)).calls.length).toBe(1);
      const primaryPrintEvidence = await readPrintObservation(page);
      const primaryCall = primaryPrintEvidence.calls[0];
      expect(primaryPrintEvidence.measurementSeen).toBe(true);
      expect(primaryPrintEvidence.maxStyleCount).toBe(1);
      expect(primaryCall.mode).toBe("thermal");
      expect(primaryCall.returnsMarker).toBe("true");
      expect(primaryCall.measuringCount).toBe(0);
      expect(primaryCall.styleCount).toBe(1);
      expect(primaryCall.path).toBe(beforePath);
      const pageRuleMatch = primaryCall.styleText?.match(
        /@page returnsThermalReceipt \{ size: 80mm ([0-9]+(?:\.[0-9]+)?)mm; margin: 4mm; \}/,
      );
      expect(pageRuleMatch, "production dynamic Returns page rule").not.toBeNull();
      const thermalPageHeightMm = Number(pageRuleMatch![1]);
      expect(Number.isFinite(thermalPageHeightMm)).toBe(true);

      await page.emulateMedia({ media: "print" });
      await expect(a4).toBeHidden();
      await expect(thermal).toBeVisible();
      const thermalContract = await captureThermalPrintContract(page);
      writeFileSync(
        THERMAL_CONTRACT,
        `${JSON.stringify(
          {
            variant: RECEIPT_VARIANT,
            dynamicPageHeightMm: thermalPageHeightMm,
            dynamicPageRule: primaryCall.styleText,
            elements: thermalContract,
          },
          null,
          2,
        )}\n`,
      );
      for (const name of ["body", "root", "column", "main", "content", "thermal"] as const) {
        expect(
          thermalContract[name].boundingWidthMm,
          `${name}: production content width does not exceed 72mm`,
        ).toBeLessThanOrEqual(72.5);
      }
      for (const name of ["body", "main", "thermal"] as const) {
        expect(
          thermalContract[name].boundingWidthMm,
          `${name}: production content width reaches 72mm`,
        ).toBeGreaterThanOrEqual(71.5);
      }
      expect(thermalContract.thermal.marginLeft).toBe("0px");
      expect(thermalContract.thermal.marginRight).toBe("0px");
      expect(thermalContract.thermal.page).toBe("returnsThermalReceipt");
      await expect(page.locator("nav:visible, aside:visible, header.sticky:visible")).toHaveCount(0);
      await expect(a4Button).toBeHidden();
      await expect(thermalButton).toBeHidden();
      await expect(page.getByRole("link", { name: "Share WhatsApp", exact: true })).toBeHidden();
      await expect(page.getByTestId("cookie-consent-banner")).toBeHidden();
      for (const label of [
        "Return No",
        "Invoice No",
        "Date",
        "Customer",
        "Cashier",
        "Subtotal",
        "Total Refund",
        "Method",
        "Reason/Notes",
        "Powered by SaleDock Cloud POS",
      ]) {
        await expect(thermal.getByText(label, { exact: true }).first(), `${label}: thermal`).toBeVisible();
      }
      await expect(thermal.locator("header h1")).toBeVisible();
      await expect(thermal.locator("header p").first()).toBeVisible();
      await expect(thermal.getByText(fixture.returnNo, { exact: true })).toBeVisible();
      await expect(thermal.getByText(fixture.invoiceNo, { exact: true })).toBeVisible();
      await expect(thermal.getByText(SHORT_ITEM_NAME, { exact: true })).toBeVisible();
      const longThermalName = thermal.getByText(LONG_ITEM_NAME, { exact: true });
      await expect(longThermalName).toBeVisible();
      await expect(thermal.locator("footer")).toBeVisible();
      const thermalText = await thermal.innerText();
      expect(desktopSignatures.every((signature) => thermalText.includes(signature))).toBe(true);
      const longNameMetrics = await longThermalName.evaluate((element) => {
        const style = getComputedStyle(element);
        const lineHeight = Number.parseFloat(style.lineHeight);
        const rect = element.getBoundingClientRect();
        return {
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
          lineCount: Number.isFinite(lineHeight) && lineHeight > 0 ? rect.height / lineHeight : 0,
        };
      });
      expect(longNameMetrics.scrollWidth).toBeLessThanOrEqual(longNameMetrics.clientWidth + 1);
      expect(longNameMetrics.lineCount, "Long thermal item wraps").toBeGreaterThan(1.25);
      const thermalMetrics = await thermal.evaluate((element) => ({
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
      }));
      expect(thermalMetrics.scrollWidth).toBeLessThanOrEqual(thermalMetrics.clientWidth + 1);
      await expectSummaryRowsSeparated(
        thermal.locator("section.mt-2 div.flex.justify-between"),
        "thermal summary",
      );
      expect(await visibleFrameworkErrors(page)).toEqual([]);
      await thermal.screenshot({ path: THERMAL_SCREENSHOT });
      const thermalCssPagePdf = await page.pdf({
        path: THERMAL_CSS_PAGE_PDF,
        printBackground: true,
        preferCSSPageSize: true,
        scale: 1,
      });
      expect(thermalCssPagePdf.subarray(0, 4).toString("ascii")).toBe("%PDF");
      expect(thermalCssPagePdf.byteLength).toBeGreaterThan(5_000);
      const thermalPages = chromiumPdfPageCount(thermalCssPagePdf);
      expect(thermalPages).toBe(1);
      renderPdfFirstPage(THERMAL_CSS_PAGE_PDF, THERMAL_CSS_PAGE_RENDER);

      expect(pdfplumberAvailable(), "pdfplumber is required for physical acceptance").toBe(true);
      const measurement = measurePdfWidth(THERMAL_CSS_PAGE_PDF);
      test.info().annotations.push({
        type: `thermal-${RECEIPT_VARIANT}`,
        description: JSON.stringify(measurement),
      });
      expect(measurement.pageWidth, "80mm PDF page width in points").toBeGreaterThanOrEqual(224);
      expect(measurement.pageWidth, "80mm PDF page width in points").toBeLessThanOrEqual(230);
      const expectedPageHeightPoints = (thermalPageHeightMm * 72) / 25.4;
      expect(measurement.pageHeight).toBeGreaterThanOrEqual(expectedPageHeightPoints - 2);
      expect(measurement.pageHeight).toBeLessThanOrEqual(expectedPageHeightPoints + 2);
      expect(measurement.overallSpanPercent).toBeGreaterThanOrEqual(70);
      for (const label of ["returnno", "invoiceno", "subtotal", "totalrefund", "method"]) {
        expect(measurement.rows[label], `${label}: measurable left/right row`).toBeDefined();
        expect(measurement.rows[label].spanPercent).toBeGreaterThanOrEqual(70);
      }
      const pageMarginPoints = (4 * 72) / 25.4;
      const leftWhitespace = measurement.overallLeft;
      const rightWhitespace = measurement.pageWidth - measurement.overallRight;
      expect(measurement.overallLeft).toBeGreaterThanOrEqual(pageMarginPoints - 1);
      expect(measurement.overallRight).toBeLessThanOrEqual(
        measurement.pageWidth - pageMarginPoints + 1,
      );
      expect(Math.abs(leftWhitespace - rightWhitespace)).toBeLessThanOrEqual(12);
      if (LONG_RECEIPT) {
        const standardPdf = join(ARTIFACT_DIR, "fixed-thermal-standard.pdf");
        expect(existsSync(standardPdf), "standard receipt artifact exists before long run").toBe(true);
        const standardMeasurement = measurePdfWidth(standardPdf);
        expect(measurement.pageHeight).toBeGreaterThan(standardMeasurement.pageHeight + 5);
        expect(Math.abs(measurement.overallLeft - standardMeasurement.overallLeft)).toBeLessThanOrEqual(
          0.5,
        );
        expect(
          Math.abs(measurement.overallRight - standardMeasurement.overallRight),
        ).toBeLessThanOrEqual(0.5);
        expect(
          Math.abs(measurement.overallSpanPercent - standardMeasurement.overallSpanPercent),
        ).toBeLessThanOrEqual(0.2);
      }

      await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
      await page.emulateMedia({ media: "screen" });
      await expectPrintStateClean(page, "primary thermal afterprint");
      await restorePrintObservation(page);

      await thermal.evaluate((element) => element.remove());
      await installPrintObservation(page);
      await thermalButton.click();
      await expect(page.locator('p[role="alert"]')).toHaveText(
        "Unable to prepare the thermal receipt. Please try again.",
      );
      const cancelledObservation = await readPrintObservation(page);
      expect(cancelledObservation.calls).toEqual([]);
      expect(cancelledObservation.cleanupTimeoutsScheduled).toBe(0);
      await expectPrintStateClean(page, "missing receipt failure");
      await restorePrintObservation(page);

      expect(await visibleFrameworkErrors(page)).toEqual([]);
      expect(evidence).toEqual({
        pageErrors: 0,
        consoleErrors: 0,
        requestFailures: [],
        dialogs: [],
        writes: [],
      });
      test.info().annotations.push(
        { type: "fixture", description: "1 invoice, 2 invoice_items, 1 return, 2 return_items" },
        { type: "fixture-variant", description: RECEIPT_VARIANT },
        { type: "a4-pages", description: String(a4Pages) },
        { type: "thermal-pages", description: String(thermalPages) },
        { type: "thermal-height-mm", description: String(thermalPageHeightMm) },
      );
    } finally {
      if (fixtureCreated) {
        const cleanup = await cleanupWithRetry(admin, fixture);
        if (cleanup.retried) {
          test.info().annotations.push({
            type: "cleanup",
            description: "Fixture cleanup required one retry and then completed.",
          });
        }
      } else {
        await cleanupWithRetry(admin, fixture);
      }
      const afterSafety = await captureSafetySnapshot(admin);
      expect(afterSafety, "Unrelated safety snapshots remain identical").toEqual(beforeSafety);
    }
  });

  test("cancels thermal preparation without stale continuation", async ({ page }) => {
    test.setTimeout(120_000);
    const { url: supabaseUrl } = getLocalAuthConfig();
    expect(
      ["localhost", "127.0.0.1", "::1"].includes(new URL(supabaseUrl).hostname),
      "Supabase must be loopback-only",
    ).toBe(true);

    const admin = getLocalAdminClient();
    const fixture = makeFixture();
    const beforeSafety = await captureSafetySnapshot(admin);
    let fixtureCreated = false;

    try {
      await createFixture(admin, fixture);
      fixtureCreated = true;
      const evidence = observeBrowser(page);
      await installRejectedConsent(page);
      await loginLocalOwnerDirectly(page);
      guardBrowserWrites(page, evidence);
      const response = await page.goto(`/returns/${fixture.returnId}`, {
        waitUntil: "domcontentloaded",
      });
      expect(response?.status()).toBeLessThan(400);
      await page.waitForLoadState("networkidle");
      const beforePath = await page.evaluate(() => location.pathname);

      await installPrintObservation(page, { holdImageDecode: true });
      await page.getByRole("button", { name: "Print 80mm", exact: true }).click();
      await expect
        .poll(async () => (await readPrintObservation(page)).measurementSeen)
        .toBe(true);
      await expect(
        page.locator('[data-returns-thermal-measuring="true"]'),
        "measurement is held before cancellation",
      ).toHaveCount(1);

      await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
      await expectPrintStateClean(page, "preparation cancellation");
      await releaseHeldImageDecode(page);
      await advanceAnimationFrames(page);

      const unmountedObservation = await readPrintObservation(page);
      expect(unmountedObservation.calls).toEqual([]);
      expect(unmountedObservation.cleanupTimeoutsScheduled).toBe(0);
      await expectPrintStateClean(page, "released cancelled preparation");
      await expect(page.locator('p[role="alert"]')).toHaveCount(0);
      expect(await page.evaluate(() => location.pathname)).toBe(beforePath);
      expect(await visibleFrameworkErrors(page)).toEqual([]);
      expect(evidence).toEqual({
        pageErrors: 0,
        consoleErrors: 0,
        requestFailures: [],
        dialogs: [],
        writes: [],
      });
      await restorePrintObservation(page);
    } finally {
      if (fixtureCreated) await cleanupWithRetry(admin, fixture);
      else await cleanupWithRetry(admin, fixture);
      const afterSafety = await captureSafetySnapshot(admin);
      expect(afterSafety, "Cancellation safety snapshots remain identical").toEqual(beforeSafety);
    }
  });

  test("cancels thermal preparation when the print controls unmount", async ({ page }) => {
    test.setTimeout(120_000);
    const { url: supabaseUrl } = getLocalAuthConfig();
    expect(
      ["localhost", "127.0.0.1", "::1"].includes(new URL(supabaseUrl).hostname),
      "Supabase must be loopback-only",
    ).toBe(true);

    const admin = getLocalAdminClient();
    const fixture = makeFixture();
    const beforeSafety = await captureSafetySnapshot(admin);
    let fixtureCreated = false;

    try {
      await createFixture(admin, fixture);
      fixtureCreated = true;
      const evidence = observeBrowser(page);
      await installRejectedConsent(page);
      await loginLocalOwnerDirectly(page);
      guardBrowserWrites(page, evidence);
      const response = await page.goto(`/returns/${fixture.returnId}`, {
        waitUntil: "domcontentloaded",
      });
      expect(response?.status()).toBeLessThan(400);
      await page.waitForLoadState("networkidle");

      await installPrintObservation(page, { holdImageDecode: true });
      await page.getByRole("button", { name: "Print 80mm", exact: true }).click();
      await expect
        .poll(async () => (await readPrintObservation(page)).measurementSeen)
        .toBe(true);
      await expect(
        page.locator('[data-returns-thermal-measuring="true"]'),
        "measurement is held before unmount",
      ).toHaveCount(1);

      await page.getByRole("link", { name: /Back to returns/i }).click();
      await expect(page).toHaveURL(/\/returns(?:\?.*)?$/);
      await expectPrintStateClean(page, "client-navigation unmount");
      await releaseHeldImageDecode(page);
      await advanceAnimationFrames(page);

      expect((await readPrintObservation(page)).calls).toEqual([]);
      await expectPrintStateClean(page, "released unmounted preparation");
      await expect(page.locator('p[role="alert"]')).toHaveCount(0);
      expect(await visibleFrameworkErrors(page)).toEqual([]);
      expect(evidence).toEqual({
        pageErrors: 0,
        consoleErrors: 0,
        requestFailures: [],
        dialogs: [],
        writes: [],
      });
      await restorePrintObservation(page);
    } finally {
      if (fixtureCreated) await cleanupWithRetry(admin, fixture);
      else await cleanupWithRetry(admin, fixture);
      const afterSafety = await captureSafetySnapshot(admin);
      expect(afterSafety, "Unmount safety snapshots remain identical").toEqual(beforeSafety);
    }
  });
});
