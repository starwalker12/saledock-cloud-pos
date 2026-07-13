import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const expensesPage = readFileSync("src/app/expenses/page.tsx", "utf8");
const statCard = readFileSync("src/components/ui/stat-card.tsx", "utf8");
const appSelect = readFileSync("src/components/ui/app-select.tsx", "utf8");
const reportsPage = readFileSync("src/app/reports/page.tsx", "utf8");
const reportsContract = readFileSync("tests/reports-mobile-card-label-wrapping.test.mjs", "utf8");
const expenseActions = readFileSync("src/app/expenses/actions.ts", "utf8");
const expenseData = readFileSync("src/lib/data/expenses.ts", "utf8");
const expenseValidation = readFileSync("src/lib/validation/expenses.ts", "utf8");
const pr303Contract = readFileSync("tests/expenses-mobile-touch-and-void-copy.test.mjs", "utf8");

const expenseLabels = [
  "Today expenses",
  "This month",
  "Top category (month)",
  "Latest expense",
];

const remainingDefaultConsumers = [
  "src/app/customers/[id]/page.tsx",
  "src/app/customers/page.tsx",
  "src/app/daily-closing/page.tsx",
  "src/app/products/page.tsx",
  "src/app/repairs/page.tsx",
  "src/app/suppliers/dues/page.tsx",
  "src/app/suppliers/purchases/page.tsx",
  "src/app/users/page.tsx",
];

function openingStatCardFor(source, label) {
  const labelIndex = source.indexOf(`label="${label}"`);
  assert.notEqual(labelIndex, -1, `Missing StatCard label: ${label}`);
  const start = source.lastIndexOf("<StatCard", labelIndex);
  const end = source.indexOf("/>", labelIndex);
  assert.notEqual(start, -1, `Missing StatCard opening for: ${label}`);
  assert.notEqual(end, -1, `Missing StatCard closing for: ${label}`);
  return source.slice(start, end + 2);
}

function sourceHash(source) {
  return createHash("sha256").update(source).digest("hex");
}

function effectContaining(source, marker) {
  const markerIndex = source.indexOf(marker);
  assert.notEqual(markerIndex, -1, `Missing effect marker: ${marker}`);
  const start = source.lastIndexOf("useEffect(() => {", markerIndex);
  assert.notEqual(start, -1, `Missing effect start for: ${marker}`);
  const end = source.indexOf("}, [defaultValue, value]);", markerIndex);
  assert.notEqual(end, -1, `Missing effect dependencies for: ${marker}`);
  return source.slice(start, end + "}, [defaultValue, value]);".length);
}

function functionContaining(source, declaration, nextDeclaration) {
  const start = source.indexOf(declaration);
  assert.notEqual(start, -1, `Missing function: ${declaration}`);
  const end = source.indexOf(nextDeclaration, start);
  assert.notEqual(end, -1, `Missing function boundary: ${nextDeclaration}`);
  return source.slice(start, end);
}

test("Expenses opts exactly four unchanged summary cards into wrapping", () => {
  assert.equal((expensesPage.match(/<StatCard\b/g) ?? []).length, 4);
  assert.equal((expensesPage.match(/\bwrapLabel\b/g) ?? []).length, 4);
  for (const label of expenseLabels) {
    assert.match(openingStatCardFor(expensesPage, label), /\bwrapLabel\b/, `${label} wraps`);
  }
});

test("StatCard keeps its typed opt-in and default-off layout branches", () => {
  assert.match(statCard, /wrapLabel\?:\s*boolean/);
  assert.match(statCard, /wrapLabel\s*=\s*false/);
  assert.match(statCard, /className=\{`truncate text-xs font-semibold/);
  assert.match(statCard, /whitespace-normal break-words text-xs font-semibold leading-tight/);
  assert.equal(sourceHash(statCard), "e3bf9b669252c1789199aacb2ed1d03728e269c06f845a595efeaa052af795da");
});

test("Reports retains five intentional wrapping opt-ins", () => {
  assert.equal((reportsPage.match(/<StatCard\b/g) ?? []).length, 5);
  assert.equal((reportsPage.match(/\bwrapLabel\b/g) ?? []).length, 5);
});

test("Reports contract removes only Expenses from the default consumer inventory", () => {
  for (const file of remainingDefaultConsumers) {
    assert.equal(
      reportsContract.split(`"${file}"`).length - 1,
      1,
      `${file} remains enforced once`,
    );
  }
  const consumerArray = reportsContract.slice(
    reportsContract.indexOf("const reportStatCardConsumers = ["),
    reportsContract.indexOf("];", reportsContract.indexOf("const reportStatCardConsumers = [")),
  );
  assert.doesNotMatch(consumerArray, /src\/app\/expenses\/page\.tsx/);
  assert.match(reportsContract, /Expenses deliberately opts all four summary StatCards into wrapping/);
});

test("Expenses payment filter retains its GET form and AppSelect contract", () => {
  const mobileStart = expensesPage.indexOf("{/* Mobile Filter form */}");
  const desktopStart = expensesPage.indexOf("{/* Desktop Filter form */}");
  assert.notEqual(mobileStart, -1);
  assert.notEqual(desktopStart, -1);
  const mobileFilters = expensesPage.slice(mobileStart, desktopStart);
  assert.match(mobileFilters, /<form[^>]*action="\/expenses"/);
  assert.match(mobileFilters, /name="payment_method"/);
  assert.match(mobileFilters, /ariaLabel="Payment method"/);
  assert.doesNotMatch(mobileFilters, /<select\b/);
  assert.doesNotMatch(mobileFilters, /router\.push|window\.location|URLSearchParams/);
  for (const [value, label] of [
    ["cash", "Cash"],
    ["card", "Card"],
    ["easypaisa", "EasyPaisa"],
    ["jazzcash", "JazzCash"],
    ["bank_transfer", "Bank transfer"],
  ]) {
    assert.match(expensesPage, new RegExp(`${value}: "${label}"`));
  }
  assert.match(expenseValidation, /m\) => m !== "customer_credit"/);
  assert.doesNotMatch(expensesPage, /customer_credit/);
  assert.match(expensesPage, /<Link href="\/expenses"[^>]*>[\s\S]*?Reset filters[\s\S]*?<\/Link>/);
  assert.doesNotMatch(expensesPage, /window\.location|location\.reload|router\.(?:push|replace)/);
});

test("AppSelect synchronizes new defaults only for uncontrolled consumers", () => {
  const synchronization = effectContaining(appSelect, "setInternalValue(defaultValue);");
  assert.match(synchronization, /if \(value !== undefined\) return;/);
  assert.match(synchronization, /setInternalValue\(defaultValue\);/);
  assert.match(synchronization, /setIsOpen\(false\);/);
  assert.match(synchronization, /setQuery\(""\);/);
  assert.doesNotMatch(synchronization, /onChange/);
  assert.doesNotMatch(synchronization, /dispatchEvent|new Event/);
  assert.match(synchronization, /\[defaultValue, value\]/);
});

test("AppSelect controlled and user-selection paths retain their contracts", () => {
  assert.match(appSelect, /const selectedValue = value \?\? internalValue;/);
  const selection = functionContaining(appSelect, "function selectValue", "function moveActive");
  assert.match(selection, /if \(value === undefined\) setInternalValue\(nextValue\);/);
  assert.match(selection, /onChange\?\.\(nextValue\);/);
  assert.equal((selection.match(/dispatchEvent\(new Event\("(?:input|change)"/g) ?? []).length, 2);
  assert.match(selection, /setIsOpen\(false\);/);
  assert.match(selection, /setQuery\(""\);/);
});

test("AppSelect native form reset remains separate and uses the latest default", () => {
  const nativeReset = effectContaining(appSelect, "const form = rootRef.current?.closest(\"form\");");
  assert.match(nativeReset, /if \(value !== undefined\) return undefined;/);
  assert.match(nativeReset, /closest\("form"\)/);
  assert.match(nativeReset, /form\.addEventListener\("reset", handleReset\)/);
  assert.match(nativeReset, /window\.setTimeout\(\(\) => setInternalValue\(defaultValue\), 0\)/);
  assert.match(nativeReset, /form\.removeEventListener\("reset", handleReset\)/);
  assert.doesNotMatch(nativeReset, /onChange|dispatchEvent/);
});

test("AppSelect interaction, search, keyboard, and disabled-option behavior remain available", () => {
  assert.match(appSelect, /document\.addEventListener\("pointerdown", handlePointerDown\)/);
  assert.match(appSelect, /event\.key === "Escape"/);
  assert.match(appSelect, /event\.key === "ArrowDown" \|\| event\.key === "ArrowUp"/);
  assert.match(appSelect, /event\.key === "Enter" \|\| event\.key === " "/);
  assert.match(appSelect, /normalizeText\(option\.description \?\? ""\)/);
  assert.match(appSelect, /if \(option && !option\.disabled\) selectValue\(option\.value\)/);
  assert.match(appSelect, /disabled=\{option\.disabled\}/);
});

test("AppSelect public props remain backward compatible", () => {
  const propsStart = appSelect.indexOf("type AppSelectProps = {");
  const propsEnd = appSelect.indexOf("};", propsStart);
  assert.notEqual(propsStart, -1);
  assert.notEqual(propsEnd, -1);
  const props = appSelect.slice(propsStart, propsEnd);
  const expectedProps = [
    "options", "name", "value", "defaultValue", "onChange", "disabled", "required",
    "placeholder", "ariaLabel", "searchable", "className", "buttonClassName", "menuClassName",
  ];
  for (const prop of expectedProps) assert.match(props, new RegExp(`\\b${prop}\\??:`));
  assert.equal((props.match(/^\s{2}\w+\??:/gm) ?? []).length, expectedProps.length);
});

test("Expenses action, data, and validation sources match the reviewed base", () => {
  assert.equal(sourceHash(expenseActions), "2d3d8ef4dba9cdfb0f29ed4e147f54272def7676c62190003f0dbc6f330072c7");
  assert.equal(sourceHash(expenseData), "67da4220b65152d0bd3803c96cf947ba19c1279d0e9441d5456229ad31307b2e");
  assert.equal(sourceHash(expenseValidation), "f23a217eca614e8a904476b40041fa9776e1cf8f548f9176017128ec643f74e9");
});

test("Expenses permission and data wiring remain unchanged", () => {
  assert.match(expensesPage, /import \{ canManageExpenses \} from "@\/lib\/permissions"/);
  assert.match(expensesPage, /const canWrite = canManageExpenses\(profile\.role\)/);
  assert.match(expensesPage, /expenseCounts\(orgId\)/);
  assert.match(expensesPage, /listExpenses\(orgId, filters\)/);
  assert.match(expensesPage, /listExpenseCategories\(orgId\)/);
  assert.match(expensesPage, /EXPENSE_PAYMENT_METHODS\.map/);
});

test("PR #303 touch-target and truthful Void contracts remain enforced", () => {
  assert.match(pr303Contract, /44px contract/);
  assert.match(pr303Contract, /shared confirmation actions use a safe minimum/);
  assert.match(pr303Contract, /Void guidance describes archive and restore truthfully/);
  assert.match(pr303Contract, /action wiring and pending behavior remain unchanged/);
  assert.match(pr303Contract, /EXP-MOBILE-003 summary labels opt into wrapping/);
});
