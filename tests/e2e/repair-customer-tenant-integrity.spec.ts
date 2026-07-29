import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import {
  getLocalAdminClient,
  getLocalAuthConfig,
  isLocalPlaywrightRun,
  LOCAL_QA_ORG_ID,
  loginLocalOwnerDirectly,
} from "./helpers/local-supabase";

const ARTIFACT_ROOT = "/tmp/saledock-repair-customer-tenant-integrity-fix";
const OWNER_EMAIL = "owner@saledock.local";
const LOCAL_PASSWORD = "Password123!";
const SAFE_CUSTOMER_ERROR = "The selected customer is unavailable.";
const BASELINE_MODE = process.env.REPAIR_TENANT_BASELINE === "1";
const SAFETY_TABLES = [
  "repairs",
  "repair_status_history",
  "customers",
  "customer_ledger_entries",
  "invoices",
  "payments",
  "credit_payments",
  "customer_write_offs",
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
type Signature = { count: number; hash: string };
type SafetySnapshot = Record<string, Signature>;
type RepairRow = {
  id: string;
  organization_id: string;
  branch_id: string;
  customer_id: string | null;
  customer_name: string;
  problem_description: string;
  job_no: string;
  status: string;
};
type FixtureContext = {
  ownerId: string;
  branchAId: string;
  organizationBId: string;
  branchBId: string;
  customerAId: string;
  customerBId: string;
  foreignRepairId: string;
};

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function tableSignature(admin: AdminClient, table: string): Promise<Signature> {
  const { data, error } = await admin.from(table).select("*").order("id", { ascending: true });
  if (error) throw new Error(`Safety signature failed for ${table}: ${error.code}`);
  return { count: data?.length ?? 0, hash: digest(data ?? []) };
}

async function captureSafetySnapshot(admin: AdminClient): Promise<SafetySnapshot> {
  return Object.fromEntries(
    await Promise.all(
      SAFETY_TABLES.map(async (table) => [table, await tableSignature(admin, table)] as const),
    ),
  );
}

async function pollFor<T>(
  label: string,
  read: () => Promise<T>,
  accept: (value: T) => boolean,
  timeout = 15_000,
): Promise<T> {
  const deadline = Date.now() + timeout;
  let latest = await read();
  while (!accept(latest) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    latest = await read();
  }
  if (!accept(latest)) throw new Error(`${label} did not reach the expected state.`);
  return latest;
}

async function ownerContext(admin: AdminClient) {
  const { data, error } = await admin
    .from("profiles")
    .select("id, organization_id, branch_id, role, is_active")
    .eq("organization_id", LOCAL_QA_ORG_ID)
    .eq("role", "owner")
    .eq("is_active", true);
  if (error) throw new Error(`Owner context failed: ${error.code}`);
  const owner = (data ?? []).find((row) => row.branch_id);
  if (!owner?.id || !owner.branch_id) throw new Error("Local owner fixture is unavailable.");
  return { id: owner.id as string, branchId: owner.branch_id as string };
}

async function createFixtures(admin: AdminClient, marker: string): Promise<FixtureContext> {
  const owner = await ownerContext(admin);
  const organizationBId = randomUUID();
  const branchBId = randomUUID();
  const customerAId = randomUUID();
  const customerBId = randomUUID();
  const foreignRepairId = randomUUID();

  const { error: organizationError } = await admin.from("organizations").insert({
    id: organizationBId,
    name: `${marker} Organization B`,
    slug: `${marker.toLowerCase()}-b`,
    onboarding_completed: true,
  });
  if (organizationError) {
    throw new Error(`Organization B fixture failed: ${organizationError.code}`);
  }
  const { error: branchError } = await admin.from("branches").insert({
    id: branchBId,
    organization_id: organizationBId,
    name: `${marker} Branch B`,
  });
  if (branchError) throw new Error(`Branch B fixture failed: ${branchError.code}`);
  const { error: customerError } = await admin.from("customers").insert([
    {
      id: customerAId,
      organization_id: LOCAL_QA_ORG_ID,
      branch_id: owner.branchId,
      name: `${marker} Customer A`,
      phone: "03000000111",
    },
    {
      id: customerBId,
      organization_id: organizationBId,
      branch_id: branchBId,
      name: `${marker} Private Customer B`,
      phone: "03000000999",
    },
  ]);
  if (customerError) throw new Error(`Customer fixture failed: ${customerError.code}`);
  const { error: foreignRepairError } = await admin.from("repairs").insert({
    id: foreignRepairId,
    organization_id: organizationBId,
    branch_id: branchBId,
    customer_id: customerBId,
    job_no: `${marker}-FOREIGN`,
    customer_name: `${marker} Foreign Repair`,
    customer_phone: "03000000999",
    device_type: "Mobile",
    device_model: "Synthetic",
    serial_imei: `${marker}-FOREIGN`,
    problem_description: `${marker} Foreign repair`,
    accessories_received: "Charger",
    estimated_cost: 0,
    advance_paid: 0,
    final_cost: 0,
    payment_method: "cash",
    status: "received",
    expected_delivery_at: "2026-08-01T00:00:00.000Z",
    notes: `${marker} Private repair notes`,
  });
  if (foreignRepairError) {
    throw new Error(`Foreign repair fixture failed: ${foreignRepairError.code}`);
  }

  return {
    ownerId: owner.id,
    branchAId: owner.branchId,
    organizationBId,
    branchBId,
    customerAId,
    customerBId,
    foreignRepairId,
  };
}

async function authenticatedClient(
  email = OWNER_EMAIL,
  password = LOCAL_PASSWORD,
): Promise<SupabaseClient> {
  const { url, anonKey } = getLocalAuthConfig();
  const client = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Local authenticated client failed for ${email}.`);
  return client;
}

async function newOwnerPage(browser: Browser): Promise<{
  context: BrowserContext;
  page: Page;
  errors: string[];
}> {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    timezoneId: "Asia/Karachi",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  page.setDefaultNavigationTimeout(30_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`page:${error.name}`));
  page.on("console", (message) => {
    const location = message.location().url;
    if (/\/_vercel\/(?:insights|speed-insights)\//.test(location)) return;
    if (
      message.type() === "error" &&
      /Failed to load resource: the server responded with a status of (?:404|406)/.test(
        message.text(),
      ) &&
      /^http:\/\/(?:127\.0\.0\.1|localhost):54321\/rest\/v1\//.test(location)
    ) {
      return;
    }
    if (
      message.type() === "error" &&
      !/clarity\.ms|_vercel\/(?:insights|speed-insights)|Failed to fetch/.test(message.text())
    ) {
      errors.push(`console:${message.text()} ${location}`);
    }
  });
  await page.addInitScript(() => {
    localStorage.setItem(
      "analytics-consent",
      JSON.stringify({
        value: "rejected",
        version: "repair-customer-tenant-integrity",
        timestamp: new Date().toISOString(),
      }),
    );
  });
  await loginLocalOwnerDirectly(page);
  await expect(page.locator("header h1").first()).toHaveText("Dashboard", {
    timeout: 30_000,
  });
  return { context, page, errors };
}

function repairForm(page: Page) {
  return page.locator("form").filter({
    has: page.getByRole("button", { name: /Record Intake|Update Details/ }),
  });
}

async function openIntake(page: Page): Promise<void> {
  await page.goto("/repairs?add=1");
  await expect(page.getByRole("heading", { name: "New Repair Intake" })).toBeVisible({
    timeout: 30_000,
  });
}

async function fillCompleteRepair(
  page: Page,
  marker: string,
  customerName: string,
  problemSuffix: string,
): Promise<void> {
  const form = repairForm(page);
  await form.locator('[name="customer_name"]').fill(customerName);
  await form.locator('[name="customer_phone"]').fill("03000000111");
  await form.locator('[name="device_type"]').fill("Mobile");
  await form.locator('[name="device_model"]').fill("Synthetic Model");
  await form.locator('[name="serial_imei"]').fill(`${marker}-SERIAL`);
  await form.locator('[name="problem_description"]').fill(`${marker} ${problemSuffix}`);
  await form.locator('[name="accessories_received"]').fill("Charger");
  await form.locator('[name="estimated_cost"]').fill("0");
  await form.locator('[name="advance_paid"]').fill("0");
  await form.locator('[name="expected_delivery_at"]').fill("2026-08-01");
  await form.locator('[name="notes"]').fill(`${marker} Synthetic notes`);
}

async function selectCustomer(page: Page, customerName: string): Promise<void> {
  const search = page.getByPlaceholder("Search by name or phone...");
  await search.fill(customerName);
  await page.getByRole("button", { name: new RegExp(customerName) }).click();
  await expect(repairForm(page).locator('[name="customer_id"]')).not.toHaveValue("");
}

async function forgeCustomerId(page: Page, customerId: string): Promise<void> {
  await repairForm(page).locator('[name="customer_id"]').evaluate(
    (element, value) => {
      const input = element as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    },
    customerId,
  );
}

async function removeCustomerIdControl(page: Page): Promise<void> {
  await repairForm(page).locator('[name="customer_id"]').evaluate((element) => element.remove());
}

async function markerRepairs(admin: AdminClient, marker: string): Promise<RepairRow[]> {
  const { data, error } = await admin
    .from("repairs")
    .select(
      "id, organization_id, branch_id, customer_id, customer_name, problem_description, job_no, status",
    )
    .ilike("customer_name", `${marker}%`);
  if (error) throw new Error(`Marker repair read failed: ${error.code}`);
  return (data ?? []) as RepairRow[];
}

async function readRepair(admin: AdminClient, id: string): Promise<RepairRow | null> {
  const { data, error } = await admin
    .from("repairs")
    .select(
      "id, organization_id, branch_id, customer_id, customer_name, problem_description, job_no, status",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Repair read failed: ${error.code}`);
  return data as RepairRow | null;
}

async function repairHistories(admin: AdminClient, repairIds: string[]) {
  if (repairIds.length === 0) return [];
  const { data, error } = await admin
    .from("repair_status_history")
    .select("id, repair_id, old_status, new_status")
    .in("repair_id", repairIds);
  if (error) throw new Error(`Repair history read failed: ${error.code}`);
  return data ?? [];
}

async function repairAudits(
  admin: AdminClient,
  marker: string,
  startedAt: string,
  repairIds: string[] = [],
) {
  const { data, error } = await admin
    .from("audit_logs")
    .select("id, module, action, details, metadata, created_at")
    .eq("module", "repairs")
    .gte("created_at", startedAt);
  if (error) throw new Error(`Repair audit read failed: ${error.code}`);
  return (data ?? []).filter((row) => {
    const metadata =
      row.metadata && typeof row.metadata === "object"
        ? (row.metadata as Record<string, unknown>)
        : {};
    return (
      String(row.details ?? "").includes(marker) ||
      String(metadata.customer_name ?? "").includes(marker) ||
      repairIds.includes(String(metadata.repair_id ?? "")) ||
      repairIds.some((repairId) => String(row.details ?? "").includes(repairId))
    );
  });
}

async function markerCustomers(admin: AdminClient, marker: string) {
  const { data, error } = await admin
    .from("customers")
    .select("id, organization_id, branch_id, name, outstanding_balance")
    .ilike("name", `${marker}%`);
  if (error) throw new Error(`Marker customer read failed: ${error.code}`);
  return data ?? [];
}

async function tenantMismatchCount(admin: AdminClient): Promise<number> {
  const { data: repairs, error: repairError } = await admin
    .from("repairs")
    .select("id, organization_id, customer_id")
    .not("customer_id", "is", null);
  if (repairError) throw new Error(`Mismatch repair read failed: ${repairError.code}`);
  const customerIds = Array.from(
    new Set((repairs ?? []).map((row) => row.customer_id).filter(Boolean)),
  );
  if (customerIds.length === 0) return 0;
  const { data: customers, error: customerError } = await admin
    .from("customers")
    .select("id, organization_id")
    .in("id", customerIds);
  if (customerError) throw new Error(`Mismatch customer read failed: ${customerError.code}`);
  const customerOrganizations = new Map(
    (customers ?? []).map((row) => [row.id, row.organization_id]),
  );
  return (repairs ?? []).filter(
    (row) =>
      row.customer_id &&
      customerOrganizations.get(row.customer_id) !== row.organization_id,
  ).length;
}

async function markerWriteCounts(
  admin: AdminClient,
  marker: string,
  startedAt: string,
) {
  const repairs = await markerRepairs(admin, marker);
  return {
    repairs: repairs.length,
    histories: (await repairHistories(admin, repairs.map((row) => row.id))).length,
    audits: (await repairAudits(admin, marker, startedAt, repairs.map((row) => row.id)))
      .length,
    customers: (await markerCustomers(admin, marker)).length,
  };
}

function directRepairPayload(
  marker: string,
  suffix: string,
  branchId: string,
  customerId: string | null,
) {
  return {
    organization_id: LOCAL_QA_ORG_ID,
    branch_id: branchId,
    customer_id: customerId,
    job_no: `${marker}-${suffix}`,
    customer_name: `${marker} ${suffix}`,
    customer_phone: "03000000111",
    device_type: "Mobile",
    device_model: "Synthetic Model",
    serial_imei: `${marker}-${suffix}-SERIAL`,
    problem_description: `${marker} ${suffix} problem`,
    accessories_received: "Charger",
    estimated_cost: 0,
    advance_paid: 0,
    final_cost: 0,
    payment_method: "cash",
    status: "received",
    expected_delivery_at: "2026-08-01T00:00:00.000Z",
    notes: `${marker} ${suffix} notes`,
  };
}

async function cleanup(
  admin: AdminClient,
  marker: string,
  fixtures: FixtureContext | null,
  startedAt: string,
): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 500));
  const repairs = await markerRepairs(admin, marker);
  const repairIds = repairs.map((row) => row.id);
  const audits = await repairAudits(admin, marker, startedAt, repairIds);
  if (audits.length > 0) {
    const { error } = await admin
      .from("audit_logs")
      .delete()
      .in("id", audits.map((row) => row.id));
    if (error) throw new Error(`Audit cleanup failed: ${error.code}`);
  }
  if (repairIds.length > 0) {
    const { error: historyError } = await admin
      .from("repair_status_history")
      .delete()
      .in("repair_id", repairIds);
    if (historyError) throw new Error(`History cleanup failed: ${historyError.code}`);
    const { error: repairError } = await admin.from("repairs").delete().in("id", repairIds);
    if (repairError) throw new Error(`Repair cleanup failed: ${repairError.code}`);
  }
  const customers = await markerCustomers(admin, marker);
  const ownCustomers = customers.filter(
    (row) => row.organization_id === LOCAL_QA_ORG_ID,
  );
  if (ownCustomers.length > 0) {
    const { error } = await admin
      .from("customers")
      .delete()
      .in("id", ownCustomers.map((row) => row.id));
    if (error) throw new Error(`Customer cleanup failed: ${error.code}`);
  }
  if (fixtures) {
    const { error } = await admin
      .from("organizations")
      .delete()
      .eq("id", fixtures.organizationBId);
    if (error) throw new Error(`Organization cleanup failed: ${error.code}`);
  }
  expect(await markerRepairs(admin, marker), "generated repairs remaining").toHaveLength(0);
  expect(await markerCustomers(admin, marker), "generated customers remaining").toHaveLength(0);
  expect(await repairAudits(admin, marker, startedAt), "generated audits remaining").toHaveLength(0);
}

test.describe("repair customer tenant integrity", () => {
  test.skip(!isLocalPlaywrightRun(), "Requires loopback Next and local Supabase.");
  test.setTimeout(8 * 60_000);

  test("application and database reject foreign customer links without changing repair behavior", async ({
    browser,
  }) => {
    mkdirSync(ARTIFACT_ROOT, { recursive: true });
    const admin = getLocalAdminClient();
    const marker = `QA-REPAIR-TENANT-${randomUUID().slice(0, 8)}`;
    const startedAt = new Date().toISOString();
    const before = await captureSafetySnapshot(admin);
    const result: Record<string, unknown> = {
      marker,
      mode: BASELINE_MODE ? "baseline" : "post-fix",
      startedAt,
      actionPosts: 0,
    };
    let fixtures: FixtureContext | null = null;
    let cleanupFailures = 0;
    const sessions: Array<{ context: BrowserContext; errors: string[] }> = [];

    try {
      result.openingMismatchCount = await tenantMismatchCount(admin);
      expect(result.openingMismatchCount).toBe(0);
      fixtures = await createFixtures(admin, marker);
      const ownerDb = await authenticatedClient();

      const ownSession = await newOwnerPage(browser);
      sessions.push(ownSession);
      ownSession.page.on("request", (request) => {
        if (request.method() === "POST" && new URL(request.url()).pathname === "/repairs") {
          result.actionPosts = Number(result.actionPosts) + 1;
        }
      });

      await openIntake(ownSession.page);
      await fillCompleteRepair(
        ownSession.page,
        marker,
        `${marker} Own UI`,
        "own customer create",
      );
      await selectCustomer(ownSession.page, `${marker} Customer A`);
      await ownSession.page.getByRole("button", { name: "Record Intake" }).click();
      const ownRepair = await pollFor(
        "own-customer UI repair",
        () => markerRepairs(admin, marker),
        (rows) =>
          rows.some(
            (row) =>
              row.customer_id === fixtures?.customerAId &&
              row.problem_description === `${marker} own customer create`,
          ),
      ).then(
        (rows) =>
          rows.find(
            (row) =>
              row.customer_id === fixtures?.customerAId &&
              row.problem_description === `${marker} own customer create`,
          )!,
      );
      expect(ownRepair.customer_id).toBe(fixtures.customerAId);
      expect(ownRepair.organization_id).toBe(LOCAL_QA_ORG_ID);
      expect(await repairHistories(admin, [ownRepair.id])).toHaveLength(1);
      await pollFor(
        "own-customer repair audit",
        () => repairAudits(admin, marker, startedAt),
        (rows) => rows.some((row) => row.action === "repairs.created"),
      );
      result.ownCreate = { repairId: ownRepair.id, customerId: ownRepair.customer_id };

      await openIntake(ownSession.page);
      await fillCompleteRepair(
        ownSession.page,
        marker,
        `${marker} Foreign UI`,
        "foreign customer create",
      );
      const foreignCreateBefore = BASELINE_MODE
        ? null
        : await markerWriteCounts(admin, marker, startedAt);
      await forgeCustomerId(ownSession.page, fixtures.customerBId);
      await ownSession.page.getByRole("button", { name: "Record Intake" }).click();
      if (BASELINE_MODE) {
        const foreignUiRepair = await pollFor(
          "baseline foreign-customer UI repair",
          () => markerRepairs(admin, marker),
          (rows) => rows.some((row) => row.customer_name === `${marker} Foreign UI`),
        ).then((rows) => rows.find((row) => row.customer_name === `${marker} Foreign UI`)!);
        expect(foreignUiRepair.customer_id).toBe(fixtures.customerBId);
        result.foreignCreate = {
          accepted: true,
          repairId: foreignUiRepair.id,
          customerId: foreignUiRepair.customer_id,
        };
      } else {
        await expect(
          ownSession.page.getByText(SAFE_CUSTOMER_ERROR, { exact: true }),
        ).toBeVisible();
        expect(
          (await markerRepairs(admin, marker)).filter(
            (row) => row.customer_name === `${marker} Foreign UI`,
          ),
        ).toHaveLength(0);
        await expect(
          ownSession.page.getByText(`${marker} Private Customer B`, { exact: false }),
        ).toHaveCount(0);
        await expect(ownSession.page.getByText("03000000999", { exact: false })).toHaveCount(0);
        expect(await markerWriteCounts(admin, marker, startedAt)).toEqual(
          foreignCreateBefore,
        );
        result.foreignCreate = { accepted: false, error: SAFE_CUSTOMER_ERROR };
      }

      await openIntake(ownSession.page);
      await fillCompleteRepair(
        ownSession.page,
        marker,
        `${marker} Missing UI`,
        "missing customer create",
      );
      const missingCreateBefore = await markerWriteCounts(admin, marker, startedAt);
      await forgeCustomerId(ownSession.page, randomUUID());
      await ownSession.page.getByRole("button", { name: "Record Intake" }).click();
      if (BASELINE_MODE) {
        await expect(
          ownSession.page.getByText(
            "This can't be completed because it's still linked to other records.",
            { exact: true },
          ),
        ).toBeVisible();
      } else {
        await expect(
          ownSession.page.getByText(SAFE_CUSTOMER_ERROR, { exact: true }),
        ).toBeVisible();
      }
      expect(
        (await markerRepairs(admin, marker)).filter(
          (row) => row.customer_name === `${marker} Missing UI`,
        ),
      ).toHaveLength(0);
      expect(await markerWriteCounts(admin, marker, startedAt)).toEqual(
        missingCreateBefore,
      );
      result.missingCreate = { accepted: false };

      await ownSession.page.goto(`/repairs?edit=${ownRepair.id}`);
      await expect(
        ownSession.page.getByRole("heading", { name: new RegExp("Edit Job Details") }),
      ).toBeVisible();
      const originalProblem = ownRepair.problem_description;
      await repairForm(ownSession.page)
        .locator('[name="problem_description"]')
        .fill(`${marker} foreign edit attempt`);
      const foreignEditBefore = BASELINE_MODE
        ? null
        : await markerWriteCounts(admin, marker, startedAt);
      await forgeCustomerId(ownSession.page, fixtures.customerBId);
      await ownSession.page.getByRole("button", { name: "Update Details" }).click();
      if (BASELINE_MODE) {
        const changed = await pollFor(
          "baseline foreign-customer edit",
          () => readRepair(admin, ownRepair.id),
          (row) => row?.customer_id === fixtures?.customerBId,
        );
        expect(changed?.problem_description).toBe(`${marker} foreign edit attempt`);
        result.foreignEdit = { accepted: true };
      } else {
        await expect(
          ownSession.page.getByText(SAFE_CUSTOMER_ERROR, { exact: true }),
        ).toBeVisible();
        const unchanged = await readRepair(admin, ownRepair.id);
        expect(unchanged?.customer_id).toBe(fixtures.customerAId);
        expect(unchanged?.problem_description).toBe(originalProblem);
        expect(await markerWriteCounts(admin, marker, startedAt)).toEqual(
          foreignEditBefore,
        );
        result.foreignEdit = { accepted: false, unchanged: true };
      }

      await ownSession.page.goto(`/repairs?edit=${ownRepair.id}`);
      await expect(
        ownSession.page.getByRole("heading", { name: new RegExp("Edit Job Details") }),
      ).toBeVisible();
      await repairForm(ownSession.page)
        .locator('[name="problem_description"]')
        .fill(`${marker} own customer edit`);
      await forgeCustomerId(ownSession.page, fixtures.customerAId);
      await ownSession.page.getByRole("button", { name: "Update Details" }).click();
      const ownEdit = await pollFor(
        "same-organization customer edit",
        () => readRepair(admin, ownRepair.id),
        (row) =>
          row?.customer_id === fixtures?.customerAId &&
          row?.problem_description === `${marker} own customer edit`,
      );
      expect(ownEdit?.organization_id).toBe(LOCAL_QA_ORG_ID);
      result.ownEdit = { accepted: true, customerId: ownEdit?.customer_id };

      await ownSession.page.goto(`/repairs/${ownRepair.id}`);
      await expect(
        ownSession.page.getByRole("button", { name: "Update workflow status" }),
      ).toBeVisible();
      await ownSession.page
        .getByRole("button", { name: "Update workflow status" })
        .click();
      await ownSession.page
        .getByRole("option", { name: "In Progress (Repairing)" })
        .click();
      await ownSession.page
        .locator('input[name="diagnosis"]')
        .fill(`${marker} status regression`);
      await ownSession.page
        .locator('textarea[name="status_note"]')
        .fill(`${marker} status note`);
      await ownSession.page.getByRole("button", { name: "Log Status Change" }).click();
      await pollFor(
        "repair status lifecycle",
        () => readRepair(admin, ownRepair.id),
        (row) => row?.status === "in_progress",
      );
      expect(await repairHistories(admin, [ownRepair.id])).toHaveLength(2);
      await pollFor(
        "repair status audit",
        () => repairAudits(admin, marker, startedAt, [ownRepair.id]),
        (rows) => rows.some((row) => row.action === "repairs.status_changed"),
      );
      result.statusLifecycle = {
        status: "in_progress",
        histories: 2,
        audit: "repairs.status_changed",
      };

      const directForeignInsert = await ownerDb
        .from("repairs")
        .insert(
          directRepairPayload(
            marker,
            "DIRECT-FOREIGN",
            fixtures.branchAId,
            fixtures.customerBId,
          ),
        )
        .select("id, customer_id")
        .maybeSingle();
      if (BASELINE_MODE) {
        expect(directForeignInsert.error).toBeNull();
        expect(directForeignInsert.data?.customer_id).toBe(fixtures.customerBId);
      } else {
        expect(directForeignInsert.data).toBeNull();
        expect(directForeignInsert.error?.code).toBe("23503");
      }
      result.directForeignInsert = {
        accepted: !directForeignInsert.error,
        code: directForeignInsert.error?.code ?? null,
      };

      const { data: directOwn, error: directOwnError } = await ownerDb
        .from("repairs")
        .insert(
          directRepairPayload(
            marker,
            "DIRECT-OWN",
            fixtures.branchAId,
            fixtures.customerAId,
          ),
        )
        .select("id, customer_id")
        .single();
      expect(directOwnError).toBeNull();
      if (!directOwn) throw new Error("Same-organization direct repair insert returned no row.");
      expect(directOwn.customer_id).toBe(fixtures.customerAId);

      if (!BASELINE_MODE) {
        const incompatibleOrganizationUpdate = await admin
          .from("repairs")
          .update({ organization_id: fixtures.organizationBId })
          .eq("id", directOwn.id)
          .select("id, organization_id, customer_id")
          .maybeSingle();
        expect(incompatibleOrganizationUpdate.data).toBeNull();
        expect(incompatibleOrganizationUpdate.error?.code).toBe("23503");
        const unchangedOrganization = await readRepair(admin, directOwn.id);
        expect(unchangedOrganization?.organization_id).toBe(LOCAL_QA_ORG_ID);
        expect(unchangedOrganization?.customer_id).toBe(fixtures.customerAId);
        result.incompatibleOrganizationUpdate = {
          accepted: false,
          code: incompatibleOrganizationUpdate.error?.code ?? null,
        };
      }

      const directForeignUpdate = await ownerDb
        .from("repairs")
        .update({ customer_id: fixtures.customerBId })
        .eq("id", directOwn.id)
        .select("id, customer_id")
        .maybeSingle();
      if (BASELINE_MODE) {
        expect(directForeignUpdate.error).toBeNull();
        expect(directForeignUpdate.data?.customer_id).toBe(fixtures.customerBId);
      } else {
        expect(directForeignUpdate.data).toBeNull();
        expect(directForeignUpdate.error?.code).toBe("23503");
        expect((await readRepair(admin, directOwn.id))?.customer_id).toBe(fixtures.customerAId);
      }
      result.directForeignUpdate = {
        accepted: !directForeignUpdate.error,
        code: directForeignUpdate.error?.code ?? null,
      };

      const { data: nullRepair, error: nullError } = await ownerDb
        .from("repairs")
        .insert(
          directRepairPayload(marker, "DIRECT-NULL", fixtures.branchAId, null),
        )
        .select("id, customer_id")
        .single();
      expect(nullError).toBeNull();
      if (!nullRepair) throw new Error("Null-customer direct repair insert returned no row.");
      expect(nullRepair.customer_id).toBeNull();
      result.nullRelation = { accepted: true };

      await ownSession.page.goto(`/repairs?edit=${nullRepair.id}`);
      await expect(
        ownSession.page.getByRole("heading", { name: new RegExp("Edit Job Details") }),
      ).toBeVisible();
      const nullOriginalProblem = `${marker} DIRECT-NULL problem`;
      await repairForm(ownSession.page)
        .locator('[name="problem_description"]')
        .fill(`${marker} null-to-foreign edit`);
      const nullToForeignBefore = BASELINE_MODE
        ? null
        : await markerWriteCounts(admin, marker, startedAt);
      await forgeCustomerId(ownSession.page, fixtures.customerBId);
      await ownSession.page.getByRole("button", { name: "Update Details" }).click();
      if (BASELINE_MODE) {
        const changed = await pollFor(
          "baseline null-to-foreign edit",
          () => readRepair(admin, nullRepair.id),
          (row) => row?.customer_id === fixtures?.customerBId,
        );
        expect(changed?.problem_description).toBe(`${marker} null-to-foreign edit`);
        result.nullToForeignEdit = { accepted: true };
      } else {
        await expect(
          ownSession.page.getByText(SAFE_CUSTOMER_ERROR, { exact: true }),
        ).toBeVisible();
        const unchanged = await readRepair(admin, nullRepair.id);
        expect(unchanged?.customer_id).toBeNull();
        expect(unchanged?.problem_description).toBe(nullOriginalProblem);
        expect(await markerWriteCounts(admin, marker, startedAt)).toEqual(
          nullToForeignBefore,
        );
        result.nullToForeignEdit = { accepted: false, unchanged: true };
      }

      const foreignVisibility = await ownerDb
        .from("repairs")
        .select("id")
        .eq("id", fixtures.foreignRepairId);
      expect(foreignVisibility.error).toBeNull();
      expect(foreignVisibility.data).toHaveLength(0);
      const foreignMutation = await ownerDb
        .from("repairs")
        .update({ notes: `${marker} forbidden` })
        .eq("id", fixtures.foreignRepairId)
        .select("id");
      expect(foreignMutation.error).toBeNull();
      expect(foreignMutation.data).toHaveLength(0);
      result.foreignRepairAccess = { visible: false, mutable: false };

      await openIntake(ownSession.page);
      await fillCompleteRepair(
        ownSession.page,
        marker,
        `${marker} Quick Customer`,
        "quick customer create",
      );
      await repairForm(ownSession.page)
        .locator('[name="create_customer_account"]')
        .check();
      await removeCustomerIdControl(ownSession.page);
      await ownSession.page.getByRole("button", { name: "Record Intake" }).click();
      const quickCustomer = await pollFor(
        "quick customer",
        () => markerCustomers(admin, marker),
        (rows) => rows.some((row) => row.name === `${marker} Quick Customer`),
      ).then((rows) => rows.find((row) => row.name === `${marker} Quick Customer`)!);
      const quickRepair = await pollFor(
        "quick-customer repair",
        () => markerRepairs(admin, marker),
        (rows) => rows.some((row) => row.customer_name === `${marker} Quick Customer`),
      ).then((rows) => rows.find((row) => row.customer_name === `${marker} Quick Customer`)!);
      expect(quickCustomer.organization_id).toBe(LOCAL_QA_ORG_ID);
      expect(quickRepair.customer_id).toBe(quickCustomer.id);
      expect(Number(quickCustomer.outstanding_balance)).toBe(0);
      result.quickCustomer = { customerId: quickCustomer.id, repairId: quickRepair.id };

      if (!BASELINE_MODE) {
        const roleEmails = [
          "owner@saledock.local",
          "admin@saledock.local",
          "manager@saledock.local",
          "cashier@saledock.local",
          "technician@saledock.local",
        ];
        const roleResults: Array<{ email: string; code: string | null }> = [];
        for (const [index, email] of roleEmails.entries()) {
          const roleClient = await authenticatedClient(email);
          const attempt = await roleClient
            .from("repairs")
            .insert(
              directRepairPayload(
                marker,
                `ROLE-${index}`,
                fixtures.branchAId,
                fixtures.customerBId,
              ),
            );
          expect(attempt.error?.code, `${email} foreign-link rejection`).toBe("23503");
          roleResults.push({ email, code: attempt.error?.code ?? null });
          await roleClient.auth.signOut();
        }
        result.permissionMatrix = roleResults;
      }

      const { data: deleteProbe, error: deleteProbeError } = await ownerDb
        .from("repairs")
        .insert(
          directRepairPayload(
            marker,
            "DELETE-PROBE",
            fixtures.branchAId,
            fixtures.customerAId,
          ),
        )
        .select("id, customer_id")
        .single();
      expect(deleteProbeError).toBeNull();
      if (!deleteProbe) throw new Error("Customer-deletion probe returned no repair row.");
      const { error: deleteCustomerError } = await admin
        .from("customers")
        .delete()
        .eq("id", fixtures.customerAId);
      expect(deleteCustomerError).toBeNull();
      expect((await readRepair(admin, deleteProbe.id))?.customer_id).toBeNull();
      result.customerDeletion = { customerIdSetNull: true };

      const allRepairs = await markerRepairs(admin, marker);
      const repairIds = allRepairs.map((row) => row.id);
      const histories = await repairHistories(admin, repairIds);
      const audits = await repairAudits(admin, marker, startedAt, repairIds);
      result.finalMarkerCounts = {
        repairs: allRepairs.length,
        histories: histories.length,
        audits: audits.length,
        customers: (await markerCustomers(admin, marker)).length,
      };
      result.markerMismatchCount = await tenantMismatchCount(admin);
      if (BASELINE_MODE) {
        expect(Number(result.markerMismatchCount)).toBeGreaterThan(0);
      } else {
        expect(result.markerMismatchCount).toBe(0);
      }
      result.browserErrors = sessions.flatMap((session) => session.errors);
      expect(result.browserErrors).toEqual([]);
      await ownerDb.auth.signOut();
    } finally {
      for (const session of sessions) await session.context.close();
      try {
        await cleanup(admin, marker, fixtures, startedAt);
      } catch (error) {
        cleanupFailures += 1;
        throw error;
      } finally {
        result.cleanupFailures = cleanupFailures;
        result.completedAt = new Date().toISOString();
        writeFileSync(
          `${ARTIFACT_ROOT}/${BASELINE_MODE ? "baseline" : "post-fix"}.json`,
          JSON.stringify(result, null, 2),
        );
      }
    }

    const after = await captureSafetySnapshot(admin);
    expect(after, "complete before/after safety signatures").toEqual(before);
  });
});
