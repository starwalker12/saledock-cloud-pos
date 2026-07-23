import {
  expect,
  test,
  type Browser,
  type Page,
  type Request,
} from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import {
  getLocalAdminClient,
  getLocalAuthConfig,
  isLocalPlaywrightRun,
  loginLocalOwnerDirectly,
  LOCAL_QA_ORG_ID,
} from "./helpers/local-supabase";

async function ownerClient() {
  const { url, anonKey } = getLocalAuthConfig();
  const client = createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  const { error } = await client.auth.signInWithPassword({
    email: "owner@saledock.local",
    password: "Password123!",
  });
  if (error) throw new Error(`Local owner login failed: ${error.message}`);
  return client;
}

function browserEvidence(page: Page) {
  const evidence = {
    actionPosts: 0,
    actionResponses: [] as number[],
    actionTimeline: [] as Array<{
      event: "request" | "response" | "failed";
      path: string;
      timestamp: number;
      status?: number;
    }>,
    rscTimeline: [] as Array<{
      event: "request" | "response" | "failed";
      path: string;
      timestamp: number;
      status?: number;
    }>,
    unexpectedWrites: [] as string[],
    pageErrors: [] as string[],
    consoleErrors: [] as string[],
    requestFailures: [] as string[],
    expectedNavigationCancellations: 0,
    nativeDialogs: 0,
  };
  const actionPaths = [
    /^\/suppliers\/purchases\/new$/,
    /^\/suppliers\/purchases\/[0-9a-f-]+$/,
  ];

  page.on("pageerror", (error) => evidence.pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const source = message.location().url;
    const text = `${message.text()} ${source}`;
    const expectedLocalInstrumentation =
      /\/_vercel\/(?:insights|speed-insights)|clarity\.ms\/tag\/dummy-clarity/i.test(
        text,
      );
    const optionalLocalPreference =
      source.startsWith(
        "http://127.0.0.1:54321/rest/v1/user_ui_preferences?",
      ) && message.text().includes("status of 406");
    if (!expectedLocalInstrumentation && !optionalLocalPreference) {
      evidence.consoleErrors.push(text);
    }
  });
  page.on("dialog", async (dialog) => {
    evidence.nativeDialogs += 1;
    await dialog.dismiss();
  });
  page.on("requestfailed", (request) => {
    const pathname = new URL(request.url()).pathname;
    const isAction =
      request.method() === "POST" &&
      actionPaths.some((pattern) => pattern.test(pathname));
    const isRsc =
      request.method() === "GET" &&
      request.resourceType() === "fetch" &&
      new URL(request.url()).searchParams.has("_rsc");
    if (isAction) {
      evidence.actionTimeline.push({
        event: "failed",
        path: pathname,
        timestamp: Date.now(),
      });
    }
    if (isRsc) {
      evidence.rscTimeline.push({
        event: "failed",
        path: pathname,
        timestamp: Date.now(),
      });
    }
    if (/^\/_vercel\/(?:insights|speed-insights)\/script\.js$/i.test(pathname))
      return;
    if (
      request.failure()?.errorText === "net::ERR_ABORTED" &&
      ((request.method() === "GET" && request.resourceType() === "fetch") ||
        (request.method() === "POST" &&
          actionPaths.some((pattern) => pattern.test(pathname))))
    ) {
      evidence.expectedNavigationCancellations += 1;
      return;
    }
    evidence.requestFailures.push(`${request.method()} ${pathname}`);
  });
  page.on("response", (response) => {
    const request = response.request();
    const pathname = new URL(response.url()).pathname;
    if (
      request.method() === "POST" &&
      actionPaths.some((pattern) => pattern.test(pathname))
    ) {
      evidence.actionResponses.push(response.status());
      evidence.actionTimeline.push({
        event: "response",
        path: pathname,
        timestamp: Date.now(),
        status: response.status(),
      });
    }
    if (
      request.method() === "GET" &&
      request.resourceType() === "fetch" &&
      new URL(response.url()).searchParams.has("_rsc")
    ) {
      evidence.rscTimeline.push({
        event: "response",
        path: pathname,
        timestamp: Date.now(),
        status: response.status(),
      });
    }
  });
  page.on("request", (request: Request) => {
    const url = new URL(request.url());
    if (
      request.method() === "GET" &&
      request.resourceType() === "fetch" &&
      url.searchParams.has("_rsc")
    ) {
      evidence.rscTimeline.push({
        event: "request",
        path: url.pathname,
        timestamp: Date.now(),
      });
    }
    if (["GET", "HEAD", "OPTIONS"].includes(request.method())) return;
    if (url.port === "54321") return;
    if (
      request.method() === "POST" &&
      actionPaths.some((pattern) => pattern.test(url.pathname))
    ) {
      evidence.actionPosts += 1;
      evidence.actionTimeline.push({
        event: "request",
        path: url.pathname,
        timestamp: Date.now(),
      });
      return;
    }
    evidence.unexpectedWrites.push(`${request.method()} ${url.pathname}`);
  });
  return evidence;
}

async function countMatchingAudit(supplierId: string, action: string) {
  const admin = getLocalAdminClient();
  const { count, error } = await admin
    .from("audit_logs")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", LOCAL_QA_ORG_ID)
    .eq("module", "purchases")
    .eq("action", action)
    .contains("metadata", { supplier_id: supplierId });
  if (error) throw new Error(`Audit verification failed: ${error.message}`);
  return count ?? 0;
}

async function cashShiftSignature() {
  const admin = getLocalAdminClient();
  const { data, error } = await admin
    .from("cash_shifts")
    .select("*")
    .order("id");
  if (error) throw new Error(`Cash-shift signature failed: ${error.message}`);
  return JSON.stringify(data ?? []);
}

test.describe("supplier purchase number generation", () => {
  test.skip(!isLocalPlaywrightRun(), "This mutation test is loopback-only.");

  test("unpaid purchase preserves numbering, FIFO, ledger, and cash state", async ({
    page,
  }) => {
    test.setTimeout(150_000);
    const marker = `QA-SP-E2E-${Date.now().toString(36).slice(-6)}`;
    const supplierId = crypto.randomUUID();
    const productId = crypto.randomUUID();
    const reference = `${marker}-REF`;
    const admin = getLocalAdminClient();
    const owner = await ownerClient();
    const evidence = browserEvidence(page);
    const cashBefore = await cashShiftSignature();
    let purchaseId: string | null = null;

    try {
      const { data: profile, error: profileError } = await owner
        .from("profiles")
        .select("branch_id")
        .eq("organization_id", LOCAL_QA_ORG_ID)
        .eq("role", "owner")
        .eq("is_active", true)
        .single();
      if (profileError || !profile?.branch_id) {
        throw new Error(
          `Owner profile unavailable: ${profileError?.message ?? "missing branch"}`,
        );
      }

      const { error: supplierError } = await owner.from("suppliers").insert({
        id: supplierId,
        organization_id: LOCAL_QA_ORG_ID,
        name: `${marker} Supplier`,
        notes: `${marker} local browser fixture`,
        is_active: true,
      });
      if (supplierError)
        throw new Error(`Supplier fixture failed: ${supplierError.message}`);

      const { error: productError } = await owner.rpc(
        "create_product_with_opening_stock",
        {
          p_product_id: productId,
          p_name: `${marker} Product`,
          p_sku: marker.replaceAll("-", ""),
          p_barcode: null,
          p_category_id: null,
          p_supplier_id: supplierId,
          p_product_type: "product",
          p_purchase_price: 100,
          p_sale_price: 150,
          p_opening_stock: 5,
          p_minimum_stock: 2,
          p_allow_sell_at_loss: false,
          p_sell_at_loss_reason: "",
          p_image_path: null,
          p_notes: `${marker} local browser fixture`,
          p_is_active: true,
        },
      );
      if (productError)
        throw new Error(`Product fixture failed: ${productError.message}`);

      await loginLocalOwnerDirectly(page);
      await page.goto("/suppliers/purchases/new");
      await expect(
        page.getByRole("heading", { name: "Record purchase" }),
      ).toBeVisible();

      await page.getByRole("button", { name: "Supplier", exact: true }).click();
      await page.getByRole("option", { name: new RegExp(marker) }).click();
      await page
        .getByRole("button", { name: "Add product", exact: true })
        .click();
      await page.getByRole("option", { name: new RegExp(marker) }).click();
      await page.getByRole("button", { name: "Add line" }).click();
      const itemRow = page
        .locator("tbody tr")
        .filter({ hasText: `${marker} Product` });
      await itemRow.locator('input[type="number"]').nth(0).fill("3");
      await itemRow.locator('input[type="number"]').nth(1).fill("100");
      await page.getByLabel("Supplier invoice / ref #").fill(reference);
      await page.getByLabel("Notes").fill(`${marker} unpaid purchase`);
      await page.getByLabel("Amount paid").fill("0");
      await page.getByRole("button", { name: "Record purchase" }).click();

      await expect(page).toHaveURL(/\/suppliers\/purchases\/[0-9a-f-]+$/, {
        timeout: 30_000,
      });
      purchaseId = page.url().split("/").at(-1) ?? null;
      expect(purchaseId).toMatch(/^[0-9a-f-]{36}$/);
      await expect(page.getByText("unpaid", { exact: true })).toBeVisible();

      const { data: purchases, error: purchaseError } = await admin
        .from("supplier_purchases")
        .select(
          "id, purchase_no, status, subtotal, grand_total, amount_paid, balance_due",
        )
        .eq("organization_id", LOCAL_QA_ORG_ID)
        .eq("reference_no", reference);
      if (purchaseError)
        throw new Error(
          `Purchase verification failed: ${purchaseError.message}`,
        );
      expect(purchases).toHaveLength(1);
      const purchase = purchases![0];
      expect(purchase.id).toBe(purchaseId);
      expect(purchase.purchase_no).toMatch(/^PUR-\d{6,}$/);
      expect({
        status: purchase.status,
        subtotal: Number(purchase.subtotal),
        grand: Number(purchase.grand_total),
        paid: Number(purchase.amount_paid),
        due: Number(purchase.balance_due),
      }).toEqual({
        status: "unpaid",
        subtotal: 300,
        grand: 300,
        paid: 0,
        due: 300,
      });
      await expect(
        page.getByRole("heading", { name: purchase.purchase_no, exact: true }),
      ).toBeVisible();

      const [items, lots, movements, product, supplier, ledgers, payments] =
        await Promise.all([
          admin
            .from("supplier_purchase_items")
            .select("*")
            .eq("purchase_id", purchaseId),
          admin
            .from("product_stock_lots")
            .select("*")
            .eq("product_id", productId),
          admin.from("stock_movements").select("*").eq("product_id", productId),
          admin
            .from("products")
            .select("stock_quantity")
            .eq("id", productId)
            .single(),
          admin
            .from("suppliers")
            .select("outstanding_balance")
            .eq("id", supplierId)
            .single(),
          admin
            .from("supplier_ledger_entries")
            .select("*")
            .eq("purchase_id", purchaseId),
          admin
            .from("supplier_payments")
            .select("*")
            .eq("purchase_id", purchaseId),
        ]);
      for (const result of [
        items,
        lots,
        movements,
        product,
        supplier,
        ledgers,
        payments,
      ]) {
        if (result.error)
          throw new Error(
            `Artifact verification failed: ${result.error.message}`,
          );
      }
      expect(items.data).toHaveLength(1);
      expect(product.data?.stock_quantity).toBe(8);
      expect(Number(supplier.data?.outstanding_balance)).toBe(300);
      expect(lots.data).toHaveLength(2);
      expect(
        lots.data?.filter((lot) => lot.lot_number === purchase.purchase_no),
      ).toHaveLength(1);
      expect(
        lots.data?.reduce(
          (sum, lot) => sum + Number(lot.quantity_remaining),
          0,
        ),
      ).toBe(8);
      expect(movements.data).toHaveLength(2);
      expect(
        movements.data?.filter(
          (movement) => movement.reference_id === purchaseId,
        ),
      ).toHaveLength(1);
      expect(ledgers.data).toHaveLength(1);
      expect(ledgers.data?.[0]?.entry_type).toBe("purchase_credit");
      expect(Number(ledgers.data?.[0]?.amount)).toBe(300);
      expect(payments.data).toHaveLength(0);
      await expect
        .poll(() => countMatchingAudit(supplierId, "supplier_purchase.created"))
        .toBe(1);

      await page.reload();
      await expect(
        page.getByRole("heading", { name: purchase.purchase_no, exact: true }),
      ).toBeVisible();
      await expect(page.getByText("unpaid", { exact: true })).toBeVisible();
      expect(await cashShiftSignature()).toBe(cashBefore);
      expect(evidence.actionPosts).toBe(1);
      expect(evidence.actionResponses).toEqual([200]);
      expect(evidence.unexpectedWrites).toEqual([]);
      expect(evidence.pageErrors).toEqual([]);
      expect(evidence.consoleErrors).toEqual([]);
      expect(evidence.requestFailures).toEqual([]);
      expect(evidence.nativeDialogs).toBe(0);
    } finally {
      const { data: purchases } = await admin
        .from("supplier_purchases")
        .select("id")
        .eq("organization_id", LOCAL_QA_ORG_ID)
        .eq("reference_no", reference);
      const purchaseIds = (purchases ?? []).map((purchase) => purchase.id);
      await admin
        .from("audit_logs")
        .delete()
        .eq("organization_id", LOCAL_QA_ORG_ID)
        .eq("module", "purchases")
        .contains("metadata", { supplier_id: supplierId });
      await admin
        .from("supplier_ledger_entries")
        .delete()
        .eq("supplier_id", supplierId);
      await admin
        .from("supplier_payments")
        .delete()
        .eq("supplier_id", supplierId);
      await admin.from("stock_movements").delete().eq("product_id", productId);
      if (purchaseIds.length) {
        await admin
          .from("supplier_purchase_items")
          .delete()
          .in("purchase_id", purchaseIds);
        await admin.from("supplier_purchases").delete().in("id", purchaseIds);
      }
      await admin
        .from("product_stock_lots")
        .delete()
        .eq("product_id", productId);
      await admin.from("products").delete().eq("id", productId);
      await admin.from("suppliers").delete().eq("id", supplierId);

      const remaining = await Promise.all([
        admin
          .from("supplier_purchases")
          .select("id", { count: "exact", head: true })
          .eq("reference_no", reference),
        admin
          .from("supplier_payments")
          .select("id", { count: "exact", head: true })
          .eq("supplier_id", supplierId),
        admin
          .from("supplier_ledger_entries")
          .select("id", { count: "exact", head: true })
          .eq("supplier_id", supplierId),
        admin
          .from("product_stock_lots")
          .select("id", { count: "exact", head: true })
          .eq("product_id", productId),
        admin
          .from("stock_movements")
          .select("id", { count: "exact", head: true })
          .eq("product_id", productId),
        admin
          .from("products")
          .select("id", { count: "exact", head: true })
          .eq("id", productId),
        admin
          .from("suppliers")
          .select("id", { count: "exact", head: true })
          .eq("id", supplierId),
        admin
          .from("audit_logs")
          .select("id", { count: "exact", head: true })
          .contains("metadata", { supplier_id: supplierId }),
      ]);
      for (const result of remaining) {
        if (result.error)
          throw new Error(
            `Cleanup verification failed: ${result.error.message}`,
          );
        expect(result.count).toBe(0);
      }
    }
  });
});

const SAFETY_TABLES = [
  "suppliers",
  "supplier_purchases",
  "supplier_purchase_items",
  "supplier_payments",
  "supplier_ledger_entries",
  "products",
  "product_stock_lots",
  "stock_movements",
  "invoices",
  "invoice_items",
  "invoice_item_stock_allocations",
  "payments",
  "returns",
  "return_items",
  "expenses",
  "cash_shifts",
  "audit_logs",
  "organizations",
  "branches",
  "profiles",
] as const;

async function businessSignatures() {
  const admin = getLocalAdminClient();
  const signatures: Record<string, string> = {};

  for (const table of SAFETY_TABLES) {
    const { data, error } = await admin.from(table).select("*").order("id");
    if (error)
      throw new Error(`Signature failed for ${table}: ${error.message}`);
    signatures[table] = createHash("sha256")
      .update(JSON.stringify(data ?? []))
      .digest("hex");
  }

  return signatures;
}

type SettlementCaseResult = {
  caseNumber: number;
  marker: string;
  classification:
    | "complete-success"
    | "qualifying-settlement-failure"
    | "other-failure";
  timeline: Record<string, number | null>;
  database: {
    status: string | null;
    paid: number | null;
    due: number | null;
    supplierDue: number | null;
    payments: number;
    paymentDebits: number;
    audits: number;
  };
  originalPage: {
    successObserved: boolean;
    paidObserved: boolean;
    dueZeroObserved: boolean;
    paymentObserved: boolean;
    formRemoved: boolean;
    recordingVisible: boolean;
    staleUnpaid: boolean;
    staleDue300: boolean;
    formConnectedAfter: boolean | null;
    formIdentity: string;
    events: Array<{ event: string; timestamp: number }>;
  };
  independentPage: { paid: boolean; dueZero: boolean; payment: boolean };
  reloadAfterFailure: {
    paid: boolean;
    dueZero: boolean;
    payment: boolean;
  } | null;
  browser: ReturnType<typeof browserEvidence>;
  cleanup: { remaining: number[] };
};

async function waitForDatabasePayment(
  purchaseId: string,
  supplierId: string,
  paymentReference: string,
) {
  const admin = getLocalAdminClient();
  const deadline = Date.now() + 15_000;

  while (Date.now() < deadline) {
    const [purchase, supplier, payments, ledger, audits] = await Promise.all([
      admin
        .from("supplier_purchases")
        .select("status, amount_paid, balance_due")
        .eq("id", purchaseId)
        .single(),
      admin
        .from("suppliers")
        .select("outstanding_balance")
        .eq("id", supplierId)
        .single(),
      admin
        .from("supplier_payments")
        .select("id, method, amount, reference_no")
        .eq("purchase_id", purchaseId)
        .eq("reference_no", paymentReference),
      admin
        .from("supplier_ledger_entries")
        .select("id, entry_type, direction, amount")
        .eq("purchase_id", purchaseId),
      admin
        .from("audit_logs")
        .select("id")
        .eq("organization_id", LOCAL_QA_ORG_ID)
        .eq("module", "purchases")
        .eq("action", "supplier_payment.recorded")
        .contains("metadata", { supplier_id: supplierId }),
    ]);
    for (const result of [purchase, supplier, payments, ledger, audits]) {
      if (result.error) {
        throw new Error(`Payment truth query failed: ${result.error.message}`);
      }
    }

    const truth = {
      status: purchase.data?.status ?? null,
      paid: Number(purchase.data?.amount_paid ?? Number.NaN),
      due: Number(purchase.data?.balance_due ?? Number.NaN),
      supplierDue: Number(supplier.data?.outstanding_balance ?? Number.NaN),
      payments: payments.data?.length ?? 0,
      paymentDebits:
        ledger.data?.filter(
          (entry) =>
            entry.entry_type === "payment_debit" &&
            entry.direction === "debit" &&
            Number(entry.amount) === 300,
        ).length ?? 0,
      audits: audits.data?.length ?? 0,
    };

    if (
      truth.status === "paid" &&
      truth.paid === 300 &&
      truth.due === 0 &&
      truth.supplierDue === 0 &&
      truth.payments === 1 &&
      truth.paymentDebits === 1 &&
      truth.audits === 1
    ) {
      return truth;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error("Database payment truth did not complete within 15 seconds.");
}

async function paymentPageState(page: Page) {
  const totals = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Totals", exact: true }),
  });
  const balance = totals
    .getByText("Balance due", { exact: true })
    .locator("..")
    .locator("dd");
  return {
    paid: await page.getByText("paid", { exact: true }).isVisible(),
    dueZero: /(?:PKR|Rs)\s*0(?:\D|$)/.test((await balance.textContent()) ?? ""),
    payment: await page
      .getByRole("heading", { name: "Payments (1)", exact: true })
      .isVisible(),
  };
}

async function runSettlementCase(
  browser: Browser,
  caseNumber: number,
  evidenceDirectory: string,
): Promise<SettlementCaseResult> {
  const marker = `QA-SP-PAY-${caseNumber}-${Date.now().toString(36).slice(-5)}`;
  const supplierId = crypto.randomUUID();
  const productId = crypto.randomUUID();
  const reference = `${marker}-REF`;
  const paymentReference = `${marker}-PAY`;
  const formIdentity = `${marker}-FORM`;
  const admin = getLocalAdminClient();
  const owner = await ownerClient();
  const context = await browser.newContext();
  const page = await context.newPage();
  const browserState = browserEvidence(page);
  const cashBefore = await cashShiftSignature();
  const timeline: Record<string, number | null> = {
    submit: null,
    pending: null,
    response: null,
    database: null,
    success: null,
    paidUi: null,
    classified: null,
  };
  let purchaseId: string | null = null;
  let result: SettlementCaseResult | null = null;
  let independentContext: Awaited<ReturnType<Browser["newContext"]>> | null =
    null;

  try {
    const { data: profile, error: profileError } = await owner
      .from("profiles")
      .select("branch_id")
      .eq("organization_id", LOCAL_QA_ORG_ID)
      .eq("role", "owner")
      .eq("is_active", true)
      .single();
    if (profileError || !profile?.branch_id) {
      throw new Error(
        `Owner profile unavailable: ${profileError?.message ?? "missing branch"}`,
      );
    }

    const { error: supplierError } = await owner.from("suppliers").insert({
      id: supplierId,
      organization_id: LOCAL_QA_ORG_ID,
      name: `${marker} Supplier`,
      notes: `${marker} local settlement fixture`,
      is_active: true,
    });
    if (supplierError)
      throw new Error(`Supplier fixture failed: ${supplierError.message}`);

    const { error: productError } = await owner.rpc(
      "create_product_with_opening_stock",
      {
        p_product_id: productId,
        p_name: `${marker} Product`,
        p_sku: marker.replaceAll("-", ""),
        p_barcode: null,
        p_category_id: null,
        p_supplier_id: supplierId,
        p_product_type: "product",
        p_purchase_price: 100,
        p_sale_price: 150,
        p_opening_stock: 5,
        p_minimum_stock: 2,
        p_allow_sell_at_loss: false,
        p_sell_at_loss_reason: "",
        p_image_path: null,
        p_notes: `${marker} local settlement fixture`,
        p_is_active: true,
      },
    );
    if (productError)
      throw new Error(`Product fixture failed: ${productError.message}`);

    await loginLocalOwnerDirectly(page);
    await page.goto("/suppliers/purchases/new");
    await expect(
      page.getByRole("heading", { name: "Record purchase" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Supplier", exact: true }).click();
    await page.getByRole("option", { name: new RegExp(marker) }).click();
    await page
      .getByRole("button", { name: "Add product", exact: true })
      .click();
    await page.getByRole("option", { name: new RegExp(marker) }).click();
    await page.getByRole("button", { name: "Add line" }).click();
    const itemRow = page
      .locator("tbody tr")
      .filter({ hasText: `${marker} Product` });
    await itemRow.locator('input[type="number"]').nth(0).fill("3");
    await itemRow.locator('input[type="number"]').nth(1).fill("100");
    await page.getByLabel("Supplier invoice / ref #").fill(reference);
    await page.getByLabel("Notes").fill(`${marker} unpaid purchase`);
    await page.getByLabel("Amount paid").fill("0");
    await page.getByRole("button", { name: "Record purchase" }).click();
    await expect(page).toHaveURL(/\/suppliers\/purchases\/[0-9a-f-]+$/, {
      timeout: 30_000,
    });
    purchaseId = page.url().split("/").at(-1) ?? null;
    if (!purchaseId?.match(/^[0-9a-f-]{36}$/)) {
      throw new Error("Purchase id was not available after creation.");
    }
    await page.reload();
    await expect(page.getByText("unpaid", { exact: true })).toBeVisible();

    const { data: purchaseBefore, error: purchaseBeforeError } = await admin
      .from("supplier_purchases")
      .select("status, amount_paid, balance_due")
      .eq("id", purchaseId)
      .single();
    if (purchaseBeforeError) throw new Error(purchaseBeforeError.message);
    expect({
      status: purchaseBefore.status,
      paid: Number(purchaseBefore.amount_paid),
      due: Number(purchaseBefore.balance_due),
    }).toEqual({ status: "unpaid", paid: 0, due: 300 });

    const paymentForm = page.locator("form").filter({
      has: page.getByRole("button", { name: "Record payment" }),
    });
    await paymentForm.evaluate((form, identity) => {
      form.setAttribute("data-qa-payment-form-identity", identity);
      const target = window as typeof window & {
        __supplierPaymentEvents?: Array<{ event: string; timestamp: number }>;
        __supplierPaymentObserver?: MutationObserver;
      };
      target.__supplierPaymentEvents = [];
      const observe = () => {
        const text = document.body.innerText;
        const events = target.__supplierPaymentEvents!;
        const record = (event: string, present: boolean) => {
          if (present && !events.some((entry) => entry.event === event)) {
            events.push({ event, timestamp: Date.now() });
          }
        };
        record("pending-visible", text.includes("Recording…"));
        record("success-visible", text.includes("Payment recorded."));
        record("paid-visible", /(^|\n)paid(\n|$)/.test(text));
        record("payment-count-visible", text.includes("Payments (1)"));
        record(
          "form-removed",
          !document.querySelector(
            `[data-qa-payment-form-identity="${identity}"]`,
          ),
        );
      };
      target.__supplierPaymentObserver?.disconnect();
      target.__supplierPaymentObserver = new MutationObserver(observe);
      target.__supplierPaymentObserver.observe(document.body, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
      });
      observe();
    }, formIdentity);
    await paymentForm
      .getByRole("button", { name: "Payment method", exact: true })
      .click();
    await page.getByRole("option", { name: "Card", exact: true }).click();
    await paymentForm.getByLabel("Reference (optional)").fill(paymentReference);
    await paymentForm
      .getByLabel("Note (optional)")
      .fill(`${marker} Card settlement`);

    timeline.submit = Date.now();
    await paymentForm.getByRole("button", { name: "Record payment" }).click();
    await expect(
      page.getByRole("button", { name: "Recording…" }),
    ).toBeVisible();
    timeline.pending = Date.now();

    const database = await waitForDatabasePayment(
      purchaseId,
      supplierId,
      paymentReference,
    );
    timeline.database = Date.now();

    const detailPath = `/suppliers/purchases/${purchaseId}`;
    const paymentResponse = browserState.actionTimeline.find(
      (entry) => entry.event === "response" && entry.path === detailPath,
    );
    timeline.response = paymentResponse?.timestamp ?? null;

    const elapsed = Date.now() - timeline.submit;
    const remaining = Math.max(0, 30_000 - elapsed);
    let paidObserved = false;
    try {
      await expect(page.getByText("paid", { exact: true })).toBeVisible({
        timeout: remaining,
      });
      paidObserved = true;
      timeline.paidUi = Date.now();
    } catch {
      // The classification below preserves the original page before diagnostics.
    }
    if (!paidObserved && Date.now() - timeline.submit < 30_000) {
      await page.waitForTimeout(30_000 - (Date.now() - timeline.submit));
    }

    const events = await page.evaluate(() => {
      const target = window as typeof window & {
        __supplierPaymentEvents?: Array<{ event: string; timestamp: number }>;
      };
      return target.__supplierPaymentEvents ?? [];
    });
    const successEvent = events.find(
      (entry) => entry.event === "success-visible",
    );
    timeline.success = successEvent?.timestamp ?? null;

    const originalState = await paymentPageState(page);
    const recordingVisible = await page
      .getByRole("button", { name: "Recording…" })
      .isVisible();
    const staleUnpaid = await page
      .getByText("unpaid", { exact: true })
      .isVisible();
    const totals = page.locator("section").filter({
      has: page.getByRole("heading", { name: "Totals", exact: true }),
    });
    const balanceText =
      (await totals
        .getByText("Balance due", { exact: true })
        .locator("..")
        .locator("dd")
        .textContent()) ?? "";
    const formConnectedAfter = await page.evaluate((identity) => {
      const form = document.querySelector(
        `[data-qa-payment-form-identity="${identity}"]`,
      );
      return form ? form.isConnected : null;
    }, formIdentity);

    independentContext = await browser.newContext();
    const independentPage = await independentContext.newPage();
    await loginLocalOwnerDirectly(independentPage);
    await independentPage.goto(detailPath);
    await expect(
      independentPage.getByRole("heading", { name: "Payments (1)" }),
    ).toBeVisible({ timeout: 30_000 });
    const independentState = await paymentPageState(independentPage);
    await independentContext.close();
    independentContext = null;

    const successObserved = events.some(
      (entry) => entry.event === "success-visible",
    );
    const formRemoved = events.some((entry) => entry.event === "form-removed");
    const completeSuccess =
      successObserved &&
      originalState.paid &&
      originalState.dueZero &&
      originalState.payment &&
      formRemoved &&
      !recordingVisible &&
      independentState.paid &&
      independentState.dueZero &&
      independentState.payment;
    const qualifyingFailure =
      database.status === "paid" &&
      database.due === 0 &&
      database.supplierDue === 0 &&
      successObserved &&
      recordingVisible &&
      staleUnpaid &&
      /(?:PKR|Rs)\s*300(?:\D|$)/.test(balanceText) &&
      formConnectedAfter === true &&
      independentState.paid &&
      independentState.dueZero &&
      independentState.payment &&
      browserState.actionPosts === 2 &&
      browserState.pageErrors.length === 0 &&
      browserState.consoleErrors.length === 0 &&
      browserState.requestFailures.length === 0 &&
      browserState.unexpectedWrites.length === 0;

    let reloadAfterFailure: SettlementCaseResult["reloadAfterFailure"] = null;
    if (!completeSuccess) {
      await page.screenshot({
        path: `${evidenceDirectory}/case-${caseNumber}-original.png`,
        fullPage: true,
      });
      await page.reload();
      await expect(page.getByText("paid", { exact: true })).toBeVisible({
        timeout: 30_000,
      });
      reloadAfterFailure = await paymentPageState(page);
    }
    timeline.classified = Date.now();

    result = {
      caseNumber,
      marker,
      classification: completeSuccess
        ? "complete-success"
        : qualifyingFailure
          ? "qualifying-settlement-failure"
          : "other-failure",
      timeline,
      database,
      originalPage: {
        successObserved,
        paidObserved: originalState.paid,
        dueZeroObserved: originalState.dueZero,
        paymentObserved: originalState.payment,
        formRemoved,
        recordingVisible,
        staleUnpaid,
        staleDue300: /(?:PKR|Rs)\s*300(?:\D|$)/.test(balanceText),
        formConnectedAfter,
        formIdentity,
        events,
      },
      independentPage: independentState,
      reloadAfterFailure,
      browser: browserState,
      cleanup: { remaining: [] },
    };

    expect(await cashShiftSignature()).toBe(cashBefore);
  } finally {
    await independentContext?.close();
    const { data: purchases } = await admin
      .from("supplier_purchases")
      .select("id")
      .eq("organization_id", LOCAL_QA_ORG_ID)
      .eq("reference_no", reference);
    const purchaseIds = (purchases ?? []).map((purchase) => purchase.id);
    await admin
      .from("audit_logs")
      .delete()
      .eq("organization_id", LOCAL_QA_ORG_ID)
      .eq("module", "purchases")
      .contains("metadata", { supplier_id: supplierId });
    await admin
      .from("supplier_ledger_entries")
      .delete()
      .eq("supplier_id", supplierId);
    await admin
      .from("supplier_payments")
      .delete()
      .eq("supplier_id", supplierId);
    await admin.from("stock_movements").delete().eq("product_id", productId);
    if (purchaseIds.length) {
      await admin
        .from("supplier_purchase_items")
        .delete()
        .in("purchase_id", purchaseIds);
      await admin.from("supplier_purchases").delete().in("id", purchaseIds);
    }
    await admin.from("product_stock_lots").delete().eq("product_id", productId);
    await admin.from("products").delete().eq("id", productId);
    await admin.from("suppliers").delete().eq("id", supplierId);

    const remaining = await Promise.all([
      admin
        .from("supplier_purchases")
        .select("id", { count: "exact", head: true })
        .eq("reference_no", reference),
      admin
        .from("supplier_purchase_items")
        .select("id", { count: "exact", head: true })
        .in(
          "purchase_id",
          purchaseIds.length ? purchaseIds : [crypto.randomUUID()],
        ),
      admin
        .from("supplier_payments")
        .select("id", { count: "exact", head: true })
        .eq("supplier_id", supplierId),
      admin
        .from("supplier_ledger_entries")
        .select("id", { count: "exact", head: true })
        .eq("supplier_id", supplierId),
      admin
        .from("product_stock_lots")
        .select("id", { count: "exact", head: true })
        .eq("product_id", productId),
      admin
        .from("stock_movements")
        .select("id", { count: "exact", head: true })
        .eq("product_id", productId),
      admin
        .from("products")
        .select("id", { count: "exact", head: true })
        .eq("id", productId),
      admin
        .from("suppliers")
        .select("id", { count: "exact", head: true })
        .eq("id", supplierId),
      admin
        .from("audit_logs")
        .select("id", { count: "exact", head: true })
        .contains("metadata", { supplier_id: supplierId }),
    ]);
    for (const query of remaining) {
      if (query.error)
        throw new Error(`Cleanup failed: ${query.error.message}`);
    }
    const counts = remaining.map((query) => query.count ?? 0);
    if (counts.some((count) => count !== 0)) {
      throw new Error(`Cleanup left rows: ${counts.join(",")}`);
    }
    if (result) result.cleanup.remaining = counts;
    await context.close();
  }

  if (!result) throw new Error("Settlement case produced no result.");
  return result;
}

test.describe("supplier payment settlement investigation", () => {
  test.skip(
    !isLocalPlaywrightRun() ||
      process.env.SUPPLIER_PAYMENT_SETTLEMENT_MODE === undefined,
    "This bounded diagnostic is loopback-only and explicitly enabled.",
  );

  test("captures database truth and original-page settlement", async ({
    browser,
  }) => {
    test.setTimeout(1_200_000);
    const evidenceDirectory =
      process.env.SUPPLIER_PAYMENT_EVIDENCE_DIR ??
      "/tmp/saledock-supplier-payment-settlement/current";
    const requestedCases = Number(
      process.env.SUPPLIER_PAYMENT_SETTLEMENT_CASES ?? "1",
    );
    const stopOnFailure =
      process.env.SUPPLIER_PAYMENT_STOP_ON_FAILURE === "true";
    await mkdir(evidenceDirectory, { recursive: true });

    const signaturesBefore = await businessSignatures();
    const results: SettlementCaseResult[] = [];
    for (let index = 1; index <= requestedCases; index += 1) {
      const caseResult = await runSettlementCase(
        browser,
        index,
        evidenceDirectory,
      );
      results.push(caseResult);
      await writeFile(
        `${evidenceDirectory}/results.json`,
        `${JSON.stringify({ mode: process.env.SUPPLIER_PAYMENT_SETTLEMENT_MODE, results }, null, 2)}\n`,
      );
      if (stopOnFailure && caseResult.classification !== "complete-success") {
        break;
      }
    }

    const signaturesAfter = await businessSignatures();
    expect(signaturesAfter).toEqual(signaturesBefore);
    await writeFile(
      `${evidenceDirectory}/summary.json`,
      `${JSON.stringify(
        {
          mode: process.env.SUPPLIER_PAYMENT_SETTLEMENT_MODE,
          requestedCases,
          executedCases: results.length,
          classifications: results.map((entry) => entry.classification),
          signaturesEqual: true,
        },
        null,
        2,
      )}\n`,
    );

    expect(
      results.every((entry) => entry.classification === "complete-success"),
      JSON.stringify(
        results.map((entry) => ({
          caseNumber: entry.caseNumber,
          classification: entry.classification,
        })),
      ),
    ).toBe(true);
  });
});
