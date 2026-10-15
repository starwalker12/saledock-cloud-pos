import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const action = readFileSync("src/app/expenses/actions.ts", "utf8");
const migration = readFileSync(
  "supabase/migrations/20261014100309_atomic_cash_shift_boundary.sql",
  "utf8",
);
test("Restore uses one database-authorized revision-checked transition and atomic audit", () => {
  assert.match(action, /requireManager\(\)/);
  assert.match(action, /rpc\("save_cash_shift_expense"/);
  assert.match(action, /return changeExpenseStatus\(formData, "restore"\)/);
  assert.doesNotMatch(action, /logAudit|\.update\(/);
  assert.match(migration, /when 'restore' then 'active'/);
  assert.match(migration, /expenses.restored/);
  assert.match(migration, /Archived|archived/);
  assert.doesNotMatch(action, /revalidatePath/);
  const form = readFileSync("src/app/expenses/void-expense-form.tsx", "utf8");
  assert.match(form, /router.replace/);
  assert.match(form, /if \(!state.success\) return/);
});
