import fs from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { isLocalPlaywrightRun, loginLocalOwnerDirectly } from "./helpers/local-supabase";
import { checked, createDiscountPrintFixture } from "./helpers/pos-discount-print-fixture";

test.describe.configure({ mode: "serial", retries: 0 });
test.use({ trace: "off", video: "off", screenshot: "off" });
test.skip(!isLocalPlaywrightRun(), "Local synthetic fixtures only");
let fixture: Awaited<ReturnType<typeof createDiscountPrintFixture>>;
const observations: Record<string, unknown> = {};
test.beforeAll(async () => { fixture = await createDiscountPrintFixture(); });
test.afterAll(async () => {
  if (fixture) await fixture.cleanup();
  if (process.env.QA_EVIDENCE_DIR) fs.writeFileSync(`${process.env.QA_EVIDENCE_DIR}/discount-${process.env.QA_RUN_LABEL}.json`, JSON.stringify({ ...observations, cleanup: "Exact task-created organization/user removed" }, null, 2));
});

async function openCart(page: Page, count = 1) {
  await page.addInitScript(() => {
    localStorage.setItem("analytics-consent", "rejected");
    localStorage.setItem("saledock-sidebar-preferences-v1", JSON.stringify({ analyticsConsent: "rejected", marketingConsent: "rejected" }));
  });
  await loginLocalOwnerDirectly(page, fixture.email, fixture.password);
  const reject = page.getByRole("button", { name: "Reject optional cookies", exact: true });
  if (await reject.isVisible()) await reject.click();
  await page.goto("/pos");
  await expect(page.getByTestId("cookie-consent-banner")).toHaveCount(0);
  const item = page.locator(`[data-product-id="${fixture.product}"]`);
  for (let i = 0; i < count; i++) await item.click();
}

async function replaceZero(input: Locator, text: string, touch = false) {
  await input.fill("0");
  await input.blur();
  await expect(input).toHaveValue("0");
  if (touch) await input.tap(); else await input.click();
  await input.pressSequentially(text);
  await expect(input).toHaveValue(text);
}

test("desktop mouse and keyboard edit zero, decimal, empty and individual non-zero digits", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openCart(page, 5);
  const line = page.getByRole("textbox", { name: "Discount", exact: true });
  const cart = page.getByRole("textbox", { name: "Cart discount", exact: true });
  for (const input of [line, cart]) {
    await input.click();
    for (const text of ["2", "20", "200"]) {
      await input.pressSequentially(text.at(-1)!);
      await expect(input).toHaveValue(text);
    }
    await input.evaluate((node: HTMLInputElement) => node.setSelectionRange(1, 2));
    await input.pressSequentially("3");
    await expect(input).toHaveValue("230");
    await replaceZero(input, "0.5");
    await input.fill("2.50");
    await expect(input).toHaveValue("2.50");
    await input.fill("");
    await expect(input).toHaveValue("");
    await input.press("Tab");
    await expect(input).toHaveValue("0");
    await input.click();
    await input.pressSequentially("-5");
    await expect(input).toHaveValue("5");
    await input.fill("0");
    // Reach each editor with actual Tab navigation; no select-all or delete needed.
    await input.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await expect(input).toBeFocused();
    await input.pressSequentially("200");
    await expect(input).toHaveValue("200");
    await input.fill("0");await input.blur();
  }
  const total = page.getByText("Grand total", { exact: true }).locator("..");
  await expect(page.getByText("Subtotal", { exact: true }).locator("..")).toContainText("4,995");
  await replaceZero(cart, "2");await expect(total).toContainText("4,993");
  await replaceZero(cart, "200");await expect(total).toContainText("4,795");
  const requests: Array<Record<string, unknown>> = [];
  page.on("request", request => {
    if (request.method() === "POST" && request.headers()["next-action"]) {
      const raw = request.postData();
      if (raw?.startsWith("[")) requests.push(JSON.parse(raw)[0]);
    }
  });
  await page.getByTestId("pos-exact-tender-btn").click();
  await page.getByTestId("pos-note-input").fill("QA36149 discount200 numeric");
  await page.getByTestId("pos-checkout-btn").click();
  await expect(page.getByText(/Sale recorded as INV-/)).toBeVisible({ timeout: 20_000 });
  const invoices = await fixture.admin.from("invoices").select("id,subtotal,discount_total,grand_total").eq("organization_id", fixture.org);
  checked(invoices.error);expect(invoices.data).toHaveLength(1);
  expect(Number(invoices.data![0].subtotal)).toBe(4995);
  expect(Number(invoices.data![0].discount_total)).toBe(200);
  expect(Number(invoices.data![0].grand_total)).toBe(4795);
  expect(requests).toHaveLength(1);expect(requests[0].discount_total).toBe(200);
  if (process.env.QA_EVIDENCE_DIR) await page.screenshot({ path: `${process.env.QA_EVIDENCE_DIR}/pos-desktop.png`, fullPage: true });
  observations.desktop = { lexicalEditing: "PASS", numericPayload: requests[0].discount_total, actionPosts: requests.length, subtotal: 4995, discount2Total: 4993, discount200Total: 4795 };
});

for (const scenario of [
  { label: "cart2", line: "0", cart: "2", quantity: 5, subtotal: 4995, total: 4993 },
  { label: "decimals", line: "0.5", cart: "2.50", quantity: 1, subtotal: 998.5, total: 996 },
  { label: "empty", line: "", cart: "", quantity: 1, subtotal: 999, total: 999 },
]) test(`${scenario.label}: checkout submits exactly one numeric discount payload`, async ({ page }) => {
  await openCart(page, scenario.quantity);
  await page.getByRole("textbox", { name: "Discount", exact: true }).fill(scenario.line);
  await page.getByRole("textbox", { name: "Cart discount", exact: true }).fill(scenario.cart);
  const requests: Array<Record<string, unknown>> = [];
  page.on("request", request => {
    if (request.method() === "POST" && request.headers()["next-action"] && request.postData()?.startsWith("[")) requests.push(JSON.parse(request.postData()!)[0]);
  });
  const note = `QA36149 ${scenario.label} boundary`;
  await page.getByTestId("pos-note-input").fill(note);
  await page.getByTestId("pos-exact-tender-btn").click();
  await page.getByTestId("pos-checkout-btn").click();
  await expect(page.getByText(/Sale recorded as INV-/)).toBeVisible({ timeout: 20_000 });
  expect(requests).toHaveLength(1);
  expect(requests[0].discount_total).toBe(Number(scenario.cart));
  expect((requests[0].cart as Array<{ discount: number }>)[0].discount).toBe(Number(scenario.line));
  const invoices = await fixture.admin.from("invoices").select("id,subtotal,discount_total,grand_total").eq("organization_id", fixture.org).eq("note", note);
  checked(invoices.error);expect(invoices.data).toHaveLength(1);
  expect(Number(invoices.data![0].subtotal)).toBe(scenario.subtotal);
  expect(Number(invoices.data![0].discount_total)).toBe(Number(scenario.cart));
  expect(Number(invoices.data![0].grand_total)).toBe(scenario.total);
  observations[scenario.label] = { actionPosts: 1, lineDiscount: Number(scenario.line), cartDiscount: Number(scenario.cart), subtotal: scenario.subtotal, total: scenario.total };
});

test("line discount persists once, decimal drafts stay numeric through tab/hold/resume", async ({ page }) => {
  await openCart(page, 5);
  const line = page.getByRole("textbox", { name: "Discount", exact: true });
  const cart = page.getByRole("textbox", { name: "Cart discount", exact: true });
  await replaceZero(line, "200");
  await expect(page.getByText("Subtotal", { exact: true }).locator("..")).toContainText("4,795");
  await page.getByTestId("pos-note-input").fill("QA36149 line200 numeric");
  await page.getByTestId("pos-exact-tender-btn").click();
  await page.getByTestId("pos-checkout-btn").click();
  await expect(page.getByText(/Sale recorded as INV-/)).toBeVisible({ timeout: 20_000 });
  const invoices = await fixture.admin.from("invoices").select("id").eq("organization_id", fixture.org).eq("note", "QA36149 line200 numeric");
  checked(invoices.error);expect(invoices.data).toHaveLength(1);
  const items = await fixture.admin.from("invoice_items").select("item_discount,line_total").eq("invoice_id", invoices.data![0].id);
  checked(items.error);expect(items.data).toHaveLength(1);
  expect(Number(items.data![0].item_discount)).toBe(200);expect(Number(items.data![0].line_total)).toBe(4795);
  await page.locator(`[data-product-id="${fixture.product}"]`).click();
  await replaceZero(line, "0.5");await replaceZero(cart, "2.5");
  await page.getByRole("button", { name: "+ New bill", exact: true }).first().click();
  const tabs = page.locator('div[class*="group flex shrink-0"]');
  await tabs.first().click();
  await expect(line).toHaveValue("0.5");await expect(cart).toHaveValue("2.5");
  await page.getByRole("button", { name: "Hold", exact: true }).click();
  const hold = page.getByRole("dialog", { name: "Hold bill" });
  await hold.getByPlaceholder("e.g. Counter 2 / Umar").fill("QA36149 decimals");
  await hold.getByRole("button", { name: "Hold bill", exact: true }).click();
  await expect(page.getByText("Bill held.", { exact: true })).toBeVisible();
  const held = await fixture.admin.from("pos_held_bills").select("cart,totals_snapshot").eq("organization_id", fixture.org).eq("label", "QA36149 decimals");
  checked(held.error);expect(held.data).toHaveLength(1);
  expect(held.data![0].cart[0].discount).toBe(0.5);
  expect(typeof held.data![0].cart[0].discount).toBe("number");
  expect(held.data![0].totals_snapshot.discount_total).toBe(2.5);
  await page.getByRole("button", { name: "Held bills", exact: true }).click();
  await page.getByRole("dialog", { name: "Held bills" }).getByRole("button", { name: "Resume", exact: true }).click();
  await page.getByRole("dialog", { name: "Resume held bill" }).getByRole("button", { name: "Resume", exact: true }).click();
  await expect(page.getByText("Held bill resumed.", { exact: true })).toBeVisible();
  await expect(line).toHaveValue("0.5");await expect(cart).toHaveValue("2.5");
  await expect(page.getByText("Grand total", { exact: true }).locator("..")).toContainText("996");
  observations.held = { lineDiscount: 0.5, cartDiscount: 2.5, numericHeldValue: held.data![0].cart[0].discount, line200Persisted: 200, total: 996 };
});

test("390px touch editing replaces zero and permits decimals without overflow", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  try {
    await openCart(page);
    await page.getByRole("button", { name: /^Cart ·/ }).tap();
    for (const input of [page.getByRole("textbox", { name: "Discount", exact: true }), page.getByRole("textbox", { name: "Cart discount", exact: true })]) {
      await replaceZero(input, "200", true);await replaceZero(input, "0.5", true);
    }
    await page.getByRole("button", { name: "Products", exact: true }).tap();
    await page.locator(`[data-product-id="${fixture.service}"]`).tap();
    await page.getByRole("button", { name: /^Cart ·/ }).tap();
    const service = page.locator("li").filter({ hasText: "Synthetic zero service" });
    await replaceZero(service.getByRole("textbox", { name: "Unit price", exact: true }), "200", true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (process.env.QA_EVIDENCE_DIR) await page.screenshot({ path: `${process.env.QA_EVIDENCE_DIR}/pos-390.png`, fullPage: true });
    observations.mobile = { touch: "PASS", decimal: "PASS", zeroServicePrice: "PASS", overflow: false };
  } finally { await context.close(); }
});
