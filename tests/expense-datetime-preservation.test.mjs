import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  formatKarachiDateTimeLocal,
  isKarachiDateTimeLocal,
  parseKarachiDateTimeLocal,
} from "../src/lib/datetime.ts";

const formSource = readFileSync("src/app/expenses/expense-form.tsx", "utf8");
const actionSource = readFileSync("src/app/expenses/actions.ts", "utf8");
const validationSource = readFileSync("src/lib/validation/expenses.ts", "utf8");
const pageSource = readFileSync("src/app/expenses/page.tsx", "utf8");
const dashboardSource = readFileSync("src/lib/data/dashboard.ts", "utf8");
const reportsSource = readFileSync("src/lib/data/reports.ts", "utf8");
const shiftsSource = readFileSync("src/lib/data/shifts.ts", "utf8");
const backupSource = readFileSync("src/app/settings/backup-actions.ts", "utf8");
const demoSource = readFileSync("src/app/settings/demo-actions.ts", "utf8");

test("Karachi local midnight converts to the exact UTC instant", () => {
  assert.equal(
    parseKarachiDateTimeLocal("2026-07-24T00:17"),
    "2026-07-23T19:17:00.000Z",
  );
});

test("Karachi daytime converts to the exact UTC instant", () => {
  assert.equal(
    parseKarachiDateTimeLocal("2026-07-24T15:45"),
    "2026-07-24T10:45:00.000Z",
  );
});

test("UTC instant formats as Karachi datetime-local", () => {
  assert.equal(
    formatKarachiDateTimeLocal("2026-07-23T19:17:00.000Z"),
    "2026-07-24T00:17",
  );
});

test("Karachi local to UTC to local round trip is stable", () => {
  for (const local of [
    "2026-01-01T00:00",
    "2026-07-24T00:17",
    "2026-07-24T15:45",
    "2026-12-31T23:59",
  ]) {
    assert.equal(
      formatKarachiDateTimeLocal(parseKarachiDateTimeLocal(local)),
      local,
    );
  }
});

test("formatting and parsing are independent of the server timezone", () => {
  const moduleUrl = new URL("../src/lib/datetime.ts", import.meta.url).href;
  const script = `
    import { formatKarachiDateTimeLocal, parseKarachiDateTimeLocal } from ${JSON.stringify(moduleUrl)};
    process.stdout.write(JSON.stringify({
      parsed: parseKarachiDateTimeLocal("2026-07-24T00:17"),
      formatted: formatKarachiDateTimeLocal("2026-07-23T19:17:00.000Z")
    }));
  `;
  const outputs = ["UTC", "America/Los_Angeles"].map((TZ) =>
    execFileSync(process.execPath, ["--input-type=module", "-e", script], {
      encoding: "utf8",
      env: { ...process.env, TZ },
    }),
  );
  assert.deepEqual(outputs, [
    '{"parsed":"2026-07-23T19:17:00.000Z","formatted":"2026-07-24T00:17"}',
    '{"parsed":"2026-07-23T19:17:00.000Z","formatted":"2026-07-24T00:17"}',
  ]);
});

test("invalid local dates, times, offsets, and arbitrary strings are rejected", () => {
  for (const value of [
    "",
    "2026-02-29T12:00",
    "2026-07-24T24:00",
    "2026-07-24T12:60",
    "2026-07-24 12:00",
    "2026-07-24T12:00:00",
    "2026-07-24T12:00+05:00",
    "July 24, 2026 12:00",
  ]) {
    assert.equal(isKarachiDateTimeLocal(value), false, value);
    assert.throws(() => parseKarachiDateTimeLocal(value), RangeError, value);
  }
  assert.equal(isKarachiDateTimeLocal("2028-02-29T12:00"), true);
});

test("new expense fallback uses the supplied current instant deterministically", () => {
  assert.equal(
    formatKarachiDateTimeLocal(undefined, new Date("2026-07-23T19:17:00.000Z")),
    "2026-07-24T00:17",
  );
});

test("Expenses form never uses ambient browser timezone conversion", () => {
  assert.match(
    formSource,
    /formatKarachiDateTimeLocal\(initialValues\?\.spent_at\)/,
  );
  assert.doesNotMatch(formSource, /getTimezoneOffset\s*\(/);
  assert.doesNotMatch(formSource, /toLocalDateTimeInput/);
});

test("Expenses validation accepts only the explicit Karachi local contract", () => {
  assert.match(validationSource, /isKarachiDateTimeLocal\(value\)/);
  assert.match(validationSource, /parseKarachiDateTimeLocal\(value\)/);
  assert.doesNotMatch(validationSource, /new Date\(v\)/);
  assert.match(
    validationSource,
    /if \(typeof v !== "string" \|\| !v\.trim\(\)\) return undefined/,
  );
});

test("existing updates read within the organization and preserve the exact instant", () => {
  assert.match(
    actionSource,
    /\.from\("expenses"\)[\s\S]*?\.select\("spent_at"\)[\s\S]*?\.eq\("id", id\)[\s\S]*?\.eq\("organization_id", w\.ctx\.profile!\.organization_id!\)[\s\S]*?\.maybeSingle\(\)/,
  );
  assert.match(
    actionSource,
    /formatKarachiDateTimeLocal\(existing\.spent_at\) ===[\s\S]*?formatKarachiDateTimeLocal\(parsed\.data\.spent_at\)/,
  );
  assert.match(actionSource, /!parsed\.data\.spent_at \|\|/);
  assert.match(actionSource, /spentAt = existing\.spent_at/);
  assert.match(actionSource, /spent_at: spentAt/);
});

test("void and restore do not replace spent_at", () => {
  const voidStart = actionSource.indexOf(
    "export async function voidExpenseAction",
  );
  const restoreStart = actionSource.indexOf(
    "export async function restoreExpenseAction",
  );
  assert.doesNotMatch(actionSource.slice(voidStart, restoreStart), /spent_at/);
  assert.doesNotMatch(actionSource.slice(restoreStart), /spent_at/);
});

test("Expenses list, filters, Dashboard, and Reports retain explicit Karachi boundaries", () => {
  assert.match(pageSource, /timeZone: BUSINESS_TIMEZONE/);
  assert.match(pageSource, /getKarachiDayStartIso\(params\.from\)/);
  assert.match(pageSource, /getKarachiDayEndIso\(params\.to\)/);
  assert.match(
    dashboardSource,
    /getKarachiDayRange\(getKarachiTodayDateString\(\)\)/,
  );
  assert.match(reportsSource, /getKarachiRangeIso\(startDate, endDate\)/);
});

test("Cash Drawer behavior and import/demo timestamp paths are untouched", () => {
  assert.match(
    shiftsSource,
    /if \(e\.payment_method === "cash"\) expensesCash \+= amount/,
  );
  assert.match(
    backupSource,
    /spent_at: row\.Date \|\| new Date\(\)\.toISOString\(\)/,
  );
  assert.match(demoSource, /spent_at: new Date\(\)\.toISOString\(\)/);
});
