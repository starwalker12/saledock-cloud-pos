import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type ConsoleMessage, type Locator, type Page } from "@playwright/test";
import {
  getLocalAdminClient,
  isLocalPlaywrightRun,
  LOCAL_QA_ORG_ID,
  loginLocalOwnerDirectly,
} from "./helpers/local-supabase";

const LOCAL_QA_BRANCH_ID = "00000000-0000-4000-8000-000000000101";
const ARTIFACT_DIR = "/tmp/saledock-repairs-print-fix";
const MOBILE_SCREENSHOT = join(ARTIFACT_DIR, "fixed-screen-mobile.png");
const DESKTOP_SCREENSHOT = join(ARTIFACT_DIR, "fixed-screen-desktop.png");
const A4_SCREENSHOT = join(ARTIFACT_DIR, "fixed-a4-print.png");
const A4_PDF = join(ARTIFACT_DIR, "fixed-a4.pdf");
const A4_RENDER = join(ARTIFACT_DIR, "fixed-a4-render.png");
const A4_FINAL_RENDER = join(ARTIFACT_DIR, "fixed-a4-render-final.png");
const THERMAL_STANDARD_SCREENSHOT = join(ARTIFACT_DIR, "fixed-thermal-standard-print.png");
const THERMAL_STANDARD_PDF = join(ARTIFACT_DIR, "fixed-thermal-standard.pdf");
const THERMAL_STANDARD_RENDER = join(ARTIFACT_DIR, "fixed-thermal-standard-render.png");
const THERMAL_LONG_PDF = join(ARTIFACT_DIR, "fixed-thermal-long.pdf");
const THERMAL_LONG_RENDER = join(ARTIFACT_DIR, "fixed-thermal-long-render.png");

const SYNTHETIC_CUSTOMER = "QA Print Repair Contact";
const SYNTHETIC_DEVICE = "Synthetic Test Handset";
const SYNTHETIC_MODEL =
  "Extended Local Verification Model With Safe Wrapping Across Narrow Receipt Widths";
const SYNTHETIC_SERIAL = "QA-SERIAL-PRINT-ONLY";
const SYNTHETIC_PROBLEM =
  "Synthetic local-only repair problem description with deliberately long wrapping text for narrow thermal receipt verification. No real device or customer information is present.";
const SYNTHETIC_ACCESSORIES =
  "Synthetic protective case, test cable, and local QA intake card for print wrapping verification.";
const LONG_SYNTHETIC_PROBLEM = Array.from({ length: 4 }, () => SYNTHETIC_PROBLEM).join(" ");
const LONG_SYNTHETIC_ACCESSORIES = Array.from(
  { length: 4 },
  () => SYNTHETIC_ACCESSORIES,
).join(" ");

type AdminClient = ReturnType<typeof getLocalAdminClient>;

type Fixture = {
  repairId: string;
  historyId: string;
  jobNo: string;
};

type SafetySnapshot = {
  productQuantities: string;
  lotQuantities: string;
  stockMovementCount: string;
  invoiceCount: string;
  paymentCount: string;
  customerBalances: string;
  customerLedgerCount: string;
  expenseCount: string;
  dailyClosingCount: string;
  cashShiftState: string;
  auditLogCount: string;
};

type BrowserEvidence = {
  pageErrors: number;
  consoleErrors: number;
  requestFailures: string[];
  dialogs: string[];
  writes: string[];
};

type PdfMeasurement = {
  pageCount: number;
  pageWidth: number;
  pageHeight: number;
  overallLeft: number;
  overallRight: number;
  overallSpanPercent: number;
  leftWhitespace: number;
  rightWhitespace: number;
  rows: Record<string, { left: number; right: number; spanPercent: number }>;
  textLabels: string[];
};

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function makeFixture(): Fixture {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
  return {
    repairId: randomUUID(),
    historyId: randomUUID(),
    jobNo: `QA-PRINT-REP-${suffix}`,
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
    invoices,
    payments,
    customers,
    customerLedger,
    expenses,
    dailyClosings,
    cashShifts,
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
      .from("invoices")
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
      .from("expenses")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", LOCAL_QA_ORG_ID),
    admin
      .from("daily_closings")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", LOCAL_QA_ORG_ID),
    admin
      .from("cash_shifts")
      .select("id, status, opened_at, closed_at, starting_cash, expected_cash, counted_cash, cash_difference")
      .eq("organization_id", LOCAL_QA_ORG_ID)
      .order("id"),
    admin
      .from("audit_logs")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", LOCAL_QA_ORG_ID),
  ]);

  for (const [label, result] of [
    ["product quantity snapshot", products],
    ["stock lot snapshot", lots],
    ["stock movement snapshot", stockMovements],
    ["invoice snapshot", invoices],
    ["payment snapshot", payments],
    ["customer balance snapshot", customers],
    ["customer ledger snapshot", customerLedger],
    ["expense snapshot", expenses],
    ["daily closing snapshot", dailyClosings],
    ["cash shift snapshot", cashShifts],
    ["audit log snapshot", auditLogs],
  ] as const) {
    expectNoQueryError(result.error, label);
  }

  return {
    productQuantities: digest(products.data ?? []),
    lotQuantities: digest(lots.data ?? []),
    stockMovementCount: digest(stockMovements.count ?? 0),
    invoiceCount: digest(invoices.count ?? 0),
    paymentCount: digest(payments.count ?? 0),
    customerBalances: digest(customers.data ?? []),
    customerLedgerCount: digest(customerLedger.count ?? 0),
    expenseCount: digest(expenses.count ?? 0),
    dailyClosingCount: digest(dailyClosings.count ?? 0),
    cashShiftState: digest(cashShifts.data ?? []),
    auditLogCount: digest(auditLogs.count ?? 0),
  };
}

async function createFixture(
  admin: AdminClient,
  fixture: Fixture,
  options: { long?: boolean } = {},
): Promise<void> {
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

  const createdAt = new Date().toISOString();
  const expectedDeliveryAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
  const { error: repairError } = await admin.from("repairs").insert({
    id: fixture.repairId,
    organization_id: LOCAL_QA_ORG_ID,
    branch_id: LOCAL_QA_BRANCH_ID,
    customer_id: null,
    job_no: fixture.jobNo,
    customer_name: SYNTHETIC_CUSTOMER,
    customer_phone: null,
    device_type: SYNTHETIC_DEVICE,
    device_model: SYNTHETIC_MODEL,
    serial_imei: SYNTHETIC_SERIAL,
    problem_description: options.long ? LONG_SYNTHETIC_PROBLEM : SYNTHETIC_PROBLEM,
    diagnosis: "Synthetic local-only diagnosis for presentation verification.",
    estimated_cost: 1000,
    advance_paid: 250,
    final_cost: 1100,
    status: "in_progress",
    expected_delivery_at: expectedDeliveryAt,
    delivered_at: null,
    notes: "Synthetic local-only private note for presentation verification.",
    accessories_received: options.long ? LONG_SYNTHETIC_ACCESSORIES : SYNTHETIC_ACCESSORIES,
    payment_method: "cash",
    created_by: ownerId,
    created_at: createdAt,
    updated_at: createdAt,
  });
  expectNoQueryError(repairError, "repair fixture insert");

  const { error: historyError } = await admin.from("repair_status_history").insert({
    id: fixture.historyId,
    organization_id: LOCAL_QA_ORG_ID,
    repair_id: fixture.repairId,
    old_status: "received",
    new_status: "in_progress",
    note: "Synthetic local-only timeline entry for print verification.",
    changed_by: ownerId,
    created_at: createdAt,
  });
  expectNoQueryError(historyError, "repair history fixture insert");
}

async function fixtureRowsRemaining(admin: AdminClient, fixture: Fixture) {
  const [repairs, history] = await Promise.all([
    admin
      .from("repairs")
      .select("id")
      .eq("organization_id", LOCAL_QA_ORG_ID)
      .eq("id", fixture.repairId),
    admin
      .from("repair_status_history")
      .select("id")
      .eq("organization_id", LOCAL_QA_ORG_ID)
      .eq("id", fixture.historyId),
  ]);
  expectNoQueryError(repairs.error, "repair fixture verification");
  expectNoQueryError(history.error, "repair history fixture verification");
  return {
    repairs: repairs.data?.length ?? 0,
    repair_status_history: history.data?.length ?? 0,
  };
}

async function cleanupPass(admin: AdminClient, fixture: Fixture): Promise<string[]> {
  const errors: string[] = [];
  for (const [table, id] of [
    ["repair_status_history", fixture.historyId],
    ["repairs", fixture.repairId],
  ] as const) {
    const { error } = await admin
      .from(table)
      .delete()
      .eq("organization_id", LOCAL_QA_ORG_ID)
      .eq("id", id);
    if (error) errors.push(`${table}: ${error.message}`);
  }
  return errors;
}

async function cleanupWithRetry(admin: AdminClient, fixture: Fixture): Promise<void> {
  let errors = await cleanupPass(admin, fixture);
  if (errors.length > 0) errors = await cleanupPass(admin, fixture);
  expect(errors, "fixture cleanup errors after retry").toEqual([]);
  expect(await fixtureRowsRemaining(admin, fixture), "generated fixture rows remaining").toEqual({
    repairs: 0,
    repair_status_history: 0,
  });
}

function expectedLocalInstrumentation(message: ConsoleMessage): boolean {
  const text = message.text();
  const location = message.location().url;
  return (
    text.includes("/_vercel/insights/script.js") ||
    text.includes("/_vercel/speed-insights/script.js") ||
    location.includes("/_vercel/insights/script.js") ||
    location.includes("/_vercel/speed-insights/script.js") ||
    text.includes("Failed to load resource: net::ERR_ABORTED")
  );
}

function attachBrowserEvidence(page: Page): BrowserEvidence {
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
        version: "repairs-print-qa",
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
): Promise<void> {
  await page.setViewportSize(viewport);
  const response = await page.goto(`/repairs/${fixture.repairId}`, {
    waitUntil: "domcontentloaded",
  });
  expect(response?.status(), "Repair detail document request succeeds").toBeLessThan(400);
  await page.waitForLoadState("networkidle");

  for (const label of [
    "Back to Repairs",
    "Repair Job Number",
    "Device & Fault Log",
    "Device Details",
    "Serial / IMEI",
    "Problem Description",
    "Accessories Received",
    "Customer Details",
    "Financial Summary",
    "Estimated Cost:",
    "Advance Paid:",
    "Remaining Balance:",
    "Expected Delivery Date",
    "Job Timeline Logs",
  ]) {
    await expect(page.getByText(label, { exact: true }).first(), `${label}: screen`).toBeVisible();
  }
  await expect(page.getByText("In Progress", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(SYNTHETIC_DEVICE, { exact: false }).first()).toBeVisible();
  await expect(page.getByText(SYNTHETIC_SERIAL, { exact: true }).first()).toBeVisible();
  await expect(page.getByText(SYNTHETIC_PROBLEM, { exact: true }).first()).toBeVisible();
  await expect(page.getByText(SYNTHETIC_ACCESSORIES, { exact: true }).first()).toBeVisible();

  const a4Button = page.getByRole("button", { name: "Print A4", exact: true });
  const thermalButton = page.getByRole("button", { name: "Print 80mm", exact: true });
  const whatsapp = page.getByRole("link", { name: "Share WhatsApp", exact: true });
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
  expect(whatsappSafe).toEqual({
    isWhatsApp: true,
    target: "_blank",
    rel: "noopener noreferrer",
  });

  for (const locator of [
    page.getByText("Repair Job Number", { exact: true }).first(),
    page.getByText("Serial / IMEI", { exact: true }).first(),
    page.getByText("Problem Description", { exact: true }).first(),
    page.getByText("Accessories Received", { exact: true }).first(),
    page.getByText("Remaining Balance:", { exact: true }).first(),
  ]) {
    await expectNotClipped(locator, `screen label ${await locator.textContent()}`);
  }
  await expectNoHorizontalOverflow(page, `${viewport.width}x${viewport.height} Repair detail`);
  expect(await visibleFrameworkErrors(page)).toEqual([]);
  await page.screenshot({ path: screenshotPath, fullPage: true });
}

type PrintCall = {
  mode: string | null;
  repairsMarker: string | null;
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
  options: { holdCleanup?: boolean; holdImageDecode?: boolean } = {},
): Promise<void> {
  await page.evaluate(({ holdCleanup, holdImageDecode }) => {
    type ObservationState = typeof window & {
      __repairsPrintObservation?: PrintObservation;
      __repairsPrintObserver?: MutationObserver;
      __repairsOriginalPrint?: typeof window.print;
      __repairsOriginalSetTimeout?: typeof window.setTimeout;
      __repairsOriginalImageDecode?: typeof HTMLImageElement.prototype.decode;
      __repairsImageDecodeResolvers?: Array<() => void>;
    };
    const state = window as ObservationState;
    state.__repairsPrintObserver?.disconnect();
    state.__repairsOriginalPrint ??= window.print;
    state.__repairsPrintObservation = {
      calls: [],
      measurementSeen: false,
      maxStyleCount: 0,
      cleanupTimeoutsScheduled: 0,
    };
    const sample = () => {
      const evidence = state.__repairsPrintObservation!;
      if (document.querySelector('[data-repairs-thermal-measuring="true"]')) {
        evidence.measurementSeen = true;
      }
      evidence.maxStyleCount = Math.max(
        evidence.maxStyleCount,
        document.querySelectorAll("#repairs-thermal-page-size").length,
      );
    };
    state.__repairsPrintObserver = new MutationObserver(sample);
    state.__repairsPrintObserver.observe(document.documentElement, {
      attributes: true,
      childList: true,
      subtree: true,
      attributeFilter: [
        "data-repairs-thermal-measuring",
        "data-print-mode",
        "data-repairs-thermal-print",
      ],
    });
    sample();

    window.print = () => {
      sample();
      state.__repairsPrintObservation!.calls.push({
        mode: document.body.dataset.printMode ?? null,
        repairsMarker: document.body.dataset.repairsThermalPrint ?? null,
        measuringCount: document.querySelectorAll(
          '[data-repairs-thermal-measuring="true"]',
        ).length,
        styleCount: document.querySelectorAll("#repairs-thermal-page-size").length,
        styleText: document.getElementById("repairs-thermal-page-size")?.textContent ?? null,
        path: location.pathname,
      });
    };

    const original = window.setTimeout.bind(window);
    state.__repairsOriginalSetTimeout = window.setTimeout;
    window.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
      if (timeout === 1200) {
        state.__repairsPrintObservation!.cleanupTimeoutsScheduled += 1;
      }
      return original(handler, holdCleanup && timeout === 1200 ? 30_000 : timeout, ...args);
    }) as typeof window.setTimeout;

    if (holdImageDecode) {
      state.__repairsOriginalImageDecode = HTMLImageElement.prototype.decode;
      state.__repairsImageDecodeResolvers = [];
      HTMLImageElement.prototype.decode = function decodeWhenReleased() {
        return new Promise<void>((resolve) => {
          state.__repairsImageDecodeResolvers!.push(resolve);
        });
      };
    }
  }, options);
}

async function readPrintObservation(page: Page): Promise<PrintObservation> {
  return page.evaluate(() => {
    const state = window as typeof window & {
      __repairsPrintObservation?: PrintObservation;
    };
    return (
      state.__repairsPrintObservation ?? {
        calls: [],
        measurementSeen: false,
        maxStyleCount: 0,
        cleanupTimeoutsScheduled: 0,
      }
    );
  });
}

async function releaseHeldImageDecode(page: Page): Promise<void> {
  await page.evaluate(() => {
    const state = window as typeof window & {
      __repairsImageDecodeResolvers?: Array<() => void>;
    };
    const resolvers = state.__repairsImageDecodeResolvers ?? [];
    state.__repairsImageDecodeResolvers = [];
    resolvers.forEach((resolve) => resolve());
  });
}

async function advanceAnimationFrames(page: Page, frameCount = 6): Promise<void> {
  await page.evaluate(
    (count) =>
      new Promise<void>((resolve) => {
        let remaining = count;
        const advance = () => {
          remaining -= 1;
          if (remaining === 0) resolve();
          else requestAnimationFrame(advance);
        };
        requestAnimationFrame(advance);
      }),
    frameCount,
  );
}

async function restorePrintObservation(page: Page): Promise<void> {
  await page.evaluate(() => {
    type ObservationState = typeof window & {
      __repairsPrintObserver?: MutationObserver;
      __repairsOriginalPrint?: typeof window.print;
      __repairsOriginalSetTimeout?: typeof window.setTimeout;
      __repairsOriginalImageDecode?: typeof HTMLImageElement.prototype.decode;
      __repairsImageDecodeResolvers?: Array<() => void>;
    };
    const state = window as ObservationState;
    state.__repairsPrintObserver?.disconnect();
    if (state.__repairsOriginalPrint) {
      window.print = state.__repairsOriginalPrint;
      delete state.__repairsOriginalPrint;
    }
    if (state.__repairsOriginalSetTimeout) {
      window.setTimeout = state.__repairsOriginalSetTimeout;
      delete state.__repairsOriginalSetTimeout;
    }
    if (state.__repairsOriginalImageDecode) {
      HTMLImageElement.prototype.decode = state.__repairsOriginalImageDecode;
      delete state.__repairsOriginalImageDecode;
    }
    delete state.__repairsImageDecodeResolvers;
  });
}

async function expectPrintStateClean(page: Page, label: string): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(() => ({
          mode: document.body.dataset.printMode ?? null,
          repairsMarker: document.body.dataset.repairsThermalPrint ?? null,
          measuringCount: document.querySelectorAll(
            '[data-repairs-thermal-measuring="true"]',
          ).length,
          styleCount: document.querySelectorAll("#repairs-thermal-page-size").length,
        })),
      { message: `${label}: print state cleanup`, timeout: 4_000 },
    )
    .toEqual({ mode: null, repairsMarker: null, measuringCount: 0, styleCount: 0 });
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

function measurePdf(path: string): PdfMeasurement {
  const script = String.raw`
import json, logging, re, sys
logging.getLogger("pdfminer").setLevel(logging.ERROR)
import pdfplumber

labels = ["repairjob", "status", "estimate", "advance", "balance", "payment"]
required_text = ["repairreceipt", "problem", "accessories", "terms", "poweredbysaledockcloudpos"]
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
    all_text = re.sub(r"[^a-z]", "", " ".join(item["text"] for item in words).lower())
    print(json.dumps({
        "pageCount": len(pdf.pages),
        "pageWidth": round(page.width, 2),
        "pageHeight": round(page.height, 2),
        "overallLeft": round(left, 2),
        "overallRight": round(right, 2),
        "overallSpanPercent": round((right - left) / page.width * 100, 1),
        "leftWhitespace": round(left, 2),
        "rightWhitespace": round(page.width - right, 2),
        "rows": rows,
        "textLabels": [label for label in required_text if label in all_text],
    }, sort_keys=True))
`;
  return JSON.parse(
    execFileSync("python3", ["-c", script, path], { encoding: "utf8" }),
  ) as PdfMeasurement;
}

function normalizedPdfText(path: string): string {
  const script = String.raw`
import logging, re, sys
logging.getLogger("pdfminer").setLevel(logging.ERROR)
import pdfplumber

with pdfplumber.open(sys.argv[1]) as pdf:
    text = " ".join(page.extract_text() or "" for page in pdf.pages).lower()
    print(re.sub(r"[^a-z]", "", text))
`;
  return execFileSync("python3", ["-c", script, path], { encoding: "utf8" }).trim();
}

function pdfPageTextLengths(path: string): number[] {
  const script = String.raw`
import json, logging, sys
logging.getLogger("pdfminer").setLevel(logging.ERROR)
import pdfplumber

with pdfplumber.open(sys.argv[1]) as pdf:
    print(json.dumps([len(page.extract_text() or "") for page in pdf.pages]))
`;
  return JSON.parse(
    execFileSync("python3", ["-c", script, path], { encoding: "utf8" }),
  ) as number[];
}

function renderPdfFirstPage(path: string, outputPath: string): void {
  const prefix = outputPath.replace(/\.png$/i, "");
  execFileSync("pdftoppm", ["-png", "-singlefile", "-r", "150", path, prefix], {
    stdio: ["ignore", "ignore", "pipe"],
  });
  expect(existsSync(outputPath), `${outputPath}: rendered PDF image`).toBe(true);
}

function renderPdfPage(path: string, outputPath: string, pageNumber: number): void {
  const prefix = outputPath.replace(/\.png$/i, "");
  execFileSync(
    "pdftoppm",
    ["-png", "-f", String(pageNumber), "-l", String(pageNumber), "-singlefile", "-r", "150", path, prefix],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  expect(existsSync(outputPath), `${outputPath}: rendered PDF page`).toBe(true);
}

async function setPrintMode(page: Page, mode: "a4" | "thermal"): Promise<void> {
  await page.evaluate((value) => {
    document.body.dataset.printMode = value;
  }, mode);
  await page.emulateMedia({ media: "print" });
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

async function clearPrintMode(page: Page): Promise<void> {
  await page.emulateMedia({ media: "screen" });
  await page.evaluate(() => {
    delete document.body.dataset.printMode;
    delete document.body.dataset.repairsThermalPrint;
    document
      .querySelectorAll<HTMLElement>('[data-repairs-thermal-measuring="true"]')
      .forEach((element) => delete element.dataset.repairsThermalMeasuring);
    document.getElementById("repairs-thermal-page-size")?.remove();
  });
}

test.describe("Repairs print artifact verification", () => {
  test.skip(!isLocalPlaywrightRun(), "Repairs print QA is local-only.");
  test.setTimeout(240_000);

  test("verifies fixed screen, A4, standard thermal, and print lifecycle", async ({ page }) => {
    mkdirSync(ARTIFACT_DIR, { recursive: true });
    for (const path of [
      MOBILE_SCREENSHOT,
      DESKTOP_SCREENSHOT,
      A4_SCREENSHOT,
      A4_PDF,
      A4_RENDER,
      A4_FINAL_RENDER,
      THERMAL_STANDARD_SCREENSHOT,
      THERMAL_STANDARD_PDF,
      THERMAL_STANDARD_RENDER,
    ]) {
      rmSync(path, { force: true });
    }

    const admin = getLocalAdminClient();
    const fixture = makeFixture();
    const beforeSafety = await captureSafetySnapshot(admin);
    const evidence = attachBrowserEvidence(page);
    let fixtureCreated = false;

    try {
      await createFixture(admin, fixture);
      fixtureCreated = true;
      await installRejectedConsent(page);
      await loginLocalOwnerDirectly(page);
      guardBrowserWrites(page, evidence);

      await verifyScreen(page, fixture, { width: 390, height: 844 }, MOBILE_SCREENSHOT);
      await verifyScreen(page, fixture, { width: 1440, height: 900 }, DESKTOP_SCREENSHOT);

      await installPrintObservation(page, { holdCleanup: true });
      const routePath = new URL(page.url()).pathname;
      await page.getByRole("button", { name: "Print A4", exact: true }).click();
      await expect.poll(async () => (await readPrintObservation(page)).calls.length).toBe(1);
      const a4Control = await readPrintObservation(page);
      expect(a4Control.calls).toEqual([
        {
          mode: "a4",
          repairsMarker: null,
          measuringCount: 0,
          styleCount: 0,
          styleText: null,
          path: routePath,
        },
      ]);
      await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
      await expectPrintStateClean(page, "A4 afterprint");
      await restorePrintObservation(page);

      await setPrintMode(page, "a4");
      const a4 = page.locator(".repair-a4-print");
      const thermal = page.locator(".thermal-print");
      await expect(a4).toBeVisible();
      await expect(thermal).toBeHidden();
      for (const label of [
        "REPAIR RECEIPT",
        "Customer Info",
        "Device info",
        "Problem Description",
        "Accessories Received",
        "Intake Terms & Conditions",
        "Estimated Cost:",
        "Final Cost:",
        "Advance Paid:",
        "Balance Due:",
        "Customer Signature",
        "Authorized Signature",
      ]) {
        await expect(a4.getByText(label, { exact: true }).first(), `${label}: A4`).toBeVisible();
      }
      const a4Footer = a4.locator(":scope > div").last();
      await expect(a4Footer, "A4 footer in print DOM").toBeVisible();
      expect((await a4Footer.innerText()).trim().length, "A4 footer text in print DOM").toBeGreaterThan(
        0,
      );
      await expect(page.getByRole("button", { name: "Print A4", exact: true })).toBeHidden();
      await expect(page.locator("aside:visible, nav:visible, header:visible")).toHaveCount(0);
      await expect(page.getByText(/privacy|cookie/i).filter({ visible: true })).toHaveCount(0);
      await a4.screenshot({ path: A4_SCREENSHOT });
      const a4Pdf = await page.pdf({
        path: A4_PDF,
        format: "A4",
        printBackground: true,
        scale: 1,
        margin: { top: "10mm", right: "10mm", bottom: "10mm", left: "10mm" },
      });
      expect(a4Pdf.subarray(0, 4).toString("ascii"), "A4 PDF signature").toBe("%PDF");
      expect(a4Pdf.length, "A4 PDF size").toBeGreaterThan(10_000);
      const a4PageCount = chromiumPdfPageCount(a4Pdf);
      expect(a4PageCount, "A4 page count").toBeGreaterThanOrEqual(1);
      expect(a4PageCount, "A4 page count").toBeLessThanOrEqual(2);
      renderPdfFirstPage(A4_PDF, A4_RENDER);
      renderPdfPage(A4_PDF, A4_FINAL_RENDER, a4PageCount);
      expect(pdfplumberAvailable(), "pdfplumber is required for physical acceptance").toBe(true);
      const a4Measurement = measurePdf(A4_PDF);
      expect(a4Measurement.pageCount).toBe(a4PageCount);
      expect(a4Measurement.pageWidth).toBeGreaterThanOrEqual(594);
      expect(a4Measurement.pageWidth).toBeLessThanOrEqual(597);
      expect(a4Measurement.pageHeight).toBeGreaterThanOrEqual(841);
      expect(a4Measurement.pageHeight).toBeLessThanOrEqual(844);
      expect(normalizedPdfText(A4_PDF), "A4 footer survives physical PDF pagination").toContain(
        "thankyou",
      );
      expect(pdfPageTextLengths(A4_PDF).every((length) => length > 20), "no blank A4 page").toBe(
        true,
      );
      await clearPrintMode(page);

      await installPrintObservation(page, { holdCleanup: true });
      const thermalButton = page.getByRole("button", { name: "Print 80mm", exact: true });
      await thermalButton.click();
      await thermalButton.click();
      await expect.poll(async () => (await readPrintObservation(page)).calls.length).toBe(1);
      const thermalControl = await readPrintObservation(page);
      expect(thermalControl.measurementSeen).toBe(true);
      expect(thermalControl.maxStyleCount).toBe(1);
      expect(thermalControl.cleanupTimeoutsScheduled).toBe(1);
      const thermalCall = thermalControl.calls[0];
      expect(thermalCall.mode).toBe("thermal");
      expect(thermalCall.repairsMarker).toBe("true");
      expect(thermalCall.measuringCount).toBe(0);
      expect(thermalCall.styleCount).toBe(1);
      expect(thermalCall.styleText).toMatch(
        /^@page repairsThermalReceipt \{ size: 80mm \d+(?:\.\d)?mm; margin: 4mm; \}$/,
      );

      await page.emulateMedia({ media: "print" });
      await expect(a4).toBeHidden();
      await expect(thermal).toBeVisible();
      for (const label of [
        "Repair job",
        "Status",
        "Intake",
        "Customer",
        "Device:",
        "Serial/IMEI:",
        "Problem:",
        "Accessories:",
        "Expected:",
        "Estimate",
        "Final cost",
        "Advance",
        "Balance",
        "Payment",
        "Terms",
        "Powered by SaleDock Cloud POS",
      ]) {
        await expect(thermal.getByText(label, { exact: true }).first(), `${label}: thermal`).toBeVisible();
      }
      await expect(page.locator("aside:visible, nav:visible")).toHaveCount(0);
      await thermal.screenshot({ path: THERMAL_STANDARD_SCREENSHOT });
      const thermalPdf = await page.pdf({
        path: THERMAL_STANDARD_PDF,
        preferCSSPageSize: true,
        printBackground: true,
        scale: 1,
      });
      expect(thermalPdf.subarray(0, 4).toString("ascii"), "80mm PDF signature").toBe("%PDF");
      expect(thermalPdf.length, "80mm PDF size").toBeGreaterThan(5_000);
      renderPdfFirstPage(THERMAL_STANDARD_PDF, THERMAL_STANDARD_RENDER);
      const thermalMeasurement = measurePdf(THERMAL_STANDARD_PDF);
      expect(thermalMeasurement.pageWidth, "80mm physical page width").toBeGreaterThanOrEqual(224);
      expect(thermalMeasurement.pageWidth, "80mm physical page width").toBeLessThanOrEqual(230);
      expect(thermalMeasurement.pageCount, "80mm page count").toBe(1);
      expect(Object.keys(thermalMeasurement.rows).sort(), "thermal structural rows").toEqual(
        ["advance", "balance", "estimate", "payment", "repairjob", "status"],
      );
      expect(thermalMeasurement.textLabels.sort(), "thermal required text extraction").toEqual(
        ["accessories", "poweredbysaledockcloudpos", "problem", "terms"].sort(),
      );
      expect(thermalMeasurement.overallLeft, "thermal left text boundary").toBeGreaterThanOrEqual(0);
      expect(thermalMeasurement.overallRight, "thermal right text boundary").toBeLessThanOrEqual(
        thermalMeasurement.pageWidth - 10,
      );
      expect(thermalMeasurement.overallLeft, "thermal left text boundary").toBeGreaterThanOrEqual(10);
      expect(thermalMeasurement.overallSpanPercent, "thermal physical content span").toBeGreaterThanOrEqual(
        70,
      );
      expect(
        Math.abs(thermalMeasurement.leftWhitespace - thermalMeasurement.rightWhitespace),
        "thermal whitespace balance",
      ).toBeLessThanOrEqual(12);
      for (const row of Object.values(thermalMeasurement.rows)) {
        expect(row.spanPercent, "thermal structural row span").toBeGreaterThanOrEqual(70);
      }

      await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
      await page.emulateMedia({ media: "screen" });
      await expectPrintStateClean(page, "standard thermal afterprint");
      await restorePrintObservation(page);

      await installPrintObservation(page);
      await thermalButton.click();
      await expect.poll(async () => (await readPrintObservation(page)).calls.length).toBe(1);
      await expectPrintStateClean(page, "thermal timeout fallback");
      expect((await readPrintObservation(page)).cleanupTimeoutsScheduled).toBe(1);
      await restorePrintObservation(page);

      await thermal.evaluate((element) => element.remove());
      await installPrintObservation(page);
      await thermalButton.click();
      await expect(page.locator('p[role="alert"]')).toHaveText(
        "Unable to prepare the thermal repair receipt. Please try again.",
      );
      const missingReceipt = await readPrintObservation(page);
      expect(missingReceipt.calls).toEqual([]);
      expect(missingReceipt.cleanupTimeoutsScheduled).toBe(0);
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
    } finally {
      await clearPrintMode(page).catch(() => undefined);
      if (fixtureCreated) await cleanupWithRetry(admin, fixture);
      expect(await captureSafetySnapshot(admin), "unrelated safety signatures after cleanup").toEqual(
        beforeSafety,
      );
    }
  });

  test("verifies a longer repair produces a taller one-page thermal artifact", async ({ page }) => {
    mkdirSync(ARTIFACT_DIR, { recursive: true });
    rmSync(THERMAL_LONG_PDF, { force: true });
    rmSync(THERMAL_LONG_RENDER, { force: true });
    const admin = getLocalAdminClient();
    const fixture = makeFixture();
    const beforeSafety = await captureSafetySnapshot(admin);
    const evidence = attachBrowserEvidence(page);
    let fixtureCreated = false;

    try {
      await createFixture(admin, fixture, { long: true });
      fixtureCreated = true;
      await installRejectedConsent(page);
      await loginLocalOwnerDirectly(page);
      guardBrowserWrites(page, evidence);
      await page.goto(`/repairs/${fixture.repairId}`, { waitUntil: "networkidle" });
      await installPrintObservation(page, { holdCleanup: true });
      await page.getByRole("button", { name: "Print 80mm", exact: true }).click();
      await expect.poll(async () => (await readPrintObservation(page)).calls.length).toBe(1);
      await page.emulateMedia({ media: "print" });
      const pdf = await page.pdf({
        path: THERMAL_LONG_PDF,
        preferCSSPageSize: true,
        printBackground: true,
        scale: 1,
      });
      expect(pdf.subarray(0, 4).toString("ascii")).toBe("%PDF");
      renderPdfFirstPage(THERMAL_LONG_PDF, THERMAL_LONG_RENDER);
      const standard = measurePdf(THERMAL_STANDARD_PDF);
      const measurement = measurePdf(THERMAL_LONG_PDF);
      expect(measurement.pageWidth).toBeGreaterThanOrEqual(224);
      expect(measurement.pageWidth).toBeLessThanOrEqual(230);
      expect(measurement.pageHeight).toBeGreaterThan(standard.pageHeight);
      expect(measurement.pageCount).toBe(1);
      expect(measurement.overallSpanPercent).toBeGreaterThanOrEqual(70);
      expect(Math.abs(measurement.leftWhitespace - measurement.rightWhitespace)).toBeLessThanOrEqual(
        12,
      );
      expect(normalizedPdfText(THERMAL_LONG_PDF)).toContain("terms");
      expect(normalizedPdfText(THERMAL_LONG_PDF)).toContain("poweredbysaledockcloudpos");
      await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
      await page.emulateMedia({ media: "screen" });
      await expectPrintStateClean(page, "long thermal afterprint");
      await restorePrintObservation(page);
      expect(await visibleFrameworkErrors(page)).toEqual([]);
      expect(evidence).toEqual({
        pageErrors: 0,
        consoleErrors: 0,
        requestFailures: [],
        dialogs: [],
        writes: [],
      });
    } finally {
      await clearPrintMode(page).catch(() => undefined);
      if (fixtureCreated) await cleanupWithRetry(admin, fixture);
      expect(await captureSafetySnapshot(admin)).toEqual(beforeSafety);
    }
  });

  test("cancels held thermal preparation without stale state or false alert", async ({ page }) => {
    const admin = getLocalAdminClient();
    const fixture = makeFixture();
    const beforeSafety = await captureSafetySnapshot(admin);
    const evidence = attachBrowserEvidence(page);
    let fixtureCreated = false;

    try {
      await createFixture(admin, fixture);
      fixtureCreated = true;
      await installRejectedConsent(page);
      await loginLocalOwnerDirectly(page);
      guardBrowserWrites(page, evidence);
      await page.goto(`/repairs/${fixture.repairId}`, { waitUntil: "networkidle" });
      await installPrintObservation(page, { holdImageDecode: true });
      await page.getByRole("button", { name: "Print 80mm", exact: true }).click();
      await expect
        .poll(() => page.locator('[data-repairs-thermal-measuring="true"]').count())
        .toBe(1);
      await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
      await expectPrintStateClean(page, "held readiness cancellation");
      await releaseHeldImageDecode(page);
      await advanceAnimationFrames(page);
      await page.waitForTimeout(1400);
      const observation = await readPrintObservation(page);
      expect(observation.calls).toEqual([]);
      expect(observation.cleanupTimeoutsScheduled).toBe(0);
      await expect(page.locator('p[role="alert"]')).toHaveCount(0);
      await expectPrintStateClean(page, "held readiness settled");
      await restorePrintObservation(page);
      expect(await visibleFrameworkErrors(page)).toEqual([]);
      expect(evidence).toEqual({
        pageErrors: 0,
        consoleErrors: 0,
        requestFailures: [],
        dialogs: [],
        writes: [],
      });
    } finally {
      await releaseHeldImageDecode(page).catch(() => undefined);
      await restorePrintObservation(page).catch(() => undefined);
      await clearPrintMode(page).catch(() => undefined);
      if (fixtureCreated) await cleanupWithRetry(admin, fixture);
      expect(await captureSafetySnapshot(admin)).toEqual(beforeSafety);
    }
  });

  test("cancels thermal preparation when print controls unmount", async ({ page }) => {
    const admin = getLocalAdminClient();
    const fixture = makeFixture();
    const beforeSafety = await captureSafetySnapshot(admin);
    const evidence = attachBrowserEvidence(page);
    let fixtureCreated = false;

    try {
      await createFixture(admin, fixture);
      fixtureCreated = true;
      await installRejectedConsent(page);
      await loginLocalOwnerDirectly(page);
      guardBrowserWrites(page, evidence);
      await page.goto(`/repairs/${fixture.repairId}`, { waitUntil: "networkidle" });
      await installPrintObservation(page, { holdImageDecode: true });
      await page.getByRole("button", { name: "Print 80mm", exact: true }).click();
      await expect
        .poll(() => page.locator('[data-repairs-thermal-measuring="true"]').count())
        .toBe(1);
      await page.getByRole("link", { name: /Back to Repairs/i }).click();
      await expect(page).toHaveURL(/\/repairs$/);
      await releaseHeldImageDecode(page);
      await advanceAnimationFrames(page);
      await page.waitForTimeout(1400);
      const observation = await readPrintObservation(page);
      expect(observation.calls).toEqual([]);
      expect(observation.cleanupTimeoutsScheduled).toBe(0);
      await expect(page.locator('p[role="alert"]')).toHaveCount(0);
      await expectPrintStateClean(page, "client-navigation unmount");
      await restorePrintObservation(page);
      expect(await visibleFrameworkErrors(page)).toEqual([]);
      expect(evidence).toEqual({
        pageErrors: 0,
        consoleErrors: 0,
        requestFailures: [],
        dialogs: [],
        writes: [],
      });
    } finally {
      await releaseHeldImageDecode(page).catch(() => undefined);
      await restorePrintObservation(page).catch(() => undefined);
      await clearPrintMode(page).catch(() => undefined);
      if (fixtureCreated) await cleanupWithRetry(admin, fixture);
      expect(await captureSafetySnapshot(admin)).toEqual(beforeSafety);
    }
  });
});
