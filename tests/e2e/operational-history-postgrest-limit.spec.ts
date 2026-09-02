import { randomUUID } from "node:crypto";
import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  getLocalAdminClient,
  isLocalPlaywrightRun,
  LOCAL_QA_ORG_ID,
  loginLocalOwnerDirectly,
  SEEDED_PHYSICAL_PRODUCT_ID,
} from "./helpers/local-supabase";

type AdminClient = ReturnType<typeof getLocalAdminClient>;
type AxeResult = { violations: Array<{ id: string; nodes: unknown[] }> };

const BRANCH_ID = "00000000-0000-4000-8000-000000000101";
const SELECTED_DATE = "2020-09-01";
const RETURN_OVERFLOW_DATE = "2018-01-01";
const RETURN_NARROW_DATE = "2018-01-02";
const MOVEMENT_OVERFLOW_DATE = "2018-02-01";
const MOVEMENT_NARROW_DATE = "2018-02-02";
const CLOSING_OVERFLOW_FROM = "2012-01-01";
const CLOSING_OVERFLOW_TO = dateAfter(CLOSING_OVERFLOW_FROM, 1000);
const SHIFT_OVERFLOW_FROM = "2016-01-01";
const SHIFT_OVERFLOW_TO = "2016-12-31";
const SAFE_HISTORY_FROM = "2015-01-01";
const SAFE_HISTORY_TO = "2015-01-31";
const axePath = path.join(process.cwd(), "node_modules/axe-core/axe.min.js");
const evidenceDirectory = process.env.POSTGREST_LIMIT_EVIDENCE_DIR;

const fixture = {
  marker: `POSTGREST-LIMIT-${randomUUID().slice(0, 8)}`,
  invoiceId: randomUUID(),
  ownerProfileId: "",
  productName: "",
};

const baseline = new Map<string, string[]>();

function dateAfter(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function timestampOn(date: string, index: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCMilliseconds(index % 1000);
  return value.toISOString();
}

async function requireRows<T>(
  result: { data: T[] | null; error: { message: string } | null },
  label: string,
): Promise<T[]> {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data ?? [];
}

async function snapshotIds(admin: AdminClient, table: string) {
  const rows = await requireRows(
    await admin.from(table).select("id").order("id", { ascending: true }),
    `snapshot ${table}`,
  );
  return rows.map((row) => String((row as { id: string }).id));
}

async function insertBatches(
  admin: AdminClient,
  table: string,
  rows: Array<Record<string, unknown>>,
) {
  for (let offset = 0; offset < rows.length; offset += 200) {
    const result = await admin.from(table).insert(rows.slice(offset, offset + 200));
    if (result.error) throw new Error(`insert ${table}: ${result.error.message}`);
  }
}

async function insertFixtures(admin: AdminClient) {
  for (const table of [
    "invoices",
    "returns",
    "stock_movements",
    "daily_closings",
    "cash_shifts",
  ]) {
    baseline.set(table, await snapshotIds(admin, table));
  }

  const owners = await requireRows(
    await admin
      .from("profiles")
      .select("id")
      .eq("organization_id", LOCAL_QA_ORG_ID)
      .eq("role", "owner")
      .eq("is_active", true)
      .limit(1),
    "load owner",
  );
  fixture.ownerProfileId = String(
    (owners[0] as { id?: string } | undefined)?.id ?? "",
  );
  if (!fixture.ownerProfileId) throw new Error("Local owner profile missing.");

  const products = await requireRows(
    await admin
      .from("products")
      .select("name")
      .eq("id", SEEDED_PHYSICAL_PRODUCT_ID)
      .eq("organization_id", LOCAL_QA_ORG_ID)
      .limit(1),
    "load product",
  );
  fixture.productName = String(
    (products[0] as { name?: string } | undefined)?.name ?? "",
  );
  if (!fixture.productName) throw new Error("Local product missing.");

  const invoice = await admin.from("invoices").insert({
    id: fixture.invoiceId,
    organization_id: LOCAL_QA_ORG_ID,
    branch_id: BRANCH_ID,
    invoice_no: `INV-${fixture.marker}`,
    status: "paid",
    subtotal: 1008,
    grand_total: 1008,
    amount_paid: 1008,
    balance_due: 0,
    created_by: fixture.ownerProfileId,
    invoice_date: `${RETURN_OVERFLOW_DATE}T12:00:00.000Z`,
    note: fixture.marker,
  });
  if (invoice.error) throw new Error(`insert invoice: ${invoice.error.message}`);

  const returns = [
    ...Array.from({ length: 1001 }, (_, index) => ({
      index,
      date: RETURN_OVERFLOW_DATE,
      prefix: "OVERFLOW",
    })),
    ...Array.from({ length: 7 }, (_, index) => ({
      index,
      date: RETURN_NARROW_DATE,
      prefix: "NARROW",
    })),
  ].map(({ index, date, prefix }) => ({
    id: randomUUID(),
    organization_id: LOCAL_QA_ORG_ID,
    branch_id: BRANCH_ID,
    invoice_id: fixture.invoiceId,
    return_no: `${fixture.marker}-${prefix}-${String(index + 1).padStart(4, "0")}`,
    status: "completed",
    subtotal: 1,
    refund_amount: 1,
    refund_method: "card",
    notes: fixture.marker,
    created_by: fixture.ownerProfileId,
    created_at: timestampOn(date, index),
    updated_at: `${date}T12:00:00.000Z`,
  }));
  await insertBatches(admin, "returns", returns);

  const movements = [
    ...Array.from({ length: 1001 }, (_, index) => ({
      index,
      date: MOVEMENT_OVERFLOW_DATE,
      prefix: "OVERFLOW",
    })),
    ...Array.from({ length: 7 }, (_, index) => ({
      index,
      date: MOVEMENT_NARROW_DATE,
      prefix: "NARROW",
    })),
  ].map(({ index, date, prefix }) => ({
    id: randomUUID(),
    organization_id: LOCAL_QA_ORG_ID,
    branch_id: BRANCH_ID,
    product_id: SEEDED_PHYSICAL_PRODUCT_ID,
    movement_type: index % 2 === 0 ? "adjustment_in" : "adjustment_out",
    quantity: 1,
    unit_cost: 10,
    reference_type: "postgrest_limit_qa",
    notes: `${fixture.marker}-${prefix}`,
    created_by: fixture.ownerProfileId,
    created_at: timestampOn(date, index),
  }));
  await insertBatches(admin, "stock_movements", movements);

  const overflowClosings = Array.from({ length: 1001 }, (_, index) => {
    const closingDate = dateAfter(CLOSING_OVERFLOW_FROM, index);
    return {
      id: randomUUID(),
      organization_id: LOCAL_QA_ORG_ID,
      branch_id: BRANCH_ID,
      closing_date: closingDate,
      bills_count: 1,
      cash_sales: 1,
      expected_closing_cash: 1,
      actual_closing_cash: 1,
      notes: `${fixture.marker}-CLOSING-OVERFLOW`,
      finalized_by: fixture.ownerProfileId,
      finalized_at: `${closingDate}T12:00:00.000Z`,
    };
  });
  const safeClosings = [
    ...Array.from({ length: 7 }, (_, index) => dateAfter(SAFE_HISTORY_FROM, index)),
    ...Array.from({ length: 50 }, (_, index) => dateAfter(SHIFT_OVERFLOW_FROM, index)),
  ].map((closingDate) => ({
    id: randomUUID(),
    organization_id: LOCAL_QA_ORG_ID,
    branch_id: BRANCH_ID,
    closing_date: closingDate,
    bills_count: 1,
    cash_sales: 1,
    expected_closing_cash: 1,
    actual_closing_cash: 1,
    notes: `${fixture.marker}-CLOSING-SAFE`,
    finalized_by: fixture.ownerProfileId,
    finalized_at: `${closingDate}T12:00:00.000Z`,
  }));
  await insertBatches(admin, "daily_closings", [
    ...overflowClosings,
    ...safeClosings,
  ]);

  const overflowShifts = Array.from({ length: 1001 }, (_, index) => {
    const opened = new Date(`${SHIFT_OVERFLOW_FROM}T00:00:00.000Z`);
    opened.setUTCHours(opened.getUTCHours() + index * 8);
    const closed = new Date(opened.getTime() + 4 * 60 * 60 * 1000);
    return { opened, closed, prefix: "OVERFLOW", index };
  });
  const safeShifts = Array.from({ length: 7 }, (_, index) => {
    const opened = new Date(`${SAFE_HISTORY_FROM}T00:00:00.000Z`);
    opened.setUTCDate(opened.getUTCDate() + index);
    const closed = new Date(opened.getTime() + 4 * 60 * 60 * 1000);
    return { opened, closed, prefix: "SAFE", index };
  });
  const shifts = [...overflowShifts, ...safeShifts].map(
    ({ opened, closed, prefix, index }) => ({
      id: randomUUID(),
      organization_id: LOCAL_QA_ORG_ID,
      branch_id: BRANCH_ID,
      opened_at: opened.toISOString(),
      closed_at: closed.toISOString(),
      opened_by: fixture.ownerProfileId,
      closed_by: fixture.ownerProfileId,
      starting_cash: 1,
      expected_cash: 1,
      counted_cash: 1,
      cash_difference: 0,
      notes: `${fixture.marker}-SHIFT-${prefix}-${index}`,
      status: "closed",
      created_at: opened.toISOString(),
      updated_at: closed.toISOString(),
    }),
  );
  await insertBatches(admin, "cash_shifts", shifts);
}

async function cleanupFixtures(admin: AdminClient) {
  const cleanup = [
    admin
      .from("cash_shifts")
      .delete()
      .eq("organization_id", LOCAL_QA_ORG_ID)
      .like("notes", `${fixture.marker}%`),
    admin
      .from("daily_closings")
      .delete()
      .eq("organization_id", LOCAL_QA_ORG_ID)
      .like("notes", `${fixture.marker}%`),
    admin
      .from("stock_movements")
      .delete()
      .eq("organization_id", LOCAL_QA_ORG_ID)
      .like("notes", `${fixture.marker}%`),
    admin.from("returns").delete().eq("invoice_id", fixture.invoiceId),
  ];
  for (const operation of cleanup) {
    const result = await operation;
    if (result.error) throw new Error(`fixture cleanup: ${result.error.message}`);
  }
  const invoice = await admin.from("invoices").delete().eq("id", fixture.invoiceId);
  if (invoice.error) throw new Error(`invoice cleanup: ${invoice.error.message}`);

  for (const [table, expected] of baseline) {
    expect(await snapshotIds(admin, table), `${table} cleanup`).toEqual(expected);
  }
}

async function dismissCookieBanner(page: Page) {
  const banner = page.getByTestId("cookie-consent-banner");
  const appeared = await banner
    .waitFor({ state: "visible", timeout: 3_000 })
    .then(() => true)
    .catch(() => false);
  if (appeared) {
    await page.getByRole("button", { name: "Reject optional cookies" }).click();
    await expect(banner).toBeHidden();
  }
}

async function expectNoHorizontalOverflow(page: Page, label: string) {
  const geometry = await page.evaluate(() => ({
    viewport: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
  }));
  expect(geometry.documentWidth, `${label}: ${JSON.stringify(geometry)}`).toBeLessThanOrEqual(
    geometry.viewport + 1,
  );
}

async function textSignature(region: Locator) {
  return region.evaluate((element) =>
    (element.textContent ?? "").replace(/\s+/g, " ").trim(),
  );
}

async function runAxe(page: Page, region: Locator): Promise<AxeResult> {
  const hasAxe = await page.evaluate(() => "axe" in window);
  if (!hasAxe) await page.addScriptTag({ path: axePath });
  return region.evaluate(async (element) =>
    (
      window as typeof window & {
        axe: { run: (context: Element, options: unknown) => Promise<AxeResult> };
      }
    ).axe.run(element, {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
      },
    }),
  );
}

async function captureEvidence(page: Page, name: string) {
  if (!evidenceDirectory) return;
  await expect(page.getByText("Checking session...", { exact: true })).toBeHidden();
  await expect(page.getByText("Loading SaleDock...", { exact: true })).toBeHidden();
  await page.screenshot({
    path: path.join(evidenceDirectory, "screenshots", name),
    fullPage: true,
  });
}

test.describe("operational history PostgREST row-limit correction", () => {
  test.describe.configure({ mode: "serial", retries: 0 });
  test.skip(
    !isLocalPlaywrightRun(),
    "PostgREST row-limit acceptance is intentionally local-only.",
  );

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    await insertFixtures(getLocalAdminClient());
  });

  test.afterAll(async () => {
    test.setTimeout(120_000);
    await cleanupFixtures(getLocalAdminClient());
  });

  test.beforeEach(async ({ page }) => {
    await loginLocalOwnerDirectly(page);
    await dismissCookieBanner(page);
  });

  test("local PostgREST proves exact count 1001 versus ordinary 1000-row response", async () => {
    const admin = getLocalAdminClient();
    const countResult = await admin
      .from("returns")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", LOCAL_QA_ORG_ID)
      .eq("invoice_id", fixture.invoiceId)
      .gte("created_at", `${RETURN_OVERFLOW_DATE}T00:00:00.000Z`)
      .lte("created_at", `${RETURN_OVERFLOW_DATE}T23:59:59.999Z`);
    expect(countResult.error).toBeNull();
    expect(countResult.count).toBe(1001);

    const dataResult = await admin
      .from("returns")
      .select("id")
      .eq("organization_id", LOCAL_QA_ORG_ID)
      .eq("invoice_id", fixture.invoiceId)
      .gte("created_at", `${RETURN_OVERFLOW_DATE}T00:00:00.000Z`)
      .lte("created_at", `${RETURN_OVERFLOW_DATE}T23:59:59.999Z`);
    expect(dataResult.error).toBeNull();
    expect(dataResult.data).toHaveLength(1000);
  });

  test("Returns refuses 1001 rows and a narrower complete range restores sorting", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(
      `/returns?from=${RETURN_OVERFLOW_DATE}&to=${RETURN_OVERFLOW_DATE}`,
    );
    const alert = page.locator('section[role="alert"]');
    await expect(alert).toContainText("1,001 returns match this date range");
    await expect(alert).toContainText("1,000 records or fewer");
    await expect(page.getByText("No returns match this date range")).toHaveCount(0);
    await expect(page.getByRole("link", { name: /^Sort by/ })).toHaveCount(0);
    expect((await runAxe(page, alert)).violations).toEqual([]);
    await expectNoHorizontalOverflow(page, "Returns overflow mobile");
    await captureEvidence(page, "returns-overflow-mobile-390.png");

    await page.setViewportSize({ width: 320, height: 568 });
    await expect(alert).toContainText("1,001 returns match this date range");
    await expectNoHorizontalOverflow(page, "Returns overflow compact mobile");
    await alert.scrollIntoViewIfNeeded();
    await captureEvidence(page, "returns-overflow-mobile-320.png");

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(
      `/returns?from=${RETURN_NARROW_DATE}&to=${RETURN_NARROW_DATE}`,
    );
    await expect(page.locator("section table tbody tr")).toHaveCount(7);
    await expect(
      page.getByText(/NARROW-0001/, { exact: false }).first(),
    ).toBeVisible();
    const sortLink = page.getByRole("link", { name: /^Sort by Return/ });
    const sortHref = await sortLink.getAttribute("href");
    expect(sortHref).toContain(`from=${RETURN_NARROW_DATE}`);
    expect(sortHref).toContain(`to=${RETURN_NARROW_DATE}`);
    await sortLink.click();
    await expect(page).toHaveURL(/\/returns\?/);
    await expect(page.locator("section table tbody tr")).toHaveCount(7);
  });

  test("Product Movement makes default and explicit overflow transparent, then restores a complete range", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 430, height: 932 });
    await page.goto("/products");
    const container = page
      .locator("article")
      .filter({ hasText: fixture.productName })
      .first();
    await container.getByRole("button", { name: "Stock & FIFO" }).click();
    const modal = page.locator("div.fixed.inset-0");
    const summaryBefore = await modal
      .getByText("Total remaining", { exact: true })
      .locator("..")
      .innerText();
    await modal.getByRole("button", { name: "Movement ledger" }).click();
    await expect(modal.getByRole("alert")).toContainText(
      "Select a date range that matches 1,000 records or fewer",
    );
    await expect(modal.locator("tbody tr")).toHaveCount(0);

    const inputs = modal.locator('input[type="date"]');
    await inputs.nth(0).fill(MOVEMENT_OVERFLOW_DATE);
    await inputs.nth(1).fill(MOVEMENT_OVERFLOW_DATE);
    await modal.getByRole("button", { name: "Apply" }).click();
    await expect(modal.getByRole("alert")).toContainText(
      "1,001 movements match this date range",
    );
    await expect(modal.locator("tbody tr")).toHaveCount(0);
    expect(
      await modal
        .getByText("Total remaining", { exact: true })
        .locator("..")
        .innerText(),
    ).toBe(summaryBefore);
    await expectNoHorizontalOverflow(page, "Movement overflow mobile");
    await captureEvidence(page, "movement-overflow-mobile-430.png");

    await inputs.nth(0).fill(MOVEMENT_NARROW_DATE);
    await inputs.nth(1).fill(MOVEMENT_NARROW_DATE);
    await modal.getByRole("button", { name: "Apply" }).click();
    await expect(modal.getByRole("alert")).toHaveCount(0);
    await expect(modal.locator("tbody tr")).toHaveCount(7);
    await expect(modal.getByRole("button", { name: "Active Lots" })).toBeVisible();
    await expect(modal.getByRole("button", { name: "Add Stock Lot" })).toBeVisible();
    await expect(modal.getByRole("button", { name: "Manual Audit" })).toBeVisible();
    expect(
      await modal
        .getByText("Total remaining", { exact: true })
        .locator("..")
        .innerText(),
    ).toBe(summaryBefore);
  });

  test("Daily Closing keeps operational views while each history overflows independently", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(
      `/daily-closing?date=${SELECTED_DATE}&history_from=${CLOSING_OVERFLOW_FROM}&history_to=${CLOSING_OVERFLOW_TO}`,
    );
    const selectedBefore = await textSignature(page.getByTestId("selected-day-summary"));
    const activeBefore = await textSignature(page.getByTestId("active-shift-section"));
    const recent = page
      .getByRole("heading", { name: "Recent closings" })
      .locator("xpath=ancestor::section[1]");
    await expect(recent.getByRole("alert")).toContainText(
      "1,001 closings match this history range",
    );
    await expect(recent.locator("tbody tr")).toHaveCount(0);
    await recent.scrollIntoViewIfNeeded();
    await captureEvidence(page, "daily-closing-overflow-desktop.png");

    await page.goto(
      `/daily-closing?date=${SELECTED_DATE}&history_from=${SHIFT_OVERFLOW_FROM}&history_to=${SHIFT_OVERFLOW_TO}`,
    );
    expect(await textSignature(page.getByTestId("selected-day-summary"))).toBe(
      selectedBefore,
    );
    expect(await textSignature(page.getByTestId("active-shift-section"))).toBe(
      activeBefore,
    );
    const shift = page
      .getByRole("heading", { name: "Shift History" })
      .locator("xpath=ancestor::section[1]");
    await expect(shift.getByRole("alert")).toContainText(
      "1,001 shifts opened in this history range",
    );
    await expect(shift.locator("tbody tr")).toHaveCount(0);
    const safeClosings = page
      .getByRole("heading", { name: "Recent closings" })
      .locator("xpath=ancestor::section[1]");
    await expect(safeClosings.locator("tbody tr")).toHaveCount(50);
    await shift.scrollIntoViewIfNeeded();
    await captureEvidence(page, "shift-overflow-independent-desktop.png");

    await page.goto(
      `/daily-closing?date=${SELECTED_DATE}&history_from=${SAFE_HISTORY_FROM}&history_to=${SAFE_HISTORY_TO}`,
    );
    await expect(
      page
        .getByRole("heading", { name: "Recent closings" })
        .locator("xpath=ancestor::section[1]")
        .locator("tbody tr"),
    ).toHaveCount(7);
    await expect(
      page
        .getByRole("heading", { name: "Shift History" })
        .locator("xpath=ancestor::section[1]")
        .locator("tbody tr"),
    ).toHaveCount(7);
  });
});
