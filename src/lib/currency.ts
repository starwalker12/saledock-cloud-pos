export const SUPPORTED_CURRENCIES = [
  { code: "PKR", name: "Pakistani Rupee", symbol: "₨" },
  { code: "INR", name: "Indian Rupee", symbol: "₹" },
  { code: "USD", name: "US Dollar", symbol: "$" },
  { code: "GBP", name: "British Pound", symbol: "£" },
  { code: "EUR", name: "Euro", symbol: "€" },
  { code: "AUD", name: "Australian Dollar", symbol: "A$" },
  { code: "CAD", name: "Canadian Dollar", symbol: "C$" },
  { code: "AED", name: "UAE Dirham", symbol: "\u20C3", displayFallback: "AED" },
  { code: "SAR", name: "Saudi Riyal", symbol: "\u20C1", displayFallback: "SAR" },
  { code: "QAR", name: "Qatari Riyal", symbol: "QAR" },
] as const;

export type SupportedCurrencyCode = (typeof SUPPORTED_CURRENCIES)[number]["code"];

export const CURRENCY_LOCK_MESSAGE =
  "Currency is locked because this shop already has financial activity. Changing it would make historical amounts incorrect.";
export const UNSUPPORTED_CURRENCY_MESSAGE = "Choose a supported shop currency.";

export function isSupportedCurrency(code: string): code is SupportedCurrencyCode {
  return SUPPORTED_CURRENCIES.some((currency) => currency.code === code);
}

export function currencySymbol(code: string): string {
  return SUPPORTED_CURRENCIES.find((currency) => currency.code === code)?.symbol ?? code;
}

export function currencyDisplayMarker(code: string): string {
  const currency = SUPPORTED_CURRENCIES.find((currency) => currency.code === code);
  if (!currency) return code;
  // Device fonts cannot guarantee the new signs in screen, print and image exports.
  return "displayFallback" in currency ? currency.displayFallback : currency.symbol;
}

export function currencyOptions(currentCode?: string) {
  const options: { value: string; label: string; disabled?: boolean }[] =
    SUPPORTED_CURRENCIES.map(({ code, name }) => {
      const marker = currencyDisplayMarker(code);
      return { value: code, label: `${name} — ${code}${marker === code ? "" : ` (${marker})`}` };
    });
  if (currentCode && !isSupportedCurrency(currentCode)) {
    options.unshift({ value: currentCode, label: `${currentCode} (existing currency)`, disabled: true });
  }
  return options;
}

export function currencyForTimezone(timezone: string): SupportedCurrencyCode {
  const defaults: Record<string, SupportedCurrencyCode> = {
    "Asia/Karachi": "PKR", "Asia/Kolkata": "INR", "Asia/Calcutta": "INR",
    "Asia/Dubai": "AED", "Asia/Riyadh": "SAR", "Asia/Qatar": "QAR",
    "Europe/London": "GBP", "Europe/Berlin": "EUR", "Europe/Paris": "EUR",
    "Europe/Rome": "EUR", "Europe/Madrid": "EUR", "Europe/Amsterdam": "EUR",
    "America/New_York": "USD", "America/Chicago": "USD", "America/Denver": "USD",
    "America/Los_Angeles": "USD", "America/Phoenix": "USD", "Pacific/Honolulu": "USD",
    "America/Anchorage": "USD", "America/Toronto": "CAD", "America/Vancouver": "CAD",
    "Australia/Sydney": "AUD", "Australia/Melbourne": "AUD", "Australia/Perth": "AUD",
  };
  return defaults[timezone] ?? "PKR";
}
