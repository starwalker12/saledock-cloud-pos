import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const cssPath = "src/app/globals.css";
const buttonPath = "src/app/invoices/[id]/print-button.tsx";
const appShellPath = "src/components/layout/app-shell.tsx";
const e2ePath = "tests/e2e/invoice-thermal-chrome151-mixed-page.spec.ts";

const css = readFileSync(cssPath, "utf8");
const button = readFileSync(buttonPath, "utf8");
const appShell = readFileSync(appShellPath, "utf8");
const e2e = readFileSync(e2ePath, "utf8");

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

test("Invoice thermal mode assigns the root page box to its named page", () => {
  const selector =
    'html:has(body[data-print-mode="thermal"][data-invoice-thermal-print="true"])';
  const rule = cssRule(selector);
  assert.match(rule, /page:\s*invoiceThermalReceipt\s*;/);
  assert.equal((css.match(new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? []).length, 1);
});

test("root page ownership is Invoice-only and does not alter shared thermal modes", () => {
  const rootRule = cssRule(
    'html:has(body[data-print-mode="thermal"][data-invoice-thermal-print="true"])',
  );
  assert.doesNotMatch(rootRule, /returns|repairs|shift/i);
  assert.match(
    cssRule(
      'body[data-print-mode="thermal"][data-returns-thermal-print="true"] .thermal-print',
    ),
    /page:\s*returnsThermalReceipt\s*;/,
  );
  assert.match(
    cssRule(
      'body[data-print-mode="thermal"][data-repairs-thermal-print="true"] .thermal-print',
    ),
    /page:\s*repairsThermalReceipt\s*;/,
  );
  assert.match(
    cssRule('body[data-print-mode="shift-thermal"] .shift-thermal-print'),
    /page:\s*thermalReceipt\s*;/,
  );
});

test("Invoice receipt and root share one dynamic named-page context", () => {
  assert.match(
    cssRule(
      'body[data-print-mode="thermal"][data-invoice-thermal-print="true"] .thermal-print',
    ),
    /page:\s*invoiceThermalReceipt\s*;/,
  );
  assert.match(
    button,
    /@page invoiceThermalReceipt \{ size: \$\{THERMAL_PAGE_WIDTH_MM\}mm \$\{pageHeightMm\.toFixed\(1\)\}mm; margin: 4mm; \}/,
  );
  assert.match(button, /THERMAL_PAGE_WIDTH_MM\s*=\s*80/);
  assert.match(button, /THERMAL_CONTENT_WIDTH_MM\s*=\s*72/);
  assert.match(button, /MAX_THERMAL_PAGE_HEIGHT_MM\s*=\s*5000/);
});

test("Invoice marker is installed before one print and removed by owned cleanup", () => {
  const thermal = functionBody("printThermal");
  const marker = thermal.indexOf(
    'document.body.dataset.invoiceThermalPrint = "true"',
  );
  const print = thermal.indexOf("window.print()");
  assert.ok(marker >= 0 && print > marker);
  assert.equal((thermal.match(/window\.print\(\)/g) ?? []).length, 1);

  const begin = functionBody("beginPrint");
  assert.match(begin, /delete document\.body\.dataset\.invoiceThermalPrint/);
  assert.match(begin, /getElementById\(THERMAL_PAGE_STYLE_ID\)\?\.remove\(\)/);
  assert.match(begin, /if \(inFlightRef\.current\) return null/);
});

test("A4 and non-Invoice thermal paths cannot activate the root named page", () => {
  const a4 = functionBody("printA4");
  assert.match(a4, /dataset\.printMode\s*=\s*"a4"/);
  assert.doesNotMatch(a4, /invoiceThermalPrint|THERMAL_PAGE_STYLE_ID/);
  assert.doesNotMatch(
    cssRule(
      'html:has(body[data-print-mode="thermal"][data-invoice-thermal-print="true"])',
    ),
    /size:|margin:|display:|height:|overflow:/,
  );
});

test("AppShell remains an unchanged semantic boundary, not a required source edit", () => {
  assert.match(appShell, /data-app-shell-root/);
  assert.match(appShell, /data-app-shell-column/);
  assert.match(appShell, /data-app-shell-main/);
  assert.match(appShell, /data-app-shell-content/);
  assert.match(appShell, /printFullDocument = false/);
  assert.doesNotMatch(appShell, /invoiceThermalReceipt|invoiceThermalPrint/);
});

test("Chrome 151 E2E uses the exact executable and loopback-only business truth", () => {
  assert.match(
    e2e,
    /Google Chrome\.app\/Contents\/MacOS\/Google Chrome/,
  );
  assert.match(e2e, /151\.0\.7922\.109/);
  assert.match(e2e, /executablePath:\s*CHROME_151_EXECUTABLE/);
  assert.match(e2e, /test\.describe\.configure\(\{ mode: "serial", retries: 0 \}\)/);
  assert.match(e2e, /isLocalPlaywrightRun\(\)/);
  assert.doesNotMatch(e2e, /saledock\.site|production-failure\.pdf/);
});

test("Chrome 151 E2E covers standard, long, A4, cleanup, and no browser writes", () => {
  assert.match(e2e, /standardAttempts/);
  assert.match(e2e, /expandLongFixture/);
  assert.match(e2e, /captureA4/);
  assert.match(e2e, /failure cleanup/);
  assert.match(e2e, /browserWrites/);
  assert.match(e2e, /cleanupFixture/);
  assert.match(e2e, /closingSafety/);
});
