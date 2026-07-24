import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import {
  getLocalAdminClient,
  isLocalPlaywrightRun,
  loginLocalOwnerDirectly,
  LOCAL_QA_ORG_ID,
} from "./helpers/local-supabase";

const baselineMode = process.env.RETURN_PROFIT_BASELINE === "1";
const artifactRoot = "/tmp/saledock-return-profit-reconciliation";
const localOwnerEmail = "return-profit-owner@saledock.local";
const localOwnerPassword = "Password123!";
const safetyTables = [
  "products",
  "product_stock_lots",
  "stock_movements",
  "invoices",
  "invoice_items",
  "invoice_item_stock_allocations",
  "payments",
  "returns",
  "return_items",
  "return_stock_allocations",
  "customers",
  "customer_ledger_entries",
  "expenses",
  "cash_shifts",
  "daily_closings",
  "audit_logs",
  "organizations",
  "branches",
  "profiles",
] as const;

type Signature = { count: number; hash: string };
type Snapshot = Record<(typeof safetyTables)[number], Signature>;
type OwnerFixture = {
  email: string;
  cleanup: () => Promise<void>;
};

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function tableRows(table: string): Promise<unknown[]> {
  const admin = getLocalAdminClient();
  const rows: unknown[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await admin
      .from(table)
      .select("*")
      .order("id", { ascending: true })
      .range(from, from + 499);
    if (error)
      throw new Error(`Safety read failed for ${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if ((data ?? []).length < 500) return rows;
  }
}

async function safetySnapshot(): Promise<Snapshot> {
  return Object.fromEntries(
    await Promise.all(
      safetyTables.map(async (table) => {
        const rows = await tableRows(table);
        return [table, { count: rows.length, hash: digest(rows) }] as const;
      }),
    ),
  ) as Snapshot;
}

async function ensureLocalOwner(): Promise<OwnerFixture> {
  const output = execFileSync("supabase", ["status", "--output", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const status = JSON.parse(output.slice(output.indexOf("{"))) as {
    API_URL?: string;
    SERVICE_ROLE_KEY?: string;
  };
  const url = status.API_URL ?? "";
  const serviceKey = status.SERVICE_ROLE_KEY ?? "";
  if (!/^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/.test(url) || !serviceKey) {
    throw new Error("Loopback Supabase service configuration is unavailable.");
  }
  const service = createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  const { data: listed, error: listError } = await service.auth.admin.listUsers(
    {
      page: 1,
      perPage: 1000,
    },
  );
  if (listError) throw new Error("Local Auth owner lookup failed.");
  let user =
    listed.users.find((candidate) => candidate.email === localOwnerEmail) ??
    null;
  let authCreated = false;
  if (!user) {
    const { data, error } = await service.auth.admin.createUser({
      email: localOwnerEmail,
      password: localOwnerPassword,
      email_confirm: true,
    });
    if (error || !data.user)
      throw new Error("Local Auth owner creation failed.");
    user = data.user;
    authCreated = true;
  }

  const admin = getLocalAdminClient();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError)
    throw new Error(
      `Local owner profile lookup failed: ${profileError.message}`,
    );
  let profileCreated = false;
  if (!profile) {
    const { data: branch, error: branchError } = await admin
      .from("branches")
      .select("id")
      .eq("organization_id", LOCAL_QA_ORG_ID)
      .limit(1)
      .single();
    if (branchError || !branch?.id)
      throw new Error("Local QA branch is unavailable.");
    const { error } = await admin.from("profiles").insert({
      id: user.id,
      organization_id: LOCAL_QA_ORG_ID,
      branch_id: branch.id,
      full_name: "Return Profit QA Owner",
      role: "owner",
      is_active: true,
    });
    if (error)
      throw new Error(`Local owner profile creation failed: ${error.message}`);
    profileCreated = true;
  }

  return {
    email: localOwnerEmail,
    cleanup: async () => {
      if (profileCreated) {
        const { error } = await admin
          .from("profiles")
          .delete()
          .eq("id", user.id);
        if (error)
          throw new Error(
            `Local owner profile cleanup failed: ${error.message}`,
          );
      }
      if (authCreated) {
        const { error } = await service.auth.admin.deleteUser(user.id);
        if (error) throw new Error("Local Auth owner cleanup failed.");
      }
    },
  };
}

function attachBrowserErrors(page: Page) {
  const evidence = {
    pageErrors: [] as string[],
    consoleErrors: [] as string[],
    requestFailures: [] as string[],
    httpErrors: [] as string[],
    nativeDialogs: 0,
  };
  page.on("pageerror", (error) => evidence.pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = `${message.text()} ${message.location().url}`;
    if (
      /clarity\.ms|_vercel\/(?:insights|speed-insights)|user_ui_preferences/i.test(
        text,
      )
    ) {
      return;
    }
    evidence.consoleErrors.push(text);
  });
  page.on("requestfailed", (request) => {
    const url = new URL(request.url());
    if (
      /^\/_vercel\/(?:insights|speed-insights)/.test(url.pathname) ||
      (request.failure()?.errorText === "net::ERR_ABORTED" &&
        ["fetch", "document"].includes(request.resourceType()))
    ) {
      return;
    }
    evidence.requestFailures.push(
      `${request.method()} ${url.pathname}: ${request.failure()?.errorText ?? "unknown"}`,
    );
  });
  page.on("response", (response) => {
    if (response.status() < 400) return;
    const url = new URL(response.url());
    if (
      /^\/_vercel\/(?:insights|speed-insights)/.test(url.pathname) ||
      /\/rest\/v1\/user_ui_preferences$/.test(url.pathname)
    ) {
      return;
    }
    evidence.httpErrors.push(`${response.status()} ${url.pathname}`);
  });
  page.on("dialog", async (dialog) => {
    evidence.nativeDialogs += 1;
    await dialog.dismiss();
  });
  return evidence;
}

function parseCurrency(text: string): number {
  const normalized = text.replace(/,/g, "");
  const match = normalized.match(/PKR\s*(-?\d+(?:\.\d+)?)/i);
  if (!match)
    throw new Error(`Currency value unavailable in: ${text.slice(0, 200)}`);
  return Number(match[1]);
}

async function dashboardProfit(page: Page): Promise<number> {
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible({
    timeout: 30_000,
  });
  const title = page.getByText("Today's Net Profit", { exact: true }).first();
  await expect(title).toBeVisible();
  const text = await title.evaluate((element) => {
    let current: HTMLElement | null = element as HTMLElement;
    while (current) {
      const value = current.innerText;
      if (/PKR\s*-?[\d,.]+/i.test(value)) return value;
      current = current.parentElement;
    }
    return "";
  });
  return parseCurrency(text);
}

async function reportsProfit(page: Page): Promise<number> {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  await page.goto(
    `/reports?range=custom&startDate=${today}&endDate=${today}`,
  );
  await expect(
    page.getByRole("heading", { name: "Reports", exact: true }),
  ).toBeVisible({
    timeout: 30_000,
  });
  const label = page.getByText("Estimated Net Profit", { exact: true }).first();
  await expect(label).toBeVisible();
  const text = await label.evaluate((element) => {
    const card = element.closest("div.col-span-2");
    return (card as HTMLElement | null)?.innerText ?? "";
  });
  return parseCurrency(text);
}

async function cleanupFixture(input: {
  marker: string;
  productId: string | null;
  invoiceId: string | null;
  returnId: string | null;
}) {
  const admin = getLocalAdminClient();
  const { marker, productId, invoiceId, returnId } = input;
  const auditFilters: Array<Record<string, string>> = [];
  if (productId) auditFilters.push({ product_id: productId });
  if (invoiceId) auditFilters.push({ invoice_id: invoiceId });
  if (returnId) auditFilters.push({ return_id: returnId });
  for (const metadata of auditFilters) {
    const { error } = await admin
      .from("audit_logs")
      .delete()
      .eq("organization_id", LOCAL_QA_ORG_ID)
      .contains("metadata", metadata);
    if (error)
      throw new Error(`Audit metadata cleanup failed: ${error.message}`);
  }
  const { error: detailAuditError } = await admin
    .from("audit_logs")
    .delete()
    .eq("organization_id", LOCAL_QA_ORG_ID)
    .like("details", `%${marker}%`);
  if (detailAuditError) {
    throw new Error(`Marker audit cleanup failed: ${detailAuditError.message}`);
  }
  if (returnId) {
    const { error } = await admin
      .from("returns")
      .delete()
      .eq("organization_id", LOCAL_QA_ORG_ID)
      .eq("id", returnId);
    if (error) throw new Error(`Return cleanup failed: ${error.message}`);
  }
  if (invoiceId) {
    const { error } = await admin
      .from("invoices")
      .delete()
      .eq("organization_id", LOCAL_QA_ORG_ID)
      .eq("id", invoiceId);
    if (error) throw new Error(`Invoice cleanup failed: ${error.message}`);
  }
  if (productId) {
    const { error: movementError } = await admin
      .from("stock_movements")
      .delete()
      .eq("organization_id", LOCAL_QA_ORG_ID)
      .eq("product_id", productId);
    if (movementError) {
      throw new Error(`Movement cleanup failed: ${movementError.message}`);
    }
    const { error: lotError } = await admin
      .from("product_stock_lots")
      .delete()
      .eq("organization_id", LOCAL_QA_ORG_ID)
      .eq("product_id", productId);
    if (lotError) throw new Error(`Lot cleanup failed: ${lotError.message}`);
    const { error: productError } = await admin
      .from("products")
      .delete()
      .eq("organization_id", LOCAL_QA_ORG_ID)
      .eq("id", productId);
    if (productError)
      throw new Error(`Product cleanup failed: ${productError.message}`);
  }
}

test.describe("return profit reconciliation", () => {
  test.skip(
    !isLocalPlaywrightRun(),
    "This financial workflow is loopback-only.",
  );

  test("full Card sale and restocked return reconcile Dashboard and Reports", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    mkdirSync(artifactRoot, { recursive: true });
    const marker = `QA-RP-${Date.now().toString(36).slice(-8)}`;
    const productName = `${marker} Product`;
    const admin = getLocalAdminClient();
    const originalBefore = await safetySnapshot();
    const owner = await ensureLocalOwner();
    const before = await safetySnapshot();
    const browserErrors = attachBrowserErrors(page);
    let productId: string | null = null;
    let invoiceId: string | null = null;
    let returnId: string | null = null;
    const result: Record<string, unknown> = { marker, baselineMode };

    try {
      await loginLocalOwnerDirectly(page, owner.email, localOwnerPassword);
      const startingDashboardProfit = await dashboardProfit(page);
      const startingReportsProfit = await reportsProfit(page);
      result.startingDashboardProfit = startingDashboardProfit;
      result.startingReportsProfit = startingReportsProfit;

      await page.goto("/products?tab=products");
      await page.getByRole("button", { name: "Add product" }).click();
      const productForm = page
        .locator("form")
        .filter({ has: page.getByRole("button", { name: "Add product" }) })
        .last();
      await productForm.locator('input[name="name"]').fill(productName);
      await productForm
        .locator('input[name="sku"]')
        .fill(marker.replaceAll("-", ""));
      await productForm.locator('input[name="purchase_price"]').fill("100");
      await productForm.locator('input[name="sale_price"]').fill("150");
      await productForm.locator('input[name="stock_quantity"]').fill("4");
      await productForm.locator('input[name="minimum_stock"]').fill("1");
      await productForm
        .locator('textarea[name="notes"]')
        .fill(`${marker} return profit fixture`);
      await productForm.getByRole("button", { name: "Add product" }).click();
      await expect(
        page.getByText(productName, { exact: true }).first(),
      ).toBeVisible({
        timeout: 30_000,
      });

      const { data: product, error: productError } = await admin
        .from("products")
        .select("id, stock_quantity")
        .eq("organization_id", LOCAL_QA_ORG_ID)
        .eq("name", productName)
        .single();
      if (productError || !product) {
        throw new Error(
          `Product lookup failed: ${productError?.message ?? "missing"}`,
        );
      }
      productId = product.id;
      expect(Number(product.stock_quantity)).toBe(4);
      const { data: openingLots } = await admin
        .from("product_stock_lots")
        .select("id, quantity_received, quantity_remaining, unit_cost")
        .eq("organization_id", LOCAL_QA_ORG_ID)
        .eq("product_id", productId);
      expect(openingLots).toHaveLength(1);
      expect(openingLots?.[0]).toMatchObject({
        quantity_received: 4,
        quantity_remaining: 4,
      });
      expect(Number(openingLots?.[0]?.unit_cost)).toBe(100);

      await page.goto("/pos");
      const productButton = page.locator(
        `[data-testid="pos-product-btn"][data-product-id="${productId}"]`,
      );
      await expect(productButton).toContainText("4 in stock");
      await productButton.click();
      await page.getByRole("button", { name: "Payment method" }).click();
      await page.getByRole("option", { name: "Card", exact: true }).click();
      await page.getByTestId("pos-exact-tender-btn").click();
      await page.getByTestId("pos-checkout-btn").click();
      await expect(page.getByText(/Sale recorded as/i)).toBeVisible({
        timeout: 30_000,
      });
      const invoiceLink = page.getByRole("link", { name: "Open invoice" });
      const invoiceHref = await invoiceLink.getAttribute("href");
      invoiceId = invoiceHref?.split("/").at(-1) ?? null;
      expect(invoiceId).toBeTruthy();

      const { data: invoiceItems } = await admin
        .from("invoice_items")
        .select("id, quantity, purchase_price, line_total")
        .eq("organization_id", LOCAL_QA_ORG_ID)
        .eq("invoice_id", invoiceId);
      const { data: saleAllocations } = await admin
        .from("invoice_item_stock_allocations")
        .select("id, quantity, unit_cost")
        .eq("organization_id", LOCAL_QA_ORG_ID)
        .eq("invoice_id", invoiceId);
      const { data: payments } = await admin
        .from("payments")
        .select("id, amount, method")
        .eq("organization_id", LOCAL_QA_ORG_ID)
        .eq("invoice_id", invoiceId);
      const { data: afterSaleProduct } = await admin
        .from("products")
        .select("stock_quantity")
        .eq("id", productId)
        .single();
      const { data: afterSaleLots } = await admin
        .from("product_stock_lots")
        .select("quantity_remaining")
        .eq("product_id", productId);
      expect(invoiceItems).toHaveLength(1);
      expect(invoiceItems?.[0]?.quantity).toBe(1);
      expect(Number(invoiceItems?.[0]?.purchase_price)).toBe(100);
      expect(Number(invoiceItems?.[0]?.line_total)).toBe(150);
      expect(saleAllocations).toHaveLength(1);
      expect(saleAllocations?.[0]?.quantity).toBe(1);
      expect(Number(saleAllocations?.[0]?.unit_cost)).toBe(100);
      expect(payments).toHaveLength(1);
      expect(Number(payments?.[0]?.amount)).toBe(150);
      expect(payments?.[0]?.method).toBe("card");
      expect(Number(afterSaleProduct?.stock_quantity)).toBe(3);
      expect(afterSaleLots).toEqual([{ quantity_remaining: 3 }]);

      const saleDashboardProfit = await dashboardProfit(page);
      const saleReportsProfit = await reportsProfit(page);
      result.saleDashboardDelta = saleDashboardProfit - startingDashboardProfit;
      result.saleReportsDelta = saleReportsProfit - startingReportsProfit;
      expect(saleDashboardProfit - startingDashboardProfit).toBe(50);
      expect(saleReportsProfit - startingReportsProfit).toBe(50);

      await page.goto(`/invoices/${invoiceId}`);
      const returnForm = page
        .locator("form")
        .filter({ has: page.getByRole("button", { name: "Process return" }) });
      await returnForm.locator('input[name="quantity"]').first().fill("1");
      await returnForm.locator('input[name="refund_amount"]').fill("150");
      await returnForm.getByRole("button", { name: "Refund method" }).click();
      await page.getByRole("option", { name: "Card", exact: true }).click();
      await returnForm
        .locator('textarea[name="notes"]')
        .fill(`${marker} full restocked return`);
      await returnForm.getByRole("button", { name: "Process return" }).click();
      await expect(
        page.getByRole("heading", { name: "Return Processed" }),
      ).toBeVisible({
        timeout: 30_000,
      });
      const returnHref = await page
        .getByRole("link", { name: "View return" })
        .getAttribute("href");
      returnId = returnHref?.split("/").at(-1) ?? null;
      expect(returnId).toBeTruthy();

      const { data: completedReturn } = await admin
        .from("returns")
        .select("id, status, refund_amount, refund_method")
        .eq("organization_id", LOCAL_QA_ORG_ID)
        .eq("id", returnId)
        .single();
      const { data: returnItems } = await admin
        .from("return_items")
        .select("id, item_type, quantity, line_total, restock")
        .eq("organization_id", LOCAL_QA_ORG_ID)
        .eq("return_id", returnId);
      const { data: returnAllocations } = await admin
        .from("return_stock_allocations")
        .select("id, quantity, unit_cost")
        .eq("organization_id", LOCAL_QA_ORG_ID)
        .eq("return_id", returnId);
      const { data: restoredProduct } = await admin
        .from("products")
        .select("stock_quantity")
        .eq("id", productId)
        .single();
      const { data: restoredLots } = await admin
        .from("product_stock_lots")
        .select("quantity_remaining")
        .eq("product_id", productId);
      expect(completedReturn).toMatchObject({
        status: "completed",
        refund_method: "card",
      });
      expect(Number(completedReturn?.refund_amount)).toBe(150);
      expect(returnItems).toHaveLength(1);
      expect(returnItems?.[0]).toMatchObject({
        item_type: "product",
        quantity: 1,
        restock: true,
      });
      expect(returnAllocations).toHaveLength(1);
      expect(returnAllocations?.[0]?.quantity).toBe(1);
      expect(Number(returnAllocations?.[0]?.unit_cost)).toBe(100);
      expect(Number(restoredProduct?.stock_quantity)).toBe(4);
      expect(restoredLots).toEqual([{ quantity_remaining: 4 }]);

      const returnDashboardProfit = await dashboardProfit(page);
      const returnReportsProfit = await reportsProfit(page);
      result.returnDashboardDelta =
        returnDashboardProfit - startingDashboardProfit;
      result.returnReportsDelta = returnReportsProfit - startingReportsProfit;
      result.returnAllocation = returnAllocations?.[0];
      if (baselineMode) {
        expect(returnDashboardProfit - startingDashboardProfit).toBe(-100);
        expect(returnReportsProfit - startingReportsProfit).toBe(-100);
      } else {
        expect(returnDashboardProfit - startingDashboardProfit).toBe(0);
        expect(returnReportsProfit - startingReportsProfit).toBe(0);
      }

      expect(browserErrors.pageErrors).toEqual([]);
      expect(browserErrors.consoleErrors).toEqual([]);
      expect(browserErrors.requestFailures).toEqual([]);
      expect(browserErrors.httpErrors).toEqual([]);
      expect(browserErrors.nativeDialogs).toBe(0);
    } finally {
      result.browserErrors = browserErrors;
      writeFileSync(
        `${artifactRoot}/${baselineMode ? "baseline" : "fixed"}.json`,
        JSON.stringify(result, null, 2),
      );
      await cleanupFixture({ marker, productId, invoiceId, returnId });
      await expect
        .poll(
          async () => {
            const after = await safetySnapshot();
            return after;
          },
          { timeout: 30_000 },
        )
        .toEqual(before);
      await owner.cleanup();
      await expect
        .poll(async () => await safetySnapshot(), { timeout: 30_000 })
        .toEqual(originalBefore);
    }
  });
});
