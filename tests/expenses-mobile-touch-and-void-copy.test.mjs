import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync("src/app/expenses/page.tsx", "utf8");
const formSource = readFileSync("src/app/expenses/expense-form.tsx", "utf8");
const voidSource = readFileSync("src/app/expenses/void-expense-form.tsx", "utf8");
const dialogSource = readFileSync("src/components/ui/confirm-dialog.tsx", "utf8");

function interactiveElementFor(source, label) {
  const labelIndex = source.indexOf(label);
  assert.notEqual(labelIndex, -1, `Missing source label: ${label}`);
  const starts = [source.lastIndexOf("<button", labelIndex), source.lastIndexOf("<Link", labelIndex), source.lastIndexOf("<summary", labelIndex)];
  const start = Math.max(...starts);
  assert.notEqual(start, -1, `Missing interactive element before: ${label}`);
  const openingEnd = source.indexOf(">", start);
  const opening = source.slice(start, openingEnd + 1);
  const match = opening.match(/className=(?:"([^"]+)"|\{`([^`]+)`\})/);
  assert.ok(match, `Missing interactive className before: ${label}`);
  return match[1] ?? match[2];
}

test("Expenses mobile action controls retain an explicit 44px contract", () => {
  assert.match(interactiveElementFor(pageSource, "Add a new expense"), /\bmin-h-11\b/, "disclosure must be 44px");
  assert.match(interactiveElementFor(formSource, '"Add expense"'), /\bh-11\b/, "Add expense must be 44px");
  assert.match(interactiveElementFor(formSource, '"Update expense"'), /\bh-11\b/, "Update expense must be 44px");
  assert.match(interactiveElementFor(pageSource, "Apply\n"), /\bh-11\b/, "mobile Apply must be 44px");
  assert.match(interactiveElementFor(pageSource, "Edit\n"), /\bmin-h-11\b/, "Edit must be 44px");
  assert.match(interactiveElementFor(voidSource, '"Void"'), /\bmin-h-11\b/, "Void must be 44px");
  assert.match(interactiveElementFor(pageSource, "Restore\n"), /\bmin-h-11\b/, "Restore must be 44px");
});

test("shared confirmation actions use a safe minimum without changing layout", () => {
  const buttonClasses = [...dialogSource.matchAll(/className=(?:"([^"]+)"|\{`([^`]+)`\})/g)]
    .map((match) => match[1] ?? match[2])
    .filter((value) => value.includes("motion-press"));
  assert.equal(buttonClasses.length, 2, "confirm dialog must expose exactly two action buttons");
  for (const value of buttonClasses) {
    assert.match(value, /\bmin-h-11\b/, "each shared dialog action must be at least 44px");
  }
  assert.match(dialogSource, /flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end/);
  assert.match(dialogSource, /previousFocusRef\.current\?\.focus\(\)/, "focus restoration must remain");
  assert.match(dialogSource, /event\.key === "Escape"/, "Escape handling must remain");
  assert.match(dialogSource, /event\.key === "Enter"/, "Enter handling must remain");
  assert.match(dialogSource, /event\.key !== "Tab"/, "Tab trapping must remain");
});

test("Void guidance describes archive and restore truthfully", () => {
  assert.match(voidSource, /marked as void/);
  assert.match(voidSource, /hidden from normal expense lists and reports/);
  assert.match(voidSource, /restore it later/);
  assert.match(voidSource, /Show voided/);
  assert.doesNotMatch(voidSource, /cannot be undone|permanently deleted/i);
  assert.match(voidSource, /title: "Void this expense\?"/);
  assert.match(voidSource, /confirmLabel: "Void expense"/);
});

test("action wiring and pending behavior remain unchanged", () => {
  assert.match(formSource, /useActionState\(saveExpenseAction, initial\)/);
  assert.match(formSource, /disabled=\{pending \|\| !canWrite\}/);
  assert.match(formSource, /Saving…/);
  assert.match(voidSource, /form\.requestSubmit\(\)/);
  assert.match(voidSource, /if \(isConfirming \|\| isSubmitting\) return/);
  assert.match(voidSource, /disabled=\{isConfirming \|\| isSubmitting\}/);
  assert.match(pageSource, /action=\{restoreExpenseAction\}/);
});

test("EXP-MOBILE-003 surfaces are not altered by this fix", () => {
  assert.doesNotMatch(pageSource, /wrapLabel/);
  assert.match(pageSource, /ariaLabel="Payment method"/);
  assert.match(pageSource, /label="Top category \(month\)"/);
});
