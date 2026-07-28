import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import {
  getLocalAdminClient,
  isLocalPlaywrightRun,
  LOCAL_QA_ORG_ID,
  loginLocalOwnerDirectly,
} from "./helpers/local-supabase";
import {
  formatKarachiDateTimeLocal,
  getKarachiBusinessDate,
  parseKarachiDateTimeLocal,
} from "../../src/lib/datetime";

const ARTIFACT_ROOT = "/tmp/saledock-expense-restore-audit";
const SAFETY_TABLES = [
  "expenses",
  "audit_logs",
  "payments",
  "invoices",
  "invoice_items",
  "returns",
  "repairs",
  "products",
  "product_stock_lots",
  "stock_movements",
  "customers",
  "customer_ledger_entries",
  "suppliers",
  "supplier_purchases",
  "supplier_payments",
  "daily_closings",
  "cash_shifts",
  "cash_movements",
  "branches",
  "profiles",
  "organizations",
] as const;

type AdminClient = ReturnType<typeof getLocalAdminClient>;
type Signature =
  | { count: number; hash: string }
  | { unavailable: true; code: string };
type SafetySnapshot = Record<string, Signature>;
type BrowserEvidence = {
  pageErrors: string[];
  consoleErrors: string[];
  requestFailures: string[];
  overlays: number;
  dialogs: number;
  closing: boolean;
  expectedAuthTeardown: number;
  expectedLocalAuthNavigationAborts: number;
};
type CapturedField = [name: string, value: string];

function minutesUntilKarachiMidnight(localDateTime: string): number {
  const [, time] = localDateTime.split("T");
  const [hour, minute] = time!.split(":").map(Number);
  return 24 * 60 - (hour! * 60 + minute!);
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function sanitizedPath(value: string): string {
  try {
    return new URL(value).pathname.replace(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,
      ":id",
    );
  } catch {
    return "invalid-url";
  }
}

async function tableSignature(admin: AdminClient, table: string): Promise<Signature> {
  const { data, error } = await admin.from(table).select("*").order("id", { ascending: true });
  if (error?.code === "PGRST205" && table === "cash_movements") {
    return { unavailable: true, code: error.code };
  }
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

function attachEvidence(page: Page): BrowserEvidence {
  const evidence: BrowserEvidence = {
    pageErrors: [],
    consoleErrors: [],
    requestFailures: [],
    overlays: 0,
    dialogs: 0,
    closing: false,
    expectedAuthTeardown: 0,
    expectedLocalAuthNavigationAborts: 0,
  };
  page.on("pageerror", (error) => evidence.pageErrors.push(error.name));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const value = `${message.text()} ${sanitizedPath(message.location().url)}`;
    if (/clarity\.ms|_vercel\/(?:insights|speed-insights)|ERR_ABORTED/i.test(value)) return;
    if (
      evidence.closing &&
      /TypeError: Failed to fetch/i.test(value) &&
      /\/_next\/static\/chunks\//.test(value)
    ) {
      evidence.expectedAuthTeardown += 1;
      return;
    }
    if (
      /^TypeError: Failed to fetch[\s\S]*\._(?:getUser|useSession)/.test(value) &&
      /^http:\/\/(?:127\.0\.0\.1|localhost):\d+\/_next\/static\/chunks\//.test(
        message.location().url,
      )
    ) {
      evidence.expectedLocalAuthNavigationAborts += 1;
      return;
    }
    evidence.consoleErrors.push(value.replace(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,
      ":id",
    ));
  });
  page.on("requestfailed", (request) => {
    const path = sanitizedPath(request.url());
    if (/^\/_vercel\/(?:insights|speed-insights)/.test(path)) return;
    if (
      request.failure()?.errorText === "net::ERR_ABORTED" &&
      (request.resourceType() === "fetch" || path.startsWith("/_next/static/"))
    ) {
      return;
    }
    evidence.requestFailures.push(`${request.method()} ${path}`);
  });
  page.on("dialog", async (dialog) => {
    evidence.dialogs += 1;
    await dialog.dismiss();
  });
  return evidence;
}

async function countOverlays(page: Page): Promise<number> {
  return page.locator("nextjs-portal").count();
}

async function closeContext(
  context: BrowserContext,
  evidence: BrowserEvidence,
): Promise<void> {
  evidence.closing = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const closed = await Promise.race([
    context.close().then(() => true).catch(() => false),
    new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(false), 10_000);
    }),
  ]);
  if (timer) clearTimeout(timer);
  expect(closed, "browser context closes within ten seconds").toBe(true);
}

async function newSession(
  browser: Browser,
  email = "owner@saledock.local",
): Promise<{ context: BrowserContext; page: Page; evidence: BrowserEvidence }> {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    timezoneId: "Asia/Karachi",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  page.setDefaultNavigationTimeout(30_000);
  const evidence = attachEvidence(page);
  await page.addInitScript(() => {
    localStorage.setItem(
      "analytics-consent",
      JSON.stringify({
        value: "rejected",
        version: "expense-restore-audit-qa",
        timestamp: new Date().toISOString(),
      }),
    );
  });
  await page.route("**/rest/v1/user_ui_preferences**", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        sidebar_preferences: {
          analyticsConsent: "rejected",
          marketingConsent: "rejected",
        },
      }),
    });
  });
  await loginLocalOwnerDirectly(page, email);
  await expect(page.locator("header h1").first()).toHaveText("Dashboard", {
    timeout: 30_000,
  });
  return { context, page, evidence };
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
    .select("id, branch_id, organization_id, role, is_active")
    .eq("organization_id", LOCAL_QA_ORG_ID);
  if (error) throw new Error(`Owner context failed: ${error.code}`);
  const owner = (data ?? []).find((profile) => profile.role === "owner" && profile.is_active);
  const cashier = (data ?? []).find((profile) => profile.role === "cashier" && profile.is_active);
  if (!owner?.id || !owner.branch_id || !cashier?.id) {
    throw new Error("The required local owner/cashier fixtures are unavailable.");
  }
  return { owner, cashier };
}

async function readExpense(admin: AdminClient, id: string) {
  const { data, error } = await admin
    .from("expenses")
    .select(
      "id, organization_id, branch_id, category, amount, payment_method, vendor_name, notes, status, spent_at, created_by, archived_at, archived_by",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Expense read failed: ${error.code}`);
  return data;
}

async function restoreAudits(admin: AdminClient, id: string) {
  const { data, error } = await admin
    .from("audit_logs")
    .select(
      "id, organization_id, branch_id, actor_id, module, action, details, metadata, created_at",
    )
    .eq("module", "expenses")
    .eq("action", "expenses.restored")
    .eq("metadata->>expense_id", id);
  if (error) throw new Error(`Restore-audit read failed: ${error.code}`);
  return data ?? [];
}

async function matchingExpenseAudits(
  admin: AdminClient,
  marker: string,
  id: string | null,
  startedAt: string,
) {
  const { data, error } = await admin
    .from("audit_logs")
    .select(
      "id, organization_id, branch_id, actor_id, module, action, details, metadata, created_at",
    )
    .eq("module", "expenses")
    .gte("created_at", startedAt);
  if (error) throw new Error(`Expense-audit read failed: ${error.code}`);
  return (data ?? []).filter((row) => {
    const details = typeof row.details === "string" ? row.details : "";
    const metadata =
      row.metadata && typeof row.metadata === "object"
        ? (row.metadata as Record<string, unknown>)
        : {};
    return (
      details.includes(marker) ||
      Boolean(id && details.includes(id)) ||
      Boolean(id && metadata.expense_id === id)
    );
  });
}

async function markerExpenses(admin: AdminClient, marker: string) {
  const { data, error } = await admin
    .from("expenses")
    .select(
      "id, organization_id, branch_id, category, amount, payment_method, vendor_name, notes, status, spent_at, created_by, archived_at, archived_by",
    )
    .eq("organization_id", LOCAL_QA_ORG_ID)
    .eq("category", marker);
  if (error) throw new Error(`Marked expense read failed: ${error.code}`);
  return data ?? [];
}

async function stableAuditCount(
  admin: AdminClient,
  id: string,
  expected: number,
): Promise<Awaited<ReturnType<typeof restoreAudits>>> {
  const rows = expected > 0
    ? await pollFor("restore audit", () => restoreAudits(admin, id), (value) => value.length === expected)
    : await restoreAudits(admin, id);
  for (let observation = 0; observation < 3; observation += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(await restoreAudits(admin, id), `stable audit observation ${observation + 1}`).toHaveLength(expected);
  }
  return rows;
}

async function cleanup(
  admin: AdminClient,
  marker: string,
  id: string | null,
  startedAt: string,
): Promise<void> {
  const audits = await matchingExpenseAudits(admin, marker, id, startedAt);
  if (audits.length > 0) {
    const { error } = await admin.from("audit_logs").delete().in("id", audits.map((row) => row.id));
    if (error) throw new Error(`Audit cleanup failed: ${error.code}`);
  }
  const { error } = await admin
    .from("expenses")
    .delete()
    .eq("organization_id", LOCAL_QA_ORG_ID)
    .eq("category", marker);
  if (error) throw new Error(`Expense cleanup failed: ${error.code}`);
  expect(await markerExpenses(admin, marker), "generated expense remaining").toHaveLength(0);
  expect(
    await matchingExpenseAudits(admin, marker, id, startedAt),
    "generated audit rows remaining",
  ).toHaveLength(0);
}

async function capturedActionFields(form: ReturnType<Page["locator"]>): Promise<CapturedField[]> {
  return form.evaluate((element) =>
    [...new FormData(element as HTMLFormElement).entries()]
      .filter((entry): entry is [string, string] => typeof entry[1] === "string")
      .map(([name, value]) => [name, value]),
  );
}

async function invokeCapturedAction(
  page: Page,
  fields: CapturedField[],
  id: string,
): Promise<number> {
  return page.evaluate(async ({ submittedFields, submittedId }) => {
    const body = new FormData();
    for (const [name, value] of submittedFields) {
      body.append(name, name === "id" ? submittedId : value);
    }
    const response = await fetch(window.location.href, {
      method: "POST",
      body,
      redirect: "follow",
    });
    return response.status;
  }, { submittedFields: fields, submittedId: id });
}

function assertCleanEvidence(evidence: BrowserEvidence, label: string): void {
  expect(evidence.pageErrors, `${label}: page errors`).toEqual([]);
  expect(evidence.consoleErrors, `${label}: console errors`).toEqual([]);
  expect(evidence.requestFailures, `${label}: request failures`).toEqual([]);
  expect(evidence.overlays, `${label}: framework overlays`).toBe(0);
  expect(evidence.dialogs, `${label}: native dialogs`).toBe(0);
}

test.describe("expense Restore audit", () => {
  test.skip(!isLocalPlaywrightRun(), "Requires loopback Next and local Supabase.");
  test.setTimeout(8 * 60_000);

  test("one Card expense records one truthful audit for one genuine Restore", async ({ browser }) => {
    mkdirSync(ARTIFACT_ROOT, { recursive: true });
    const capturedInstant = new Date();
    const startedAt = capturedInstant.toISOString();
    const karachiBusinessDate = getKarachiBusinessDate(capturedInstant);
    const expectedLocalDateTime = formatKarachiDateTimeLocal(startedAt);
    const expectedStoredUtc = parseKarachiDateTimeLocal(expectedLocalDateTime);
    test.skip(
      minutesUntilKarachiMidnight(expectedLocalDateTime) <= 5,
      "Requires more than five minutes before the captured Karachi day rolls over.",
    );

    const admin = getLocalAdminClient();
    const marker = `REST-AUD-${randomUUID().slice(0, 8)}`;
    const before = await captureSafetySnapshot(admin);
    const { owner } = await ownerContext(admin);
    const browserEvidence: BrowserEvidence[] = [];
    let expenseId: string | null = null;
    let actionPosts = 0;
    let diagnosticPosts = 0;
    let screenshotPath: string | null = null;
    let actionFields: CapturedField[] = [];
    const responseStatuses: Record<string, number> = {};

    expect(
      await markerExpenses(admin, marker),
      "marker expense precondition",
    ).toHaveLength(0);

    try {
      const session = await newSession(browser);
      browserEvidence.push(session.evidence);
      try {
        session.page.on("request", (request) => {
          if (
            request.method() === "POST" &&
            new URL(request.url()).pathname === "/expenses"
          ) {
            actionPosts += 1;
          }
        });

        await session.page.goto("/expenses");
        await expect(session.page.locator("header h1").first()).toHaveText("Expenses");
        const details = session.page.locator("details").filter({
          hasText: "Add a new expense",
        });
        await details.locator("summary").click();
        const createForm = details.locator("form");
        await createForm.locator('input[name="category"]').fill(marker);
        await createForm.locator('input[name="amount"]').fill("75");
        await createForm.locator('input[name="vendor_name"]').fill(`${marker} Vendor`);
        await createForm.locator('textarea[name="notes"]').fill(`${marker} Initial`);
        await createForm.locator('input[name="spent_at"]').fill(expectedLocalDateTime);
        await createForm.getByRole("button", {
          name: "Payment method",
          exact: true,
        }).click();
        await createForm.getByRole("option", { name: "Card", exact: true }).click();
        await expect(createForm.locator('input[name="payment_method"]')).toHaveValue("card");
        const createResponse = session.page.waitForResponse(
          (response) =>
            response.request().method() === "POST" &&
            new URL(response.url()).pathname === "/expenses",
          { timeout: 15_000 },
        );
        await createForm.getByRole("button", { name: "Add expense", exact: true }).click();
        responseStatuses.create = (await createResponse).status();
        const createdRows = await pollFor(
          "created expense",
          () => markerExpenses(admin, marker),
          (rows) => rows.length === 1,
        );
        expenseId = createdRows[0]!.id as string;
        const created = await readExpense(admin, expenseId);
        expect(created).toMatchObject({
          organization_id: LOCAL_QA_ORG_ID,
          branch_id: owner.branch_id,
          category: marker,
          amount: 75,
          payment_method: "card",
          vendor_name: `${marker} Vendor`,
          notes: `${marker} Initial`,
          status: "active",
          created_by: owner.id,
        });
        expect(new Date(created!.spent_at as string).toISOString()).toBe(
          expectedStoredUtc,
        );
        const createdAudits = await pollFor(
          "created audit",
          () => matchingExpenseAudits(admin, marker, expenseId, startedAt),
          (rows) => rows.filter((row) => row.action === "expenses.created").length === 1,
        );
        expect(createdAudits.filter((row) => row.action === "expenses.created")).toHaveLength(1);

        await session.page.goto("/dashboard");
        await expect(
          session.page.locator('[data-widget-id="widget-expenses"]'),
        ).toContainText(/PKR\s*75(?:\.00)?/);
        await session.page.goto(
          `/reports?range=custom&startDate=${karachiBusinessDate}&endDate=${karachiBusinessDate}`,
        );
        await expect(
          session.page.locator("[data-stat-card]").filter({
            has: session.page.locator(
              '[data-stat-card-label="Total Operating Expenses"]',
            ),
          }),
        ).toContainText(/PKR\s*75(?:\.00)?/);

        await session.page.goto(`/expenses?q=${marker}`);
        let row = session.page.locator("tr").filter({ hasText: marker });
        await row.getByRole("button", { name: "Void", exact: true }).click();
        const dialog = session.page.getByRole("dialog", {
          name: "Void this expense?",
        });
        const voidResponse = session.page.waitForResponse(
          (response) =>
            response.request().method() === "POST" &&
            new URL(response.url()).pathname === "/expenses",
          { timeout: 15_000 },
        );
        await dialog.getByRole("button", {
          name: "Void expense",
          exact: true,
        }).click();
        responseStatuses.void = (await voidResponse).status();
        const archived = await pollFor(
          "archived expense",
          () => readExpense(admin, expenseId!),
          (value) => value?.status === "archived",
        );
        expect(archived?.archived_at).toBeTruthy();
        expect(archived?.archived_by).toBe(owner.id);
        await pollFor(
          "void audit",
          () => matchingExpenseAudits(admin, marker, expenseId, startedAt),
          (rows) => rows.filter((audit) => audit.action === "expenses.voided").length === 1,
        );

        await session.page.goto("/dashboard");
        await expect(
          session.page.locator('[data-widget-id="widget-expenses"]'),
        ).toContainText(/PKR\s*0(?:\.00)?/);
        await session.page.goto(
          `/reports?range=custom&startDate=${karachiBusinessDate}&endDate=${karachiBusinessDate}`,
        );
        await expect(
          session.page.locator("[data-stat-card]").filter({
            has: session.page.locator(
              '[data-stat-card-label="Total Operating Expenses"]',
            ),
          }),
        ).toContainText(/PKR\s*0(?:\.00)?/);

        await session.page.goto(`/expenses?q=${marker}&archived=1`);
        row = session.page.locator("tr").filter({ hasText: marker });
        const restoreForm = row.locator("form").filter({
          has: session.page.getByRole("button", {
            name: "Restore",
            exact: true,
          }),
        });
        actionFields = await capturedActionFields(restoreForm);

        const cashier = await newSession(browser, "cashier@saledock.local");
        browserEvidence.push(cashier.evidence);
        try {
          await cashier.page.goto(`/expenses?q=${marker}&archived=1`);
          await expect(
            cashier.page.getByText(
              /Your role \(cashier\) cannot create or edit expenses\./,
            ),
          ).toBeVisible();
          await expect(
            cashier.page.getByRole("button", {
              name: "Restore",
              exact: true,
            }),
          ).toHaveCount(0);
          expect(
            await invokeCapturedAction(cashier.page, actionFields, expenseId),
          ).toBe(200);
          diagnosticPosts += 1;
          expect((await readExpense(admin, expenseId))?.status).toBe("archived");
          await stableAuditCount(admin, expenseId, 0);
          cashier.evidence.overlays = await countOverlays(cashier.page);
        } finally {
          await closeContext(cashier.context, cashier.evidence);
        }

        const restoreResponse = session.page.waitForResponse(
          (response) =>
            response.request().method() === "POST" &&
            new URL(response.url()).pathname === "/expenses",
          { timeout: 15_000 },
        );
        await restoreForm.getByRole("button", {
          name: "Restore",
          exact: true,
        }).click();
        responseStatuses.restore = (await restoreResponse).status();
        const restored = await pollFor(
          "restored expense",
          () => readExpense(admin, expenseId!),
          (value) => value?.status === "active",
        );
        expect(restored).toMatchObject({
          organization_id: created?.organization_id,
          branch_id: created?.branch_id,
          category: created?.category,
          amount: created?.amount,
          payment_method: created?.payment_method,
          vendor_name: created?.vendor_name,
          notes: created?.notes,
          spent_at: created?.spent_at,
          created_by: created?.created_by,
          status: "active",
          archived_at: null,
          archived_by: null,
        });
        const restoreRows = await stableAuditCount(admin, expenseId, 1);
        expect(restoreRows[0]).toMatchObject({
          organization_id: LOCAL_QA_ORG_ID,
          branch_id: owner.branch_id,
          actor_id: owner.id,
          module: "expenses",
          action: "expenses.restored",
          details: `Restored expense ${expenseId}`,
          metadata: {
            expense_id: expenseId,
            previous_status: "archived",
            new_status: "active",
          },
        });

        const postsBeforeDiagnostics = actionPosts;
        expect(
          await invokeCapturedAction(session.page, actionFields, expenseId),
        ).toBe(200);
        diagnosticPosts += 1;
        expect(
          await invokeCapturedAction(
            session.page,
            actionFields,
            "not-a-valid-id",
          ),
        ).toBe(200);
        diagnosticPosts += 1;
        expect(
          await invokeCapturedAction(session.page, actionFields, randomUUID()),
        ).toBe(200);
        diagnosticPosts += 1;
        expect(actionPosts - postsBeforeDiagnostics).toBe(3);
        await stableAuditCount(admin, expenseId, 1);
        expect((await readExpense(admin, expenseId))?.status).toBe("active");

        await session.page.reload();
        await expect(
          session.page.locator("tr").filter({ hasText: marker }).getByText(
            "Active",
            { exact: true },
          ),
        ).toBeVisible();
        await session.page.goto("/dashboard");
        await expect(
          session.page.locator('[data-widget-id="widget-expenses"]'),
        ).toContainText(/PKR\s*75(?:\.00)?/);
        await session.page.goto(
          `/reports?range=custom&startDate=${karachiBusinessDate}&endDate=${karachiBusinessDate}`,
        );
        await expect(
          session.page.locator("[data-stat-card]").filter({
            has: session.page.locator(
              '[data-stat-card-label="Total Operating Expenses"]',
            ),
          }),
        ).toContainText(/PKR\s*75(?:\.00)?/);

        await session.page.goto(`/expenses?q=${marker}`);
        const finalRow = session.page.locator("tr").filter({ hasText: marker });
        await finalRow.getByRole("button", {
          name: "Void",
          exact: true,
        }).click();
        const finalDialog = session.page.getByRole("dialog", {
          name: "Void this expense?",
        });
        const finalVoidResponse = session.page.waitForResponse(
          (response) =>
            response.request().method() === "POST" &&
            new URL(response.url()).pathname === "/expenses",
          { timeout: 15_000 },
        );
        await finalDialog.getByRole("button", {
          name: "Void expense",
          exact: true,
        }).click();
        responseStatuses.cleanupVoid = (await finalVoidResponse).status();
        await pollFor(
          "final archived expense",
          () => readExpense(admin, expenseId!),
          (value) => value?.status === "archived",
        );
        await pollFor(
          "second void audit",
          () => matchingExpenseAudits(admin, marker, expenseId, startedAt),
          (rows) =>
            rows.filter((audit) => audit.action === "expenses.voided")
              .length === 2,
        );
        session.evidence.overlays = await countOverlays(session.page);
      } finally {
        await closeContext(session.context, session.evidence);
      }

      const visual = await newSession(browser);
      browserEvidence.push(visual.evidence);
      try {
        await visual.page.goto("/audit-log?module=expenses&action=expenses.restored");
        await expect(visual.page.locator("header h1").first()).toHaveText("Audit Log");
        await expect(
          visual.page
            .locator("td")
            .getByText("Expenses → Restored", { exact: true }),
        ).toBeVisible();
        await visual.page.evaluate(() => {
          const uuid = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
          const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
          );
          let node: Node | null;
          while ((node = walker.nextNode())) {
            node.textContent =
              node.textContent?.replace(uuid, "[redacted-id]") ?? "";
          }
          document.querySelectorAll("span").forEach((element) => {
            if (element.textContent?.startsWith("expense_id:")) {
              element.textContent = "expense_id: [redacted-id]";
            }
          });
          document
            .querySelectorAll("[title]")
            .forEach((element) => element.removeAttribute("title"));
        });
        screenshotPath = `${ARTIFACT_ROOT}/audit-log-restored.png`;
        await visual.page.screenshot({
          path: screenshotPath,
          fullPage: true,
        });
        visual.evidence.overlays = await countOverlays(visual.page);
      } finally {
        await closeContext(visual.context, visual.evidence);
      }

      expect(actionPosts, "owner Expenses POST count").toBe(7);
      expect(diagnosticPosts, "diagnostic no-op/denied POST count").toBe(4);
      expect(Object.values(responseStatuses)).toEqual([200, 200, 200, 200]);
      expect(await markerExpenses(admin, marker), "single expense after Restore").toHaveLength(1);
      const allAudits = await matchingExpenseAudits(
        admin,
        marker,
        expenseId,
        startedAt,
      );
      expect(allAudits.filter((row) => row.action === "expenses.created")).toHaveLength(1);
      expect(allAudits.filter((row) => row.action === "expenses.voided")).toHaveLength(2);
      expect(
        allAudits.filter((row) => row.action === "expenses.restored"),
      ).toHaveLength(1);
      expect(await tableSignature(admin, "cash_shifts")).toEqual(before.cash_shifts);
      expect(await tableSignature(admin, "cash_movements")).toEqual(before.cash_movements);
      expect(await tableSignature(admin, "daily_closings")).toEqual(before.daily_closings);
      for (const [index, evidence] of browserEvidence.entries()) {
        assertCleanEvidence(evidence, `browser context ${index + 1}`);
      }

      writeFileSync(
        `${ARTIFACT_ROOT}/post-fix.json`,
        JSON.stringify({
          finding: "LIVE-EXPENSE-RESTORE-AUDIT-001",
          capturedInstant: capturedInstant.toISOString(),
          karachiBusinessDate,
          karachiLocalDateTime: expectedLocalDateTime,
          expectedStoredUtc,
          startedAt,
          actionPosts,
          responseStatuses,
          createAudits: 1,
          voidAudits: 2,
          restoreAudits: 1,
          successfulRestoreTransitions: 1,
          diagnosticNoOpPosts: diagnosticPosts,
          finalStatus: (await readExpense(admin, expenseId))?.status,
          amount: 75,
          paymentMethod: "card",
          spentAtUnchanged: true,
          dashboardAndReports: "PKR 75 active, PKR 0 archived, PKR 75 restored",
          cashDrawerEffect: 0,
          screenshotPath,
          browserEvidence,
        }, null, 2),
      );
    } finally {
      await cleanup(admin, marker, expenseId, startedAt);
    }

    expect(
      await captureSafetySnapshot(admin),
      "all safety signatures after cleanup",
    ).toEqual(before);
  });
});
