import { createHash, randomBytes, randomUUID } from "node:crypto";
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

const baselineMode = process.env.DASHBOARD_NET_CASH_BASELINE === "1";
const artifactRoot = "/tmp/saledock-dashboard-net-cash-reconciliation";
const ownerPassword = "Password123!";
let activeOrganizationId = LOCAL_QA_ORG_ID;
const safetyTables = [
  "invoices",
  "invoice_items",
  "payments",
  "returns",
  "return_items",
  "expenses",
  "credit_payments",
  "customer_ledger_entries",
  "customers",
  "products",
  "product_stock_lots",
  "stock_movements",
  "cash_shifts",
  "daily_closings",
  "supplier_payments",
  "audit_logs",
  "organizations",
  "branches",
  "profiles",
  "user_ui_preferences",
] as const;

type Signature = { count: number; hash: string };
type Snapshot = Record<(typeof safetyTables)[number], Signature>;
type OwnerFixture = {
  id: string;
  email: string;
  organizationId: string;
  branchId: string;
  cleanup: () => Promise<void>;
};

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function tableRows(table: string): Promise<unknown[]> {
  const admin = getLocalAdminClient();
  const rows: unknown[] = [];
  const orderColumn = table === "user_ui_preferences" ? "user_id" : "id";
  for (let from = 0; ; from += 500) {
    const { data, error } = await admin
      .from(table)
      .select("*")
      .order(orderColumn, { ascending: true })
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

async function ensureLocalOwner(marker: string): Promise<OwnerFixture> {
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
  const email = `net-cash-${marker.toLowerCase()}@saledock.local`;
  const { data, error } = await service.auth.admin.createUser({
    email,
    password: ownerPassword,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error("Local Auth owner creation failed.");

  const admin = getLocalAdminClient();
  const organizationId = randomUUID();
  const branchId = randomUUID();
  const { error: organizationError } = await admin
    .from("organizations")
    .insert({
      id: organizationId,
      name: `Net Cash QA ${marker}`,
      currency_code: "PKR",
      timezone: "Asia/Karachi",
      onboarding_completed: true,
    });
  if (organizationError) {
    await service.auth.admin.deleteUser(data.user.id);
    throw new Error(
      `Local QA organization creation failed: ${organizationError.message}`,
    );
  }
  const { error: branchError } = await admin.from("branches").insert({
    id: branchId,
    organization_id: organizationId,
    name: "Net Cash QA Branch",
    is_active: true,
  });
  if (branchError) {
    await admin.from("organizations").delete().eq("id", organizationId);
    await service.auth.admin.deleteUser(data.user.id);
    throw new Error(`Local QA branch creation failed: ${branchError.message}`);
  }

  const { error: profileError } = await admin.from("profiles").insert({
    id: data.user.id,
    organization_id: organizationId,
    branch_id: branchId,
    full_name: "Net Cash QA Owner",
    role: "owner",
    is_active: true,
    onboarding_completed: true,
  });
  if (profileError) {
    await admin.from("organizations").delete().eq("id", organizationId);
    await service.auth.admin.deleteUser(data.user.id);
    throw new Error(
      `Local owner profile creation failed: ${profileError.message}`,
    );
  }
  const { error: preferencesError } = await admin
    .from("user_ui_preferences")
    .insert({
      user_id: data.user.id,
      organization_id: organizationId,
      dashboard_layout: null,
      sidebar_preferences: null,
    });
  if (preferencesError) {
    await admin.from("profiles").delete().eq("id", data.user.id);
    await admin.from("organizations").delete().eq("id", organizationId);
    await service.auth.admin.deleteUser(data.user.id);
    throw new Error(
      `Local owner preferences creation failed: ${preferencesError.message}`,
    );
  }
  activeOrganizationId = organizationId;

  return {
    id: data.user.id,
    email,
    organizationId,
    branchId,
    cleanup: async () => {
      const cleanupErrors: string[] = [];
      const { error: preferencesCleanupError } = await admin
        .from("user_ui_preferences")
        .delete()
        .eq("user_id", data.user.id);
      if (preferencesCleanupError) {
        cleanupErrors.push(
          `UI preferences: ${preferencesCleanupError.message}`,
        );
      }
      const { error: profileCleanupError } = await admin
        .from("profiles")
        .delete()
        .eq("id", data.user.id);
      if (profileCleanupError) {
        cleanupErrors.push(
          `Owner profile: ${profileCleanupError.message}`,
        );
      }
      const { error: authCleanupError } = await service.auth.admin.deleteUser(
        data.user.id,
      );
      if (authCleanupError) cleanupErrors.push("Local Auth owner");
      const { error: organizationCleanupError } = await admin
        .from("organizations")
        .delete()
        .eq("id", organizationId);
      if (organizationCleanupError) {
        cleanupErrors.push(
          `QA organization: ${organizationCleanupError.message}`,
        );
      }
      activeOrganizationId = LOCAL_QA_ORG_ID;
      if (cleanupErrors.length > 0) {
        throw new Error(
          `Local owner cleanup failed: ${cleanupErrors.join("; ")}`,
        );
      }
    },
  };
}

function attachBrowserEvidence(page: Page) {
  const evidence = {
    pageErrors: [] as string[],
    knownDailyClosingHydrationErrors: [] as string[],
    consoleErrors: [] as string[],
    expectedLocalAuthNavigationAborts: 0,
    expectedNextNavigationAborts: 0,
    expectedPreferenceNavigationAborts: 0,
    requestFailures: [] as string[],
    httpErrors: [] as string[],
    nativeDialogs: 0,
    actionPosts: [] as string[],
  };
  page.on("pageerror", (error) => {
    const entry = `${page.url()}: ${error.message}`;
    if (
      new URL(page.url()).pathname === "/daily-closing" &&
      error.message.includes("Minified React error #418") &&
      error.message.includes("args[]=text")
    ) {
      evidence.knownDailyClosingHydrationErrors.push(entry);
      return;
    }
    evidence.pageErrors.push(entry);
  });
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = `${message.text()} ${message.location().url}`;
    if (/clarity\.ms|_vercel\/(?:insights|speed-insights)/i.test(text))
      return;
    if (
      /^TypeError: Failed to fetch[\s\S]*\._(?:getUser|useSession)/.test(
        text,
      ) &&
      /^http:\/\/(?:127\.0\.0\.1|localhost):\d+/.test(message.location().url)
    ) {
      evidence.expectedLocalAuthNavigationAborts += 1;
      return;
    }
    evidence.consoleErrors.push(text);
  });
  page.on("requestfailed", (request) => {
    const url = new URL(request.url());
    if (/^\/_vercel\/(?:insights|speed-insights)/.test(url.pathname)) {
      return;
    }
    const headers = request.headers();
    const isExpectedNextNavigationAbort =
      request.failure()?.errorText === "net::ERR_ABORTED" &&
      /^127\.0\.0\.1$|^localhost$/.test(url.hostname) &&
      (headers.rsc === "1" ||
        headers["next-router-prefetch"] === "1" ||
        headers.purpose === "prefetch" ||
        "next-router-state-tree" in headers ||
        "next-action" in headers);
    if (isExpectedNextNavigationAbort) {
      evidence.expectedNextNavigationAborts += 1;
      return;
    }
    if (
      request.method() === "GET" &&
      request.failure()?.errorText === "net::ERR_ABORTED" &&
      /^127\.0\.0\.1$|^localhost$/.test(url.hostname) &&
      url.pathname === "/rest/v1/user_ui_preferences"
    ) {
      evidence.expectedPreferenceNavigationAborts += 1;
      return;
    }
    if (
      request.failure()?.errorText === "net::ERR_ABORTED" &&
      request.resourceType() === "fetch" &&
      url.pathname === "/auth/v1/user" &&
      /^127\.0\.0\.1$|^localhost$/.test(url.hostname)
    ) {
      evidence.expectedLocalAuthNavigationAborts += 1;
      return;
    }
    evidence.requestFailures.push(
      `${request.method()} ${url.pathname}: ${request.failure()?.errorText ?? "unknown"}`,
    );
  });
  page.on("response", (response) => {
    if (response.request().method() === "POST") {
      evidence.actionPosts.push(
        `${response.status()} ${new URL(response.url()).pathname}`,
      );
    }
    if (response.status() < 400) return;
    const url = new URL(response.url());
    if (
      /^\/_vercel\/(?:insights|speed-insights)/.test(url.pathname)
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

async function dashboardNetCash(page: Page): Promise<number> {
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: /Welcome,/ })).toBeVisible({
    timeout: 30_000,
  });
  const card = page.locator('[data-widget-id="widget-today-net"]');
  await expect(card).toBeVisible();
  await expect(card.locator(".widget-card-title")).toHaveText(
    /^Today's Net Cash(?: Flow)?$/,
  );
  return parseCurrency(await card.innerText());
}

async function setTodayNetWidgetSize(page: Page, size: "S" | "M" | "L" | "XL") {
  await page.getByRole("button", { name: "Edit layout", exact: true }).click();
  const card = page.locator('[data-widget-id="widget-today-net"]');
  await card.scrollIntoViewIfNeeded();
  await card
    .getByRole("button", {
      name: "Open Today's Net Cash widget settings",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: `Set widget size to ${size}`, exact: true })
    .click();

  const mobileSettings = page.locator(
    '[role="dialog"][data-widget-settings-root="widget-today-net"]',
  );
  if (await mobileSettings.isVisible().catch(() => false)) {
    await mobileSettings
      .getByRole("button", { name: "Done", exact: true })
      .click();
  } else {
    await page.keyboard.press("Escape");
  }
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Edit layout", exact: true }),
  ).toBeVisible();
}

async function assertTodayNetPresentation(
  page: Page,
  input: {
    size: "S" | "M" | "L" | "XL";
    width: number;
    height: number;
    colorScheme: "light" | "dark";
  },
) {
  await page.setViewportSize({ width: input.width, height: input.height });
  await page.emulateMedia({ colorScheme: input.colorScheme });
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: /Welcome,/ })).toBeVisible({
    timeout: 30_000,
  });
  await setTodayNetWidgetSize(page, input.size);

  const card = page.locator('[data-widget-id="widget-today-net"]');
  await card.scrollIntoViewIfNeeded();
  await expect(card.locator(".widget-card-title")).toHaveText(
    "Today's Net Cash",
  );
  await expect(card.getByText(/PKR\s*-?[\d,.]+/).first()).toBeVisible();

  if (input.size === "S") {
    await expect(
      card.getByText("Cash flow today", { exact: true }),
    ).toBeVisible();
  } else if (input.size === "M") {
    await expect(
      card.getByText("Cash received less cash refunds and cash expenses.", {
        exact: true,
      }),
    ).toBeVisible();
  } else {
    for (const label of [
      "Cash payments:",
      "Cash settlements:",
      "Cash refunds:",
      "Cash expenses:",
    ]) {
      await expect(card.getByText(label, { exact: true })).toBeVisible();
    }
    if (input.size === "XL") {
      await expect(
        card.getByText(/Net cash flow: .* for this branch today\./),
      ).toBeVisible();
    }
  }

  const layout = await card.evaluate((element) => {
    const title = element.querySelector<HTMLElement>(".widget-card-title");
    const value = Array.from(element.querySelectorAll<HTMLElement>("p")).find(
      (node) => /PKR\s*-?[\d,.]+/.test(node.innerText),
    );
    const sizeLabel = Array.from(
      element.querySelectorAll<HTMLElement>("p"),
    ).find(
      (node) =>
        node.innerText === "Cash flow today" ||
        node.innerText === "Cash received less cash refunds and cash expenses.",
    );
    const rect = element.getBoundingClientRect();
    return {
      bodyOverflow:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
      cardLeft: rect.left,
      cardRight: rect.right,
      viewportWidth: window.innerWidth,
      cardOverflow: element.scrollWidth - element.clientWidth,
      titleOverflow: title ? title.scrollWidth - title.clientWidth : null,
      valueOverflow: value ? value.scrollWidth - value.clientWidth : null,
      sizeLabelOverflow: sizeLabel
        ? sizeLabel.scrollWidth - sizeLabel.clientWidth
        : null,
      titleColor: title ? getComputedStyle(title).color : null,
      valueColor: value ? getComputedStyle(value).color : null,
    };
  });

  expect(
    layout.bodyOverflow,
    `${input.width}px page overflow`,
  ).toBeLessThanOrEqual(1);
  expect(
    layout.cardLeft,
    `${input.width}px card left edge`,
  ).toBeGreaterThanOrEqual(-1);
  expect(
    layout.cardRight,
    `${input.width}px card right edge`,
  ).toBeLessThanOrEqual(layout.viewportWidth + 1);
  expect(
    layout.cardOverflow,
    `${input.size} card overflow`,
  ).toBeLessThanOrEqual(1);
  expect(
    layout.titleOverflow,
    `${input.size} title clipping`,
  ).toBeLessThanOrEqual(1);
  expect(
    layout.valueOverflow,
    `${input.size} value clipping`,
  ).toBeLessThanOrEqual(1);
  if (input.size === "S" || input.size === "M") {
    expect(
      layout.sizeLabelOverflow,
      `${input.size} supporting label clipping`,
    ).toBeLessThanOrEqual(1);
  }
  expect(layout.titleColor).not.toBe("rgba(0, 0, 0, 0)");
  expect(layout.valueColor).not.toBe("rgba(0, 0, 0, 0)");

  await card.screenshot({
    path: `${artifactRoot}/widget-${input.size.toLowerCase()}-${input.width}-${input.colorScheme}.png`,
  });
}

async function shiftFigures(
  page: Page,
): Promise<{ net: number; drawer: number }> {
  await page.goto("/daily-closing");
  await expect(page.getByRole("heading", { name: "Active Shift" })).toBeVisible(
    {
      timeout: 30_000,
    },
  );
  const form = page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "Close shift" }) });
  const text = await form.innerText();
  const netMatch = text.match(/Net cash flow\s+PKR\s*(-?[\d,.]+)/i);
  const drawerMatch = text.match(
    /Expected cash \(drawer\)\s+PKR\s*(-?[\d,.]+)/i,
  );
  if (!netMatch || !drawerMatch)
    throw new Error("Shift cash figures are unavailable.");
  return {
    net: Number(netMatch[1].replace(/,/g, "")),
    drawer: Number(drawerMatch[1].replace(/,/g, "")),
  };
}

async function addProduct(page: Page, marker: string): Promise<string> {
  const productName = `${marker} Product`;
  await page.goto("/products?tab=products");
  await page.getByRole("button", { name: "Add product" }).click();
  const form = page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "Add product" }) })
    .last();
  await form.locator('input[name="name"]').fill(productName);
  await form.locator('input[name="sku"]').fill(marker.replaceAll("-", ""));
  await form.locator('input[name="purchase_price"]').fill("100");
  await form.locator('input[name="sale_price"]').fill("150");
  await form.locator('input[name="stock_quantity"]').fill("4");
  await form.locator('input[name="minimum_stock"]').fill("1");
  await form
    .locator('textarea[name="notes"]')
    .fill(`${marker} net cash fixture`);
  await form.getByRole("button", { name: "Add product" }).click();
  await expect(
    page.getByText(productName, { exact: true }).first(),
  ).toBeVisible({
    timeout: 30_000,
  });

  const admin = getLocalAdminClient();
  const { data, error } = await admin
    .from("products")
    .select("id, stock_quantity")
    .eq("organization_id", activeOrganizationId)
    .eq("name", productName)
    .single();
  if (error || !data)
    throw new Error(`Product lookup failed: ${error?.message ?? "missing"}`);
  expect(Number(data.stock_quantity)).toBe(4);
  const { data: lots } = await admin
    .from("product_stock_lots")
    .select("quantity_received, quantity_remaining, unit_cost")
    .eq("organization_id", activeOrganizationId)
    .eq("product_id", data.id);
  expect(lots).toEqual([
    { quantity_received: 4, quantity_remaining: 4, unit_cost: 100 },
  ]);
  return data.id;
}

async function checkout(
  page: Page,
  input: {
    productId: string;
    method: "cash" | "card";
    marker: string;
    createCustomer?: boolean;
  },
): Promise<{ invoiceId: string; customerId: string | null }> {
  await page.goto("/pos");
  const productButton = page.locator(
    `[data-testid="pos-product-btn"][data-product-id="${input.productId}"]`,
  );
  await expect(productButton).toBeVisible({ timeout: 30_000 });
  await productButton.click();

  let customerId: string | null = null;
  if (input.createCustomer) {
    const customerName = `${input.marker} Customer`;
    await page.getByRole("button", { name: "New", exact: true }).click();
    await page.getByPlaceholder("Name", { exact: true }).fill(customerName);
    await page
      .getByPlaceholder("Phone", { exact: true })
      .fill(`0300${Date.now().toString().slice(-7)}`);
    await page.getByRole("button", { name: "Save customer" }).click();
    const admin = getLocalAdminClient();
    await expect
      .poll(async () => {
        const { data } = await admin
          .from("customers")
          .select("id")
          .eq("organization_id", activeOrganizationId)
          .eq("name", customerName)
          .maybeSingle();
        customerId = data?.id ?? null;
        return customerId;
      })
      .not.toBeNull();
  }

  await page.getByRole("button", { name: "Payment method" }).click();
  await page
    .getByRole("option", {
      name: input.method === "card" ? "Card" : "Cash",
      exact: true,
    })
    .click();
  await page.getByTestId("pos-exact-tender-btn").click();
  await page.getByTestId("pos-checkout-btn").click();
  await expect(page.getByText(/Sale recorded as/i)).toBeVisible({
    timeout: 30_000,
  });
  const invoiceHref = await page
    .getByRole("link", { name: "Open invoice" })
    .getAttribute("href");
  const invoiceId = invoiceHref?.split("/").at(-1) ?? "";
  expect(invoiceId).toBeTruthy();
  return { invoiceId, customerId };
}

async function processReturn(
  page: Page,
  invoiceId: string,
  method: "cash" | "card",
  marker: string,
): Promise<string> {
  await page.goto(`/invoices/${invoiceId}`);
  const form = page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "Process return" }) });
  await form.locator('input[name="quantity"]').first().fill("1");
  await form.locator('input[name="refund_amount"]').fill("150");
  await form.getByRole("button", { name: "Refund method" }).click();
  await page
    .getByRole("option", {
      name: method === "card" ? "Card" : "Cash",
      exact: true,
    })
    .click();
  await form
    .locator('textarea[name="notes"]')
    .fill(`${marker} ${method} refund`);
  await form.getByRole("button", { name: "Process return" }).click();
  await expect(
    page.getByRole("heading", { name: "Return Processed" }),
  ).toBeVisible({
    timeout: 30_000,
  });
  const href = await page
    .getByRole("link", { name: "View return" })
    .getAttribute("href");
  const returnId = href?.split("/").at(-1) ?? "";
  expect(returnId).toBeTruthy();
  return returnId;
}

async function assertTransaction(
  invoiceId: string,
  returnId: string | null,
  method: "cash" | "card",
) {
  const admin = getLocalAdminClient();
  const { data: payments } = await admin
    .from("payments")
    .select("id, amount, method")
    .eq("organization_id", activeOrganizationId)
    .eq("invoice_id", invoiceId);
  expect(payments).toHaveLength(1);
  expect(Number(payments?.[0]?.amount)).toBe(150);
  expect(payments?.[0]?.method).toBe(method);
  if (!returnId) return;
  const { data: returns } = await admin
    .from("returns")
    .select("id, refund_amount, refund_method, status")
    .eq("organization_id", activeOrganizationId)
    .eq("id", returnId);
  expect(returns).toHaveLength(1);
  expect(returns?.[0]).toMatchObject({
    refund_method: method,
    status: "completed",
  });
  expect(Number(returns?.[0]?.refund_amount)).toBe(150);
}

async function cleanupFixture(input: {
  ownerId: string;
  productId: string | null;
  customerId: string | null;
  invoiceIds: string[];
  returnIds: string[];
  shiftId: string | null;
}) {
  const admin = getLocalAdminClient();
  if (input.shiftId) {
    const { error } = await admin
      .from("cash_shifts")
      .delete()
      .eq("organization_id", activeOrganizationId)
      .eq("id", input.shiftId);
    if (error) throw new Error(`Shift cleanup failed: ${error.message}`);
  }
  for (const returnId of input.returnIds) {
    const { error } = await admin
      .from("returns")
      .delete()
      .eq("organization_id", activeOrganizationId)
      .eq("id", returnId);
    if (error) throw new Error(`Return cleanup failed: ${error.message}`);
  }
  if (input.invoiceIds.length > 0) {
    const { error } = await admin
      .from("returns")
      .delete()
      .eq("organization_id", activeOrganizationId)
      .in("invoice_id", input.invoiceIds);
    if (error)
      throw new Error(`Unledgered return cleanup failed: ${error.message}`);
  }
  for (const invoiceId of input.invoiceIds) {
    const { error } = await admin
      .from("invoices")
      .delete()
      .eq("organization_id", activeOrganizationId)
      .eq("id", invoiceId);
    if (error) throw new Error(`Invoice cleanup failed: ${error.message}`);
  }
  if (input.customerId) {
    const { error } = await admin
      .from("customers")
      .delete()
      .eq("organization_id", activeOrganizationId)
      .eq("id", input.customerId);
    if (error) throw new Error(`Customer cleanup failed: ${error.message}`);
  }
  if (input.productId) {
    for (const table of ["stock_movements", "product_stock_lots"] as const) {
      const { error } = await admin
        .from(table)
        .delete()
        .eq("organization_id", activeOrganizationId)
        .eq("product_id", input.productId);
      if (error) throw new Error(`${table} cleanup failed: ${error.message}`);
    }
    const { error } = await admin
      .from("products")
      .delete()
      .eq("organization_id", activeOrganizationId)
      .eq("id", input.productId);
    if (error) throw new Error(`Product cleanup failed: ${error.message}`);
  }
  const { error: auditError } = await admin
    .from("audit_logs")
    .delete()
    .eq("organization_id", activeOrganizationId)
    .eq("actor_id", input.ownerId);
  if (auditError)
    throw new Error(`Audit cleanup failed: ${auditError.message}`);
}

test.describe("Dashboard net cash reconciliation", () => {
  test.skip(
    !isLocalPlaywrightRun(),
    "This financial workflow is loopback-only.",
  );

  test("Today net widget remains readable at every size across mobile and desktop", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    mkdirSync(artifactRoot, { recursive: true });
    const marker = `QA-NC-UI-${Date.now().toString(36).slice(-5)}-${randomBytes(2).toString("hex")}`;
    const originalBefore = await safetySnapshot();
    const owner = await ensureLocalOwner(marker);
    const browser = attachBrowserEvidence(page);

    try {
      await loginLocalOwnerDirectly(page, owner.email, ownerPassword);
      for (const variant of [
        { size: "S", width: 320, height: 568, colorScheme: "light" },
        { size: "M", width: 390, height: 844, colorScheme: "dark" },
        { size: "L", width: 430, height: 932, colorScheme: "light" },
        { size: "XL", width: 1440, height: 900, colorScheme: "dark" },
      ] as const) {
        await assertTodayNetPresentation(page, variant);
      }

      expect(browser.pageErrors).toEqual([]);
      expect(browser.consoleErrors).toEqual([]);
      expect(browser.requestFailures).toEqual([]);
      expect(browser.httpErrors).toEqual([]);
      expect(browser.nativeDialogs).toBe(0);
    } finally {
      await owner.cleanup();
      await expect
        .poll(async () => await safetySnapshot(), { timeout: 30_000 })
        .toEqual(originalBefore);
    }
  });

  test("Card activity stays out of cash while Cash activity reconciles the drawer", async ({
    page,
  }) => {
    test.setTimeout(420_000);
    mkdirSync(artifactRoot, { recursive: true });
    const marker = `QA-NC-${Date.now().toString(36).slice(-6)}-${randomBytes(2).toString("hex")}`;
    const admin = getLocalAdminClient();
    const originalBefore = await safetySnapshot();
    const owner = await ensureLocalOwner(marker);
    const before = await safetySnapshot();
    const browser = attachBrowserEvidence(page);
    const result: Record<string, unknown> = { marker, baselineMode };
    let productId: string | null = null;
    let customerId: string | null = null;
    let shiftId: string | null = null;
    const invoiceIds: string[] = [];
    const returnIds: string[] = [];

    try {
      const { data: openShift } = await admin
        .from("cash_shifts")
        .select("id")
        .eq("organization_id", activeOrganizationId)
        .eq("branch_id", owner.branchId)
        .eq("status", "open")
        .maybeSingle();
      expect(
        openShift,
        "the local branch begins without an open shift",
      ).toBeNull();

      await loginLocalOwnerDirectly(page, owner.email, ownerPassword);
      const baseline = await dashboardNetCash(page);
      result.dashboardBaseline = baseline;
      productId = await addProduct(page, marker);

      const cardSale = await checkout(page, {
        productId,
        method: "card",
        marker,
        createCustomer: true,
      });
      invoiceIds.push(cardSale.invoiceId);
      customerId = cardSale.customerId;
      await assertTransaction(cardSale.invoiceId, null, "card");
      const afterCardSale = await dashboardNetCash(page);
      result.afterCardSale = afterCardSale;

      const cardReturnId = await processReturn(
        page,
        cardSale.invoiceId,
        "card",
        marker,
      );
      returnIds.push(cardReturnId);
      await assertTransaction(cardSale.invoiceId, cardReturnId, "card");
      const afterCardRefund = await dashboardNetCash(page);
      result.afterCardRefund = afterCardRefund;

      await page.goto("/daily-closing");
      const openShiftForm = page
        .locator("form")
        .filter({ has: page.getByRole("button", { name: "Open shift" }) });
      await openShiftForm.locator('input[name="starting_cash"]').fill("1000");
      await openShiftForm
        .locator('textarea[name="notes"]')
        .fill(`${marker} shift`);
      await openShiftForm.getByRole("button", { name: "Open shift" }).click();
      await expect(
        page.getByRole("heading", { name: "Active Shift" }),
      ).toBeVisible({
        timeout: 30_000,
      });
      const { data: shift, error: shiftError } = await admin
        .from("cash_shifts")
        .select("id, starting_cash, status")
        .eq("organization_id", activeOrganizationId)
        .eq("branch_id", owner.branchId)
        .eq("status", "open")
        .single();
      if (shiftError || !shift)
        throw new Error(`Shift lookup failed: ${shiftError?.message}`);
      shiftId = shift.id;
      expect(Number(shift.starting_cash)).toBe(1000);

      const cashSale = await checkout(page, {
        productId,
        method: "cash",
        marker,
      });
      invoiceIds.push(cashSale.invoiceId);
      await assertTransaction(cashSale.invoiceId, null, "cash");
      const afterCashSale = await dashboardNetCash(page);
      const shiftAfterCashSale = await shiftFigures(page);
      result.afterCashSale = afterCashSale;
      result.shiftAfterCashSale = shiftAfterCashSale;

      const cashReturnId = await processReturn(
        page,
        cashSale.invoiceId,
        "cash",
        marker,
      );
      returnIds.push(cashReturnId);
      await assertTransaction(cashSale.invoiceId, cashReturnId, "cash");
      const afterCashRefund = await dashboardNetCash(page);
      const shiftAfterCashRefund = await shiftFigures(page);
      result.afterCashRefund = afterCashRefund;
      result.shiftAfterCashRefund = shiftAfterCashRefund;

      if (baselineMode) {
        expect(afterCardSale - baseline).toBe(150);
        expect(afterCardRefund - baseline).toBe(150);
        expect(afterCashSale - baseline).toBe(300);
        expect(afterCashRefund - baseline).toBe(300);
      } else {
        expect(afterCardSale - baseline).toBe(0);
        expect(afterCardRefund - baseline).toBe(0);
        expect(afterCashSale - baseline).toBe(150);
        expect(afterCashRefund - baseline).toBe(0);
      }
      expect(shiftAfterCashSale).toEqual({ net: 150, drawer: 1150 });
      expect(shiftAfterCashRefund).toEqual({ net: 0, drawer: 1000 });

      await page.goto("/daily-closing");
      const closeForm = page
        .locator("form")
        .filter({ has: page.getByRole("button", { name: "Close shift" }) });
      await closeForm.locator('input[name="counted_cash"]').fill("1000");
      await closeForm
        .locator('textarea[name="notes"]')
        .fill(`${marker} reconciled`);
      await closeForm.getByRole("button", { name: "Close shift" }).click();
      await expect
        .poll(async () => {
          const { data } = await admin
            .from("cash_shifts")
            .select("status, expected_cash, counted_cash, cash_difference")
            .eq("id", shiftId)
            .single();
          return data;
        }, { timeout: 30_000 })
        .toEqual({
          status: "closed",
          expected_cash: 1000,
          counted_cash: 1000,
          cash_difference: 0,
        });

      await page.reload();
      expect(await dashboardNetCash(page)).toBe(afterCashRefund);
      await page.screenshot({
        path: `${artifactRoot}/${baselineMode ? "baseline" : "fixed"}-dashboard.png`,
        fullPage: true,
      });

      expect(browser.pageErrors).toEqual([]);
      expect(browser.consoleErrors).toEqual([]);
      expect(browser.requestFailures).toEqual([]);
      expect(browser.httpErrors).toEqual([]);
      expect(browser.nativeDialogs).toBe(0);
      expect(browser.actionPosts).toHaveLength(8);
      expect(browser.actionPosts.every((entry) => entry.startsWith("200 "))).toBe(
        true,
      );
      result.actionPosts = browser.actionPosts;
    } finally {
      result.browser = browser;
      writeFileSync(
        `${artifactRoot}/${baselineMode ? "baseline" : "fixed"}.json`,
        JSON.stringify(result, null, 2),
      );
      await cleanupFixture({
        ownerId: owner.id,
        productId,
        customerId,
        invoiceIds,
        returnIds,
        shiftId,
      });
      await expect
        .poll(async () => await safetySnapshot(), { timeout: 30_000 })
        .toEqual(before);
      await owner.cleanup();
      await expect
        .poll(async () => await safetySnapshot(), { timeout: 30_000 })
        .toEqual(originalBefore);
    }
  });
});
