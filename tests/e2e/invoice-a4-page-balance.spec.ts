import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import { createInvoiceDesignFixture } from "./helpers/invoice-design-fixture";
import {
  isLocalPlaywrightRun,
  loginLocalOwnerDirectly,
} from "./helpers/local-supabase";

test.describe.configure({ mode: "serial", retries: 0 });
test.use({ trace: "off", video: "off", screenshot: "off" });
test.skip(!isLocalPlaywrightRun(), "Isolated synthetic data only");
const baseline = process.env.QA_A4_BALANCE_PHASE === "before";
const dir = path.join(
  process.env.QA_EVIDENCE_DIR || "test-results",
  process.env.QA_RUN_LABEL || "a4-balance",
);
let fixture: Awaited<ReturnType<typeof createInvoiceDesignFixture>>;
const results: Record<string, unknown> = {};
test.beforeAll(async () => {
  fs.mkdirSync(dir, { recursive: true });
  fixture = await createInvoiceDesignFixture(true);
});
test.beforeEach(async ({ context, page }) => {
  await context.addInitScript(() => {
    localStorage.setItem("analytics-consent", "rejected");
    localStorage.setItem(
      "saledock-sidebar-preferences-v1",
      JSON.stringify({
        analyticsConsent: "rejected",
        marketingConsent: "rejected",
      }),
    );
  });
  await loginLocalOwnerDirectly(page, fixture.email, fixture.password);
});
test.afterAll(async () => {
  if (fixture) {
    expect(await fixture.snapshot()).toEqual(fixture.startingSnapshot);
    await fixture.cleanup();
  }
  fs.writeFileSync(
    path.join(dir, "geometry.json"),
    JSON.stringify(
      { baseline, results, businessRowsUnchanged: true, fixtureCleanup: true },
      null,
      2,
    ),
  );
});
async function open(page: Page, key: string) {
  await page.goto(`/invoices/${fixture.invoices[key].id}`);
  await expect(page.locator("#invoice-print")).toBeVisible();
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      Array.from(
        document.querySelectorAll<HTMLImageElement>("#invoice-print img"),
        (img) => img.decode(),
      ),
    );
    window.print = () => {};
  });
}
async function geometry(page: Page) {
  return page.locator("#invoice-print").evaluate((e) => {
    const box = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, height: r.height, width: r.width };
    };
    return {
      document: box(e),
      footer: box(e.querySelector(".invoice-footer")!),
      settlement: box(e.querySelector(".invoice-settlement")!),
      qr: e.querySelector(".invoice-location img")
        ? box(e.querySelector(".invoice-location img")!)
        : null,
      print: matchMedia("print").matches,
      short: e.getAttribute("data-invoice-a4-short"),
    };
  });
}
function pdf(file: string) {
  execFileSync("pdftoppm", [
    "-png",
    "-r",
    "90",
    file,
    file.replace(".pdf", ""),
  ]);
  return JSON.parse(
    execFileSync(
      "python3",
      [
        "-c",
        String.raw`
import sys,json,pdfplumber,logging
from PIL import Image
logging.getLogger('pdfminer').setLevel(logging.ERROR)
with pdfplumber.open(sys.argv[1]) as doc:
 pages=[]
 for i,p in enumerate(doc.pages):
  words=p.extract_words(); text=p.extract_text() or ''; im=Image.open(sys.argv[1].replace('.pdf','')+'-'+str(i+1)+'.png').convert('RGB')
  bottom=max([w['bottom'] for w in words]+[x['bottom'] for x in p.images])
  qrs=[x for x in p.images if abs(x['width']-84)<2 and abs(x['height']-84)<2]
  closing=[w for w in words if w['text'] in ['Thank','Custom']]
  footer_words=[w for w in words if closing and w['top']>=closing[-1]['top']]
  footer_box={'left':min(w['x0'] for w in footer_words),'right':max(w['x1'] for w in footer_words),'top':min(w['top'] for w in footer_words),'bottom':max(w['bottom'] for w in footer_words)} if footer_words else None
  if footer_box and qrs:
   footer_box={'left':min(footer_box['left'],qrs[-1]['x0']),'right':max(footer_box['right'],qrs[-1]['x1']),'top':min(footer_box['top'],qrs[-1]['top']),'bottom':max(footer_box['bottom'],qrs[-1]['bottom'])}
  pages.append({'height':p.height,'width':p.width,'printableBottom':p.height-12*72/25.4,'contentBottom':bottom,'clearanceMm':(p.height-12*72/25.4-bottom)*25.4/72,
   'footerBoundingBox':footer_box,'qrBoundingBox':{'left':qrs[-1]['x0'],'right':qrs[-1]['x1'],'top':qrs[-1]['top'],'bottom':qrs[-1]['bottom']} if qrs else None,
   'qrBottom':qrs[-1]['bottom'] if qrs else None,'qrClearanceMm':(p.height-12*72/25.4-qrs[-1]['bottom'])*25.4/72 if qrs else None,
   'outside':[w['text'] for w in words if w['x0']<25 or w['x1']>p.width-25 or w['top']<25 or w['bottom']>p.height-25],
   'white':im.getpixel((2,2))==(255,255,255) and all(im.getpixel((x,im.height-3))==(255,255,255) for x in range(3,im.width-3)), 'text':text})
 print(json.dumps({'pageCount':len(pages),'pages':pages}))
`,
        file,
      ],
      { encoding: "utf8" },
    ),
  );
}
async function printPdf(page: Page, name: string, short: boolean) {
  const screen = await geometry(page);
  await page
    .getByRole("button", { name: "Print A4 / Save PDF", exact: true })
    .click();
  // A screen beforeprint event must not classify from screen geometry.
  await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
  expect((await geometry(page)).short).toBeNull();
  await page.emulateMedia({ media: "print" });
  await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
  const printed = await geometry(page);
  expect(printed.print).toBe(true);
  if (!baseline) expect(printed.short).toBe(short ? "true" : null);
  const file = path.join(dir, name + ".pdf");
  await page.pdf({
    path: file,
    preferCSSPageSize: true,
    printBackground: true,
  });
  const inspection = pdf(file);
  for (const p of inspection.pages) {
    expect(p.outside).toEqual([]);
    expect(p.white).toBe(true);
    expect(p.text.length).toBeGreaterThan(0);
  }
  if (short) {
    expect(inspection.pageCount).toBe(1);
    if (!baseline) {
      expect(inspection.pages[0].clearanceMm).toBeGreaterThanOrEqual(6);
      expect(inspection.pages[0].clearanceMm).toBeLessThanOrEqual(15);
      if (printed.qr) {
        expect(inspection.pages[0].qrClearanceMm).toBeGreaterThanOrEqual(6);
        expect(inspection.pages[0].qrClearanceMm).toBeLessThanOrEqual(15);
      }
    }
  }
  const text = inspection.pages.map((p: { text: string }) => p.text).join("\n");
  expect(text.match(/Grand total/g)).toHaveLength(1);
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  expect((await geometry(page)).short).toBeNull();
  await page.emulateMedia({ media: "screen" });
  expect(await geometry(page)).toEqual(screen);
  results[name] = { screen, printed, ...inspection };
  return inspection;
}
test("short paid/unpaid/partial variants bottom-balance only in print context", async ({
  page,
}) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const key of ["shortpaid", "shortunpaid", "shortpartial"]) {
    await open(page, key);
    await printPdf(page, key, true);
    const bounds = await geometry(page);
    const download = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Download Image", exact: true })
      .click();
    const image = path.join(dir, key + "-image.png");
    await (await download).saveAs(image);
    const [width, height] = JSON.parse(
      execFileSync(
        "python3",
        [
          "-c",
          "from PIL import Image;import sys,json;print(json.dumps(Image.open(sys.argv[1]).size))",
          image,
        ],
        { encoding: "utf8" },
      ),
    );
    expect(Math.abs(height - bounds.document.height)).toBeLessThanOrEqual(2);
    expect((await geometry(page)).short).toBeNull();
    results[key + "-image"] = {
      width,
      height,
      naturalDocumentHeight: bounds.document.height,
    };
  }
  for (const variant of ["default-no-qr", "custom-logo-long-address", "dark"]) {
    await fixture.branding(
      {
        footer:
          variant === "default-no-qr"
            ? ""
            : "Custom closing message: thank you.",
        branch_address:
          variant === "custom-logo-long-address"
            ? "Long commercial address, Main Avenue, North Business District, Extended Karachi Metropolitan Area, Pakistan"
            : "24 Market Street",
      },
      {
        invoice_show_location_qr: variant !== "default-no-qr",
        logo_url:
          variant === "custom-logo-long-address" ? "/qa41928-logo.png" : "",
      },
    );
    await page.route("**/qa41928-logo.png", (route) =>
      route.fulfill({
        contentType: "image/png",
        body: execFileSync("python3", [
          "-c",
          "from PIL import Image;import io,sys;im=Image.new('RGB',(360,80),'#15665D');b=io.BytesIO();im.save(b,format='PNG');sys.stdout.buffer.write(b.getvalue())",
        ]),
      }),
    );
    await open(page, "shortpartial");
    if (variant === "custom-logo-long-address")
      await expect(page.locator("#invoice-print .invoice-logo")).toBeVisible();
    else
      await expect(page.locator("#invoice-print .invoice-logo")).toHaveCount(0);
    if (variant === "dark")
      await page.evaluate(() => document.documentElement.classList.add("dark"));
    await page.screenshot({
      path: path.join(dir, variant + "-screen.png"),
      fullPage: true,
    });
    await printPdf(page, variant, true);
    await page.setViewportSize({ width: 390, height: 844 });
    const mobile = await geometry(page);
    await printPdf(page, variant + "-mobile-print", true);
    expect(await geometry(page)).toEqual(mobile);
    await page.screenshot({
      path: path.join(dir, variant + "-mobile.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
});
test("long 10/40/80 natural pagination, items and final footer remain unchanged", async ({
  page,
}) => {
  test.setTimeout(180000);
  for (const key of ["unpaid", "forty", "eighty"]) {
    await open(page, key);
    const result = await printPdf(page, key, false);
    expect(result.pageCount).toBe({ unpaid: 2, forty: 4, eighty: 7 }[key]);
    const text = result.pages.map((p: { text: string }) => p.text).join("\n");
    for (const p of result.pages)
      if (/QA85041-/.test(p.text))
        expect(p.text).toMatch(/ITEM QTY UNIT PRICE DISCOUNT TOTAL/);
    for (let i = 1; i <= fixture.invoices[key].count; i++)
      expect(
        text.match(
          new RegExp(`QA85041-${key}-${String(i).padStart(3, "0")}`, "g"),
        ),
      ).toHaveLength(1);
    expect(text.match(/Custom closing message/g)).toHaveLength(1);
    expect(result.pages.at(-1).text).toContain("Custom closing message");
  }
});
test("cancel, media exit, exception, retry, unmount and thermal remove short state", async ({
  page,
}) => {
  await open(page, "shortpaid");
  const original = await geometry(page);
  for (const exit of ["afterprint", "media", "focus"]) {
    await page
      .getByRole("button", { name: "Print A4 / Save PDF", exact: true })
      .click();
    await page.emulateMedia({ media: "print" });
    await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
    if (!baseline) expect((await geometry(page)).short).toBe("true");
    if (exit === "afterprint")
      await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
    await page.emulateMedia({ media: "screen" });
    if (exit === "focus")
      await page.evaluate(() => {
        window.dispatchEvent(new Event("blur"));
        window.dispatchEvent(new Event("focus"));
      });
    await expect(page.locator("#invoice-print")).not.toHaveAttribute(
      "data-invoice-a4-short",
      "true",
    );
    await expect(
      page.getByRole("button", { name: "Print A4 / Save PDF", exact: true }),
    ).toBeEnabled();
    expect(await geometry(page)).toEqual(original);
  }
  await page.evaluate(() => {
    window.print = () => {
      throw Error("QA print failure");
    };
  });
  await page
    .getByRole("button", { name: "Print A4 / Save PDF", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Print A4 / Save PDF", exact: true }),
  ).toBeEnabled();
  expect((await geometry(page)).short).toBeNull();
  await page.evaluate(() => {
    window.print = () => {};
  });
  await page.getByRole("button", { name: "Print 80mm", exact: true }).click();
  await expect(page.locator("body")).toHaveAttribute(
    "data-print-mode",
    "thermal",
  );
  await page.emulateMedia({ media: "print" });
  await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
  expect((await geometry(page)).short).toBeNull();
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await page.emulateMedia({ media: "screen" });
  await page
    .getByRole("button", { name: "Print A4 / Save PDF", exact: true })
    .click();
  await page.emulateMedia({ media: "print" });
  await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
  await page
    .locator('a[href="/invoices"]')
    .first()
    .evaluate((e: HTMLAnchorElement) => e.click());
  await expect(page.locator("#invoice-print")).toHaveCount(0);
  expect(await page.locator("[data-invoice-a4-short]").count()).toBe(0);
  await page.emulateMedia({ media: "screen" });
  results.cleanup = {
    afterprint: true,
    mediaExit: true,
    focusFallback: true,
    exception: true,
    retry: true,
    thermal: true,
    unmount: true,
  };
});

test("browser PDF lifecycle classifies real print geometry without emulated or synthetic events", async ({
  page,
}) => {
  await open(page, "shortpaid");
  const screen = await geometry(page);
  await page
    .getByRole("button", { name: "Print A4 / Save PDF", exact: true })
    .click();
  const file = path.join(dir, "real-print-lifecycle.pdf");
  await page.pdf({
    path: file,
    preferCSSPageSize: true,
    printBackground: true,
  });
  const result = pdf(file);
  expect(result.pageCount).toBe(1);
  expect(result.pages[0].clearanceMm).toBeGreaterThanOrEqual(6);
  expect(result.pages[0].clearanceMm).toBeLessThanOrEqual(15);
  expect(result.pages[0].qrClearanceMm).toBeLessThanOrEqual(15);
  await expect(
    page.getByRole("button", { name: "Print A4 / Save PDF", exact: true }),
  ).toBeEnabled();
  expect(await geometry(page)).toEqual(screen);
  results.realBrowserPrintLifecycle = result;
});
