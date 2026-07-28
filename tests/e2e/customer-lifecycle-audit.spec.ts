import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { expect, test, type Browser, type Page } from "@playwright/test";
import {
  getLocalAdminClient,
  isLocalPlaywrightRun,
  loginLocalOwnerDirectly,
} from "./helpers/local-supabase";

const ARTIFACT_ROOT = "/tmp/saledock-customer-lifecycle-audit";
const LIFECYCLE_ACTIONS = [
  "customers.created",
  "customers.updated",
  "customers.archived",
  "customers.restored",
] as const;
const SAFETY_TABLES = [
  "customers",
  "customer_ledger_entries",
  "credit_payments",
  "payments",
  "invoices",
  "invoice_items",
  "returns",
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
type LifecycleAction = (typeof LIFECYCLE_ACTIONS)[number];
type AuditRow = {
  id: string;
  organization_id: string;
  branch_id: string | null;
  actor_id: string | null;
  module: string;
  action: string;
  details: string;
  metadata: Record<string, unknown>;
  created_at: string;
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

async function captureSafetySnapshot(
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

async function pollFor<T>(
  label: string,
  read: () => Promise<T>,
  complete: (value: T) => boolean,
  timeout = 10_000,
): Promise<T> {
  const deadline = Date.now() + timeout;
  let value = await read();
  while (!complete(value) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    value = await read();
  }
  expect(complete(value), label).toBe(true);
  return value;
}

async function markerCustomers(admin: AdminClient, marker: string) {
  const { data, error } = await admin
    .from("customers")
    .select(
      "id, organization_id, branch_id, name, phone, email, address, notes, credit_limit, outstanding_balance, is_archived, archived_at",
    )
    .eq("name", `${marker} Customer`);
  if (error) throw new Error(`Customer read failed: ${error.code}`);
  return data ?? [];
}

async function customerById(admin: AdminClient, id: string) {
  const { data, error } = await admin
    .from("customers")
    .select(
      "id, organization_id, branch_id, name, phone, email, address, notes, credit_limit, outstanding_balance, is_archived, archived_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Customer read failed: ${error.code}`);
  return data;
}

async function matchingLifecycleAudits(
  admin: AdminClient,
  customerId: string,
): Promise<AuditRow[]> {
  const { data, error } = await admin
    .from("audit_logs")
    .select(
      "id, organization_id, branch_id, actor_id, module, action, details, metadata, created_at",
    )
    .eq("module", "customers")
    .in("action", [...LIFECYCLE_ACTIONS])
    .contains("metadata", { customer_id: customerId })
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Lifecycle audit read failed: ${error.code}`);
  return (data ?? []) as AuditRow[];
}

function auditsFor(rows: AuditRow[], action: LifecycleAction): AuditRow[] {
  return rows.filter((row) => row.action === action);
}

async function cleanupGeneratedRows(
  admin: AdminClient,
  marker: string,
  customerId: string | null,
): Promise<void> {
  if (customerId) {
    const { error: auditError } = await admin
      .from("audit_logs")
      .delete()
      .contains("metadata", { customer_id: customerId });
    if (auditError) throw new Error(`Audit cleanup failed: ${auditError.code}`);
    const { error: customerError } = await admin
      .from("customers")
      .delete()
      .eq("id", customerId);
    if (customerError)
      throw new Error(`Customer cleanup failed: ${customerError.code}`);
  }
  expect(await markerCustomers(admin, marker)).toHaveLength(0);
  if (customerId) {
    expect(await matchingLifecycleAudits(admin, customerId)).toHaveLength(0);
  }
}

function attachEvidence(page: Page) {
  const evidence = {
    pageErrors: [] as string[],
    consoleErrors: [] as string[],
    requestFailures: [] as string[],
    actionStatuses: [] as number[],
  };
  page.on("pageerror", (error) => evidence.pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    const sourceUrl = message.location().url;
    if (
      sourceUrl.includes("/_vercel/") ||
      text.includes("/_vercel/") ||
      text.includes("status of 406") ||
      text.includes("MIME type ('text/html')")
    ) {
      return;
    }
    evidence.consoleErrors.push(text);
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
    evidence.requestFailures.push(
      `${request.method()} ${url.pathname} ${failure}`.trim(),
    );
  });
  page.on("response", (response) => {
    if (
      response.request().method() === "POST" &&
      response.url().startsWith(process.env.PLAYWRIGHT_BASE_URL ?? "")
    ) {
      evidence.actionStatuses.push(response.status());
    }
  });
  return evidence;
}

async function newRolePage(
  browser: Browser,
  email: string,
): Promise<{
  page: Page;
  close: () => Promise<void>;
}> {
  const context = await browser.newContext({
    timezoneId: "Asia/Karachi",
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();
  await loginLocalOwnerDirectly(page, email);
  return { page, close: () => context.close() };
}

test.describe("customer lifecycle audits", () => {
  test.skip(!isLocalPlaywrightRun(), "Loopback Supabase and app are required.");
  test.setTimeout(150_000);

  test("one marker-owned lifecycle records truthful private-safe audits", async ({
    browser,
  }) => {
    const admin = getLocalAdminClient();
    const marker = `QA-CUST-${randomUUID().slice(0, 8).toUpperCase()}`;
    const phone = `0300${Date.now().toString().slice(-7)}`;
    const email = `${marker.toLowerCase()}@example.test`;
    const address = `${marker} Address`;
    const initialNotes = `${marker} Initial`;
    const updatedNotes = `${marker} Updated`;
    const before = await captureSafetySnapshot(admin);
    const { data: owner, error: ownerError } = await admin
      .from("profiles")
      .select("id, organization_id, branch_id, role")
      .eq("role", "owner")
      .eq("is_active", true)
      .limit(1)
      .single();
    if (ownerError || !owner?.organization_id) {
      throw new Error("Active local owner profile is required.");
    }

    let customerId: string | null = null;
    let ownerSession: Awaited<ReturnType<typeof newRolePage>> | null = null;
    const timeline: Array<{ stage: string; at: string }> = [];
    const evidence = {
      marker,
      actionCounts: {} as Record<string, number>,
      browser: null as ReturnType<typeof attachEvidence> | null,
      timeline,
    };

    await mkdir(ARTIFACT_ROOT, { recursive: true });
    expect(await markerCustomers(admin, marker)).toHaveLength(0);

    try {
      ownerSession = await newRolePage(browser, "owner@saledock.local");
      evidence.browser = attachEvidence(ownerSession.page);
      const page = ownerSession.page;
      await page.goto("/customers");
      await expect(
        page.getByText("Customer Management", { exact: true }),
      ).toBeVisible();

      const createDetails = page
        .locator("details")
        .filter({ hasText: "Create a new customer profile" });
      await createDetails.locator("summary").click();
      const createForm = createDetails.locator("form").first();
      await createForm.locator('[name="name"]').fill(`${marker} Customer`);
      await createForm.locator('[name="phone"]').fill(phone);
      await createForm.locator('[name="email"]').fill(email);
      await createForm.locator('[name="address"]').fill(address);
      await createForm.locator('[name="credit_limit"]').fill("500");
      await createForm.locator('[name="notes"]').fill(initialNotes);
      await createForm
        .getByRole("button", { name: "Add customer", exact: true })
        .click();
      timeline.push({
        stage: "create-submitted",
        at: new Date().toISOString(),
      });

      const createdRows = await pollFor(
        "one marker customer after create",
        () => markerCustomers(admin, marker),
        (rows) => rows.length === 1,
      );
      customerId = createdRows[0]!.id as string;
      expect(createdRows[0]).toMatchObject({
        organization_id: owner.organization_id,
        branch_id: owner.branch_id,
        credit_limit: 500,
        outstanding_balance: 0,
        is_archived: false,
      });
      let audits = await pollFor(
        "one create audit",
        () => matchingLifecycleAudits(admin, customerId!),
        (rows) => auditsFor(rows, "customers.created").length === 1,
      );
      expect(auditsFor(audits, "customers.created")[0]).toMatchObject({
        actor_id: owner.id,
        organization_id: owner.organization_id,
        branch_id: owner.branch_id,
        details: `Created customer ${customerId}`,
        metadata: { customer_id: customerId, new_status: "active" },
      });

      await page.goto(`/customers?edit=${customerId}`);
      const updateForm = page.locator("details[open] form").first();
      await updateForm.locator('[name="credit_limit"]').fill("600");
      await updateForm.locator('[name="notes"]').fill(updatedNotes);
      await updateForm
        .getByRole("button", { name: "Update customer", exact: true })
        .click();
      timeline.push({
        stage: "update-submitted",
        at: new Date().toISOString(),
      });
      const updated = await pollFor(
        "customer values after update",
        () => customerById(admin, customerId!),
        (row) =>
          row?.notes === updatedNotes && Number(row.credit_limit) === 600,
      );
      expect(updated).toMatchObject({
        name: `${marker} Customer`,
        phone,
        email,
        address,
        outstanding_balance: 0,
        is_archived: false,
      });
      audits = await pollFor(
        "one update audit",
        () => matchingLifecycleAudits(admin, customerId!),
        (rows) => auditsFor(rows, "customers.updated").length === 1,
      );
      const updateAudit = auditsFor(audits, "customers.updated")[0]!;
      expect(updateAudit).toMatchObject({
        actor_id: owner.id,
        organization_id: owner.organization_id,
        branch_id: owner.branch_id,
        details: `Updated customer ${customerId}`,
        metadata: {
          customer_id: customerId,
          changed_fields: ["notes", "credit_limit"],
        },
      });

      await page.goto(`/customers?edit=${customerId}`);
      await page
        .locator("details[open] form")
        .first()
        .getByRole("button", { name: "Update customer", exact: true })
        .click();
      await expect(
        page.getByText("Customer details updated.", { exact: true }),
      ).toBeVisible();
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(
        auditsFor(
          await matchingLifecycleAudits(admin, customerId),
          "customers.updated",
        ),
      ).toHaveLength(1);

      await page.goto(`/customers?q=${encodeURIComponent(marker)}`);
      let row = page.locator("tr").filter({ hasText: marker }).first();
      await row.getByRole("button", { name: "Archive", exact: true }).click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Confirm", exact: true })
        .click();
      timeline.push({
        stage: "archive-submitted",
        at: new Date().toISOString(),
      });
      await pollFor(
        "archived customer",
        () => customerById(admin, customerId!),
        (value) => value?.is_archived === true && Boolean(value.archived_at),
      );
      audits = await pollFor(
        "one archive audit",
        () => matchingLifecycleAudits(admin, customerId!),
        (rows) => auditsFor(rows, "customers.archived").length === 1,
      );
      expect(auditsFor(audits, "customers.archived")[0]).toMatchObject({
        actor_id: owner.id,
        organization_id: owner.organization_id,
        branch_id: owner.branch_id,
        details: `Archived customer ${customerId}`,
        metadata: {
          customer_id: customerId,
          previous_status: "active",
          new_status: "archived",
        },
      });

      await page.goto(`/customers?q=${encodeURIComponent(marker)}&inactive=1`);
      row = page.locator("tr").filter({ hasText: marker }).first();
      await expect(
        row.getByRole("button", { name: "Archive", exact: true }),
      ).toHaveCount(0);
      await row.getByRole("button", { name: "Restore", exact: true }).click();
      timeline.push({
        stage: "restore-submitted",
        at: new Date().toISOString(),
      });
      await pollFor(
        "restored customer",
        () => customerById(admin, customerId!),
        (value) => value?.is_archived === false && value.archived_at === null,
      );
      audits = await pollFor(
        "one Restore audit",
        () => matchingLifecycleAudits(admin, customerId!),
        (rows) => auditsFor(rows, "customers.restored").length === 1,
      );
      expect(auditsFor(audits, "customers.restored")[0]).toMatchObject({
        actor_id: owner.id,
        organization_id: owner.organization_id,
        branch_id: owner.branch_id,
        details: `Restored customer ${customerId}`,
        metadata: {
          customer_id: customerId,
          previous_status: "archived",
          new_status: "active",
        },
      });

      await page.goto(`/customers?q=${encodeURIComponent(marker)}&inactive=1`);
      row = page.locator("tr").filter({ hasText: marker }).first();
      await expect(
        row.getByRole("button", { name: "Restore", exact: true }),
      ).toHaveCount(0);

      for (const emailAddress of [
        "cashier@saledock.local",
        "technician@saledock.local",
      ]) {
        const denied = await newRolePage(browser, emailAddress);
        try {
          await denied.page.goto(
            `/customers?q=${encodeURIComponent(marker)}&inactive=1`,
          );
          const deniedRow = denied.page
            .locator("tr")
            .filter({ hasText: marker })
            .first();
          await expect(
            denied.page.getByText(
              /cannot edit profiles or record settlements/i,
            ),
          ).toBeVisible();
          await expect(
            deniedRow.getByRole("button", { name: /Archive|Restore/ }),
          ).toHaveCount(0);
          await expect(
            denied.page.getByRole("button", {
              name: /Add customer|Update customer/,
            }),
          ).toHaveCount(0);
        } finally {
          await denied.close();
        }
      }
      expect(await matchingLifecycleAudits(admin, customerId)).toHaveLength(4);

      await page.goto(`/customers?q=${encodeURIComponent(marker)}`);
      row = page.locator("tr").filter({ hasText: marker }).first();
      await row.getByRole("button", { name: "Archive", exact: true }).click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Confirm", exact: true })
        .click();
      await pollFor(
        "final archived customer",
        () => customerById(admin, customerId!),
        (value) => value?.is_archived === true,
      );
      audits = await pollFor(
        "second truthful archive audit",
        () => matchingLifecycleAudits(admin, customerId!),
        (rows) => auditsFor(rows, "customers.archived").length === 2,
      );

      const serializedAudits = JSON.stringify(audits);
      for (const privateValue of [
        phone,
        email,
        address,
        initialNotes,
        updatedNotes,
      ]) {
        expect(serializedAudits).not.toContain(privateValue);
      }
      expect(audits).toHaveLength(5);
      expect(new Set(audits.map((audit) => audit.id)).size).toBe(5);

      const { count: ledgerCount } = await admin
        .from("customer_ledger_entries")
        .select("*", { count: "exact", head: true })
        .eq("customer_id", customerId);
      const { count: creditPaymentCount } = await admin
        .from("credit_payments")
        .select("*", { count: "exact", head: true })
        .eq("customer_id", customerId);
      const { count: invoiceCount } = await admin
        .from("invoices")
        .select("*", { count: "exact", head: true })
        .eq("customer_id", customerId);
      expect({ ledgerCount, creditPaymentCount, invoiceCount }).toEqual({
        ledgerCount: 0,
        creditPaymentCount: 0,
        invoiceCount: 0,
      });
      expect(
        Number((await customerById(admin, customerId))!.outstanding_balance),
      ).toBe(0);

      await page.goto(`/customers?q=${encodeURIComponent(marker)}&inactive=1`);
      await page.reload();
      await expect(
        page
          .locator("tr")
          .filter({ hasText: marker })
          .first()
          .getByText("Archived", {
            exact: true,
          }),
      ).toBeVisible();
      await page.goto("/audit-log?module=customers");
      await expect(
        page.getByText("Customers → Created", { exact: true }).first(),
      ).toBeVisible();
      await expect(
        page.getByText("Customers → Updated", { exact: true }).first(),
      ).toBeVisible();
      await expect(
        page.getByText("Customers → Archived", { exact: true }).first(),
      ).toBeVisible();
      await expect(
        page.getByText("Customers → Restored", { exact: true }).first(),
      ).toBeVisible();
      const screenshotPath = `${ARTIFACT_ROOT}/customer-lifecycle-audits.png`;
      await page.screenshot({ path: screenshotPath, fullPage: true });

      evidence.actionCounts = Object.fromEntries(
        LIFECYCLE_ACTIONS.map((action) => [
          action,
          auditsFor(audits, action).length,
        ]),
      );
      await writeFile(
        `${ARTIFACT_ROOT}/result.json`,
        `${JSON.stringify(
          {
            marker,
            customerId,
            actorMatches: audits.every((audit) => audit.actor_id === owner.id),
            organizationMatches: audits.every(
              (audit) => audit.organization_id === owner.organization_id,
            ),
            branchMatches: audits.every(
              (audit) => audit.branch_id === owner.branch_id,
            ),
            actionCounts: evidence.actionCounts,
            privateValuesRetained: false,
            balance: 0,
            financialRows: 0,
            screenshotPath,
            timeline,
            browser: evidence.browser,
          },
          null,
          2,
        )}\n`,
        { mode: 0o600 },
      );
      expect(evidence.browser?.pageErrors).toEqual([]);
      expect(evidence.browser?.consoleErrors).toEqual([]);
      expect(evidence.browser?.requestFailures).toEqual([]);
      expect(evidence.browser?.actionStatuses).toHaveLength(6);
      expect(
        evidence.browser?.actionStatuses.every((status) => status === 200),
      ).toBe(true);
    } finally {
      await ownerSession?.close().catch(() => {});
      await cleanupGeneratedRows(admin, marker, customerId);
    }

    expect(await captureSafetySnapshot(admin)).toEqual(before);
  });
});
