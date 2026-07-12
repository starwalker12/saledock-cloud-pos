import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const cssPath = "src/app/globals.css";
const pagePath = "src/app/repairs/[id]/page.tsx";
const printButtonPath = "src/app/repairs/[id]/print-button.tsx";
const css = readFileSync(cssPath, "utf8");
const page = readFileSync(pagePath, "utf8");
const printButton = readFileSync(printButtonPath, "utf8");

function sourceAtHead(path) {
  return execFileSync("git", ["show", `HEAD:${path}`], { encoding: "utf8" });
}

function namedPage(name) {
  const match = css.match(new RegExp(`@page\\s+${name}\\s*\\{([^}]*)\\}`));
  assert.ok(match, `${cssPath}: missing @page ${name}`);
  return match[1];
}

function cssRule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = [...css.matchAll(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, "g"))];
  assert.ok(matches.length > 0, `${cssPath}: missing ${selector}`);
  return matches.at(-1)[1];
}

function functionBody(name) {
  const start = printButton.indexOf(`const ${name}`);
  assert.notEqual(start, -1, `${printButtonPath}: missing ${name}`);
  const next = printButton.indexOf("\n  const ", start + 1);
  return printButton.slice(start, next === -1 ? printButton.length : next);
}

test("Repairs opts into the existing full-document print contract", () => {
  assert.match(page, /<AppShell pageTitle=\{`Repair Job \$\{repair\.job_no\}`\} printFullDocument>/);
});

test("AppShell source remains unchanged", () => {
  const path = "src/components/layout/app-shell.tsx";
  assert.equal(readFileSync(path, "utf8"), sourceAtHead(path));
});

test("Reports retains its full-document print opt-in", () => {
  const reports = readFileSync("src/app/reports/page.tsx", "utf8");
  assert.match(reports, /<AppShell\s+pageTitle="Reports"\s+printFullDocument>/);
});

test("Repairs-specific named page exists", () => {
  assert.ok(namedPage("repairsThermalReceipt"));
});

test("Repairs fallback uses two absolute dimensions", () => {
  assert.match(namedPage("repairsThermalReceipt"), /size:\s*80mm\s+297mm\s*;/);
});

test("Repairs page width remains 80mm", () => {
  assert.match(namedPage("repairsThermalReceipt"), /size:\s*80mm\s+297mm\s*;/);
});

test("Repairs page margin remains 4mm", () => {
  assert.match(namedPage("repairsThermalReceipt"), /margin:\s*4mm\s*;/);
});

test("shared thermal page remains unchanged", () => {
  assert.match(namedPage("thermalReceipt"), /size:\s*80mm\s+auto\s*;/);
  assert.match(namedPage("thermalReceipt"), /margin:\s*4mm\s*;/);
});

test("Repairs thermal context requires both thermal mode and Repairs marker", () => {
  assert.ok(cssRule('body[data-print-mode="thermal"][data-repairs-thermal-print="true"]'));
});

test("Repairs body context is 72mm", () => {
  const rule = cssRule('body[data-print-mode="thermal"][data-repairs-thermal-print="true"]');
  assert.match(rule, /width:\s*72mm\s*!important/);
  assert.match(rule, /max-width:\s*72mm\s*!important/);
});

test("Repairs main context is 72mm", () => {
  const rule = cssRule('body[data-print-mode="thermal"][data-repairs-thermal-print="true"] main');
  assert.match(rule, /width:\s*72mm\s*!important/);
  assert.match(rule, /max-width:\s*72mm\s*!important/);
});

test("Repairs thermal receipt is 72mm", () => {
  const rule = cssRule(
    'body[data-print-mode="thermal"][data-repairs-thermal-print="true"] .thermal-print',
  );
  assert.match(rule, /width:\s*72mm\s*!important/);
  assert.match(rule, /max-width:\s*72mm\s*!important/);
});

test("Repairs receipt margin is zero", () => {
  const rule = cssRule(
    'body[data-print-mode="thermal"][data-repairs-thermal-print="true"] .thermal-print',
  );
  assert.match(rule, /margin:\s*0\s*!important/);
});

test("Repairs receipt uses its named page", () => {
  const rule = cssRule(
    'body[data-print-mode="thermal"][data-repairs-thermal-print="true"] .thermal-print',
  );
  assert.match(rule, /page:\s*repairsThermalReceipt\s*;/);
});

test("measurement mode is invisible and off-screen", () => {
  const rule = cssRule('.thermal-print[data-repairs-thermal-measuring="true"]');
  assert.match(rule, /position:\s*fixed\s*!important/);
  assert.match(rule, /left:\s*-10000px\s*!important/);
  assert.match(rule, /visibility:\s*hidden\s*!important/);
  assert.match(rule, /pointer-events:\s*none\s*!important/);
});

test("measurement width is exactly 72mm", () => {
  const rule = cssRule('.thermal-print[data-repairs-thermal-measuring="true"]');
  assert.match(rule, /width:\s*72mm\s*!important/);
  assert.match(rule, /max-width:\s*72mm\s*!important/);
});

test("pixel conversion uses 25.4 divided by 96", () => {
  assert.match(printButton, /CSS_PX_TO_MM\s*=\s*25\.4\s*\/\s*96/);
});

test("dynamic height includes 8mm physical margins", () => {
  assert.match(printButton, /THERMAL_TOTAL_MARGIN_MM\s*=\s*8/);
});

test("dynamic height includes 1mm allowance", () => {
  assert.match(printButton, /THERMAL_HEIGHT_ALLOWANCE_MM\s*=\s*1/);
});

test("dynamic height rounds upward to 0.1mm", () => {
  assert.match(printButton, /Math\.ceil\([\s\S]*\*\s*10[\s\S]*\)\s*\/\s*10/);
});

test("dynamic style identifier is stable", () => {
  assert.match(printButton, /THERMAL_PAGE_STYLE_ID\s*=\s*"repairs-thermal-page-size"/);
});

test("generated page CSS contains two absolute dimensions", () => {
  assert.match(
    printButton,
    /@page repairsThermalReceipt \{ size: \$\{THERMAL_PAGE_WIDTH_MM\}mm \$\{pageHeightMm\.toFixed\(1\)\}mm; margin: 4mm; \}/,
  );
});

test("each print activation owns a unique attempt identity", () => {
  assert.match(printButton, /type PrintAttempt = \{[\s\S]*id: number;[\s\S]*cancelled: boolean;/);
  assert.match(printButton, /attemptSequenceRef = useRef\(0\)/);
  assert.match(functionBody("beginPrint"), /id: \+\+attemptSequenceRef\.current/);
});

test("mounted state is tracked", () => {
  assert.match(printButton, /mountedRef = useRef\(true\)/);
  assert.match(printButton, /mountedRef\.current = false/);
});

test("cleanup cancels exact attempt ownership", () => {
  const cleanup = functionBody("createCleanup");
  assert.ok(cleanup.indexOf("attempt.cancelled = true") < cleanup.indexOf("activeAttemptRef.current === attempt"));
  assert.match(cleanup, /if \(ownsActiveState\) \{/);
});

test("thermal preparation checks cancellation after async boundaries", () => {
  const thermal = functionBody("printThermal");
  const checks = thermal.match(/if \(!isAttemptActive\(attempt\)\) return;/g) ?? [];
  assert.ok(checks.length >= 8, "expected cancellation checks across preparation boundaries");
});

test("cancellation is checked before style insertion", () => {
  const thermal = functionBody("printThermal");
  const create = thermal.indexOf('document.createElement("style")');
  const append = thermal.indexOf("document.head.append(style)");
  assert.ok(thermal.lastIndexOf("if (!isAttemptActive(attempt)) return;", append) > create);
});

test("cancellation is checked before body markers", () => {
  const thermal = functionBody("printThermal");
  const marker = thermal.indexOf('document.body.dataset.printMode = "thermal"');
  assert.ok(thermal.lastIndexOf("if (!isAttemptActive(attempt)) return;", marker) >= 0);
});

test("cancellation is checked immediately before printing", () => {
  const thermal = functionBody("printThermal");
  const print = thermal.indexOf("window.print()");
  assert.ok(thermal.lastIndexOf("if (!isAttemptActive(attempt)) return;", print) >= 0);
});

test("cancelled attempts do not show an alert", () => {
  const thermal = functionBody("printThermal");
  const catchBody = thermal.slice(thermal.indexOf("} catch {"));
  assert.ok(
    catchBody.indexOf("if (!isAttemptActive(attempt)) return;") <
      catchBody.indexOf("setThermalError(THERMAL_ERROR_MESSAGE)"),
  );
});

test("cancelled attempts schedule no fallback timeout", () => {
  const thermal = functionBody("printThermal");
  assert.match(thermal, /if \(isAttemptActive\(attempt\)\) \{\s*attempt\.timeoutId = window\.setTimeout/);
  assert.equal(printButton.includes("timeoutRef"), false);
});

test("unmount cancels and cleans the active attempt", () => {
  assert.match(printButton, /if \(activeAttemptRef\.current\) activeAttemptRef\.current\.cancelled = true/);
  assert.match(printButton, /cleanupRef\.current\?\.\(\)/);
});

test("A4 prints exactly once", () => {
  const a4 = functionBody("printA4");
  assert.match(a4, /dataset\.printMode\s*=\s*"a4"/);
  assert.equal((a4.match(/window\.print\(\)/g) ?? []).length, 1);
});

test("thermal prints exactly once per accepted activation", () => {
  const thermal = functionBody("printThermal");
  assert.equal((thermal.match(/window\.print\(\)/g) ?? []).length, 1);
});

test("duplicate thermal activation is guarded", () => {
  assert.match(functionBody("beginPrint"), /if \(inFlightRef\.current\) return null/);
});

test("safe non-native thermal error UI exists", () => {
  assert.match(
    printButton,
    /Unable to prepare the thermal repair receipt\. Please try again\./,
  );
  assert.match(printButton, /<p role="alert"/);
  assert.equal(/\balert\s*\(/.test(printButton), false);
});

test("no transform, scale, or zoom workaround exists", () => {
  const rules = [
    cssRule('.thermal-print[data-repairs-thermal-measuring="true"]'),
    cssRule('body[data-print-mode="thermal"][data-repairs-thermal-print="true"]'),
    cssRule('body[data-print-mode="thermal"][data-repairs-thermal-print="true"] main'),
    cssRule(
      'body[data-print-mode="thermal"][data-repairs-thermal-print="true"] .thermal-print',
    ),
  ].join("\n");
  assert.doesNotMatch(rules, /\b(?:transform|scale|zoom)\s*:/);
  assert.doesNotMatch(printButton, /style\.(?:transform|scale|zoom)|\.scale\s*\(/);
});

test("Repair data source remains unchanged", () => {
  const path = "src/lib/data/repairs.ts";
  assert.equal(readFileSync(path, "utf8"), sourceAtHead(path));
});

test("Repair amounts and labels remain unchanged", () => {
  for (const text of [
    "Estimated Cost:",
    "Final Cost:",
    "Advance Paid:",
    "Balance Due:",
    "Estimate",
    "Advance",
    "Balance",
    "Payment",
  ]) {
    assert.ok(page.includes(text), `${pagePath}: missing unchanged label ${text}`);
  }
  assert.match(page, /Math\.max\(\(repair\.final_cost \|\| repair\.estimated_cost\) - repair\.advance_paid, 0\)/);
});

test("Returns source remains unchanged", () => {
  for (const path of [
    "src/app/returns/[id]/page.tsx",
    "src/app/returns/[id]/print-button.tsx",
    "src/lib/data/returns.ts",
  ]) {
    assert.equal(readFileSync(path, "utf8"), sourceAtHead(path));
  }
});

test("Reports source remains unchanged", () => {
  for (const path of ["src/app/reports/page.tsx", "src/app/reports/print-button.tsx"]) {
    assert.equal(readFileSync(path, "utf8"), sourceAtHead(path));
  }
});
