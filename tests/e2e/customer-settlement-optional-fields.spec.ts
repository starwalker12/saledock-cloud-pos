import { expect, test } from "@playwright/test";
import { loginWithCredentials } from "./helpers/auth";
import {
  getLocalAdminClient,
  isLocalPlaywrightRun,
  LOCAL_QA_ORG_ID,
  SEEDED_PHYSICAL_PRODUCT_ID,
} from "./helpers/local-supabase";

const OWNER_EMAIL = "owner@saledock.local";
const LOCAL_PASSWORD = "Password123!";
const LOCAL_QA_BRANCH_ID = "00000000-0000-4000-8000-000000000101";

test("blank and whitespace settlement fields stay optional without changing debt math", async ({
  page,
}) => {
  test.skip(!isLocalPlaywrightRun(), "This settlement mutation QA is restricted to localhost.");
  test.setTimeout(150_000);

  const admin = getLocalAdminClient();
  const invoiceNote = `QA optional settlement ${Date.now()}`;
  const customerId = crypto.randomUUID();
  const customerName = `QA Settlement Customer ${Date.now()}`;
  const customerPhone = "+923009991111";

  const { error: customerError } = await admin.from("customers").insert({
    id: customerId,
    organization_id: LOCAL_QA_ORG_ID,
    branch_id: LOCAL_QA_BRANCH_ID,
    name: customerName,
    phone: customerPhone,
    credit_limit: 0,
    outstanding_balance: 0,
    is_archived: false,
    notes: "Disposable local settlement validation customer",
  });
  if (customerError) throw new Error("Disposable local settlement customer could not be created.");

  expect(await loginWithCredentials(page, OWNER_EMAIL, LOCAL_PASSWORD)).toBe(true);
  await page.goto("/pos");
  await expect(page).toHaveURL(/\/pos(?:\?|$)/);

  await page
    .locator(
      `[data-testid="pos-product-btn"][data-product-id="${SEEDED_PHYSICAL_PRODUCT_ID}"]`,
    )
    .click();
  await page.getByRole("button", { name: "Customer", exact: true }).click();
  await page
    .getByRole("option", { name: `${customerName} · ${customerPhone}`, exact: true })
    .click();
  await page.getByRole("button", { name: "Payment method", exact: true }).click();
  await page.getByRole("option", { name: "Customer credit", exact: true }).click();
  await page.locator('[data-testid="pos-note-input"]').fill(invoiceNote);
  await page.locator('[data-testid="pos-checkout-btn"]').click();
  await expect(page.getByText(/Sale recorded as INV-/)).toBeVisible({ timeout: 20_000 });

  async function readBalance() {
    const { data, error } = await admin
      .from("customers")
      .select("outstanding_balance")
      .eq("id", customerId)
      .eq("organization_id", LOCAL_QA_ORG_ID)
      .single();
    if (error || !data) throw new Error("Local QA customer balance could not be read.");
    return Number(data.outstanding_balance);
  }

  async function readPayments() {
    const { data, error } = await admin
      .from("credit_payments")
      .select("amount, reference_number, notes")
      .eq("customer_id", customerId)
      .eq("organization_id", LOCAL_QA_ORG_ID)
      .order("created_at", { ascending: true });
    if (error) throw new Error("Local QA settlement rows could not be read.");
    return data ?? [];
  }

  expect(await readBalance()).toBe(1200);
  expect(await readPayments()).toHaveLength(0);

  await page.goto(`/customers/${customerId}`);
  const settlementSummary = page.locator('summary:has-text("Receive Settlement Payment")');
  await settlementSummary.click();
  const amountInput = page.getByRole("spinbutton", { name: "Amount (PKR)", exact: true });
  const submit = page.getByRole("button", { name: "Confirm & Save Settlement", exact: true });

  await amountInput.fill("1201");
  await submit.click();
  expect(await readBalance()).toBe(1200);
  expect(await readPayments()).toHaveLength(0);

  await amountInput.fill("400");
  await submit.click();
  await expect(page.getByRole("status")).toHaveText("Credit payment recorded successfully.");
  await expect.poll(readBalance).toBe(800);

  await page.reload();
  await settlementSummary.click();
  await amountInput.fill("300");
  await page.getByPlaceholder("e.g. Bank slip or Transaction ID").fill("   ");
  await page.getByPlaceholder("e.g. Partial recovery or Monthly clearance").fill("  \t ");
  await submit.click();
  await expect(page.getByRole("status")).toHaveText("Credit payment recorded successfully.");
  await expect.poll(readBalance).toBe(500);

  await page.reload();
  await settlementSummary.click();
  await amountInput.fill("500");
  await page.getByPlaceholder("e.g. Bank slip or Transaction ID").fill("  QA-REF-500  ");
  await page
    .getByPlaceholder("e.g. Partial recovery or Monthly clearance")
    .fill("  QA final settlement  ");
  await submit.click();
  await expect.poll(readBalance).toBe(0);
  await expect(page.getByRole("status")).toHaveText("Customer balance is fully settled.");

  const payments = await readPayments();
  expect(
    payments.map((payment) => ({
      amount: Number(payment.amount),
      reference_number: payment.reference_number,
      notes: payment.notes,
    })),
  ).toEqual([
    { amount: 400, reference_number: null, notes: null },
    { amount: 300, reference_number: null, notes: null },
    {
      amount: 500,
      reference_number: "QA-REF-500",
      notes: "QA final settlement",
    },
  ]);
  await expect(page.getByText(/expected string/i)).toHaveCount(0);
});
