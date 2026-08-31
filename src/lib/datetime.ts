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
const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
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

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return leapYear ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** Whether a value is an exact, real Gregorian `YYYY-MM-DD` calendar date. */
export function isValidCalendarDate(value: string): boolean {
  const match = CALENDAR_DATE.exec(value);
  if (!match) return false;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  return (
    year >= 1 &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth(year, month)
  );
}

export type DateRangeValidationResult = {
  from: string;
  to: string;
  error: string | null;
  errorCode: "invalid_from" | "invalid_to" | "reversed" | null;
};

/** Validate optional calendar-date query values without normalizing invalid input. */
export function validateDateRange({
  from = "",
  to = "",
  fromLabel = "From",
  toLabel = "To",
}: {
  from?: string;
  to?: string;
  fromLabel?: string;
  toLabel?: string;
}): DateRangeValidationResult {
  if (from && !isValidCalendarDate(from)) {
    return {
      from,
      to,
      error: `Enter a valid ${fromLabel} date.`,
      errorCode: "invalid_from",
    };
  }
  if (to && !isValidCalendarDate(to)) {
    return {
      from,
      to,
      error: `Enter a valid ${toLabel} date.`,
      errorCode: "invalid_to",
    };
  }
  if (from && to && from > to) {
    return {
      from,
      to,
      error: `${fromLabel} date cannot be after ${toLabel} date.`,
      errorCode: "reversed",
    };
  }
  return { from, to, error: null, errorCode: null };
}

function assertValidCalendarDate(value: string): void {
  if (!isValidCalendarDate(value)) {
    throw new RangeError("Invalid calendar date.");
  }
}

/** Whether a value is an exact, valid `YYYY-MM-DDTHH:mm` Karachi wall time. */
export function isKarachiDateTimeLocal(value: string): boolean {
  const match = KARACHI_LOCAL_DATE_TIME.exec(value);
  if (!match) return false;
  const [, yearText, monthText, dayText] = match;
  return isValidCalendarDate(`${yearText}-${monthText}-${dayText}`);
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
export function getKarachiTodayDateString(date: Date = new Date()): string {
  return getKarachiBusinessDate(date);
}

/** UTC ISO timestamp for the start (00:00:00.000) of a Karachi calendar day. */
export function getKarachiDayStartIso(dateStr: string): string {
  assertValidCalendarDate(dateStr);
  return new Date(`${dateStr}T00:00:00.000${KARACHI_UTC_OFFSET}`).toISOString();
}

/** UTC ISO timestamp for the end (23:59:59.999) of a Karachi calendar day. */
export function getKarachiDayEndIso(dateStr: string): string {
  assertValidCalendarDate(dateStr);
  return new Date(`${dateStr}T23:59:59.999${KARACHI_UTC_OFFSET}`).toISOString();
}

/** Start/end UTC ISO timestamps bounding a Karachi calendar day (`YYYY-MM-DD`). */
export function getKarachiDayRange(dateStr: string): {
  start: string;
  end: string;
} {
  return {
    start: getKarachiDayStartIso(dateStr),
    end: getKarachiDayEndIso(dateStr),
  };
}

/** Start/end UTC ISO timestamps spanning a range of Karachi calendar days (inclusive). */
export function getKarachiRangeIso(
  startDateStr: string,
  endDateStr: string,
): { start: string; end: string } {
  const validation = validateDateRange({ from: startDateStr, to: endDateStr });
  if (validation.error) throw new RangeError(validation.error);
  return {
    start: getKarachiDayStartIso(startDateStr),
    end: getKarachiDayEndIso(endDateStr),
  };
}

/** Add (or subtract, with a negative value) whole days to a Karachi calendar date → `YYYY-MM-DD`. */
export function addKarachiDays(dateStr: string, days: number): string {
  assertValidCalendarDate(dateStr);
  // Anchor at noon PKT so the +/- day arithmetic can never cross a day boundary by accident.
  const anchor = new Date(`${dateStr}T12:00:00.000${KARACHI_UTC_OFFSET}`);
  anchor.setUTCDate(anchor.getUTCDate() + days);
  return getKarachiBusinessDate(anchor);
}

/** First calendar date (`YYYY-MM-DD`) of the Karachi month containing `dateStr`. */
export function getKarachiMonthStartDate(dateStr: string): string {
  assertValidCalendarDate(dateStr);
  return `${dateStr.slice(0, 7)}-01`;
}

/** Last calendar date (`YYYY-MM-DD`) of the Karachi month containing `dateStr`. */
export function getKarachiMonthEndDate(dateStr: string): string {
  assertValidCalendarDate(dateStr);
  const [year, month] = dateStr.slice(0, 7).split("-").map(Number);
  const lastDay = daysInMonth(year, month);
  return `${dateStr.slice(0, 7)}-${String(lastDay).padStart(2, "0")}`;
}

/** Weekday (0 = Sunday … 6 = Saturday) of a Karachi calendar date, server-tz independent. */
export function getKarachiWeekday(dateStr: string): number {
  assertValidCalendarDate(dateStr);
  return new Date(`${dateStr}T12:00:00.000${KARACHI_UTC_OFFSET}`).getUTCDay();
}

/** Format a business timestamp explicitly in Asia/Karachi. */
export function formatKarachiTimestamp(
  value: string | Date,
  options: Omit<Intl.DateTimeFormatOptions, "timeZone">,
): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new RangeError("Invalid UTC date and time.");
  }
  return date.toLocaleString("en-PK", {
    ...options,
    timeZone: BUSINESS_TIMEZONE,
  });
}

/** Format a SQL DATE without allowing the viewer/server timezone to shift it. */
export function formatCalendarDate(
  value: string,
  options: Omit<Intl.DateTimeFormatOptions, "timeZone">,
): string {
  assertValidCalendarDate(value);
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return date.toLocaleDateString("en-PK", { ...options, timeZone: "UTC" });
}
