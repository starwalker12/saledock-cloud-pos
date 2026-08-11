import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const cssPath = "src/app/globals.css";
const buttonPath = "src/app/invoices/[id]/print-button.tsx";
const pagePath = "src/app/invoices/[id]/page.tsx";
const dataPath = "src/lib/data/invoices.ts";
const returnsButtonPath = "src/app/returns/[id]/print-button.tsx";
const repairsButtonPath = "src/app/repairs/[id]/print-button.tsx";
const e2ePath = "tests/e2e/invoice-thermal-reliability.spec.ts";

const css = readFileSync(cssPath, "utf8");
const button = readFileSync(buttonPath, "utf8");
const page = readFileSync(pagePath, "utf8");
const invoiceData = readFileSync(dataPath, "utf8");
const returnsButton = readFileSync(returnsButtonPath, "utf8");
const repairsButton = readFileSync(repairsButtonPath, "utf8");
const e2e = readFileSync(e2ePath, "utf8");

function namedPage(name) {
  const match = css.match(new RegExp(`@page\\s+${name}\\s*\\{([^}]*)\\}`));
  assert.ok(match, `${cssPath}: missing @page ${name}`);
  return match[1];
}

function cssRule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = [
    ...css.matchAll(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, "g")),
  ];
  assert.ok(matches.length > 0, `${cssPath}: missing ${selector}`);
  return matches.at(-1)[1];
}

function functionBody(name) {
  const start = button.indexOf(`const ${name}`);
  assert.notEqual(start, -1, `${buttonPath}: missing ${name}`);
  const next = button.indexOf("\n  const ", start + 1);
  return button.slice(start, next === -1 ? button.length : next);
}

test("shared, Returns, and Repairs thermal page contracts remain unchanged", () => {
  assert.match(namedPage("thermalReceipt"), /size:\s*80mm\s+auto\s*;/);
  assert.match(namedPage("returnsThermalReceipt"), /size:\s*80mm\s+297mm\s*;/);
  assert.match(namedPage("repairsThermalReceipt"), /size:\s*80mm\s+297mm\s*;/);
  assert.match(returnsButton, /@page returnsThermalReceipt/);
  assert.match(repairsButton, /@page repairsThermalReceipt/);
  assert.doesNotMatch(returnsButton, /invoiceThermal/i);
  assert.doesNotMatch(repairsButton, /invoiceThermal/i);
});

test("Invoice owns an isolated valid thermal named page", () => {
  const pageRule = namedPage("invoiceThermalReceipt");
  assert.match(pageRule, /size:\s*80mm\s+297mm\s*;/);
  assert.match(pageRule, /margin:\s*4mm\s*;/);
  assert.doesNotMatch(pageRule, /\bauto\b/);
  assert.match(
    button,
    /THERMAL_PAGE_STYLE_ID\s*=\s*"invoice-thermal-page-size"/,
  );
  assert.match(button, /dataset\.invoiceThermalPrint\s*=\s*"true"/);
  assert.doesNotMatch(button, /size:\s*80mm\s+auto/);
});

test("Invoice measurement is hidden and exactly 72mm wide", () => {
  const rule = cssRule('.thermal-print[data-invoice-thermal-measuring="true"]');
  assert.match(rule, /display:\s*block\s*!important/);
  assert.match(rule, /position:\s*fixed\s*!important/);
  assert.match(rule, /left:\s*-10000px\s*!important/);
  assert.match(rule, /visibility:\s*hidden\s*!important/);
  assert.match(rule, /pointer-events:\s*none\s*!important/);
  assert.match(rule, /width:\s*72mm\s*!important/);
  assert.match(rule, /max-width:\s*72mm\s*!important/);
  assert.match(rule, /height:\s*auto\s*!important/);
  assert.match(rule, /overflow:\s*visible\s*!important/);
});

test("Invoice print body, main, and receipt use the physical 72mm content box", () => {
  const body = cssRule(
    'body[data-print-mode="thermal"][data-invoice-thermal-print="true"]',
  );
  const main = cssRule(
    'body[data-print-mode="thermal"][data-invoice-thermal-print="true"] main',
  );
  const receipt = cssRule(
    'body[data-print-mode="thermal"][data-invoice-thermal-print="true"] .thermal-print',
  );
  for (const rule of [body, main, receipt]) {
    assert.match(rule, /width:\s*72mm\s*!important/);
    assert.match(rule, /max-width:\s*72mm\s*!important/);
    assert.match(rule, /margin:\s*0\s*!important/);
  }
  assert.match(main, /padding:\s*0\s*!important/);
  assert.match(main, /flex:\s*none\s*!important/);
  assert.match(receipt, /page:\s*invoiceThermalReceipt\s*;/);
});

test("dynamic height uses measured pixels, margins, allowance, and finite bounds", () => {
  assert.match(button, /CSS_PX_TO_MM\s*=\s*25\.4\s*\/\s*96/);
  assert.match(button, /THERMAL_PAGE_WIDTH_MM\s*=\s*80/);
  assert.match(button, /THERMAL_CONTENT_WIDTH_MM\s*=\s*72/);
  assert.match(button, /THERMAL_TOTAL_MARGIN_MM\s*=\s*8/);
  assert.match(button, /THERMAL_HEIGHT_ALLOWANCE_MM\s*=\s*1/);
  assert.match(button, /MIN_THERMAL_PAGE_HEIGHT_MM\s*=\s*20/);
  assert.match(button, /MAX_THERMAL_PAGE_HEIGHT_MM\s*=\s*5000/);
  assert.match(button, /receiptBounds\.height\s*\*\s*CSS_PX_TO_MM/);
  assert.match(button, /Math\.ceil\([\s\S]*\*\s*10,[\s\S]*\)\s*\/\s*10/);
  assert.match(button, /Number\.isFinite\(pageHeightMm\)/);
});

test("generated Invoice page CSS uses two absolute dimensions", () => {
  assert.match(
    button,
    /@page invoiceThermalReceipt \{ size: \$\{THERMAL_PAGE_WIDTH_MM\}mm \$\{pageHeightMm\.toFixed\(1\)\}mm; margin: 4mm; \}/,
  );
});

test("measurement waits for fonts, images, decode, and stable layout frames", () => {
  const thermal = functionBody("printThermal");
  assert.match(button, /document\.fonts\?\.ready/);
  assert.match(button, /receipt\.querySelectorAll\("img"\)/);
  assert.match(button, /typeof image\.decode === "function"/);
  assert.match(button, /READINESS_TIMEOUT_MS\s*=\s*5000/);
  assert.match(thermal, /await waitForReceiptReadiness\(receipt\)/);
  assert.equal(
    (thermal.match(/await nextAnimationFrame\(\)/g) ?? []).length,
    3,
  );
});

test("thermal preparation is attempt-owned, locked, and prints once", () => {
  const begin = functionBody("beginPrint");
  const thermal = functionBody("printThermal");
  assert.match(begin, /if \(inFlightRef\.current\) return null/);
  assert.match(begin, /id: \+\+attemptSequenceRef\.current/);
  assert.match(begin, /activeAttemptRef\.current = attempt/);
  assert.match(thermal, /const print = beginPrint\(invoiceNo\)/);
  assert.equal((thermal.match(/window\.print\(\)/g) ?? []).length, 1);
  assert.match(button, /disabled=\{isPrinting\}/);
});

test("thermal cancellation is checked throughout asynchronous preparation", () => {
  const thermal = functionBody("printThermal");
  const readiness = thermal.indexOf("await waitForReceiptReadiness(receipt)");
  const measurement = thermal.indexOf(
    "const receiptBounds = receipt.getBoundingClientRect()",
  );
  const styleAppend = thermal.indexOf("document.head.append(style)");
  const print = thermal.indexOf("window.print()");
  const checks = [
    ...thermal.matchAll(/if \(!isAttemptActive\(attempt\)\) return;/g),
  ].map((match) => match.index);
  assert.ok(
    checks.some((position) => position > readiness && position < measurement),
  );
  assert.ok(checks.some((position) => position < styleAppend));
  assert.ok(
    checks.some((position) => position > styleAppend && position < print),
  );
});

test("cleanup removes only the owning Invoice state and cancels stale work", () => {
  const begin = functionBody("beginPrint");
  assert.match(begin, /attempt\.cancelled = true/);
  assert.match(begin, /activeAttemptRef\.current === attempt/);
  assert.match(begin, /getElementById\(THERMAL_PAGE_STYLE_ID\)\?\.remove\(\)/);
  assert.match(begin, /delete element\.dataset\.invoiceThermalMeasuring/);
  assert.match(begin, /delete document\.body\.dataset\.printMode/);
  assert.match(begin, /delete document\.body\.dataset\.invoiceThermalPrint/);
  assert.match(button, /mountedRef\.current = false/);
  assert.match(button, /cleanupRef\.current\?\.\(\)/);
});

test("print lifetime uses afterprint, print media, and post-dialog focus ownership", () => {
  assert.match(button, /addEventListener\("afterprint", cleanup\)/);
  assert.match(button, /matchMedia\("print"\)/);
  assert.match(button, /addEventListener\("change", onPrintMediaChange\)/);
  assert.match(button, /windowBlurred/);
  assert.match(button, /addEventListener\("focus", onWindowFocus\)/);
  assert.match(button, /FOCUS_CLEANUP_DELAY_MS\s*=\s*250/);
  assert.doesNotMatch(button, /1200/);
  assert.doesNotMatch(button, /PRINT_CLEANUP_DELAY_MS/);
});

test("A4 remains separate and prints exactly once", () => {
  const a4 = functionBody("printA4");
  assert.match(a4, /dataset\.printMode\s*=\s*"a4"/);
  assert.equal((a4.match(/window\.print\(\)/g) ?? []).length, 1);
  assert.doesNotMatch(
    a4,
    /THERMAL_PAGE_STYLE_ID|invoiceThermalPrint|thermal-print/,
  );
});

test("thermal failures are visible, non-native, and cleanly retryable", () => {
  assert.match(
    button,
    /Unable to prepare the thermal invoice\. Please try again\./,
  );
  assert.match(button, /<p role="alert"/);
  assert.doesNotMatch(button, /\balert\s*\(/);
  const thermal = functionBody("printThermal");
  assert.match(
    thermal,
    /cleanup\(\);[\s\S]*setThermalError\(THERMAL_ERROR_MESSAGE\)/,
  );
  assert.doesNotMatch(thermal, /printA4\(/);
});

test("existing Invoice receipt and data contracts remain read-only", () => {
  assert.match(
    page,
    /<article className="thermal-print hidden bg-white text-black">/,
  );
  assert.match(page, /<PrintButton[\s\S]*invoiceNo=\{invoice\.invoice_no\}/);
  assert.match(page, /Grand total/);
  assert.match(page, /Payments/);
  assert.match(page, /<footer/);
  assert.doesNotMatch(invoiceData, /\.(?:insert|update|upsert|delete)\s*\(/);
});

test("WhatsApp text, normalization, image, modal, and Copy Text behavior remain present", () => {
  assert.match(button, /function getWhatsAppPhone/);
  assert.match(button, /cleaned\.length === 11 && cleaned\.startsWith\("03"\)/);
  assert.match(button, /function buildTextMessage/);
  assert.match(button, /https:\/\/api\.whatsapp\.com\/send/);
  assert.match(button, /await import\("html-to-image"\)/);
  assert.match(button, /Share Invoice/);
  assert.match(button, /Copy Text/);
  assert.match(button, /Download Image/);
});

test("explicit evidence acquisition fails before local admin or fixture work", () => {
  assert.match(e2e, /function prepareEvidenceRoot\(\): void/);
  assert.match(e2e, /if \(existsSync\(EVIDENCE_ROOT\)\)/);
  assert.match(e2e, /mkdirSync\(EVIDENCE_ROOT\)/);
  assert.doesNotMatch(
    e2e.slice(0, e2e.indexOf("function prepareEvidenceRoot")),
    /mkdirSync\(EVIDENCE_ROOT\)/,
  );
  const prepare = e2e.indexOf("prepareEvidenceRoot();");
  const admin = e2e.indexOf("const admin = getLocalAdminClient();");
  const fixture = e2e.indexOf("const fixture = makeFixture();");
  assert.ok(prepare !== -1 && prepare < admin && prepare < fixture);
});
