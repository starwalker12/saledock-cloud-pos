import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { chromium, expect, test, type Page } from "@playwright/test";
import {
  getLocalAdminClient,
  isLocalPlaywrightRun,
  LOCAL_QA_ORG_ID,
  loginLocalOwnerDirectly,
} from "./helpers/local-supabase";

const CHROME_151_EXECUTABLE =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const REQUIRED_CHROME_VERSION = "151.0.7922.109";
const LOCAL_QA_BRANCH_ID = "00000000-0000-4000-8000-000000000101";
const EVIDENCE_ROOT = join(
  tmpdir(),
  `saledock-invoice-thermal-chrome151-${randomUUID().slice(0, 8)}`,
);

type AdminClient = ReturnType<typeof getLocalAdminClient>;
type Fixture = {
  invoiceId: string;
  invoiceNo: string;
  paymentId: string;
  itemIds: string[];
};
type PdfPage = {
  width: number;
  height: number;
  text: string;
  left: number;
  right: number;
};

function expectNoError(
  error: { message: string } | null,
  label: string,
): void {
  if (error) throw new Error(`${label}: ${error.message}`);
}

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

async function safetySnapshot(admin: AdminClient): Promise<string[]> {
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
      .from("supplier_payments")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", LOCAL_QA_ORG_ID),
    admin
      .from("expenses")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", LOCAL_QA_ORG_ID),
    admin
      .from("cash_shifts")
      .select("id, status, starting_cash, expected_cash, counted_cash")
      .eq("organization_id", LOCAL_QA_ORG_ID)
      .order("id"),
  ]);
  results.forEach((result, index) =>
    expectNoError(result.error, `safety query ${index + 1}`),
  );
  return results.map((result) => digest(result.data ?? result.count ?? 0));
}

async function ownerId(admin: AdminClient): Promise<string> {
  const { data, error } = await admin
    .from("profiles")
    .select("id")
    .eq("organization_id", LOCAL_QA_ORG_ID)
    .eq("role", "owner")
    .eq("is_active", true)
    .limit(1);
  expectNoError(error, "owner lookup");
  if (!data?.[0]?.id) throw new Error("Local owner is unavailable.");
  return data[0].id as string;
}

function makeFixture(): Fixture {
  return {
    invoiceId: randomUUID(),
    invoiceNo: `QA-CHROME151-${randomUUID().replaceAll("-", "").slice(0, 10)}`,
    paymentId: randomUUID(),
    itemIds: Array.from({ length: 20 }, () => randomUUID()),
  };
}

async function createFixture(
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
    note: "Synthetic Chrome 151 mixed-page verification.",
    created_by: createdBy,
    invoice_date: createdAt,
    created_at: createdAt,
  });
  expectNoError(invoiceError, "invoice insert");

  const { error: itemError } = await admin.from("invoice_items").insert({
    id: fixture.itemIds[0],
    organization_id: LOCAL_QA_ORG_ID,
    invoice_id: fixture.invoiceId,
    product_id: null,
    product_name: "Synthetic Chrome 151 Thermal Service",
    product_type: "service",
    quantity: 1,
    purchase_price: 0,
    unit_price: 150,
    item_discount: 0,
    line_total: 150,
    service_total_charged: 150,
    created_at: createdAt,
  });
  expectNoError(itemError, "item insert");

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
  expectNoError(paymentError, "payment insert");
}

async function expandLongFixture(
  admin: AdminClient,
  fixture: Fixture,
): Promise<void> {
  const createdAt = Date.now();
  const rows = fixture.itemIds.slice(1).map((id, index) => ({
    id,
    organization_id: LOCAL_QA_ORG_ID,
    invoice_id: fixture.invoiceId,
    product_id: null,
    product_name:
      `Synthetic Chrome 151 Long Wrapped Thermal Product ${String(index + 1).padStart(2, "0")} ` +
      "With Complete Narrow Width Content",
    product_type: "service",
    quantity: 1,
    purchase_price: 0,
    unit_price: 10,
    item_discount: 0,
    line_total: 10,
    service_total_charged: 10,
    created_at: new Date(createdAt + index).toISOString(),
  }));
  const { error: itemError } = await admin.from("invoice_items").insert(rows);
  expectNoError(itemError, "long items insert");
  const longNote = Array.from(
    { length: 8 },
    () => "Synthetic Chrome 151 long note remains complete and safely wrapped.",
  ).join(" ");
  const { error: invoiceError } = await admin
    .from("invoices")
    .update({
      subtotal: 340,
      grand_total: 340,
      amount_paid: 340,
      amount_tendered: 340,
      note: longNote,
    })
    .eq("organization_id", LOCAL_QA_ORG_ID)
    .eq("id", fixture.invoiceId);
  expectNoError(invoiceError, "long invoice update");
  const { error: paymentError } = await admin
    .from("payments")
    .update({ amount: 340 })
    .eq("organization_id", LOCAL_QA_ORG_ID)
    .eq("id", fixture.paymentId);
  expectNoError(paymentError, "long payment update");
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
  if (errors.length) {
    retries += 1;
    errors = await cleanup();
  }
  expect(errors).toEqual([]);
  return retries;
}

function measurePdf(path: string): PdfPage[] {
  const script = String.raw`
import json, logging, sys
logging.getLogger("pdfminer").setLevel(logging.ERROR)
import pdfplumber
out=[]
with pdfplumber.open(sys.argv[1]) as pdf:
    for page in pdf.pages:
        words=page.extract_words()
        out.append({
            "width": round(page.width, 2),
            "height": round(page.height, 2),
            "text": page.extract_text() or "",
            "left": round(min((w["x0"] for w in words), default=0), 2),
            "right": round(max((w["x1"] for w in words), default=0), 2),
        })
print(json.dumps(out))
`;
  return JSON.parse(
    execFileSync("python3", ["-c", script, path], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }),
  ) as PdfPage[];
}

async function installPrintStub(page: Page): Promise<void> {
  await page.evaluate(() => {
    const state = window as typeof window & { __chrome151PrintCalls?: number };
    state.__chrome151PrintCalls = 0;
    window.print = () => {
      state.__chrome151PrintCalls = (state.__chrome151PrintCalls ?? 0) + 1;
    };
  });
}

async function prepareThermal(page: Page): Promise<number> {
  await installPrintStub(page);
  await page.getByRole("button", { name: "Print 80mm", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as typeof window & { __chrome151PrintCalls?: number })
            .__chrome151PrintCalls ?? 0,
      ),
    )
    .toBe(1);
  await page.emulateMedia({ media: "print" });
  const state = await page.evaluate(() => ({
    rootPage: getComputedStyle(document.documentElement).page,
    receiptPage: getComputedStyle(
      document.querySelector<HTMLElement>("article.thermal-print")!,
    ).page,
    style:
      document.getElementById("invoice-thermal-page-size")?.textContent ?? "",
    marker: document.body.dataset.invoiceThermalPrint ?? null,
  }));
  expect(state.rootPage).toBe("invoiceThermalReceipt");
  expect(state.receiptPage).toBe("invoiceThermalReceipt");
  expect(state.marker).toBe("true");
  const match = state.style.match(/size:\s*80mm\s+([0-9.]+)mm/);
  expect(match).not.toBeNull();
  return Number(match![1]);
}

async function captureThermal(
  page: Page,
  name: string,
): Promise<{ pages: PdfPage[]; heightMm: number }> {
  const heightMm = await prepareThermal(page);
  await expect(page.locator("article.thermal-print")).toBeVisible();
  await expect(page.locator("#invoice-print")).toBeHidden();
  await expect(
    page.locator("nav:visible, aside:visible, header.sticky:visible"),
  ).toHaveCount(0);
  const path = join(EVIDENCE_ROOT, `${name}.pdf`);
  await page.pdf({ path, printBackground: true, preferCSSPageSize: true });
  const pages = measurePdf(path);
  expect(pages).toHaveLength(1);
  expect(pages[0].width).toBeGreaterThanOrEqual(224);
  expect(pages[0].width).toBeLessThanOrEqual(230);
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await page.emulateMedia({ media: "screen" });
  await expect
    .poll(() =>
      page.evaluate(() => ({
        marker: document.body.dataset.invoiceThermalPrint ?? null,
        mode: document.body.dataset.printMode ?? null,
        styles: document.querySelectorAll("#invoice-thermal-page-size").length,
      })),
    )
    .toEqual({ marker: null, mode: null, styles: 0 });
  return { pages, heightMm };
}

async function captureA4(page: Page): Promise<PdfPage[]> {
  await installPrintStub(page);
  await page
    .getByRole("button", { name: "Print A4 / Save PDF", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as typeof window & { __chrome151PrintCalls?: number })
            .__chrome151PrintCalls ?? 0,
      ),
    )
    .toBe(1);
  expect(
    await page.evaluate(() => ({
      mode: document.body.dataset.printMode ?? null,
      marker: document.body.dataset.invoiceThermalPrint ?? null,
      style: document.querySelectorAll("#invoice-thermal-page-size").length,
      rootPage: getComputedStyle(document.documentElement).page,
    })),
  ).toEqual({ mode: "a4", marker: null, style: 0, rootPage: "auto" });
  await page.emulateMedia({ media: "print" });
  await expect(page.locator("#invoice-print")).toBeVisible();
  await expect(page.locator("article.thermal-print")).toBeHidden();
  const path = join(EVIDENCE_ROOT, "a4.pdf");
  await page.pdf({ path, format: "A4", printBackground: true });
  const pages = measurePdf(path);
  expect(pages).toHaveLength(1);
  expect(pages[0].width).toBeGreaterThanOrEqual(594);
  expect(pages[0].width).toBeLessThanOrEqual(596);
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await page.emulateMedia({ media: "screen" });
  return pages;
}

test.describe.configure({ mode: "serial", retries: 0 });

test("Chrome 151 keeps Invoice thermal output on one named page", async () => {
  test.setTimeout(300_000);
  test.skip(!isLocalPlaywrightRun(), "Chrome 151 causal E2E is localhost-only.");
  expect(existsSync(CHROME_151_EXECUTABLE)).toBe(true);
  const versionOutput = execFileSync(CHROME_151_EXECUTABLE, ["--version"], {
    encoding: "utf8",
  });
  expect(versionOutput).toContain(REQUIRED_CHROME_VERSION);
  if (existsSync(EVIDENCE_ROOT))
    throw new Error(`Disposable evidence path already exists: ${EVIDENCE_ROOT}`);
  mkdirSync(EVIDENCE_ROOT);

  const admin = getLocalAdminClient();
  const fixture = makeFixture();
  const openingSafety = await safetySnapshot(admin);
  let cleanupRetries = 0;
  const browserWrites: string[] = [];
  const browser = await chromium.launch({
    headless: true,
    executablePath: CHROME_151_EXECUTABLE,
  });

  try {
    expect(await browser.version()).toBe(REQUIRED_CHROME_VERSION);
    await createFixture(admin, fixture);
    const context = await browser.newContext({
      baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000",
      locale: "en-PK",
      timezoneId: "Asia/Karachi",
      viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();
    await loginLocalOwnerDirectly(page);
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (
        !["GET", "HEAD", "OPTIONS"].includes(request.method()) &&
        !url.pathname.startsWith("/_vercel/")
      ) {
        browserWrites.push(`${request.method()} ${url.pathname}`);
      }
    });
    await page.goto(`/invoices/${fixture.invoiceId}`, {
      waitUntil: "networkidle",
    });

    const standardAttempts = [];
    for (let index = 1; index <= 3; index += 1) {
      standardAttempts.push(
        await captureThermal(page, `standard-${index}`),
      );
    }
    for (const attempt of standardAttempts) {
      expect(attempt.pages[0].text).toContain(fixture.invoiceNo);
      expect(attempt.pages[0].text).toContain("Grand total");
      expect(attempt.pages[0].text).toContain("PAYMENTS");
    }

    await expandLongFixture(admin, fixture);
    await page.goto(`/invoices/${fixture.invoiceId}`, {
      waitUntil: "networkidle",
    });
    const long = await captureThermal(page, "long");
    expect(long.heightMm).toBeGreaterThan(
      standardAttempts[0].heightMm + 100,
    );
    const longText = long.pages[0].text.replace(/\s+/g, " ");
    expect(longText).toContain("Product 19 With Complete Narrow Width Content");
    expect(longText).toContain("long note remains complete");

    const a4 = await captureA4(page);
    expect(a4[0].text).toContain(fixture.invoiceNo);
    expect(a4[0].text).toContain("INVOICE");

    await page.reload({ waitUntil: "networkidle" });
    await page.evaluate(() => {
      const receipt = document.querySelector<HTMLElement>(".thermal-print");
      if (!receipt) throw new Error("thermal receipt missing");
      const image = document.createElement("img");
      image.src =
        "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";
      image.decode = () => Promise.reject(new Error("forced decode failure"));
      receipt.append(image);
      window.print = () => {
        throw new Error("failure cleanup printed unexpectedly");
      };
    });
    await page.getByRole("button", { name: "Print 80mm", exact: true }).click();
    await expect(page.locator('p[role="alert"]')).toContainText(
      "Unable to prepare the thermal invoice",
    );
    await expect
      .poll(() =>
        page.evaluate(() => ({
          mode: document.body.dataset.printMode ?? null,
          marker: document.body.dataset.invoiceThermalPrint ?? null,
          style: document.querySelectorAll("#invoice-thermal-page-size").length,
          measuring: document.querySelectorAll(
            '[data-invoice-thermal-measuring="true"]',
          ).length,
        })),
      )
      .toEqual({ mode: null, marker: null, style: 0, measuring: 0 });

    expect(browserWrites).toEqual([]);
    writeJson("result.json", {
      executable: CHROME_151_EXECUTABLE,
      version: await browser.version(),
      standardAttempts: standardAttempts.map((attempt) => ({
        pages: attempt.pages.length,
        heightMm: attempt.heightMm,
      })),
      long: { pages: long.pages.length, heightMm: long.heightMm },
      a4Pages: a4.length,
      browserWrites,
    });
    await context.close();
  } finally {
    await browser.close();
    cleanupRetries = await cleanupFixture(admin, fixture);
  }

  const closingSafety = await safetySnapshot(admin);
  expect(closingSafety).toEqual(openingSafety);
  writeJson("cleanup.json", {
    cleanupRetries,
    cleanupFailures: 0,
    closingSafetyEqual: true,
  });
  expect(cleanupRetries).toBe(0);
});
