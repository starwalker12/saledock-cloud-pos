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

const ARTIFACT_ROOT = "/tmp/saledock-repair-create-audit-durability";
const AUDIT_FAILURE =
  "The repair was saved, but its audit record could not be confirmed. Do not submit it again. Refresh the page and contact an administrator.";
const SAFETY_TABLES = [
  "repairs",
  "repair_status_history",
  "customers",
  "customer_ledger_entries",
  "credit_payments",
  "customer_write_offs",
  "invoices",
  "payments",
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
  customer_phone: string | null;
  device_type: string;
  device_model: string | null;
  serial_imei: string | null;
  accessories_received: string | null;
  problem_description: string;
  estimated_cost: number;
  advance_paid: number;
  payment_method: string;
  status: string;
  expected_delivery_at: string | null;
  notes: string | null;
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

function localDatabaseContainer(): string {
  const status = JSON.parse(
    execFileSync("supabase", ["status", "--output", "json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }),
  ) as Record<string, string>;
  const apiUrl = status.API_URL;
  if (!status.DB_URL || !apiUrl) throw new Error("Local Supabase runtime is incomplete.");
  const apiHost = new URL(apiUrl).hostname;
  if (apiHost !== "127.0.0.1" && apiHost !== "localhost" && apiHost !== "::1") {
    throw new Error("Audit failure harness requires loopback Supabase.");
  }
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

function runLocalSql(container: string, sql: string): void {
  execFileSync(
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
      "-c",
      sql,
    ],
    { stdio: "ignore" },
  );
}

function installAuditFailureHarness(container: string): void {
  runLocalSql(
    container,
    `
      create or replace function public.qa_fail_repairs_created_audit()
      returns trigger
      language plpgsql
      as $$
      begin
        if new.module = 'repairs' and new.action = 'repairs.created' then
          raise exception using errcode = 'P0001', message = 'QA forced repairs.created failure';
        end if;
        return new;
      end;
      $$;
      drop trigger if exists qa_fail_repairs_created_audit on public.audit_logs;
      create trigger qa_fail_repairs_created_audit
        before insert on public.audit_logs
        for each row execute function public.qa_fail_repairs_created_audit();
    `,
  );
}

function removeAuditFailureHarness(container: string): void {
  runLocalSql(
    container,
    `
      drop trigger if exists qa_fail_repairs_created_audit on public.audit_logs;
      drop function if exists public.qa_fail_repairs_created_audit();
    `,
  );
}

async function ownerIdentity(admin: AdminClient) {
  const status = JSON.parse(
    execFileSync("supabase", ["status", "--output", "json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }),
  ) as Record<string, string>;
  const authHost = new URL(status.API_URL).hostname;
  if (
    !status.SERVICE_ROLE_KEY ||
    (authHost !== "127.0.0.1" && authHost !== "localhost" && authHost !== "::1")
  ) {
    throw new Error("Local owner Auth lookup requires loopback Supabase.");
  }
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

function repairForm(page: Page) {
  return page.locator("form").filter({
    has: page.getByRole("button", { name: "Record Intake" }),
  });
}

async function newOwnerPage(browser: Browser) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    timezoneId: "Asia/Karachi",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  page.setDefaultNavigationTimeout(30_000);
  const errors: string[] = [];
  let actionPosts = 0;
  page.on("request", (request) => {
    if (request.method() !== "POST" || new URL(request.url()).pathname !== "/repairs") return;
    const headers = request.headers();
    if (headers["next-action"] && headers["content-type"]?.startsWith("multipart/form-data")) {
      actionPosts += 1;
    }
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
        version: "repair-create-audit-durability",
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

async function openAndFillIntake(page: Page, customerName: string, problem: string) {
  await page.goto("/repairs?add=1");
  await expect(page.getByRole("heading", { name: "New Repair Intake" })).toBeVisible({
    timeout: 30_000,
  });
  const form = repairForm(page);
  await form.locator('[name="customer_name"]').fill(customerName);
  await form.locator('[name="device_type"]').fill("Mobile");
  await form.locator('[name="problem_description"]').fill(problem);
  await form.locator('[name="estimated_cost"]').fill("0");
  await form.locator('[name="advance_paid"]').fill("0");
  await expect(form.locator('[name="customer_id"]')).toHaveValue("");
  await expect(form.locator('[name="expected_delivery_at"]')).toHaveValue("");
}

async function markerRepairs(admin: AdminClient, marker: string): Promise<RepairRow[]> {
  const { data, error } = await admin
    .from("repairs")
    .select(
      "id, organization_id, branch_id, customer_id, customer_name, customer_phone, device_type, device_model, serial_imei, accessories_received, problem_description, estimated_cost, advance_paid, payment_method, status, expected_delivery_at, notes",
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

async function repairHistories(admin: AdminClient, repairIds: string[]) {
  if (repairIds.length === 0) return [];
  const { data, error } = await admin
    .from("repair_status_history")
    .select("id, repair_id, old_status, new_status, changed_by")
    .in("repair_id", repairIds);
  if (error) throw new Error(`Repair history read failed: ${error.code}`);
  return data ?? [];
}

async function repairAudits(admin: AdminClient, repairIds: string[]) {
  if (repairIds.length === 0) return [];
  const { data, error } = await admin
    .from("audit_logs")
    .select("id, organization_id, branch_id, actor_id, module, action, details, metadata")
    .eq("module", "repairs");
  if (error) throw new Error(`Repair audit read failed: ${error.code}`);
  return (data ?? []).filter((row) => {
    const metadata =
      row.metadata && typeof row.metadata === "object"
        ? (row.metadata as Record<string, unknown>)
        : {};
    return repairIds.includes(String(metadata.repair_id ?? ""));
  });
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
  const audits = await repairAudits(admin, repairIds);
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
  if (customers.length > 0) {
    const { error } = await admin
      .from("customers")
      .delete()
      .in("id", customers.map((row) => row.id));
    if (error) throw new Error(`Customer cleanup failed: ${error.code}`);
  }
  expect(await markerRepairs(admin, marker)).toHaveLength(0);
  expect(await markerCustomers(admin, marker)).toHaveLength(0);
  expect(await repairAudits(admin, repairIds)).toHaveLength(0);
}

test.describe("repair create audit durability", () => {
  test.describe.configure({ mode: "serial", retries: 0 });
  test.skip(!isLocalPlaywrightRun(), "Requires loopback Next and local Supabase.");
  test.setTimeout(8 * 60_000);

  test("awaits successful create audit and reports deterministic audit failure truthfully", async ({
    browser,
  }) => {
    mkdirSync(ARTIFACT_ROOT, { recursive: true });
    const admin = getLocalAdminClient();
    const marker = `QA-REPAIR-AUDIT-${randomUUID().slice(0, 8)}`;
    const successName = `${marker} Success`;
    const failureName = `${marker} Failure`;
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
    };
    const errors: string[] = [];

    removeAuditFailureHarness(databaseContainer);
    expect(await markerRepairs(admin, marker)).toHaveLength(0);
    expect(await markerCustomers(admin, marker)).toHaveLength(0);
    expect(await tenantMismatchCount(admin)).toBe(0);

    try {
      const successSession = await newOwnerPage(browser);
      try {
        await openAndFillIntake(
          successSession.page,
          successName,
          `${marker} success path`,
        );
        result.submissions = Number(result.submissions) + 1;
        const responsePromise = successSession.page.waitForResponse(
          (response) => {
            const request = response.request();
            return (
              request.method() === "POST" &&
              new URL(request.url()).pathname === "/repairs" &&
              Boolean(request.headers()["next-action"])
            );
          },
          { timeout: 30_000 },
        );
        await successSession.page.getByRole("button", { name: "Record Intake" }).click();
        const actionResponse = await responsePromise;
        expect(actionResponse.status()).toBe(200);
        const successRepair = await pollFor(
          "successful repair",
          () => markerRepairs(admin, marker),
          (rows) => rows.some((row) => row.customer_name === successName),
        ).then((rows) => rows.find((row) => row.customer_name === successName)!);
        const histories = await pollFor(
          "successful repair history",
          () => repairHistories(admin, [successRepair.id]),
          (rows) => rows.length === 1,
        );
        const audits = await pollFor(
          "successful repair audit",
          () => repairAudits(admin, [successRepair.id]),
          (rows) => rows.length === 1,
        );
        expect(successSession.actionPosts()).toBe(1);
        expect(histories).toHaveLength(1);
        expect(histories[0]).toMatchObject({
          repair_id: successRepair.id,
          old_status: null,
          new_status: "received",
          changed_by: identity.id,
        });
        expect(audits).toHaveLength(1);
        expect(audits[0]).toMatchObject({
          organization_id: LOCAL_QA_ORG_ID,
          branch_id: identity.branchId,
          actor_id: identity.id,
          module: "repairs",
          action: "repairs.created",
          details: `Created repair: ${marker} Success - Mobile`,
          metadata: {
            repair_id: successRepair.id,
            customer_name: `${marker} Success`,
            device_type: "Mobile",
          },
        });
        expect(successRepair.customer_id).toBeNull();
        expect(successRepair.customer_phone).toBeNull();
        expect(successRepair.device_model).toBeNull();
        expect(successRepair.serial_imei).toBeNull();
        expect(successRepair.accessories_received).toBeNull();
        expect(successRepair.expected_delivery_at).toBeNull();
        expect(successRepair.notes).toBeNull();
        expect(Number(successRepair.estimated_cost)).toBe(0);
        expect(Number(successRepair.advance_paid)).toBe(0);
        result.actionPosts = Number(result.actionPosts) + successSession.actionPosts();
        result.success = {
          repairId: successRepair.id,
          histories: histories.length,
          audits: audits.length,
          responseStatus: actionResponse.status(),
          clientSettled: await successSession.page
            .getByRole("heading", { name: "New Repair Intake" })
            .isHidden(),
        };
        errors.push(...successSession.errors);
      } finally {
        await successSession.context.close();
      }

      installAuditFailureHarness(databaseContainer);
      const failureSession = await newOwnerPage(browser);
      try {
        await openAndFillIntake(
          failureSession.page,
          failureName,
          `${marker} failure path`,
        );
        result.submissions = Number(result.submissions) + 1;
        const responsePromise = failureSession.page.waitForResponse(
          (response) => {
            const request = response.request();
            return (
              request.method() === "POST" &&
              new URL(request.url()).pathname === "/repairs" &&
              Boolean(request.headers()["next-action"])
            );
          },
          { timeout: 30_000 },
        );
        await failureSession.page.getByRole("button", { name: "Record Intake" }).click();
        const actionResponse = await responsePromise;
        expect(actionResponse.status()).toBe(200);
        const safeError = failureSession.page.getByText(AUDIT_FAILURE, { exact: true });
        await expect(safeError).toBeVisible({ timeout: 30_000 });
        const failureRepair = await pollFor(
          "audit-failure repair",
          () => markerRepairs(admin, marker),
          (rows) => rows.some((row) => row.customer_name === failureName),
        ).then((rows) => rows.find((row) => row.customer_name === failureName)!);
        const histories = await pollFor(
          "audit-failure history",
          () => repairHistories(admin, [failureRepair.id]),
          (rows) => rows.length === 1,
        );
        const audits = await repairAudits(admin, [failureRepair.id]);
        expect(failureSession.actionPosts()).toBe(1);
        expect(histories).toHaveLength(1);
        expect(audits).toHaveLength(0);
        expect((await markerRepairs(admin, marker)).filter((row) => row.id === failureRepair.id)).toHaveLength(1);
        result.actionPosts = Number(result.actionPosts) + failureSession.actionPosts();
        result.failure = {
          repairId: failureRepair.id,
          histories: histories.length,
          audits: audits.length,
          responseStatus: actionResponse.status(),
          safeErrorReturned: true,
          clientErrorApplied: await safeError.isVisible(),
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
    expect(result.signaturesEqual).toBe(true);
    expect(await markerRepairs(admin, marker)).toHaveLength(0);
    expect(await markerCustomers(admin, marker)).toHaveLength(0);
    expect(await tenantMismatchCount(admin)).toBe(0);
  });
});
