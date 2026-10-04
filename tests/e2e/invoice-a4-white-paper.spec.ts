import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { isLocalPlaywrightRun, loginLocalOwnerDirectly } from "./helpers/local-supabase";
import { checked, createDiscountPrintFixture } from "./helpers/pos-discount-print-fixture";

test.describe.configure({ mode: "serial", retries: 0 });
test.use({ trace: "off", video: "off", screenshot: "off" });
test.skip(!isLocalPlaywrightRun(), "Synthetic local invoice fixtures only");
let fixture: Awaited<ReturnType<typeof createDiscountPrintFixture>>;
let short = "", long = "";
const observations: Record<string, unknown> = {};

test.beforeAll(async () => {
  fixture = await createDiscountPrintFixture();
  const customer = randomUUID();
  checked((await fixture.admin.from("customers").insert({ id: customer, organization_id: fixture.org, branch_id: fixture.branch, name: "Synthetic invoice customer", outstanding_balance: 0 })).error);
  checked((await fixture.admin.from("organizations").update({ google_maps_url: "https://maps.google.com/?q=0,0" }).eq("id", fixture.org)).error);
  checked((await fixture.admin.from("app_settings").insert({ organization_id: fixture.org, branch_id: fixture.branch, shop_name: "Synthetic QA36149 shop", receipt_footer: "Synthetic footer: complete invoice", settings: { invoice_show_location_qr: true } })).error);
  for (const count of [1, 80]) {
    const id = randomUUID();
    checked((await fixture.admin.from("invoices").insert({ id, organization_id: fixture.org, branch_id: fixture.branch, customer_id: customer, invoice_no: `QA36149-${id}`, status: "paid", subtotal: count * 500, discount_total: 0, grand_total: count * 500, amount_paid: count * 500, balance_due: 0, note: "Synthetic A4 print acceptance" })).error);
    checked((await fixture.admin.from("invoice_items").insert(Array.from({ length: count }, (_, i) => ({ organization_id: fixture.org, invoice_id: id, product_name: `Synthetic printed service ${i + 1}`, product_type: "service", quantity: 1, purchase_price: 0, unit_price: 500, item_discount: 0, line_total: 500 })))).error);
    if (count === 1) short = id; else long = id;
  }
});
test.afterAll(async () => {
  if (fixture) await fixture.cleanup();
  if (process.env.QA_EVIDENCE_DIR) fs.writeFileSync(`${process.env.QA_EVIDENCE_DIR}/a4-${process.env.QA_RUN_LABEL}.json`, JSON.stringify({ ...observations, cleanup: "Exact task-created organization/user removed" }, null, 2));
});

async function openInvoice(page: Page, id: string) {
  await loginLocalOwnerDirectly(page, fixture.email, fixture.password);
  const reject = page.getByRole("button", { name: "Reject optional cookies", exact: true });
  if (await reject.isVisible()) await reject.click();
  await page.goto(`/invoices/${id}`);
  await expect(page.locator("#invoice-print")).toBeVisible();
  await expect(page.getByRole("img", { name: "Shop location QR code", exact: true })).toBeVisible();
  await page.evaluate(() => { window.print = () => {}; });
}

async function startPrint(page: Page) {
  await page.getByRole("button", { name: "Print A4 / Save PDF", exact: true }).click();
  await expect(page.locator("body")).toHaveAttribute("data-print-mode", "a4");
  await page.emulateMedia({ media: "print" });
}

function rasterCheck(pdf: string, prefix: string) {
  execFileSync("pdftoppm", ["-png", "-r", "72", pdf, prefix], { stdio: ["ignore", "ignore", "pipe"] });
  const script = String.raw`
import glob,json,math,sys,pdfplumber
from PIL import Image
with pdfplumber.open(sys.argv[1]) as pdf:
    images=sorted(glob.glob(sys.argv[2]+"-[0-9]*.png"),key=lambda p:int(p.rsplit("-",1)[1].split(".")[0]))
    results=[]
    for page,image in zip(pdf.pages,images):
        words=page.extract_words()
        lines=page.extract_text_lines()
        im=Image.open(image).convert("RGB")
        bottom=math.ceil(max((w["bottom"] for w in words),default=0))+16
        box=im.crop((2,min(bottom,im.height-1),im.width-2,im.height-1))
        item_bottom=max((line["bottom"] for line in lines if line["text"].startswith("Synthetic printed service ")),default=0)
        footer_top=min((line["top"] for line in lines if "Synthetic footer: complete invoice" in line["text"]),default=None)
        results.append({"size":[round(page.width,2),round(page.height,2)],"text":page.extract_text() or "", "wordCount":len(words),"unusedLowerAreaWhite":all(p==(255,255,255) for p in box.getdata()),"cornerWhite":im.getpixel((2,2))==(255,255,255),"lowerAreaStart":bottom,"lastItemBottom":item_bottom,"footerTop":footer_top})
    print(json.dumps({"pages":results,"pageCount":len(pdf.pages),"rasterCount":len(images)}))
`;
  return JSON.parse(execFileSync("python3", ["-c", script, pdf, prefix], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
}

for (const theme of ["light", "dark"]) test(`short A4 ${theme}: ancestors and physical unused paper are white, cleanup restores screen`, async ({ page }, info) => {
  await page.setViewportSize({ width: 794, height: 1123 });
  await openInvoice(page, short);
  await page.evaluate((dark) => document.documentElement.classList.toggle("dark", dark), theme === "dark");
  await startPrint(page);
  const styles = await page.evaluate(() => ["html", "body", "[data-persistent-authenticated-frame]", "[data-app-shell-root]", "[data-app-shell-main]", "#invoice-print"].map(selector => {
    const e = document.querySelector(selector)!, s = getComputedStyle(e), r = e.getBoundingClientRect();
    return { selector, background: s.backgroundColor, display: s.display, height: r.height, bottom: r.bottom, overflow: s.overflow, transition: s.transition };
  }));
  for (const row of styles) expect(row.background, row.selector).toBe("rgb(255, 255, 255)");
  const root = process.env.QA_EVIDENCE_DIR ? path.join(process.env.QA_EVIDENCE_DIR, process.env.QA_RUN_LABEL || "a4-artifacts") : info.outputDir;
  fs.mkdirSync(root, { recursive: true });
  await page.screenshot({ path: path.join(root, `short-a4-${theme}.png`), fullPage: true });
  const pdf = path.join(root, `short-a4-${theme}.pdf`);
  await page.pdf({ path: pdf, format: "A4", preferCSSPageSize: true, printBackground: true });
  const raster = rasterCheck(pdf, pdf.replace(".pdf", ""));
  expect(raster.pageCount).toBe(1);expect(raster.rasterCount).toBe(1);
  expect(raster.pages[0].unusedLowerAreaWhite).toBe(true);expect(raster.pages[0].cornerWhite).toBe(true);
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await page.emulateMedia({ media: "screen" });
  await expect(page.locator("body")).not.toHaveAttribute("data-print-mode");
  const screen = await page.locator("[data-app-shell-root]").evaluate(e => getComputedStyle(e).backgroundColor);
  expect(screen).not.toBe("rgb(255, 255, 255)");
  await startPrint(page);
  const noBackground = path.join(root, `short-a4-${theme}-no-background.pdf`);
  await page.pdf({ path: noBackground, format: "A4", preferCSSPageSize: true, printBackground: false });
  expect(rasterCheck(noBackground, noBackground.replace(".pdf", "")).pages[0].unusedLowerAreaWhite).toBe(true);
  observations[theme] = { styles, raster, screenRestored: true, backgroundGraphicsNotRequired: true };
});

test("long A4 paginates all 80 items with a complete final footer and no blank/tinted pages", async ({ page }, info) => {
  await openInvoice(page, long);
  await startPrint(page);
  const root = process.env.QA_EVIDENCE_DIR ? path.join(process.env.QA_EVIDENCE_DIR, process.env.QA_RUN_LABEL || "a4-artifacts") : info.outputDir;
  fs.mkdirSync(root, { recursive: true });
  const pdf = path.join(root, "long-a4.pdf");
  await page.pdf({ path: pdf, format: "A4", preferCSSPageSize: true, printBackground: true });
  const raster = rasterCheck(pdf, pdf.replace(".pdf", ""));
  expect(raster.pageCount).toBeGreaterThan(1);expect(raster.rasterCount).toBe(raster.pageCount);
  const text = raster.pages.map((p: { text: string }) => p.text).join("\n");
  for (let i = 1; i <= 80; i++) expect(text.match(new RegExp(`^Synthetic printed service ${i} `, "gm"))).toHaveLength(1);
  expect(text).toContain("Synthetic footer: complete invoice");expect(text).toContain("Scan for directions");
  expect(raster.pages.at(-1).footerTop).toBeGreaterThan(raster.pages.at(-1).lastItemBottom);
  for (const p of raster.pages) { expect(p.wordCount).toBeGreaterThan(0);expect(p.unusedLowerAreaWhite).toBe(true);expect(p.cornerWhite).toBe(true);expect(p.size[0]).toBeCloseTo(595.28, 0); }
  observations.long = raster;
});
