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
type ShiftFixtureRow = {
  id: string;
  organization_id: string;
  branch_id: string;
  opened_at: string;
  closed_at: string | null;
  opened_by: string;
  closed_by: string | null;
  starting_cash: number;
  expected_cash: number;
  counted_cash: number | null;
  cash_difference: number | null;
  notes: string;
  status: "open" | "closed";
  created_at: string;
  updated_at: string;
};

const BRANCH_ID = "00000000-0000-4000-8000-000000000101";
const RANGE_FROM = "2020-08-01";
const RANGE_TO = "2020-08-31";
const SELECTED_DATE = "2020-09-01";
const axePath = path.join(process.cwd(), "node_modules/axe-core/axe.min.js");
const evidenceDirectory = process.env.OPERATIONAL_HISTORY_EVIDENCE_DIR;

const fixture = {
  marker: `DATE-RANGE-${randomUUID().slice(0, 8)}`,
  invoiceId: randomUUID(),
  returnIds: [] as string[],
  movementIds: [] as string[],
  closingIds: [] as string[],
  shiftIds: [] as string[],
  ownerProfileId: "",
  productName: "",
};

const baseline = new Map<string, string[]>();

async function expectNoHorizontalOverflow(page: Page, label: string) {
  const geometry = await page.evaluate(() => ({
    viewport: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
  }));
  expect(
    geometry.documentWidth,
    `${label}: ${JSON.stringify(geometry)}`,
  ).toBeLessThanOrEqual(geometry.viewport + 1);
}

async function captureEvidence(page: Page, name: string) {
  if (!evidenceDirectory) return;
  await expect(
    page.getByText("Checking session...", { exact: true }),
  ).toBeHidden();
  await expect(
    page.getByText("Loading SaleDock...", { exact: true }),
  ).toBeHidden();
  await page.screenshot({
    path: path.join(evidenceDirectory, "screenshots", name),
    fullPage: true,
  });
}

async function runAxe(page: Page, region: Locator): Promise<AxeResult> {
  const hasAxe = await page.evaluate(() => "axe" in window);
  if (!hasAxe) await page.addScriptTag({ path: axePath });
  return region.evaluate(async (element) =>
    (
      window as typeof window & {
        axe: {
          run: (context: Element, options: unknown) => Promise<AxeResult>;
        };
      }
    ).axe.run(element, {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
      },
    }),
  );
}

async function textSignature(region: Locator): Promise<string> {
  return region.evaluate((element) =>
    (element.textContent ?? "").replace(/\s+/g, " ").trim(),
  );
}

async function dismissCookieBanner(page: Page) {
  const banner = page.getByTestId("cookie-consent-banner");
  const appeared = await banner
    .waitFor({ state: "visible", timeout: 3_000 })
    .then(() => true)
    .catch(() => false);
  if (!appeared) return;
  await page.getByRole("button", { name: "Reject optional cookies" }).click();
  await expect(banner).toBeHidden();
}

async function requireRows<T>(
  result: { data: T[] | null; error: { message: string } | null },
  label: string,
): Promise<T[]> {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data ?? [];
}

async function snapshotIds(
  admin: AdminClient,
  table: string,
): Promise<string[]> {
  const rows = await requireRows(
    await admin.from(table).select("id").order("id", { ascending: true }),
    `snapshot ${table}`,
  );
  return rows.map((row) => String((row as { id: string }).id));
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
    "load local owner profile",
  );
  fixture.ownerProfileId = String(
    (owners[0] as { id?: string } | undefined)?.id ?? "",
  );
  if (!fixture.ownerProfileId)
    throw new Error("Local owner profile fixture is missing.");

  const products = await requireRows(
    await admin
      .from("products")
      .select("name")
      .eq("id", SEEDED_PHYSICAL_PRODUCT_ID)
      .eq("organization_id", LOCAL_QA_ORG_ID)
      .eq("type", "product")
      .eq("is_active", true)
      .limit(1),
    "load seeded physical product",
  );
  fixture.productName = String(
    (products[0] as { name?: string } | undefined)?.name ?? "",
  );
  if (!fixture.productName)
    throw new Error("Seeded physical product fixture is missing.");

  const invoiceNo = `INV-${fixture.marker}`;
  const invoiceInsert = await admin.from("invoices").insert({
    id: fixture.invoiceId,
    organization_id: LOCAL_QA_ORG_ID,
    branch_id: BRANCH_ID,
    invoice_no: invoiceNo,
    status: "paid",
    subtotal: 100,
    grand_total: 100,
    amount_paid: 100,
    balance_due: 0,
    created_by: fixture.ownerProfileId,
    invoice_date: "2020-08-15T07:00:00.000Z",
    note: fixture.marker,
  });
  if (invoiceInsert.error)
    throw new Error(`insert invoice: ${invoiceInsert.error.message}`);

  const augustTimes = Array.from({ length: 55 }, (_, index) => {
    if (index === 0) return "2020-07-31T19:00:00.000Z";
    if (index === 54) return "2020-08-31T18:59:59.999Z";
    const day = String(1 + (index % 30)).padStart(2, "0");
    const hour = String(index % 18).padStart(2, "0");
    return `2020-08-${day}T${hour}:15:00.000Z`;
  });
  const returnRows = [
    { createdAt: "2020-07-31T18:59:59.999Z", suffix: "BEFORE" },
    ...augustTimes.map((createdAt, index) => ({
      createdAt,
      suffix: String(index + 1).padStart(3, "0"),
    })),
    { createdAt: "2020-08-31T19:00:00.000Z", suffix: "AFTER" },
  ].map(({ createdAt, suffix }) => {
    const id = randomUUID();
    fixture.returnIds.push(id);
    return {
      id,
      organization_id: LOCAL_QA_ORG_ID,
      branch_id: BRANCH_ID,
      invoice_id: fixture.invoiceId,
      return_no: `${fixture.marker}-${suffix}`,
      status: "completed",
      subtotal: 1,
      refund_amount: 1,
      refund_method: "card",
      notes: fixture.marker,
      created_by: fixture.ownerProfileId,
      created_at: createdAt,
      updated_at: createdAt,
    };
  });
  const returnInsert = await admin.from("returns").insert(returnRows);
  if (returnInsert.error)
    throw new Error(`insert returns: ${returnInsert.error.message}`);

  const movementTypes = [
    "opening_stock",
    "purchase",
    "sale",
    "return_in",
    "return_out",
    "adjustment_in",
    "adjustment_out",
  ];
  const movementRows = [
    ...movementTypes.map((movementType, index) => ({
      movementType,
      createdAt: `2020-08-15T0${index}:30:00.000Z`,
      suffix: movementType,
    })),
    {
      movementType: "void",
      createdAt: "2020-07-31T18:59:59.999Z",
      suffix: "before",
    },
    {
      movementType: "void",
      createdAt: "2020-08-31T19:00:00.000Z",
      suffix: "after",
    },
  ].map(({ movementType, createdAt, suffix }) => {
    const id = randomUUID();
    fixture.movementIds.push(id);
    return {
      id,
      organization_id: LOCAL_QA_ORG_ID,
      branch_id: BRANCH_ID,
      product_id: SEEDED_PHYSICAL_PRODUCT_ID,
      movement_type: movementType,
      quantity: 1,
      unit_cost: 10,
      reference_type: "date_range_qa",
      notes: `${fixture.marker}-${suffix}`,
      created_by: fixture.ownerProfileId,
      created_at: createdAt,
    };
  });
  const movementInsert = await admin
    .from("stock_movements")
    .insert(movementRows);
  if (movementInsert.error) {
    throw new Error(`insert stock movements: ${movementInsert.error.message}`);
  }

  const closingRows = [
    ["2020-08-10", 10],
    ["2020-08-20", 20],
    [SELECTED_DATE, 90],
  ].map(([closingDate, amount]) => {
    const id = randomUUID();
    fixture.closingIds.push(id);
    return {
      id,
      organization_id: LOCAL_QA_ORG_ID,
      branch_id: BRANCH_ID,
      closing_date: closingDate,
      bills_count: Number(amount),
      cash_sales: Number(amount),
      expected_closing_cash: Number(amount),
      actual_closing_cash: Number(amount),
      notes: `${fixture.marker}-${closingDate}`,
      finalized_by: fixture.ownerProfileId,
      finalized_at: `${closingDate}T12:00:00.000Z`,
    };
  });
  const closingInsert = await admin.from("daily_closings").insert(closingRows);
  if (closingInsert.error) {
    throw new Error(`insert daily closings: ${closingInsert.error.message}`);
  }

  const shiftRows: ShiftFixtureRow[] = [
    ["2020-08-11T03:00:00.000Z", "2020-08-11T11:00:00.000Z"],
    ["2020-08-21T03:00:00.000Z", "2020-08-21T11:00:00.000Z"],
    ["2020-09-02T03:00:00.000Z", "2020-09-02T11:00:00.000Z"],
  ].map(([openedAt, closedAt], index) => {
    const id = randomUUID();
    fixture.shiftIds.push(id);
    return {
      id,
      organization_id: LOCAL_QA_ORG_ID,
      branch_id: BRANCH_ID,
      opened_at: openedAt,
      closed_at: closedAt,
      opened_by: fixture.ownerProfileId,
      closed_by: fixture.ownerProfileId,
      starting_cash: index + 1,
      expected_cash: index + 1,
      counted_cash: index + 1,
      cash_difference: 0,
      notes: `${fixture.marker}-shift-${index}`,
      status: "closed" as const,
      created_at: openedAt,
      updated_at: closedAt,
    };
  });
  const existingOpenShifts = await requireRows(
    await admin
      .from("cash_shifts")
      .select("id")
      .eq("organization_id", LOCAL_QA_ORG_ID)
      .eq("branch_id", BRANCH_ID)
      .eq("status", "open")
      .limit(1),
    "load current shift",
  );
  if (existingOpenShifts.length === 0) {
    const id = randomUUID();
    fixture.shiftIds.push(id);
    shiftRows.push({
      id,
      organization_id: LOCAL_QA_ORG_ID,
      branch_id: BRANCH_ID,
      opened_at: new Date().toISOString(),
      closed_at: null,
      opened_by: fixture.ownerProfileId,
      closed_by: null,
      starting_cash: 25,
      expected_cash: 25,
      counted_cash: null,
      cash_difference: null,
      notes: `${fixture.marker}-current-shift`,
      status: "open",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }
  const shiftInsert = await admin.from("cash_shifts").insert(shiftRows);
  if (shiftInsert.error)
    throw new Error(`insert cash shifts: ${shiftInsert.error.message}`);
}

async function cleanupFixtures(admin: AdminClient) {
  const deletions = [
    ["cash_shifts", fixture.shiftIds],
    ["daily_closings", fixture.closingIds],
    ["stock_movements", fixture.movementIds],
    ["returns", fixture.returnIds],
    ["invoices", [fixture.invoiceId]],
  ] as const;

  for (const [table, ids] of deletions) {
    if (ids.length === 0) continue;
    const result = await admin.from(table).delete().in("id", ids);
    if (result.error)
      throw new Error(`cleanup ${table}: ${result.error.message}`);
  }

  for (const [table, expected] of baseline) {
    expect(await snapshotIds(admin, table), `${table} cleanup`).toEqual(
      expected,
    );
  }
}

test.describe("operational history date ranges", () => {
  test.describe.configure({ mode: "serial", retries: 0 });
  test.skip(
    !isLocalPlaywrightRun(),
    "Operational history date-range acceptance is intentionally local-only.",
  );

  test.beforeAll(async () => {
    await insertFixtures(getLocalAdminClient());
  });

  test.afterAll(async () => {
    await cleanupFixtures(getLocalAdminClient());
  });

  test.beforeEach(async ({ page }) => {
    await loginLocalOwnerDirectly(page);
    await dismissCookieBanner(page);
  });

  test("Returns preserves the recent default and includes every ranged row and Karachi boundary", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/returns");
    await expect(page.locator("section table tbody tr")).toHaveCount(50);

    await page.goto(`/returns?from=${RANGE_FROM}&to=${RANGE_TO}`);
    const desktopRows = page.locator("section table tbody tr");
    await expect(desktopRows).toHaveCount(55);
    await expect(
      desktopRows.getByText(`${fixture.marker}-001`, { exact: true }),
    ).toBeVisible();
    await expect(
      desktopRows.getByText(`${fixture.marker}-055`, { exact: true }),
    ).toBeVisible();
    await expect(
      desktopRows.filter({ hasText: `${fixture.marker}-001` }),
    ).toContainText("01-Aug-2020, 12:00 am");
    await expect(
      page.getByText(`${fixture.marker}-BEFORE`, { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText(`${fixture.marker}-AFTER`, { exact: true }),
    ).toHaveCount(0);
    await captureEvidence(page, "returns-explicit-range-desktop.png");

    await page.getByRole("link", { name: /^Sort by Return/ }).click();
    await expect(page).toHaveURL(/from=2020-08-01/);
    await expect(page).toHaveURL(/to=2020-08-31/);
    await expect(page).toHaveURL(/sort=created_at/);

    await page.getByRole("link", { name: "Reset" }).click();
    await expect(page).not.toHaveURL(/(?:from|to)=/);

    await page.goto(`/returns?from=${RANGE_FROM}`);
    await expect(
      page
        .locator("section table tbody tr")
        .filter({ hasText: fixture.marker }),
    ).toHaveCount(56);
    await expect(
      page.getByText(`${fixture.marker}-BEFORE`, { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText(`${fixture.marker}-AFTER`, { exact: true }).first(),
    ).toBeVisible();

    await page.goto(`/returns?to=${RANGE_TO}`);
    await expect(
      page
        .locator("section table tbody tr")
        .filter({ hasText: fixture.marker }),
    ).toHaveCount(56);
    await expect(
      page.getByText(`${fixture.marker}-BEFORE`, { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByText(`${fixture.marker}-AFTER`, { exact: true }),
    ).toHaveCount(0);

    await page.goto("/returns?from=2019-01-01&to=2019-01-31");
    await expect(
      page.getByRole("heading", { name: "No returns match this date range" }),
    ).toBeVisible();
  });

  test("Returns fails closed for impossible and reversed dates on mobile", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto("/returns?from=2020-02-31");
    await expect(page.locator("p[role=alert]")).toHaveText(
      "Enter a valid From date.",
    );
    await expect(page.locator("section table tbody tr")).toHaveCount(0);
    await expectNoHorizontalOverflow(page, "Returns impossible date");

    await page.goto("/returns?from=2020-08-31&to=2020-08-01");
    await expect(page.locator("p[role=alert]")).toHaveText(
      "From date cannot be after To date.",
    );
    await expectNoHorizontalOverflow(page, "Returns reversed date");
  });

  test("Product Movement range is isolated from lots and FIFO summary", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/products");
    const product = page
      .getByText(fixture.productName, { exact: true })
      .first();
    const productContainer = product.locator(
      "xpath=ancestor::*[self::tr or self::article][1]",
    );
    await productContainer
      .getByRole("button", { name: "Stock & FIFO" })
      .click();

    const modal = page.locator("div.fixed.inset-0");
    await expect(modal.getByText(/Inventory & FIFO Ledger:/)).toBeVisible();
    const summaryBefore = await modal
      .getByText("Total remaining", { exact: true })
      .locator("..")
      .innerText();
    await modal.getByRole("button", { name: "Movement ledger" }).click();

    const dateInputs = modal.locator('input[type="date"]');
    await dateInputs.nth(0).fill(RANGE_FROM);
    await dateInputs.nth(1).fill(RANGE_TO);
    await modal.getByRole("button", { name: "Apply" }).click();

    const movementRows = modal.locator("tbody tr");
    await expect(movementRows).toHaveCount(7);
    for (const type of [
      "opening stock",
      "purchase",
      "sale",
      "return in",
      "return out",
      "adjustment in",
      "adjustment out",
    ]) {
      await expect(modal.getByText(type, { exact: true })).toBeVisible();
    }
    await expect(
      modal.getByText(`${fixture.marker}-before`, { exact: true }),
    ).toHaveCount(0);
    await expect(
      modal.getByText(`${fixture.marker}-after`, { exact: true }),
    ).toHaveCount(0);
    expect(
      await modal
        .getByText("Total remaining", { exact: true })
        .locator("..")
        .innerText(),
    ).toBe(summaryBefore);
    await captureEvidence(page, "product-movement-range-desktop.png");

    await modal.getByRole("button", { name: "Active Lots" }).click();
    await expect(
      modal.getByText("Purchase Date", { exact: true }),
    ).toBeVisible();
    expect(
      await modal
        .getByText("Total remaining", { exact: true })
        .locator("..")
        .innerText(),
    ).toBe(summaryBefore);
  });

  test("Product Movement rejects a reversed range without mutating modal state", async ({
    page,
  }) => {
    await page.goto("/products");
    const product = page
      .getByText(fixture.productName, { exact: true })
      .first();
    const productContainer = product.locator(
      "xpath=ancestor::*[self::tr or self::article][1]",
    );
    await productContainer
      .getByRole("button", { name: "Stock & FIFO" })
      .click();
    const modal = page.locator("div.fixed.inset-0");
    const summaryBefore = await modal
      .getByText("Total remaining", { exact: true })
      .locator("..")
      .innerText();
    await modal.getByRole("button", { name: "Movement ledger" }).click();
    const dateInputs = modal.locator('input[type="date"]');
    await dateInputs.nth(0).fill(RANGE_TO);
    await dateInputs.nth(1).fill(RANGE_FROM);
    await modal.getByRole("button", { name: "Apply" }).click();

    await expect(modal.locator("p[role=alert]")).toHaveText(
      "From date cannot be after To date.",
    );
    await expect(modal.locator("tbody tr")).toHaveCount(0);
    expect(
      await modal
        .getByText("Total remaining", { exact: true })
        .locator("..")
        .innerText(),
    ).toBe(summaryBefore);
    await modal.getByRole("button", { name: "Add Stock Lot" }).click();
    await expect(modal.getByText(/Add restock cost batch lot/)).toBeVisible();
  });

  test("Daily Closing filters both histories while preserving selected-day and active-shift context", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(
      `/daily-closing?date=${SELECTED_DATE}&history_from=${RANGE_FROM}&history_to=${RANGE_TO}`,
    );
    await expect(page.locator('input[type="date"][name="date"]')).toHaveValue(
      SELECTED_DATE,
    );
    await expect(
      page.locator('input[type="date"][name="history_from"]'),
    ).toHaveValue(RANGE_FROM);
    await expect(
      page.locator('input[type="date"][name="history_to"]'),
    ).toHaveValue(RANGE_TO);
    await expect(
      page.getByRole("heading", { name: "Active Shift" }),
    ).toBeVisible();

    const selectedDayBefore = await textSignature(
      page.getByTestId("selected-day-summary"),
    );
    const activeShiftBefore = await textSignature(
      page.getByTestId("active-shift-section"),
    );
    const recentSection = page
      .getByRole("heading", { name: "Recent closings" })
      .locator("xpath=ancestor::section[1]");
    const closingRows = recentSection.locator("tbody tr");
    await expect(closingRows).toHaveCount(2);
    await expect(closingRows.getByText(/10 August 2020/)).toBeVisible();
    await expect(closingRows.getByText(/20 August 2020/)).toBeVisible();
    await expect(closingRows.getByText(/01 September 2020/)).toHaveCount(0);

    const shiftSection = page
      .getByRole("heading", { name: "Shift History" })
      .locator("xpath=ancestor::section[1]");
    await expect(shiftSection.locator("tbody tr")).toHaveCount(2);
    await captureEvidence(page, "daily-closing-history-desktop.png");

    await page.goto(
      `/daily-closing?date=${SELECTED_DATE}&history_from=2020-07-01&history_to=2020-07-31`,
    );
    await expect(page.locator('input[type="date"][name="date"]')).toHaveValue(
      SELECTED_DATE,
    );
    expect(await textSignature(page.getByTestId("selected-day-summary"))).toBe(
      selectedDayBefore,
    );
    expect(await textSignature(page.getByTestId("active-shift-section"))).toBe(
      activeShiftBefore,
    );
    await expect(
      page.getByText("No shifts match this history range."),
    ).toBeVisible();
    await expect(
      page.getByText("No closings match this history range."),
    ).toBeVisible();

    await page.goto(
      `/daily-closing?date=${SELECTED_DATE}&history_from=${RANGE_FROM}&history_to=${RANGE_TO}`,
    );
    const sortHref = await page
      .getByRole("link", { name: /^Sort by Date/ })
      .getAttribute("href");
    expect(sortHref).toContain("date=2020-09-01");
    expect(sortHref).toContain("history_from=2020-08-01");
    expect(sortHref).toContain("history_to=2020-08-31");
    await page.goto(
      sortHref!.startsWith("?") ? `/daily-closing${sortHref}` : sortHref!,
    );
    await expect(page).toHaveURL(/date=2020-09-01/);
    await expect(page).toHaveURL(/history_from=2020-08-01/);
    await expect(page).toHaveURL(/history_to=2020-08-31/);

    const sortedRecentSection = page
      .getByRole("heading", { name: "Recent closings" })
      .locator("xpath=ancestor::section[1]");
    const openHref = await sortedRecentSection
      .getByRole("link", { name: "Open" })
      .first()
      .getAttribute("href");
    expect(openHref).toContain("history_from=2020-08-01");
    expect(openHref).toContain("history_to=2020-08-31");
    await page.goto(openHref!);
    await expect(page).toHaveURL(/history_from=2020-08-01/);
    await expect(page).toHaveURL(/history_to=2020-08-31/);
    await expect(
      page.getByRole("heading", { name: "Active Shift" }),
    ).toBeVisible();
    expect(await textSignature(page.getByTestId("active-shift-section"))).toBe(
      activeShiftBefore,
    );
  });

  test("Daily Closing invalid history fails closed without suppressing operational data", async ({
    page,
  }) => {
    await page.goto(
      `/daily-closing?date=${SELECTED_DATE}&history_from=2020-02-31`,
    );
    await expect(page.locator("p[role=alert]")).toContainText(
      "Enter a valid History From date.",
    );
    await expect(page.locator('input[type="date"][name="date"]')).toHaveValue(
      SELECTED_DATE,
    );
    await expect(
      page.getByRole("heading", { name: "Active Shift" }),
    ).toBeVisible();
    await expect(
      page.getByText("Gross sales", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByText("Fix the History range to load shift history."),
    ).toBeVisible();
    await expect(
      page.getByText("Fix the History range to load closing history."),
    ).toBeVisible();
  });

  test("Daily Closing history controls remain usable across mobile widths", async ({
    page,
  }) => {
    for (const viewport of [
      { width: 320, height: 568 },
      { width: 390, height: 844 },
      { width: 430, height: 932 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto(
        `/daily-closing?date=${SELECTED_DATE}&history_from=${RANGE_FROM}&history_to=${RANGE_TO}`,
      );
      await expect(
        page.locator('input[type="date"][name="history_from"]'),
      ).toBeVisible();
      await expect(
        page.locator('input[type="date"][name="history_to"]'),
      ).toBeVisible();
      await expect(page.getByRole("link", { name: "Reset" })).toBeVisible();
      await expectNoHorizontalOverflow(
        page,
        `Daily Closing history ${viewport.width}px`,
      );
      if (viewport.width === 390) {
        await captureEvidence(page, "daily-closing-history-mobile-390.png");
      }
    }
  });

  test("new range controls remain accessible in light/dark and the movement modal fits mobile", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/returns?from=${RANGE_FROM}&to=${RANGE_TO}`);
    const returnsFilter = page
      .getByText("Return date", { exact: true })
      .locator("xpath=ancestor::section[1]");
    for (const dark of [false, true]) {
      await page.evaluate(
        (value) => document.documentElement.classList.toggle("dark", value),
        dark,
      );
      expect((await runAxe(page, returnsFilter)).violations).toEqual([]);
    }
    await captureEvidence(page, "returns-range-dark-mobile-390.png");

    for (const viewport of [
      { width: 320, height: 568 },
      { width: 390, height: 844 },
      { width: 430, height: 932 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto("/products");
      await dismissCookieBanner(page);
      const productContainer = page
        .locator("article")
        .filter({ hasText: fixture.productName })
        .first();
      await productContainer.evaluate((element) =>
        element.scrollIntoView({ block: "center" }),
      );
      await productContainer
        .getByRole("button", { name: "Stock & FIFO" })
        .click();
      const modal = page.locator("div.fixed.inset-0");
      await modal.getByRole("button", { name: "Movement ledger" }).click();
      const movementFilter = modal.locator("form").first();
      await expect(movementFilter).toBeVisible();
      await expectNoHorizontalOverflow(
        page,
        `Product Movement modal ${viewport.width}px`,
      );
      if (viewport.width === 390) {
        for (const dark of [false, true]) {
          await page.evaluate(
            (value) => document.documentElement.classList.toggle("dark", value),
            dark,
          );
          expect((await runAxe(page, movementFilter)).violations).toEqual([]);
        }
      }
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(
      `/daily-closing?date=${SELECTED_DATE}&history_from=${RANGE_FROM}&history_to=${RANGE_TO}`,
    );
    const dailyFilter = page
      .getByRole("heading", { name: "History range" })
      .locator("xpath=ancestor::section[1]");
    for (const dark of [false, true]) {
      await page.evaluate(
        (value) => document.documentElement.classList.toggle("dark", value),
        dark,
      );
      expect((await runAxe(page, dailyFilter)).violations).toEqual([]);
    }
  });
});
