import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const cssPath = "src/app/globals.css";
const printButtonPath = "src/app/returns/[id]/print-button.tsx";
const css = readFileSync(cssPath, "utf8");
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

test("Returns-specific named page uses a valid absolute fallback", () => {
  const page = namedPage("returnsThermalReceipt");
  assert.match(page, /size:\s*80mm\s+297mm\s*;/, "fallback must use two absolute dimensions");
  assert.match(page, /margin:\s*4mm\s*;/, "Returns thermal page margin must remain 4mm");
});

test("shared thermal page contract remains unchanged", () => {
  const page = namedPage("thermalReceipt");
  assert.match(page, /size:\s*80mm\s+auto\s*;/, "shared thermal page size changed unexpectedly");
  assert.match(page, /margin:\s*4mm\s*;/, "shared thermal page margin changed unexpectedly");
});

test("Returns-only body print context is scoped and 72mm wide", () => {
  const selector = 'body[data-print-mode="thermal"][data-returns-thermal-print="true"]';
  const rule = cssRule(selector);
  assert.match(rule, /width:\s*72mm\s*!important/);
  assert.match(rule, /max-width:\s*72mm\s*!important/);
  assert.match(rule, /margin:\s*0\s*!important/);
});

test("Returns-only main print context is 72mm and non-growing", () => {
  const selector = 'body[data-print-mode="thermal"][data-returns-thermal-print="true"] main';
  const rule = cssRule(selector);
  assert.match(rule, /width:\s*72mm\s*!important/);
  assert.match(rule, /max-width:\s*72mm\s*!important/);
  assert.match(rule, /margin:\s*0\s*!important/);
  assert.match(rule, /padding:\s*0\s*!important/);
  assert.match(rule, /flex:\s*none\s*!important/);
});

test("Returns receipt uses the centered 72mm named-page contract", () => {
  const selector =
    'body[data-print-mode="thermal"][data-returns-thermal-print="true"] .thermal-print';
  const rule = cssRule(selector);
  assert.match(rule, /width:\s*72mm\s*!important/);
  assert.match(rule, /max-width:\s*72mm\s*!important/);
  assert.match(rule, /margin:\s*0\s*!important/);
  assert.match(rule, /page:\s*returnsThermalReceipt\s*;/);
});

test("measurement mode is invisible, off-screen, and exactly 72mm", () => {
  const rule = cssRule('.thermal-print[data-returns-thermal-measuring="true"]');
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

test("thermal height uses CSS-pixel conversion, margins, and upward allowance", () => {
  assert.match(printButton, /CSS_PX_TO_MM\s*=\s*25\.4\s*\/\s*96/);
  assert.match(printButton, /THERMAL_TOTAL_MARGIN_MM\s*=\s*8/);
  assert.match(printButton, /THERMAL_HEIGHT_ALLOWANCE_MM\s*=\s*1/);
  assert.match(printButton, /Math\.ceil\([\s\S]*\*\s*10[\s\S]*\)\s*\/\s*10/);
  assert.match(printButton, /THERMAL_CONTENT_WIDTH_MM\s*=\s*72/);
});

test("generated Returns page CSS uses a stable style and two lengths", () => {
  assert.match(printButton, /THERMAL_PAGE_STYLE_ID\s*=\s*"returns-thermal-page-size"/);
  assert.match(
    printButton,
    /@page returnsThermalReceipt \{ size: \$\{THERMAL_PAGE_WIDTH_MM\}mm \$\{pageHeightMm\.toFixed\(1\)\}mm; margin: 4mm; \}/,
  );
});

test("cleanup removes dynamic style and all thermal markers", () => {
  const cleanup = printButton.slice(
    printButton.indexOf("const createCleanup"),
    printButton.indexOf("const beginPrint"),
  );
  assert.match(cleanup, /getElementById\(THERMAL_PAGE_STYLE_ID\)\?\.remove\(\)/);
  assert.match(cleanup, /delete element\.dataset\.returnsThermalMeasuring/);
  assert.match(cleanup, /delete document\.body\.dataset\.printMode/);
  assert.match(cleanup, /delete document\.body\.dataset\.returnsThermalPrint/);
});

test("A4 remains separate from thermal style preparation", () => {
  const a4 = functionBody("printA4");
  assert.match(a4, /dataset\.printMode\s*=\s*"a4"/);
  assert.equal(a4.includes("THERMAL_PAGE_STYLE_ID"), false);
  assert.equal(a4.includes("returnsThermalPrint"), false);
  assert.equal(a4.includes("thermal-print"), false);
  assert.equal((a4.match(/window\.print\(\)/g) ?? []).length, 1);
});

test("thermal preparation is guarded and prints exactly once", () => {
  const begin = functionBody("beginPrint");
  const thermal = functionBody("printThermal");
  assert.match(begin, /if \(inFlightRef\.current\) return null/);
  assert.match(thermal, /const print = beginPrint\(\)/);
  assert.match(thermal, /const \{ attempt, cleanup \} = print/);
  assert.equal((thermal.match(/window\.print\(\)/g) ?? []).length, 1);
  assert.match(thermal, /dataset\.returnsThermalPrint\s*=\s*"true"/);
});

test("each accepted print owns an explicit unique attempt identity", () => {
  const begin = functionBody("beginPrint");
  assert.match(printButton, /type PrintAttempt = \{[\s\S]*id: number;[\s\S]*cancelled: boolean;/);
  assert.match(printButton, /attemptSequenceRef = useRef\(0\)/);
  assert.match(printButton, /activeAttemptRef = useRef<PrintAttempt \| null>\(null\)/);
  assert.match(begin, /id: \+\+attemptSequenceRef\.current/);
  assert.match(begin, /activeAttemptRef\.current = attempt/);
  assert.match(begin, /createCleanup\(attempt\)/);
});

test("cleanup invalidates only its own attempt before removing owned DOM state", () => {
  const cleanup = functionBody("createCleanup");
  const cancelPosition = cleanup.indexOf("attempt.cancelled = true");
  const ownershipPosition = cleanup.indexOf("activeAttemptRef.current === attempt");
  const styleRemovalPosition = cleanup.indexOf("getElementById(THERMAL_PAGE_STYLE_ID)?.remove()");
  assert.ok(cancelPosition >= 0, "cleanup must cancel its exact attempt");
  assert.ok(ownershipPosition > cancelPosition, "ownership is checked after cancellation");
  assert.ok(styleRemovalPosition > ownershipPosition, "DOM cleanup is restricted to the active owner");
  assert.match(cleanup, /if \(ownsActiveState\) \{/);
  assert.match(cleanup, /if \(cleanupRef\.current === cleanup\) cleanupRef\.current = null/);
});

test("mounted state is tracked and unmount invalidates and cleans the active attempt", () => {
  assert.match(printButton, /mountedRef = useRef\(true\)/);
  const effectStart = printButton.indexOf("useEffect(");
  const beginStart = printButton.indexOf("const beginPrint", effectStart);
  const effect = printButton.slice(effectStart, beginStart);
  assert.match(effect, /mountedRef\.current = true/);
  assert.match(effect, /mountedRef\.current = false/);
  assert.match(effect, /activeAttemptRef\.current\.cancelled = true/);
  assert.match(effect, /cleanupRef\.current\?\.\(\)/);
});

test("thermal preparation checks cancellation after readiness and animation frames", () => {
  const thermal = functionBody("printThermal");
  const readiness = thermal.indexOf("await waitForReceiptReadiness(receipt)");
  const firstFrame = thermal.indexOf("await nextAnimationFrame()", readiness);
  const secondFrame = thermal.indexOf("await nextAnimationFrame()", firstFrame + 1);
  const measurement = thermal.indexOf("const receiptBounds = receipt.getBoundingClientRect()");
  const checks = [...thermal.matchAll(/if \(!isAttemptActive\(attempt\)\) return;/g)].map(
    (match) => match.index,
  );
  assert.ok(checks.some((position) => position > readiness && position < firstFrame));
  assert.ok(checks.some((position) => position > firstFrame && position < secondFrame));
  assert.ok(checks.some((position) => position > secondFrame && position < measurement));
});

test("thermal cancellation is checked before style insertion, markers, and printing", () => {
  const thermal = functionBody("printThermal");
  const createStyle = thermal.indexOf('document.createElement("style")');
  const appendStyle = thermal.indexOf("document.head.append(style)");
  const markers = thermal.indexOf('document.body.dataset.printMode = "thermal"');
  const finalFrame = thermal.lastIndexOf("await nextAnimationFrame()");
  const print = thermal.indexOf("window.print()");
  const checks = [...thermal.matchAll(/if \(!isAttemptActive\(attempt\)\) return;/g)].map(
    (match) => match.index,
  );
  assert.ok(checks.some((position) => position < createStyle));
  assert.ok(checks.some((position) => position > createStyle && position < appendStyle));
  assert.ok(checks.some((position) => position > appendStyle && position < markers));
  assert.ok(checks.some((position) => position > finalFrame && position < print));
});

test("cancelled attempts neither report preparation errors nor schedule stale cleanup", () => {
  const thermal = functionBody("printThermal");
  const catchPosition = thermal.indexOf("} catch {");
  const catchBody = thermal.slice(catchPosition);
  assert.match(catchBody, /if \(!isAttemptActive\(attempt\)\) return;/);
  assert.ok(
    catchBody.indexOf("if (!isAttemptActive(attempt)) return;") <
      catchBody.indexOf("setThermalError(THERMAL_ERROR_MESSAGE)"),
    "cancelled attempts must return before the error setter",
  );
  assert.match(thermal, /if \(isAttemptActive\(attempt\)\) \{\s*attempt\.timeoutId = window\.setTimeout/);
  assert.equal(printButton.includes("timeoutRef"), false, "no global timeout state remains");
});

test("attempt cancellation state remains component-local", () => {
  const componentStart = printButton.indexOf("export function PrintButton");
  const moduleScope = printButton.slice(0, componentStart);
  assert.equal(moduleScope.includes("activeAttempt"), false);
  assert.equal(moduleScope.includes("attemptSequence"), false);
  assert.match(printButton.slice(componentStart), /activeAttemptRef/);
  assert.match(printButton.slice(componentStart), /attemptSequenceRef/);
});

test("safe non-native thermal error UI is present", () => {
  assert.match(
    printButton,
    /Unable to prepare the thermal receipt\. Please try again\./,
  );
  assert.match(printButton, /<p role="alert"/);
  assert.equal(/\balert\s*\(/.test(printButton), false, "native alert must not be used");
});

test("no transform, scale, or zoom workaround is used in the Returns fix", () => {
  const returnsRules = [
    cssRule('.thermal-print[data-returns-thermal-measuring="true"]'),
    cssRule('body[data-print-mode="thermal"][data-returns-thermal-print="true"]'),
    cssRule('body[data-print-mode="thermal"][data-returns-thermal-print="true"] main'),
    cssRule(
      'body[data-print-mode="thermal"][data-returns-thermal-print="true"] .thermal-print',
    ),
  ].join("\n");
  assert.doesNotMatch(returnsRules, /\b(?:transform|scale|zoom)\s*:/);
  assert.doesNotMatch(printButton, /style\.(?:transform|scale|zoom)|\.scale\s*\(/);
});

test("AppShell, Returns data and page, and Reports print control remain at HEAD", () => {
  for (const path of [
    "src/components/layout/app-shell.tsx",
    "src/app/returns/[id]/page.tsx",
    "src/lib/data/returns.ts",
    "src/app/reports/print-button.tsx",
  ]) {
    assert.equal(readFileSync(path, "utf8"), sourceAtHead(path), `${path}: changed outside scope`);
  }
});
