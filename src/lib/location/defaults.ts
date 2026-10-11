import { currencyForTimezone } from "@/lib/currency";

export function getBrowserTimezone(): string {
  if (typeof Intl === "undefined") return "Asia/Karachi";
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Karachi";
  } catch {
    return "Asia/Karachi";
  }
}

export function getDefaultCurrencyForTimezone(tz: string): string {
  return currencyForTimezone(tz);
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
