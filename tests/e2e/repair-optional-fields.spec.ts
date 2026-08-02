import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { repairSchema } from "../../src/lib/validation/repairs";
import {
  getLocalAdminClient,
  isLocalPlaywrightRun,
  LOCAL_QA_ORG_ID,
  loginLocalOwnerDirectly,
} from "./helpers/local-supabase";

const ARTIFACT_ROOT = "/tmp/saledock-repair-optional-fields-current-fix";
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
  problem_description: string;
  accessories_received: string | null;
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

async function ownerBranch(admin: AdminClient): Promise<string> {
  const { data, error } = await admin
    .from("profiles")
    .select("branch_id")
    .eq("organization_id", LOCAL_QA_ORG_ID)
    .eq("role", "owner")
    .eq("is_active", true)
    .not("branch_id", "is", null)
    .limit(1)
    .maybeSingle();
  if (error || !data?.branch_id) throw new Error("Local owner branch is unavailable.");
  return data.branch_id as string;
}

function repairForm(page: Page) {
  return page.locator("form").filter({
    has: page.getByRole("button", { name: /Record Intake|Update Details/ }),
  });
}

async function newOwnerPage(
  browser: Browser,
  viewport = { width: 1440, height: 900 },
) {
  const context = await browser.newContext({ viewport, timezoneId: "Asia/Karachi" });
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  page.setDefaultNavigationTimeout(30_000);
  const errors: string[] = [];
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
      /Failed to load resource: the server responded with a status of (?:404|406)/.test(text) &&
      /^http:\/\/(?:127\.0\.0\.1|localhost):54321\/rest\/v1\//.test(url)
    ) {
      return;
    }
    errors.push(`console:${text}`);
  });
  page.on("dialog", (dialog) => {
    errors.push(`dialog:${dialog.type()}`);
    void dialog.dismiss();
  });
  await page.addInitScript(() => {
    localStorage.setItem(
      "analytics-consent",
      JSON.stringify({
        value: "rejected",
        version: "repair-optional-fields-current",
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

async function openIntake(page: Page): Promise<void> {
  await page.goto("/repairs?add=1");
  await expect(page.getByRole("heading", { name: "New Repair Intake" })).toBeVisible({
    timeout: 30_000,
  });
}

async function fillRequiredRepair(
  page: Page,
  customerName: string,
  problemDescription: string,
): Promise<void> {
  const form = repairForm(page);
  await form.locator('[name="customer_name"]').fill(customerName);
  await form.locator('[name="device_type"]').fill("Mobile");
  await form.locator('[name="problem_description"]').fill(problemDescription);
  await form.locator('[name="estimated_cost"]').fill("0");
  await form.locator('[name="advance_paid"]').fill("0");
}

async function markerRepairs(admin: AdminClient, marker: string): Promise<RepairRow[]> {
  const { data, error } = await admin
    .from("repairs")
    .select(
      "id, organization_id, branch_id, customer_id, customer_name, customer_phone, device_type, device_model, serial_imei, problem_description, accessories_received, estimated_cost, advance_paid, payment_method, status, expected_delivery_at, notes",
    )
    .ilike("customer_name", `${marker}%`);
  if (error) throw new Error(`Marker repair read failed: ${error.code}`);
  return (data ?? []) as RepairRow[];
}

async function markerCustomers(admin: AdminClient, marker: string) {
  const { data, error } = await admin
    .from("customers")
    .select("id, organization_id, branch_id, name, outstanding_balance")
    .ilike("name", `${marker}%`);
  if (error) throw new Error(`Marker customer read failed: ${error.code}`);
  return data ?? [];
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
      repairIds.includes(String(metadata.repair_id ?? ""))
    );
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
    (row) =>
      row.customer_id && customerOrganizations.get(row.customer_id) !== row.organization_id,
  ).length;
}

async function assertBlankOptionalPersistence(row: RepairRow): Promise<void> {
  expect(row.customer_phone).toBeNull();
  expect(row.device_model).toBeNull();
  expect(row.serial_imei).toBeNull();
  expect(row.accessories_received).toBeNull();
  expect(row.expected_delivery_at).toBeNull();
  expect(row.notes).toBeNull();
  expect(Number(row.estimated_cost)).toBe(0);
  expect(Number(row.advance_paid)).toBe(0);
  expect(row.payment_method).toBe("cash");
  expect(row.status).toBe("received");
}

async function cleanup(
  admin: AdminClient,
  marker: string,
  startedAt: string,
): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 300));
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
  if (customers.length > 0) {
    const { error } = await admin
      .from("customers")
      .delete()
      .in("id", customers.map((row) => row.id));
    if (error) throw new Error(`Customer cleanup failed: ${error.code}`);
  }
  expect(await markerRepairs(admin, marker), "generated repairs remaining").toHaveLength(0);
  expect(await markerCustomers(admin, marker), "generated customers remaining").toHaveLength(0);
  expect(await repairAudits(admin, marker, startedAt), "generated audits remaining").toHaveLength(0);
}

test.describe("repair optional fields", () => {
  test.describe.configure({ mode: "serial", retries: 0 });
  test.skip(!isLocalPlaywrightRun(), "Requires loopback Next and local Supabase.");
  test.setTimeout(8 * 60_000);

  test("blank optional intake and edit paths remain tenant-safe and nonfinancial", async ({
    browser,
  }) => {
    mkdirSync(ARTIFACT_ROOT, { recursive: true });
    const admin = getLocalAdminClient();
    const marker = `QA-REPAIR-OPTIONAL-CURRENT-${randomUUID().slice(0, 8)}`;
    const startedAt = new Date().toISOString();
    const before = await captureSafetySnapshot(admin);
    const result: Record<string, unknown> = {
      marker,
      startedAt,
      submissions: 0,
      actionPosts: 0,
      closeRedirectPosts: 0,
      clientCompletion: [],
      cleanupRetries: 0,
      cleanupFailures: 0,
    };
    const errors: string[] = [];

    try {
      expect(await tenantMismatchCount(admin)).toBe(0);
      const branchId = await ownerBranch(admin);
      const selectedCustomerId = randomUUID();
      const { error: selectedCustomerError } = await admin.from("customers").insert({
        id: selectedCustomerId,
        organization_id: LOCAL_QA_ORG_ID,
        branch_id: branchId,
        name: `${marker} Selected Customer`,
        phone: null,
        outstanding_balance: 0,
        credit_limit: 0,
      });
      if (selectedCustomerError) {
        throw new Error(`Selected customer fixture failed: ${selectedCustomerError.code}`);
      }

      const runCreate = async (
        customerName: string,
        problem: string,
        configure?: (page: Page) => Promise<void>,
      ): Promise<RepairRow> => {
        const session = await newOwnerPage(browser);
        try {
          session.page.on("request", (request) => {
            if (request.method() === "POST" && new URL(request.url()).pathname === "/repairs") {
              const headers = request.headers();
              if (
                headers["next-action"] &&
                headers["content-type"]?.startsWith("multipart/form-data")
              ) {
                result.actionPosts = Number(result.actionPosts) + 1;
              } else if (headers["next-action"] && headers["content-type"] === "text/plain") {
                result.closeRedirectPosts = Number(result.closeRedirectPosts) + 1;
              }
            }
          });
          await openIntake(session.page);
          await fillRequiredRepair(session.page, customerName, problem);
          if (configure) await configure(session.page);
          result.submissions = Number(result.submissions) + 1;
          await session.page.getByRole("button", { name: "Record Intake" }).click();
          const row = await pollFor(
            `repair ${customerName}`,
            () => markerRepairs(admin, marker),
            (rows) => rows.some((item) => item.customer_name === customerName),
          ).then((rows) => rows.find((item) => item.customer_name === customerName)!);
          const modalClosed = await session.page
            .getByRole("heading", { name: "New Repair Intake" })
            .waitFor({ state: "hidden", timeout: 5_000 })
            .then(() => true)
            .catch(() => false);
          (result.clientCompletion as Array<Record<string, unknown>>).push({
            customerName,
            modalClosed,
          });
          errors.push(...session.errors);
          return row;
        } finally {
          await session.context.close();
        }
      };

      const walkIn = await runCreate(
        `${marker} Walk-in`,
        `${marker} Screen issue`,
      );
      expect(walkIn.customer_id).toBeNull();
      await assertBlankOptionalPersistence(walkIn);

      const quick = await runCreate(
        `${marker} Quick Customer`,
        `${marker} Quick screen issue`,
        async (page) => {
          await repairForm(page)
            .locator('[name="create_customer_account"]')
            .check();
        },
      );
      const quickCustomers = (await markerCustomers(admin, marker)).filter(
        (row) => row.name === `${marker} Quick Customer`,
      );
      expect(quickCustomers).toHaveLength(1);
      expect(quick.customer_id).toBe(quickCustomers[0].id);
      expect(quickCustomers[0].organization_id).toBe(LOCAL_QA_ORG_ID);
      expect(Number(quickCustomers[0].outstanding_balance)).toBe(0);
      await assertBlankOptionalPersistence(quick);

      const selected = await runCreate(
        `${marker} Selected Customer`,
        `${marker} Selected screen issue`,
        async (page) => {
          const search = page.getByPlaceholder("Search by name or phone...");
          await search.fill(`${marker} Selected Customer`);
          await page
            .getByRole("button", { name: new RegExp(`${marker} Selected Customer`) })
            .click();
          await expect(repairForm(page).locator('[name="customer_id"]')).toHaveValue(
            selectedCustomerId,
          );
        },
      );
      expect(selected.customer_id).toBe(selectedCustomerId);
      expect(
        (await markerCustomers(admin, marker)).filter(
          (row) => row.name === `${marker} Selected Customer`,
        ),
      ).toHaveLength(1);
      await assertBlankOptionalPersistence(selected);

      const editSession = await newOwnerPage(browser);
      try {
        editSession.page.on("request", (request) => {
          if (request.method() === "POST" && new URL(request.url()).pathname === "/repairs") {
            const headers = request.headers();
            if (
              headers["next-action"] &&
              headers["content-type"]?.startsWith("multipart/form-data")
            ) {
              result.actionPosts = Number(result.actionPosts) + 1;
            } else if (headers["next-action"] && headers["content-type"] === "text/plain") {
              result.closeRedirectPosts = Number(result.closeRedirectPosts) + 1;
            }
          }
        });
        await editSession.page.goto(`/repairs?edit=${walkIn.id}`);
        await expect(
          editSession.page.getByRole("heading", { name: /Edit Job Details/ }),
        ).toBeVisible({ timeout: 30_000 });
        await repairForm(editSession.page)
          .locator('[name="problem_description"]')
          .fill(`${marker} Screen issue updated`);
        result.submissions = Number(result.submissions) + 1;
        await editSession.page.getByRole("button", { name: "Update Details" }).click();
        const edited = await pollFor(
          "unlinked repair edit",
          () => markerRepairs(admin, marker),
          (rows) =>
            rows.some(
              (row) =>
                row.id === walkIn.id &&
                row.problem_description === `${marker} Screen issue updated`,
            ),
        ).then((rows) => rows.find((row) => row.id === walkIn.id)!);
        expect(edited.customer_id).toBeNull();
        expect(edited.status).toBe("received");
        await assertBlankOptionalPersistence(edited);
        const modalClosed = await editSession.page
          .getByRole("heading", { name: /Edit Job Details/ })
          .waitFor({ state: "hidden", timeout: 5_000 })
          .then(() => true)
          .catch(() => false);
        (result.clientCompletion as Array<Record<string, unknown>>).push({
          customerName: `${marker} Walk-in edit`,
          modalClosed,
        });
        errors.push(...editSession.errors);
      } finally {
        await editSession.context.close();
      }

      const baseSchemaPayload = {
        customer_name: `${marker} Schema Probe`,
        device_type: "Mobile",
        problem_description: `${marker} Schema date probe`,
        estimated_cost: "0",
        advance_paid: "0",
        payment_method: "cash",
        status: "received",
      };
      const dateCases = [
        ["", true],
        ["   ", true],
        ["2026-08-02", true],
        ["2028-02-29", true],
        ["2027-02-29", false],
        ["2026-02-30", false],
        ["2026-13-01", false],
        ["2026-7-01", false],
        ["2026-08-02T00:00", false],
        ["not-a-date", false],
      ] as const;
      result.dateProbes = dateCases.map(([value, expected]) => {
        const parsed = repairSchema.safeParse({
          ...baseSchemaPayload,
          expected_delivery_at: value,
        });
        expect(parsed.success, value).toBe(expected);
        return { value, accepted: parsed.success };
      });

      for (const viewport of [
        { width: 390, height: 844 },
        { width: 320, height: 568 },
      ]) {
        const mobile = await newOwnerPage(browser, viewport);
        try {
          await openIntake(mobile.page);
          const form = repairForm(mobile.page);
          await expect(form.locator('[name="customer_id"]')).toHaveValue("");
          await expect(form.locator('[name="expected_delivery_at"]')).toHaveValue("");
          await expect(form.locator('[name="customer_name"]')).toHaveAttribute("required", "");
          await expect(form.locator('[name="device_type"]')).toHaveAttribute("required", "");
          await expect(form.locator('[name="problem_description"]')).toHaveAttribute(
            "required",
            "",
          );
          await form.locator('[name="create_customer_account"]').scrollIntoViewIfNeeded();
          await expect(form.locator('[name="create_customer_account"]')).toBeVisible();
          await form.getByRole("button", { name: "Record Intake" }).scrollIntoViewIfNeeded();
          await expect(form.getByRole("button", { name: "Record Intake" })).toBeVisible();
          expect(
            await mobile.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          ).toBe(true);
          await mobile.page.screenshot({
            path: `${ARTIFACT_ROOT}/mobile-${viewport.width}x${viewport.height}.png`,
            fullPage: true,
          });
          errors.push(...mobile.errors);
        } finally {
          await mobile.context.close();
        }
      }

      const repairs = await markerRepairs(admin, marker);
      expect(repairs).toHaveLength(3);
      expect(new Set(repairs.map((row) => row.id)).size).toBe(3);
      expect(await repairHistories(admin, repairs.map((row) => row.id))).toHaveLength(3);
      const audits = await pollFor(
        "repair create and edit audits",
        () => repairAudits(admin, marker, startedAt, repairs.map((row) => row.id)),
        (rows) => rows.length === 4,
      );
      expect(audits.filter((row) => row.action === "repairs.created")).toHaveLength(3);
      expect(audits.filter((row) => row.action === "repairs.updated")).toHaveLength(1);
      expect(result.submissions).toBe(4);
      expect(result.actionPosts).toBe(4);
      expect(errors).toEqual([]);
      expect(await tenantMismatchCount(admin)).toBe(0);

      result.workflows = {
        walkIn: { repairId: walkIn.id, customerId: walkIn.customer_id },
        quickCustomer: { repairId: quick.id, customerId: quick.customer_id },
        selectedCustomer: { repairId: selected.id, customerId: selected.customer_id },
        unlinkedEdit: { repairId: walkIn.id, customerId: null },
      };
      result.histories = 3;
      result.audits = 4;
      result.errors = errors;
      result.tenantMismatches = 0;
    } finally {
      try {
        await cleanup(admin, marker, startedAt);
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
    expect(result.signaturesEqual).toBe(true);
    expect(await markerRepairs(admin, marker)).toHaveLength(0);
    expect(await markerCustomers(admin, marker)).toHaveLength(0);
    expect(await repairAudits(admin, marker, startedAt)).toHaveLength(0);
    expect(await tenantMismatchCount(admin)).toBe(0);
  });
});
