import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const appShell = readFileSync("src/components/layout/app-shell.tsx", "utf8");
const reportsPage = readFileSync("src/app/reports/page.tsx", "utf8");
const printButton = readFileSync("src/app/reports/print-button.tsx", "utf8");
const statCard = readFileSync("src/components/ui/stat-card.tsx", "utf8");

function assignment(name) {
  const start = appShell.indexOf(`const ${name} =`);
  assert.notEqual(start, -1, `AppShell defines ${name}`);
  const end = appShell.indexOf(";", start);
  assert.notEqual(end, -1, `AppShell terminates ${name}`);
  return appShell.slice(start, end + 1);
}

test("AppShell full-document print behavior is optional and defaults off", () => {
  assert.match(appShell, /printFullDocument\s*=\s*false/);
  assert.match(appShell, /printFullDocument\?:\s*boolean/);

  for (const name of [
    "rootPrintClasses",
    "columnPrintClasses",
    "mainPrintClasses",
    "contentPrintClasses",
  ]) {
    const source = assignment(name);
    assert.match(source, /printFullDocument\s*\?/);
    assert.match(source, /:\s*""/);
  }
});

test("AppShell root keeps screen constraints and conditionally releases them for print", () => {
  const source = assignment("rootPrintClasses");
  assert.match(source, /print:block/);
  assert.match(source, /print:h-auto/);
  assert.match(source, /print:min-h-0/);
  assert.match(source, /print:max-h-none/);
  assert.match(source, /print:overflow-visible/);
  assert.match(appShell, /data-app-shell-root/);
  assert.match(appShell, /data-print-full-document=/);
  assert.match(appShell, /flex h-dvh max-w-full overflow-hidden/);
});

test("AppShell content column conditionally expands in print", () => {
  const source = assignment("columnPrintClasses");
  assert.match(source, /print:block/);
  assert.match(source, /print:h-auto/);
  assert.match(source, /print:min-h-0/);
  assert.match(source, /print:max-h-none/);
  assert.match(source, /print:overflow-visible/);
  assert.match(appShell, /data-app-shell-column/);
});

test("AppShell main conditionally stops acting as the print scroll viewport", () => {
  const source = assignment("mainPrintClasses");
  assert.match(source, /print:block/);
  assert.match(source, /print:h-auto/);
  assert.match(source, /print:min-h-0/);
  assert.match(source, /print:max-h-none/);
  assert.match(source, /print:flex-none/);
  assert.match(source, /print:overflow-visible/);
  assert.match(appShell, /data-app-shell-main/);
  assert.match(appShell, /flex-1 overflow-y-auto overflow-x-hidden/);
});

test("AppShell content wrapper conditionally permits full print flow", () => {
  const source = assignment("contentPrintClasses");
  assert.match(source, /print:block/);
  assert.match(source, /print:h-auto/);
  assert.match(source, /print:max-h-none/);
  assert.match(source, /print:overflow-visible/);
  assert.match(appShell, /data-app-shell-content/);
});

test("Reports opts into full-document printing and keeps the existing PrintButton", () => {
  assert.match(
    reportsPage,
    /<AppShell\s+pageTitle="Reports"\s+printFullDocument>/,
  );
  assert.match(reportsPage, /import \{ PrintButton \} from "\.\/print-button"/);
  assert.match(reportsPage, /<PrintButton\s*\/>/);
  assert.match(reportsPage, /getReportsData\(orgId, branchId, start, end\)/);
});

test("Print Report continues to call window.print without changing behavior", () => {
  assert.match(printButton, /onClick=\{\(\) => window\.print\(\)\}/);
  assert.match(printButton, />\s*Print Report\s*</);
});

test("RPT-MOBILE-001 remains out of scope", () => {
  assert.match(statCard, /className=\{`truncate text-xs font-semibold md:text-sm/);
});
