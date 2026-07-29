import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { expect, test, type Browser, type Page } from "@playwright/test";
import {
  getLocalAdminClient,
  isLocalPlaywrightRun,
  loginLocalOwnerDirectly,
} from "./helpers/local-supabase";

const ARTIFACT_ROOT = "/tmp/saledock-customer-ledger-presentation";
const SAFETY_TABLES = [
  "customers",
  "customer_ledger_entries",
  "credit_payments",
  "customer_write_offs",
  "invoices",
  "invoice_items",
  "payments",
  "returns",
  "return_items",
  "audit_logs",
  "cash_shifts",
  "daily_closings",
  "products",
  "product_stock_lots",
  "stock_movements",
  "suppliers",
  "supplier_purchases",
  "supplier_payments",
  "organizations",
  "branches",
  "profiles",
] as const;

type AdminClient = ReturnType<typeof getLocalAdminClient>;

type Fixture = {
  marker: string;
  customerId: string;
  foreignCustomerId: string;
  debtInvoiceId: string;
  debtInvoiceNo: string;
  paidInvoiceId: string;
  paidInvoiceNo: string;
  foreignInvoiceId: string;
  debitLedgerId: string;
  debtReturnId: string;
  debtReturnNo: string;
  paidReturnId: string;
  paidReturnNo: string;
  foreignReturnId: string;
  cleanup: () => Promise<void>;
};

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function tableSignature(
  admin: AdminClient,
  table: string,
): Promise<string> {
  const { data, error } = await admin.from(table).select("*");
  if (error) throw new Error(`${table} signature failed: ${error.code}`);
  const rows = [...(data ?? [])].sort((a, b) =>
    JSON.stringify(a).localeCompare(JSON.stringify(b)),
  );
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

function browserEvidence(page: Page) {
  const result = {
    pageErrors: [] as string[],
    consoleErrors: [] as string[],
    requestFailures: [] as string[],
    httpErrors: [] as string[],
  };
  page.on("pageerror", (error) => result.pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    const location = message.location();
    if (
      location.url.includes("/_vercel/") ||
      text.includes("/_vercel/") ||
      text.includes("status of 406") ||
      text.includes("MIME type ('text/html')")
    ) {
      return;
    }
    result.consoleErrors.push(
      `${location.url || "unknown"}:${location.lineNumber ?? 0} ${text}`,
    );
  });
  page.on("requestfailed", (request) => {
    const url = new URL(request.url());
    const failure = request.failure()?.errorText ?? "";
    if (
      url.pathname.startsWith("/_vercel/") ||
      (request.resourceType() === "fetch" && failure.includes("ERR_ABORTED"))
    ) {
      return;
    }
    result.requestFailures.push(
      `${request.method()} ${url.pathname} ${failure}`.trim(),
    );
  });
  page.on("response", (response) => {
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

async function insertRows(
  admin: AdminClient,
  table: string,
  rows: Record<string, unknown>[],
): Promise<void> {
  const { error } = await admin.from(table).insert(rows);
  if (error)
    throw new Error(`${table} fixture insert failed: ${error.message}`);
}

async function createFixture(admin: AdminClient): Promise<Fixture> {
  const marker = `QA-LEDGER-${randomUUID().slice(0, 8).toUpperCase()}`;
  const ids = {
    customer: randomUUID(),
    debtInvoice: randomUUID(),
    paidInvoice: randomUUID(),
    debtItem: randomUUID(),
    paidItem: randomUUID(),
    debitLedger: randomUUID(),
    refundLedger: randomUUID(),
    payment: randomUUID(),
    debtReturn: randomUUID(),
    paidReturn: randomUUID(),
    debtReturnItem: randomUUID(),
    paidReturnItem: randomUUID(),
    foreignOrganization: randomUUID(),
    foreignBranch: randomUUID(),
    foreignCustomer: randomUUID(),
    foreignInvoice: randomUUID(),
    foreignItem: randomUUID(),
    foreignReturn: randomUUID(),
    foreignReturnItem: randomUUID(),
    foreignLedger: randomUUID(),
  };
  const debtInvoiceNo = `INV-${marker}-D`;
  const paidInvoiceNo = `INV-${marker}-P`;
  const debtReturnNo = `RET-${marker}-D`;
  const paidReturnNo = `RET-${marker}-P`;
  const foreignInvoiceNo = `INV-${marker}-F`;
  const foreignReturnNo = `RET-${marker}-F`;
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

  const createdAt = new Date(Date.now() - 120_000).toISOString();
  const refundedAt = new Date(Date.now() - 60_000).toISOString();

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
      id: ids.customer,
      organization_id: owner.organization_id,
      branch_id: owner.branch_id,
      name: `${marker} Customer`,
      notes: marker,
      credit_limit: 500,
      outstanding_balance: 100,
    },
    {
      id: ids.foreignCustomer,
      organization_id: ids.foreignOrganization,
      branch_id: ids.foreignBranch,
      name: `${marker} Foreign Customer`,
      notes: marker,
      credit_limit: 0,
      outstanding_balance: 20,
    },
  ]);
  await insertRows(admin, "invoices", [
    {
      id: ids.debtInvoice,
      organization_id: owner.organization_id,
      branch_id: owner.branch_id,
      customer_id: ids.customer,
      invoice_no: debtInvoiceNo,
      status: "unpaid",
      subtotal: 150,
      grand_total: 150,
      amount_paid: 0,
      balance_due: 150,
      note: marker,
      created_by: owner.id,
      invoice_date: createdAt,
    },
    {
      id: ids.paidInvoice,
      organization_id: owner.organization_id,
      branch_id: owner.branch_id,
      customer_id: ids.customer,
      invoice_no: paidInvoiceNo,
      status: "paid",
      subtotal: 150,
      grand_total: 150,
      amount_paid: 150,
      balance_due: 0,
      note: marker,
      created_by: owner.id,
      invoice_date: createdAt,
    },
    {
      id: ids.foreignInvoice,
      organization_id: ids.foreignOrganization,
      branch_id: ids.foreignBranch,
      customer_id: ids.foreignCustomer,
      invoice_no: foreignInvoiceNo,
      status: "paid",
      subtotal: 90,
      grand_total: 90,
      amount_paid: 90,
      balance_due: 0,
      note: marker,
      invoice_date: createdAt,
    },
  ]);
  await insertRows(admin, "invoice_items", [
    {
      id: ids.debtItem,
      organization_id: owner.organization_id,
      invoice_id: ids.debtInvoice,
      product_name: `${marker} Debt Service`,
      product_type: "service",
      quantity: 1,
      purchase_price: 0,
      unit_price: 150,
      line_total: 150,
    },
    {
      id: ids.paidItem,
      organization_id: owner.organization_id,
      invoice_id: ids.paidInvoice,
      product_name: `${marker} Paid Service`,
      product_type: "service",
      quantity: 1,
      purchase_price: 0,
      unit_price: 150,
      line_total: 150,
    },
    {
      id: ids.foreignItem,
      organization_id: ids.foreignOrganization,
      invoice_id: ids.foreignInvoice,
      product_name: `${marker} Foreign Service`,
      product_type: "service",
      quantity: 1,
      purchase_price: 0,
      unit_price: 90,
      line_total: 90,
    },
  ]);
  await insertRows(admin, "payments", [
    {
      id: ids.payment,
      organization_id: owner.organization_id,
      branch_id: owner.branch_id,
      invoice_id: ids.paidInvoice,
      customer_id: ids.customer,
      method: "card",
      amount: 150,
      reference_no: marker,
      received_by: owner.id,
      paid_at: createdAt,
    },
  ]);
  await insertRows(admin, "returns", [
    {
      id: ids.debtReturn,
      organization_id: owner.organization_id,
      branch_id: owner.branch_id,
      invoice_id: ids.debtInvoice,
      customer_id: ids.customer,
      return_no: debtReturnNo,
      status: "completed",
      subtotal: 50,
      refund_amount: 0,
      refund_method: null,
      reference_number: marker,
      notes: `${marker} debt reduction`,
      created_by: owner.id,
      created_at: refundedAt,
    },
    {
      id: ids.paidReturn,
      organization_id: owner.organization_id,
      branch_id: owner.branch_id,
      invoice_id: ids.paidInvoice,
      customer_id: ids.customer,
      return_no: paidReturnNo,
      status: "completed",
      subtotal: 150,
      refund_amount: 150,
      refund_method: "card",
      reference_number: marker,
      notes: `${marker} paid Card refund`,
      created_by: owner.id,
      created_at: refundedAt,
    },
    {
      id: ids.foreignReturn,
      organization_id: ids.foreignOrganization,
      branch_id: ids.foreignBranch,
      invoice_id: ids.foreignInvoice,
      customer_id: ids.foreignCustomer,
      return_no: foreignReturnNo,
      status: "completed",
      subtotal: 90,
      refund_amount: 90,
      refund_method: "card",
      reference_number: marker,
      notes: `${marker} foreign`,
      created_at: refundedAt,
    },
  ]);
  await insertRows(admin, "return_items", [
    {
      id: ids.debtReturnItem,
      organization_id: owner.organization_id,
      return_id: ids.debtReturn,
      invoice_id: ids.debtInvoice,
      invoice_item_id: ids.debtItem,
      item_name: `${marker} Debt Service`,
      item_type: "service",
      quantity: 1,
      unit_price: 50,
      line_total: 50,
      restock: false,
    },
    {
      id: ids.paidReturnItem,
      organization_id: owner.organization_id,
      return_id: ids.paidReturn,
      invoice_id: ids.paidInvoice,
      invoice_item_id: ids.paidItem,
      item_name: `${marker} Paid Service`,
      item_type: "service",
      quantity: 1,
      unit_price: 150,
      line_total: 150,
      restock: false,
    },
    {
      id: ids.foreignReturnItem,
      organization_id: ids.foreignOrganization,
      return_id: ids.foreignReturn,
      invoice_id: ids.foreignInvoice,
      invoice_item_id: ids.foreignItem,
      item_name: `${marker} Foreign Service`,
      item_type: "service",
      quantity: 1,
      unit_price: 90,
      line_total: 90,
      restock: false,
    },
  ]);
  await insertRows(admin, "customer_ledger_entries", [
    {
      id: ids.debitLedger,
      organization_id: owner.organization_id,
      branch_id: owner.branch_id,
      customer_id: ids.customer,
      invoice_id: ids.debtInvoice,
      entry_type: "invoice_credit",
      direction: "debit",
      amount: 150,
      balance_after: 150,
      description: `${marker} invoice debt`,
      reference_number: debtInvoiceNo,
      created_by: owner.id,
      created_at: createdAt,
    },
    {
      id: ids.refundLedger,
      organization_id: owner.organization_id,
      branch_id: owner.branch_id,
      customer_id: ids.customer,
      invoice_id: ids.debtInvoice,
      entry_type: "refund",
      direction: "credit",
      amount: 50,
      balance_after: 100,
      description: `${marker} return debt credit`,
      reference_number: debtReturnNo,
      created_by: owner.id,
      created_at: refundedAt,
    },
    {
      id: ids.foreignLedger,
      organization_id: ids.foreignOrganization,
      branch_id: ids.foreignBranch,
      customer_id: ids.foreignCustomer,
      invoice_id: ids.foreignInvoice,
      entry_type: "invoice_credit",
      direction: "debit",
      amount: 20,
      balance_after: 20,
      description: `${marker} foreign debt`,
      reference_number: foreignInvoiceNo,
      created_at: createdAt,
    },
  ]);

  return {
    marker,
    customerId: ids.customer,
    foreignCustomerId: ids.foreignCustomer,
    debtInvoiceId: ids.debtInvoice,
    debtInvoiceNo,
    paidInvoiceId: ids.paidInvoice,
    paidInvoiceNo,
    foreignInvoiceId: ids.foreignInvoice,
    debitLedgerId: ids.debitLedger,
    debtReturnId: ids.debtReturn,
    debtReturnNo,
    paidReturnId: ids.paidReturn,
    paidReturnNo,
    foreignReturnId: ids.foreignReturn,
    cleanup: async () => {
      const customerIds = [ids.customer, ids.foreignCustomer];
      const invoiceIds = [ids.debtInvoice, ids.paidInvoice, ids.foreignInvoice];
      const returnIds = [ids.debtReturn, ids.paidReturn, ids.foreignReturn];
      const deletes = [
        ["return_items", "return_id", returnIds],
        ["returns", "id", returnIds],
        ["customer_ledger_entries", "customer_id", customerIds],
        ["payments", "invoice_id", invoiceIds],
        ["invoice_items", "invoice_id", invoiceIds],
        ["invoices", "id", invoiceIds],
        ["customers", "id", customerIds],
      ] as const;
      for (const [table, column, values] of deletes) {
        const { error } = await admin.from(table).delete().in(column, values);
        if (error)
          throw new Error(`${table} fixture cleanup failed: ${error.message}`);
      }
      const { error: branchError } = await admin
        .from("branches")
        .delete()
        .eq("id", ids.foreignBranch);
      if (branchError)
        throw new Error(
          `branch fixture cleanup failed: ${branchError.message}`,
        );
      const { error: orgError } = await admin
        .from("organizations")
        .delete()
        .eq("id", ids.foreignOrganization);
      if (orgError)
        throw new Error(
          `organization fixture cleanup failed: ${orgError.message}`,
        );
    },
  };
}

async function fixtureCounts(admin: AdminClient, fixture: Fixture) {
  const readCount = async (table: string, column: string, values: string[]) => {
    const { count, error } = await admin
      .from(table)
      .select("*", { count: "exact", head: true })
      .in(column, values);
    if (error) throw new Error(`${table} count failed: ${error.message}`);
    return count ?? 0;
  };
  return {
    customers: await readCount("customers", "id", [
      fixture.customerId,
      fixture.foreignCustomerId,
    ]),
    ledger: await readCount("customer_ledger_entries", "customer_id", [
      fixture.customerId,
      fixture.foreignCustomerId,
    ]),
    invoices: await readCount("invoices", "id", [
      fixture.debtInvoiceId,
      fixture.paidInvoiceId,
      fixture.foreignInvoiceId,
    ]),
    returns: await readCount("returns", "id", [
      fixture.debtReturnId,
      fixture.paidReturnId,
      fixture.foreignReturnId,
    ]),
  };
}

async function expectNoPageOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    )
    .toBe(true);
}

test.describe("customer ledger and return presentation", () => {
  test.skip(!isLocalPlaywrightRun(), "Loopback Supabase and app are required.");
  test.describe.configure({ retries: 0 });
  test.setTimeout(180_000);

  test("keeps debt accounting distinct while routing invoice and return references", async ({
    browser,
  }) => {
    await mkdir(ARTIFACT_ROOT, { recursive: true });
    const admin = getLocalAdminClient();
    const before = await safetySnapshot(admin);
    const fixture = await createFixture(admin);
    const label =
      process.env.CUSTOMER_LEDGER_EVIDENCE_LABEL === "baseline"
        ? "baseline"
        : "post-fix";
    const result: Record<string, unknown> = {
      label,
      marker: fixture.marker,
      fixtureCounts: await fixtureCounts(admin, fixture),
    };
    let ownerContext: Awaited<ReturnType<Browser["newContext"]>> | null = null;
    let cashierContext: Awaited<ReturnType<Browser["newContext"]>> | null =
      null;

    try {
      ownerContext = await browser.newContext({
        timezoneId: "Asia/Karachi",
        viewport: { width: 1280, height: 900 },
      });
      const page = await ownerContext.newPage();
      const ownerBrowser = browserEvidence(page);
      await loginLocalOwnerDirectly(page);
      await page.waitForLoadState("networkidle");
      await page.goto(`/customers/${fixture.customerId}?tab=ledger`);
      await page.waitForLoadState("networkidle");
      await expect(
        page.getByRole("heading", {
          name: `Customer: ${fixture.marker} Customer`,
        }),
      ).toBeVisible();

      const debtRow = page
        .locator("tbody tr")
        .filter({ hasText: `${fixture.marker} invoice debt` });
      const creditRow = page
        .locator("tbody tr")
        .filter({ hasText: `${fixture.marker} return debt credit` });
      await expect(debtRow).toContainText("PKR 150");
      await expect(debtRow).toContainText(/invoice credit/i);
      await expect(creditRow).toContainText("PKR 50");
      await expect(creditRow).toContainText("PKR 100");
      await expect(creditRow).toContainText(/refund/i);
      await expect(page.getByText(fixture.paidReturnNo)).toHaveCount(0);

      const invoiceLink = debtRow.getByRole("link", {
        name: `(${fixture.debtInvoiceNo})`,
      });
      const actualInvoiceHref = await invoiceLink.getAttribute("href");
      const expectedInvoiceHref = `/invoices/${fixture.debtInvoiceId}`;
      result.invoiceLink = {
        ledgerEntryId: fixture.debitLedgerId,
        invoiceId: fixture.debtInvoiceId,
        actual: actualInvoiceHref,
        expected: expectedInvoiceHref,
      };

      let invoiceLinkResolved = false;
      if (actualInvoiceHref) {
        const invoicePage = await ownerContext.newPage();
        const response = await invoicePage.goto(actualInvoiceHref);
        const invoiceHeading = invoicePage
          .getByRole("heading", {
            name: `Invoice ${fixture.debtInvoiceNo}`,
          });
        const headingVisible = await invoiceHeading
          .waitFor({ state: "visible", timeout: 5_000 })
          .then(() => true)
          .catch(() => false);
        result.invoiceLinkNavigation = {
          status: response?.status() ?? null,
          url: invoicePage.url(),
          headingVisible,
        };
        invoiceLinkResolved = response?.status() === 200 && headingVisible;
        await invoicePage.close();
      }
      result.invoiceLinkResolved = invoiceLinkResolved;

      const returnsTab = page.getByRole("link", {
        name: "Returns & refunds",
        exact: true,
      });
      const returnsTabCount = await returnsTab.count();
      result.returnsTabCount = returnsTabCount;
      let paidReturnVisible = false;
      let debtReturnVisible = false;
      let returnLinkResolved = false;
      let returnInvoiceLinkResolved = false;

      if (returnsTabCount === 1) {
        await returnsTab.click();
        await expect(page).toHaveURL(
          new RegExp(
            `/customers/${fixture.customerId.replaceAll("-", "\\-")}\\?tab=returns`,
          ),
        );
        await page.waitForLoadState("networkidle");
        const paidReturnLink = page.getByRole("link", {
          name: fixture.paidReturnNo,
          exact: true,
        });
        const debtReturnLink = page.getByRole("link", {
          name: fixture.debtReturnNo,
          exact: true,
        });
        paidReturnVisible = await paidReturnLink.isVisible();
        debtReturnVisible = await debtReturnLink.isVisible();
        const paidReturnRow = page
          .locator("tbody tr")
          .filter({ hasText: fixture.paidReturnNo });
        await expect(paidReturnRow).toContainText(fixture.paidInvoiceNo);
        await expect(
          paidReturnRow.getByText("PKR 150", { exact: true }),
        ).toHaveCount(2);
        await expect(paidReturnRow).toContainText(/card/i);
        await expect(paidReturnRow).toContainText(/completed/i);

        const returnHref = await paidReturnLink.getAttribute("href");
        const returnPage = await ownerContext.newPage();
        const returnResponse = await returnPage.goto(returnHref!);
        const returnHeading = returnPage
          .getByRole("heading", {
            name: `Return ${fixture.paidReturnNo}`,
          });
        const returnHeadingVisible = await returnHeading
          .waitFor({ state: "visible", timeout: 5_000 })
          .then(() => true)
          .catch(() => false);
        result.returnLinkNavigation = {
          status: returnResponse?.status() ?? null,
          url: returnPage.url(),
          headingVisible: returnHeadingVisible,
        };
        returnLinkResolved =
          returnResponse?.status() === 200 && returnHeadingVisible;
        await returnPage.close();

        const returnInvoiceLink = paidReturnRow.getByRole("link", {
          name: fixture.paidInvoiceNo,
          exact: true,
        });
        const returnInvoiceHref = await returnInvoiceLink.getAttribute("href");
        const returnInvoicePage = await ownerContext.newPage();
        const invoiceResponse = await returnInvoicePage.goto(
          returnInvoiceHref!,
        );
        const returnInvoiceHeading = returnInvoicePage
          .getByRole("heading", {
            name: `Invoice ${fixture.paidInvoiceNo}`,
          });
        const returnInvoiceHeadingVisible = await returnInvoiceHeading
          .waitFor({ state: "visible", timeout: 5_000 })
          .then(() => true)
          .catch(() => false);
        result.returnInvoiceNavigation = {
          status: invoiceResponse?.status() ?? null,
          url: returnInvoicePage.url(),
          headingVisible: returnInvoiceHeadingVisible,
        };
        returnInvoiceLinkResolved =
          invoiceResponse?.status() === 200 &&
          returnInvoiceHeadingVisible;
        await returnInvoicePage.close();
      }
      result.returnPresentation = {
        paidReturnVisible,
        debtReturnVisible,
        returnLinkResolved,
        returnInvoiceLinkResolved,
      };

      const tenantPage = await ownerContext.newPage();
      await tenantPage.goto(`/customers/${fixture.foreignCustomerId}`);
      await expect(tenantPage.getByText("404", { exact: true })).toBeVisible();
      await tenantPage.close();
      result.foreignCustomerBlocked = true;

      for (const viewport of [
        { width: 390, height: 844 },
        { width: 320, height: 568 },
      ]) {
        await page.setViewportSize(viewport);
        await page.goto(`/customers/${fixture.customerId}?tab=returns`);
        await page.waitForLoadState("networkidle");
        await expectNoPageOverflow(page);
        if (returnsTabCount === 1) {
          await expect(
            page.getByRole("link", {
              name: fixture.paidReturnNo,
              exact: true,
            }),
          ).toBeVisible();
          await expect(
            page.getByRole("link", {
              name: fixture.paidInvoiceNo,
              exact: true,
            }),
          ).toBeVisible();
        }
      }
      if (returnsTabCount === 1) {
        await page
          .getByRole("link", {
            name: fixture.paidReturnNo,
            exact: true,
          })
          .scrollIntoViewIfNeeded();
      }
      await page.screenshot({
        path: `${ARTIFACT_ROOT}/${label}-mobile.png`,
        fullPage: true,
      });

      cashierContext = await browser.newContext({
        timezoneId: "Asia/Karachi",
        viewport: { width: 390, height: 844 },
      });
      const cashierPage = await cashierContext.newPage();
      const cashierBrowser = browserEvidence(cashierPage);
      await loginLocalOwnerDirectly(cashierPage, "cashier@saledock.local");
      await cashierPage.waitForLoadState("networkidle");
      await cashierPage.goto(`/customers/${fixture.customerId}?tab=returns`);
      await cashierPage.waitForLoadState("networkidle");
      if (returnsTabCount === 1) {
        await expect(
          cashierPage.getByRole("link", {
            name: fixture.paidReturnNo,
            exact: true,
          }),
        ).toBeVisible();
      }

      const { data: ledgerRows, error: ledgerError } = await admin
        .from("customer_ledger_entries")
        .select("entry_type, direction, amount, balance_after, invoice_id")
        .eq("customer_id", fixture.customerId)
        .order("created_at", { ascending: true });
      if (ledgerError) throw new Error(ledgerError.message);
      expect(ledgerRows).toHaveLength(2);
      expect(ledgerRows).toEqual([
        {
          entry_type: "invoice_credit",
          direction: "debit",
          amount: 150,
          balance_after: 150,
          invoice_id: fixture.debtInvoiceId,
        },
        {
          entry_type: "refund",
          direction: "credit",
          amount: 50,
          balance_after: 100,
          invoice_id: fixture.debtInvoiceId,
        },
      ]);
      const { data: returnRows, error: returnError } = await admin
        .from("returns")
        .select("id, return_no, subtotal, refund_amount, refund_method, status")
        .eq("customer_id", fixture.customerId);
      if (returnError) throw new Error(returnError.message);
      expect(returnRows).toHaveLength(2);
      expect(
        returnRows?.find((row) => row.id === fixture.paidReturnId),
      ).toMatchObject({
        return_no: fixture.paidReturnNo,
        subtotal: 150,
        refund_amount: 150,
        refund_method: "card",
        status: "completed",
      });

      result.browser = { owner: ownerBrowser, cashier: cashierBrowser };
      expect(ownerBrowser.pageErrors).toEqual([]);
      expect(ownerBrowser.requestFailures).toEqual([]);
      expect(cashierBrowser.pageErrors).toEqual([]);
      expect(cashierBrowser.requestFailures).toEqual([]);
      if (label === "post-fix") {
        expect(ownerBrowser.consoleErrors).toEqual([]);
        expect(ownerBrowser.httpErrors).toEqual([]);
        expect(cashierBrowser.consoleErrors).toEqual([]);
        expect(cashierBrowser.httpErrors).toEqual([]);
      }

      expect(actualInvoiceHref).toBe(expectedInvoiceHref);
      expect(invoiceLinkResolved).toBe(true);
      expect(returnsTabCount).toBe(1);
      expect(paidReturnVisible).toBe(true);
      expect(debtReturnVisible).toBe(true);
      expect(returnLinkResolved).toBe(true);
      expect(returnInvoiceLinkResolved).toBe(true);
    } finally {
      await cashierContext?.close();
      await ownerContext?.close();
      await writeFile(
        `${ARTIFACT_ROOT}/${label}.json`,
        JSON.stringify(result, null, 2),
      );
      await fixture.cleanup();
      expect(await fixtureCounts(admin, fixture)).toEqual({
        customers: 0,
        ledger: 0,
        invoices: 0,
        returns: 0,
      });
      await expect
        .poll(async () => await safetySnapshot(admin), { timeout: 15_000 })
        .toEqual(before);
    }
  });
});
