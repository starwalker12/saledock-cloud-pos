import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const actionSource = readFileSync("src/app/expenses/actions.ts", "utf8");
const restoreStart = actionSource.indexOf(
  "export async function restoreExpenseAction",
);
assert.notEqual(restoreStart, -1, "Restore action must exist");
const restoreSource = actionSource.slice(restoreStart);

test("Restore audits only one successful archived-to-active organization-scoped transition", () => {
  assert.match(restoreSource, /await requireManager\(\)/);
  assert.match(restoreSource, /if \(w\.denied\) return/);
  assert.match(restoreSource, /if \(!id\) return/);
  assert.match(
    restoreSource,
    /\.from\("expenses"\)[\s\S]*?\.update\(\{ status: "active", archived_at: null, archived_by: null \}\)[\s\S]*?\.eq\("id", id\)[\s\S]*?\.eq\("organization_id", w\.ctx\.profile!\.organization_id!\)[\s\S]*?\.eq\("status", "archived"\)[\s\S]*?\.select\("id"\)[\s\S]*?\.maybeSingle\(\)/,
  );
  assert.match(restoreSource, /if \(error \|\| !restored\) return/);
});

test("Restore audit identity and transition metadata are explicit", () => {
  assert.match(restoreSource, /await logAudit\(\{/);
  assert.match(restoreSource, /module: "expenses"/);
  assert.match(restoreSource, /action: "expenses\.restored"/);
  assert.match(restoreSource, /details: `Restored expense \$\{restored\.id\}`/);
  assert.match(restoreSource, /expense_id: restored\.id/);
  assert.match(restoreSource, /previous_status: "archived"/);
  assert.match(restoreSource, /new_status: "active"/);
});

test("Restore preserves existing freshness and does not alter business values", () => {
  assert.match(restoreSource, /revalidatePath\("\/expenses"\)/);
  assert.match(restoreSource, /revalidatePath\("\/dashboard"\)/);
  assert.doesNotMatch(
    restoreSource,
    /\b(?:amount|category|payment_method|vendor_name|notes|spent_at|branch_id|created_by)\b/,
  );
  assert.doesNotMatch(restoreSource, /\.(?:insert|upsert|delete|rpc)\(/);
});

test("Restore records the audit before requesting page freshness", () => {
  const auditIndex = restoreSource.indexOf("await logAudit");
  const expensesIndex = restoreSource.indexOf('revalidatePath("/expenses")');
  const dashboardIndex = restoreSource.indexOf('revalidatePath("/dashboard")');
  assert.ok(auditIndex > -1);
  assert.ok(expensesIndex > auditIndex);
  assert.ok(dashboardIndex > expensesIndex);
});
