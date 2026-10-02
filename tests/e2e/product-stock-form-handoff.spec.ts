import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isLocalPlaywrightRun, loginLocalOwnerDirectly } from "./helpers/local-supabase";

test.describe.configure({ mode: "serial", retries: 0 });
test.use({ trace: "off", video: "off", screenshot: "off" });
test.skip(!isLocalPlaywrightRun(), "Loopback synthetic fixtures only");
const org = randomUUID(), branch = randomUUID(), existing = randomUUID();
const email = `stock-handoff-${org}@saledock.local`, password = randomUUID();
let admin: SupabaseClient, userId: string;
const observations: Record<string, unknown> = {};
const evidence = process.env.QA_EVIDENCE_DIR;
const productDialog = (page: Page) => page.getByRole("dialog", { name: /^(Add|Edit) product$/ });
const inventoryDialog = (page: Page) => page.getByRole("dialog", { name: /^Inventory & FIFO Ledger:/ });
function checked(error: { message: string } | null) { if (error) throw new Error(error.message); }
async function stock(id: string) {
  const product = await admin.from("products").select("id,name,stock_quantity,type,notes").eq("id", id).single(); checked(product.error);
  const lots = await admin.from("product_stock_lots").select("id,quantity_received,quantity_remaining,unit_cost,lot_number,notes,supplier_id").eq("product_id", id); checked(lots.error);
  const movements = await admin.from("stock_movements").select("id,movement_type,quantity,notes").eq("product_id", id); checked(movements.error);
  return { product: product.data!, lots: lots.data!, movements: movements.data! };
}
async function savedProduct(name: string) {
  const rows = await admin.from("products").select("id").eq("organization_id", org).eq("name", name); checked(rows.error);
  expect(rows.data).toHaveLength(1); return rows.data![0].id as string;
}
async function fillProduct(page: Page, name: string, opening = 0) {
  const dialog = productDialog(page);
  await dialog.locator('[name="name"]').fill(name);
  await dialog.locator('[name="purchase_price"]').fill("100");
  await dialog.locator('[name="sale_price"]').fill("150");
  await dialog.locator('[name="stock_quantity"]').fill(String(opening));
}
async function proofModal(page: Page, label: string) {
  await expect(page.getByRole("dialog")).toHaveCount(1);
  const bounds = await inventoryDialog(page).evaluate(d => ({
    portal: d.parentElement?.parentElement === document.body,
    width: d.clientWidth, scrollWidth: d.scrollWidth,
    backgroundLocked: document.body.style.overflow === "hidden",
  }));
  expect(bounds.portal).toBe(true); expect(bounds.scrollWidth).toBeLessThanOrEqual(bounds.width);
  expect(bounds.backgroundLocked).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.keyboard.press("Tab");
  expect(await inventoryDialog(page).evaluate(d => d.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Shift+Tab");
  expect(await inventoryDialog(page).evaluate(d => d.contains(document.activeElement))).toBe(true);
  observations[label] = bounds;
  if (evidence) await page.screenshot({ path: `${evidence}/${label}.png` });
}
function countMutations(page: Page) {
  const calls = { product: 0, restock: 0, adjust: 0 };
  page.on("request", request => {
    if (request.method() !== "POST" || !request.headers()["next-action"]) return;
    const body = request.postData() ?? "";
    if (body.includes("product_image")) calls.product++;
    if (body.includes("quantity_received")) calls.restock++;
    if (body.includes("adjustment_type")) calls.adjust++;
  });
  return calls;
}

test.beforeAll(async () => {
  const raw = execFileSync("supabase", ["status", "--output", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const status = JSON.parse(raw.slice(raw.indexOf("{")));
  if (!status.API_URL.startsWith("http://127.0.0.1:")) throw new Error("Loopback required");
  admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  checked((await admin.from("organizations").insert({ id: org, name: "Synthetic stock handoff QA", onboarding_completed: true })).error);
  checked((await admin.from("branches").insert({ id: branch, organization_id: org, name: "Main Branch" })).error);
  const account = await admin.auth.admin.createUser({ email, password, email_confirm: true }); checked(account.error); userId = account.data.user!.id;
  checked((await admin.from("profiles").insert({ id: userId, organization_id: org, branch_id: branch, full_name: "Synthetic Owner", role: "owner", is_active: true, onboarding_completed: true })).error);
  checked((await admin.from("products").insert({ id: existing, organization_id: org, branch_id: branch, name: "Existing stock handoff product", barcode: "QA48326-BARCODE", type: "product", purchase_price: 100, sale_price: 150, stock_quantity: 0 })).error);
});
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  observations.errors = errors;
  await loginLocalOwnerDirectly(page, email, password);
  await expect(page.locator('[data-active-workspace-state="active"]')).toBeVisible();
  const reject = page.getByRole("button", { name: "Reject optional cookies", exact: true });
  if (await reject.isVisible()) await reject.click();
  await page.goto("/products?tab=products");
});
test.afterEach(() => { expect(observations.errors).toEqual([]); });
test.afterAll(async () => {
  if (!admin) return;
  for (const table of ["stock_movements", "product_stock_lots", "products", "audit_logs"]) checked((await admin.from(table).delete().eq("organization_id", org)).error);
  if (userId) checked((await admin.auth.admin.deleteUser(userId)).error);
  checked((await admin.from("organizations").delete().eq("id", org)).error);
  const remaining = await admin.from("organizations").select("id", { count: "exact", head: true }).eq("id", org); checked(remaining.error); expect(remaining.count).toBe(0);
  observations.cleanup = "Task-owned organization, user, products, lots, movements and audits removed";
  if (evidence) fs.writeFileSync(`${evidence}/handoff-${process.env.QA_RUN_LABEL ?? "run"}.json`, JSON.stringify(observations, null, 2));
});

for (const width of [1440, 390]) {
  test(`physical create zero-stock -> blank/explicit Restock -> adjustment at ${width}px`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    const name = `QA48326 zero ${width}`;
    const calls = countMutations(page);
    await page.getByRole("button", { name: "Add product", exact: true }).click();
    await fillProduct(page, name);
    await productDialog(page).getByRole("button", { name: "Save & manage stock", exact: true }).click();
    await expect(inventoryDialog(page)).toBeVisible({ timeout: 20_000 });
    await expect(inventoryDialog(page).getByRole("button", { name: "Add Restock Lot Batch" })).toBeVisible();
    const id = await savedProduct(name);
    const before = await stock(id); expect(before.product.stock_quantity).toBe(0); expect(before.lots).toHaveLength(0); expect(before.movements).toHaveLength(0);
    await proofModal(page, `inventory-${width}`);
    const dialog = inventoryDialog(page);
    await dialog.locator('[name="quantity_received"]').fill("5");
    await dialog.locator('[name="unit_cost"]').fill("100");
    await dialog.locator('[name="purchase_date"]').fill("");
    await dialog.getByRole("button", { name: "Add Restock Lot Batch" }).click();
    await expect(dialog.getByText("Stock lot successfully restocked.", { exact: true })).toBeVisible({ timeout: 20_000 });
    const blank = await stock(id); expect(blank.product.stock_quantity).toBe(5); expect(blank.lots).toHaveLength(1); expect(blank.movements).toHaveLength(1);
    expect(blank.lots[0].notes).toBeNull(); expect(blank.lots[0].supplier_id).toBeNull();
    await dialog.locator('[name="quantity_received"]').fill("2");
    await dialog.locator('[name="unit_cost"]').fill("120");
    await dialog.locator('[name="lot_number"]').fill(" QA48326-EXPLICIT ");
    await dialog.locator('[name="notes"]').fill(" QA48326 retained notes ");
    await dialog.locator('[name="purchase_date"]').fill("2026-10-02");
    await dialog.getByRole("button", { name: "Add Restock Lot Batch" }).click();
    await expect.poll(async () => (await stock(id)).product.stock_quantity).toBe(7);
    await expect(dialog.getByRole("button", { name: "Add Restock Lot Batch" })).toBeEnabled();
    const explicit = await stock(id); expect(explicit.lots).toHaveLength(2); expect(explicit.movements).toHaveLength(2);
    expect(explicit.lots.find(l => l.lot_number === "QA48326-EXPLICIT")?.notes).toBe("QA48326 retained notes");
    await dialog.getByRole("button", { name: "Manual Audit", exact: true }).click();
    await dialog.getByRole("button", { name: "Adjustment type" }).click();
    await dialog.getByRole("option", { name: "Adjustment OUT (- Stock)", exact: true }).click();
    await dialog.locator('[name="quantity"]').fill("1");
    await dialog.locator('[name="notes"]').fill("QA48326 adjustment audit");
    await dialog.getByRole("button", { name: "Execute Adjustment" }).click();
    await expect(dialog.getByText("Stock adjustment 'OUT' completed successfully.", { exact: true })).toBeVisible({ timeout: 20_000 });
    const adjusted = await stock(id); expect(adjusted.product.stock_quantity).toBe(6);
    expect(adjusted.lots.find(l => l.unit_cost === 100)?.quantity_remaining).toBe(4);
    expect(adjusted.movements).toHaveLength(3);
    expect(calls).toEqual({ product: 1, restock: 2, adjust: 1 });
    observations[`restock-${width}`] = { calls, blank, explicit, adjusted };
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Add product", exact: true })).toBeFocused();
    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
  });

  test(`opening stock is not duplicated; clean/dirty edit handoff at ${width}px`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    const name = `QA48326 opening ${width}`;
    const calls = countMutations(page);
    await page.getByRole("button", { name: "Add product", exact: true }).click();
    await fillProduct(page, name, 10);
    if (evidence) await page.screenshot({ path: `${evidence}/product-${width}.png` });
    await productDialog(page).getByRole("button", { name: "Save & manage stock", exact: true }).click();
    await expect(inventoryDialog(page)).toBeVisible({ timeout: 20_000 });
    await expect(inventoryDialog(page).getByRole("button", { name: "Add Restock Lot Batch" })).toBeVisible();
    const id = await savedProduct(name);
    const opening = await stock(id); expect(opening.product.stock_quantity).toBe(10); expect(opening.lots).toHaveLength(1); expect(opening.lots[0].quantity_remaining).toBe(10);
    expect(opening.movements).toHaveLength(1); expect(opening.movements[0].movement_type).toBe("opening_stock");
    await inventoryDialog(page).getByRole("button", { name: "Active Lots", exact: true }).click();
    await expect(inventoryDialog(page).getByText("10", { exact: true }).first()).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const row = width === 390 ? page.locator("article").filter({ hasText: name }) : page.locator("tbody tr").filter({ hasText: name });
    await row.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(productDialog(page).locator('[data-testid="product-current-stock"]')).toHaveText("10");
    await expect(productDialog(page).locator('[name="stock_quantity"]')).toHaveCount(0);
    await productDialog(page).getByRole("button", { name: "Manage stock", exact: true }).click();
    await expect(inventoryDialog(page)).toBeVisible(); await expect(page.getByRole("dialog")).toHaveCount(1);
    expect(calls.product).toBe(1);
    await inventoryDialog(page).getByRole("button", { name: "Close", exact: true }).click();
    await row.getByRole("button", { name: "Edit", exact: true }).click();
    await productDialog(page).locator('[name="notes"]').fill("QA48326 dirty metadata saved once");
    await expect(productDialog(page).getByRole("button", { name: "Manage stock", exact: true })).toHaveCount(0);
    await productDialog(page).getByRole("button", { name: "Save & manage stock", exact: true }).click();
    await expect(inventoryDialog(page)).toBeVisible({ timeout: 20_000 });
    const after = await stock(id); expect(after.product.notes).toBe("QA48326 dirty metadata saved once");
    expect(after.lots).toEqual(opening.lots); expect(after.movements).toEqual(opening.movements); expect(after.product.stock_quantity).toBe(10);
    expect(calls).toEqual({ product: 2, restock: 0, adjust: 0 });
    observations[`opening-edit-${width}`] = { calls, opening, after };
  });
}

test("failed metadata save does not hand off; service has no stock controls; normal save remains available", async ({ page }) => {
  test.setTimeout(120_000);
  const calls = countMutations(page);
  await page.getByRole("button", { name: "Add product", exact: true }).click();
  await fillProduct(page, "QA48326 failed save");
  await productDialog(page).locator('[name="barcode"]').fill("QA48326-BARCODE");
  await productDialog(page).getByRole("button", { name: "Save & manage stock", exact: true }).click();
  await expect(productDialog(page).getByText("This barcode is already used by another product.", { exact: true })).toBeVisible();
  await expect(inventoryDialog(page)).toHaveCount(0);
  const failed = await admin.from("products").select("id").eq("organization_id", org).eq("name", "QA48326 failed save"); checked(failed.error); expect(failed.data).toHaveLength(0);
  await productDialog(page).getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Add product", exact: true }).click();
  await productDialog(page).locator('[name="is_service"]').check();
  await expect(productDialog(page).locator('[name="stock_quantity"]')).toHaveCount(0);
  await expect(productDialog(page).locator('[data-testid="product-current-stock"]')).toHaveCount(0);
  await expect(productDialog(page).getByRole("button", { name: /manage stock/i })).toHaveCount(0);
  await productDialog(page).locator('[name="name"]').fill("QA48326 service");
  await productDialog(page).locator('[name="sale_price"]').fill("50");
  await productDialog(page).getByRole("button", { name: "Save product", exact: true }).click();
  await expect(productDialog(page)).toHaveCount(0, { timeout: 20_000 });
  await expect(inventoryDialog(page)).toHaveCount(0);
  const service = await stock(await savedProduct("QA48326 service")); expect(service.product.type).toBe("service"); expect(service.product.stock_quantity).toBe(0); expect(service.lots).toHaveLength(0); expect(service.movements).toHaveLength(0);
  expect(calls.product).toBe(2); observations.serviceAndFailure = { calls, service, failedCount: 0 };
});

test("save/restock pending locks prevent duplicates and handoff waits for confirmed success", async ({ page }) => {
  test.setTimeout(90_000);
  const calls = countMutations(page);
  let release = () => {};
  let mode: "product" | "restock" = "product";
  let held = false;
  let gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/products**", async route => {
    const request = route.request(), body = request.postData() ?? "";
    const match = mode === "product" ? body.includes("product_image") : body.includes("quantity_received");
    if (request.method() !== "POST" || !request.headers()["next-action"] || !match) return route.continue();
    const response = await route.fetch();
    held = true;
    await gate;
    await route.fulfill({ response });
  });
  await page.getByRole("button", { name: "Add product", exact: true }).click();
  await fillProduct(page, "QA48326 pending truth", 10);
  await productDialog(page).getByRole("button", { name: "Save & manage stock", exact: true }).click();
  await expect.poll(() => held).toBe(true);
  await expect(productDialog(page).getByRole("button", { name: "Saving...", exact: true })).toBeDisabled();
  await expect(productDialog(page).getByRole("button", { name: "Save & manage stock", exact: true })).toBeDisabled();
  await expect(productDialog(page).getByRole("button", { name: "Close", exact: true })).toBeDisabled();
  await expect(inventoryDialog(page)).toHaveCount(0);
  const id = await savedProduct("QA48326 pending truth");
  expect((await stock(id)).lots).toHaveLength(1);
  expect(calls.product).toBe(1);
  release();
  await expect(inventoryDialog(page)).toBeVisible();
  await expect(inventoryDialog(page).getByRole("button", { name: "Add Restock Lot Batch" })).toBeVisible();
  held = false; mode = "restock";
  gate = new Promise<void>(resolve => { release = resolve; });
  const dialog = inventoryDialog(page);
  await dialog.locator('[name="quantity_received"]').fill("5");
  await dialog.locator('[name="unit_cost"]').fill("100");
  await dialog.locator('[name="purchase_date"]').fill("");
  await dialog.getByRole("button", { name: "Add Restock Lot Batch" }).click();
  await expect.poll(() => held).toBe(true);
  await expect(dialog.getByRole("button", { name: "Add Restock Lot Batch" })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Close", exact: true })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Manual Audit", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape"); await expect(dialog).toBeVisible();
  const persisted = await stock(id); expect(persisted.product.stock_quantity).toBe(15); expect(persisted.lots).toHaveLength(2); expect(persisted.movements).toHaveLength(2);
  expect(calls).toEqual({ product: 1, restock: 1, adjust: 0 });
  release();
  await expect(dialog.getByText("Stock lot successfully restocked.", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Add Restock Lot Batch" })).toBeEnabled();
  await page.unroute("**/products**");
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  observations.pending = { calls, confirmedBeforeHandoff: true, heldResponseLocks: true, persisted };
});
