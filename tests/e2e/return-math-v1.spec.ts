import fs from "node:fs";
import { test, expect } from "@playwright/test";
import { loginLocalOwnerDirectly, isLocalPlaywrightRun } from "./helpers/local-supabase";
import { returnFixture } from "./helpers/return-math-fixture";

test.describe.configure({ mode: "serial", retries: 0 });
test.skip(!isLocalPlaywrightRun(), "Synthetic local Return tests only");

for (const width of [1440, 390]) for (const theme of ["light", "dark"] as const) {
  test(`${width}px ${theme}: exact settlement, custom restock and truthful documents`, async ({ page }) => {
    test.setTimeout(90000);
    const fixture = await returnFixture();
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    let actions = 0;
    page.on("request", request => { if (request.method() === "POST" && request.headers()["next-action"]) actions++; });
    try {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: theme });
      await loginLocalOwnerDirectly(page, fixture.email, fixture.password);
      await page.evaluate(value => { localStorage.setItem("theme", value); document.documentElement.classList.toggle("dark", value === "dark"); }, theme);
      await page.goto(`/invoices/${fixture.invoice}`);
      await page.getByRole("button", { name: "Reject optional cookies", exact: true }).click();
      await expect(page.getByTestId("cookie-consent-banner")).toHaveCount(0);
      await expect(page.getByRole("heading", { name: "Process return", exact: true })).toBeVisible();
      const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Process return", exact: true }) });
      await form.getByRole("spinbutton", { name: "Return quantity for Synthetic product", exact: true }).fill("4");
      await form.getByRole("button", { name: "Custom", exact: true }).click();
      await form.getByRole("spinbutton", { name: "Sellable stock quantity for Synthetic product", exact: true }).fill("3");
      const summary = form.getByRole("definition");
      await expect(form.getByRole("button", { name: "Refund method", exact: true })).toBeVisible();
      await form.getByRole("button", { name: "Refund method", exact: true }).click();
      await page.getByRole("option", { name: "Cash", exact: true }).click();
      await expect(form.locator('input[name="refund_amount"]')).toHaveCount(0);
      expect(await summary.allTextContents()).toEqual(["₨ 800", "₨ 600", "₨ 200"]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      if (process.env.QA_EVIDENCE_DIR) await page.screenshot({ path: `${process.env.QA_EVIDENCE_DIR}/return-form-${width}-${theme}.png`, fullPage: true });
      actions = 0;
      await form.getByRole("button", { name: "Process return", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Return processed", exact: true })).toBeVisible({ timeout: 30000 });
      expect(actions).toBe(1);
      expect(fixture.state()).toEqual({ returns: 1, credit: 800, debt: 600, refund: 200, stock: 8, consumed: 4, restocked: 3, balance: 0, audit: 1 });
      await page.getByRole("link", { name: "View return", exact: true }).click();
      await expect(page.locator('main[aria-busy="true"]')).toHaveCount(0);
      await expect(page.locator(".a4-print")).toContainText("Debt relieved");
      await expect(page.locator(".thermal-print")).toContainText("Return credit");
      await page.evaluate(async () => { await document.fonts.ready; document.body.dataset.printMode = "a4"; });
      await page.emulateMedia({ media: "print" });
      await expect(page.locator(".a4-print")).toBeVisible();
      await expect(page.getByText("Loading SaleDock...", { exact: true })).toHaveCount(0);
      const pdf = await page.pdf({ format: "A4", printBackground: true });
      expect(pdf.length).toBeGreaterThan(5000);
      if (process.env.QA_EVIDENCE_DIR) fs.writeFileSync(`${process.env.QA_EVIDENCE_DIR}/return-${width}-${theme}.pdf`, pdf);
      await page.evaluate(() => { document.body.dataset.printMode = "thermal"; document.body.dataset.returnsThermalPrint = "true"; });
      const thermal = page.locator(".thermal-print");
      await expect(thermal).toBeVisible();
      await expect(thermal).toContainText("Debt relieved");
      expect(await thermal.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      if (process.env.QA_EVIDENCE_DIR) await thermal.screenshot({ path: `${process.env.QA_EVIDENCE_DIR}/return-thermal-${width}-${theme}.png` });
      await page.emulateMedia({ media: "screen" });
      await page.evaluate(() => { delete document.body.dataset.printMode; delete document.body.dataset.returnsThermalPrint; });
      await page.goto("/returns");
      await expect(page.locator('main[aria-busy="true"]')).toHaveCount(0);
      await expect(page.locator('main[data-app-shell-main="true"]').last()).toContainText("Debt relieved");
      await page.goto("/reports");
      await expect(page.locator('main[aria-busy="true"]')).toHaveCount(0);
      await expect(page.locator('main[data-app-shell-main="true"]').last()).toContainText("Return credits");
      expect(errors).toEqual([]);
    } finally { await fixture.cleanup(); }
  });
}

test("lost HTTP response after COMMIT survives refresh and explicitly replays exactly once", async ({ page }) => {
  test.setTimeout(90000);
  const fixture = await returnFixture({ paid: 1000 });
  try {
    await loginLocalOwnerDirectly(page, fixture.email, fixture.password);
    await page.goto(`/invoices/${fixture.invoice}`);
    await page.getByRole("button", { name: "Reject optional cookies", exact: true }).click();
    await page.getByRole("spinbutton", { name: "Return quantity for Synthetic product", exact: true }).fill("5");
    await page.getByRole("button", { name: "Refund method", exact: true }).click();
    await page.getByRole("option", { name: "Cash", exact: true }).click();
    let sent = 0;
    await page.route(`**/invoices/${fixture.invoice}`, async route => {
      if (!route.request().headers()["next-action"]) return route.continue();
      sent++;
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      expect(fixture.state().returns).toBe(1);
      await route.abort("failed");
    });
    await page.getByRole("button", { name: "Process return", exact: true }).click();
    await expect(page.getByRole("button", { name: "Retry saved return", exact: true })).toBeVisible({ timeout: 30000 });
    expect(sent).toBe(1);
    const committed = fixture.state();
    await page.unroute(`**/invoices/${fixture.invoice}`);
    await page.reload();
    await page.getByRole("button", { name: "Retry saved return", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Return processed", exact: true })).toBeVisible({ timeout: 30000 });
    expect(fixture.state()).toEqual(committed);
    expect(committed).toEqual({ returns: 1, credit: 1000, debt: 0, refund: 1000, stock: 10, consumed: 5, restocked: 5, balance: 0, audit: 1 });
  } finally { await fixture.cleanup(); }
});

test("storage failure never submits a Return and unpaid settlement needs no refund method", async ({ page }) => {
  test.setTimeout(90000);
  const fixture = await returnFixture({ paid: 0 });
  try {
    await page.addInitScript(() => {
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) { if (key.startsWith("saledock:return-request:")) throw new Error("Synthetic storage failure"); return set.call(this, key, value); };
    });
    await loginLocalOwnerDirectly(page, fixture.email, fixture.password);
    await page.goto(`/invoices/${fixture.invoice}`);
    await page.getByRole("button", { name: "Reject optional cookies", exact: true }).click();
    await page.getByRole("spinbutton", { name: "Return quantity for Synthetic product", exact: true }).fill("5");
    await expect(page.getByRole("button", { name: "Refund method", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Process return", exact: true }).click();
    await expect(page.locator('p[role="alert"]')).toContainText("No return was made");
    expect(fixture.state().returns).toBe(0);
  } finally { await fixture.cleanup(); }
});

for (const lines of [201, 250, 500]) test(`${lines} source lines: open, select and submit without a Return-specific limit`, async ({ page }) => {
  test.setTimeout(180000);
  const fixture = await returnFixture({ lines, price: 1, cost: 0, paid: lines });
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginLocalOwnerDirectly(page, fixture.email, fixture.password);
    await page.goto(`/invoices/${fixture.invoice}`);
    await page.getByRole("button", { name: "Reject optional cookies", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Process return", exact: true })).toBeVisible();
    const quantities = page.getByRole("spinbutton", { name: "Return quantity for Synthetic product", exact: true });
    await expect(quantities).toHaveCount(lines);
    for (let i = 0; i < lines; i++) await quantities.nth(i).fill("1");
    const form = page.locator("form").filter({ has: page.locator('input[name="invoice_id"]') });
    await expect(form.locator('input[name="invoice_item_id"]')).toHaveCount(lines);
    await form.getByRole("button", { name: "Refund method", exact: true }).click();
    await page.getByRole("option", { name: "Cash", exact: true }).click();
    await form.locator('button[type="submit"]').click();
    await expect(page.getByRole("heading", { name: "Return processed", exact: true })).toBeVisible({ timeout: 30000 });
    const state = fixture.state();
    expect(state.returns).toBe(1); expect(state.credit).toBe(lines); expect(state.refund).toBe(lines);
    expect(state.consumed).toBe(lines); expect(state.restocked).toBe(lines); expect(state.stock).toBe(lines);
    expect(state.debt).toBe(0); expect(state.audit).toBe(1);
    if (process.env.QA_EVIDENCE_DIR) fs.writeFileSync(`${process.env.QA_EVIDENCE_DIR}/large-${lines}.json`, JSON.stringify({ lines, width: 390, state, passed: true }, null, 2));
  } finally { await fixture.cleanup(); }
});
