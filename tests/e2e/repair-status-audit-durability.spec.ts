import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import {
  getLocalAdminClient,
  isLocalPlaywrightRun,
  LOCAL_QA_ORG_ID,
  loginLocalOwnerDirectly,
} from "./helpers/local-supabase";

const ARTIFACT_ROOT = "/tmp/saledock-repair-status-audit-durability";
const AUDIT_FAILURE =
  "The status was updated, but its audit record could not be confirmed. Do not submit it again. Refresh the page and contact an administrator.";
const SAFETY_TABLES = [
  "repairs",
  "repair_status_history",
  "audit_logs",
  "customers",
  "customer_ledger_entries",
  "credit_payments",
  "customer_write_offs",
  "invoices",
  "payments",
  "returns",
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
type OwnerIdentity = { id: string; branchId: string };
type RepairRow = {
  id: string;
  organization_id: string;
  branch_id: string;
  job_no: string;
  customer_name: string;
  customer_id: string | null;
  estimated_cost: number;
  advance_paid: number;
  final_cost: number;
  payment_method: string;
  status: string;
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

function localRuntime(): Record<string, string> {
  const status = JSON.parse(
    execFileSync("supabase", ["status", "--output", "json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }),
  ) as Record<string, string>;
  if (!status.DB_URL || !status.API_URL || !status.SERVICE_ROLE_KEY) {
    throw new Error("Local Supabase runtime is incomplete.");
  }
  const host = new URL(status.API_URL).hostname;
  if (host !== "127.0.0.1" && host !== "localhost" && host !== "::1") {
    throw new Error("Status audit E2E requires loopback Supabase.");
  }
  return status;
}

function localDatabaseContainer(): string {
  localRuntime();
  const containers = execFileSync("docker", ["ps", "--format", "{{.Names}}"], {
    encoding: "utf8",
  })
    .split("\n")
    .filter((name) => name.startsWith("supabase_db_"));
  if (containers.length !== 1) {
    throw new Error("Expected exactly one running local Supabase database container.");
  }
  return containers[0];
}

function runLocalSql(container: string, sql: string, returnOutput = false): string {
  return execFileSync(
    "docker",
    [
      "exec",
      container,
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-X",
      "-v",
      "ON_ERROR_STOP=1",
      "-q",
      ...(returnOutput ? ["-tA"] : []),
      "-c",
      sql,
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  );
}

function installAuditFailureHarness(container: string, repairId: string): void {
  runLocalSql(
    container,
    `
      create or replace function public.qa_fail_repairs_status_audit()
      returns trigger
      language plpgsql
      as $$
      begin
        if new.module = 'repairs'
          and new.action = 'repairs.status_changed'
          and new.metadata ->> 'repair_id' = '${repairId}' then
          raise exception using errcode = 'P0001', message = 'QA forced repairs.status_changed failure';
        end if;
        return new;
      end;
      $$;
      drop trigger if exists qa_fail_repairs_status_audit on public.audit_logs;
      create trigger qa_fail_repairs_status_audit
        before insert on public.audit_logs
        for each row execute function public.qa_fail_repairs_status_audit();
    `,
  );
}

function removeAuditFailureHarness(container: string): void {
  runLocalSql(
    container,
    `
      drop trigger if exists qa_fail_repairs_status_audit on public.audit_logs;
      drop function if exists public.qa_fail_repairs_status_audit();
    `,
  );
}

function auditFailureHarnessCount(container: string): number {
  const output = runLocalSql(
    container,
    `
      select
        (select count(*) from pg_trigger where tgname = 'qa_fail_repairs_status_audit' and not tgisinternal)
        +
        (select count(*) from pg_proc where proname = 'qa_fail_repairs_status_audit');
    `,
    true,
  );
  return Number(output.trim());
}

async function ownerIdentity(admin: AdminClient): Promise<OwnerIdentity> {
  const status = localRuntime();
  const authAdmin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  const { data: listed, error: listError } = await authAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (listError) throw new Error("Local owner Auth lookup failed.");
  const owner = listed.users.find((user) => user.email === "owner@saledock.local");
  if (!owner) throw new Error("Local owner Auth user is unavailable.");
  const { data, error } = await admin
    .from("profiles")
    .select("id, branch_id")
    .eq("id", owner.id)
    .eq("organization_id", LOCAL_QA_ORG_ID)
    .not("branch_id", "is", null)
    .maybeSingle();
  if (error || !data?.id || !data.branch_id) throw new Error("Local owner identity is unavailable.");
  return { id: data.id as string, branchId: data.branch_id as string };
}

async function seedRepair(
  admin: AdminClient,
  marker: string,
  suffix: string,
  identity: OwnerIdentity,
): Promise<RepairRow> {
  const { data, error } = await admin
    .from("repairs")
    .insert({
      organization_id: LOCAL_QA_ORG_ID,
      branch_id: identity.branchId,
      customer_id: null,
      job_no: `QA-${randomUUID().slice(0, 8).toUpperCase()}`,
      customer_name: `${marker} ${suffix}`,
      customer_phone: null,
      device_type: "Mobile",
      device_model: null,
      serial_imei: null,
      problem_description: `${marker} nonfinancial status audit`,
      accessories_received: null,
      estimated_cost: 0,
      advance_paid: 0,
      final_cost: 0,
      payment_method: "cash",
      status: "received",
      expected_delivery_at: null,
      notes: null,
      created_by: identity.id,
    })
    .select(
      "id, organization_id, branch_id, job_no, customer_name, customer_id, estimated_cost, advance_paid, final_cost, payment_method, status",
    )
    .single();
  if (error || !data) throw new Error(`Repair seed failed: ${error?.code ?? "no-row"}`);
  return data as RepairRow;
}

async function readRepair(admin: AdminClient, repairId: string): Promise<RepairRow | null> {
  const { data, error } = await admin
    .from("repairs")
    .select(
      "id, organization_id, branch_id, job_no, customer_name, customer_id, estimated_cost, advance_paid, final_cost, payment_method, status",
    )
    .eq("id", repairId)
    .maybeSingle();
  if (error) throw new Error(`Repair read failed: ${error.code}`);
  return data as RepairRow | null;
}

async function statusHistories(admin: AdminClient, repairId: string) {
  const { data, error } = await admin
    .from("repair_status_history")
    .select("id, organization_id, repair_id, old_status, new_status, note, changed_by")
    .eq("repair_id", repairId)
    .eq("old_status", "received")
    .eq("new_status", "in_progress");
  if (error) throw new Error(`Repair history read failed: ${error.code}`);
  return data ?? [];
}

async function statusAudits(admin: AdminClient, repairId: string) {
  const { data, error } = await admin
    .from("audit_logs")
    .select("id, organization_id, branch_id, actor_id, module, action, details, metadata")
    .eq("module", "repairs")
    .eq("action", "repairs.status_changed");
  if (error) throw new Error(`Repair audit read failed: ${error.code}`);
  return (data ?? []).filter((row) => {
    const metadata =
      row.metadata && typeof row.metadata === "object"
        ? (row.metadata as Record<string, unknown>)
        : {};
    return metadata.repair_id === repairId;
  });
}

async function markerRepairs(admin: AdminClient, marker: string): Promise<RepairRow[]> {
  const { data, error } = await admin
    .from("repairs")
    .select(
      "id, organization_id, branch_id, job_no, customer_name, customer_id, estimated_cost, advance_paid, final_cost, payment_method, status",
    )
    .ilike("customer_name", `${marker}%`);
  if (error) throw new Error(`Marker repair read failed: ${error.code}`);
  return (data ?? []) as RepairRow[];
}

async function markerCustomers(admin: AdminClient, marker: string) {
  const { data, error } = await admin
    .from("customers")
    .select("id")
    .ilike("name", `${marker}%`);
  if (error) throw new Error(`Marker customer read failed: ${error.code}`);
  return data ?? [];
}

async function tenantMismatchCount(admin: AdminClient): Promise<number> {
  const { data: repairs, error: repairError } = await admin
    .from("repairs")
    .select("organization_id, customer_id")
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
    (row) => row.customer_id && customerOrganizations.get(row.customer_id) !== row.organization_id,
  ).length;
}

async function cleanup(admin: AdminClient, marker: string): Promise<void> {
  const repairs = await markerRepairs(admin, marker);
  const repairIds = repairs.map((row) => row.id);
  for (const repairId of repairIds) {
    const audits = await statusAudits(admin, repairId);
    if (audits.length > 0) {
      const { error } = await admin
        .from("audit_logs")
        .delete()
        .in("id", audits.map((row) => row.id));
      if (error) throw new Error(`Audit cleanup failed: ${error.code}`);
    }
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
  expect(await markerRepairs(admin, marker)).toHaveLength(0);
  expect(await markerCustomers(admin, marker)).toHaveLength(0);
}

function statusForm(page: Page) {
  return page.locator("form").filter({
    has: page.getByRole("button", { name: "Log Status Change" }),
  });
}

async function newOwnerPage(browser: Browser, viewport: { width: number; height: number }) {
  const context = await browser.newContext({ viewport, timezoneId: "Asia/Karachi" });
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  page.setDefaultNavigationTimeout(30_000);
  const errors: string[] = [];
  let actionPosts = 0;
  page.on("request", (request) => {
    if (request.method() !== "POST" || !new URL(request.url()).pathname.startsWith("/repairs/")) {
      return;
    }
    if (request.headers()["next-action"]) actionPosts += 1;
  });
  page.on("pageerror", (error) => errors.push(`page:${error.name}`));
  page.on("requestfailed", (request) => {
    const url = request.url();
    const failure = request.failure()?.errorText ?? "unknown";
    if (/clarity\.ms|\/_vercel\/(?:insights|speed-insights)\//.test(url)) return;
    if (failure === "net::ERR_ABORTED") return;
    errors.push(`request:${request.method()} ${new URL(url).pathname}:${failure}`);
  });
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    const url = message.location().url;
    if (/clarity\.ms|\/_vercel\/(?:insights|speed-insights)\//.test(`${url} ${text}`)) return;
    if (
      /Failed to load resource: the server responded with a status of (?:400|404|406)/.test(text) &&
      /^http:\/\/(?:127\.0\.0\.1|localhost):54321\/rest\/v1\//.test(url)
    ) {
      return;
    }
    errors.push(`console:${text}`);
  });
  await page.addInitScript(() => {
    localStorage.setItem(
      "analytics-consent",
      JSON.stringify({
        value: "rejected",
        version: "repair-status-audit-durability",
        timestamp: new Date().toISOString(),
      }),
    );
  });
  await loginLocalOwnerDirectly(page);
  await expect(page.locator("header h1").first()).toHaveText("Dashboard", {
    timeout: 30_000,
  });
  return { context, page, errors, actionPosts: () => actionPosts };
}

async function selectInProgressAndSubmit(page: Page, repairId: string, note: string) {
  await page.goto(`/repairs/${repairId}`);
  await expect(page.getByRole("button", { name: "Log Status Change" })).toBeVisible({
    timeout: 30_000,
  });
  const form = statusForm(page);
  await expect(form.locator('[name="id"]')).toHaveValue(repairId);
  await expect(form.locator('[name="old_status"]')).toHaveValue("received");
  await form.getByRole("button", { name: "Update workflow status" }).click();
  await page.getByRole("option", { name: "In Progress (Repairing)" }).click();
  await expect(form.locator('[name="status"]')).toHaveValue("in_progress");
  await form.locator('[name="status_note"]').fill(note);
  const responsePromise = page.waitForResponse(
    (response) => {
      const request = response.request();
      return (
        request.method() === "POST" &&
        new URL(request.url()).pathname === `/repairs/${repairId}` &&
        Boolean(request.headers()["next-action"])
      );
    },
    { timeout: 30_000 },
  );
  await form.getByRole("button", { name: "Log Status Change" }).click();
  return responsePromise;
}

async function expectNoHorizontalOverflow(page: Page) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true);
}

test.describe("repair status audit durability", () => {
  test.describe.configure({ mode: "serial", retries: 0 });
  test.skip(!isLocalPlaywrightRun(), "Requires loopback Next and local Supabase.");
  test.setTimeout(8 * 60_000);

  test("awaits successful status audit and reports deterministic audit failure truthfully", async ({
    browser,
  }) => {
    mkdirSync(`${ARTIFACT_ROOT}/screenshots`, { recursive: true });
    const admin = getLocalAdminClient();
    const marker = `QA-REPAIR-STATUS-AUDIT-${randomUUID().slice(0, 8).toUpperCase()}`;
    const before = await captureSafetySnapshot(admin);
    const identity = await ownerIdentity(admin);
    const databaseContainer = localDatabaseContainer();
    const result: Record<string, unknown> = {
      marker,
      submissions: 0,
      actionPosts: 0,
      cleanupRetries: 0,
      cleanupFailures: 0,
      triggerRemoved: false,
      browserTimezone: "Asia/Karachi",
    };
    const errors: string[] = [];

    removeAuditFailureHarness(databaseContainer);
    expect(auditFailureHarnessCount(databaseContainer)).toBe(0);
    expect(await markerRepairs(admin, marker)).toHaveLength(0);
    expect(await markerCustomers(admin, marker)).toHaveLength(0);
    expect(await tenantMismatchCount(admin)).toBe(0);

    try {
      const successRepair = await seedRepair(admin, marker, "Success", identity);
      const successNote = `${marker} successful transition`;
      const successSession = await newOwnerPage(browser, { width: 390, height: 844 });
      try {
        result.submissions = Number(result.submissions) + 1;
        const responsePromise = await selectInProgressAndSubmit(
          successSession.page,
          successRepair.id,
          successNote,
        );
        const actionResponse = await responsePromise;
        expect(actionResponse.status()).toBe(200);
        await expect(
          successSession.page.getByText("Status updated successfully.", { exact: true }),
        ).toBeVisible({ timeout: 30_000 });
        const persisted = await pollFor(
          "successful status update",
          () => readRepair(admin, successRepair.id),
          (row) => row?.status === "in_progress",
        );
        const histories = await pollFor(
          "successful status history",
          () => statusHistories(admin, successRepair.id),
          (rows) => rows.length === 1,
        );
        const audits = await pollFor(
          "successful status audit",
          () => statusAudits(admin, successRepair.id),
          (rows) => rows.length === 1,
        );
        expect(successSession.actionPosts()).toBe(1);
        expect(histories).toHaveLength(1);
        expect(histories[0]).toMatchObject({
          organization_id: LOCAL_QA_ORG_ID,
          repair_id: successRepair.id,
          old_status: "received",
          new_status: "in_progress",
          note: successNote,
          changed_by: identity.id,
        });
        expect(audits).toHaveLength(1);
        expect(audits[0]).toMatchObject({
          organization_id: LOCAL_QA_ORG_ID,
          branch_id: identity.branchId,
          actor_id: identity.id,
          module: "repairs",
          action: "repairs.status_changed",
          details: `Repair ${successRepair.id} status: received → in_progress`,
          metadata: {
            repair_id: successRepair.id,
            old_status: "received",
            new_status: "in_progress",
          },
        });
        expect(Number(persisted?.estimated_cost)).toBe(0);
        expect(Number(persisted?.final_cost)).toBe(0);
        expect(Number(persisted?.advance_paid)).toBe(0);
        expect(persisted?.customer_id).toBeNull();
        await expectNoHorizontalOverflow(successSession.page);
        await successSession.page.screenshot({
          path: `${ARTIFACT_ROOT}/screenshots/success-390x844.png`,
          fullPage: true,
        });
        result.actionPosts = Number(result.actionPosts) + successSession.actionPosts();
        result.success = {
          repairId: successRepair.id,
          status: persisted?.status,
          histories: histories.length,
          audits: audits.length,
          responseStatus: actionResponse.status(),
          mobile: "390x844",
        };
        errors.push(...successSession.errors);
      } finally {
        await successSession.context.close();
      }

      const failureRepair = await seedRepair(admin, marker, "Failure", identity);
      installAuditFailureHarness(databaseContainer, failureRepair.id);
      expect(auditFailureHarnessCount(databaseContainer)).toBe(2);
      const failureNote = `${marker} forced audit failure`;
      const failureSession = await newOwnerPage(browser, { width: 320, height: 568 });
      try {
        result.submissions = Number(result.submissions) + 1;
        const responsePromise = await selectInProgressAndSubmit(
          failureSession.page,
          failureRepair.id,
          failureNote,
        );
        const actionResponse = await responsePromise;
        expect(actionResponse.status()).toBe(200);
        const safeError = failureSession.page.getByText(AUDIT_FAILURE, { exact: true });
        await expect(safeError).toBeVisible({ timeout: 30_000 });
        const persisted = await pollFor(
          "audit-failure status update",
          () => readRepair(admin, failureRepair.id),
          (row) => row?.status === "in_progress",
        );
        const histories = await pollFor(
          "audit-failure status history",
          () => statusHistories(admin, failureRepair.id),
          (rows) => rows.length === 1,
        );
        const audits = await statusAudits(admin, failureRepair.id);
        expect(failureSession.actionPosts()).toBe(1);
        expect(histories).toHaveLength(1);
        expect(histories[0]).toMatchObject({
          repair_id: failureRepair.id,
          old_status: "received",
          new_status: "in_progress",
          note: failureNote,
          changed_by: identity.id,
        });
        expect(audits).toHaveLength(0);
        expect((await markerRepairs(admin, marker)).filter((row) => row.id === failureRepair.id)).toHaveLength(1);
        expect(Number(persisted?.estimated_cost)).toBe(0);
        expect(Number(persisted?.final_cost)).toBe(0);
        expect(Number(persisted?.advance_paid)).toBe(0);
        expect(persisted?.customer_id).toBeNull();
        await expectNoHorizontalOverflow(failureSession.page);
        await failureSession.page.screenshot({
          path: `${ARTIFACT_ROOT}/screenshots/failure-320x568.png`,
          fullPage: true,
        });
        result.actionPosts = Number(result.actionPosts) + failureSession.actionPosts();
        result.failure = {
          repairId: failureRepair.id,
          status: persisted?.status,
          histories: histories.length,
          audits: audits.length,
          responseStatus: actionResponse.status(),
          safeErrorRendered: await safeError.isVisible(),
          mobile: "320x568",
        };
        errors.push(...failureSession.errors);
      } finally {
        await failureSession.context.close();
        removeAuditFailureHarness(databaseContainer);
        result.triggerRemoved = true;
      }

      expect(await markerRepairs(admin, marker)).toHaveLength(2);
      expect(await markerCustomers(admin, marker)).toHaveLength(0);
      expect(await tenantMismatchCount(admin)).toBe(0);
      expect(result.submissions).toBe(2);
      expect(result.actionPosts).toBe(2);
      expect(errors).toEqual([]);
      result.tenantMismatches = 0;
      result.errors = errors;
    } finally {
      try {
        removeAuditFailureHarness(databaseContainer);
        result.triggerRemoved = true;
        await cleanup(admin, marker);
      } catch (error) {
        result.cleanupFailures = 1;
        result.cleanupError = error instanceof Error ? error.message : "unknown cleanup error";
      }
      result.temporaryHarnessObjects = auditFailureHarnessCount(databaseContainer);
      result.after = await captureSafetySnapshot(admin);
      result.signaturesEqual = JSON.stringify(result.after) === JSON.stringify(before);
      writeFileSync(
        `${ARTIFACT_ROOT}/results.json`,
        JSON.stringify(result, null, 2) + "\n",
        "utf8",
      );
    }

    expect(result.cleanupFailures).toBe(0);
    expect(result.triggerRemoved).toBe(true);
    expect(result.temporaryHarnessObjects).toBe(0);
    expect(result.signaturesEqual).toBe(true);
    expect(await markerRepairs(admin, marker)).toHaveLength(0);
    expect(await markerCustomers(admin, marker)).toHaveLength(0);
    expect(await tenantMismatchCount(admin)).toBe(0);
  });
});
