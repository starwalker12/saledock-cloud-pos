import { currencySymbol } from "./currency";

export function formatCurrency(value: number, currencyCode = "PKR"): string {
  const safe = Number.isFinite(value) ? value : 0;
  const amount = safe.toLocaleString("en-PK", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  const symbol = currencySymbol(currencyCode);
  // Keep Arabic symbols and LTR numbers together in screen, print and shared-image output.
  return /[\u0600-\u06ff]/.test(symbol)
    ? `\u200e${symbol}\u200e\u00a0${amount}`
    : `${symbol} ${amount}`;
}

export function formatNumber(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  return safe.toLocaleString("en-PK");
}
