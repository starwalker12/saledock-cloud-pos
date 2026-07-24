/**
 * Business-day helpers pinned to the shop's timezone (Asia/Karachi).
 *
 * SaleDock stores timestamps as UTC `timestamptz`. "Today", daily-closing,
 * dashboard and report day boundaries must be computed against the shop's local
 * calendar day (Asia/Karachi) — NOT the server's timezone. Vercel runs in UTC,
 * so the previous `getTimezoneOffset()` / `new Date(\`${d}T00:00:00\`)` helpers
 * produced UTC business days, which mis-bucketed 00:00–05:00 PKT activity.
 *
 * These helpers make the business day explicit and server-timezone-independent:
 *  - the calendar date is derived via the IANA "Asia/Karachi" zone (`Intl`);
 *  - day boundaries are anchored to UTC instants using PKT's fixed +05:00 offset
 *    (Pakistan Standard Time has no daylight saving, so the offset is constant).
 *
 * None of these helpers depend on the ambient process timezone.
 */

export const BUSINESS_TIMEZONE = "Asia/Karachi";

// PKT is UTC+5 all year (no DST). Anchors a Karachi calendar day to UTC instants.
const KARACHI_UTC_OFFSET = "+05:00";
const KARACHI_LOCAL_DATE_TIME =
  /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d)$/;

// `en-CA` formats as `YYYY-MM-DD`, which is exactly the calendar-date shape used
// across the app (date inputs, closing_date, day-grouping keys).
const karachiDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const karachiDateTimeFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function dateTimeParts(date: Date): Record<string, string> {
  return Object.fromEntries(
    karachiDateTimeFormatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
}

/** Whether a value is an exact, valid `YYYY-MM-DDTHH:mm` Karachi wall time. */
export function isKarachiDateTimeLocal(value: string): boolean {
  const match = KARACHI_LOCAL_DATE_TIME.exec(value);
  if (!match) return false;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (year < 1 || month < 1 || month > 12) return false;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day >= 1 && day <= lastDay;
}

/** Convert a Karachi `datetime-local` wall time to its UTC `timestamptz` instant. */
export function parseKarachiDateTimeLocal(value: string): string {
  if (!isKarachiDateTimeLocal(value)) {
    throw new RangeError("Invalid Karachi local date and time.");
  }
  return new Date(`${value}:00.000${KARACHI_UTC_OFFSET}`).toISOString();
}

/** Format a UTC instant for a Karachi `datetime-local` input, independent of browser timezone. */
export function formatKarachiDateTimeLocal(
  iso?: string,
  fallback: Date = new Date(),
): string {
  const date = iso ? new Date(iso) : fallback;
  if (Number.isNaN(date.getTime())) {
    throw new RangeError("Invalid UTC date and time.");
  }
  const parts = dateTimeParts(date);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/** The Asia/Karachi calendar date for an instant (default: now), as `YYYY-MM-DD`. */
export function getKarachiBusinessDate(date: Date = new Date()): string {
  return karachiDateFormatter.format(date);
}

/** Today's calendar date in Asia/Karachi as `YYYY-MM-DD` (server-tz independent). */
export function getKarachiTodayDateString(): string {
  return getKarachiBusinessDate();
}

/** UTC ISO timestamp for the start (00:00:00.000) of a Karachi calendar day. */
export function getKarachiDayStartIso(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00.000${KARACHI_UTC_OFFSET}`).toISOString();
}

/** UTC ISO timestamp for the end (23:59:59.999) of a Karachi calendar day. */
export function getKarachiDayEndIso(dateStr: string): string {
  return new Date(`${dateStr}T23:59:59.999${KARACHI_UTC_OFFSET}`).toISOString();
}

/** Start/end UTC ISO timestamps bounding a Karachi calendar day (`YYYY-MM-DD`). */
export function getKarachiDayRange(dateStr: string): { start: string; end: string } {
  return { start: getKarachiDayStartIso(dateStr), end: getKarachiDayEndIso(dateStr) };
}

/** Start/end UTC ISO timestamps spanning a range of Karachi calendar days (inclusive). */
export function getKarachiRangeIso(startDateStr: string, endDateStr: string): { start: string; end: string } {
  return { start: getKarachiDayStartIso(startDateStr), end: getKarachiDayEndIso(endDateStr) };
}

/** Add (or subtract, with a negative value) whole days to a Karachi calendar date → `YYYY-MM-DD`. */
export function addKarachiDays(dateStr: string, days: number): string {
  // Anchor at noon PKT so the +/- day arithmetic can never cross a day boundary by accident.
  const anchor = new Date(`${dateStr}T12:00:00.000${KARACHI_UTC_OFFSET}`);
  anchor.setUTCDate(anchor.getUTCDate() + days);
  return getKarachiBusinessDate(anchor);
}

/** First calendar date (`YYYY-MM-DD`) of the Karachi month containing `dateStr`. */
export function getKarachiMonthStartDate(dateStr: string): string {
  return `${dateStr.slice(0, 7)}-01`;
}

/** Last calendar date (`YYYY-MM-DD`) of the Karachi month containing `dateStr`. */
export function getKarachiMonthEndDate(dateStr: string): string {
  const [year, month] = dateStr.slice(0, 7).split("-").map(Number);
  // `Date.UTC(year, month, 0)` = last day of the 1-based `month` (month as a
  // 0-based index points to the next month; day 0 is the prior day).
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${dateStr.slice(0, 7)}-${String(lastDay).padStart(2, "0")}`;
}

/** Weekday (0 = Sunday … 6 = Saturday) of a Karachi calendar date, server-tz independent. */
export function getKarachiWeekday(dateStr: string): number {
  return new Date(`${dateStr}T12:00:00.000${KARACHI_UTC_OFFSET}`).getUTCDay();
}
