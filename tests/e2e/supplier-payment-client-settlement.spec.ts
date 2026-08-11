import { expect, test, type Browser, type Page } from "@playwright/test";
import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  getLocalAdminClient,
  isLocalPlaywrightRun,
  loginLocalOwnerDirectly,
  LOCAL_QA_ORG_ID,
} from "./helpers/local-supabase";

type SourceState = "baseline" | "fixed";
type RouteKind = "purchase" | "ledger";

const SOURCE_STATE = (process.env.SUPPLIER_PAYMENT_SETTLEMENT_SOURCE_STATE ??
  "fixed") as SourceState;
const explicitEvidenceDir =
  process.env.SUPPLIER_PAYMENT_SETTLEMENT_EVIDENCE_DIR;
const evidenceRunId = process.env.SUPPLIER_PAYMENT_SETTLEMENT_RUN_ID;
const evidenceRunFile = explicitEvidenceDir
  ? join(explicitEvidenceDir, ".writer-session")
  : null;

if (explicitEvidenceDir && existsSync(explicitEvidenceDir)) {
  const existingRunId =
    evidenceRunFile && existsSync(evidenceRunFile)
      ? readFileSync(evidenceRunFile, "utf8").trim()
      : null;
  if (!evidenceRunId || existingRunId !== evidenceRunId) {
    throw new Error(
      `Retained supplier-payment evidence already exists: ${explicitEvidenceDir}`,
    );
  }
}

const OUTPUT_DIR = explicitEvidenceDir
  ? explicitEvidenceDir
  : mkdtempSync(join(tmpdir(), "saledock-supplier-payment-settlement-"));
if (explicitEvidenceDir && !existsSync(explicitEvidenceDir)) {
  if (!evidenceRunId) {
    throw new Error("An explicit evidence directory requires a run id.");
  }
  mkdirSync(explicitEvidenceDir, { recursive: false });
  writeFileSync(evidenceRunFile!, `${evidenceRunId}\n`);
}
mkdirSync(join(OUTPUT_DIR, "screenshots"), { recursive: true });

const SAFETY_TABLES = [
  "suppliers",
  "supplier_purchases",
  "supplier_purchase_items",
  "supplier_payments",
  "supplier_ledger_entries",
  "payments",
  "invoices",
  "invoice_items",
  "returns",
  "return_items",
  "expenses",
  "cash_shifts",
  "products",
  "product_stock_lots",
  "stock_movements",
  "customers",
  "customer_ledger_entries",
  "audit_logs",
  "organizations",
  "branches",
] as const;

type Fixture = {
  marker: string;
  supplierId: string;
  purchaseAId: string;
  purchaseBId: string;
  purchaseANo: string;
  purchaseBNo: string;
  ownerId: string;
  branchId: string;
};

type RequestEvidence = {
  actionPosts: number;
  responseStatuses: number[];
  rscGets: number;
  queryReconciliations: number;
  unexpectedWrites: string[];
  pageErrors: string[];
  consoleErrors: string[];
  requestFailures: string[];
};

const observations: Array<Record<string, unknown>> = [];

function writeJson(name: string, value: unknown) {
  writeFileSync(join(OUTPUT_DIR, name), `${JSON.stringify(value, null, 2)}\n`);
}

async function ownerProfile() {
  const admin = getLocalAdminClient();
  const { data: profile, error } = await admin
    .from("profiles")
    .select("id, branch_id, role")
    .eq("organization_id", LOCAL_QA_ORG_ID)
    .eq("role", "owner")
    .not("branch_id", "is", null)
    .limit(1)
    .single();
  if (error || !profile?.branch_id || profile.role !== "owner") {
    throw new Error(
      `Local owner profile failed: ${error?.message ?? "invalid profile"}`,
    );
  }
  return profile;
}

async function signatures() {
  const admin = getLocalAdminClient();
  const result: Record<string, string> = {};
  for (const table of SAFETY_TABLES) {
    const query = await admin.from(table).select("*").order("id");
    if (query.error) {
      throw new Error(`Signature failed for ${table}: ${query.error.message}`);
    }
    result[table] = createHash("sha256")
      .update(JSON.stringify(query.data ?? []))
      .digest("hex");
  }
  return result;
}

function markerFor(label: string) {
  return `SP-${label}-${Date.now().toString(36).slice(-6)}-${randomUUID().slice(0, 4)}`;
}

async function seedFixture(label: string): Promise<Fixture> {
  const admin = getLocalAdminClient();
  const profile = await ownerProfile();
  const marker = markerFor(label);
  const supplierId = randomUUID();
  const purchaseAId = randomUUID();
  const purchaseBId = randomUUID();
  const suffix = marker
    .replace(/[^a-z0-9]/gi, "")
    .slice(-14)
    .toUpperCase();
  const purchaseANo = `QA-A-${suffix}`;
  const purchaseBNo = `QA-B-${suffix}`;

  const existing = await admin
    .from("suppliers")
    .select("id", { count: "exact", head: true })
    .eq("name", `${marker} Supplier`);
  if (existing.error || existing.count !== 0) {
    throw new Error("Marker-owned supplier precondition failed.");
  }

  const supplier = await admin.from("suppliers").insert({
    id: supplierId,
    organization_id: LOCAL_QA_ORG_ID,
    name: `${marker} Supplier`,
    notes: `${marker} local settlement fixture`,
    outstanding_balance: 300,
    is_active: true,
  });
  if (supplier.error)
    throw new Error(`Supplier seed failed: ${supplier.error.message}`);

  const purchases = await admin.from("supplier_purchases").insert([
    {
      id: purchaseAId,
      organization_id: LOCAL_QA_ORG_ID,
      branch_id: profile.branch_id,
      supplier_id: supplierId,
      purchase_no: purchaseANo,
      status: "unpaid",
      purchase_date: "2026-08-01",
      subtotal: 100,
      discount_total: 0,
      grand_total: 100,
      amount_paid: 0,
      balance_due: 100,
      reference_no: `${marker}-A`,
      notes: `${marker} oldest purchase`,
      created_by: profile.id,
      created_at: "2026-08-01T08:00:00.000Z",
    },
    {
      id: purchaseBId,
      organization_id: LOCAL_QA_ORG_ID,
      branch_id: profile.branch_id,
      supplier_id: supplierId,
      purchase_no: purchaseBNo,
      status: "unpaid",
      purchase_date: "2026-08-02",
      subtotal: 200,
      discount_total: 0,
      grand_total: 200,
      amount_paid: 0,
      balance_due: 200,
      reference_no: `${marker}-B`,
      notes: `${marker} newer purchase`,
      created_by: profile.id,
      created_at: "2026-08-02T08:00:00.000Z",
    },
  ]);
  if (purchases.error) {
    throw new Error(`Purchase seed failed: ${purchases.error.message}`);
  }

  const ledger = await admin.from("supplier_ledger_entries").insert([
    {
      organization_id: LOCAL_QA_ORG_ID,
      branch_id: profile.branch_id,
      supplier_id: supplierId,
      purchase_id: purchaseAId,
      entry_type: "purchase_credit",
      direction: "credit",
      amount: 100,
      balance_after: 100,
      description: `Supplier purchase ${purchaseANo}`,
      reference_number: `${marker}-A`,
      created_by: profile.id,
      created_at: "2026-08-01T08:00:01.000Z",
    },
    {
      organization_id: LOCAL_QA_ORG_ID,
      branch_id: profile.branch_id,
      supplier_id: supplierId,
      purchase_id: purchaseBId,
      entry_type: "purchase_credit",
      direction: "credit",
      amount: 200,
      balance_after: 300,
      description: `Supplier purchase ${purchaseBNo}`,
      reference_number: `${marker}-B`,
      created_by: profile.id,
      created_at: "2026-08-02T08:00:01.000Z",
    },
  ]);
  if (ledger.error)
    throw new Error(`Ledger seed failed: ${ledger.error.message}`);

  return {
    marker,
    supplierId,
    purchaseAId,
    purchaseBId,
    purchaseANo,
    purchaseBNo,
    ownerId: profile.id,
    branchId: profile.branch_id,
  };
}

async function cleanupFixture(fixture: Fixture) {
  const admin = getLocalAdminClient();
  const failures: string[] = [];
  const remove = async (
    name: string,
    promise: PromiseLike<{ error: { message: string } | null }>,
  ) => {
    const result = await promise;
    if (result.error) failures.push(`${name}: ${result.error.message}`);
  };

  await remove(
    "audits",
    admin
      .from("audit_logs")
      .delete()
      .eq("organization_id", LOCAL_QA_ORG_ID)
      .eq("module", "purchases")
      .contains("metadata", { supplier_id: fixture.supplierId }),
  );
  await remove(
    "ledger",
    admin
      .from("supplier_ledger_entries")
      .delete()
      .eq("supplier_id", fixture.supplierId),
  );
  await remove(
    "payments",
    admin
      .from("supplier_payments")
      .delete()
      .eq("supplier_id", fixture.supplierId),
  );
  await remove(
    "purchases",
    admin
      .from("supplier_purchases")
      .delete()
      .eq("supplier_id", fixture.supplierId),
  );
  await remove(
    "supplier",
    admin.from("suppliers").delete().eq("id", fixture.supplierId),
  );

  if (failures.length)
    throw new Error(`Cleanup failed: ${failures.join("; ")}`);

  const remaining = await Promise.all([
    admin
      .from("suppliers")
      .select("id", { count: "exact", head: true })
      .eq("id", fixture.supplierId),
    admin
      .from("supplier_purchases")
      .select("id", { count: "exact", head: true })
      .eq("supplier_id", fixture.supplierId),
    admin
      .from("supplier_payments")
      .select("id", { count: "exact", head: true })
      .eq("supplier_id", fixture.supplierId),
    admin
      .from("supplier_ledger_entries")
      .select("id", { count: "exact", head: true })
      .eq("supplier_id", fixture.supplierId),
    admin
      .from("audit_logs")
      .select("id", { count: "exact", head: true })
      .contains("metadata", { supplier_id: fixture.supplierId }),
  ]);
  for (const query of remaining) {
    if (query.error)
      throw new Error(`Cleanup verification failed: ${query.error.message}`);
  }
  const counts = remaining.map((query) => query.count ?? 0);
  expect(counts).toEqual([0, 0, 0, 0, 0]);
  return counts;
}

function pathFor(fixture: Fixture, kind: RouteKind) {
  return kind === "purchase"
    ? `/suppliers/purchases/${fixture.purchaseBId}`
    : `/suppliers/${fixture.supplierId}/ledger`;
}

function trackRequests(page: Page, actionPath: string): RequestEvidence {
  const evidence: RequestEvidence = {
    actionPosts: 0,
    responseStatuses: [],
    rscGets: 0,
    queryReconciliations: 0,
    unexpectedWrites: [],
    pageErrors: [],
    consoleErrors: [],
    requestFailures: [],
  };

  page.on("pageerror", (error) => evidence.pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const value = `${message.text()} ${message.location().url}`;
    if (
      /\/_vercel\/(?:insights|speed-insights)|clarity\.ms\/tag\/dummy-clarity/i.test(
        value,
      )
    ) {
      return;
    }
    if (
      /status of 406|status of 406 \(Not Acceptable\)/i.test(value) &&
      /127\.0\.0\.1:54321\/rest\/v1\/user_ui_preferences\?/i.test(value)
    ) {
      return;
    }
    evidence.consoleErrors.push(value);
  });
  page.on("requestfailed", (request) => {
    const url = new URL(request.url());
    if (/^\/_vercel\/(?:insights|speed-insights)/.test(url.pathname)) return;
    if (request.failure()?.errorText === "net::ERR_ABORTED") return;
    evidence.requestFailures.push(`${request.method()} ${url.pathname}`);
  });
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (request.method() === "POST" && url.pathname === actionPath) {
      evidence.actionPosts += 1;
      return;
    }
    if (
      request.method() === "GET" &&
      request.headers().rsc === "1" &&
      url.pathname === actionPath
    ) {
      evidence.rscGets += 1;
      if (url.searchParams.has("suppaystate")) {
        evidence.queryReconciliations += 1;
      }
      return;
    }
    if (
      !["GET", "HEAD", "OPTIONS"].includes(request.method()) &&
      url.port !== "54321"
    ) {
      evidence.unexpectedWrites.push(`${request.method()} ${url.pathname}`);
    }
  });
  page.on("response", (response) => {
    const request = response.request();
    const url = new URL(response.url());
    if (request.method() === "POST" && url.pathname === actionPath) {
      evidence.responseStatuses.push(response.status());
    }
  });
  return evidence;
}

async function paymentForm(page: Page) {
  const form = page.locator("form").filter({
    has: page.getByRole("button", { name: "Record payment", exact: true }),
  });
  await expect(form).toBeVisible();
  return form;
}

async function preparePayment(
  page: Page,
  amount: number,
  reference: string,
  note: string,
) {
  const form = await paymentForm(page);
  await form.locator('input[type="number"]').fill(String(amount));
  await form
    .getByRole("button", { name: "Payment method", exact: true })
    .click();
  await page.getByRole("option", { name: "Card", exact: true }).click();
  await form.getByLabel("Reference (optional)").fill(`  ${reference}  `);
  await form.getByLabel("Note (optional)").fill(`  ${note}  `);
  return form;
}

async function waitForTruth(
  fixture: Fixture,
  reference: string,
  kind: RouteKind,
  amount: number,
) {
  const admin = getLocalAdminClient();
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const [supplier, purchases, payments, ledger, audits] = await Promise.all([
      admin
        .from("suppliers")
        .select("outstanding_balance")
        .eq("id", fixture.supplierId)
        .single(),
      admin
        .from("supplier_purchases")
        .select("id, status, amount_paid, balance_due")
        .in("id", [fixture.purchaseAId, fixture.purchaseBId])
        .order("purchase_date", { ascending: true }),
      admin
        .from("supplier_payments")
        .select(
          "id, organization_id, branch_id, supplier_id, purchase_id, method, amount, reference_no, note",
        )
        .eq("supplier_id", fixture.supplierId)
        .eq("reference_no", reference),
      admin
        .from("supplier_ledger_entries")
        .select(
          "id, payment_id, purchase_id, entry_type, direction, amount, balance_after",
        )
        .eq("supplier_id", fixture.supplierId)
        .eq("entry_type", "payment_debit"),
      admin
        .from("audit_logs")
        .select(
          "id, organization_id, branch_id, actor_id, module, action, metadata",
        )
        .eq("organization_id", LOCAL_QA_ORG_ID)
        .eq("module", "purchases")
        .eq("action", "supplier_payment.recorded")
        .contains("metadata", { supplier_id: fixture.supplierId }),
    ]);
    for (const query of [supplier, purchases, payments, ledger, audits]) {
      if (query.error)
        throw new Error(`Truth query failed: ${query.error.message}`);
    }
    const rows = purchases.data ?? [];
    const a = rows.find((row) => row.id === fixture.purchaseAId);
    const b = rows.find((row) => row.id === fixture.purchaseBId);
    const expected =
      kind === "purchase"
        ? {
            supplier: 300 - amount,
            aPaid: 0,
            aDue: 100,
            aStatus: "unpaid",
            bPaid: amount,
            bDue: 200 - amount,
            bStatus: amount === 200 ? "paid" : "partial",
            purchaseId: fixture.purchaseBId,
          }
        : {
            supplier: 300 - amount,
            aPaid: Math.min(amount, 100),
            aDue: Math.max(100 - amount, 0),
            aStatus: amount >= 100 ? "paid" : "partial",
            bPaid: Math.max(amount - 100, 0),
            bDue: 200 - Math.max(amount - 100, 0),
            bStatus: amount > 100 ? "partial" : "unpaid",
            purchaseId: null,
          };
    const truth = {
      supplierBalance: Number(supplier.data?.outstanding_balance),
      purchaseA: a
        ? {
            paid: Number(a.amount_paid),
            due: Number(a.balance_due),
            status: a.status,
          }
        : null,
      purchaseB: b
        ? {
            paid: Number(b.amount_paid),
            due: Number(b.balance_due),
            status: b.status,
          }
        : null,
      payments: payments.data ?? [],
      paymentDebits: ledger.data ?? [],
      audits: audits.data ?? [],
    };
    if (
      truth.supplierBalance === expected.supplier &&
      truth.purchaseA?.paid === expected.aPaid &&
      truth.purchaseA?.due === expected.aDue &&
      truth.purchaseA?.status === expected.aStatus &&
      truth.purchaseB?.paid === expected.bPaid &&
      truth.purchaseB?.due === expected.bDue &&
      truth.purchaseB?.status === expected.bStatus &&
      truth.payments.length === 1 &&
      truth.payments[0]?.purchase_id === expected.purchaseId &&
      Number(truth.payments[0]?.amount) === amount &&
      truth.payments[0]?.method === "card" &&
      truth.payments[0]?.reference_no === reference &&
      truth.paymentDebits.length === 1 &&
      Number(truth.paymentDebits[0]?.amount) === amount &&
      Number(truth.paymentDebits[0]?.balance_after) === expected.supplier &&
      truth.audits.length === 1
    ) {
      return truth;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Payment truth did not settle for ${kind}.`);
}

async function zeroMutationTruth(fixture: Fixture) {
  const admin = getLocalAdminClient();
  const [supplier, payments, debits, audits] = await Promise.all([
    admin
      .from("suppliers")
      .select("outstanding_balance")
      .eq("id", fixture.supplierId)
      .single(),
    admin
      .from("supplier_payments")
      .select("id", { count: "exact", head: true })
      .eq("supplier_id", fixture.supplierId),
    admin
      .from("supplier_ledger_entries")
      .select("id", { count: "exact", head: true })
      .eq("supplier_id", fixture.supplierId)
      .eq("entry_type", "payment_debit"),
    admin
      .from("audit_logs")
      .select("id", { count: "exact", head: true })
      .contains("metadata", { supplier_id: fixture.supplierId }),
  ]);
  for (const query of [supplier, payments, debits, audits]) {
    if (query.error)
      throw new Error(`Zero-mutation query failed: ${query.error.message}`);
  }
  return {
    supplierBalance: Number(supplier.data?.outstanding_balance),
    payments: payments.count ?? 0,
    paymentDebits: debits.count ?? 0,
    audits: audits.count ?? 0,
  };
}

async function expectConnectedTruth(
  page: Page,
  fixture: Fixture,
  kind: RouteKind,
  amount: number,
) {
  if (kind === "purchase") {
    const totals = page.locator("section").filter({
      has: page.getByRole("heading", { name: "Totals", exact: true }),
    });
    await expect(
      totals
        .getByText("Balance due", { exact: true })
        .locator("..")
        .locator("dd"),
    ).toContainText(String(200 - amount));
    await expect(
      page.getByRole("heading", { name: "Payments (1)", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("partial", { exact: true })).toBeVisible();
    return;
  }

  const outstanding = page
    .getByText("Outstanding", { exact: true })
    .locator("..")
    .locator("p")
    .nth(1);
  await expect(outstanding).toContainText(String(300 - amount));
  await expect(
    page.getByRole("heading", { name: "Ledger (3 entries)", exact: true }),
  ).toBeVisible();
  await expect(
    page.locator("tr").filter({ hasText: fixture.purchaseANo }).first(),
  ).toContainText(amount >= 100 ? "0" : String(100 - amount));
  await expect(
    page.getByRole("heading", { name: "Recent payments", exact: true }),
  ).toBeVisible();
}

async function independentTruth(
  browser: Browser,
  fixture: Fixture,
  kind: RouteKind,
  amount: number,
) {
  const context = await browser.newContext({ timezoneId: "Asia/Karachi" });
  const page = await context.newPage();
  try {
    await loginLocalOwnerDirectly(page);
    await page.goto(pathFor(fixture, kind));
    await expectConnectedTruth(page, fixture, kind, amount);
    return { path: new URL(page.url()).pathname, connectedTruth: true };
  } finally {
    await context.close();
  }
}

async function dependentRouteTruth(
  browser: Browser,
  fixture: Fixture,
  expectedPurchaseBDue: number,
) {
  const context = await browser.newContext({ timezoneId: "Asia/Karachi" });
  const page = await context.newPage();
  try {
    await loginLocalOwnerDirectly(page);
    await page.goto(
      `/suppliers/purchases?q=${encodeURIComponent(fixture.purchaseBNo)}`,
    );
    await expect(
      page
        .locator("header h1:visible")
        .filter({ hasText: "Supplier Purchases" }),
    ).toBeVisible();
    const purchaseRow = page
      .locator("tr")
      .filter({ hasText: fixture.purchaseBNo })
      .first();
    await expect(purchaseRow).toBeVisible();
    await expect(purchaseRow).toContainText(String(expectedPurchaseBDue));

    await page.goto("/dashboard");
    await expect(page.locator("header h1:visible")).toHaveText("Dashboard");

    await page.goto("/reports");
    await expect(page.locator("header h1:visible")).toHaveText("Reports");
    await expect(
      page.getByRole("heading", {
        name: "Supplier Dues & Purchases Snapshot",
      }),
    ).toBeVisible();
    await expect(page.getByText(`${fixture.marker} Supplier`)).toHaveCount(2);
    return {
      purchaseList: true,
      dashboard: true,
      reports: true,
      purchaseBDue: expectedPurchaseBDue,
    };
  } finally {
    await context.close();
  }
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function runDelayedCase(browser: Browser, kind: RouteKind) {
  const before = await signatures();
  const fixture = await seedFixture(`DELAY-${kind.toUpperCase()}`);
  const amount = kind === "purchase" ? 40 : 150;
  const reference = `${fixture.marker}-PAY`;
  const note = `${fixture.marker} delayed Card payment`;
  const path = pathFor(fixture, kind);
  const context = await browser.newContext({
    timezoneId: "Asia/Karachi",
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  let requests: RequestEvidence;
  const actionGate = deferred();
  const refreshGate = deferred();
  const actionReady = deferred();
  const refreshReady = deferred();
  let actionResponseStatus: number | null = null;
  let actionResponseBytes = 0;
  let actionChunkLines = 0;
  let refreshHeld = false;
  let actionDelivered = false;
  let refreshClaimed = false;
  let result: Record<string, unknown> | null = null;

  await page.route(`**${path}*`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "POST" && url.pathname === path) {
      const response = await route.fetch();
      const body = await response.body();
      actionResponseStatus = response.status();
      actionResponseBytes = body.byteLength;
      actionChunkLines = body.toString("utf8").split("\n").length;
      actionReady.resolve();
      await actionGate.promise;
      actionDelivered = true;
      await route.fulfill({ response, body });
      return;
    }
    if (
      request.method() === "GET" &&
      request.headers().rsc === "1" &&
      url.pathname === path &&
      actionDelivered &&
      !refreshClaimed
    ) {
      refreshClaimed = true;
      const response = await route.fetch();
      refreshHeld = true;
      refreshReady.resolve();
      await refreshGate.promise;
      await route.fulfill({ response }).catch(() => undefined);
      return;
    }
    await route.continue();
  });

  try {
    await loginLocalOwnerDirectly(page);
    await page.waitForTimeout(750);
    requests = trackRequests(page, path);
    await page.goto(path);
    await page.waitForTimeout(750);
    const form = await preparePayment(page, amount, reference, note);
    const startedAt = Date.now();
    await form.getByRole("button", { name: "Record payment" }).click();
    await expect(
      page.getByRole("button", { name: "Recording…", exact: true }),
    ).toBeVisible();

    await actionReady.promise;
    const truth = await waitForTruth(fixture, reference, kind, amount);
    const serverCommittedAt = Date.now();
    await expect(
      page.getByText("Payment recorded.", { exact: true }),
    ).toHaveCount(0);
    expect(actionResponseStatus).toBe(200);

    actionGate.resolve();
    await refreshReady.promise;
    expect(refreshHeld).toBe(true);

    if (SOURCE_STATE === "baseline") {
      await page.waitForTimeout(750);
      await expect(
        page.getByRole("button", { name: "Recording…", exact: true }),
      ).toBeVisible();
    } else {
      await expect(
        page.getByText("Payment recorded.", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Recording…", exact: true }),
      ).toHaveCount(0);
    }

    const beforeRefreshRelease = {
      pending: await page
        .getByRole("button", { name: "Recording…", exact: true })
        .isVisible(),
      success: await page
        .getByText("Payment recorded.", { exact: true })
        .isVisible(),
      url: page.url().replace(/suppaystate=[^&]+/, "suppaystate=<unique>"),
    };

    if (SOURCE_STATE === "baseline") {
      await page.screenshot({
        path: join(
          OUTPUT_DIR,
          "screenshots",
          `baseline-${kind}-reconciliation-held.png`,
        ),
        fullPage: true,
      });
    } else {
      await page.screenshot({
        path: join(
          OUTPUT_DIR,
          "screenshots",
          `fixed-${kind}-settled-before-reconciliation.png`,
        ),
        fullPage: true,
      });
    }

    refreshGate.resolve();
    if (SOURCE_STATE === "fixed") {
      await expect(page).toHaveURL(/(?:\?|&)suppaystate=[^&]+/);
    }
    await expectConnectedTruth(page, fixture, kind, amount);
    await expect(
      page.getByText("Payment recorded.", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Recording…", exact: true }),
    ).toHaveCount(0);
    const independent = await independentTruth(browser, fixture, kind, amount);
    expect(requests.actionPosts).toBe(1);
    expect(requests.responseStatuses).toEqual([200]);
    expect(requests.unexpectedWrites).toEqual([]);
    expect(requests.pageErrors).toEqual([]);
    expect(requests.consoleErrors).toEqual([]);
    expect(requests.requestFailures).toEqual([]);

    result = {
      sourceState: SOURCE_STATE,
      kind,
      marker: fixture.marker,
      actionResponseStatus,
      actionResponseBytes,
      actionChunkLines,
      actionPosts: requests.actionPosts,
      rscGets: requests.rscGets,
      queryReconciliations: requests.queryReconciliations,
      serverCommittedBeforeActionDelivery: serverCommittedAt >= startedAt,
      beforeRefreshRelease,
      truth,
      independent,
      duplicate: false,
    };
    observations.push(result);
  } finally {
    actionGate.resolve();
    refreshGate.resolve();
    await page.unroute(`**${path}*`).catch(() => undefined);
    await context.close();
    const cleanup = await cleanupFixture(fixture);
    const after = await signatures();
    expect(after).toEqual(before);
    if (result) {
      Object.assign(result, { cleanup, signaturesEqual: true });
      writeJson(
        SOURCE_STATE === "baseline"
          ? `baseline-${kind === "purchase" ? "purchase-specific" : "on-account"}.json`
          : `delayed-${kind}.json`,
        result,
      );
    }
  }
}

async function runSuccessCase(
  browser: Browser,
  kind: RouteKind,
  options: {
    label: string;
    amount: number;
    viewport?: { width: number; height: number };
    rapid?: boolean;
  },
) {
  const before = await signatures();
  const fixture = await seedFixture(options.label);
  const path = pathFor(fixture, kind);
  const reference = `${fixture.marker}-PAY`;
  const note = `${fixture.marker} Card payment`;
  const context = await browser.newContext({
    timezoneId: "Asia/Karachi",
    viewport: options.viewport ?? { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  let requests: RequestEvidence;
  const cashBefore = await signatures();
  let result: Record<string, unknown> | null = null;
  try {
    await loginLocalOwnerDirectly(page);
    await page.waitForTimeout(750);
    requests = trackRequests(page, path);
    await page.goto(path);
    await page.waitForTimeout(750);
    const form = await preparePayment(page, options.amount, reference, note);
    const submit = form.getByRole("button", { name: "Record payment" });
    if (options.rapid) {
      await form.evaluate((node) => {
        const paymentForm = node as HTMLFormElement;
        const button = paymentForm.querySelector<HTMLButtonElement>(
          'button[type="submit"]',
        );
        if (!button) throw new Error("Submit button unavailable.");
        paymentForm.requestSubmit(button);
        paymentForm.requestSubmit(button);
      });
    } else {
      await submit.click();
    }
    await expect(
      page.getByRole("button", { name: "Recording…", exact: true }),
    ).toBeVisible();
    const truth = await waitForTruth(fixture, reference, kind, options.amount);
    await expect(
      page.getByText("Payment recorded.", { exact: true }),
    ).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page.getByRole("button", { name: "Recording…", exact: true }),
    ).toHaveCount(0);
    await expect(page).toHaveURL(/(?:\?|&)suppaystate=[^&]+/);
    await expectConnectedTruth(page, fixture, kind, options.amount);
    const independent = await independentTruth(
      browser,
      fixture,
      kind,
      options.amount,
    );
    const dependentRoutes = options.viewport
      ? null
      : await dependentRouteTruth(
          browser,
          fixture,
          kind === "purchase"
            ? 200 - options.amount
            : 200 - Math.max(options.amount - 100, 0),
        );
    const amountValue = await form.locator('input[type="number"]').inputValue();
    const referenceValue = await form
      .getByLabel("Reference (optional)")
      .inputValue();
    const noteValue = await form.getByLabel("Note (optional)").inputValue();
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(requests.actionPosts).toBe(1);
    expect(requests.responseStatuses).toEqual([200]);
    expect(requests.unexpectedWrites).toEqual([]);
    expect(requests.pageErrors).toEqual([]);
    expect(requests.consoleErrors).toEqual([]);
    expect(requests.requestFailures).toEqual([]);
    expect(amountValue).toBe("0");
    expect(referenceValue).toBe("");
    expect(noteValue).toBe("");
    expect(overflow).toBeLessThanOrEqual(1);

    const afterPayment = await signatures();
    for (const table of [
      "cash_shifts",
      "products",
      "product_stock_lots",
      "stock_movements",
      "payments",
      "invoices",
      "invoice_items",
      "customers",
      "customer_ledger_entries",
    ]) {
      expect(afterPayment[table]).toBe(cashBefore[table]);
    }

    result = {
      sourceState: SOURCE_STATE,
      kind,
      marker: fixture.marker,
      viewport: options.viewport ?? { width: 1440, height: 900 },
      rapid: options.rapid ?? false,
      requests,
      truth,
      independent,
      dependentRoutes,
      formCleared: true,
      overflow,
      cashAndStockUnchanged: true,
    };
    observations.push(result);
    return result;
  } finally {
    await context.close();
    const cleanup = await cleanupFixture(fixture);
    const after = await signatures();
    expect(after).toEqual(before);
    if (result) Object.assign(result, { cleanup, signaturesEqual: true });
  }
}

test.describe("supplier payment client settlement", () => {
  test.skip(
    !isLocalPlaywrightRun(),
    "Supplier settlement QA is loopback-only.",
  );

  test.afterAll(() => {
    writeJson("results.json", {
      sourceState: SOURCE_STATE,
      cases: observations,
      retries: 0,
      outputDirectory: explicitEvidenceDir ? "retained" : "temporary",
    });
  });

  test("delayed purchase reconciliation isolates mutation settlement", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    await runDelayedCase(browser, "purchase");
  });

  test("delayed on-account reconciliation isolates mutation settlement", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    await runDelayedCase(browser, "ledger");
  });

  test("purchase-specific payment settles once and blocks a rapid repeat", async ({
    browser,
  }) => {
    test.skip(SOURCE_STATE !== "fixed", "Final-source case.");
    test.setTimeout(120_000);
    const result = await runSuccessCase(browser, "purchase", {
      label: "PURCHASE-RAPID",
      amount: 40,
      rapid: true,
    });
    writeJson("post-fix-purchase-specific.json", result);
    writeJson("rapid-click.json", result);
    writeJson("purchase-allocation.json", result);
  });

  test("on-account payment settles once with oldest-purchase FIFO", async ({
    browser,
  }) => {
    test.skip(SOURCE_STATE !== "fixed", "Final-source case.");
    test.setTimeout(120_000);
    const result = await runSuccessCase(browser, "ledger", {
      label: "ACCOUNT-FIFO",
      amount: 150,
    });
    writeJson("post-fix-on-account.json", result);
    writeJson("on-account-fifo.json", result);
    writeJson("cash-safety.json", {
      method: "card",
      physicalCashChanged: false,
      cashShiftChanged: false,
    });
    writeJson("stock-safety.json", {
      productsChanged: false,
      lotsChanged: false,
      movementsChanged: false,
      inventoryFifoChanged: false,
    });
  });

  test("validation and RPC errors release pending without mutation", async ({
    browser,
  }) => {
    test.skip(SOURCE_STATE !== "fixed", "Final-source case.");
    test.setTimeout(120_000);
    const before = await signatures();
    const fixture = await seedFixture("ERROR");
    const path = pathFor(fixture, "ledger");
    const context = await browser.newContext({ timezoneId: "Asia/Karachi" });
    const page = await context.newPage();
    let requests: RequestEvidence;
    const admin = getLocalAdminClient();
    let result: Record<string, unknown> | null = null;
    try {
      await loginLocalOwnerDirectly(page);
      await page.waitForTimeout(750);
      requests = trackRequests(page, path);
      await page.goto(path);
      await page.waitForTimeout(750);
      const form = await preparePayment(
        page,
        301,
        `${fixture.marker}-MAX`,
        `${fixture.marker} max validation`,
      );
      await form.getByRole("button", { name: "Record payment" }).click();
      await expect(form.getByText(/Amount cannot exceed/)).toBeVisible();
      expect(requests.actionPosts).toBe(0);

      const lowerBalance = await admin
        .from("suppliers")
        .update({ outstanding_balance: 10 })
        .eq("id", fixture.supplierId);
      if (lowerBalance.error) throw new Error(lowerBalance.error.message);
      await form.locator('input[type="number"]').fill("20");
      await form
        .getByLabel("Reference (optional)")
        .fill(`${fixture.marker}-RPC`);
      await form.getByRole("button", { name: "Record payment" }).click();
      await expect(
        page.getByRole("button", { name: "Recording…", exact: true }),
      ).toBeVisible();
      await expect(
        page
          .getByRole("alert")
          .filter({ hasText: /Payment exceeds outstanding balance/i }),
      ).toBeVisible({
        timeout: 20_000,
      });
      await expect(
        page.getByRole("button", { name: "Recording…", exact: true }),
      ).toHaveCount(0);
      const truth = await zeroMutationTruth(fixture);
      expect(truth).toEqual({
        supplierBalance: 10,
        payments: 0,
        paymentDebits: 0,
        audits: 0,
      });
      expect(requests.actionPosts).toBe(1);
      expect(requests.responseStatuses).toEqual([200]);
      result = {
        marker: fixture.marker,
        requests,
        truth,
        pendingReleased: true,
      };
      observations.push(result);
      writeJson("error-path.json", result);
    } finally {
      await context.close();
      await cleanupFixture(fixture);
      const after = await signatures();
      expect(after).toEqual(before);
    }
  });

  test("foreign supplier and foreign purchase attempts make no mutation", async ({
    browser,
  }) => {
    test.skip(SOURCE_STATE !== "fixed", "Final-source case.");
    test.setTimeout(180_000);
    const admin = getLocalAdminClient();
    const cases: Array<Record<string, unknown>> = [];

    for (const target of ["supplier", "purchase"] as const) {
      const before = await signatures();
      const fixture = await seedFixture(`TENANT-${target.toUpperCase()}`);
      const foreignOrganizationId = randomUUID();
      const path = pathFor(
        fixture,
        target === "supplier" ? "ledger" : "purchase",
      );
      const context = await browser.newContext({ timezoneId: "Asia/Karachi" });
      const page = await context.newPage();
      try {
        const org = await admin.from("organizations").insert({
          id: foreignOrganizationId,
          name: `${fixture.marker} Foreign`,
          slug: `${fixture.marker.toLowerCase()}-foreign`,
          onboarding_completed: true,
        });
        if (org.error) throw new Error(org.error.message);
        await loginLocalOwnerDirectly(page);
        await page.waitForTimeout(750);
        const requests = trackRequests(page, path);
        await page.goto(path);
        await page.waitForTimeout(750);
        const form = await preparePayment(
          page,
          10,
          `${fixture.marker}-DENY`,
          `${fixture.marker} tenant denial`,
        );
        const moved =
          target === "supplier"
            ? await admin
                .from("suppliers")
                .update({ organization_id: foreignOrganizationId })
                .eq("id", fixture.supplierId)
            : await admin
                .from("supplier_purchases")
                .update({ organization_id: foreignOrganizationId })
                .eq("id", fixture.purchaseBId);
        if (moved.error) throw new Error(moved.error.message);

        await form.getByRole("button", { name: "Record payment" }).click();
        await expect(
          page.getByRole("button", { name: "Recording…", exact: true }),
        ).toBeVisible();
        await expect(
          page
            .getByRole("alert")
            .filter({
              hasText:
                target === "supplier"
                  ? /Supplier not found/i
                  : /Purchase not found/i,
            }),
        ).toBeVisible({
          timeout: 20_000,
        });
        await expect(
          page.getByRole("button", { name: "Recording…", exact: true }),
        ).toHaveCount(0);

        const restored =
          target === "supplier"
            ? await admin
                .from("suppliers")
                .update({ organization_id: LOCAL_QA_ORG_ID })
                .eq("id", fixture.supplierId)
            : await admin
                .from("supplier_purchases")
                .update({ organization_id: LOCAL_QA_ORG_ID })
                .eq("id", fixture.purchaseBId);
        if (restored.error) throw new Error(restored.error.message);

        const truth = await zeroMutationTruth(fixture);
        expect(truth).toEqual({
          supplierBalance: 300,
          payments: 0,
          paymentDebits: 0,
          audits: 0,
        });
        expect(requests.actionPosts).toBe(1);
        cases.push({ target, requests, truth, denied: true });
      } finally {
        await context.close();
        await cleanupFixture(fixture);
        const removeOrg = await admin
          .from("organizations")
          .delete()
          .eq("id", foreignOrganizationId);
        if (removeOrg.error) throw new Error(removeOrg.error.message);
        const after = await signatures();
        expect(after).toEqual(before);
      }
    }

    observations.push({ tenantCases: cases });
    writeJson("tenant.json", { cases });
  });

  for (const kind of ["purchase", "ledger"] as const) {
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 320, height: 568 },
    ]) {
      test(`${kind} settles at ${viewport.width}x${viewport.height} without overflow`, async ({
        browser,
      }) => {
        test.skip(SOURCE_STATE !== "fixed", "Final-source case.");
        test.setTimeout(120_000);
        const result = await runSuccessCase(browser, kind, {
          label: `MOBILE-${kind.toUpperCase()}-${viewport.width}`,
          amount: kind === "purchase" ? 10 : 110,
          viewport,
        });
        writeJson(`mobile-${kind}-${viewport.width}.json`, result);
      });
    }
  }
});
