import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { test, expect, type Page } from "@playwright/test";
import { SUPPORTED_CURRENCIES, CURRENCY_LOCK_MESSAGE, currencyOptions, currencyDisplayMarker } from "../../src/lib/currency";
import { formatCurrency } from "../../src/lib/formatters";
import { loginLocalOwnerDirectly, isLocalPlaywrightRun } from "./helpers/local-supabase";
import { resetLocalAccountingFixture } from "./helpers/local-accounting-fixture";

test.describe.configure({ mode: "serial", retries: 0 });
test.use({ trace: "off", video: "off", screenshot: "off" });
test.skip(!isLocalPlaywrightRun(), "Synthetic local currency fixtures only");
type Fixture = { org: string; branch: string; actor: string; product: string; customer: string; supplier: string; invoice?: string; purchase?: string; email: string; password: string; code: string; client: SupabaseClient };
const fixtures: Fixture[] = [];
const observations: Record<string, unknown> = {};
const artifacts = path.join(process.env.QA_EVIDENCE_DIR || "test-results", `currency-${process.env.QA_RUN_LABEL || "browser"}`);
let admin: SupabaseClient, url: string, anon: string, empty: Fixture, mobile: Fixture;
function checked(error: { message: string } | null) { if (error) throw new Error(error.message); }
async function row(table: string, id: string, columns = "*") {
  const result = await admin.from(table).select(columns).eq("id", id).returns<Record<string, unknown>[]>().single(); checked(result.error); return result.data!;
}
async function fixture(code: string, posted = false) {
  const f = { org: randomUUID(), branch: randomUUID(), actor: "", product: randomUUID(), customer: randomUUID(), supplier: randomUUID(), email: `currency-${randomUUID()}@saledock.local`, password: randomUUID(), code, client: createClient(url, anon, { auth: { persistSession: false } }) } as Fixture;
  checked((await admin.from("organizations").insert({ id: f.org, name: `Synthetic ${code} Currency Shop`, currency_code: code, onboarding_completed: true })).error);
  fixtures.push(f);
  checked((await admin.from("branches").insert({ id: f.branch, organization_id: f.org, name: "Local currency branch" })).error);
  const auth = await admin.auth.admin.createUser({ email: f.email, password: f.password, email_confirm: true }); checked(auth.error); f.actor = auth.data.user!.id;
  checked((await admin.from("profiles").insert({ id: f.actor, organization_id: f.org, branch_id: f.branch, role: "owner", full_name: "Synthetic Currency Owner", is_active: true, onboarding_completed: true })).error);
  checked((await f.client.auth.signInWithPassword({ email: f.email, password: f.password })).error);
  checked((await admin.from("products").insert({ id: f.product, organization_id: f.org, branch_id: f.branch, name: "Synthetic service", type: "service", sale_price: 1250, purchase_price: 0, stock_quantity: 0, is_active: true })).error);
  checked((await admin.from("customers").insert({ id: f.customer, organization_id: f.org, branch_id: f.branch, name: "Synthetic customer", credit_limit: 1250 })).error);
  checked((await admin.from("suppliers").insert({ id: f.supplier, organization_id: f.org, name: "Synthetic supplier" })).error);
  if (posted) {
    const checkout = await f.client.rpc("pos_checkout", { p_branch_id: f.branch, p_customer_id: f.customer, p_cart: [{ product_id: f.product, quantity: 1, unit_price: 1250, discount: 0, service_transaction_amount: 1000, service_commission: 250, service_total_charged: 1250 }], p_discount_total: 0, p_amount_paid: 1250, p_payment_method: "cash", p_payment_ref: null, p_note: "Synthetic currency display acceptance", p_idempotency_key: randomUUID() });
    checked(checkout.error); f.invoice = checkout.data[0].invoice_id;
  }
  return f;
}
async function login(page: Page, f: Fixture) {
  await loginLocalOwnerDirectly(page, f.email, f.password);
  await expect(page.getByRole("region", { name: "Cookie consent", exact: true })).toHaveCount(0);
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}
async function select(page: Page, code: string) {
  const trigger = page.getByRole("button", { name: "Currency", exact: true });
  await trigger.click();
  const label = currencyOptions().find(c => c.value === code)!.label;
  await page.getByRole("option", { name: label, exact: true }).click();
  await expect(page.getByRole("button", { name: "Save regional settings", exact: true })).toBeEnabled();
  const [response] = await Promise.all([
    page.waitForResponse(r => r.request().method() === "POST" && !!r.request().headers()["next-action"]),
    page.getByRole("button", { name: "Save regional settings", exact: true }).click(),
  ]);
  expect(response.ok()).toBe(true);
  await expect(page.getByText("Regional settings saved.", { exact: true })).toBeVisible();
  await expect(trigger).toBeEnabled();
  await expect(trigger).toContainText(label);
  await expect(page.getByRole("button", { name: "Save regional settings", exact: true })).toBeDisabled();
}
test.beforeAll(async () => {
  fs.mkdirSync(artifacts, { recursive: true });
  const output = execFileSync("supabase", ["status", "--output", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const status = JSON.parse(output.slice(output.indexOf("{")));
  url = status.API_URL; anon = status.ANON_KEY;
  if (!url.startsWith("http://127.0.0.1:")) throw new Error("Loopback required");
  admin = createClient(url, status.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  empty = await fixture("PKR"); mobile = await fixture("PKR");
  for (const { code } of SUPPORTED_CURRENCIES) await fixture(code, true);
});
test.beforeEach(async ({ context, page }) => {
  page.on("pageerror", error => console.error("Currency browser page error:", error.message));
  page.on("console", message => {
    if (message.type() === "error" && message.text().includes("Unhandled SaleDock route error")) {
      console.error(message.text());
    }
  });
  await context.addInitScript(() => {
    localStorage.setItem("analytics-consent", "rejected");
    localStorage.setItem("saledock-sidebar-preferences-v1", JSON.stringify({ analyticsConsent: "rejected", marketingConsent: "rejected" }));
  });
});
test.afterAll(async () => {
  for (const f of fixtures) {
    await resetLocalAccountingFixture(admin, f.org);
    if (f.actor) checked((await admin.auth.admin.deleteUser(f.actor)).error);
    checked((await admin.from("organizations").delete().eq("id", f.org)).error);
  }
  observations.cleanup = { exactTaskShopsDeleted: fixtures.length, productionAccess: 0 };
  fs.writeFileSync(path.join(artifacts, "observations.json"), JSON.stringify(observations, null, 2));
});

test("empty shop PKR to USD to EUR and all shared options: metadata only, normal dirty/save behavior", async ({ page }) => {
  test.setTimeout(120000);
  await login(page, empty); await page.goto("/settings");
  const initial = await row("products", empty.product);
  await expect(page.getByRole("button", { name: "Currency", exact: true })).toContainText("Pakistani Rupee — PKR (₨)");
  await expect(page.getByRole("button", { name: "Save regional settings", exact: true })).toBeDisabled();
  await select(page, "USD"); expect((await row("organizations", empty.org)).currency_code).toBe("USD");
  await page.goto("/products"); await expect(page.getByText("$ 1,250", { exact: true }).first()).toBeVisible();
  await page.goto("/settings"); await select(page, "EUR"); expect((await row("organizations", empty.org)).currency_code).toBe("EUR");
  for (const { code } of SUPPORTED_CURRENCIES) {
  if (code !== "EUR") { await select(page, code); await expect.poll(async () => (await row("organizations", empty.org)).currency_code).toBe(code); }
  }
  expect(await row("products", empty.product)).toEqual(initial);
  expect((await row("organizations", empty.org)).currency_locked_at).toBeNull();
  await page.getByRole("button", { name: "Currency", exact: true }).click();
  await expect(page.getByRole("option")).toHaveCount(10);
  await expect(page.getByRole("option", { name: /Kuwaiti|Omani|Dinar/ })).toHaveCount(0);
  for (const theme of ["light", "dark"]) {
    await page.evaluate(t => document.documentElement.classList.toggle("dark", t === "dark"), theme);
    await noOverflow(page);
    await page.screenshot({ path: path.join(artifacts, `settings-desktop-options-${theme}.png`), animations: "disabled" });
  }
  await page.keyboard.press("Escape");
  observations.emptyShop = { PKR_USD_EUR: "allowed", allTenOptions: "allowed", productAmountsUnchanged: true, KWD_OMR_NewSelection: "not offered" };
});

test("stale Settings form after a new expense receives a friendly denial; raw authenticated/API bypass also denied", async ({ page }) => {
  await login(page, empty); await page.goto("/settings");
  await page.getByRole("button", { name: "Currency", exact: true }).click();
  await page.getByRole("option", { name: "US Dollar — USD ($)", exact: true }).click();
  const expense = await admin.from("expenses").insert({ organization_id: empty.org, branch_id: empty.branch, amount: 1250, notes: "Synthetic currency lock expense" }).select().single(); checked(expense.error);
  let posts = 0; page.on("request", r => { if (r.method() === "POST" && r.headers()["next-action"]) posts++; });
  await page.getByRole("button", { name: "Save regional settings", exact: true }).click();
  await expect(page.getByText(CURRENCY_LOCK_MESSAGE, { exact: true })).toBeVisible(); expect(posts).toBe(1);
  const denied = await empty.client.from("organizations").update({ currency_code: "USD" }).eq("id", empty.org); expect(denied.error?.message).toBe(CURRENCY_LOCK_MESSAGE);
  const bypass = await admin.from("organizations").update({ currency_code: "USD" }).eq("id", empty.org); expect(bypass.error?.message).toBe(CURRENCY_LOCK_MESSAGE);
  expect((await row("organizations", empty.org)).currency_code).toBe("QAR"); expect(await row("expenses", expense.data!.id)).toEqual(expense.data);
  await page.reload(); await expect(page.getByRole("button", { name: "Currency", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Currency", exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(artifacts, "settings-locked-desktop.png") });
  observations.activeShop = { expenseUnchanged: true, currency: "QAR", actionPosts: posts, authenticatedAndServiceApi: "denied", readonlyAfterReload: true };
});

test("all ten currency markers reach Dashboard/POS/Products and invoice/A4/thermal; portable PDF/share remains readable", async ({ page }) => {
  test.setTimeout(240000);
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  for (const f of fixtures.filter(f => f.invoice)) {
    await login(page, f);
    const prior = await row("invoices", f.invoice!);
    for (const route of ["/dashboard", "/pos", "/products", `/invoices/${f.invoice}`]) {
      await page.goto(route);
      await expect(page.getByText(formatCurrency(1250, f.code), { exact: true }).first()).toBeVisible({ timeout: 15000 });
    }
    const doc = page.locator("#invoice-print");
    await expect(doc).toContainText(formatCurrency(1250, f.code));
    await expect(page.locator(".thermal-print")).toContainText(formatCurrency(1250, f.code));
    await doc.screenshot({ path: path.join(artifacts, `invoice-${f.code}.png`) });
    if (["AED", "SAR", "QAR"].includes(f.code)) {
      await page.evaluate(() => { document.body.setAttribute("data-print-mode", "a4"); });
      await page.emulateMedia({ media: "print" });
      await page.pdf({ path: path.join(artifacts, `invoice-${f.code}.pdf`), format: "A4", printBackground: true });
      await page.emulateMedia({ media: "screen" });
      await page.evaluate(() => { document.body.setAttribute("data-print-mode", "thermal"); });
      await page.emulateMedia({ media: "print" });
      await expect(page.locator(".thermal-print")).toBeVisible();
      await page.locator(".thermal-print").screenshot({ path: path.join(artifacts, `thermal-${f.code}.png`) });
      await page.emulateMedia({ media: "screen" });
      await page.evaluate(() => { document.body.removeAttribute("data-print-mode"); });
      const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download Image", exact: true }).click()]);
      await download.saveAs(path.join(artifacts, `shared-${f.code}.png`));
    }
    expect(await row("invoices", f.invoice!)).toEqual(prior);
    observations[f.code] = { preferredSymbol: SUPPORTED_CURRENCIES.find(c => c.code === f.code)!.symbol, displayedMarker: currencyDisplayMarker(f.code), total: 1250, invoiceEconomicsAndSourceProvenanceUnchanged: true, screenA4Thermal: true };
  }
  expect(errors).toEqual([]); observations.pageErrors = errors;
});

test("portable currency across customer/supplier financial and operational screens, no money/trust mutation", async ({ page }) => {
  test.setTimeout(180000);
  const f = fixtures.find(f => f.code === "AED" && f.invoice)!;
  const product = randomUUID();
  checked((await admin.from("products").insert({ id: product, organization_id: f.org, branch_id: f.branch, name: "Synthetic stock item", sale_price: 1500, purchase_price: 1250, stock_quantity: 0 })).error);
  const purchase = await f.client.rpc("create_supplier_purchase", { p_supplier_id: f.supplier, p_branch_id: f.branch, p_purchase_date: new Date().toISOString().slice(0, 10), p_items: [{ product_id: product, quantity: 1, unit_cost: 1250 }], p_discount_total: 0, p_amount_paid: 0, p_reference_no: null, p_notes: null, p_payment_method: null, p_payment_ref: null }); checked(purchase.error); f.purchase = purchase.data[0].purchase_id;
  checked((await admin.from("expenses").insert({ organization_id: f.org, branch_id: f.branch, amount: 1250, notes: "Synthetic currency expense" })).error);
  checked((await admin.from("repairs").insert({ organization_id: f.org, branch_id: f.branch, job_no: "REP-CURRENCY", customer_name: "Synthetic repair customer", problem_description: "Synthetic local repair", estimated_cost: 1250 })).error);
  const sale = await f.client.rpc("pos_checkout", { p_branch_id: f.branch, p_customer_id: f.customer,
    p_cart: [{ product_id: product, quantity: 1, unit_price: 1500, discount: 0 }],
    p_discount_total: 0, p_amount_paid: 1500, p_payment_method: "cash", p_payment_ref: null,
    p_note: "Synthetic physical sale for return currency display", p_idempotency_key: randomUUID() }); checked(sale.error);
  const saleInvoice = sale.data[0].invoice_id;
  const item = await admin.from("invoice_items").select("id").eq("invoice_id", saleInvoice).single(); checked(item.error);
  const returned = await f.client.rpc("create_invoice_return", { p_invoice_id: saleInvoice, p_items: [{ invoice_item_id: item.data!.id, quantity: 1, restock_quantity: 0 }], p_refund_amount: null, p_refund_method: "cash", p_reference_number: null, p_notes: "Synthetic currency return display", p_idempotency_key: randomUUID() }); checked(returned.error);
  expect(returned.data[0]).toMatchObject({ subtotal: 1500, refund_amount: 1500, debt_relief: 0, restored_cost: 0 });
  const before = await row("invoices", f.invoice!);
  await login(page, f);
  const routes = ["/customers", `/customers/${f.customer}`, "/products?tab=suppliers", "/suppliers/dues", "/suppliers/purchases", `/suppliers/${f.supplier}/ledger`, `/suppliers/purchases/${f.purchase}`, "/expenses", "/repairs", "/reports", "/returns", `/returns/${returned.data[0].return_id}`, "/daily-closing"];
  for (const route of routes) {
    await page.goto(route); await expect(page.locator("main")).toHaveCount(1);
    await expect(page.locator("main[aria-busy=true]")).toHaveCount(0);
    await expect(page.locator("main")).toBeVisible();
    await expect(page.locator("body")).not.toContainText("Application error");
    if (route === "/products?tab=suppliers") {
      await expect(page.getByRole("cell", { name: "Synthetic supplier", exact: true })).toBeVisible();
      observations[route] = "Catalog contact table; no monetary field";
    } else {
      await expect(page.getByText(/AED [\d,]/).first()).toBeVisible();
      observations[route] = "ISO fallback renders normally";
    }
  }
  expect(await row("invoices", f.invoice!)).toEqual(before);
});

test("AED/SAR/QAR fallback is stable across desktop/mobile light/dark screens without missing currency glyphs", async ({ page }) => {
  test.setTimeout(480000);
  const matrix: Record<string, unknown>[] = [];
  for (const code of ["AED", "SAR", "QAR"]) {
    const f = fixtures.find(f => f.code === code && f.invoice)!;
    const before = await row("invoices", f.invoice!);
    await login(page, f);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      for (const theme of ["light", "dark"]) {
        for (const [name, route] of [["settings", "/settings"], ["dashboard", "/dashboard"], ["pos", "/pos"], ["invoice", `/invoices/${f.invoice}`], ["reports", "/reports"]]) {
          await page.goto(route);
          await page.evaluate(t => document.documentElement.classList.toggle("dark", t === "dark"), theme);
          if (name === "settings") {
            const selection = page.getByRole("button", { name: "Currency", exact: true });
            await expect(selection).toContainText(currencyOptions().find(c => c.value === code)!.label);
            await selection.scrollIntoViewIfNeeded();
          } else {
            await expect(page.getByText(new RegExp(`${code} [\\d,]`)).filter({ visible: true }).first()).toBeVisible();
          }
          await expect(page.locator("main")).not.toContainText(/[\u20C1\u20C3\uFDFC\uFFFD]/);
          await expect(page.locator("main")).not.toContainText(/\u062f\.\u0625|\u0631\.\u0633|\u0631\.\u0642/);
          await noOverflow(page);
          await page.screenshot({ path: path.join(artifacts, `${name}-${code}-${width}-${theme}.png`), animations: "disabled" });
          matrix.push({ code, width, theme, screen: name, marker: code, overflow: false, missingCurrencyGlyph: false });
        }
      }
    }
    expect(await row("invoices", f.invoice!)).toEqual(before);
  }
  observations.portableMatrix = matrix;
});

test("390px light/dark dropdown and locked Settings: keyboard-accessible and no page overflow", async ({ page }) => {
  test.setTimeout(90000);
  checked((await admin.from("expenses").insert({ organization_id: empty.org, branch_id: empty.branch,
    amount: 1250, notes: "Synthetic locked-settings control" })).error);
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, mobile); await page.goto("/settings");
  for (const theme of ["light", "dark"]) {
    await page.evaluate(t => document.documentElement.classList.toggle("dark", t === "dark"), theme);
    const currency = page.getByRole("button", { name: "Currency", exact: true });
    await currency.scrollIntoViewIfNeeded(); await currency.focus(); await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("listbox")).toBeVisible(); await noOverflow(page);
    await page.screenshot({ path: path.join(artifacts, `settings-mobile-options-${theme}.png`), animations: "disabled" });
    const option = page.getByRole("option", { name: "Australian Dollar — AUD (A$)", exact: true });
    await option.scrollIntoViewIfNeeded(); await option.focus(); await page.keyboard.press("Space");
    await expect(currency).toContainText("Australian Dollar — AUD (A$)");
    await page.screenshot({ path: path.join(artifacts, `settings-mobile-${theme}.png`) });
  }
  await page.getByRole("button", { name: "Save regional settings", exact: true }).click();
  await expect(page.getByText("Regional settings saved.", { exact: true })).toBeVisible();
  expect((await row("organizations", mobile.org)).currency_code).toBe("AUD");
  await login(page, empty); await page.goto("/settings");
  await page.getByRole("button", { name: "Currency", exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByRole("button", { name: "Currency", exact: true })).toBeDisabled();
  await expect(page.getByText(CURRENCY_LOCK_MESSAGE, { exact: true })).toBeVisible(); await noOverflow(page);
  await page.screenshot({ path: path.join(artifacts, "settings-locked-mobile.png") });
  observations.mobile390 = { lightDark: true, keyboardSelection: true, overflow: false, lockedSelection: true };
});
