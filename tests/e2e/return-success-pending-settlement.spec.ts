import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import {
  getLocalAdminClient,
  isLocalPlaywrightRun,
  LOCAL_QA_ORG_ID,
  loginLocalOwnerDirectly,
} from "./helpers/local-supabase";

const PROXY_URL = process.env.RETURN_REVALIDATION_PROXY_URL ?? "";
const EVIDENCE_FILE =
  process.env.RETURN_SETTLEMENT_EVIDENCE_FILE ??
  "/tmp/saledock-return-success-pending-settlement/result.json";
const MATRIX_EVIDENCE_FILE =
  process.env.RETURN_SETTLEMENT_MATRIX_EVIDENCE_FILE ??
  "/tmp/saledock-return-success-pending-settlement/matrix.json";
const ERROR_EVIDENCE_FILE =
  process.env.RETURN_SETTLEMENT_ERROR_EVIDENCE_FILE ??
  "/tmp/saledock-return-success-pending-settlement/confirmed-error.json";
const UNCERTAIN_EVIDENCE_FILE =
  process.env.RETURN_SETTLEMENT_UNCERTAIN_EVIDENCE_FILE ??
  "/tmp/saledock-return-success-pending-settlement/uncertain-outcome.json";
const AUTH_REDIRECT_EVIDENCE_FILE =
  process.env.RETURN_AUTH_REDIRECT_EVIDENCE_FILE ??
  "/tmp/saledock-return-success-pending-settlement/auth-redirect.json";

type Fixture = {
  marker: string;
  ownerId: string;
  branchId: string;
  customerId: string;
  productId: string;
  lotId: string;
  invoiceId: string;
  invoiceItemId: string;
  serviceItemId: string;
};

type ProxyStatus = {
  armed: boolean;
  blockReads: boolean;
  rpcCount: number;
  heldReadCount: number;
  heldReadPaths: string[];
};

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function proxyControl(path: string): Promise<ProxyStatus> {
  const response = await fetch(`${PROXY_URL}${path}`, {
    method: path === "/__qa/status" ? "GET" : "POST",
  });
  if (!response.ok) throw new Error(`Proxy control failed: ${response.status}`);
  return (await response.json()) as ProxyStatus;
}

async function seedFixture(): Promise<Fixture> {
  const admin = getLocalAdminClient();
  const marker = `QA-RETURN-SETTLEMENT-${Date.now().toString(36)}`;
  const customerId = randomUUID();
  const productId = randomUUID();
  const lotId = randomUUID();
  const invoiceId = randomUUID();
  const invoiceItemId = randomUUID();
  const serviceItemId = randomUUID();

  const { data: owner, error: ownerError } = await admin
    .from("profiles")
    .select("id, branch_id")
    .eq("organization_id", LOCAL_QA_ORG_ID)
    .eq("role", "owner")
    .eq("is_active", true)
    .limit(1)
    .single();
  if (ownerError || !owner?.id || !owner.branch_id) {
    throw new Error("A local Owner profile and branch are required.");
  }

  const { error: customerError } = await admin.from("customers").insert({
    id: customerId,
    organization_id: LOCAL_QA_ORG_ID,
    branch_id: owner.branch_id,
    name: `${marker} Customer`,
    outstanding_balance: 150,
    credit_limit: 1000,
    notes: `${marker} disposable local fixture`,
  });
  if (customerError) throw new Error(`Customer seed failed: ${customerError.message}`);

  const { error: productError } = await admin.from("products").insert({
    id: productId,
    organization_id: LOCAL_QA_ORG_ID,
    branch_id: owner.branch_id,
    name: `${marker} Product`,
    sku: marker,
    type: "product",
    purchase_price: 100,
    sale_price: 150,
    stock_quantity: 3,
    minimum_stock: 0,
    notes: `${marker} disposable local fixture`,
  });
  if (productError) throw new Error(`Product seed failed: ${productError.message}`);

  const { error: lotError } = await admin.from("product_stock_lots").insert({
    id: lotId,
    organization_id: LOCAL_QA_ORG_ID,
    branch_id: owner.branch_id,
    product_id: productId,
    lot_number: marker,
    quantity_received: 5,
    quantity_remaining: 3,
    unit_cost: 100,
    notes: `${marker} disposable local fixture`,
    created_by: owner.id,
  });
  if (lotError) throw new Error(`Lot seed failed: ${lotError.message}`);

  const { error: invoiceError } = await admin.from("invoices").insert({
    id: invoiceId,
    organization_id: LOCAL_QA_ORG_ID,
    branch_id: owner.branch_id,
    customer_id: customerId,
    invoice_no: marker,
    status: "partial",
    subtotal: 380,
    discount_total: 0,
    customer_credit_applied: 0,
    grand_total: 380,
    amount_paid: 230,
    balance_due: 150,
    amount_tendered: 230,
    change_due: 0,
    note: marker,
    created_by: owner.id,
  });
  if (invoiceError) throw new Error(`Invoice seed failed: ${invoiceError.message}`);

  const { error: itemError } = await admin.from("invoice_items").insert({
    id: invoiceItemId,
    organization_id: LOCAL_QA_ORG_ID,
    invoice_id: invoiceId,
    product_id: productId,
    product_name: `${marker} Product`,
    product_type: "product",
    quantity: 2,
    purchase_price: 100,
    unit_price: 150,
    item_discount: 0,
    line_total: 300,
  });
  if (itemError) throw new Error(`Invoice item seed failed: ${itemError.message}`);

  const { error: serviceError } = await admin.from("invoice_items").insert({
    id: serviceItemId,
    organization_id: LOCAL_QA_ORG_ID,
    invoice_id: invoiceId,
    product_id: null,
    product_name: `${marker} Service`,
    product_type: "service",
    quantity: 1,
    purchase_price: 0,
    unit_price: 80,
    item_discount: 0,
    line_total: 80,
    service_transaction_amount: 70,
    service_commission: 10,
    service_total_charged: 80,
  });
  if (serviceError) throw new Error(`Service item seed failed: ${serviceError.message}`);

  const { error: allocationError } = await admin
    .from("invoice_item_stock_allocations")
    .insert({
      organization_id: LOCAL_QA_ORG_ID,
      invoice_id: invoiceId,
      invoice_item_id: invoiceItemId,
      product_id: productId,
      stock_lot_id: lotId,
      quantity: 2,
      unit_cost: 100,
    });
  if (allocationError) {
    throw new Error(`Invoice allocation seed failed: ${allocationError.message}`);
  }

  const { error: paymentError } = await admin.from("payments").insert({
    organization_id: LOCAL_QA_ORG_ID,
    branch_id: owner.branch_id,
    invoice_id: invoiceId,
    customer_id: customerId,
    method: "card",
    amount: 230,
    note: marker,
    received_by: owner.id,
  });
  if (paymentError) throw new Error(`Payment seed failed: ${paymentError.message}`);

  const { error: ledgerError } = await admin
    .from("customer_ledger_entries")
    .insert({
      organization_id: LOCAL_QA_ORG_ID,
      branch_id: owner.branch_id,
      customer_id: customerId,
      invoice_id: invoiceId,
      entry_type: "invoice_credit",
      direction: "debit",
      amount: 150,
      balance_after: 150,
      description: marker,
      reference_number: marker,
      created_by: owner.id,
    });
  if (ledgerError) throw new Error(`Ledger seed failed: ${ledgerError.message}`);

  return {
    marker,
    ownerId: owner.id,
    branchId: owner.branch_id,
    customerId,
    productId,
    lotId,
    invoiceId,
    invoiceItemId,
    serviceItemId,
  };
}

async function readTruth(fixture: Fixture) {
  const admin = getLocalAdminClient();
  const [returns, items, allocations, movements, product, lot, customer, ledger] =
    await Promise.all([
      admin.from("returns").select("id, return_no, subtotal, refund_amount, refund_method").eq("invoice_id", fixture.invoiceId),
      admin.from("return_items").select("id, quantity, restock").eq("invoice_id", fixture.invoiceId),
      admin.from("return_stock_allocations").select("id, quantity, unit_cost").eq("product_id", fixture.productId),
      admin.from("stock_movements").select("id, quantity, movement_type").eq("product_id", fixture.productId).eq("reference_type", "return"),
      admin.from("products").select("stock_quantity").eq("id", fixture.productId).single(),
      admin.from("product_stock_lots").select("quantity_remaining").eq("id", fixture.lotId).single(),
      admin.from("customers").select("outstanding_balance").eq("id", fixture.customerId).single(),
      admin.from("customer_ledger_entries").select("id, entry_type, direction, amount, balance_after").eq("customer_id", fixture.customerId).eq("entry_type", "refund"),
    ]);
  for (const result of [returns, items, allocations, movements, product, lot, customer, ledger]) {
    if (result.error) throw new Error(result.error.message);
  }
  return {
    returns: returns.data ?? [],
    items: items.data ?? [],
    allocations: allocations.data ?? [],
    movements: movements.data ?? [],
    productQuantity: Number(product.data?.stock_quantity ?? -1),
    lotQuantity: Number(lot.data?.quantity_remaining ?? -1),
    customerOutstanding: Number(customer.data?.outstanding_balance ?? -1),
    ledger: ledger.data ?? [],
  };
}

async function cleanupFixture(fixture: Fixture): Promise<Record<string, number>> {
  const admin = getLocalAdminClient();
  await admin
    .from("audit_logs")
    .delete()
    .eq("organization_id", LOCAL_QA_ORG_ID)
    .contains("metadata", { invoice_id: fixture.invoiceId });
  await admin.from("audit_logs").delete().eq("organization_id", LOCAL_QA_ORG_ID).like("details", `%${fixture.marker}%`);
  await admin.from("returns").delete().eq("invoice_id", fixture.invoiceId);
  await admin.from("customer_ledger_entries").delete().eq("customer_id", fixture.customerId);
  await admin.from("stock_movements").delete().eq("product_id", fixture.productId);
  await admin.from("invoices").delete().eq("id", fixture.invoiceId);
  await admin.from("product_stock_lots").delete().eq("id", fixture.lotId);
  await admin.from("products").delete().eq("id", fixture.productId);
  await admin.from("customers").delete().eq("id", fixture.customerId);

  const counts: Record<string, number> = {};
  for (const [table, column, value] of [
    ["returns", "invoice_id", fixture.invoiceId],
    ["return_items", "invoice_id", fixture.invoiceId],
    ["return_stock_allocations", "product_id", fixture.productId],
    ["stock_movements", "product_id", fixture.productId],
    ["customer_ledger_entries", "customer_id", fixture.customerId],
    ["invoices", "id", fixture.invoiceId],
    ["products", "id", fixture.productId],
    ["customers", "id", fixture.customerId],
  ] as const) {
    const result = await admin.from(table).select("id", { count: "exact", head: true }).eq(column, value);
    if (result.error) throw new Error(result.error.message);
    counts[table] = result.count ?? -1;
  }
  return counts;
}

function attachBrowserEvidence(page: Page) {
  const actionPosts: string[] = [];
  const actionResponses: number[] = [];
  const pageErrors: string[] = [];
  const rawConsoleErrors: string[] = [];
  const httpErrors: string[] = [];
  const expectedLocalDiagnostics: string[] = [];
  const abortedLocalAuthRequests: string[] = [];
  const allowDevelopmentDiagnostics =
    process.env.RETURN_SETTLEMENT_ALLOW_DEV_DIAGNOSTICS === "1";
  const expectedLocalTelemetryAsset = (path: string, text = "") => {
    for (const asset of [
      "/_vercel/insights/script.js",
      "/_vercel/speed-insights/script.js",
    ]) {
      if (path === asset || text.includes(asset)) return asset;
    }
    return null;
  };
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname.startsWith("/invoices/")) {
      actionPosts.push(new URL(request.url()).pathname);
    }
  });
  page.on("response", (response) => {
    if (
      response.request().method() === "POST" &&
      new URL(response.url()).pathname.startsWith("/invoices/")
    ) {
      actionResponses.push(response.status());
    }
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    const path = message.location().url
      ? new URL(message.location().url).pathname
      : "unknown";
    const telemetryAsset = expectedLocalTelemetryAsset(path, text);
    if (telemetryAsset) {
      expectedLocalDiagnostics.push(`console ${telemetryAsset}`);
      return;
    }
    if (
      allowDevelopmentDiagnostics &&
      text.includes("A tree hydrated but some attributes") &&
      text.includes('nonce="')
    ) {
      expectedLocalDiagnostics.push("development nonce hydration diagnostic");
      return;
    }
    if (
      allowDevelopmentDiagnostics &&
      text.includes("TypeError: Failed to fetch") &&
      text.includes("supabase_auth-js")
    ) {
      expectedLocalDiagnostics.push(
        "development auth fetch diagnostic after intentional session removal",
      );
      return;
    }
    if (/clarity\.ms|user_ui_preferences/i.test(text)) return;
    rawConsoleErrors.push(`${path}: ${text}`);
  });
  page.on("requestfailed", (request) => {
    const url = new URL(request.url());
    if (
      isLocalPlaywrightRun() &&
      url.pathname === "/auth/v1/user" &&
      request.failure()?.errorText === "net::ERR_ABORTED"
    ) {
      abortedLocalAuthRequests.push("GET /auth/v1/user net::ERR_ABORTED");
    }
  });
  page.on("response", (response) => {
    if (response.status() < 400) return;
    const path = new URL(response.url()).pathname;
    const telemetryAsset = expectedLocalTelemetryAsset(path);
    if (telemetryAsset) {
      expectedLocalDiagnostics.push(`HTTP ${response.status()} ${telemetryAsset}`);
      return;
    }
    httpErrors.push(`${response.status()} ${path}`);
  });
  const unexpectedConsoleErrors = () => {
    let authAbortAllowance = abortedLocalAuthRequests.length;
    return rawConsoleErrors.filter((error) => {
      if (authAbortAllowance > 0 && error.includes("TypeError: Failed to fetch")) {
        authAbortAllowance -= 1;
        return false;
      }
      return true;
    });
  };
  return {
    actionPosts,
    actionResponses,
    pageErrors,
    httpErrors,
    get consoleErrors() {
      return unexpectedConsoleErrors();
    },
    get expectedLocalTelemetryErrors() {
      return [...expectedLocalDiagnostics, ...abortedLocalAuthRequests];
    },
  };
}

async function seedRejectedCookieConsent(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "analytics-consent",
      JSON.stringify({
        value: "rejected",
        version: "2026-06-analytics-v1",
        timestamp: new Date().toISOString(),
      }),
    );
  });
}

function invoiceReturnForm(page: Page, invoiceId: string) {
  return page
    .locator("form")
    .filter({ has: page.locator(`input[name="invoice_id"][value="${invoiceId}"]`) });
}

async function prepareReturn(
  page: Page,
  fixture: Fixture,
  input: {
    item: "Product" | "Service";
    refundAmount: number;
    refundMethod?: "Cash" | "Card";
    restock?: boolean;
  },
) {
  const form = invoiceReturnForm(page, fixture.invoiceId);
  const row = form.locator("tr").filter({
    hasText: `${fixture.marker} ${input.item}`,
  });
  await form.getByRole("button", { name: "Refund method" }).click();
  await page
    .getByRole("option", {
      name: input.refundMethod ?? "No payout now",
      exact: true,
    })
    .click();
  await row.locator('input[name="quantity"]').fill("1");
  const restock = row.locator('input[name="restock_item_id"]');
  if ((await restock.count()) > 0 && input.restock === false) {
    await restock.uncheck();
  }
  await form
    .locator('input[name="refund_amount"]')
    .fill(String(input.refundAmount));
  await form.locator('textarea[name="notes"]').fill(fixture.marker);
  await expect(row.locator('input[name="quantity"]')).toHaveValue("1");
  await expect(
    form.getByRole("button", { name: "Process return", exact: true }),
  ).toBeEnabled();
  return form;
}

async function waitForSuccessReconciliation(
  page: Page,
  previousReturnState: string | null,
) {
  await expect.poll(() => {
    return new URL(page.url()).searchParams.get("returnstate");
  }).not.toBe(previousReturnState);
}

async function auditCounts(invoiceId: string) {
  const admin = getLocalAdminClient();
  const [completed, created] = await Promise.all([
    admin
      .from("audit_logs")
      .select("id", { count: "exact", head: true })
      .eq("action", "return.completed")
      .contains("metadata", { invoice_id: invoiceId }),
    admin
      .from("audit_logs")
      .select("id", { count: "exact", head: true })
      .eq("action", "returns.created")
      .contains("metadata", { invoice_id: invoiceId }),
  ]);
  if (completed.error) throw new Error(completed.error.message);
  if (created.error) throw new Error(created.error.message);
  return {
    completed: completed.count ?? -1,
    created: created.count ?? -1,
  };
}

test("a durable Return settles the original form before route reconciliation", async ({ page }) => {
  test.skip(!isLocalPlaywrightRun() || !PROXY_URL, "The loopback revalidation proxy is required.");
  test.setTimeout(120_000);

  await proxyControl("/__qa/reset");
  const fixture = await seedFixture();
  const browser = attachBrowserEvidence(page);
  let truth: Awaited<ReturnType<typeof readTruth>> | null = null;
  let proxy: ProxyStatus | null = null;
  let cleanup: Record<string, number> = {};
  let failure: string | null = null;
  let successObservedBeforeRelease = false;
  let pendingClearedBeforeRelease = false;

  try {
    await seedRejectedCookieConsent(page);
    await loginLocalOwnerDirectly(page);
    await page.goto(`/invoices/${fixture.invoiceId}`);
    await expect(page.getByRole("heading", { name: `Invoice ${fixture.marker}` })).toBeVisible();

    const form = invoiceReturnForm(page, fixture.invoiceId);
    await form.locator('input[name="quantity"]').first().fill("1");
    await form.locator('input[name="refund_amount"]').fill("50");
    await form.getByRole("button", { name: "Refund method" }).click();
    await page.getByRole("option", { name: "Cash", exact: true }).click();
    await form.locator('textarea[name="notes"]').fill(fixture.marker);

    await proxyControl("/__qa/arm");
    await form.getByRole("button", { name: "Process return", exact: true }).click();
    await expect(form.getByRole("button", { name: "Processing return...", exact: true })).toBeDisabled();

    await expect.poll(async () => {
      truth = await readTruth(fixture);
      return {
        returns: truth.returns.length,
        items: truth.items.length,
        allocations: truth.allocations.length,
        movements: truth.movements.length,
        productQuantity: truth.productQuantity,
        lotQuantity: truth.lotQuantity,
        customerOutstanding: truth.customerOutstanding,
        ledger: truth.ledger.length,
      };
    }).toEqual({
      returns: 1,
      items: 1,
      allocations: 1,
      movements: 1,
      productQuantity: 4,
      lotQuantity: 4,
      customerOutstanding: 0,
      ledger: 1,
    });

    await expect.poll(async () => {
      proxy = await proxyControl("/__qa/status");
      return { rpcCount: proxy.rpcCount, heldRead: proxy.heldReadCount > 0 };
    }).toEqual({ rpcCount: 1, heldRead: true });

    await expect(page.getByRole("heading", { name: "Return Processed" })).toBeVisible({ timeout: 3_000 });
    await expect(page.getByText("Return No:", { exact: true })).toBeVisible();
    await expect(page.getByText("Refund Amount:", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "View return" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Refresh invoice" })).toBeVisible();
    await expect(page.getByText("Processing return...", { exact: true })).toHaveCount(0);
    successObservedBeforeRelease = true;
    pendingClearedBeforeRelease = true;
    expect(browser.actionPosts).toHaveLength(1);
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    await proxyControl("/__qa/release").catch(() => undefined);
    truth = await readTruth(fixture).catch(() => truth);
    cleanup = await cleanupFixture(fixture);
    mkdirSync(dirname(EVIDENCE_FILE), { recursive: true });
    writeFileSync(EVIDENCE_FILE, JSON.stringify({
      source: process.env.RETURN_SETTLEMENT_SOURCE ?? "unknown",
      fixture: { marker: fixture.marker },
      actionPosts: browser.actionPosts.length,
      actionResponses: browser.actionResponses,
      proxy,
      truth: truth ? {
        returns: truth.returns.length,
        returnItems: truth.items.length,
        allocations: truth.allocations.length,
        movements: truth.movements.length,
        productQuantity: truth.productQuantity,
        lotQuantity: truth.lotQuantity,
        customerOutstanding: truth.customerOutstanding,
        refundLedgerEntries: truth.ledger.length,
        digest: digest(truth),
      } : null,
      browser: {
        successObservedBeforeRelease,
        pendingClearedBeforeRelease,
        pendingVisible: await page.getByText("Processing return...", { exact: true }).isVisible().catch(() => false),
        successVisible: await page.getByRole("heading", { name: "Return Processed" }).isVisible().catch(() => false),
        pageErrors: browser.pageErrors,
        consoleErrors: browser.consoleErrors,
        httpErrors: browser.httpErrors,
        expectedLocalTelemetryErrors: browser.expectedLocalTelemetryErrors,
      },
      failure,
      cleanup,
    }, null, 2));
    expect(Object.values(cleanup).every((count) => count === 0)).toBe(true);
  }
});

test("an expired session navigates to login without a Return mutation", async ({ page }) => {
  test.skip(!isLocalPlaywrightRun() || !PROXY_URL, "The loopback revalidation proxy is required.");
  test.setTimeout(90_000);

  await proxyControl("/__qa/reset");
  const fixture = await seedFixture();
  const browser = attachBrowserEvidence(page);
  let result: Record<string, unknown> = {};
  try {
    await seedRejectedCookieConsent(page);
    await loginLocalOwnerDirectly(page);
    await page.goto(`/invoices/${fixture.invoiceId}`);
    const form = await prepareReturn(page, fixture, {
      item: "Service",
      refundAmount: 0,
    });

    await page.context().clearCookies();
    await form.getByRole("button", { name: "Process return", exact: true }).click();
    await expect(page).toHaveURL(/\/login(?:\?|$)/, { timeout: 15_000 });
    await expect(page.getByText("We couldn't confirm the result.", { exact: false })).toHaveCount(0);
    await expect(invoiceReturnForm(page, fixture.invoiceId)).toHaveCount(0);

    const proxy = await proxyControl("/__qa/status");
    const truth = await readTruth(fixture);
    expect(browser.actionPosts).toHaveLength(1);
    expect(proxy.rpcCount).toBe(0);
    expect(truth.returns).toHaveLength(0);
    expect(truth.items).toHaveLength(0);
    expect(truth.allocations).toHaveLength(0);
    expect(truth.movements).toHaveLength(0);
    expect(truth.productQuantity).toBe(3);
    expect(truth.lotQuantity).toBe(3);
    expect(truth.customerOutstanding).toBe(150);
    expect(truth.ledger).toHaveLength(0);
    expect(browser.pageErrors).toEqual([]);
    expect(browser.consoleErrors).toEqual([]);
    expect(browser.httpErrors).toEqual([]);
    result = {
      exactHeadSource: "typed-auth-routing-correction",
      finalPath: new URL(page.url()).pathname,
      actionPosts: browser.actionPosts.length,
      rpcCount: proxy.rpcCount,
      returns: truth.returns.length,
      returnItems: truth.items.length,
      stockAllocations: truth.allocations.length,
      stockMovements: truth.movements.length,
      customerLedgerEntries: truth.ledger.length,
      uncertainMessageVisible: false,
      staleReturnFormVisible: false,
      noAutomaticRetry: true,
      browserErrors: {
        pageErrors: browser.pageErrors,
        consoleErrors: browser.consoleErrors,
        httpErrors: browser.httpErrors,
        expectedLocalTelemetryErrors: browser.expectedLocalTelemetryErrors,
      },
    };
  } finally {
    await proxyControl("/__qa/release").catch(() => undefined);
    const cleanup = await cleanupFixture(fixture);
    mkdirSync(dirname(AUTH_REDIRECT_EVIDENCE_FILE), { recursive: true });
    writeFileSync(
      AUTH_REDIRECT_EVIDENCE_FILE,
      JSON.stringify({ ...result, cleanup }, null, 2),
    );
    expect(Object.values(cleanup).every((count) => count === 0)).toBe(true);
  }
});

test("Cash, Card, zero-payout, partial, service, and stock outcomes settle exactly once", async ({ page }) => {
  test.skip(!isLocalPlaywrightRun() || !PROXY_URL, "The loopback revalidation proxy is required.");
  test.setTimeout(180_000);

  await proxyControl("/__qa/reset");
  const fixture = await seedFixture();
  const browser = attachBrowserEvidence(page);
  const admin = getLocalAdminClient();
  let cleanup: Record<string, number> = {};
  let finalTruth: Awaited<ReturnType<typeof readTruth>> | null = null;
  let finalAudits: Awaited<ReturnType<typeof auditCounts>> | null = null;
  let proxy: ProxyStatus | null = null;
  const responsive: Array<Record<string, unknown>> = [];

  try {
    await seedRejectedCookieConsent(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginLocalOwnerDirectly(page);
    await page.goto(`/invoices/${fixture.invoiceId}`);
    const sidebar = page.locator('[data-sidebar-state]:visible');
    await expect(sidebar).toHaveCount(1);
    await sidebar.evaluate((element) => {
      element.setAttribute("data-qa-return-shell", "persistent");
    });

    const firstReturnState = new URL(page.url()).searchParams.get("returnstate");
    const firstForm = await prepareReturn(page, fixture, {
      item: "Product",
      refundAmount: 50,
      refundMethod: "Card",
      restock: true,
    });
    const firstButton = firstForm.getByRole("button", {
      name: "Process return",
      exact: true,
    });
    await firstButton.evaluate((element: HTMLButtonElement) => {
      element.click();
      element.click();
    });
    await expect(
      page.getByRole("heading", { name: "Return Processed" }),
    ).toBeVisible({ timeout: 15_000 });
    await waitForSuccessReconciliation(page, firstReturnState);
    await expect(page.locator('[data-qa-return-shell="persistent"]')).toHaveCount(1);
    await expect(
      page.getByRole("dialog", { name: "This account is active somewhere else" }),
    ).toHaveCount(0);
    expect(browser.actionPosts).toHaveLength(1);

    for (const viewport of [
      { width: 320, height: 568 },
      { width: 390, height: 844 },
      { width: 430, height: 932 },
    ]) {
      await page.setViewportSize(viewport);
      await expect(page.getByRole("link", { name: "View return" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Refresh invoice" })).toBeVisible();
      const dimensions = await page.evaluate(() => ({
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
      }));
      expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.viewportWidth);
      const screenshots = join(dirname(MATRIX_EVIDENCE_FILE), "screenshots");
      mkdirSync(screenshots, { recursive: true });
      await page.screenshot({
        path: join(screenshots, `return-success-${viewport.width}x${viewport.height}.png`),
        fullPage: true,
      });
      responsive.push({
        ...viewport,
        ...dimensions,
        successControlsReachable: true,
        horizontalOverflow: false,
      });
    }

    await page.getByRole("button", { name: "Refresh invoice" }).click();
    const productRow = invoiceReturnForm(page, fixture.invoiceId)
      .locator("tr")
      .filter({ hasText: `${fixture.marker} Product` });
    await expect(productRow).toContainText("1");
    await expect(productRow.locator('input[name="quantity"]')).toHaveAttribute("max", "1");

    const secondReturnState = new URL(page.url()).searchParams.get("returnstate");
    const secondForm = await prepareReturn(page, fixture, {
      item: "Product",
      refundAmount: 0,
      restock: false,
    });
    await secondForm.getByRole("button", { name: "Process return", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Return Processed" })).toBeVisible({ timeout: 15_000 });
    await waitForSuccessReconciliation(page, secondReturnState);
    expect(browser.actionPosts).toHaveLength(2);

    await page.getByRole("button", { name: "Refresh invoice" }).click();
    const thirdReturnState = new URL(page.url()).searchParams.get("returnstate");
    const thirdForm = await prepareReturn(page, fixture, {
      item: "Service",
      refundAmount: 80,
      refundMethod: "Cash",
    });
    await thirdForm.getByRole("button", { name: "Process return", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Return Processed" })).toBeVisible({ timeout: 15_000 });
    await waitForSuccessReconciliation(page, thirdReturnState);
    expect(browser.actionPosts).toHaveLength(3);

    finalTruth = await readTruth(fixture);
    expect(finalTruth).toMatchObject({
      productQuantity: 4,
      lotQuantity: 4,
      customerOutstanding: 0,
    });
    expect(finalTruth.returns).toHaveLength(3);
    expect(finalTruth.items).toHaveLength(3);
    expect(finalTruth.allocations).toHaveLength(1);
    expect(finalTruth.movements).toHaveLength(1);
    expect(finalTruth.ledger).toHaveLength(1);
    expect(finalTruth.ledger[0]).toMatchObject({
      entry_type: "refund",
      direction: "credit",
      amount: 150,
      balance_after: 0,
    });

    const { data: returnRows, error: returnError } = await admin
      .from("returns")
      .select("refund_amount, refund_method")
      .eq("invoice_id", fixture.invoiceId)
      .order("return_no");
    if (returnError) throw new Error(returnError.message);
    expect(returnRows).toEqual([
      { refund_amount: 50, refund_method: "card" },
      { refund_amount: 0, refund_method: null },
      { refund_amount: 80, refund_method: "cash" },
    ]);

    await expect.poll(async () => {
      finalAudits = await auditCounts(fixture.invoiceId);
      return finalAudits;
    }).toEqual({ completed: 3, created: 3 });
    proxy = await proxyControl("/__qa/status");
    expect(proxy.rpcCount).toBe(3);
    expect(browser.actionResponses).toEqual([200, 200, 200]);
    expect(browser.pageErrors).toEqual([]);
    expect(browser.consoleErrors).toEqual([]);
    expect(browser.httpErrors).toEqual([]);
  } finally {
    await proxyControl("/__qa/release").catch(() => undefined);
    cleanup = await cleanupFixture(fixture);
    mkdirSync(dirname(MATRIX_EVIDENCE_FILE), { recursive: true });
    writeFileSync(
      MATRIX_EVIDENCE_FILE,
      JSON.stringify(
        {
          actionPosts: browser.actionPosts.length,
          actionResponses: browser.actionResponses,
          proxy,
          truth: finalTruth
            ? {
                returns: finalTruth.returns.length,
                returnItems: finalTruth.items.length,
                stockAllocations: finalTruth.allocations.length,
                stockMovements: finalTruth.movements.length,
                productQuantity: finalTruth.productQuantity,
                lotQuantity: finalTruth.lotQuantity,
                customerOutstanding: finalTruth.customerOutstanding,
                refundLedgerEntries: finalTruth.ledger.length,
              }
            : null,
          audits: finalAudits,
          responsive,
          persistentShell: true,
          activeWorkspacePause: false,
          browserErrors: {
            pageErrors: browser.pageErrors,
            consoleErrors: browser.consoleErrors,
            httpErrors: browser.httpErrors,
            expectedLocalTelemetryErrors: browser.expectedLocalTelemetryErrors,
          },
          cleanup,
        },
        null,
        2,
      ),
    );
    expect(Object.values(cleanup).every((count) => count === 0)).toBe(true);
  }
});

test("a confirmed RPC error clears pending without a partial Return", async ({ page }) => {
  test.skip(!isLocalPlaywrightRun() || !PROXY_URL, "The loopback revalidation proxy is required.");
  test.setTimeout(90_000);

  await proxyControl("/__qa/reset");
  const fixture = await seedFixture();
  const browser = attachBrowserEvidence(page);
  let result: Record<string, unknown> = {};
  try {
    await seedRejectedCookieConsent(page);
    await loginLocalOwnerDirectly(page);
    await page.goto(`/invoices/${fixture.invoiceId}`);
    const form = await prepareReturn(page, fixture, {
      item: "Product",
      refundAmount: 150,
      refundMethod: "Cash",
    });
    await form.locator('input[name="refund_amount"]').evaluate((element) => {
      element.removeAttribute("max");
    });
    await form.locator('input[name="refund_amount"]').fill("151");
    await form.getByRole("button", { name: "Process return", exact: true }).click();

    await expect(form.getByRole("alert")).toBeVisible({ timeout: 15_000 });
    await expect(form.getByRole("button", { name: "Process return", exact: true })).toBeEnabled();
    await expect(page.getByText("Processing return...", { exact: true })).toHaveCount(0);
    const truth = await readTruth(fixture);
    expect(truth.returns).toHaveLength(0);
    expect(truth.items).toHaveLength(0);
    expect(truth.productQuantity).toBe(3);
    expect(truth.lotQuantity).toBe(3);
    expect(truth.customerOutstanding).toBe(150);
    expect(browser.actionPosts).toHaveLength(1);
    const proxy = await proxyControl("/__qa/status");
    expect(proxy.rpcCount).toBe(1);
    expect(browser.pageErrors).toEqual([]);
    expect(browser.consoleErrors).toEqual([]);
    expect(browser.httpErrors).toEqual([]);
    result = {
      alertVisible: true,
      pendingCleared: true,
      submitEnabled: true,
      actionPosts: browser.actionPosts.length,
      rpcCount: proxy.rpcCount,
      returns: truth.returns.length,
      returnItems: truth.items.length,
      productQuantity: truth.productQuantity,
      lotQuantity: truth.lotQuantity,
      customerOutstanding: truth.customerOutstanding,
      browserErrors: {
        pageErrors: browser.pageErrors,
        consoleErrors: browser.consoleErrors,
        httpErrors: browser.httpErrors,
      },
    };
  } finally {
    await proxyControl("/__qa/release").catch(() => undefined);
    const cleanup = await cleanupFixture(fixture);
    mkdirSync(dirname(ERROR_EVIDENCE_FILE), { recursive: true });
    writeFileSync(
      ERROR_EVIDENCE_FILE,
      JSON.stringify({ ...result, cleanup }, null, 2),
    );
    expect(Object.values(cleanup).every((count) => count === 0)).toBe(true);
  }
});

test("an interrupted action response becomes uncertain and never retries", async ({ page }) => {
  test.skip(!isLocalPlaywrightRun() || !PROXY_URL, "The loopback revalidation proxy is required.");
  test.setTimeout(90_000);

  await proxyControl("/__qa/reset");
  const fixture = await seedFixture();
  const browser = attachBrowserEvidence(page);
  let result: Record<string, unknown> = {};
  try {
    await seedRejectedCookieConsent(page);
    await loginLocalOwnerDirectly(page);
    await page.goto(`/invoices/${fixture.invoiceId}`);
    const form = await prepareReturn(page, fixture, {
      item: "Product",
      refundAmount: 50,
      refundMethod: "Cash",
      restock: true,
    });
    await page.route(`**/invoices/${fixture.invoiceId}`, async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      await route.fetch();
      await route.abort("connectionfailed");
    });

    await form.getByRole("button", { name: "Process return", exact: true }).click();
    await expect(form.getByRole("alert")).toContainText(
      "We couldn't confirm the result. Refresh the invoice before trying again.",
      { timeout: 15_000 },
    );
    const button = form.getByRole("button", { name: "Process return", exact: true });
    await expect(button).toBeDisabled();

    await expect.poll(async () => (await readTruth(fixture)).returns.length).toBe(1);
    await button.evaluate((element: HTMLButtonElement) => element.click());
    await page.waitForTimeout(500);
    expect(browser.actionPosts).toHaveLength(1);
    const proxy = await proxyControl("/__qa/status");
    const truth = await readTruth(fixture);
    expect(proxy.rpcCount).toBe(1);
    expect(truth.returns).toHaveLength(1);
    result = {
      uncertainMessageVisible: true,
      submitLocked: true,
      actionPosts: browser.actionPosts.length,
      rpcCount: proxy.rpcCount,
      returns: truth.returns.length,
      noAutomaticRetry: true,
      pageErrors: browser.pageErrors,
    };
  } finally {
    await page.unroute(`**/invoices/${fixture.invoiceId}`).catch(() => undefined);
    await proxyControl("/__qa/release").catch(() => undefined);
    const cleanup = await cleanupFixture(fixture);
    mkdirSync(dirname(UNCERTAIN_EVIDENCE_FILE), { recursive: true });
    writeFileSync(
      UNCERTAIN_EVIDENCE_FILE,
      JSON.stringify({ ...result, cleanup }, null, 2),
    );
    expect(Object.values(cleanup).every((count) => count === 0)).toBe(true);
  }
});
