import { currencyDisplayMarker } from "./currency";

export function formatCurrency(value: number, currencyCode = "PKR"): string {
  const safe = Number.isFinite(value) ? value : 0;
  const amount = safe.toLocaleString("en-PK", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return `${currencyDisplayMarker(currencyCode)} ${amount}`;
}

export function formatNumber(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  return safe.toLocaleString("en-PK");
}
