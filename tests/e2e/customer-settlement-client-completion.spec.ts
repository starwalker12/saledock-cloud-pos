import {
  expect,
  test,
  type Browser,
  type Page,
  type Request,
} from "@playwright/test";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { performance } from "node:perf_hooks";
import { join } from "node:path";
import {
  getLocalAdminClient,
  isLocalPlaywrightRun,
  LOCAL_QA_ORG_ID,
  loginLocalOwnerDirectly,
} from "./helpers/local-supabase";

const LOCAL_QA_BRANCH_ID = "00000000-0000-4000-8000-000000000101";
const RETAINED_OUTPUT_DIR = process.env.CUSTOMER_SETTLEMENT_EVIDENCE_DIR;
if (RETAINED_OUTPUT_DIR && existsSync(RETAINED_OUTPUT_DIR)) {
  throw new Error(
    "Refusing to overwrite an existing customer-settlement evidence directory.",
  );
}
const OUTPUT_DIR = RETAINED_OUTPUT_DIR
  ? RETAINED_OUTPUT_DIR
  : mkdtempSync(
      join(tmpdir(), "saledock-customer-settlement-client-completion-"),
    );
const ROUND = process.env.CUSTOMER_SETTLEMENT_ROUND ?? "unspecified";
const SOURCE_REF = process.env.CUSTOMER_SETTLEMENT_SOURCE_REF ?? "unknown";
const SOURCE_SHA = process.env.CUSTOMER_SETTLEMENT_SOURCE_SHA ?? "unknown";
const OWNER_EMAIL = "owner@saledock.local";

const SAFETY_TABLES = [
  "customers",
  "invoices",
  "invoice_items",
  "payments",
  "credit_payments",
  "customer_ledger_entries",
  "products",
  "product_stock_lots",
  "stock_movements",
  "cash_shifts",
  "cash_movements",
  "daily_closings",
  "audit_logs",
  "organizations",
  "branches",
  "profiles",
] as const;

type SettlementField =
  | "customer_id"
  | "amount"
  | "method"
  | "reference_number"
  | "notes";

const SETTLEMENT_FIELDS: readonly SettlementField[] = [
  "customer_id",
  "amount",
  "method",
  "reference_number",
  "notes",
];

type SafeError = { name: string; message: string };
type BrowserErrorEvidence = {
  pageErrors: SafeError[];
  consoleErrors: Array<{ text: string; path: string }>;
  requestFailures: Array<{ method: string; path: string; error: string }>;
};

type RequestEvidence = {
  atMs: number;
  method: string;
  path: string;
  rawFieldNames: string[];
  normalizedFields: Record<string, string>;
  ignoredMetadataFieldNames: string[];
  missingFields: string[];
  conflictingFields: string[];
  parserResult: "pass" | "missing" | "conflicting" | "unavailable";
  responseStatus: number | null;
  responseHeadersAtMs: number | null;
  responseBodyObserved: boolean;
  responseBodyBytes: number | null;
  responseContainsActionSuccess: boolean | null;
  responseContainsSettledStatus: boolean | null;
  dataChunks: Array<{ atMs: number; bytes: number }>;
  loadingFinishedAtMs: number | null;
  loadingFailed: boolean;
};

type UiEvent = {
  event: string;
  atEpochMs: number;
  formConnected: boolean;
  pending: boolean;
  actionSuccess: boolean;
  settled: boolean;
  balanceText: string;
};

type DatabaseTruth = {
  balance: number;
  invoicePaid: number;
  invoiceDue: number;
  invoiceStatus: string;
  payments: number;
  paymentRows: Array<{
    amount: number;
    method: string;
    reference: string | null;
    notes: string | null;
  }>;
  creditLedger: number;
  audits: number;
};

type PaymentResult = {
  label: string;
  amount: number;
  expectedBalance: number;
  classification:
    | "complete-success"
    | "qualifying-client-completion-failure"
    | "other-failure";
  timing: {
    amountEnteredMs: number;
    submitClickMs: number;
    pendingBeginMs: number | null;
    actionPostBeginMs: number | null;
    responseHeadersMs: number | null;
    databaseExactMs: number | null;
    auditExactMs: number | null;
    pendingEndMs: number | null;
    successMs: number | null;
    settledMs: number | null;
  };
  request: RequestEvidence | null;
  database: DatabaseTruth;
  originalPage: {
    pathname: string;
    query: string;
    formConnected: boolean;
    pending: boolean;
    actionSuccess: boolean;
    settled: boolean;
    expectedBalanceVisible: boolean;
    stalePreviousBalanceVisible: boolean;
    formIdentity: string;
    events: UiEvent[];
  };
  independentPage: {
    expectedBalanceVisible: boolean;
    settlementFormVisible: boolean;
    settledVisible: boolean;
    paymentRowsVisible: boolean;
  };
  reloadAfterFailure: {
    expectedBalanceVisible: boolean;
    settlementFormVisible: boolean;
    settledVisible: boolean;
    paymentRowsVisible: boolean;
  } | null;
  screenshot: string | null;
};

function safeError(error: unknown): SafeError {
  const name = error instanceof Error ? error.name : "Error";
  const message = (error instanceof Error ? error.message : String(error))
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, "<id>")
    .replace(/(?:eyJ|sb-)[A-Za-z0-9._-]+/g, "<redacted>")
    .slice(0, 500);
  return { name, message };
}

function safePath(value: string): string {
  try {
    return new URL(value).pathname.replace(
      /[0-9a-f]{8}-[0-9a-f-]{27,}/gi,
      "<id>",
    );
  } catch {
    return "unavailable";
  }
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function recognizedField(rawName: string): SettlementField | null {
  if ((SETTLEMENT_FIELDS as readonly string[]).includes(rawName)) {
    return rawName as SettlementField;
  }
  const match =
    /^_(\d+)_(customer_id|amount|method|reference_number|notes)$/.exec(rawName);
  return match ? (match[2] as SettlementField) : null;
}

function parseMultipart(
  request: Request,
): Omit<
  RequestEvidence,
  | "atMs"
  | "method"
  | "path"
  | "responseStatus"
  | "responseHeadersAtMs"
  | "responseBodyObserved"
  | "responseBodyBytes"
  | "responseContainsActionSuccess"
  | "responseContainsSettledStatus"
  | "dataChunks"
  | "loadingFinishedAtMs"
  | "loadingFailed"
> {
  const contentType = request.headers()["content-type"] ?? "";
  const boundary = contentType
    .match(/boundary=(?:"([^"]+)"|([^;]+))/)
    ?.slice(1)
    .find(Boolean);
  const body = request.postDataBuffer();
  if (!boundary || !body) {
    return {
      rawFieldNames: [],
      normalizedFields: {},
      ignoredMetadataFieldNames: [],
      missingFields: [...SETTLEMENT_FIELDS],
      conflictingFields: [],
      parserResult: "unavailable",
    };
  }

  const entries: Array<[string, string]> = [];
  for (const part of body.toString("utf8").split(`--${boundary}`)) {
    const name = part.match(
      /content-disposition:[^\r\n]*\bname="([^"]+)"/i,
    )?.[1];
    if (!name) continue;
    const separator = part.indexOf("\r\n\r\n");
    if (separator < 0) continue;
    entries.push([
      name,
      part
        .slice(separator + 4)
        .replace(/\r\n$/, "")
        .replace(/\r\n--$/, ""),
    ]);
  }

  const candidates = new Map<SettlementField, string[]>();
  const ignored = new Set<string>();
  for (const [rawName, value] of entries) {
    const field = recognizedField(rawName);
    if (!field) {
      ignored.add(rawName);
      continue;
    }
    const values = candidates.get(field) ?? [];
    values.push(value);
    candidates.set(field, values);
  }

  const normalizedFields: Record<string, string> = {};
  const missingFields: string[] = [];
  const conflictingFields: string[] = [];
  for (const field of SETTLEMENT_FIELDS) {
    const values = candidates.get(field) ?? [];
    if (values.length === 0) {
      missingFields.push(field);
      continue;
    }
    const unique = [...new Set(values)];
    if (unique.length !== 1) {
      conflictingFields.push(field);
      continue;
    }
    normalizedFields[field] =
      field === "customer_id" ? "<generated-customer-id>" : unique[0]!;
  }

  return {
    rawFieldNames: entries.map(([name]) => name),
    normalizedFields,
    ignoredMetadataFieldNames: [...ignored].sort(),
    missingFields,
    conflictingFields,
    parserResult:
      conflictingFields.length > 0
        ? "conflicting"
        : missingFields.length > 0
          ? "missing"
          : "pass",
  };
}

async function businessSignatures(): Promise<Record<string, string>> {
  const admin = getLocalAdminClient();
  const signatures: Record<string, string> = {};
  for (const table of SAFETY_TABLES) {
    const { data, error } = await admin.from(table).select("*").order("id");
    if (error) {
      if (
        table === "cash_movements" &&
        /Could not find the table 'public\.cash_movements'/i.test(error.message)
      ) {
        signatures[table] = "unavailable-in-current-schema";
        continue;
      }
      throw new Error(`Safety signature failed for ${table}: ${error.message}`);
    }
    signatures[table] = digest(data ?? []);
  }
  return signatures;
}

async function seedFixture(marker: string) {
  const admin = getLocalAdminClient();
  const customerId = randomUUID();
  const invoiceId = randomUUID();
  const ledgerId = randomUUID();
  const invoiceNo = `QA-CS-${Date.now().toString(36).slice(-8)}`;

  const { data: owners, error: ownerError } = await admin
    .from("profiles")
    .select("id")
    .eq("organization_id", LOCAL_QA_ORG_ID)
    .eq("role", "owner")
    .eq("is_active", true)
    .limit(1);
  if (ownerError || !owners?.[0]?.id) {
    throw new Error(
      "Local owner profile is unavailable for settlement fixture.",
    );
  }
  const ownerId = owners[0].id;

  const { error: customerError } = await admin.from("customers").insert({
    id: customerId,
    organization_id: LOCAL_QA_ORG_ID,
    branch_id: LOCAL_QA_BRANCH_ID,
    name: `${marker} Customer`,
    phone: "+923009990012",
    credit_limit: 0,
    outstanding_balance: 1200,
    is_archived: false,
    notes: `${marker} disposable local fixture`,
  });
  if (customerError)
    throw new Error(`Customer fixture failed: ${customerError.message}`);

  const { error: invoiceError } = await admin.from("invoices").insert({
    id: invoiceId,
    organization_id: LOCAL_QA_ORG_ID,
    branch_id: LOCAL_QA_BRANCH_ID,
    customer_id: customerId,
    invoice_no: invoiceNo,
    status: "unpaid",
    subtotal: 1200,
    discount_total: 0,
    customer_credit_applied: 0,
    grand_total: 1200,
    amount_paid: 0,
    balance_due: 1200,
    amount_tendered: 0,
    change_due: 0,
    note: marker,
    created_by: ownerId,
  });
  if (invoiceError)
    throw new Error(`Invoice fixture failed: ${invoiceError.message}`);

  const { error: ledgerError } = await admin
    .from("customer_ledger_entries")
    .insert({
      id: ledgerId,
      organization_id: LOCAL_QA_ORG_ID,
      branch_id: LOCAL_QA_BRANCH_ID,
      customer_id: customerId,
      invoice_id: invoiceId,
      entry_type: "invoice_credit",
      direction: "debit",
      amount: 1200,
      balance_after: 1200,
      description: marker,
      created_by: ownerId,
    });
  if (ledgerError)
    throw new Error(`Ledger fixture failed: ${ledgerError.message}`);

  return { customerId, invoiceId, marker };
}

async function readDatabaseTruth(
  customerId: string,
  invoiceId: string,
): Promise<DatabaseTruth> {
  const admin = getLocalAdminClient();
  const [customer, invoice, payments, ledger, audits] = await Promise.all([
    admin
      .from("customers")
      .select("outstanding_balance")
      .eq("id", customerId)
      .single(),
    admin
      .from("invoices")
      .select("amount_paid, balance_due, status")
      .eq("id", invoiceId)
      .single(),
    admin
      .from("credit_payments")
      .select("amount, method, reference_number, notes")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: true }),
    admin
      .from("customer_ledger_entries")
      .select("id")
      .eq("customer_id", customerId)
      .eq("entry_type", "credit_payment"),
    admin
      .from("audit_logs")
      .select("id")
      .eq("organization_id", LOCAL_QA_ORG_ID)
      .eq("module", "customers")
      .eq("action", "customer.credit_payment")
      .contains("metadata", { customer_id: customerId }),
  ]);
  for (const result of [customer, invoice, payments, ledger, audits]) {
    if (result.error) {
      throw new Error(`Settlement truth query failed: ${result.error.message}`);
    }
  }
  return {
    balance: Number(customer.data?.outstanding_balance ?? Number.NaN),
    invoicePaid: Number(invoice.data?.amount_paid ?? Number.NaN),
    invoiceDue: Number(invoice.data?.balance_due ?? Number.NaN),
    invoiceStatus: invoice.data?.status ?? "missing",
    payments: payments.data?.length ?? 0,
    paymentRows: (payments.data ?? []).map((row) => ({
      amount: Number(row.amount),
      method: row.method,
      reference: row.reference_number,
      notes: row.notes,
    })),
    creditLedger: ledger.data?.length ?? 0,
    audits: audits.data?.length ?? 0,
  };
}

async function waitForDatabaseTruth(
  customerId: string,
  invoiceId: string,
  expectedBalance: number,
  expectedPayments: number,
  startedAt: number,
): Promise<{ truth: DatabaseTruth; databaseAtMs: number; auditAtMs: number }> {
  const deadline = performance.now() + 15_000;
  let databaseAtMs: number | null = null;
  while (performance.now() < deadline) {
    const truth = await readDatabaseTruth(customerId, invoiceId);
    const expectedPaid = 1200 - expectedBalance;
    const dataExact =
      truth.balance === expectedBalance &&
      truth.invoicePaid === expectedPaid &&
      truth.invoiceDue === expectedBalance &&
      truth.invoiceStatus === (expectedBalance === 0 ? "paid" : "partial") &&
      truth.payments === expectedPayments &&
      truth.creditLedger === expectedPayments;
    if (dataExact && databaseAtMs === null) {
      databaseAtMs = performance.now() - startedAt;
    }
    if (dataExact && truth.audits === expectedPayments) {
      return {
        truth,
        databaseAtMs: databaseAtMs ?? performance.now() - startedAt,
        auditAtMs: performance.now() - startedAt,
      };
    }
    await new Promise((resolve) => setTimeout(resolve, 75));
  }
  throw new Error(
    "Exact settlement database and audit truth did not complete in 15 seconds.",
  );
}

function installBrowserEvidence(
  page: Page,
  startedAt: number,
): BrowserErrorEvidence {
  const evidence: BrowserErrorEvidence = {
    pageErrors: [],
    consoleErrors: [],
    requestFailures: [],
  };
  page.on("pageerror", (error) => evidence.pageErrors.push(safeError(error)));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    const path = safePath(message.location().url);
    if (
      /\/_vercel\/(?:insights|speed-insights)|clarity\.ms/i.test(
        `${text} ${path}`,
      )
    ) {
      return;
    }
    evidence.consoleErrors.push({
      text: text
        .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, "<id>")
        .replace(/(?:eyJ|sb-)[A-Za-z0-9._-]+/g, "<redacted>")
        .slice(0, 500),
      path,
    });
  });
  page.on("requestfailed", (request) => {
    const path = safePath(request.url());
    const error = request.failure()?.errorText ?? "unknown";
    const isExpectedPrefetchAbort =
      /ERR_ABORTED/i.test(error) &&
      request.method() === "GET" &&
      (new URL(request.url()).searchParams.has("_rsc") ||
        new URL(request.url()).pathname.startsWith("/_next/"));
    if (isExpectedPrefetchAbort) return;
    evidence.requestFailures.push({
      method: request.method(),
      path,
      error: error.slice(0, 200),
    });
  });
  void startedAt;
  return evidence;
}

async function attachTransport(
  page: Page,
  detailPath: string,
  startedAt: number,
  requests: RequestEvidence[],
) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  const byRequestId = new Map<string, RequestEvidence>();

  cdp.on("Network.requestWillBeSent", (event) => {
    const safeDetail = detailPath.replace(
      /[0-9a-f]{8}-[0-9a-f-]{27,}/gi,
      "<id>",
    );
    if (
      event.request.method !== "POST" ||
      safePath(event.request.url) !== safeDetail
    ) {
      return;
    }
    const evidence = requests.at(-1);
    if (!evidence || evidence.responseStatus !== null) return;
    byRequestId.set(event.requestId, evidence);
  });
  cdp.on("Network.dataReceived", (event) => {
    const evidence = byRequestId.get(event.requestId);
    if (!evidence) return;
    evidence.dataChunks.push({
      atMs: performance.now() - startedAt,
      bytes: event.dataLength,
    });
  });
  cdp.on("Network.loadingFinished", (event) => {
    const evidence = byRequestId.get(event.requestId);
    if (!evidence) return;
    evidence.loadingFinishedAtMs = performance.now() - startedAt;
  });
  cdp.on("Network.loadingFailed", (event) => {
    const evidence = byRequestId.get(event.requestId);
    if (!evidence) return;
    evidence.loadingFailed = true;
  });

  page.on("request", (request) => {
    if (
      request.method() !== "POST" ||
      new URL(request.url()).pathname !== detailPath
    ) {
      return;
    }
    requests.push({
      atMs: performance.now() - startedAt,
      method: "POST",
      path: detailPath.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, "<id>"),
      ...parseMultipart(request),
      responseStatus: null,
      responseHeadersAtMs: null,
      responseBodyObserved: false,
      responseBodyBytes: null,
      responseContainsActionSuccess: null,
      responseContainsSettledStatus: null,
      dataChunks: [],
      loadingFinishedAtMs: null,
      loadingFailed: false,
    });
  });
  page.on("response", (response) => {
    if (
      response.request().method() !== "POST" ||
      new URL(response.url()).pathname !== detailPath
    ) {
      return;
    }
    const evidence = requests.find((entry) => entry.responseStatus === null);
    if (!evidence) return;
    evidence.responseStatus = response.status();
    evidence.responseHeadersAtMs = performance.now() - startedAt;
    void response
      .body()
      .then((body) => {
        evidence.responseBodyObserved = true;
        evidence.responseBodyBytes = body.byteLength;
        const text = body.toString("utf8");
        evidence.responseContainsActionSuccess = text.includes(
          "Credit payment recorded successfully.",
        );
        evidence.responseContainsSettledStatus = text.includes(
          "Customer balance is fully settled.",
        );
      })
      .catch(() => {
        evidence.responseBodyObserved = false;
      });
  });
  return cdp;
}

async function installUiObserver(
  page: Page,
  formIdentity: string,
): Promise<void> {
  const form = page.locator("form").filter({
    has: page.getByRole("button", {
      name: "Confirm & Save Settlement",
      exact: true,
    }),
  });
  await form.evaluate((element, identity) => {
    element.setAttribute("data-qa-settlement-form", identity);
    const target = window as typeof window & {
      __customerSettlementEvents?: UiEvent[];
      __customerSettlementObserver?: MutationObserver;
    };
    target.__customerSettlementEvents = [];
    const capture = () => {
      const currentForm = document.querySelector(
        `[data-qa-settlement-form="${identity}"]`,
      );
      const body = document.body.innerText;
      const creditCard = [...document.querySelectorAll("h3")].find(
        (heading) => heading.textContent?.trim() === "Credit utilization",
      )?.parentElement;
      const event: UiEvent = {
        event: "mutation",
        atEpochMs: Date.now(),
        formConnected: Boolean(currentForm?.isConnected),
        pending: body.includes("Processing..."),
        actionSuccess: body.includes("Credit payment recorded successfully."),
        settled: body.includes("Customer balance is fully settled."),
        balanceText: (creditCard?.innerText ?? "").slice(0, 250),
      };
      const events = target.__customerSettlementEvents!;
      const previous = events.at(-1);
      if (
        !previous ||
        previous.formConnected !== event.formConnected ||
        previous.pending !== event.pending ||
        previous.actionSuccess !== event.actionSuccess ||
        previous.settled !== event.settled ||
        previous.balanceText !== event.balanceText
      ) {
        events.push(event);
      }
    };
    target.__customerSettlementObserver?.disconnect();
    target.__customerSettlementObserver = new MutationObserver(capture);
    target.__customerSettlementObserver.observe(document.body, {
      attributes: true,
      characterData: true,
      childList: true,
      subtree: true,
    });
    capture();
  }, formIdentity);
}

async function readUiObserver(page: Page): Promise<UiEvent[]> {
  return page.evaluate(() => {
    const target = window as typeof window & {
      __customerSettlementEvents?: UiEvent[];
    };
    return target.__customerSettlementEvents ?? [];
  });
}

async function pageSettlementState(
  page: Page,
  expectedBalance: number,
  expectedPayments: number,
) {
  const body = await page.locator("body").innerText();
  const form = page.locator("[data-qa-settlement-form]");
  const creditCard = page
    .locator("h3")
    .filter({ hasText: /^Credit utilization$/ })
    .locator("..");
  const creditCardText = await creditCard.innerText();
  return {
    pathname: new URL(page.url()).pathname,
    query: new URL(page.url()).search,
    formConnected:
      (await form.count()) > 0
        ? await form.evaluate((node) => node.isConnected)
        : false,
    pending: body.includes("Processing..."),
    actionSuccess: body.includes("Credit payment recorded successfully."),
    settled: body.includes("Customer balance is fully settled."),
    expectedBalanceVisible:
      expectedBalance === 0
        ? creditCardText.includes("PKR 0") &&
          body.includes("Customer balance is fully settled.")
        : creditCardText.includes(
            `PKR ${expectedBalance.toLocaleString("en-US")}`,
          ),
    creditCardText,
    paymentRowsVisible:
      expectedPayments === 0 ||
      body.includes(`Settlement history`) ||
      body.includes("CREDIT PAYMENT"),
  };
}

async function independentState(
  browser: Browser,
  detailPath: string,
  expectedBalance: number,
  expectedPayments: number,
) {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await loginLocalOwnerDirectly(page);
    await page.goto(`${detailPath}?tab=payments`);
    await expect(page.getByRole("heading", { name: /Customer:/ })).toBeVisible({
      timeout: 30_000,
    });
    const state = await pageSettlementState(
      page,
      expectedBalance,
      expectedPayments,
    );
    return {
      expectedBalanceVisible: state.expectedBalanceVisible,
      settlementFormVisible: await page
        .getByText("Receive Settlement Payment", { exact: true })
        .isVisible()
        .catch(() => false),
      settledVisible: state.settled,
      paymentRowsVisible:
        (await page.getByText(/PKR\s+(?:400|300|500)/).count()) >=
        Math.min(expectedPayments, 1),
    };
  } finally {
    await context.close();
  }
}

async function runPayment(
  browser: Browser,
  page: Page,
  requests: RequestEvidence[],
  startedAt: number,
  customerId: string,
  invoiceId: string,
  label: string,
  amount: number,
  expectedBalance: number,
  expectedPayments: number,
  reference: string,
  notes: string,
  rapidClick = false,
): Promise<PaymentResult> {
  const detailPath = `/customers/${customerId}`;
  const formIdentity = `${ROUND}-${label}-${Date.now().toString(36)}`;
  const requestStartIndex = requests.length;

  const summary = page.locator(
    'summary:has-text("Receive Settlement Payment")',
  );
  const details = summary.locator("..");
  if (
    !(await details.evaluate((element) => (element as HTMLDetailsElement).open))
  ) {
    await summary.click();
  }
  await installUiObserver(page, formIdentity);

  const amountInput = page.getByRole("spinbutton", {
    name: "Amount (PKR)",
    exact: true,
  });
  const submit = page.getByRole("button", {
    name: "Confirm & Save Settlement",
    exact: true,
  });
  await amountInput.fill(String(amount));
  await page
    .getByRole("button", { name: "Payment method", exact: true })
    .click();
  await page.getByRole("option", { name: "CARD", exact: true }).click();
  if (reference) {
    await page
      .getByPlaceholder("e.g. Bank slip or Transaction ID")
      .fill(reference);
  }
  if (notes) {
    await page
      .getByPlaceholder("e.g. Partial recovery or Monthly clearance")
      .fill(notes);
  }
  const amountEnteredMs = performance.now() - startedAt;
  await page.waitForTimeout(20);
  const submitClickMs = performance.now() - startedAt;
  if (rapidClick) {
    await submit.evaluate((button) => {
      (button as HTMLButtonElement).click();
      (button as HTMLButtonElement).click();
    });
  } else {
    await submit.click();
  }

  let pendingBeginMs: number | null = null;
  try {
    await expect(
      page.getByRole("button", { name: "Processing...", exact: true }),
    ).toBeVisible({ timeout: 10_000 });
    pendingBeginMs = performance.now() - startedAt;
  } catch {
    // The classification below retains a non-pending completion separately.
  }

  const databaseResult = await waitForDatabaseTruth(
    customerId,
    invoiceId,
    expectedBalance,
    expectedPayments,
    startedAt,
  );

  const timeoutAt = submitClickMs + 30_000;
  let complete = false;
  while (performance.now() - startedAt < timeoutAt) {
    const state = await pageSettlementState(
      page,
      expectedBalance,
      expectedPayments,
    );
    const success =
      expectedBalance === 0
        ? state.settled && !state.pending && !state.formConnected
        : state.actionSuccess && !state.pending && state.expectedBalanceVisible;
    if (success) {
      complete = true;
      break;
    }
    await page.waitForTimeout(100);
  }

  const events = await readUiObserver(page);
  const original = await pageSettlementState(
    page,
    expectedBalance,
    expectedPayments,
  );
  const request = requests[requestStartIndex] ?? null;
  const independent = await independentState(
    browser,
    detailPath,
    expectedBalance,
    expectedPayments,
  );
  const previousBalance = expectedBalance + amount;
  const stalePreviousBalanceVisible = original.creditCardText.includes(
    `PKR ${previousBalance.toLocaleString("en-US")}`,
  );
  const businessExact =
    databaseResult.truth.balance === expectedBalance &&
    databaseResult.truth.payments === expectedPayments &&
    databaseResult.truth.creditLedger === expectedPayments &&
    databaseResult.truth.audits === expectedPayments;
  const qualifying =
    !complete &&
    businessExact &&
    requests.length - requestStartIndex === 1 &&
    request?.responseStatus === 200 &&
    original.pending &&
    !original.actionSuccess &&
    !original.settled &&
    original.formConnected &&
    stalePreviousBalanceVisible &&
    independent.expectedBalanceVisible;

  let screenshot: string | null = null;
  let reloadAfterFailure: PaymentResult["reloadAfterFailure"] = null;
  if (!complete) {
    screenshot = join(OUTPUT_DIR, `${ROUND}-${label}-original.png`);
    await page.screenshot({ path: screenshot, fullPage: true });
    await page.reload();
    await expect(page.getByRole("heading", { name: /Customer:/ })).toBeVisible({
      timeout: 30_000,
    });
    const reloaded = await pageSettlementState(
      page,
      expectedBalance,
      expectedPayments,
    );
    reloadAfterFailure = {
      expectedBalanceVisible: reloaded.expectedBalanceVisible,
      settlementFormVisible: await page
        .getByText("Receive Settlement Payment", { exact: true })
        .isVisible()
        .catch(() => false),
      settledVisible: reloaded.settled,
      paymentRowsVisible: reloaded.paymentRowsVisible,
    };
  }

  const pendingFalseEvent = events.find(
    (event, index) => index > 0 && !event.pending,
  );
  const successEvent = events.find((event) => event.actionSuccess);
  const settledEvent = events.find((event) => event.settled);
  return {
    label,
    amount,
    expectedBalance,
    classification: complete
      ? "complete-success"
      : qualifying
        ? "qualifying-client-completion-failure"
        : "other-failure",
    timing: {
      amountEnteredMs,
      submitClickMs,
      pendingBeginMs,
      actionPostBeginMs: request?.atMs ?? null,
      responseHeadersMs: request?.responseHeadersAtMs ?? null,
      databaseExactMs: databaseResult.databaseAtMs,
      auditExactMs: databaseResult.auditAtMs,
      pendingEndMs: pendingFalseEvent
        ? pendingFalseEvent.atEpochMs - events[0]!.atEpochMs + amountEnteredMs
        : null,
      successMs: successEvent
        ? successEvent.atEpochMs - events[0]!.atEpochMs + amountEnteredMs
        : null,
      settledMs: settledEvent
        ? settledEvent.atEpochMs - events[0]!.atEpochMs + amountEnteredMs
        : null,
    },
    request,
    database: databaseResult.truth,
    originalPage: {
      pathname: original.pathname.replace(
        /[0-9a-f]{8}-[0-9a-f-]{27,}/gi,
        "<id>",
      ),
      query: original.query,
      formConnected: original.formConnected,
      pending: original.pending,
      actionSuccess: original.actionSuccess,
      settled: original.settled,
      expectedBalanceVisible: original.expectedBalanceVisible,
      stalePreviousBalanceVisible,
      formIdentity,
      events,
    },
    independentPage: independent,
    reloadAfterFailure,
    screenshot,
  };
}

async function cleanupFixture(customerId: string, invoiceId: string) {
  const admin = getLocalAdminClient();
  const operations = [
    admin
      .from("audit_logs")
      .delete()
      .eq("organization_id", LOCAL_QA_ORG_ID)
      .eq("module", "customers")
      .contains("metadata", { customer_id: customerId }),
    admin
      .from("customer_ledger_entries")
      .delete()
      .eq("customer_id", customerId),
    admin.from("credit_payments").delete().eq("customer_id", customerId),
  ];
  for (const operation of operations) {
    const { error } = await operation;
    if (error) throw new Error(`Settlement cleanup failed: ${error.message}`);
  }
  const { error: invoiceError } = await admin
    .from("invoices")
    .delete()
    .eq("id", invoiceId);
  if (invoiceError)
    throw new Error(`Invoice cleanup failed: ${invoiceError.message}`);
  const { error: customerError } = await admin
    .from("customers")
    .delete()
    .eq("id", customerId);
  if (customerError)
    throw new Error(`Customer cleanup failed: ${customerError.message}`);

  const [customer, invoice, payments, ledger, audits] = await Promise.all([
    admin
      .from("customers")
      .select("id", { count: "exact", head: true })
      .eq("id", customerId),
    admin
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("id", invoiceId),
    admin
      .from("credit_payments")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", customerId),
    admin
      .from("customer_ledger_entries")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", customerId),
    admin
      .from("audit_logs")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", LOCAL_QA_ORG_ID)
      .eq("module", "customers")
      .contains("metadata", { customer_id: customerId }),
  ]);
  const remaining = [
    customer.count ?? 0,
    invoice.count ?? 0,
    payments.count ?? 0,
    ledger.count ?? 0,
    audits.count ?? 0,
  ];
  if (remaining.some((count) => count !== 0)) {
    throw new Error(`Settlement cleanup left rows: ${remaining.join(",")}`);
  }
  return remaining;
}

test("settles one exact customer payment lifecycle without retry or duplicate", async ({
  browser,
}) => {
  test.skip(
    !isLocalPlaywrightRun(),
    "Local settlement investigation is loopback-only.",
  );
  test.setTimeout(300_000);
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const startedAt = performance.now();
  const startedAtIso = new Date().toISOString();
  const marker = `QA-CS-${ROUND}-${Date.now().toString(36).slice(-6)}`;
  const before = await businessSignatures();
  const fixture = await seedFixture(marker);
  const context = await browser.newContext();
  const page = await context.newPage();
  const browserErrors = installBrowserEvidence(page, startedAt);
  const requests: RequestEvidence[] = [];
  let cdp: Awaited<ReturnType<typeof attachTransport>> | null = null;
  const paymentResults: PaymentResult[] = [];
  let cleanupRemaining: number[] = [];
  let fatalError: SafeError | null = null;
  let invalidAttempt: {
    amount: number;
    actionPosts: number;
    balanceAfter: number;
  } | null = null;

  try {
    await loginLocalOwnerDirectly(page, OWNER_EMAIL);
    const detailPath = `/customers/${fixture.customerId}`;
    cdp = await attachTransport(page, detailPath, startedAt, requests);
    await page.goto(detailPath);
    await expect(page.getByRole("heading", { name: /Customer:/ })).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      page.getByText("PKR 1,200", { exact: false }).first(),
    ).toBeVisible();

    const overpaymentSummary = page.locator(
      'summary:has-text("Receive Settlement Payment")',
    );
    await overpaymentSummary.click();
    await page
      .getByRole("spinbutton", { name: "Amount (PKR)", exact: true })
      .fill("1201");
    const requestCountBeforeOverpayment = requests.length;
    await page
      .getByRole("button", {
        name: "Confirm & Save Settlement",
        exact: true,
      })
      .click();
    await page.waitForTimeout(300);
    expect(requests.length).toBe(requestCountBeforeOverpayment);
    const balanceAfterInvalidAttempt = (
      await readDatabaseTruth(fixture.customerId, fixture.invoiceId)
    ).balance;
    expect(balanceAfterInvalidAttempt).toBe(1200);
    invalidAttempt = {
      amount: 1201,
      actionPosts: requests.length - requestCountBeforeOverpayment,
      balanceAfter: balanceAfterInvalidAttempt,
    };

    paymentResults.push(
      await runPayment(
        browser,
        page,
        requests,
        startedAt,
        fixture.customerId,
        fixture.invoiceId,
        "payment-400",
        400,
        800,
        1,
        "",
        "",
        true,
      ),
    );

    paymentResults.push(
      await runPayment(
        browser,
        page,
        requests,
        startedAt,
        fixture.customerId,
        fixture.invoiceId,
        "payment-300",
        300,
        500,
        2,
        "   ",
        "  \t ",
      ),
    );

    paymentResults.push(
      await runPayment(
        browser,
        page,
        requests,
        startedAt,
        fixture.customerId,
        fixture.invoiceId,
        "payment-500",
        500,
        0,
        3,
        "  QA-REF-500  ",
        "  QA final settlement  ",
      ),
    );

    const finalTruth = await readDatabaseTruth(
      fixture.customerId,
      fixture.invoiceId,
    );
    expect(finalTruth).toMatchObject({
      balance: 0,
      invoicePaid: 1200,
      invoiceDue: 0,
      invoiceStatus: "paid",
      payments: 3,
      creditLedger: 3,
      audits: 3,
    });
    expect(finalTruth.paymentRows).toEqual([
      { amount: 400, method: "card", reference: null, notes: null },
      { amount: 300, method: "card", reference: null, notes: null },
      {
        amount: 500,
        method: "card",
        reference: "QA-REF-500",
        notes: "QA final settlement",
      },
    ]);
    await page.screenshot({
      path: join(OUTPUT_DIR, "post-fix-normal.png"),
      fullPage: true,
    });
    expect(requests).toHaveLength(3);
    for (const request of requests) {
      expect(request.parserResult).toBe("pass");
      expect(request.responseStatus).toBe(200);
    }
    const unexpectedConsoleErrors = browserErrors.consoleErrors.filter(
      (entry) =>
        !(
          entry.path === "/rest/v1/user_ui_preferences" &&
          /status of 406 \(Not Acceptable\)/i.test(entry.text)
        ),
    );
    const actionTransportAborts = browserErrors.requestFailures.filter(
      (entry) =>
        entry.method === "POST" &&
        entry.path === "/customers/<id>" &&
        /ERR_ABORTED/i.test(entry.error),
    );
    const allActionHeadersAndBusinessTruthCompleted =
      requests.length === 3 &&
      requests.every(
        (request) =>
          request.parserResult === "pass" && request.responseStatus === 200,
      ) &&
      paymentResults.length === 3 &&
      paymentResults.every(
        (result) =>
          result.database.balance === result.expectedBalance &&
          result.database.payments ===
            (result.amount === 400 ? 1 : result.amount === 300 ? 2 : 3) &&
          result.database.creditLedger ===
            (result.amount === 400 ? 1 : result.amount === 300 ? 2 : 3) &&
          result.database.audits ===
            (result.amount === 400 ? 1 : result.amount === 300 ? 2 : 3),
      );
    const unexpectedRequestFailures = browserErrors.requestFailures.filter(
      (entry) => {
        const localVercelAssetAbort =
          entry.method === "GET" &&
          /^\/_vercel\/(?:insights|speed-insights)\/script\.js$/.test(
            entry.path,
          ) &&
          /ERR_ABORTED/i.test(entry.error);
        const completedActionTransportAbort =
          entry.method === "POST" &&
          entry.path === "/customers/<id>" &&
          /ERR_ABORTED/i.test(entry.error) &&
          allActionHeadersAndBusinessTruthCompleted;
        return !localVercelAssetAbort && !completedActionTransportAbort;
      },
    );
    expect(browserErrors.pageErrors).toHaveLength(0);
    expect(unexpectedConsoleErrors).toHaveLength(0);
    expect(actionTransportAborts.length).toBeLessThanOrEqual(requests.length);
    expect(unexpectedRequestFailures).toHaveLength(0);
  } catch (error) {
    fatalError = safeError(error);
    throw error;
  } finally {
    await cdp?.detach().catch(() => undefined);
    await context.close();
    cleanupRemaining = await cleanupFixture(
      fixture.customerId,
      fixture.invoiceId,
    );
    const after = await businessSignatures();
    const result = {
      round: ROUND,
      sourceRef: SOURCE_REF,
      sourceSha: SOURCE_SHA,
      startedAt: startedAtIso,
      finishedAt: new Date().toISOString(),
      browserVersion: browser.version(),
      environment: {
        applicationHost: new URL(
          process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
        ).host,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        retries: 0,
      },
      fixture: {
        marker,
        initialBalance: 1200,
        invalidOverpayment: 1201,
        settlementAmounts: [400, 300, 500],
      },
      invalidAttempt,
      requests,
      payments: paymentResults,
      browserErrors,
      safety: {
        signaturesEqual: JSON.stringify(before) === JSON.stringify(after),
        changedSignatures: Object.keys(before).filter(
          (table) => before[table] !== after[table],
        ),
        cleanupRemaining,
      },
      fatalError,
    };
    writeFileSync(
      join(OUTPUT_DIR, `${ROUND}-result.json`),
      `${JSON.stringify(result, null, 2)}\n`,
    );
    expect(result.safety.signaturesEqual).toBe(true);
    expect(cleanupRemaining.every((count) => count === 0)).toBe(true);
  }
});

test("settles the Action before a deliberately delayed customer-page refresh", async ({
  browser,
}) => {
  test.skip(!isLocalPlaywrightRun(), "Local settlement QA is loopback-only.");
  test.setTimeout(120_000);
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const marker = `QA-CS-DELAY-${Date.now().toString(36).slice(-6)}`;
  const before = await businessSignatures();
  const fixture = await seedFixture(marker);
  const context = await browser.newContext({
    timezoneId: "Asia/Karachi",
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  const detailPath = `/customers/${fixture.customerId}`;
  let actionPosts = 0;
  let actionResponseStatus: number | null = null;
  let actionServerComplete = false;
  let refreshClaimed = false;
  let refreshHeld = false;
  let releaseAction!: () => void;
  let releaseRefresh!: () => void;
  const actionGate = new Promise<void>((resolve) => {
    releaseAction = resolve;
  });
  const refreshGate = new Promise<void>((resolve) => {
    releaseRefresh = resolve;
  });

  await page.route(`**${detailPath}*`, async (route) => {
    const request = route.request();
    if (request.method() === "POST") {
      actionPosts += 1;
      const response = await route.fetch();
      actionResponseStatus = response.status();
      actionServerComplete = true;
      await actionGate;
      await route.fulfill({ response });
      return;
    }
    if (
      request.method() === "GET" &&
      request.headers().rsc === "1" &&
      actionServerComplete &&
      !refreshClaimed
    ) {
      refreshClaimed = true;
      const response = await route.fetch();
      refreshHeld = true;
      await refreshGate;
      await route.fulfill({ response }).catch(() => undefined);
      return;
    }
    await route.continue();
  });

  let cleanupRemaining: number[] = [];
  try {
    await loginLocalOwnerDirectly(page, OWNER_EMAIL);
    await page.goto(detailPath);
    await page
      .locator('summary:has-text("Receive Settlement Payment")')
      .click();
    await page
      .getByRole("spinbutton", { name: "Amount (PKR)", exact: true })
      .fill("400");
    await page
      .getByRole("button", { name: "Payment method", exact: true })
      .click();
    await page.getByRole("option", { name: "CARD", exact: true }).click();
    await page
      .getByRole("button", { name: "Confirm & Save Settlement", exact: true })
      .click();

    await expect(
      page.getByRole("button", { name: "Processing...", exact: true }),
    ).toBeVisible();
    const committed = await waitForDatabaseTruth(
      fixture.customerId,
      fixture.invoiceId,
      800,
      1,
      performance.now(),
    );
    expect(committed.truth).toMatchObject({
      balance: 800,
      payments: 1,
      creditLedger: 1,
      audits: 1,
    });
    expect(actionPosts).toBe(1);
    expect(actionServerComplete).toBe(true);
    expect(actionResponseStatus).toBe(200);
    await expect(
      page.getByRole("button", { name: "Processing...", exact: true }),
    ).toBeVisible();

    releaseAction();
    await expect(page.getByRole("status")).toHaveText(
      "Credit payment recorded successfully.",
      { timeout: 10_000 },
    );
    await expect(
      page.getByRole("button", {
        name: "Confirm & Save Settlement",
        exact: true,
      }),
    ).toBeEnabled();
    await expect.poll(() => refreshHeld).toBe(true);
    await expect(page.getByRole("status")).toHaveText(
      "Credit payment recorded successfully.",
    );
    await expect(page.getByText("Processing...", { exact: true })).toHaveCount(
      0,
    );
    await page.screenshot({
      path: join(OUTPUT_DIR, "post-fix-delayed-refresh.png"),
      fullPage: true,
    });

    releaseRefresh();
    await expect(
      page.getByText("PKR 800", { exact: false }).first(),
    ).toBeVisible({
      timeout: 15_000,
    });
    expect(actionPosts).toBe(1);

    writeFileSync(
      join(OUTPUT_DIR, "delayed-completion-result.json"),
      `${JSON.stringify(
        {
          actionPosts,
          actionResponseStatus,
          actionServerComplete,
          refreshHeld,
          pendingClearedBeforeRefreshRelease: true,
          successVisibleBeforeRefreshRelease: true,
          finalBalance: 800,
          payments: 1,
          ledgerEntries: 1,
          audits: 1,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    releaseAction();
    releaseRefresh();
    await page.unroute(`**${detailPath}*`).catch(() => undefined);
    await context.close();
    cleanupRemaining = await cleanupFixture(
      fixture.customerId,
      fixture.invoiceId,
    );
    const after = await businessSignatures();
    expect(JSON.stringify(after)).toBe(JSON.stringify(before));
    expect(cleanupRemaining.every((count) => count === 0)).toBe(true);
  }
});

test("releases pending after RPC and tenant errors without a financial mutation", async ({
  browser,
}) => {
  test.skip(!isLocalPlaywrightRun(), "Local settlement QA is loopback-only.");
  test.setTimeout(120_000);
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const admin = getLocalAdminClient();
  const marker = `QA-CS-ERROR-${Date.now().toString(36).slice(-6)}`;
  const before = await businessSignatures();
  const fixture = await seedFixture(marker);
  const foreignOrganizationId = randomUUID();
  const foreignBranchId = randomUUID();
  const foreignCustomerId = randomUUID();
  const context = await browser.newContext({ timezoneId: "Asia/Karachi" });
  const page = await context.newPage();
  const responses: number[] = [];

  try {
    const { error: organizationError } = await admin
      .from("organizations")
      .insert({
        id: foreignOrganizationId,
        name: `${marker} Foreign Organization`,
        slug: `${marker.toLowerCase()}-foreign`,
        onboarding_completed: true,
      });
    if (organizationError)
      throw new Error(`Foreign organization failed: ${organizationError.code}`);
    const { error: branchError } = await admin.from("branches").insert({
      id: foreignBranchId,
      organization_id: foreignOrganizationId,
      name: `${marker} Foreign Branch`,
    });
    if (branchError)
      throw new Error(`Foreign branch failed: ${branchError.code}`);
    const { error: customerError } = await admin.from("customers").insert({
      id: foreignCustomerId,
      organization_id: foreignOrganizationId,
      branch_id: foreignBranchId,
      name: `${marker} Foreign Customer`,
      phone: "+923009990099",
      outstanding_balance: 50,
      is_archived: false,
    });
    if (customerError)
      throw new Error(`Foreign customer failed: ${customerError.code}`);

    await loginLocalOwnerDirectly(page, OWNER_EMAIL);
    const detailPath = `/customers/${fixture.customerId}`;
    page.on("response", (response) => {
      if (
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === detailPath
      ) {
        responses.push(response.status());
      }
    });
    await page.goto(detailPath);
    await page
      .locator('summary:has-text("Receive Settlement Payment")')
      .click();
    const amount = page.getByRole("spinbutton", {
      name: "Amount (PKR)",
      exact: true,
    });
    const submit = page.getByRole("button", {
      name: "Confirm & Save Settlement",
      exact: true,
    });

    await amount.evaluate((input) => input.removeAttribute("max"));
    await amount.fill("1201");
    await submit.click();
    await expect(page.locator('p[role="alert"]')).toContainText(
      "Payment amount exceeds outstanding balance",
      {
        timeout: 10_000,
      },
    );
    await expect(submit).toBeEnabled();
    expect(
      await readDatabaseTruth(fixture.customerId, fixture.invoiceId),
    ).toMatchObject({
      balance: 1200,
      payments: 0,
      creditLedger: 0,
      audits: 0,
    });

    await page
      .locator("form")
      .filter({ has: submit })
      .locator('input[name="customer_id"]')
      .evaluate((input, customerId) => {
        (input as HTMLInputElement).value = customerId;
      }, foreignCustomerId);
    await amount.fill("25");
    await submit.click();
    await expect(page.locator('p[role="alert"]')).toHaveText(
      "We could not find this record for your shop. It may have been removed or you may not have access.",
      { timeout: 10_000 },
    );
    await expect(submit).toBeEnabled();
    expect(responses).toEqual([200, 200]);

    const { data: foreignCustomer, error: foreignReadError } = await admin
      .from("customers")
      .select("outstanding_balance")
      .eq("id", foreignCustomerId)
      .eq("organization_id", foreignOrganizationId)
      .single();
    if (foreignReadError)
      throw new Error(`Foreign customer read failed: ${foreignReadError.code}`);
    expect(Number(foreignCustomer.outstanding_balance)).toBe(50);
    const { count: foreignPayments } = await admin
      .from("credit_payments")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", foreignCustomerId);
    expect(foreignPayments ?? 0).toBe(0);

    writeFileSync(
      join(OUTPUT_DIR, "error-and-tenant-result.json"),
      `${JSON.stringify(
        {
          rpcErrorReleasedPending: true,
          rpcErrorPosts: 1,
          tenantErrorReleasedPending: true,
          tenantErrorPosts: 1,
          localMutations: 0,
          foreignMutations: 0,
          foreignBalance: 50,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    await context.close();
    await admin.from("customers").delete().eq("id", foreignCustomerId);
    await admin.from("branches").delete().eq("id", foreignBranchId);
    await admin.from("organizations").delete().eq("id", foreignOrganizationId);
    await cleanupFixture(fixture.customerId, fixture.invoiceId);
    const after = await businessSignatures();
    expect(JSON.stringify(after)).toBe(JSON.stringify(before));
  }
});

for (const viewport of [
  { width: 390, height: 844, label: "390x844" },
  { width: 320, height: 568, label: "320x568" },
]) {
  test(`keeps settlement controls reachable without overflow at ${viewport.label}`, async ({
    browser,
  }) => {
    test.skip(!isLocalPlaywrightRun(), "Local settlement QA is loopback-only.");
    test.setTimeout(90_000);
    mkdirSync(OUTPUT_DIR, { recursive: true });
    const marker = `QA-CS-MOBILE-${viewport.width}-${Date.now().toString(36).slice(-5)}`;
    const before = await businessSignatures();
    const fixture = await seedFixture(marker);
    const context = await browser.newContext({
      timezoneId: "Asia/Karachi",
      viewport: { width: viewport.width, height: viewport.height },
    });
    const page = await context.newPage();
    try {
      await loginLocalOwnerDirectly(page, OWNER_EMAIL);
      await page.goto(`/customers/${fixture.customerId}`);
      await page
        .locator('summary:has-text("Receive Settlement Payment")')
        .click();
      for (const control of [
        page.getByRole("spinbutton", { name: "Amount (PKR)", exact: true }),
        page.getByRole("button", { name: "Payment method", exact: true }),
        page.getByPlaceholder("e.g. Bank slip or Transaction ID"),
        page.getByPlaceholder("e.g. Partial recovery or Monthly clearance"),
        page.getByRole("button", {
          name: "Confirm & Save Settlement",
          exact: true,
        }),
      ]) {
        await control.scrollIntoViewIfNeeded();
        await expect(control).toBeVisible();
        const box = await control.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
      }
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);
      await page.screenshot({
        path: join(OUTPUT_DIR, `mobile-${viewport.label}.png`),
        fullPage: true,
      });
    } finally {
      await context.close();
      await cleanupFixture(fixture.customerId, fixture.invoiceId);
      const after = await businessSignatures();
      expect(JSON.stringify(after)).toBe(JSON.stringify(before));
    }
  });
}
