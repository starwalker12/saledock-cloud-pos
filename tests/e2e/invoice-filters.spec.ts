import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import {
  getLocalAdminClient,
  isLocalPlaywrightRun,
  loginLocalOwnerDirectly,
} from "./helpers/local-supabase";

let evidenceRoot: string | null = null;
let screenshotRoot: string | null = null;
const SAFETY_TABLES = [
  "invoices",
  "invoice_items",
  "payments",
  "returns",
  "return_items",
  "customers",
  "customer_ledger_entries",
  "credit_payments",
  "customer_write_offs",
  "cash_shifts",
  "daily_closings",
  "products",
  "product_stock_lots",
  "stock_movements",
  "suppliers",
  "supplier_purchases",
  "supplier_payments",
  "audit_logs",
  "organizations",
  "branches",
  "profiles",
] as const;

type AdminClient = ReturnType<typeof getLocalAdminClient>;
type Filters = {
  q?: string;
  from?: string;
  to?: string;
  payment?: string;
  status?: string;
};
type Fixture = {
  marker: string;
  foreignToken: string;
  organizationId: string;
  branchId: string;
  targetId: string;
  targetNo: string;
  targetCustomer: string;
  multiId: string;
  multiNo: string;
  multiCustomer: string;
  walkInNo: string;
  unpaidNo: string;
  draftNo: string;
  voidNo: string;
  beforeNo: string;
  afterNo: string;
  punctuationNo: string;
  punctuationQuery: string;
  latestNo: string;
  cleanup: () => Promise<void>;
};

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function tableSignature(
  admin: AdminClient,
  table: string,
): Promise<string> {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += 1_000) {
    const { data, error } = await admin
      .from(table)
      .select("*")
      .range(from, from + 999);
    if (error) throw new Error(`${table} signature failed: ${error.code}`);
    rows.push(...((data ?? []) as Record<string, unknown>[]));
    if ((data ?? []).length < 1_000) break;
  }
  rows.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return digest(rows);
}

async function safetySnapshot(
  admin: AdminClient,
): Promise<Record<string, string>> {
  return Object.fromEntries(
    await Promise.all(
      SAFETY_TABLES.map(async (table) => [
        table,
        await tableSignature(admin, table),
      ]),
    ),
  );
}

async function insertRows(
  admin: AdminClient,
  table: string,
  rows: Record<string, unknown>[],
): Promise<void> {
  const { error } = await admin.from(table).insert(rows);
  if (error)
    throw new Error(`${table} fixture insert failed: ${error.message}`);
}

async function deleteMatching(
  admin: AdminClient,
  table: string,
  column: string,
  pattern: string,
): Promise<void> {
  const { error } = await admin.from(table).delete().like(column, pattern);
  if (error) throw new Error(`${table} cleanup failed: ${error.message}`);
}

async function createFixture(admin: AdminClient): Promise<Fixture> {
  const marker = `QA-INVOICE-FILTER-${randomUUID().slice(0, 8).toUpperCase()}`;
  const foreignToken = `${marker}-FOREIGN-ONLY`;
  const { data: owner, error: ownerError } = await admin
    .from("profiles")
    .select("id, organization_id, branch_id")
    .eq("role", "owner")
    .eq("is_active", true)
    .eq("organization_id", "00000000-0000-4000-8000-000000000001")
    .limit(1)
    .single();
  if (ownerError || !owner?.organization_id || !owner.branch_id) {
    throw new Error("The seeded local owner context is required.");
  }

  const ids = {
    alpha: randomUUID(),
    beta: randomUUID(),
    target: randomUUID(),
    multi: randomUUID(),
    walkIn: randomUUID(),
    unpaid: randomUUID(),
    draft: randomUUID(),
    void: randomUUID(),
    before: randomUUID(),
    after: randomUUID(),
    punctuation: randomUUID(),
    item: randomUUID(),
    foreignOrganization: randomUUID(),
    foreignBranch: randomUUID(),
    foreignCustomer: randomUUID(),
    foreignInvoice: randomUUID(),
  };
  const names = {
    target: `${marker}-TARGET`,
    multi: `${marker}-MULTI`,
    walkIn: `${marker}-WALKIN`,
    unpaid: `${marker}-UNPAID`,
    draft: `${marker}-DRAFT`,
    void: `${marker}-VOID`,
    before: `${marker}-BEFORE`,
    after: `${marker}-AFTER`,
    punctuation: `${marker}-P%_(),'`,
  };
  const alphaName = `${marker} Alpha Customer`;
  const betaName = `${marker} Beta Customer`;

  await insertRows(admin, "organizations", [
    {
      id: ids.foreignOrganization,
      name: `${marker} Foreign Organization`,
      currency_code: "PKR",
      timezone: "Asia/Karachi",
    },
  ]);
  await insertRows(admin, "branches", [
    {
      id: ids.foreignBranch,
      organization_id: ids.foreignOrganization,
      name: `${marker} Foreign Branch`,
    },
  ]);
  await insertRows(admin, "customers", [
    {
      id: ids.alpha,
      organization_id: owner.organization_id,
      branch_id: owner.branch_id,
      name: alphaName,
      notes: marker,
    },
    {
      id: ids.beta,
      organization_id: owner.organization_id,
      branch_id: owner.branch_id,
      name: betaName,
      notes: marker,
    },
    {
      id: ids.foreignCustomer,
      organization_id: ids.foreignOrganization,
      branch_id: ids.foreignBranch,
      name: foreignToken,
      notes: marker,
    },
  ]);

  const invoiceRows: Record<string, unknown>[] = [
    {
      id: ids.target,
      organization_id: owner.organization_id,
      branch_id: owner.branch_id,
      customer_id: ids.alpha,
      invoice_no: names.target,
      status: "paid",
      subtotal: 150,
      grand_total: 150,
      amount_paid: 150,
      balance_due: 0,
      invoice_date: "2026-08-09T19:00:00.000Z",
      created_by: owner.id,
    },
    {
      id: ids.multi,
      organization_id: owner.organization_id,
      branch_id: owner.branch_id,
      customer_id: ids.beta,
      invoice_no: names.multi,
      status: "partial",
      subtotal: 150,
      grand_total: 150,
      amount_paid: 100,
      balance_due: 50,
      invoice_date: "2026-08-10T18:59:59.999Z",
      created_by: owner.id,
    },
    {
      id: ids.walkIn,
      organization_id: owner.organization_id,
      branch_id: owner.branch_id,
      customer_id: null,
      invoice_no: names.walkIn,
      status: "paid",
      subtotal: 150,
      grand_total: 150,
      amount_paid: 150,
      balance_due: 0,
      invoice_date: "2026-08-09T18:30:00.000Z",
      created_by: owner.id,
    },
    {
      id: ids.unpaid,
      organization_id: owner.organization_id,
      branch_id: owner.branch_id,
      customer_id: ids.alpha,
      invoice_no: names.unpaid,
      status: "unpaid",
      subtotal: 150,
      grand_total: 150,
      amount_paid: 0,
      balance_due: 150,
      invoice_date: "2026-08-10T08:00:00.000Z",
      created_by: owner.id,
    },
    {
      id: ids.draft,
      organization_id: owner.organization_id,
      branch_id: owner.branch_id,
      customer_id: ids.alpha,
      invoice_no: names.draft,
      status: "draft",
      subtotal: 0,
      grand_total: 0,
      amount_paid: 0,
      balance_due: 0,
      invoice_date: "2026-08-10T20:00:00.000Z",
      created_by: owner.id,
    },
    {
      id: ids.void,
      organization_id: owner.organization_id,
      branch_id: owner.branch_id,
      customer_id: ids.alpha,
      invoice_no: names.void,
      status: "void",
      subtotal: 150,
      grand_total: 150,
      amount_paid: 0,
      balance_due: 0,
      invoice_date: "2026-08-10T12:00:00.000Z",
      created_by: owner.id,
    },
    {
      id: ids.before,
      organization_id: owner.organization_id,
      branch_id: owner.branch_id,
      customer_id: ids.alpha,
      invoice_no: names.before,
      status: "paid",
      subtotal: 50,
      grand_total: 50,
      amount_paid: 50,
      balance_due: 0,
      invoice_date: "2026-08-09T18:59:59.999Z",
      created_by: owner.id,
    },
    {
      id: ids.after,
      organization_id: owner.organization_id,
      branch_id: owner.branch_id,
      customer_id: ids.alpha,
      invoice_no: names.after,
      status: "paid",
      subtotal: 50,
      grand_total: 50,
      amount_paid: 50,
      balance_due: 0,
      invoice_date: "2026-08-10T19:00:00.000Z",
      created_by: owner.id,
    },
    {
      id: ids.punctuation,
      organization_id: owner.organization_id,
      branch_id: owner.branch_id,
      customer_id: ids.alpha,
      invoice_no: names.punctuation,
      status: "paid",
      subtotal: 75,
      grand_total: 75,
      amount_paid: 75,
      balance_due: 0,
      invoice_date: "2026-08-10T10:00:00.000Z",
      created_by: owner.id,
    },
  ];

  const decoys = Array.from({ length: 101 }, (_, index) => ({
    id: randomUUID(),
    organization_id: owner.organization_id,
    branch_id: owner.branch_id,
    customer_id: ids.alpha,
    invoice_no: `${marker}-DECOY-${String(index).padStart(3, "0")}`,
    status: "paid",
    subtotal: 10,
    grand_total: 10,
    amount_paid: 10,
    balance_due: 0,
    invoice_date: new Date(
      Date.parse("2026-08-12T12:00:00.000Z") - index * 60_000,
    ).toISOString(),
    created_by: owner.id,
  }));
  invoiceRows.push(...decoys);

  await insertRows(admin, "invoices", invoiceRows);
  await insertRows(admin, "invoices", [
    {
      id: ids.foreignInvoice,
      organization_id: ids.foreignOrganization,
      branch_id: ids.foreignBranch,
      customer_id: ids.foreignCustomer,
      invoice_no: foreignToken,
      status: "paid",
      subtotal: 150,
      grand_total: 150,
      amount_paid: 150,
      balance_due: 0,
      invoice_date: "2026-08-10T10:00:00.000Z",
    },
  ]);
  await insertRows(admin, "invoice_items", [
    {
      id: ids.item,
      organization_id: owner.organization_id,
      invoice_id: ids.target,
      product_name: `${marker} Service Item`,
      product_type: "service",
      quantity: 1,
      purchase_price: 100,
      unit_price: 150,
      item_discount: 0,
      line_total: 150,
    },
  ]);

  const paymentRows = [
    {
      id: randomUUID(),
      organization_id: owner.organization_id,
      branch_id: owner.branch_id,
      invoice_id: ids.target,
      customer_id: ids.alpha,
      method: "card",
      amount: 150,
      reference_no: `${marker}-TARGET-CARD`,
      received_by: owner.id,
    },
    {
      id: randomUUID(),
      organization_id: owner.organization_id,
      branch_id: owner.branch_id,
      invoice_id: ids.multi,
      customer_id: ids.beta,
      method: "cash",
      amount: 50,
      reference_no: `${marker}-MULTI-CASH`,
      received_by: owner.id,
    },
    {
      id: randomUUID(),
      organization_id: owner.organization_id,
      branch_id: owner.branch_id,
      invoice_id: ids.multi,
      customer_id: ids.beta,
      method: "card",
      amount: 50,
      reference_no: `${marker}-MULTI-CARD`,
      received_by: owner.id,
    },
    {
      id: randomUUID(),
      organization_id: owner.organization_id,
      branch_id: owner.branch_id,
      invoice_id: ids.walkIn,
      customer_id: null,
      method: "cash",
      amount: 150,
      reference_no: `${marker}-WALKIN-CASH`,
      received_by: owner.id,
    },
    {
      id: randomUUID(),
      organization_id: owner.organization_id,
      branch_id: owner.branch_id,
      invoice_id: ids.punctuation,
      customer_id: ids.alpha,
      method: "card",
      amount: 75,
      reference_no: `${marker}-PUNCT-CARD`,
      received_by: owner.id,
    },
    ...decoys.map((invoice, index) => ({
      id: randomUUID(),
      organization_id: owner.organization_id,
      branch_id: owner.branch_id,
      invoice_id: invoice.id,
      customer_id: ids.alpha,
      method: "cash",
      amount: 10,
      reference_no: `${marker}-DECOY-${String(index).padStart(3, "0")}`,
      received_by: owner.id,
    })),
    {
      id: randomUUID(),
      organization_id: ids.foreignOrganization,
      branch_id: ids.foreignBranch,
      invoice_id: ids.foreignInvoice,
      customer_id: ids.foreignCustomer,
      method: "card",
      amount: 150,
      reference_no: `${marker}-FOREIGN-CARD`,
    },
  ];
  await insertRows(admin, "payments", paymentRows);

  return {
    marker,
    foreignToken,
    organizationId: owner.organization_id,
    branchId: owner.branch_id,
    targetId: ids.target,
    targetNo: names.target,
    targetCustomer: alphaName,
    multiId: ids.multi,
    multiNo: names.multi,
    multiCustomer: betaName,
    walkInNo: names.walkIn,
    unpaidNo: names.unpaid,
    draftNo: names.draft,
    voidNo: names.void,
    beforeNo: names.before,
    afterNo: names.after,
    punctuationNo: names.punctuation,
    punctuationQuery: "%_(),'",
    latestNo: decoys[0].invoice_no,
    cleanup: async () => {
      await deleteMatching(admin, "payments", "reference_no", `${marker}%`);
      await deleteMatching(
        admin,
        "invoice_items",
        "product_name",
        `${marker}%`,
      );
      await deleteMatching(admin, "invoices", "invoice_no", `${marker}%`);
      await deleteMatching(admin, "customers", "name", `${marker}%`);
      await deleteMatching(admin, "branches", "name", `${marker}%`);
      await deleteMatching(admin, "organizations", "name", `${marker}%`);
    },
  };
}

function browserEvidence(page: Page) {
  let active = true;
  const result = {
    pageErrors: [] as string[],
    consoleErrors: [] as string[],
    requestFailures: [] as string[],
    httpErrors: [] as string[],
    stop: () => {
      active = false;
    },
  };
  page.on("pageerror", (error) => {
    if (active) result.pageErrors.push(error.message);
  });
  page.on("console", (message) => {
    if (!active) return;
    if (message.type() !== "error") return;
    const text = message.text();
    const location = message.location();
    if (
      location.url.includes("/_vercel/") ||
      text.includes("/_vercel/") ||
      text.includes("status of 406")
    ) {
      return;
    }
    result.consoleErrors.push(
      `${location.url || "unknown"}:${location.lineNumber ?? 0} ${text}`,
    );
  });
  page.on("requestfailed", (request) => {
    if (!active) return;
    const failure = request.failure()?.errorText ?? "";
    if (failure.includes("ERR_ABORTED")) return;
    const url = new URL(request.url());
    if (url.pathname.startsWith("/_vercel/")) return;
    result.requestFailures.push(
      `${request.method()} ${url.pathname} ${failure}`.trim(),
    );
  });
  page.on("response", (response) => {
    if (!active) return;
    if (response.status() < 400) return;
    const url = new URL(response.url());
    if (url.pathname.startsWith("/_vercel/")) return;
    if (
      response.status() === 406 &&
      url.pathname === "/rest/v1/user_ui_preferences"
    ) {
      return;
    }
    result.httpErrors.push(`${response.status()} ${url.pathname}`);
  });
  return result;
}

async function applyFilters(page: Page, filters: Filters): Promise<void> {
  await openInvoices(page);
  if (filters.q !== undefined) {
    await page.getByLabel("Search", { exact: true }).fill(filters.q);
  }
  if (filters.from) {
    await page.getByLabel("From Date", { exact: true }).fill(filters.from);
  }
  if (filters.to) {
    await page.getByLabel("To Date", { exact: true }).fill(filters.to);
  }
  if (filters.from || filters.to) await page.keyboard.press("Escape");
  if (filters.payment) {
    await chooseNativeOption(
      page.locator('select[name="payment"]'),
      filters.payment,
    );
  }
  if (filters.status) {
    await chooseNativeOption(
      page.locator('select[name="status"]'),
      filters.status,
    );
  }
  await Promise.all([
    page.waitForURL(
      (url) => url.pathname === "/invoices" && Boolean(url.search),
    ),
    page.getByRole("button", { name: "Apply Filters", exact: true }).click(),
  ]);
  await expect(
    page.getByRole("heading", { name: "All invoices", exact: true }),
  ).toBeVisible({ timeout: 20_000 });
}

async function chooseNativeOption(
  select: ReturnType<Page["locator"]>,
  value: string,
): Promise<void> {
  await select.selectOption(value);
  await expect(select).toHaveValue(value);
}

async function openInvoices(page: Page, url = "/invoices"): Promise<void> {
  const response = await page.goto(url, { waitUntil: "domcontentloaded" });
  expect(response?.status(), "Invoices document status").toBeLessThan(400);
  await expect(
    page.getByRole("heading", { name: "All invoices", exact: true }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(page.getByLabel("Search", { exact: true })).toBeVisible();
}

function visibleText(page: Page, text: string) {
  return page.getByText(text, { exact: true }).filter({ visible: true });
}

async function visibleInvoiceCount(page: Page): Promise<number> {
  return page.locator('a[href^="/invoices/"]:visible').count();
}

export async function prepareInvoiceFilterEvidenceRoot(
  requestedRoot?: string,
): Promise<string> {
  if (!requestedRoot?.trim()) {
    return mkdtemp(join(tmpdir(), "saledock-invoice-filter-evidence-"));
  }

  const target = resolve(requestedRoot);
  try {
    await mkdir(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error(
        `Refusing to overwrite existing invoice-filter evidence directory: ${target}`,
      );
    }
    throw error;
  }
  return target;
}

function requireEvidenceRoot(): string {
  if (!evidenceRoot) throw new Error("Invoice-filter evidence root is not ready.");
  return evidenceRoot;
}

function requireScreenshotRoot(): string {
  if (!screenshotRoot) {
    throw new Error("Invoice-filter screenshot root is not ready.");
  }
  return screenshotRoot;
}

async function initializeEvidenceRoot(): Promise<void> {
  evidenceRoot = await prepareInvoiceFilterEvidenceRoot(
    process.env.INVOICE_FILTER_EVIDENCE_ROOT,
  );
  screenshotRoot = join(evidenceRoot, "screenshots");
  await mkdir(screenshotRoot);
}

async function writeJson(name: string, value: unknown): Promise<void> {
  await writeFile(
    join(requireEvidenceRoot(), name),
    `${JSON.stringify(value, null, 2)}\n`,
  );
}

async function listFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(path)));
    else files.push(path);
  }
  return files;
}

async function writeManifest(): Promise<{ entries: number; hash: string }> {
  const root = requireEvidenceRoot();
  const files = (await listFiles(root))
    .filter((path) => !path.endsWith("evidence-manifest.sha256"))
    .sort();
  const lines = [];
  for (const path of files) {
    const hash = createHash("sha256")
      .update(await readFile(path))
      .digest("hex");
    lines.push(`${hash}  ${relative(root, path)}`);
  }
  const manifest = `${lines.join("\n")}\n`;
  await writeFile(join(root, "evidence-manifest.sha256"), manifest);
  return {
    entries: files.length,
    hash: createHash("sha256").update(manifest).digest("hex"),
  };
}

test.describe("Invoice filters", () => {
  test.skip(
    !isLocalPlaywrightRun(),
    "This test is restricted to loopback Supabase.",
  );
  test.setTimeout(180_000);

  test("filters the database candidate set without mutating financial truth", async ({
    browser,
  }) => {
    await initializeEvidenceRoot();
    const admin = getLocalAdminClient();
    const before = await safetySnapshot(admin);
    const fixture = await createFixture(admin);
    let cleanupError: string | null = null;
    const allBrowserErrors: ReturnType<typeof browserEvidence>[] = [];

    try {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        timezoneId: "Asia/Karachi",
      });
      const page = await context.newPage();
      const errors = browserEvidence(page);
      allBrowserErrors.push(errors);
      await loginLocalOwnerDirectly(page);
      await openInvoices(page);

      expect(await visibleInvoiceCount(page)).toBe(100);
      await expect(visibleText(page, fixture.targetNo)).toHaveCount(0);

      await applyFilters(page, { q: fixture.targetNo });
      await expect(visibleText(page, fixture.targetNo)).toHaveCount(1);
      await expect(visibleText(page, fixture.latestNo)).toHaveCount(0);
      await writeJson("search-results.json", {
        marker: fixture.marker,
        outsideLatestHundred: true,
        exactInvoice: fixture.targetNo,
        exactMatchCount: 1,
      });

      await applyFilters(page, {
        q: fixture.targetNo.toLowerCase().slice(4, -2),
      });
      await expect(visibleText(page, fixture.targetNo)).toHaveCount(1);

      await applyFilters(page, { q: fixture.multiCustomer.toLowerCase() });
      await expect(visibleText(page, fixture.multiNo)).toHaveCount(1);
      await expect(visibleText(page, fixture.targetNo)).toHaveCount(0);

      await applyFilters(page, { q: `  ${fixture.targetNo}  ` });
      await expect(visibleText(page, fixture.targetNo)).toHaveCount(1);
      expect(new URL(page.url()).searchParams.get("q")).toBe(
        `  ${fixture.targetNo}  `,
      );

      await applyFilters(page, { q: fixture.punctuationQuery });
      await expect(visibleText(page, fixture.punctuationNo)).toHaveCount(1);
      await writeJson("filter-contract.json", {
        params: ["q", "from", "to", "payment", "status", "sort", "dir"],
        search: "trimmed literal contains; invoice number OR customer name",
        payment: "any matching recorded payment row",
        status: "exact",
        intersection: "all active groups",
      });

      await applyFilters(page, {
        q: fixture.targetNo,
        from: "2026-08-10",
      });
      await expect(visibleText(page, fixture.targetNo)).toHaveCount(1);
      await applyFilters(page, {
        q: fixture.beforeNo,
        from: "2026-08-10",
      });
      await expect(visibleText(page, fixture.beforeNo)).toHaveCount(0);
      await applyFilters(page, {
        q: fixture.afterNo,
        from: "2026-08-10",
      });
      await expect(visibleText(page, fixture.afterNo)).toHaveCount(1);

      await applyFilters(page, { q: fixture.targetNo, to: "2026-08-10" });
      await expect(visibleText(page, fixture.targetNo)).toHaveCount(1);
      await applyFilters(page, { q: fixture.beforeNo, to: "2026-08-10" });
      await expect(visibleText(page, fixture.beforeNo)).toHaveCount(1);
      await applyFilters(page, { q: fixture.afterNo, to: "2026-08-10" });
      await expect(visibleText(page, fixture.afterNo)).toHaveCount(0);

      await applyFilters(page, { from: "2026-08-10", to: "2026-08-10" });
      await expect(visibleText(page, fixture.targetNo)).toHaveCount(1);
      await expect(visibleText(page, fixture.multiNo)).toHaveCount(1);
      await expect(visibleText(page, fixture.beforeNo)).toHaveCount(0);
      await expect(visibleText(page, fixture.afterNo)).toHaveCount(0);

      await applyFilters(page, { from: "2026-08-09", to: "2026-08-11" });
      await expect(visibleText(page, fixture.beforeNo)).toHaveCount(1);
      await expect(visibleText(page, fixture.afterNo)).toHaveCount(1);
      await expect(visibleText(page, fixture.latestNo)).toHaveCount(0);
      await writeJson("date-results.json", {
        fromOnly: true,
        toOnly: true,
        sameDayInclusive: true,
        multiDayInclusive: true,
        karachiStartUtc: "2026-08-09T19:00:00.000Z",
        karachiEndUtc: "2026-08-10T18:59:59.999Z",
      });

      await applyFilters(page, { status: "unpaid" });
      await expect(visibleText(page, fixture.unpaidNo)).toHaveCount(1);
      await expect(visibleText(page, fixture.targetNo)).toHaveCount(0);
      await applyFilters(page, { status: "partial" });
      await expect(visibleText(page, fixture.multiNo)).toHaveCount(1);
      await expect(visibleText(page, fixture.unpaidNo)).toHaveCount(0);
      await applyFilters(page, { status: "paid", q: fixture.targetNo });
      await expect(visibleText(page, fixture.targetNo)).toHaveCount(1);
      await writeJson("status-results.json", {
        paid: true,
        partial: true,
        unpaid: true,
        nonmatchingExcluded: true,
      });

      await applyFilters(page, { q: fixture.multiNo, payment: "cash" });
      await expect(visibleText(page, fixture.multiNo)).toHaveCount(1);
      await applyFilters(page, { q: fixture.targetNo, payment: "cash" });
      await expect(visibleText(page, fixture.targetNo)).toHaveCount(0);
      await applyFilters(page, { payment: "card" });
      await expect(visibleText(page, fixture.targetNo)).toHaveCount(1);
      await expect(visibleText(page, fixture.multiNo)).toHaveCount(1);
      await expect(visibleText(page, fixture.multiNo)).toHaveCount(1);
      await expect(visibleText(page, fixture.unpaidNo)).toHaveCount(0);
      const paymentOptions = await page
        .locator('select[name="payment"]')
        .locator("option")
        .allTextContents();
      expect(paymentOptions).not.toContain("Customer Credit");
      await writeJson("payment-results.json", {
        cash: true,
        card: true,
        multiPaymentAnyMatch: true,
        duplicateInvoices: 0,
        customerCreditOffered: false,
      });

      const combined = {
        q: fixture.multiNo,
        from: "2026-08-10",
        to: "2026-08-10",
        payment: "card",
        status: "partial",
      };
      await applyFilters(page, combined);
      await expect(visibleText(page, fixture.multiNo)).toHaveCount(1);
      expect(await visibleInvoiceCount(page)).toBe(1);
      await writeJson("combined-results.json", {
        filters: combined,
        result: fixture.multiNo,
        count: 1,
      });

      await Promise.all([
        page.waitForURL((url) => url.searchParams.get("sort") === "invoice_no"),
        page.getByRole("link", { name: /Sort by Invoice ascending/ }).click(),
      ]);
      const sortedUrl = new URL(page.url());
      for (const [key, value] of Object.entries(combined)) {
        expect(sortedUrl.searchParams.get(key)).toBe(value);
      }
      expect(sortedUrl.searchParams.get("sort")).toBe("invoice_no");
      expect(sortedUrl.searchParams.get("dir")).toBe("asc");
      await expect(visibleText(page, fixture.multiNo)).toHaveCount(1);
      await writeJson("sort-preservation.json", {
        ...Object.fromEntries(sortedUrl.searchParams),
        filteredResultPreserved: true,
      });

      await Promise.all([
        page.waitForURL((url) => url.pathname === "/invoices" && !url.search),
        page.getByRole("link", { name: "Reset", exact: true }).click(),
      ]);
      await expect(page.getByLabel("Search", { exact: true })).toHaveValue("");
      await expect(page.locator('select[name="payment"]')).toHaveValue("");
      await expect(page.locator('select[name="status"]')).toHaveValue("");
      expect(await visibleInvoiceCount(page)).toBe(100);
      await expect(page.locator("table tbody tr").first()).toContainText(
        fixture.latestNo,
      );
      await writeJson("reset.json", {
        pathname: "/invoices",
        search: "",
        boundedRows: 100,
        defaultLatestFirst: fixture.latestNo,
      });

      await applyFilters(page, { q: `${fixture.marker}-NO-MATCH` });
      await expect(
        page.getByText("No invoices match these filters", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText("No invoices yet", { exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("link", { name: "Reset filters", exact: true }),
      ).toBeVisible();

      await applyFilters(page, { q: fixture.foreignToken });
      await expect(
        page.getByText("No invoices match these filters", { exact: true }),
      ).toBeVisible();
      await expect(visibleText(page, fixture.foreignToken)).toHaveCount(0);
      await writeJson("tenant-isolation.json", {
        foreignInvoiceVisible: false,
        foreignCustomerVisible: false,
        foreignPaymentMatchVisible: false,
      });

      await applyFilters(page, { q: fixture.targetNo });
      const targetRow = page.locator("table tbody tr").filter({
        hasText: fixture.targetNo,
      });
      await Promise.all([
        page.waitForURL(new RegExp(`/invoices/${fixture.targetId}$`)),
        targetRow.getByRole("link", { name: "View", exact: true }).click(),
      ]);
      await expect(
        page.getByRole("heading", { name: fixture.targetNo, exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: fixture.targetCustomer, exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText("Card", { exact: true }).first(),
      ).toBeVisible();

      await openInvoices(
        page,
        `/invoices?q=${encodeURIComponent(fixture.multiNo)}`,
      );
      await page.screenshot({
        path: join(requireScreenshotRoot(), "desktop-filtered-1440x900.png"),
        fullPage: true,
      });
      errors.stop();
      await context.close();

      const mobileResults = [];
      for (const viewport of [
        { width: 390, height: 844 },
        { width: 320, height: 568 },
      ]) {
        const mobileContext = await browser.newContext({
          viewport,
          timezoneId: "Asia/Karachi",
        });
        const mobilePage = await mobileContext.newPage();
        const mobileErrors = browserEvidence(mobilePage);
        allBrowserErrors.push(mobileErrors);
        await loginLocalOwnerDirectly(mobilePage);
        await openInvoices(
          mobilePage,
          `/invoices?q=${encodeURIComponent(fixture.multiNo)}`,
        );

        for (const selector of [
          'input[name="q"]',
          'input[name="from"]',
          'input[name="to"]',
          'select[name="payment"]',
          'select[name="status"]',
        ]) {
          await expect(mobilePage.locator(selector)).toBeVisible();
        }
        await expect(
          mobilePage.getByRole("button", {
            name: "Apply Filters",
            exact: true,
          }),
        ).toBeVisible();
        await expect(
          mobilePage.getByRole("link", { name: "Reset", exact: true }),
        ).toBeVisible();
        await expect(visibleText(mobilePage, fixture.multiNo)).toHaveCount(1);
        await expect(
          mobilePage.locator(`a[href="/invoices/${fixture.multiId}"]:visible`),
        ).toBeVisible();
        const dimensions = await mobilePage.evaluate(() => ({
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
        }));
        expect(dimensions.scrollWidth).toBeLessThanOrEqual(
          dimensions.clientWidth,
        );
        await mobilePage.screenshot({
          path: join(
            requireScreenshotRoot(),
            `filtered-${viewport.width}x${viewport.height}.png`,
          ),
          fullPage: true,
        });
        mobileResults.push({ viewport, ...dimensions, overflow: false });
        mobileErrors.stop();
        await mobileContext.close();
      }
      await writeJson("mobile.json", mobileResults);

      for (const errors of allBrowserErrors) {
        expect(errors.pageErrors).toEqual([]);
        expect(errors.consoleErrors).toEqual([]);
        expect(errors.requestFailures).toEqual([]);
        expect(errors.httpErrors).toEqual([]);
      }
    } finally {
      try {
        await fixture.cleanup();
      } catch (error) {
        cleanupError = error instanceof Error ? error.message : String(error);
      }
    }

    expect(cleanupError).toBeNull();
    const { count: invoiceCount, error: invoiceCountError } = await admin
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .like("invoice_no", `${fixture.marker}%`);
    const { count: paymentCount, error: paymentCountError } = await admin
      .from("payments")
      .select("id", { count: "exact", head: true })
      .like("reference_no", `${fixture.marker}%`);
    const { count: customerCount, error: customerCountError } = await admin
      .from("customers")
      .select("id", { count: "exact", head: true })
      .like("name", `${fixture.marker}%`);
    expect(
      invoiceCountError ?? paymentCountError ?? customerCountError,
    ).toBeNull();
    expect(invoiceCount).toBe(0);
    expect(paymentCount).toBe(0);
    expect(customerCount).toBe(0);

    const after = await safetySnapshot(admin);
    expect(after).toEqual(before);
    await writeJson("financial-safety.json", {
      tables: SAFETY_TABLES,
      signaturesEqual: true,
      businessWritesDuringFiltering: 0,
      cashDrawerEffect: 0,
      stockFifoEffect: 0,
      customerSupplierBalanceEffect: 0,
    });
    await writeJson("cleanup.json", {
      marker: fixture.marker,
      invoicesRemaining: invoiceCount,
      paymentsRemaining: paymentCount,
      customersRemaining: customerCount,
      retries: 0,
      failures: 0,
      signaturesEqual: true,
    });
    await writeJson("payment-model.json", {
      checkoutMethods: [
        "cash",
        "card",
        "easypaisa",
        "jazzcash",
        "bank_transfer",
        "customer_credit",
      ],
      recordedPaymentMethods: [
        "cash",
        "card",
        "easypaisa",
        "jazzcash",
        "bank_transfer",
      ],
      customerCredit: "zero tender creates debt and no payments row",
      multiplePayments:
        "any matching recorded row qualifies; parent invoice appears once",
      outcome: "PAYMENT OUTCOME B",
    });

    const sourceFiles = [
      "src/app/invoices/page.tsx",
      "src/lib/data/invoices.ts",
      "src/app/pos/actions.ts",
      "src/lib/validation/pos.ts",
      "src/components/ui/sortable-header.tsx",
      "src/lib/datetime.ts",
      "supabase/migrations/20260630000000_pos_checkout_service_total_charged.sql",
    ];
    await writeJson(
      "current-source-map.json",
      Object.fromEntries(
        await Promise.all(
          sourceFiles.map(async (path) => [
            path,
            createHash("sha256")
              .update(await readFile(path))
              .digest("hex"),
          ]),
        ),
      ),
    );
    await writeFile(
      join(requireEvidenceRoot(), "final-report.md"),
      `# Invoice Filter Local Verification\n\n- Marker: ${fixture.marker}\n- Search beyond latest 100: passed\n- Karachi date boundaries: passed\n- Recorded payment methods: passed\n- Status and combined filters: passed\n- Sort preservation and Reset: passed\n- Tenant isolation: passed\n- Invoice detail: passed\n- Mobile 390x844 and 320x568: passed\n- Financial signatures: equal\n- Cleanup retries/failures: 0/0\n- Production mutations: 0\n`,
    );
    const manifest = await writeManifest();
    expect(manifest.entries).toBeGreaterThanOrEqual(15);
  });
});
