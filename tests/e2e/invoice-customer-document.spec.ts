import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import {
  isLocalPlaywrightRun,
  loginLocalOwnerDirectly,
} from "./helpers/local-supabase";
import { createInvoiceDesignFixture } from "./helpers/invoice-design-fixture";
import {
  BinaryBitmap,
  HybridBinarizer,
  RGBLuminanceSource,
  MultiFormatReader,
} from "@zxing/library";

test.describe.configure({ mode: "serial", retries: 0 });
test.use({ trace: "off", video: "off", screenshot: "off" });
test.skip(!isLocalPlaywrightRun(), "Synthetic local fixtures only");
const before = process.env.QA_INVOICE_DESIGN_PHASE === "before";
let fixture: Awaited<ReturnType<typeof createInvoiceDesignFixture>>;
const observations: Record<string, unknown> = {};
const evidence = process.env.QA_EVIDENCE_DIR || "test-results";
const artifacts = path.join(
  evidence,
  before ? "before" : `after-${process.env.QA_RUN_LABEL || "invoice"}`,
);

test.beforeAll(async () => {
  fs.mkdirSync(artifacts, { recursive: true });
  fixture = await createInvoiceDesignFixture();
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
  await page.evaluate(() => {
    window.print = () => {};
    window.open = () => null;
  });
});
test.afterAll(async () => {
  if (fixture) {
    const ending = await fixture.snapshot();
    expect(ending).toEqual(fixture.startingSnapshot);
    await fixture.cleanup();
  }
  fs.writeFileSync(
    path.join(artifacts, "observations.json"),
    JSON.stringify(
      {
        ...observations,
        invoiceItemsPaymentsCustomersUnchanged: true,
        exactFixtureCleanup: true,
      },
      null,
      2,
    ),
  );
});
async function open(page: Page, key: string) {
  await page.goto(`/invoices/${fixture.invoices[key].id}`);
  await expect(page.locator("#invoice-print")).toBeVisible();
  await page
    .getByRole("img", { name: "Shop location QR code", exact: true })
    .waitFor();
  await page.evaluate(() => {
    window.print = () => {};
    const state = window as typeof window & { invoiceOpened: string[]; invoiceCopied: string };
    state.invoiceOpened = [];
    state.invoiceCopied = "";
    window.open = url => { state.invoiceOpened.push(String(url)); return null; };
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text: string) => { state.invoiceCopied = text; } } });
  });
}
function inspectPdf(file: string) {
  execFileSync("pdftoppm", [
    "-png",
    "-r",
    "90",
    file,
    file.replace(".pdf", ""),
  ]);
  const script = String.raw`
import sys,glob,json,pdfplumber,logging
logging.getLogger('pdfminer').setLevel(logging.ERROR)
from PIL import Image
with pdfplumber.open(sys.argv[1]) as pdf:
 pages=[]
 for i,page in enumerate(pdf.pages):
  im=Image.open(sys.argv[1].replace('.pdf','')+'-'+str(i+1)+'.png').convert('RGB')
  words=page.extract_words()
  outside=[w['text'] for w in words if w['x0']<25 or w['x1']>page.width-25 or w['top']<25 or w['bottom']>page.height-25]
  images=[{'left':x['x0'],'right':x['x1'],'top':x['top'],'bottom':x['bottom']} for x in page.images]
  clipped_images=[x for x in images if x['left']<25 or x['right']>page.width-25 or x['top']<25 or x['bottom']>page.height-25]
  pages.append({'text':page.extract_text() or '', 'words':len(words),'outside':outside,'clippedImages':clipped_images,'images':images,'cornerWhite':im.getpixel((2,2))==(255,255,255),'bottomWhite':all(im.getpixel((x,im.height-3))==(255,255,255) for x in range(3,im.width-3))})
 print(json.dumps({'pageCount':len(pages),'pages':pages}))
`;
  return JSON.parse(
    execFileSync("python3", ["-c", script, file], { encoding: "utf8" }),
  );
}

async function assertGeometry(page: Page) {
  const result = await page.locator("#invoice-print").evaluate((document) => {
    const bounds = document.getBoundingClientRect();
    const overflow = Array.from(
      document.querySelectorAll<HTMLElement>("h1, h2, p, dd, td, th, img"),
    )
      .filter((element) => {
        if (!element.getClientRects().length) return false;
        const rect = element.getBoundingClientRect();
        return (
          rect.left < bounds.left - 1 ||
          rect.right > bounds.right + 1 ||
          element.scrollWidth > element.clientWidth + 1
        );
      })
      .map((element) => element.tagName + ":" + element.className);
    const overlaps = Array.from(
      document.querySelectorAll(
        ".invoice-summary > div, .invoice-payments dl > div",
      ),
    )
      .filter((row) => {
        const label = row.querySelector("dt")!.getBoundingClientRect();
        const amount = row.querySelector("dd")!.getBoundingClientRect();
        return label.right > amount.left - 2;
      })
      .map((row) => row.textContent);
    return { overflow, overlaps };
  });
  expect(result).toEqual({ overflow: [], overlaps: [] });
}

async function assertQr(page: Page) {
  const qr = page.getByRole("img", {
    name: "Shop location QR code",
    exact: true,
  });
  const pixels = await qr.evaluate((image: HTMLImageElement) => {
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(image, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    return {
      width: canvas.width,
      height: canvas.height,
      data: Array.from(data),
      rendered: image.getBoundingClientRect().width,
    };
  });
  expect(pixels.rendered).toBeGreaterThanOrEqual(100);
  const luminance = new Uint8ClampedArray(pixels.width * pixels.height);
  for (let i = 0; i < luminance.length; i++) luminance[i] = pixels.data[i * 4];
  const decoded = new MultiFormatReader().decode(
    new BinaryBitmap(
      new HybridBinarizer(
        new RGBLuminanceSource(luminance, pixels.width, pixels.height),
      ),
    ),
  );
  expect(decoded.getText()).toContain("maps.google.com");
  for (let x = 0; x < pixels.width; x++) expect(luminance[x]).toBe(255);
  observations.qr = {
    generated: pixels.width,
    rendered: pixels.rendered,
    decoded: true,
    quietZone: true,
  };
}

test("document state matrix, desktop/mobile and 1/10/40/80-item print geometry", async ({
  page,
}) => {
  test.setTimeout(180000);
  for (const key of Object.keys(fixture.invoices)) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, key);
    await page.screenshot({
      path: path.join(artifacts, `${key}-desktop.png`),
      fullPage: true,
    });
    if (!before) {
      await expect(page.locator("#invoice-print")).not.toContainText(
        /Profitability|Total cost|Gross profit|Purchase cost|Create Return/,
      );
      await expect(page.locator("#invoice-print")).toContainText(
        "Northline Studio & Supply",
      );
      await expect(page.locator("#invoice-print")).not.toContainText(
        "QA TERMS MUST NOT BE SILENTLY REPURPOSED",
      );
      expect(
        await page
          .locator("#invoice-print")
          .evaluate((e) => getComputedStyle(e).backgroundColor),
      ).toBe("rgb(255, 255, 255)");
      expect(
        await page
          .locator("#invoice-print")
          .evaluate((e) => e.scrollWidth <= e.clientWidth),
      ).toBe(true);
      await assertGeometry(page);
      if (key === "paid") await assertQr(page);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: path.join(artifacts, `${key}-mobile.png`),
      fullPage: true,
    });
    if (!before) {
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await expect(page.locator("#invoice-print")).toContainText(
        fixture.invoices[key].total.toLocaleString("en-PK"),
      );
      await assertGeometry(page);
    }
    await page
      .getByRole("button", { name: "Print A4 / Save PDF", exact: true })
      .click();
    await expect(page.locator("body")).toHaveAttribute("data-print-mode", "a4");
    await page.emulateMedia({ media: "print" });
    if (!before) await assertGeometry(page);
    const file = path.join(artifacts, `${key}-a4.pdf`);
    await page.pdf({
      path: file,
      preferCSSPageSize: true,
      printBackground: true,
    });
    const pdf = inspectPdf(file);
    const text = pdf.pages.map((p: { text: string }) => p.text).join("\n");
    for (let i = 1; i <= fixture.invoices[key].count; i++)
      expect(
        text.match(
          new RegExp(`QA85041-${key}-${String(i).padStart(3, "0")}`, "g"),
        ),
      ).toHaveLength(1);
    if (!before) {
      for (const p of pdf.pages) {
        expect(p.words).toBeGreaterThan(0);
        expect(p.outside).toEqual([]);
        expect(p.clippedImages).toEqual([]);
        expect(p.cornerWhite).toBe(true);
        expect(p.bottomWhite).toBe(true);
      }
      if (fixture.invoices[key].count === 1) expect(pdf.pageCount).toBe(1);
      expect(text).not.toMatch(
        /Profitability|Gross profit|Total cost|773\.21|Purchase cost|Return items/,
      );
      expect(text.match(/Grand total/g)).toHaveLength(1);
      expect(text.match(/Balance due/g) ?? []).toHaveLength(
        key === "unpaid" ||
          key === "partial" ||
          key === "large" ||
          key === "midlarge"
          ? 1
          : 0,
      );
      expect(text.match(/Thank you for your business/g)).toHaveLength(1);
      expect(text).toContain("Scan for directions");
    }
    observations[key] = pdf;
    await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
    await page.emulateMedia({ media: "screen" });
  }
});

test("brand/logo/QR/contact variants retain a stable customer document", async ({
  page,
}) => {
  test.setTimeout(120000);
  for (const variant of ["wide", "square", "tall", "none", "minimal", "long"]) {
    const logo =
      variant === "none" || variant === "minimal"
        ? ""
        : `/qa85041-${variant === "long" ? "wide" : variant}.png`;
    await page.route(/\/qa85041-(?:wide|square|tall)\.png/, (route) => {
      const shape = route
        .request()
        .url()
        .match(/qa85041-(\w+)\.png/)![1];
      const png = execFileSync("python3", [
        "-c",
        "from PIL import Image,ImageDraw;import io,sys;w,h=map(int,sys.argv[1:]);im=Image.new('RGB',(w,h),'#15665D');d=ImageDraw.Draw(im);d.text((10,10),'NORTHLINE',fill='white');b=io.BytesIO();im.save(b,format='PNG');sys.stdout.buffer.write(b.getvalue())",
        ...(shape === "wide"
          ? ["360", "80"]
          : shape === "tall"
            ? ["90", "180"]
            : ["120", "120"]),
      ]);
      return route.fulfill({ contentType: "image/png", body: png });
    });
    await fixture.branding(
      {
        name:
          variant === "long"
            ? "Northline Professional Services, Equipment & Everyday Essentials for the Entire Community"
            : "Northline Studio & Supply",
        footer:
          variant === "minimal" ? "" : "Custom closing message: thank you.",
        primary_color: variant === "minimal" ? null : "#15665D",
        email: variant === "minimal" ? null : "hello@example.test",
        branch_phone: variant === "minimal" ? null : "03000000000",
        branch_address:
          variant === "long"
            ? "Suite 405, Fourth Floor, Northline Commercial Building, 124 Extended Market Avenue, Central Business District, Karachi, Pakistan"
            : "24 Market Street, Business District",
      },
      { invoice_show_location_qr: variant !== "minimal", logo_url: logo },
    );
    await page.goto(`/invoices/${fixture.invoices.paid.id}`);
    await expect(page.locator("#invoice-print")).toBeVisible();
    if (logo)
      await expect(
        page.getByRole("img", { name: /logo$/ }).first(),
      ).toBeVisible();
    if (variant !== "minimal")
      await expect(
        page.getByRole("img", { name: "Shop location QR code", exact: true }),
      ).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: path.join(artifacts, `brand-${variant}.png`),
      fullPage: true,
    });
    if (!before) {
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      expect(
        await page
          .locator("#invoice-print")
          .evaluate((e) => e.getAttribute("style")),
      ).not.toContain("position:fixed");
      expect(
        await page
          .locator("#invoice-print img[alt='Shop location QR code']")
          .count(),
      ).toBe(variant === "minimal" ? 0 : 1);
      await assertGeometry(page);
    }
    await page.evaluate(() => {
      document.body.dataset.printMode = "a4";
    });
    await page.emulateMedia({ media: "print" });
    const file = path.join(artifacts, `brand-${variant}-a4.pdf`);
    await page.pdf({
      path: file,
      preferCSSPageSize: true,
      printBackground: true,
    });
    const pdf = inspectPdf(file);
    if (!before) {
      expect(pdf.pageCount).toBe(1);
      expect(pdf.pages[0].outside).toEqual([]);
      expect(pdf.pages[0].clippedImages).toEqual([]);
      expect(pdf.pages[0].bottomWhite).toBe(true);
      await assertGeometry(page);
    }
    observations[`brand-${variant}`] = pdf;
    await page.emulateMedia({ media: "screen" });
    await page.evaluate(() => {
      delete document.body.dataset.printMode;
    });
    if (!before && variant === "wide") {
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        page
          .getByRole("button", { name: "Download Image", exact: true })
          .click(),
      ]);
      await download.saveAs(path.join(artifacts, "custom-logo-image.png"));
    }
    await page.unroute(/\/qa85041-(?:wide|square|tall)\.png/);
  }
  await fixture.branding({});
});

test("dark screen/image/WhatsApp are white and contain customer truth only for privileged roles", async ({
  page,
}) => {
  test.setTimeout(120000);
  for (const role of before ? ["owner"] : ["owner", "admin", "manager"]) {
    await fixture.admin
      .from("profiles")
      .update({ role })
      .eq("organization_id", fixture.org);
    await open(page, "partial");
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await page.screenshot({
      path: path.join(artifacts, `${role}-dark.png`),
      fullPage: true,
    });
    if (!before) {
      await page.evaluate(() => {
        document.body.dataset.printMode = "a4";
      });
      await page.emulateMedia({ media: "print" });
      const file = path.join(artifacts, `${role}-dark-a4.pdf`);
      await page.pdf({
        path: file,
        preferCSSPageSize: true,
        printBackground: true,
      });
      const pdf = inspectPdf(file);
      for (const p of pdf.pages) {
        expect(p.cornerWhite).toBe(true);
        expect(p.bottomWhite).toBe(true);
        expect(p.text).not.toMatch(
          /773\.21|Profitability|Gross profit|Total cost/,
        );
      }
      observations[`${role}DarkA4`] = pdf;
      await page.emulateMedia({ media: "screen" });
      await page.evaluate(() => {
        delete document.body.dataset.printMode;
      });
    }
    await page
      .getByRole("button", { name: "Share WhatsApp", exact: true })
      .click();
    if (!before) {
      const dialog = page.getByRole("dialog", { name: "Share Invoice" });
      await expect(dialog).toHaveAttribute("aria-modal", "true");
      await expect(dialog.getByRole("heading")).toBeFocused();
      for (let i = 0; i < 8; i++) {
        await page.keyboard.press("Tab");
        expect(
          await dialog.evaluate((element) =>
            element.contains(document.activeElement),
          ),
        ).toBe(true);
      }
    }
    const text = await page.locator("textarea[readonly]").inputValue();
    expect(text).toContain("Invoice");
    if (!before) {
      expect(text).toContain("Balance due");
      expect(text).not.toMatch(/purchase|profit|773\.21|discount: PKR 0/i);
      const opened = await page.evaluate(() => (window as typeof window & { invoiceOpened: string[] }).invoiceOpened);
      expect(opened).toHaveLength(1);
      const url = new URL(opened[0]);
      expect(url.hostname).toBe("api.whatsapp.com");
      expect(url.searchParams.get("text")).toBe(text);
      expect(url.searchParams.get("phone")).toBe("923000000001");
      await page.getByRole("button", { name: "Copy Text", exact: true }).click();
      await expect(page.getByRole("button", { name: "Copied!", exact: true })).toBeVisible();
      expect(await page.evaluate(() => (window as typeof window & { invoiceCopied: string }).invoiceCopied)).toBe(text);
    }
    const downloadButton = (
      before
        ? page.locator(".fixed textarea").locator("..").locator("..")
        : page.getByRole("dialog", { name: "Share Invoice" })
    ).getByRole("button", { name: "Download Image", exact: true });
    await expect(downloadButton).toBeVisible({ timeout: 15000 });
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      downloadButton.click(),
    ]);
    const file = path.join(artifacts, `${role}-dark-image.png`);
    await download.saveAs(file);
    const result = JSON.parse(
      execFileSync(
        "python3",
        [
          "-c",
          "from PIL import Image;import sys,json;im=Image.open(sys.argv[1]).convert('RGB');print(json.dumps({'size':im.size,'corner':im.getpixel((2,8)),'bottom':im.getpixel((im.width-3,im.height-3))}))",
          file,
        ],
        { encoding: "utf8" },
      ),
    );
    if (!before) {
      expect(result.corner).toEqual([255, 255, 255]);
      expect(result.bottom).toEqual([255, 255, 255]);
    }
    observations[`${role}Image`] = result;
    if (!before && process.env.QA_INVOICE_IMAGE_OCR) {
      const text = execFileSync(
        "swift",
        [process.env.QA_INVOICE_IMAGE_OCR, file],
        { encoding: "utf8" },
      );
      expect(text).toContain("Northline");
      expect(text).toContain("Grand total");
      expect(text).not.toMatch(
        /773[.,]21|Profitability|Gross profit|Total cost|Internal purchase|Return items/i,
      );
      fs.writeFileSync(path.join(artifacts, `${role}-image-ocr.txt`), text);
    }
    await page.getByRole("button", { name: "Close", exact: true }).click();
    if (!before)
      await expect(
        page.getByRole("button", { name: "Share WhatsApp", exact: true }),
      ).toBeFocused();
    await page.evaluate(() =>
      document.documentElement.classList.remove("dark"),
    );
    if (!before) {
      await page.setViewportSize({ width: 390, height: 844 });
      const [direct] = await Promise.all([
        page.waitForEvent("download"),
        page
          .getByRole("button", { name: "Download Image", exact: true })
          .click(),
      ]);
      await direct.saveAs(path.join(artifacts, `${role}-mobile-image.png`));
      const mobileFile = path.join(artifacts, `${role}-mobile-image.png`);
      if (process.env.QA_INVOICE_IMAGE_OCR) {
        const text = execFileSync(
          "swift",
          [process.env.QA_INVOICE_IMAGE_OCR, mobileFile],
          { encoding: "utf8" },
        );
        expect(text).toContain("Northline");
        expect(text).not.toMatch(
          /773[.,]21|Profitability|Gross profit|Total cost|Internal purchase|Return items/i,
        );
        fs.writeFileSync(
          path.join(artifacts, `${role}-mobile-image-ocr.txt`),
          text,
        );
      }
      await assertGeometry(page);
      await page.setViewportSize({ width: 1440, height: 900 });
    }
  }
  await fixture.admin
    .from("profiles")
    .update({ role: "owner" })
    .eq("organization_id", fixture.org);
});
