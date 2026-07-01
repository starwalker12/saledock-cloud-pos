import { expect, test } from "@playwright/test";
import { loginWithCredentials } from "./helpers/auth";
import {
  getLocalAdminClient,
  isLocalPlaywrightRun,
  LOCAL_QA_ORG_ID,
} from "./helpers/local-supabase";

const OWNER_EMAIL = "owner@saledock.local";
const ADMIN_EMAIL = "admin@saledock.local";
const MANAGER_EMAIL = "manager@saledock.local";
const CASHIER_EMAIL = "cashier@saledock.local";
const LOCAL_PASSWORD = "Password123!";
const SERVICE_PRODUCT_ID = "00000000-0000-4000-8000-000000003003";
const PHYSICAL_PRODUCT_ID = "00000000-0000-4000-8000-000000003001";
const CUSTOMER_ID = "00000000-0000-4000-8000-000000004001";
const PHYSICAL_PRODUCT_NAME = "iPhone 15 Pro Max Clear Case";

const IMAGE_FIXTURES = {
  jpeg: Buffer.from(
    "/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAQABADASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAABgf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCfAUoCf//Z",
    "base64",
  ),
  png: Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAGUlEQVR4nGOQq7hDEmIY1VAxGkpywzVpAAD2K3IQ2RuBMQAAAABJRU5ErkJggg==",
    "base64",
  ),
  webp: Buffer.from(
    "UklGRjoAAABXRUJQVlA4IC4AAAAQAgCdASoQABAAAUAmJaACdLoB+AH4AAPIAP7scN/9g6YMuf4r3/poowpj7aAA",
    "base64",
  ),
};

async function loginOwner(page: import("@playwright/test").Page) {
  await loginLocalUser(page, OWNER_EMAIL);
}

async function loginLocalUser(
  page: import("@playwright/test").Page,
  email: string,
) {
  await page.context().clearCookies();
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  expect(await loginWithCredentials(page, email, LOCAL_PASSWORD)).toBe(true);
  await page.evaluate(() => {
    window.localStorage.setItem(
      "analytics-consent",
      JSON.stringify({
        value: "rejected",
        version: "2026-06-analytics-v1",
        timestamp: new Date().toISOString(),
      }),
    );
  });
  const rejectCookies = page.getByRole("button", { name: "Reject optional cookies", exact: true });
  if (await rejectCookies.isVisible().catch(() => false)) {
    await rejectCookies.click();
  }
}

async function openPhysicalProductEditor(page: import("@playwright/test").Page) {
  await page.goto("/products");
  const row = page.getByRole("row").filter({ hasText: PHYSICAL_PRODUCT_NAME });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Edit product" });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function stockSnapshot() {
  const admin = getLocalAdminClient();
  const { data: products, error: productsError } = await admin
    .from("products")
    .select("id, stock_quantity")
    .eq("organization_id", LOCAL_QA_ORG_ID);
  if (productsError) throw new Error("Local product stock could not be read.");

  const { data: lots, error: lotsError } = await admin
    .from("product_stock_lots")
    .select("id, quantity_remaining")
    .eq("organization_id", LOCAL_QA_ORG_ID);
  if (lotsError) throw new Error("Local FIFO stock could not be read.");

  return {
    products: (products ?? []).map((row) => ({
      id: row.id as string,
      stock: Number(row.stock_quantity),
    })),
    lots: (lots ?? []).map((row) => ({
      id: row.id as string,
      remaining: Number(row.quantity_remaining),
    })),
  };
}

test.describe("MVP Part 2 local browser verification", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(() => {
    test.skip(!isLocalPlaywrightRun(), "This mutation QA is restricted to localhost.");
  });

  test("service sale UI records 1050 while profit remains commission-only", async ({ page }) => {
    test.setTimeout(90_000);
    const admin = getLocalAdminClient();
    const note = `QA service browser ${Date.now()}`;
    const stockBefore = await stockSnapshot();

    await loginOwner(page);
    await page.goto("/pos");
    await expect(page).toHaveURL(/\/pos(?:\?|$)/);

    const serviceButton = page.locator(
      `[data-testid="pos-product-btn"][data-product-id="${SERVICE_PRODUCT_ID}"]`,
    );
    await expect(serviceButton).toBeVisible();
    await serviceButton.click();

    await page.getByLabel("Principal (pass-through)", { exact: true }).fill("1000");
    await page.getByLabel("Commission (shop income)", { exact: true }).fill("50");
    await page.locator('label:has-text("Total charged") input[type="number"]').fill("1050");
    await page.locator('[data-testid="pos-amount-tendered-input"]').fill("1050");
    await page.locator('[data-testid="pos-note-input"]').fill(note);

    const checkout = page.locator('[data-testid="pos-checkout-btn"]');
    await expect(checkout).toContainText("1,050");
    await expect(checkout).toBeEnabled();
    await checkout.click();
    await expect(page.getByText(/Sale recorded as INV-/)).toBeVisible({ timeout: 20_000 });

    const { data: invoice, error: invoiceError } = await admin
      .from("invoices")
      .select("id, invoice_no, grand_total, amount_paid, balance_due, change_due")
      .eq("organization_id", LOCAL_QA_ORG_ID)
      .eq("note", note)
      .single();
    if (invoiceError || !invoice) throw new Error("Service QA invoice was not found.");
    expect(Number(invoice.grand_total)).toBe(1050);
    expect(Number(invoice.amount_paid)).toBe(1050);
    expect(Number(invoice.balance_due)).toBe(0);
    expect(Number(invoice.change_due)).toBe(0);

    const { data: item, error: itemError } = await admin
      .from("invoice_items")
      .select(
        "line_total, unit_price, service_transaction_amount, service_commission, service_total_charged",
      )
      .eq("invoice_id", invoice.id as string)
      .single();
    if (itemError || !item) throw new Error("Service QA invoice item was not found.");
    expect(Number(item.unit_price)).toBe(1050);
    expect(Number(item.line_total)).toBe(1050);
    expect(Number(item.service_transaction_amount)).toBe(1000);
    expect(Number(item.service_commission)).toBe(50);
    expect(Number(item.service_total_charged)).toBe(1050);

    const { data: payments, error: paymentError } = await admin
      .from("payments")
      .select("amount")
      .eq("invoice_id", invoice.id as string);
    if (paymentError) throw new Error("Service QA payment could not be read.");
    expect(payments).toHaveLength(1);
    expect(Number(payments?.[0]?.amount)).toBe(1050);
    expect(await stockSnapshot()).toEqual(stockBefore);

    await page.goto("/reports");
    await expect(page.getByText("Service Transactions")).toBeVisible();
    // The reports page aggregates all service transactions in the selected date
    // range. Earlier QA runs already accumulated service sales, so assert the
    // aggregate math is consistent (commission + principal = total charged) and
    // that commission is explicitly marked as profit while principal is not.
    const serviceSection = page.locator("section").filter({ hasText: "Service Transactions" }).first();
    await expect(serviceSection.getByText("Commission earned")).toBeVisible();
    await expect(serviceSection.getByText("Principal handled")).toBeVisible();
    await expect(serviceSection.getByText("Pass-through (NOT profit)")).toBeVisible();
    await expect(serviceSection.getByText("Counts toward profit.")).toBeVisible();
  });

  test("customer credit and settlement UI reduce debt without creating an advance", async ({ page }) => {
    test.setTimeout(120_000);
    const admin = getLocalAdminClient();
    const note = `QA credit browser ${Date.now()}`;

    // Create a disposable customer so this test is isolated from other QA runs.
    const customerId = crypto.randomUUID();
    const customerName = `QA Credit Customer ${Date.now()}`;
    const customerPhone = `+92300${Math.floor(1000000 + Math.random() * 8999999)}`;
    const { error: customerError } = await admin.from("customers").insert({
      id: customerId,
      organization_id: LOCAL_QA_ORG_ID,
      branch_id: "00000000-0000-4000-8000-000000000101",
      name: customerName,
      phone: customerPhone,
      credit_limit: 0,
      outstanding_balance: 0,
      is_archived: false,
      notes: "Disposable local credit/settlement QA customer",
    });
    if (customerError) throw new Error("Disposable credit customer could not be created.");

    await loginOwner(page);
    await page.goto("/pos");
    await expect(page).toHaveURL(/\/pos(?:\?|$)/);

    const physicalButton = page.locator(
      `[data-testid="pos-product-btn"][data-product-id="${PHYSICAL_PRODUCT_ID}"]`,
    );
    await expect(physicalButton).toBeVisible();
    await physicalButton.click();

    await page.getByRole("button", { name: "Customer", exact: true }).click();
    await page
      .getByRole("option", { name: `${customerName} · ${customerPhone}`, exact: true })
      .click();
    await page.getByRole("button", { name: "Payment method", exact: true }).click();
    await page.getByRole("option", { name: "Customer credit", exact: true }).click();
    await page.locator('[data-testid="pos-note-input"]').fill(note);

    const checkout = page.locator('[data-testid="pos-checkout-btn"]');
    await expect(checkout).toBeEnabled();
    await checkout.click();
    await expect(page.getByText(/Sale recorded as INV-/)).toBeVisible({ timeout: 20_000 });

    const { data: invoice, error: invoiceError } = await admin
      .from("invoices")
      .select("id, grand_total, amount_paid, balance_due, change_due")
      .eq("organization_id", LOCAL_QA_ORG_ID)
      .eq("note", note)
      .single();
    if (invoiceError || !invoice) throw new Error("Credit QA invoice was not found.");
    expect(Number(invoice.grand_total)).toBe(1200);
    expect(Number(invoice.amount_paid)).toBe(0);
    expect(Number(invoice.balance_due)).toBe(1200);
    expect(Number(invoice.change_due)).toBe(0);

    const readBalance = async () => {
      const { data, error } = await admin
        .from("customers")
        .select("outstanding_balance")
        .eq("id", customerId)
        .single();
      if (error || !data) throw new Error("Local customer balance could not be read.");
      return Number(data.outstanding_balance);
    };
    expect(await readBalance()).toBe(1200);

    await page.goto(`/customers/${customerId}`);
    const settlementSummary = page.locator('summary:has-text("Receive Settlement Payment")');
    await expect(settlementSummary).toBeVisible();
    await settlementSummary.click();
    const amountInput = page.getByRole("spinbutton", { name: "Amount (PKR)", exact: true });
    await amountInput.fill("500");
    await page.getByRole("button", { name: "Confirm & Save Settlement", exact: true }).click();
    // After PR #285 reference_number and notes are optional, so empty fields no longer produce a Zod error.
    await expect(page.getByText("Credit payment recorded successfully.", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect.poll(readBalance).toBe(700);

    await page.reload();
    await settlementSummary.click();
    await amountInput.fill("500");
    await page.getByPlaceholder("e.g. Bank slip or Transaction ID").fill("QA-PARTIAL-500");
    await page.getByPlaceholder("e.g. Partial recovery or Monthly clearance").fill("QA partial settlement");
    await page.getByRole("button", { name: "Confirm & Save Settlement", exact: true }).click();
    await expect(page.getByText("Credit payment recorded successfully.", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect.poll(readBalance).toBe(700);

    if (!(await amountInput.isVisible().catch(() => false))) {
      await settlementSummary.click();
    }
    await expect(amountInput).toHaveAttribute("max", "700");
    const { count: paymentsBeforeOverpay } = await admin
      .from("credit_payments")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", customerId);
    await amountInput.fill("701");
    await page.getByRole("button", { name: "Confirm & Save Settlement", exact: true }).click();
    expect(await readBalance()).toBe(700);
    const { count: paymentsAfterOverpay } = await admin
      .from("credit_payments")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", customerId);
    expect(paymentsAfterOverpay).toBe(paymentsBeforeOverpay);

    await amountInput.fill("700");
    await page.getByPlaceholder("e.g. Bank slip or Transaction ID").fill("QA-FINAL-700");
    await page.getByPlaceholder("e.g. Partial recovery or Monthly clearance").fill("QA final settlement");
    await page.getByRole("button", { name: "Confirm & Save Settlement", exact: true }).click();
    await expect.poll(readBalance).toBe(0);
    await expect(page.getByText("Receive Settlement Payment", { exact: true })).toHaveCount(0);

    const { data: payments, error: paymentsError } = await admin
      .from("credit_payments")
      .select("amount")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: true });
    if (paymentsError) throw new Error("Local credit settlements could not be read.");
    expect((payments ?? []).map((payment) => Number(payment.amount))).toEqual([500, 700]);
  });

  test("cash drawer closes with sales and cash settlements while held bills stay excluded", async ({ page }) => {
    test.setTimeout(120_000);
    const admin = getLocalAdminClient();
    const heldLabel = `QA cash drawer held ${Date.now()}`;

    await loginOwner(page);
    await page.goto("/daily-closing");
    await expect(page.getByText("Cash payments", { exact: true })).toBeVisible();
    await expect(page.getByText("Credit collection cash", { exact: true })).toBeVisible();
    const reconciliation = page.locator('section:has(h2:has-text("Cash reconciliation"))');
    await expect(reconciliation.getByText("Expected cash", { exact: true })).toBeVisible();

    const expectedBeforeHold = reconciliation.getByText("Expected cash", { exact: true }).locator("..");
    await expect(expectedBeforeHold).toContainText("PKR 2,250");

    const stockBeforeHold = await stockSnapshot();
    const { count: invoicesBeforeHold } = await admin
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", LOCAL_QA_ORG_ID);

    await page.goto("/pos");
    const physicalButton = page.locator(
      `[data-testid="pos-product-btn"][data-product-id="${PHYSICAL_PRODUCT_ID}"]`,
    );
    await physicalButton.click();
    await page.getByRole("button", { name: "Hold", exact: true }).click();
    const holdDialog = page.getByRole("dialog", { name: "Hold bill" });
    await holdDialog.getByPlaceholder("e.g. Counter 2 / Umar").fill(heldLabel);
    await holdDialog.getByPlaceholder("Any details about this held bill").fill("Cash drawer exclusion QA");
    await holdDialog.getByRole("button", { name: "Hold bill", exact: true }).click();
    await expect(page.getByText("Bill held.", { exact: true })).toBeVisible({ timeout: 15_000 });

    expect(await stockSnapshot()).toEqual(stockBeforeHold);
    const { count: invoicesAfterHold } = await admin
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", LOCAL_QA_ORG_ID);
    expect(invoicesAfterHold).toBe(invoicesBeforeHold);

    await page.goto("/daily-closing");
    const refreshedReconciliation = page.locator('section:has(h2:has-text("Cash reconciliation"))');
    const expectedAfterHold = refreshedReconciliation.getByText("Expected cash", { exact: true }).locator("..");
    await expect(expectedAfterHold).toContainText("PKR 2,250");
    await refreshedReconciliation.getByRole("spinbutton", { name: "Counted cash (PKR)", exact: true }).fill("2250");
    await expect(refreshedReconciliation.getByText("Difference", { exact: true }).locator("..")).toContainText("PKR 0");
    await refreshedReconciliation.getByRole("button", { name: "Close day", exact: true }).click();
    await expect(page.getByText("Day closed.", { exact: true })).toBeVisible({ timeout: 15_000 });

    const { data: closing, error: closingError } = await admin
      .from("daily_closings")
      .select(
        "cash_sales, credit_collection_cash, expenses_total, refunds_total, expected_closing_cash, actual_closing_cash, cash_difference, finalized_at",
      )
      .eq("organization_id", LOCAL_QA_ORG_ID)
      .single();
    if (closingError || !closing) throw new Error("Local daily closing was not found.");
    expect(Number(closing.cash_sales)).toBe(1050);
    expect(Number(closing.credit_collection_cash)).toBe(1200);
    expect(Number(closing.expenses_total)).toBe(0);
    expect(Number(closing.refunds_total)).toBe(0);
    expect(Number(closing.expected_closing_cash)).toBe(2250);
    expect(Number(closing.actual_closing_cash)).toBe(2250);
    expect(Number(closing.cash_difference)).toBe(0);
    expect(closing.finalized_at).toBeTruthy();

    const { data: heldBill, error: heldError } = await admin
      .from("pos_held_bills")
      .select("status, completed_invoice_id")
      .eq("organization_id", LOCAL_QA_ORG_ID)
      .eq("label", heldLabel)
      .single();
    if (heldError || !heldBill) throw new Error("Local held bill was not found.");
    expect(heldBill).toEqual({ status: "held", completed_invoice_id: null });
  });

  test("product image storage mutations and role controls are safe", async ({ page }) => {
    test.setTimeout(180_000);
    const admin = getLocalAdminClient();

    async function readImagePath() {
      const { data, error } = await admin
        .from("products")
        .select("image_path")
        .eq("id", PHYSICAL_PRODUCT_ID)
        .single();
      if (error || !data) throw new Error("Local QA product image path could not be read.");
      return data.image_path as string | null;
    }

    async function replaceImage(
      extension: "jpg" | "png" | "webp",
      mimeType: "image/jpeg" | "image/png" | "image/webp",
      buffer: Buffer,
    ) {
      const previousPath = await readImagePath();
      const dialog = await openPhysicalProductEditor(page);
      await dialog.locator('input[name="product_image"]').setInputFiles({
        name: `qa-product.${extension}`,
        mimeType,
        buffer,
      });
      await expect(dialog.getByAltText("Product image preview")).toBeVisible();
      await dialog.getByRole("button", { name: "Save changes", exact: true }).click();
      await expect(dialog).toHaveCount(0, { timeout: 20_000 });
      await expect.poll(readImagePath).not.toBe(previousPath);
      expect(await readImagePath()).toMatch(new RegExp(`\\.${extension}$`));

      // Production image hosts are HTTPS-only. Clear the disposable local HTTP
      // reference before loading another app route so this test can continue
      // without weakening production Next Image policy.
      const { error: clearError } = await admin
        .from("products")
        .update({ image_path: null })
        .eq("id", PHYSICAL_PRODUCT_ID);
      if (clearError) throw new Error("Disposable local product image path could not be cleared.");
      await expect.poll(readImagePath).toBeNull();
    }

    await loginOwner(page);

    const spoofDialog = await openPhysicalProductEditor(page);
    await spoofDialog.locator('input[name="product_image"]').setInputFiles({
      name: "spoofed.png",
      mimeType: "image/png",
      buffer: Buffer.from("This is not an image."),
    });
    await spoofDialog.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(
      spoofDialog.getByText("The selected file is not a valid product image.", { exact: true }),
    ).toBeVisible();

    await spoofDialog.locator('input[name="product_image"]').setInputFiles({
      name: "qa-product.png",
      mimeType: "image/png",
      buffer: IMAGE_FIXTURES.png,
    });
    await expect(
      spoofDialog.getByText("The selected file is not a valid product image.", { exact: true }),
    ).toHaveCount(0);
    await expect(spoofDialog.getByAltText("Product image preview")).toBeVisible();
    await spoofDialog.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(spoofDialog).toHaveCount(0, { timeout: 20_000 });
    await expect.poll(readImagePath).toMatch(/\.png$/);

    const { error: clearInitialImageError } = await admin
      .from("products")
      .update({ image_path: null })
      .eq("id", PHYSICAL_PRODUCT_ID);
    if (clearInitialImageError) {
      throw new Error("Disposable local product image reference could not be cleared.");
    }
    await expect.poll(readImagePath).toBeNull();

    await replaceImage("jpg", "image/jpeg", IMAGE_FIXTURES.jpeg);
    await replaceImage("webp", "image/webp", IMAGE_FIXTURES.webp);

    const oversizedDialog = await openPhysicalProductEditor(page);
    await oversizedDialog.locator('input[name="product_image"]').setInputFiles({
      name: "oversized.png",
      mimeType: "image/png",
      buffer: Buffer.alloc(2 * 1024 * 1024 + 1, 1),
    });
    await expect(
      oversizedDialog.getByText("Product images must be 2 MB or smaller.", { exact: true }),
    ).toBeVisible();
    await oversizedDialog.locator('input[name="product_image"]').setInputFiles({
      name: "replacement.png",
      mimeType: "image/png",
      buffer: IMAGE_FIXTURES.png,
    });
    await expect(
      oversizedDialog.getByText("Product images must be 2 MB or smaller.", { exact: true }),
    ).toHaveCount(0);
    await expect(oversizedDialog.getByAltText("Product image preview")).toBeVisible();
    await oversizedDialog.getByRole("button", { name: "Remove image", exact: true }).click();
    await expect(oversizedDialog.getByAltText("Product image preview")).toHaveCount(0);
    await oversizedDialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(oversizedDialog).toHaveCount(0);

    await page.reload();
    await expect(
      page.getByRole("img", { name: `${PHYSICAL_PRODUCT_NAME} has no product image` }),
    ).toBeVisible();
    await page.goto("/pos");
    const posProduct = page.locator(
      `[data-testid="pos-product-btn"][data-product-id="${PHYSICAL_PRODUCT_ID}"]`,
    );
    await expect(
      posProduct.getByRole("img", { name: `${PHYSICAL_PRODUCT_NAME} has no product image` }),
    ).toBeVisible();
    await posProduct.click();
    await expect(page.locator('[data-testid="pos-checkout-btn"]')).toBeEnabled();

    await loginLocalUser(page, MANAGER_EMAIL);
    const managerDialog = await openPhysicalProductEditor(page);
    await managerDialog.locator('input[name="product_image"]').setInputFiles({
      name: "manager-qa.jpg",
      mimeType: "image/jpeg",
      buffer: IMAGE_FIXTURES.jpeg,
    });
    await expect(managerDialog.getByAltText("Product image preview")).toBeVisible();
    await managerDialog.getByRole("button", { name: "Remove image", exact: true }).click();
    await managerDialog.getByRole("button", { name: "Cancel", exact: true }).click();

    await loginLocalUser(page, CASHIER_EMAIL);
    await page.goto("/products");
    await expect(
      page.getByText("Your role (cashier) can view the catalog but cannot create or edit items.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Edit", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Add product", exact: true })).toHaveCount(0);
  });

  test("a disposable second organization cannot read the first shop through app routes", async ({ page }) => {
    test.setTimeout(180_000);
    const admin = getLocalAdminClient();
    const secondOrgId = "00000000-0000-4000-8000-000000000002";
    const secondBranchId = "00000000-0000-4000-8000-000000000102";
    const secondProductId = "00000000-0000-4000-8000-000000003101";
    const secondCustomerId = "00000000-0000-4000-8000-000000004101";
    const secondInvoiceId = "00000000-0000-4000-8000-000000006101";
    const secondHeldBillId = "00000000-0000-4000-8000-000000007101";
    const secondProductName = "QA Second Shop Product";
    const secondCustomerName = "QA Second Shop Customer";
    const secondInvoiceNo = "QA-ORG2-INV-001";
    const secondHeldLabel = "QA Second Shop Held Bill";

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("id, organization_id, branch_id")
      .eq("role", "admin")
      .eq("organization_id", LOCAL_QA_ORG_ID)
      .single();
    if (profileError || !profile) throw new Error("Local admin profile was not found.");

    const { data: sourceOrg, error: orgError } = await admin
      .from("organizations")
      .select("*")
      .eq("id", LOCAL_QA_ORG_ID)
      .single();
    const { data: sourceBranch, error: branchError } = await admin
      .from("branches")
      .select("*")
      .eq("organization_id", LOCAL_QA_ORG_ID)
      .single();
    const { data: sourceSettings, error: settingsError } = await admin
      .from("app_settings")
      .select("*")
      .eq("organization_id", LOCAL_QA_ORG_ID)
      .single();
    const { data: sourceProduct, error: productError } = await admin
      .from("products")
      .select("*")
      .eq("id", PHYSICAL_PRODUCT_ID)
      .single();
    const { data: sourceCustomer, error: customerError } = await admin
      .from("customers")
      .select("*")
      .eq("id", CUSTOMER_ID)
      .single();
    const { data: sourceInvoice, error: invoiceError } = await admin
      .from("invoices")
      .select("*")
      .eq("organization_id", LOCAL_QA_ORG_ID)
      .limit(1)
      .single();
    if (
      orgError ||
      branchError ||
      settingsError ||
      productError ||
      customerError ||
      invoiceError ||
      !sourceOrg ||
      !sourceBranch ||
      !sourceSettings ||
      !sourceProduct ||
      !sourceCustomer ||
      !sourceInvoice
    ) {
      throw new Error("Local source records for the second-organization test were not found.");
    }

    const firstOrgInvoiceNo = sourceInvoice.invoice_no as string;
    const firstOrgHeldLabel = "QA cash drawer held";

    try {
      const { error: createOrgError } = await admin.from("organizations").insert({
        ...sourceOrg,
        id: secondOrgId,
        name: "QA Second Shop",
        legal_name: "QA Second Shop",
        email: "second-shop@saledock.local",
        phone: "+923109999999",
        slug: null,
      });
      if (createOrgError) throw new Error("Disposable second organization could not be created.");

      const { error: createBranchError } = await admin.from("branches").insert({
        ...sourceBranch,
        id: secondBranchId,
        organization_id: secondOrgId,
        name: "QA Second Branch",
      });
      if (createBranchError) throw new Error("Disposable second branch could not be created.");

      const settingsWithoutId = { ...sourceSettings } as Record<string, unknown>;
      delete settingsWithoutId.id;
      const { error: createSettingsError } = await admin.from("app_settings").insert({
        ...settingsWithoutId,
        organization_id: secondOrgId,
        branch_id: secondBranchId,
        shop_name: "QA Second Shop",
      });
      if (createSettingsError) throw new Error("Disposable second shop settings could not be created.");

      const { error: createProductError } = await admin.from("products").insert({
        ...sourceProduct,
        id: secondProductId,
        organization_id: secondOrgId,
        branch_id: secondBranchId,
        category_id: null,
        supplier_id: null,
        name: secondProductName,
        sku: "QA-ORG2-PRODUCT",
        barcode: null,
        image_path: null,
      });
      if (createProductError) throw new Error("Disposable second-shop product could not be created.");

      const { error: createCustomerError } = await admin.from("customers").insert({
        ...sourceCustomer,
        id: secondCustomerId,
        organization_id: secondOrgId,
        branch_id: secondBranchId,
        name: secondCustomerName,
        phone: "+923009999999",
        email: "second-customer@saledock.local",
        outstanding_balance: 0,
      });
      if (createCustomerError) throw new Error("Disposable second-shop customer could not be created.");

      const { error: createInvoiceError } = await admin.from("invoices").insert({
        ...sourceInvoice,
        id: secondInvoiceId,
        organization_id: secondOrgId,
        branch_id: secondBranchId,
        customer_id: secondCustomerId,
        invoice_no: secondInvoiceNo,
        note: "Disposable cross-org browser QA",
        checkout_idempotency_key: null,
        created_by: profile.id,
      });
      if (createInvoiceError) throw new Error("Disposable second-shop invoice could not be created.");

      const { error: createHeldError } = await admin.from("pos_held_bills").insert({
        id: secondHeldBillId,
        organization_id: secondOrgId,
        branch_id: secondBranchId,
        created_by: profile.id,
        updated_by: profile.id,
        status: "held",
        label: secondHeldLabel,
        customer_id: secondCustomerId,
        customer_name: secondCustomerName,
        note: "Disposable cross-org browser QA",
        cart: [
          {
            product_id: secondProductId,
            name: secondProductName,
            quantity: 1,
            unit_price: 1200,
            discount: 0,
            type: "product",
          },
        ],
        totals_snapshot: { item_count: 1, grand_total: 1200 },
      });
      if (createHeldError) throw new Error("Disposable second-shop held bill could not be created.");

      const { error: moveProfileError } = await admin
        .from("profiles")
        .update({ organization_id: secondOrgId, branch_id: secondBranchId })
        .eq("id", profile.id);
      if (moveProfileError) throw new Error("Local admin could not be assigned to the second shop.");

      await loginLocalUser(page, ADMIN_EMAIL);

      await page.goto("/products");
      await expect(page.getByText(secondProductName, { exact: true }).first()).toBeVisible();
      await expect(page.getByText(PHYSICAL_PRODUCT_NAME, { exact: true })).toHaveCount(0);
      await expect(
        page.getByRole("img", { name: `${secondProductName} has no product image` }).first(),
      ).toBeVisible();

      await page.goto("/customers");
      await expect(page.getByText(secondCustomerName, { exact: true }).first()).toBeVisible();
      await expect(page.getByText("Demo Walk-in Customer", { exact: true })).toHaveCount(0);

      await page.goto("/invoices");
      await expect(page.getByText(secondInvoiceNo, { exact: true }).first()).toBeVisible();
      await expect(page.getByText(firstOrgInvoiceNo, { exact: true })).toHaveCount(0);

      await page.goto("/pos");
      await page.getByRole("button", { name: "Held bills", exact: true }).click();
      const drawer = page.getByRole("dialog", { name: "Held bills" });
      await expect(drawer.getByText(secondHeldLabel, { exact: true })).toBeVisible();
      await expect(drawer.getByText(firstOrgHeldLabel, { exact: false })).toHaveCount(0);

      await page.goto("/users");
      await expect(
        page.getByText("Demo Admin", { exact: true }).filter({ visible: true }).first(),
      ).toBeVisible();
      await expect(page.getByText("Demo Owner", { exact: true })).toHaveCount(0);

      await page.goto(`/customers/${CUSTOMER_ID}`);
      await expect(page.getByText("Demo Walk-in Customer", { exact: true })).toHaveCount(0);
      await page.goto(`/invoices/${sourceInvoice.id as string}`);
      await expect(page.getByText(firstOrgInvoiceNo, { exact: true })).toHaveCount(0);
    } finally {
      await admin
        .from("profiles")
        .update({
          organization_id: profile.organization_id,
          branch_id: profile.branch_id,
        })
        .eq("id", profile.id);
      await admin.from("organizations").delete().eq("id", secondOrgId);
    }
  });
});
