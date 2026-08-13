import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  expect,
  test,
  type ConsoleMessage,
  type Locator,
  type Page,
} from "@playwright/test";
import {
  getLocalAdminClient,
  getLocalAuthConfig,
  isLocalPlaywrightRun,
  LOCAL_QA_ORG_ID,
  loginLocalOwnerDirectly,
} from "./helpers/local-supabase";

const LOCAL_QA_BRANCH_ID = "00000000-0000-4000-8000-000000000101";
const FROZEN_BASELINE_PATH =
  "/Users/sw12/Projects/saledock-local-evidence/invoice-thermal-blank-page-fix";
const FROZEN_BASELINE_MANIFEST =
  "c9cccc84261dba8e52cc508fb4c2b85899ad5ebad551d636f824ec31d8fa7723";
const explicitEvidenceRoot = process.env.INVOICE_THERMAL_EVIDENCE_ROOT?.trim();
const EVIDENCE_ROOT = explicitEvidenceRoot
  ? explicitEvidenceRoot
  : join(
      tmpdir(),
      `saledock-invoice-thermal-reliability-${randomUUID().slice(0, 8)}`,
    );
const SCREENSHOTS = join(EVIDENCE_ROOT, "screenshots");

const STANDARD_PDF = join(EVIDENCE_ROOT, "standard-thermal.pdf");
const STANDARD_RENDER = join(EVIDENCE_ROOT, "standard-thermal-render.png");
const LONG_PDF = join(EVIDENCE_ROOT, "long-thermal.pdf");
const LONG_RENDER = join(EVIDENCE_ROOT, "long-thermal-render.png");
const A4_PDF = join(EVIDENCE_ROOT, "a4.pdf");
const A4_RENDER = join(EVIDENCE_ROOT, "a4-render.png");

const STANDARD_ITEM = "Synthetic Invoice Thermal Service";
const WRAPPED_ITEM =
  "Synthetic Extended Invoice Thermal Reliability Product Name With Complete Narrow Width Wrapping";
const STANDARD_NOTE = "Synthetic local invoice thermal verification note.";
const LONG_NOTE = Array.from(
  { length: 8 },
  () => "Synthetic long receipt note remains complete and safely wrapped.",
).join(" ");

type AdminClient = ReturnType<typeof getLocalAdminClient>;

type Fixture = {
  invoiceId: string;
  invoiceNo: string;
  paymentId: string;
  itemIds: string[];
};

type SafetySnapshot = {
  productQuantities: string;
  lotQuantities: string;
  stockMovements: string;
  invoiceCount: string;
  invoiceItemCount: string;
  paymentCount: string;
  customerBalances: string;
  customerLedger: string;
  supplierBalances: string;
  supplierPayments: string;
  expenses: string;
  cashShifts: string;
  auditLogs: string;
};

type PrintCall = {
  mode: string | null;
  invoiceMarker: string | null;
  measuringCount: number;
  styleCount: number;
  styleText: string | null;
};

type PrintObservation = {
  calls: PrintCall[];
  measurementSeen: boolean;
  maxStyleCount: number;
};

type PdfMeasurement = {
  pageCount: number;
  pageWidth: number;
  pageHeight: number;
  text: string;
  overallLeft: number;
  overallRight: number;
  leftWhitespace: number;
  rightWhitespace: number;
};

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function writeJson(name: string, value: unknown): void {
  writeFileSync(
    join(EVIDENCE_ROOT, name),
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );
}

function prepareEvidenceRoot(): void {
  if (existsSync(EVIDENCE_ROOT)) {
    throw new Error(
      `INVOICE_THERMAL_EVIDENCE_ROOT already exists; refusing any Supabase or evidence work: ${EVIDENCE_ROOT}`,
    );
  }
  mkdirSync(EVIDENCE_ROOT);
  mkdirSync(SCREENSHOTS);
}

function makeFixture(): Fixture {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
  return {
    invoiceId: randomUUID(),
    invoiceNo: `QA-THERMAL-INV-${suffix}`,
    paymentId: randomUUID(),
    itemIds: Array.from({ length: 20 }, () => randomUUID()),
  };
}

function expectNoQueryError(
  error: { message: string } | null,
  label: string,
): void {
  if (error) throw new Error(`${label} failed: ${error.message}`);
}

async function captureSafetySnapshot(
  admin: AdminClient,
): Promise<SafetySnapshot> {
  const results = await Promise.all([
    admin
      .from("products")
      .select("id, stock_quantity")
      .eq("organization_id", LOCAL_QA_ORG_ID)
      .order("id"),
    admin
      .from("product_stock_lots")
      .select("id, quantity_remaining, unit_cost")
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
      .from("invoice_items")
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
      .from("suppliers")
      .select("id, outstanding_balance")
      .eq("organization_id", LOCAL_QA_ORG_ID)
      .order("id"),
    admin
      .from("supplier_payments")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", LOCAL_QA_ORG_ID),
    admin
      .from("expenses")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", LOCAL_QA_ORG_ID),
    admin
      .from("cash_shifts")
      .select(
        "id, status, starting_cash, expected_cash, counted_cash, cash_difference",
      )
      .eq("organization_id", LOCAL_QA_ORG_ID)
      .order("id"),
    admin
      .from("audit_logs")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", LOCAL_QA_ORG_ID),
  ]);
  results.forEach((result, index) =>
    expectNoQueryError(result.error, `safety snapshot ${index + 1}`),
  );
  const [
    products,
    lots,
    movements,
    invoices,
    items,
    payments,
    customers,
    ledger,
    suppliers,
    supplierPayments,
    expenses,
    shifts,
    audits,
  ] = results;
  return {
    productQuantities: digest(products.data ?? []),
    lotQuantities: digest(lots.data ?? []),
    stockMovements: digest(movements.count ?? 0),
    invoiceCount: digest(invoices.count ?? 0),
    invoiceItemCount: digest(items.count ?? 0),
    paymentCount: digest(payments.count ?? 0),
    customerBalances: digest(customers.data ?? []),
    customerLedger: digest(ledger.count ?? 0),
    supplierBalances: digest(suppliers.data ?? []),
    supplierPayments: digest(supplierPayments.count ?? 0),
    expenses: digest(expenses.count ?? 0),
    cashShifts: digest(shifts.data ?? []),
    auditLogs: digest(audits.count ?? 0),
  };
}

async function ownerId(admin: AdminClient): Promise<string> {
  const { data, error } = await admin
    .from("profiles")
    .select("id")
    .eq("organization_id", LOCAL_QA_ORG_ID)
    .eq("role", "owner")
    .eq("is_active", true)
    .limit(1);
  expectNoQueryError(error, "owner lookup");
  if (!data?.[0]?.id) throw new Error("Local owner profile is unavailable.");
  return data[0].id as string;
}

async function createStandardFixture(
  admin: AdminClient,
  fixture: Fixture,
): Promise<void> {
  const createdBy = await ownerId(admin);
  const createdAt = new Date().toISOString();
  const { error: invoiceError } = await admin.from("invoices").insert({
    id: fixture.invoiceId,
    organization_id: LOCAL_QA_ORG_ID,
    branch_id: LOCAL_QA_BRANCH_ID,
    customer_id: null,
    invoice_no: fixture.invoiceNo,
    status: "paid",
    subtotal: 150,
    discount_total: 0,
    customer_credit_applied: 0,
    grand_total: 150,
    amount_paid: 150,
    balance_due: 0,
    amount_tendered: 150,
    change_due: 0,
    note: STANDARD_NOTE,
    created_by: createdBy,
    invoice_date: createdAt,
    created_at: createdAt,
  });
  expectNoQueryError(invoiceError, "invoice fixture insert");

  const { error: itemError } = await admin.from("invoice_items").insert({
    id: fixture.itemIds[0],
    organization_id: LOCAL_QA_ORG_ID,
    invoice_id: fixture.invoiceId,
    product_id: null,
    product_name: STANDARD_ITEM,
    product_type: "service",
    quantity: 1,
    purchase_price: 0,
    unit_price: 150,
    item_discount: 0,
    line_total: 150,
    service_total_charged: 150,
    created_at: createdAt,
  });
  expectNoQueryError(itemError, "invoice item fixture insert");

  const { error: paymentError } = await admin.from("payments").insert({
    id: fixture.paymentId,
    organization_id: LOCAL_QA_ORG_ID,
    branch_id: LOCAL_QA_BRANCH_ID,
    invoice_id: fixture.invoiceId,
    customer_id: null,
    method: "card",
    amount: 150,
    reference_no: `QA-${fixture.invoiceNo}`,
    received_by: createdBy,
    paid_at: createdAt,
  });
  expectNoQueryError(paymentError, "payment fixture insert");
}

async function expandLongFixture(
  admin: AdminClient,
  fixture: Fixture,
): Promise<void> {
  const createdAt = new Date().toISOString();
  const extraItems = fixture.itemIds.slice(1).map((id, index) => ({
    id,
    organization_id: LOCAL_QA_ORG_ID,
    invoice_id: fixture.invoiceId,
    product_id: null,
    product_name: `${WRAPPED_ITEM} ${String(index + 1).padStart(2, "0")}`,
    product_type: "service",
    quantity: 1,
    purchase_price: 0,
    unit_price: 10,
    item_discount: 0,
    line_total: 10,
    service_total_charged: 10,
    created_at: new Date(new Date(createdAt).getTime() + index).toISOString(),
  }));
  const { error: itemError } = await admin
    .from("invoice_items")
    .insert(extraItems);
  expectNoQueryError(itemError, "long invoice items insert");
  const { error: updateError } = await admin
    .from("invoices")
    .update({
      subtotal: 340,
      grand_total: 340,
      amount_paid: 340,
      amount_tendered: 340,
      note: LONG_NOTE,
    })
    .eq("organization_id", LOCAL_QA_ORG_ID)
    .eq("id", fixture.invoiceId);
  expectNoQueryError(updateError, "long invoice update");
  const { error: paymentError } = await admin
    .from("payments")
    .update({ amount: 340 })
    .eq("organization_id", LOCAL_QA_ORG_ID)
    .eq("id", fixture.paymentId);
  expectNoQueryError(paymentError, "long payment update");
}

async function fixtureCounts(admin: AdminClient, fixture: Fixture) {
  const [invoice, items, payment] = await Promise.all([
    admin
      .from("invoices")
      .select("id")
      .eq("organization_id", LOCAL_QA_ORG_ID)
      .eq("id", fixture.invoiceId),
    admin
      .from("invoice_items")
      .select("id")
      .eq("organization_id", LOCAL_QA_ORG_ID)
      .eq("invoice_id", fixture.invoiceId),
    admin
      .from("payments")
      .select("id")
      .eq("organization_id", LOCAL_QA_ORG_ID)
      .eq("invoice_id", fixture.invoiceId),
  ]);
  expectNoQueryError(invoice.error, "fixture invoice count");
  expectNoQueryError(items.error, "fixture item count");
  expectNoQueryError(payment.error, "fixture payment count");
  return {
    invoices: invoice.data?.length ?? 0,
    invoiceItems: items.data?.length ?? 0,
    payments: payment.data?.length ?? 0,
  };
}

async function cleanupFixture(
  admin: AdminClient,
  fixture: Fixture,
): Promise<number> {
  let retries = 0;
  const cleanup = async () => {
    const errors: string[] = [];
    for (const [table, column] of [
      ["payments", "invoice_id"],
      ["invoice_items", "invoice_id"],
      ["invoices", "id"],
    ] as const) {
      const { error } = await admin
        .from(table)
        .delete()
        .eq("organization_id", LOCAL_QA_ORG_ID)
        .eq(column, fixture.invoiceId);
      if (error) errors.push(`${table}: ${error.message}`);
    }
    return errors;
  };
  let errors = await cleanup();
  if (errors.length > 0) {
    retries += 1;
    errors = await cleanup();
  }
  expect(errors, "fixture cleanup errors").toEqual([]);
  expect(await fixtureCounts(admin, fixture)).toEqual({
    invoices: 0,
    invoiceItems: 0,
    payments: 0,
  });
  return retries;
}

function expectedInstrumentation(message: ConsoleMessage): boolean {
  const source = `${message.text()} ${message.location().url}`;
  return (
    /\/_vercel\/(?:insights|speed-insights)\/script\.js/i.test(source) ||
    /Failed to load resource: the server responded with a status of 406 \(Not Acceptable\)/i.test(
      message.text(),
    )
  );
}

function observeBrowser(page: Page) {
  const result = {
    pageErrors: [] as string[],
    consoleErrors: [] as string[],
    requestFailures: [] as string[],
    writes: [] as string[],
    expectedPreferences406: 0,
    unexpectedHttpErrors: [] as string[],
  };
  page.on("pageerror", (error) => result.pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !expectedInstrumentation(message))
      result.consoleErrors.push(message.text());
  });
  page.on("requestfailed", (request) => {
    const url = new URL(request.url());
    const expectedPrefetchAbort =
      request.method() === "GET" &&
      request.failure()?.errorText === "net::ERR_ABORTED";
    if (!url.pathname.startsWith("/_vercel/") && !expectedPrefetchAbort) {
      result.requestFailures.push(
        `${request.method()} ${url.pathname} ${request.failure()?.errorText ?? "unknown"}`,
      );
    }
  });
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      !["GET", "HEAD", "OPTIONS"].includes(request.method()) &&
      !url.pathname.startsWith("/_vercel/")
    ) {
      result.writes.push(`${request.method()} ${url.pathname}`);
    }
  });
  page.on("response", (response) => {
    if (response.status() < 400) return;
    const url = new URL(response.url());
    if (
      response.status() === 406 &&
      url.pathname === "/rest/v1/user_ui_preferences"
    ) {
      result.expectedPreferences406 += 1;
    } else if (!url.pathname.startsWith("/_vercel/")) {
      result.unexpectedHttpErrors.push(`${response.status()} ${url.pathname}`);
    }
  });
  return result;
}

async function dismissCookieBanner(page: Page): Promise<void> {
  const reject = page.getByRole("button", { name: /reject optional cookies/i });
  if (await reject.isVisible({ timeout: 3000 }).catch(() => false))
    await reject.click();
}

async function expectNotClipped(
  locator: Locator,
  label: string,
): Promise<void> {
  const metrics = await locator.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  expect(
    metrics.scrollWidth,
    `${label}: horizontal clipping`,
  ).toBeLessThanOrEqual(metrics.clientWidth + 1);
  expect(
    metrics.scrollHeight,
    `${label}: vertical clipping`,
  ).toBeLessThanOrEqual(metrics.clientHeight + 1);
}

async function expectNoScreenOverflow(
  page: Page,
  label: string,
): Promise<void> {
  const overflow = await page.evaluate(() => ({
    body: document.body.scrollWidth - document.body.clientWidth,
    html:
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  }));
  expect(overflow.body, `${label}: body overflow`).toBeLessThanOrEqual(1);
  expect(overflow.html, `${label}: html overflow`).toBeLessThanOrEqual(1);
}

async function verifyScreen(
  page: Page,
  fixture: Fixture,
  viewport: { width: number; height: number },
  name: string,
) {
  await page.setViewportSize(viewport);
  const response = await page.goto(`/invoices/${fixture.invoiceId}`, {
    waitUntil: "domcontentloaded",
  });
  expect(response?.status()).toBeLessThan(400);
  await page.waitForLoadState("networkidle");
  await dismissCookieBanner(page);
  await expect(page.locator("#invoice-print")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Print A4 / Save PDF", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Print 80mm", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Share WhatsApp", exact: true }),
  ).toBeVisible();
  await expect(page.locator("#invoice-print")).toContainText(fixture.invoiceNo);
  await expectNoScreenOverflow(
    page,
    `screen ${viewport.width}x${viewport.height}`,
  );
  await page.screenshot({ path: join(SCREENSHOTS, name), fullPage: true });
}

async function installPrintObservation(
  page: Page,
  holdImageDecode = false,
): Promise<void> {
  await page.evaluate(
    ({ hold }) => {
      type State = typeof window & {
        __invoicePrintObservation?: PrintObservation;
        __invoicePrintObserver?: MutationObserver;
        __invoiceOriginalDecode?: typeof HTMLImageElement.prototype.decode;
        __invoiceDecodeResolvers?: Array<() => void>;
      };
      const state = window as State;
      state.__invoicePrintObserver?.disconnect();
      state.__invoicePrintObservation = {
        calls: [],
        measurementSeen: false,
        maxStyleCount: 0,
      };
      const sample = () => {
        const evidence = state.__invoicePrintObservation!;
        if (document.querySelector('[data-invoice-thermal-measuring="true"]'))
          evidence.measurementSeen = true;
        evidence.maxStyleCount = Math.max(
          evidence.maxStyleCount,
          document.querySelectorAll("#invoice-thermal-page-size").length,
        );
      };
      state.__invoicePrintObserver = new MutationObserver(sample);
      state.__invoicePrintObserver.observe(document.documentElement, {
        attributes: true,
        childList: true,
        subtree: true,
        attributeFilter: [
          "data-invoice-thermal-measuring",
          "data-print-mode",
          "data-invoice-thermal-print",
        ],
      });
      window.print = () => {
        sample();
        state.__invoicePrintObservation!.calls.push({
          mode: document.body.dataset.printMode ?? null,
          invoiceMarker: document.body.dataset.invoiceThermalPrint ?? null,
          measuringCount: document.querySelectorAll(
            '[data-invoice-thermal-measuring="true"]',
          ).length,
          styleCount: document.querySelectorAll("#invoice-thermal-page-size")
            .length,
          styleText:
            document.getElementById("invoice-thermal-page-size")?.textContent ??
            null,
        });
      };
      if (hold) {
        const image = document.createElement("img");
        image.id = "invoice-thermal-held-image";
        image.alt = "";
        image.src =
          "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";
        image.style.cssText = "width:1px;height:1px";
        document.querySelector(".thermal-print")?.append(image);
        state.__invoiceOriginalDecode = HTMLImageElement.prototype.decode;
        state.__invoiceDecodeResolvers = [];
        HTMLImageElement.prototype.decode = function heldDecode() {
          return new Promise<void>((resolve) =>
            state.__invoiceDecodeResolvers!.push(resolve),
          );
        };
      }
    },
    { hold: holdImageDecode },
  );
}

async function releaseImageDecode(page: Page): Promise<void> {
  await page.evaluate(() => {
    const state = window as typeof window & {
      __invoiceDecodeResolvers?: Array<() => void>;
    };
    const resolvers = state.__invoiceDecodeResolvers ?? [];
    state.__invoiceDecodeResolvers = [];
    resolvers.forEach((resolve) => resolve());
  });
}

async function restorePrintObservation(page: Page): Promise<void> {
  await page.evaluate(() => {
    type State = typeof window & {
      __invoicePrintObserver?: MutationObserver;
      __invoiceOriginalDecode?: typeof HTMLImageElement.prototype.decode;
      __invoiceDecodeResolvers?: Array<() => void>;
    };
    const state = window as State;
    state.__invoicePrintObserver?.disconnect();
    if (state.__invoiceOriginalDecode)
      HTMLImageElement.prototype.decode = state.__invoiceOriginalDecode;
    document.getElementById("invoice-thermal-held-image")?.remove();
    delete state.__invoiceDecodeResolvers;
    delete state.__invoiceOriginalDecode;
  });
}

async function observation(page: Page): Promise<PrintObservation> {
  return page.evaluate(
    () =>
      (
        window as typeof window & {
          __invoicePrintObservation: PrintObservation;
        }
      ).__invoicePrintObservation,
  );
}

async function expectPrintStateClean(page: Page, label: string): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(() => ({
          mode: document.body.dataset.printMode ?? null,
          marker: document.body.dataset.invoiceThermalPrint ?? null,
          measuring: document.querySelectorAll(
            '[data-invoice-thermal-measuring="true"]',
          ).length,
          styles: document.querySelectorAll("#invoice-thermal-page-size")
            .length,
        })),
      { message: `${label}: print state cleanup` },
    )
    .toEqual({ mode: null, marker: null, measuring: 0, styles: 0 });
}

function measurePdf(path: string): PdfMeasurement {
  const script = String.raw`
import json, logging, sys
logging.getLogger("pdfminer").setLevel(logging.ERROR)
import pdfplumber
with pdfplumber.open(sys.argv[1]) as pdf:
    if not pdf.pages:
        raise RuntimeError("PDF has no pages")
    page = pdf.pages[0]
    words = page.extract_words()
    if not words:
        raise RuntimeError("PDF has no words")
    left = min(word["x0"] for word in words)
    right = max(word["x1"] for word in words)
    print(json.dumps({
        "pageCount": len(pdf.pages),
        "pageWidth": round(page.width, 2),
        "pageHeight": round(page.height, 2),
        "text": " ".join((p.extract_text() or "") for p in pdf.pages),
        "overallLeft": round(left, 2),
        "overallRight": round(right, 2),
        "leftWhitespace": round(left, 2),
        "rightWhitespace": round(page.width - right, 2),
    }, sort_keys=True))
`;
  return JSON.parse(
    execFileSync("python3", ["-c", script, path], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }),
  ) as PdfMeasurement;
}

function renderPdf(path: string, output: string): void {
  execFileSync(
    "pdftoppm",
    ["-png", "-singlefile", path, output.replace(/\.png$/i, "")],
    {
      stdio: ["ignore", "ignore", "pipe"],
    },
  );
  expect(existsSync(output), `${output}: PDF render`).toBe(true);
}

async function prepareThermal(
  page: Page,
): Promise<{ heightMm: number; call: PrintCall }> {
  await installPrintObservation(page);
  await page.getByRole("button", { name: "Print 80mm", exact: true }).click();
  await expect.poll(async () => (await observation(page)).calls.length).toBe(1);
  const state = await observation(page);
  const call = state.calls[0];
  expect(call.mode).toBe("thermal");
  expect(call.invoiceMarker).toBe("true");
  expect(call.measuringCount).toBe(0);
  expect(call.styleCount).toBe(1);
  expect(state.measurementSeen).toBe(true);
  expect(state.maxStyleCount).toBe(1);
  const match = call.styleText?.match(
    /size:\s*80mm\s+([0-9.]+)mm;\s*margin:\s*4mm/,
  );
  expect(match, "valid absolute Invoice thermal page rule").not.toBeNull();
  return { heightMm: Number(match![1]), call };
}

async function captureThermalPdf(
  page: Page,
  pdfPath: string,
  renderPath: string,
): Promise<PdfMeasurement> {
  await page.emulateMedia({ media: "print" });
  const receipt = page.locator("article.thermal-print");
  await expect(receipt).toBeVisible();
  await expect(page.locator("#invoice-print")).toBeHidden();
  await expect(
    page.locator("nav:visible, aside:visible, header.sticky:visible"),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Print 80mm", exact: true }),
  ).toBeHidden();
  await expectNotClipped(receipt, "Invoice thermal receipt");
  const box = await receipt.boundingBox();
  expect(box).not.toBeNull();
  expect((box!.width * 25.4) / 96).toBeGreaterThanOrEqual(71.5);
  expect((box!.width * 25.4) / 96).toBeLessThanOrEqual(72.5);
  const pdf = await page.pdf({
    path: pdfPath,
    printBackground: true,
    preferCSSPageSize: true,
    scale: 1,
  });
  expect(pdf.subarray(0, 4).toString("ascii")).toBe("%PDF");
  renderPdf(pdfPath, renderPath);
  return measurePdf(pdfPath);
}

test.describe.configure({ mode: "serial", retries: 0 });

test("hardens real Invoice thermal artifacts and lifecycle without business residue", async ({
  page,
}) => {
  test.setTimeout(300_000);
  test.skip(
    !isLocalPlaywrightRun(),
    "Invoice thermal reliability QA is localhost-only.",
  );
  prepareEvidenceRoot();
  const { url } = getLocalAuthConfig();
  expect(["localhost", "127.0.0.1", "::1"]).toContain(new URL(url).hostname);

  writeJson("baseline-reference.json", {
    frozenPath: FROZEN_BASELINE_PATH,
    frozenManifestSha256: FROZEN_BASELINE_MANIFEST,
    historicalTwoPageEvidence: true,
    exactHistoricalTwoPageSymptomReproducedOnChromium148: false,
    currentA4FallbackReproduced: true,
    currentWidthClippingReproduced: true,
    currentCleanupRaceReproduced: true,
  });
  writeJson("root-cause-boundary.json", {
    historicalBlankPageRootCause: "unproven",
    correctionBoundary:
      "independently proven current page sizing, width, and lifecycle defects",
  });

  const admin = getLocalAdminClient();
  const fixture = makeFixture();
  const beforeSafety = await captureSafetySnapshot(admin);
  let cleanupRetries = 0;

  try {
    await createStandardFixture(admin, fixture);
    expect(await fixtureCounts(admin, fixture)).toEqual({
      invoices: 1,
      invoiceItems: 1,
      payments: 1,
    });

    await loginLocalOwnerDirectly(page);
    await dismissCookieBanner(page);
    const browser = observeBrowser(page);
    await verifyScreen(
      page,
      fixture,
      { width: 1440, height: 900 },
      "desktop.png",
    );
    await verifyScreen(
      page,
      fixture,
      { width: 390, height: 844 },
      "mobile-390x844.png",
    );
    await verifyScreen(
      page,
      fixture,
      { width: 320, height: 568 },
      "mobile-320x568.png",
    );
    writeJson("screen-mobile.json", {
      desktop: "pass",
      mobile390x844: "pass",
      mobile320x568: "pass",
      horizontalOverflow: false,
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/invoices/${fixture.invoiceId}`);
    await page.waitForLoadState("networkidle");

    await installPrintObservation(page);
    await page
      .getByRole("button", { name: "Print A4 / Save PDF", exact: true })
      .click();
    await expect
      .poll(async () => (await observation(page)).calls.length)
      .toBe(1);
    expect((await observation(page)).calls).toEqual([
      {
        mode: "a4",
        invoiceMarker: null,
        measuringCount: 0,
        styleCount: 0,
        styleText: null,
      },
    ]);
    await page.emulateMedia({ media: "print" });
    await expect(page.locator("#invoice-print")).toBeVisible();
    await expect(page.locator("article.thermal-print")).toBeHidden();
    const a4 = await page.pdf({
      path: A4_PDF,
      format: "A4",
      printBackground: true,
    });
    expect(a4.subarray(0, 4).toString("ascii")).toBe("%PDF");
    renderPdf(A4_PDF, A4_RENDER);
    const a4Measurement = measurePdf(A4_PDF);
    expect(a4Measurement.pageCount).toBeGreaterThanOrEqual(1);
    expect(a4Measurement.pageWidth).toBeGreaterThanOrEqual(594);
    expect(a4Measurement.pageWidth).toBeLessThanOrEqual(596);
    writeJson("a4.json", {
      ...a4Measurement,
      invoiceThermalMarker: false,
      invoiceThermalStyle: false,
    });
    await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
    await page.emulateMedia({ media: "screen" });
    await expectPrintStateClean(page, "A4 afterprint");
    await restorePrintObservation(page);

    const standard = await prepareThermal(page);
    await page.waitForTimeout(1600);
    const delayedState = await page.evaluate(() => ({
      mode: document.body.dataset.printMode ?? null,
      marker: document.body.dataset.invoiceThermalPrint ?? null,
      styles: document.querySelectorAll("#invoice-thermal-page-size").length,
      measuring: document.querySelectorAll(
        '[data-invoice-thermal-measuring="true"]',
      ).length,
    }));
    expect(delayedState).toEqual({
      mode: "thermal",
      marker: "true",
      styles: 1,
      measuring: 0,
    });
    writeJson("delayed-preview.json", {
      delayMs: 1600,
      old1200msCleanupWouldHaveRemovedState: true,
      retainedState: delayedState,
    });
    const standardMeasurement = await captureThermalPdf(
      page,
      STANDARD_PDF,
      STANDARD_RENDER,
    );
    expect(standardMeasurement.pageCount).toBe(1);
    expect(standardMeasurement.pageWidth).toBeGreaterThanOrEqual(224);
    expect(standardMeasurement.pageWidth).toBeLessThanOrEqual(230);
    expect(
      Math.abs(
        standardMeasurement.leftWhitespace -
          standardMeasurement.rightWhitespace,
      ),
    ).toBeLessThanOrEqual(12);
    const standardText = standardMeasurement.text.toLowerCase();
    for (const text of [
      fixture.invoiceNo,
      "Invoice",
      "Date",
      "Customer",
      "Cashier",
      "Subtotal",
      "Discount",
      "Grand total",
      "Paid",
      "Balance",
      "Payments",
      STANDARD_ITEM,
    ]) {
      expect(standardText).toContain(text.toLowerCase());
    }
    writeJson("standard-thermal.json", {
      ...standardMeasurement,
      measuredHeightMm: standard.heightMm,
      blankTrailingPage: false,
      clipping: false,
    });
    await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
    await page.emulateMedia({ media: "screen" });
    await expectPrintStateClean(page, "standard thermal afterprint");
    await restorePrintObservation(page);

    await expandLongFixture(admin, fixture);
    expect(await fixtureCounts(admin, fixture)).toEqual({
      invoices: 1,
      invoiceItems: 20,
      payments: 1,
    });
    await page.goto(`/invoices/${fixture.invoiceId}`);
    await page.waitForLoadState("networkidle");
    const long = await prepareThermal(page);
    const longMeasurement = await captureThermalPdf(
      page,
      LONG_PDF,
      LONG_RENDER,
    );
    expect(longMeasurement.pageCount).toBe(1);
    expect(longMeasurement.pageWidth).toBeGreaterThanOrEqual(224);
    expect(longMeasurement.pageWidth).toBeLessThanOrEqual(230);
    expect(longMeasurement.pageHeight).toBeGreaterThan(
      standardMeasurement.pageHeight + 100,
    );
    expect(long.heightMm).toBeGreaterThan(standard.heightMm + 30);
    const longText = longMeasurement.text.replace(/\s+/g, " ");
    expect(longText).toContain(`${WRAPPED_ITEM} 19`);
    expect(longText).toContain("Synthetic long receipt note");
    expect(
      Math.abs(
        longMeasurement.leftWhitespace - longMeasurement.rightWhitespace,
      ),
    ).toBeLessThanOrEqual(12);
    writeJson("long-thermal.json", {
      ...longMeasurement,
      measuredHeightMm: long.heightMm,
      standardHeightMm: standard.heightMm,
      blankTrailingPage: false,
      clipping: false,
      wrappedItemsComplete: true,
      noteComplete: true,
    });
    writeJson("width-analysis.json", {
      physicalWidthMm: 80,
      printableWidthMm: 72,
      marginsMm: { left: 4, right: 4 },
      standard: standardMeasurement,
      long: longMeasurement,
    });
    await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
    await page.emulateMedia({ media: "screen" });
    await expectPrintStateClean(page, "long thermal afterprint");
    await restorePrintObservation(page);

    const cycleCalls: number[] = [];
    for (let index = 0; index < 5; index += 1) {
      await installPrintObservation(page);
      await page
        .getByRole("button", { name: "Print 80mm", exact: true })
        .click();
      await expect
        .poll(async () => (await observation(page)).calls.length)
        .toBe(1);
      const state = await observation(page);
      expect(state.calls[0].mode).toBe("thermal");
      expect(state.calls[0].invoiceMarker).toBe("true");
      expect(state.calls[0].styleCount).toBe(1);
      cycleCalls.push(state.calls.length);
      await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
      await expectPrintStateClean(page, `cycle ${index + 1}`);
      await restorePrintObservation(page);
    }

    await installPrintObservation(page, true);
    await page.evaluate(() => {
      const button = [...document.querySelectorAll("button")].find((element) =>
        element.textContent?.includes("Print 80mm"),
      );
      if (!(button instanceof HTMLButtonElement))
        throw new Error("Print 80mm button missing");
      button.click();
      button.click();
    });
    await expect
      .poll(async () => (await observation(page)).measurementSeen)
      .toBe(true);
    expect((await observation(page)).calls).toHaveLength(0);
    await releaseImageDecode(page);
    await expect
      .poll(async () => (await observation(page)).calls.length)
      .toBe(1);
    const rapid = await observation(page);
    expect(rapid.maxStyleCount).toBe(1);
    writeJson("rapid-click.json", {
      activations: 2,
      preparations: 1,
      styles: rapid.maxStyleCount,
      printCalls: rapid.calls.length,
    });
    await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
    await expectPrintStateClean(page, "rapid click cleanup");
    await restorePrintObservation(page);

    await installPrintObservation(page, true);
    await page.getByRole("button", { name: "Print 80mm", exact: true }).click();
    await expect
      .poll(async () => (await observation(page)).measurementSeen)
      .toBe(true);
    await page.getByRole("link", { name: /Back to invoices/i }).click();
    await expect(page).toHaveURL(/\/invoices(?:\?.*)?$/);
    await releaseImageDecode(page);
    await page.waitForTimeout(500);
    expect((await observation(page)).calls).toHaveLength(0);
    await expectPrintStateClean(page, "navigation cancellation");
    await expect(page.locator('p[role="alert"]')).toHaveCount(0);
    writeJson("cancellation.json", {
      navigationUnmount: true,
      stalePrintCalls: 0,
      recreatedStyles: 0,
      recreatedMarkers: 0,
      falseErrors: 0,
    });
    await restorePrintObservation(page);

    await page.goto(`/invoices/${fixture.invoiceId}`);
    await page.waitForLoadState("networkidle");
    await page.locator("article.thermal-print").evaluate((element) => {
      const original = element.getBoundingClientRect.bind(element);
      (
        element as HTMLElement & { __originalBounds?: typeof original }
      ).__originalBounds = original;
      element.getBoundingClientRect = () => {
        const bounds = original();
        return {
          ...bounds,
          height: 30_000,
          bottom: bounds.top + 30_000,
          toJSON: () => ({}),
        } as DOMRect;
      };
    });
    await installPrintObservation(page);
    await page.getByRole("button", { name: "Print 80mm", exact: true }).click();
    await expect(page.locator('p[role="alert"]')).toHaveText(
      "Unable to prepare the thermal invoice. Please try again.",
    );
    expect((await observation(page)).calls).toHaveLength(0);
    await expectPrintStateClean(page, "oversize failure");
    await restorePrintObservation(page);

    writeJson("lifecycle-old-vs-new.json", {
      old: { unconditionalCleanupMs: 1200, divergentPreviewState: true },
      current: {
        afterprintOwned: true,
        printMediaOwned: true,
        postDialogFocusFallback: true,
        unconditionalCleanupMs: null,
        raceCycles: 5,
        cycleCalls,
      },
    });
    writeJson("current-defects.json", {
      invalidThermalPageRule: "reproduced in frozen baseline",
      valid80mmClipping: "reproduced in frozen baseline",
      cleanupRace: "reproduced in frozen baseline",
      correctedCurrentPath: true,
      historicalTwoPageRootCause: "unproven",
    });

    expect(browser.pageErrors).toEqual([]);
    expect(browser.consoleErrors).toEqual([]);
    expect(browser.writes).toEqual([]);
    expect(browser.requestFailures).toEqual([]);
    expect(browser.unexpectedHttpErrors).toEqual([]);
    writeJson("browser-observation.json", browser);
  } finally {
    cleanupRetries = await cleanupFixture(admin, fixture);
    const afterSafety = await captureSafetySnapshot(admin);
    expect(afterSafety, "all local business signatures restored").toEqual(
      beforeSafety,
    );
    writeJson("cleanup.json", {
      fixture: fixture.invoiceNo,
      markerInvoices: 0,
      invoiceItems: 0,
      fixturePayments: 0,
      customers: 0,
      stockChanges: 0,
      fifoChanges: 0,
      cashDrawerChanges: 0,
      suppliers: 0,
      retries: cleanupRetries,
      failures: 0,
      signaturesEqual: true,
    });
  }

  expect(cleanupRetries).toBe(0);
  test
    .info()
    .annotations.push(
      { type: "evidence-root", description: EVIDENCE_ROOT },
      { type: "chromium", description: "148.0.7778.96" },
      { type: "automatic-retries", description: "0" },
    );
});
