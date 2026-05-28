export function getBrowserTimezone(): string {
  if (typeof Intl === "undefined") return "Asia/Karachi";
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Karachi";
  } catch {
    return "Asia/Karachi";
  }
}

export function getDefaultCurrencyForTimezone(tz: string): string {
  if (tz.startsWith("Asia/Karachi")) return "PKR";
  if (tz.startsWith("Asia/Dubai")) return "AED";
  if (tz.startsWith("Asia/Kolkata")) return "INR";
  if (tz.startsWith("Asia/Dhaka")) return "BDT";
  if (tz.startsWith("Asia/Riyadh")) return "SAR";
  if (tz.startsWith("Asia/Singapore")) return "SGD";
  if (tz.startsWith("Europe/London")) return "GBP";
  if (tz.startsWith("Europe/Berlin") || tz.startsWith("Europe/Paris")) return "EUR";
  if (tz.startsWith("America/New_York") || tz.startsWith("America/Chicago")) return "USD";
  return "PKR";
}

export type LocationDefaults = {
  timezone: string;
  currency: string;
};

export function getLocationDefaults(): LocationDefaults {
  const tz = getBrowserTimezone();
  return {
    timezone: tz,
    currency: getDefaultCurrencyForTimezone(tz),
  };
}
