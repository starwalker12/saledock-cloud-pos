import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import {
  getLocalAuthConfig,
  getLocalAdminClient,
  isLocalPlaywrightRun,
  LOCAL_QA_ORG_ID,
  loginLocalOwnerDirectly,
} from "./helpers/local-supabase";

const ARTIFACT_ROOT = "/tmp/saledock-expense-datetime-preservation";
const LOCAL_OWNER_PASSWORD = "Password123!";
const SAFETY_TABLES = [
  "expenses",
  "audit_logs",
  "cash_shifts",
  "products",
  "product_stock_lots",
  "stock_movements",
  "invoices",
  "payments",
  "returns",
  "supplier_purchases",
  "supplier_payments",
  "organizations",
  "branches",
  "profiles",
] as const;

type AdminClient = ReturnType<typeof getLocalAdminClient>;
type Signature = { count: number; hash: string };
type SafetySnapshot = Record<string, Signature>;
type ExpenseRecord = {
  id: string;
  category: string;
  amount: number;
  payment_method: string;
  vendor_name: string | null;
  notes: string | null;
  status: string;
  spent_at: string;
};
type BrowserErrors = {
  pageErrors: string[];
  consoleErrors: string[];
  requestFailures: string[];
  httpErrors: string[];
  expectedActionAborts: number;
  instrumentationWarnings: number;
  contextCloseTimeouts: number;
  dialogs: number;
};
type MutationResult = {
  label: string;
  submittedDateTime: string;
  storedDateTime: string;
  formData: Record<string, string>;
  settled: boolean;
  posts: number;
};

async function ensureOwnerProfile(admin: AdminClient): Promise<{
  created: boolean;
  ownerId: string;
  authCreated: boolean;
  cleanupAuth: () => Promise<void>;
}> {
  const statusOutput = execFileSync(
    "supabase",
    ["status", "--output", "json"],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const status = JSON.parse(statusOutput.slice(statusOutput.indexOf("{"))) as {
    API_URL?: string;
    SERVICE_ROLE_KEY?: string;
  };
  const url = status.API_URL ?? "";
  const serviceKey = status.SERVICE_ROLE_KEY ?? "";
  if (!/^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/.test(url) || !serviceKey) {
    throw new Error("Loopback Supabase service configuration is unavailable.");
  }
  const serviceClient = createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  const { data: listed, error: listError } =
    await serviceClient.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
  if (listError) throw new Error("Local Auth fixture lookup failed.");
  let authUser =
    listed.users.find((user) => user.email === "owner@saledock.local") ?? null;
  let authCreated = false;
  if (!authUser) {
    const { data: created, error: createError } =
      await serviceClient.auth.admin.createUser({
        email: "owner@saledock.local",
        password: LOCAL_OWNER_PASSWORD,
        email_confirm: true,
      });
    if (createError || !created.user)
      throw new Error("Local owner Auth fixture creation failed.");
    authUser = created.user;
    authCreated = true;
  }

  const { anonKey } = getLocalAuthConfig();
  const authClient = createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  const { data: auth, error: authError } =
    await authClient.auth.signInWithPassword({
      email: "owner@saledock.local",
      password: LOCAL_OWNER_PASSWORD,
    });
  if (authError || !auth.user?.id) {
    if (authCreated) await serviceClient.auth.admin.deleteUser(authUser.id);
    throw new Error("Local owner Auth fixture is unavailable.");
  }
  const ownerId = auth.user.id;
  const { data: existing, error: existingError } = await admin
    .from("profiles")
    .select("id")
    .eq("id", ownerId)
    .maybeSingle();
  if (existingError)
    throw new Error(`Local owner profile lookup failed: ${existingError.code}`);
  const cleanupAuth = async () => {
    if (!authCreated) return;
    const { error } = await serviceClient.auth.admin.deleteUser(ownerId);
    if (error) throw new Error("Local owner Auth cleanup failed.");
  };
  if (existing?.id)
    return { created: false, ownerId, authCreated, cleanupAuth };

  const { data: branch, error: branchError } = await admin
    .from("branches")
    .select("id")
    .eq("organization_id", LOCAL_QA_ORG_ID)
    .limit(1)
    .single();
  if (branchError || !branch?.id)
    throw new Error("Local branch fixture is unavailable.");

  const { error: insertError } = await admin.from("profiles").insert({
    id: ownerId,
    organization_id: LOCAL_QA_ORG_ID,
    branch_id: branch.id,
    full_name: "Local QA Owner",
    role: "owner",
    is_active: true,
  });
  if (insertError) {
    if (authCreated) await serviceClient.auth.admin.deleteUser(ownerId);
    throw new Error(`Local owner profile insert failed: ${insertError.code}`);
  }
  return { created: true, ownerId, authCreated, cleanupAuth };
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function phaseDirectory(): string {
  const phase = process.env.EXPENSE_DATETIME_PHASE || "current";
  return `${ARTIFACT_ROOT}/${phase}`;
}

function attachErrors(page: Page): BrowserErrors {
  const errors: BrowserErrors = {
    pageErrors: [],
    consoleErrors: [],
    requestFailures: [],
    httpErrors: [],
    expectedActionAborts: 0,
    instrumentationWarnings: 0,
    contextCloseTimeouts: 0,
    dialogs: 0,
  };
  page.on("pageerror", (error) => errors.pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const evidence = `${message.text()} ${message.location().url}`;
    if (
      /clarity\.ms|_vercel\/(?:insights|speed-insights)|saledock-logo-(?:full|mark)\.png|ERR_ABORTED/i.test(
        evidence,
      )
    ) {
      errors.instrumentationWarnings += 1;
      return;
    }
    errors.consoleErrors.push(evidence);
  });
  page.on("response", (response) => {
    if (response.status() < 400) return;
    const url = new URL(response.url());
    if (
      /\/rest\/v1\/user_ui_preferences$/.test(url.pathname) ||
      /\/saledock-logo-(?:full|mark)\.png$/.test(url.pathname) ||
      /^\/_vercel\/(?:insights|speed-insights)\//.test(url.pathname)
    ) {
      errors.instrumentationWarnings += 1;
      return;
    }
    errors.httpErrors.push(`${response.status()} ${url.pathname}`);
  });
  page.on("requestfailed", (request) => {
    const pathname = new URL(request.url()).pathname;
    if (/^\/_vercel\/(?:insights|speed-insights)/.test(pathname)) return;
    if (
      request.failure()?.errorText === "net::ERR_ABORTED" &&
      request.method() === "GET" &&
      (request.resourceType() === "fetch" ||
        pathname.startsWith("/_next/static/"))
    ) {
      return;
    }
    if (
      request.failure()?.errorText === "net::ERR_ABORTED" &&
      request.method() === "POST" &&
      pathname === "/expenses"
    ) {
      errors.expectedActionAborts += 1;
      return;
    }
    errors.requestFailures.push(`${request.method()} ${pathname}`);
  });
  page.on("dialog", async (dialog) => {
    errors.dialogs += 1;
    await dialog.dismiss();
  });
  return errors;
}

async function tableSignature(
  admin: AdminClient,
  table: string,
): Promise<Signature> {
  const { data, error } = await admin
    .from(table)
    .select("*")
    .order("id", { ascending: true });
  if (error)
    throw new Error(`Safety signature failed for ${table}: ${error.code}`);
  return { count: data?.length ?? 0, hash: digest(data ?? []) };
}

async function captureSafetySnapshot(
  admin: AdminClient,
): Promise<SafetySnapshot> {
  return Object.fromEntries(
    await Promise.all(
      SAFETY_TABLES.map(
        async (table) => [table, await tableSignature(admin, table)] as const,
      ),
    ),
  );
}

async function ownerFixtureContext(
  admin: AdminClient,
): Promise<{ ownerId: string; branchId: string }> {
  const { data: owner, error } = await admin
    .from("profiles")
    .select("id, branch_id")
    .eq("organization_id", LOCAL_QA_ORG_ID)
    .eq("role", "owner")
    .limit(1)
    .single();
  if (error || !owner?.id || !owner.branch_id) {
    if (error || !owner?.id)
      throw new Error("Local owner fixture context is unavailable.");
    const { data: branch, error: branchError } = await admin
      .from("branches")
      .select("id")
      .eq("organization_id", LOCAL_QA_ORG_ID)
      .limit(1)
      .single();
    if (branchError || !branch?.id) {
      throw new Error("Local branch fixture context is unavailable.");
    }
    return { ownerId: owner.id as string, branchId: branch.id as string };
  }
  return { ownerId: owner.id as string, branchId: owner.branch_id as string };
}

async function newOwnerPage(
  browser: Browser,
): Promise<{ context: BrowserContext; page: Page; errors: BrowserErrors }> {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    timezoneId: "Asia/Karachi",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  page.setDefaultNavigationTimeout(30_000);
  const errors = attachErrors(page);
  await page.addInitScript(() => {
    localStorage.setItem(
      "analytics-consent",
      JSON.stringify({
        value: "rejected",
        version: "expense-datetime-qa",
        timestamp: new Date().toISOString(),
      }),
    );
    localStorage.setItem(
      "saledock-sidebar-preferences-v1",
      JSON.stringify({
        analyticsConsent: "rejected",
        marketingConsent: "rejected",
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
  await loginLocalOwnerDirectly(
    page,
    "owner@saledock.local",
    LOCAL_OWNER_PASSWORD,
  );
  await expect(page.locator("header h1").first()).toHaveText("Dashboard", {
    timeout: 30_000,
  });
  return { context, page, errors };
}

async function closeContext(
  context: BrowserContext,
  errors: BrowserErrors,
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const closed = await Promise.race([
    context
      .close()
      .then(() => true)
      .catch(() => false),
    new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(false), 10_000);
    }),
  ]);
  if (timer) clearTimeout(timer);
  if (!closed) errors.contextCloseTimeouts += 1;
}

async function readExpense(
  admin: AdminClient,
  id: string,
): Promise<ExpenseRecord> {
  const { data, error } = await admin
    .from("expenses")
    .select(
      "id, category, amount, payment_method, vendor_name, notes, status, spent_at",
    )
    .eq("id", id)
    .eq("organization_id", LOCAL_QA_ORG_ID)
    .single();
  if (error || !data)
    throw new Error(`Expense read failed: ${error?.code ?? "missing"}`);
  return {
    ...data,
    amount: Number(data.amount),
    spent_at: new Date(data.spent_at as string).toISOString(),
  } as ExpenseRecord;
}

async function markerExpenses(
  admin: AdminClient,
  marker: string,
): Promise<ExpenseRecord[]> {
  const { data, error } = await admin
    .from("expenses")
    .select(
      "id, category, amount, payment_method, vendor_name, notes, status, spent_at",
    )
    .eq("organization_id", LOCAL_QA_ORG_ID)
    .like("vendor_name", `${marker}%`)
    .order("id", { ascending: true });
  if (error) throw new Error(`Marked expense read failed: ${error.code}`);
  return (data ?? []).map((record) => ({
    ...record,
    amount: Number(record.amount),
    spent_at: new Date(record.spent_at as string).toISOString(),
  })) as ExpenseRecord[];
}

async function requireOneStableMarkerExpense(
  admin: AdminClient,
  marker: string,
): Promise<ExpenseRecord> {
  let row: ExpenseRecord | undefined;
  for (let observation = 0; observation < 3; observation += 1) {
    const rows = await pollFor(
      `stable marked expense observation ${observation + 1}`,
      () => markerExpenses(admin, marker),
      (value) => value.length >= 1,
    );
    expect(
      rows,
      `marked expense count observation ${observation + 1}`,
    ).toHaveLength(1);
    row = rows[0];
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return row!;
}

async function businessFormData(page: Page): Promise<Record<string, string>> {
  return expenseForm(page).evaluate((element) => {
    const allowed = new Set([
      "id",
      "category",
      "amount",
      "payment_method",
      "vendor_name",
      "notes",
      "spent_at",
    ]);
    return Object.fromEntries(
      [...new FormData(element as HTMLFormElement).entries()]
        .filter(
          ([name, value]) => allowed.has(name) && typeof value === "string",
        )
        .map(([name, value]) => [name, String(value)]),
    );
  });
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
  if (!accept(latest))
    throw new Error(`${label} did not reach the expected state.`);
  return latest;
}

async function expenseAuditsSince(admin: AdminClient, startedAt: string) {
  const { data, error } = await admin
    .from("audit_logs")
    .select("id, action, details, created_at")
    .eq("organization_id", LOCAL_QA_ORG_ID)
    .eq("module", "expenses")
    .gte("created_at", startedAt)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Expense audit read failed: ${error.code}`);
  return data ?? [];
}

async function waitForAuditCount(
  admin: AdminClient,
  startedAt: string,
  expected: number,
): Promise<string[]> {
  const rows = await pollFor(
    `expense audit count ${expected}`,
    () => expenseAuditsSince(admin, startedAt),
    (value) => value.length === expected,
  );
  return rows.map((row) => row.id as string);
}

async function waitForStableAuditCount(
  admin: AdminClient,
  startedAt: string,
  expected: number,
): Promise<string[]> {
  await waitForAuditCount(admin, startedAt, expected);
  let ids: string[] = [];
  for (let observation = 0; observation < 3; observation += 1) {
    await new Promise((resolve) => setTimeout(resolve, 150));
    const rows = await expenseAuditsSince(admin, startedAt);
    expect(
      rows,
      `stable expense audit count observation ${observation + 1}`,
    ).toHaveLength(expected);
    ids = rows.map((row) => row.id as string);
  }
  return ids;
}

function expenseForm(page: Page) {
  return page
    .locator("form")
    .filter({ has: page.locator('input[name="category"]') })
    .first();
}

async function waitForHydratedForm(page: Page): Promise<void> {
  const form = expenseForm(page);
  await expect(form).toBeVisible();
  const trigger = form.getByRole("button", {
    name: "Payment method",
    exact: true,
  });
  await trigger.click();
  await expect(form.getByRole("listbox")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(form.getByRole("listbox")).toBeHidden();
  await form.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

async function choosePayment(page: Page, label: string): Promise<void> {
  const form = expenseForm(page);
  const trigger = form.getByRole("button", {
    name: "Payment method",
    exact: true,
  });
  await trigger.click();
  await form.getByRole("option", { name: label, exact: true }).click();
}

async function createExpenseThroughUi(
  browser: Browser,
  admin: AdminClient,
  marker: string,
  errors: BrowserErrors[],
): Promise<{
  record: ExpenseRecord;
  posts: number;
  submittedDateTime: string;
  formData: Record<string, string>;
  settled: boolean;
}> {
  const session = await newOwnerPage(browser);
  errors.push(session.errors);
  let posts = 0;
  session.page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname === "/expenses"
    )
      posts += 1;
  });
  try {
    await session.page.goto("/expenses");
    await expect(session.page.locator("header h1").first()).toHaveText(
      "Expenses",
    );
    const details = session.page
      .locator("details")
      .filter({ hasText: "Add a new expense" })
      .first();
    if (
      !(await details.evaluate(
        (element) => (element as HTMLDetailsElement).open,
      ))
    ) {
      await details.locator("summary").click();
    }
    await waitForHydratedForm(session.page);
    const form = expenseForm(session.page);
    await form.locator('input[name="category"]').fill("Utilities");
    await form.locator('input[name="amount"]').fill("75");
    await choosePayment(session.page, "Card");
    await form.locator('input[name="vendor_name"]').fill(marker);
    await form.locator('textarea[name="notes"]').fill(`${marker} baseline`);
    const dateInput = form.locator('input[name="spent_at"]');
    await dateInput.fill("2026-07-24T00:17");
    const submittedDateTime = await dateInput.inputValue();
    const formData = await businessFormData(session.page);
    expect(formData).toMatchObject({
      category: "Utilities",
      amount: "75",
      payment_method: "card",
      vendor_name: marker,
      notes: `${marker} baseline`,
      spent_at: "2026-07-24T00:17",
    });
    const response = session.page.waitForResponse(
      (candidate) =>
        candidate.request().method() === "POST" &&
        new URL(candidate.url()).pathname === "/expenses",
      { timeout: 15_000 },
    );
    await form
      .getByRole("button", { name: "Add expense", exact: true })
      .click();
    expect((await response).status(), "create response").toBe(200);
    const record = await requireOneStableMarkerExpense(admin, marker);
    const settled = await session.page
      .getByText("Expense recorded.", { exact: true })
      .waitFor({ state: "visible", timeout: 30_000 })
      .then(() => true)
      .catch(() => false);
    expect(posts, "create POST count").toBe(1);
    return {
      record: {
        ...record!,
        amount: Number(record!.amount),
        spent_at: new Date(record!.spent_at).toISOString(),
      },
      posts,
      submittedDateTime,
      formData,
      settled,
    };
  } finally {
    await closeContext(session.context, session.errors);
  }
}

async function updateExpenseThroughUi(
  browser: Browser,
  admin: AdminClient,
  id: string,
  label: string,
  mutate: (page: Page) => Promise<void>,
  expected: (record: ExpenseRecord) => boolean,
  errors: BrowserErrors[],
): Promise<MutationResult> {
  const session = await newOwnerPage(browser);
  errors.push(session.errors);
  let posts = 0;
  session.page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname === "/expenses"
    )
      posts += 1;
  });
  try {
    await session.page.goto(`/expenses?edit=${id}`);
    await expect(session.page.locator("header h1").first()).toHaveText(
      "Expenses",
    );
    await waitForHydratedForm(session.page);
    const form = expenseForm(session.page);
    await expect(form.locator('input[name="id"]')).toHaveValue(id);
    const dateInput = form.locator('input[name="spent_at"]');
    await mutate(session.page);
    const submittedDateTime = await dateInput.inputValue();
    if (label === "intentional-time") {
      expect(submittedDateTime, `${label}: intentional datetime value`).toBe(
        "2026-07-24T05:30",
      );
    }
    const formData = await businessFormData(session.page);
    const response = session.page.waitForResponse(
      (candidate) =>
        candidate.request().method() === "POST" &&
        new URL(candidate.url()).pathname === "/expenses",
      { timeout: 15_000 },
    );
    await form
      .getByRole("button", { name: "Update expense", exact: true })
      .click();
    expect((await response).status(), `${label}: response`).toBe(200);
    const record = await pollFor(
      `${label}: database update`,
      () => readExpense(admin, id),
      expected,
    );
    const settled = await session.page
      .getByText("Expense updated.", { exact: true })
      .waitFor({ state: "visible", timeout: 30_000 })
      .then(() => true)
      .catch(() => false);
    expect(posts, `${label}: POST count`).toBe(1);
    return {
      label,
      submittedDateTime,
      storedDateTime: record.spent_at,
      formData,
      settled,
      posts,
    };
  } finally {
    await closeContext(session.context, session.errors);
  }
}

async function verifyForeignExpenseIsolation(
  browser: Browser,
  admin: AdminClient,
  ownExpenseId: string,
  foreignExpenseId: string,
  expectedSpentAt: string,
  errors: BrowserErrors[],
): Promise<{ posts: number; errorRendered: boolean }> {
  const session = await newOwnerPage(browser);
  errors.push(session.errors);
  let posts = 0;
  session.page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname === "/expenses"
    )
      posts += 1;
  });
  try {
    await session.page.goto(`/expenses?edit=${ownExpenseId}`);
    await expect(session.page.locator("header h1").first()).toHaveText(
      "Expenses",
    );
    await waitForHydratedForm(session.page);
    const form = expenseForm(session.page);
    const idInput = form.locator('input[name="id"]');
    await idInput.evaluate((element, value) => {
      const input = element as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }, foreignExpenseId);
    await expect(idInput).toHaveValue(foreignExpenseId);
    await form.locator('textarea[name="notes"]').fill("forged foreign update");
    const response = session.page.waitForResponse(
      (candidate) =>
        candidate.request().method() === "POST" &&
        new URL(candidate.url()).pathname === "/expenses",
      { timeout: 15_000 },
    );
    await form
      .getByRole("button", { name: "Update expense", exact: true })
      .click();
    expect((await response).status(), "foreign update response").toBe(200);
    const errorRendered = await session.page
      .getByText("We couldn't save this expense. Please try again.", {
        exact: true,
      })
      .waitFor({ state: "visible", timeout: 30_000 })
      .then(() => true)
      .catch(() => false);
    const { data, error } = await admin
      .from("expenses")
      .select("notes, spent_at")
      .eq("id", foreignExpenseId)
      .single();
    if (error || !data)
      throw new Error(`Foreign expense verification failed: ${error?.code}`);
    expect(data.notes, "foreign expense notes remain unchanged").toBe(
      "foreign baseline",
    );
    expect(
      new Date(data.spent_at).toISOString(),
      "foreign timestamp remains unchanged",
    ).toBe(expectedSpentAt);
    expect(posts, "foreign update POST count").toBe(1);
    return { posts, errorRendered };
  } finally {
    await closeContext(session.context, session.errors);
  }
}

async function voidAndRestore(
  browser: Browser,
  admin: AdminClient,
  id: string,
  marker: string,
  expectedSpentAt: string,
  errors: BrowserErrors[],
): Promise<void> {
  const session = await newOwnerPage(browser);
  errors.push(session.errors);
  try {
    await session.page.goto(`/expenses?q=${encodeURIComponent(marker)}`);
    const row = session.page.locator("tr").filter({ hasText: marker }).first();
    await row.getByRole("button", { name: "Void", exact: true }).click();
    const dialog = session.page.getByRole("dialog");
    await dialog
      .getByRole("button", { name: "Void expense", exact: true })
      .click();
    await pollFor(
      "void expense",
      () => readExpense(admin, id),
      (record) => record.status === "archived",
    );
    expect(
      (await readExpense(admin, id)).spent_at,
      "void preserves spent_at",
    ).toBe(expectedSpentAt);

    await session.page.goto(
      `/expenses?q=${encodeURIComponent(marker)}&archived=1`,
    );
    const archived = session.page
      .locator("tr")
      .filter({ hasText: marker })
      .first();
    await archived
      .getByRole("button", { name: "Restore", exact: true })
      .click();
    await pollFor(
      "restore expense",
      () => readExpense(admin, id),
      (record) => record.status === "active",
    );
    expect(
      (await readExpense(admin, id)).spent_at,
      "restore preserves spent_at",
    ).toBe(expectedSpentAt);
  } finally {
    await closeContext(session.context, session.errors);
  }
}

test.describe("expense datetime preservation", () => {
  test.skip(
    !isLocalPlaywrightRun(),
    "Requires loopback Next and local Supabase.",
  );
  test.setTimeout(25 * 60_000);

  test("Karachi wall time is stable across unrelated edits", async ({
    browser,
  }) => {
    const admin = getLocalAdminClient();
    const marker = `EXP-DT-${randomUUID().slice(0, 8)}`;
    const startedAt = new Date(Date.now() - 1000).toISOString();
    const before = await captureSafetySnapshot(admin);
    const browserErrors: BrowserErrors[] = [];
    const mutations: MutationResult[] = [];
    let expenseId: string | null = null;
    const foreignOrganizationId = randomUUID();
    const foreignBranchId = randomUUID();
    const foreignExpenseId = randomUUID();
    const foreignSpentAt = "2026-07-23T18:00:00.123Z";
    let disposableOwnerProfile: Awaited<
      ReturnType<typeof ensureOwnerProfile>
    > | null = null;
    const outputDirectory = phaseDirectory();
    mkdirSync(outputDirectory, { recursive: true });

    try {
      disposableOwnerProfile = await ensureOwnerProfile(admin);
      await ownerFixtureContext(admin);
      const { error: foreignOrganizationError } = await admin
        .from("organizations")
        .insert({
          id: foreignOrganizationId,
          name: "Expense datetime foreign QA",
        });
      if (foreignOrganizationError) {
        throw new Error(
          `Foreign organization fixture failed: ${foreignOrganizationError.code}`,
        );
      }
      const { error: foreignBranchError } = await admin
        .from("branches")
        .insert({
          id: foreignBranchId,
          organization_id: foreignOrganizationId,
          name: "Expense datetime foreign branch",
        });
      if (foreignBranchError) {
        throw new Error(
          `Foreign branch fixture failed: ${foreignBranchError.code}`,
        );
      }
      const { error: foreignExpenseError } = await admin
        .from("expenses")
        .insert({
          id: foreignExpenseId,
          organization_id: foreignOrganizationId,
          branch_id: foreignBranchId,
          category: "Utilities",
          amount: 75,
          payment_method: "card",
          vendor_name: "foreign fixture",
          notes: "foreign baseline",
          spent_at: foreignSpentAt,
        });
      if (foreignExpenseError) {
        throw new Error(
          `Foreign expense fixture failed: ${foreignExpenseError.code}`,
        );
      }
      const created = await createExpenseThroughUi(
        browser,
        admin,
        marker,
        browserErrors,
      );
      expenseId = created.record.id;
      await waitForAuditCount(admin, startedAt, 1);
      const createResult: MutationResult = {
        label: "create",
        submittedDateTime: created.submittedDateTime,
        storedDateTime: created.record.spent_at,
        formData: created.formData,
        settled: created.settled,
        posts: created.posts,
      };
      mutations.push(createResult);
      const foreignIsolation = await verifyForeignExpenseIsolation(
        browser,
        admin,
        expenseId,
        foreignExpenseId,
        foreignSpentAt,
        browserErrors,
      );
      expect(
        await expenseAuditsSince(admin, startedAt),
        "foreign update creates no audit",
      ).toHaveLength(1);

      mutations.push(
        await updateExpenseThroughUi(
          browser,
          admin,
          expenseId,
          "notes-only",
          async (page) => {
            const input = expenseForm(page).locator('textarea[name="notes"]');
            await input.fill(`${marker} notes`);
            await expect(input).toHaveValue(`${marker} notes`);
          },
          (record) => record.notes === `${marker} notes`,
          browserErrors,
        ),
      );
      await waitForAuditCount(admin, startedAt, 2);

      mutations.push(
        await updateExpenseThroughUi(
          browser,
          admin,
          expenseId,
          "amount-only",
          async (page) => {
            const input = expenseForm(page).locator('input[name="amount"]');
            await input.fill("80");
            await expect(input).toHaveValue("80");
          },
          (record) => record.amount === 80,
          browserErrors,
        ),
      );
      await waitForAuditCount(admin, startedAt, 3);

      mutations.push(
        await updateExpenseThroughUi(
          browser,
          admin,
          expenseId,
          "payment-only",
          async (page) => {
            await choosePayment(page, "Bank transfer");
            await expect(
              expenseForm(page).locator('input[name="payment_method"]'),
            ).toHaveValue("bank_transfer");
          },
          (record) => record.payment_method === "bank_transfer",
          browserErrors,
        ),
      );
      await waitForAuditCount(admin, startedAt, 4);

      mutations.push(
        await updateExpenseThroughUi(
          browser,
          admin,
          expenseId,
          "category-payment",
          async (page) => {
            await expenseForm(page)
              .locator('input[name="category"]')
              .fill("Marketing");
            await choosePayment(page, "Card");
            await expect(
              expenseForm(page).locator('input[name="category"]'),
            ).toHaveValue("Marketing");
            await expect(
              expenseForm(page).locator('input[name="payment_method"]'),
            ).toHaveValue("card");
          },
          (record) =>
            record.category === "Marketing" && record.payment_method === "card",
          browserErrors,
        ),
      );
      await waitForAuditCount(admin, startedAt, 5);

      mutations.push(
        await updateExpenseThroughUi(
          browser,
          admin,
          expenseId,
          "vendor-only",
          async (page) => {
            const input = expenseForm(page).locator(
              'input[name="vendor_name"]',
            );
            await input.fill(`${marker} updated`);
            await expect(input).toHaveValue(`${marker} updated`);
          },
          (record) => record.vendor_name === `${marker} updated`,
          browserErrors,
        ),
      );
      await waitForAuditCount(admin, startedAt, 6);

      mutations.push(
        await updateExpenseThroughUi(
          browser,
          admin,
          expenseId,
          "intentional-time",
          async (page) => {
            const input = expenseForm(page).locator('input[name="spent_at"]');
            await input.fill("2026-07-24T05:30");
            await expect(input).toHaveValue("2026-07-24T05:30");
          },
          (record) => record.spent_at !== mutations.at(-1)?.storedDateTime,
          browserErrors,
        ),
      );
      await waitForAuditCount(admin, startedAt, 7);

      const intentionalStoredAt = mutations.at(-1)!.storedDateTime;
      await voidAndRestore(
        browser,
        admin,
        expenseId,
        marker,
        intentionalStoredAt,
        browserErrors,
      );
      await waitForStableAuditCount(admin, startedAt, 8);

      const verification = await newOwnerPage(browser);
      browserErrors.push(verification.errors);
      try {
        await verification.page.goto("/dashboard");
        const dashboardExpenses = verification.page.locator(
          '[data-widget-id="widget-expenses"]',
        );
        await expect(dashboardExpenses).toBeVisible();
        await expect(dashboardExpenses).toContainText(/PKR\s*80(?:\.00)?/);
        await verification.page.goto(
          "/reports?range=custom&startDate=2026-07-24&endDate=2026-07-24",
        );
        await expect(
          verification.page.locator(
            '[data-stat-card-label="Total Operating Expenses"]',
          ),
        ).toBeVisible();
        await expect(
          verification.page
            .getByText(/PKR\s*80(?:\.00)?/, { exact: true })
            .first(),
        ).toBeVisible();
        await verification.page.goto(
          `/expenses?q=${encodeURIComponent(marker)}&from=2026-07-24&to=2026-07-24`,
        );
        await expect(
          verification.page.locator("tr").filter({ hasText: marker }).first(),
        ).toBeVisible();
        await verification.page.goto(`/expenses?edit=${expenseId}`);
        await expect(
          expenseForm(verification.page).locator('input[name="spent_at"]'),
        ).toHaveValue("2026-07-24T05:30");
        await verification.page.screenshot({
          path: `${outputDirectory}/expense-datetime.png`,
          fullPage: true,
        });
      } finally {
        await closeContext(verification.context, verification.errors);
      }

      writeFileSync(
        `${outputDirectory}/results.json`,
        JSON.stringify(
          { marker, mutations, foreignIsolation, browserErrors },
          null,
          2,
        ),
      );

      expect(
        mutations[0]!.storedDateTime,
        "create stores Karachi midnight as UTC",
      ).toBe("2026-07-23T19:17:00.000Z");
      for (const mutation of mutations.slice(1, 6)) {
        expect(
          mutation.storedDateTime,
          `${mutation.label}: exact instant`,
        ).toBe("2026-07-23T19:17:00.000Z");
      }
      expect(
        mutations[6]!.storedDateTime,
        "intentional edit converts once",
      ).toBe("2026-07-24T00:30:00.000Z");
      expect(
        mutations.every((mutation) => mutation.posts === 1),
        "one POST per save",
      ).toBe(true);
      expect(
        await markerExpenses(admin, marker),
        "one marked expense before cleanup",
      ).toHaveLength(1);
      expect(browserErrors.flatMap((value) => value.pageErrors)).toEqual([]);
      expect(browserErrors.flatMap((value) => value.consoleErrors)).toEqual([]);
      expect(browserErrors.flatMap((value) => value.requestFailures)).toEqual(
        [],
      );
      expect(browserErrors.flatMap((value) => value.httpErrors)).toEqual([]);
      expect(browserErrors.reduce((sum, value) => sum + value.dialogs, 0)).toBe(
        0,
      );
    } finally {
      const allTaskAudits = await expenseAuditsSince(admin, startedAt);
      if (allTaskAudits.length > 0) {
        const { error } = await admin
          .from("audit_logs")
          .delete()
          .in(
            "id",
            allTaskAudits.map((row) => row.id as string),
          );
        if (error) throw new Error(`Audit cleanup failed: ${error.code}`);
      }
      const allTaskExpenses = await markerExpenses(admin, marker);
      if (allTaskExpenses.length > 0) {
        const { error } = await admin
          .from("expenses")
          .delete()
          .in(
            "id",
            allTaskExpenses.map((row) => row.id),
          )
          .eq("organization_id", LOCAL_QA_ORG_ID);
        if (error) throw new Error(`Expense cleanup failed: ${error.code}`);
      }
      const { error: foreignExpenseCleanupError } = await admin
        .from("expenses")
        .delete()
        .eq("id", foreignExpenseId);
      if (foreignExpenseCleanupError) {
        throw new Error(
          `Foreign expense cleanup failed: ${foreignExpenseCleanupError.code}`,
        );
      }
      const { error: foreignBranchCleanupError } = await admin
        .from("branches")
        .delete()
        .eq("id", foreignBranchId);
      if (foreignBranchCleanupError) {
        throw new Error(
          `Foreign branch cleanup failed: ${foreignBranchCleanupError.code}`,
        );
      }
      const { error: foreignOrganizationCleanupError } = await admin
        .from("organizations")
        .delete()
        .eq("id", foreignOrganizationId);
      if (foreignOrganizationCleanupError) {
        throw new Error(
          `Foreign organization cleanup failed: ${foreignOrganizationCleanupError.code}`,
        );
      }
      if (disposableOwnerProfile?.created) {
        const { error } = await admin
          .from("profiles")
          .delete()
          .eq("id", disposableOwnerProfile.ownerId);
        if (error)
          throw new Error(`Local owner profile cleanup failed: ${error.code}`);
      }
      if (disposableOwnerProfile?.authCreated) {
        await disposableOwnerProfile.cleanupAuth();
      }
      expect(
        await expenseAuditsSince(admin, startedAt),
        "matching audits remaining",
      ).toEqual([]);
      expect(
        await markerExpenses(admin, marker),
        "marked expenses remaining",
      ).toEqual([]);
      expect(
        await captureSafetySnapshot(admin),
        "unrelated safety signatures",
      ).toEqual(before);
    }
  });
});
