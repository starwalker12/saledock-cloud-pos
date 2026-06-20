// Unit test for the Asia/Karachi business-day boundary algorithm.
//
// Run with the Node 20 built-in test runner (no extra packages):
//   node --test tests/karachi-business-day.test.mjs
//
// Node cannot import the TypeScript module `src/lib/datetime.ts` without a
// loader, so this test re-implements the exact same tiny algorithm inline and
// asserts the contract. Keep these two functions byte-for-byte equivalent to
// `getKarachiBusinessDate` / `getKarachiDayRange` in src/lib/datetime.ts.

import test from "node:test";
import assert from "node:assert/strict";

const KARACHI_UTC_OFFSET = "+05:00"; // PKT is UTC+5, no DST
const fmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Karachi",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const businessDate = (date) => fmt.format(date);
const dayRange = (dateStr) => ({
  start: new Date(`${dateStr}T00:00:00.000${KARACHI_UTC_OFFSET}`).toISOString(),
  end: new Date(`${dateStr}T23:59:59.999${KARACHI_UTC_OFFSET}`).toISOString(),
});

// Helper: an absolute instant for a given Karachi wall-clock time (server-tz independent).
const atKarachi = (iso) => new Date(`${iso}${KARACHI_UTC_OFFSET}`);

test("00:30 PKT belongs to the same calendar day (not the previous one)", () => {
  assert.equal(businessDate(atKarachi("2026-06-20T00:30:00")), "2026-06-20");
});

test("04:30 PKT belongs to the same calendar day", () => {
  assert.equal(businessDate(atKarachi("2026-06-20T04:30:00")), "2026-06-20");
});

test("23:30 PKT belongs to the same calendar day", () => {
  assert.equal(businessDate(atKarachi("2026-06-20T23:30:00")), "2026-06-20");
});

test("23:30 PKT does NOT roll over into the next day", () => {
  assert.notEqual(businessDate(atKarachi("2026-06-20T23:30:00")), "2026-06-21");
});

test("a UTC-server-style instant maps to the correct Karachi date", () => {
  // 2026-06-19 21:00:00 UTC === 2026-06-20 02:00:00 PKT → business date 2026-06-20.
  assert.equal(businessDate(new Date("2026-06-19T21:00:00.000Z")), "2026-06-20");
});

test("day range anchors to the correct UTC instants (Karachi midnight = 19:00Z prev day)", () => {
  const { start, end } = dayRange("2026-06-20");
  assert.equal(start, "2026-06-19T19:00:00.000Z");
  assert.equal(end, "2026-06-20T18:59:59.999Z");
});

test("an early-morning PKT instant falls inside its own day's range", () => {
  const instant = atKarachi("2026-06-20T00:30:00").toISOString(); // 2026-06-19T19:30:00Z
  const { start, end } = dayRange("2026-06-20");
  assert.ok(instant >= start && instant <= end, `${instant} should be within ${start}..${end}`);
  // ...and NOT inside the previous day's range.
  const prev = dayRange("2026-06-19");
  assert.ok(!(instant >= prev.start && instant <= prev.end), "must not fall in the previous day");
});
