import { currencyDisplayMarker } from "./currency";

export function shiftDecimal(
  snapshot: Record<string, unknown> | undefined,
  path: string,
): string | undefined {
  let value: unknown = snapshot;
  for (const segment of path.split(".")) {
    if (!value || typeof value !== "object") return undefined;
    value = (value as Record<string, unknown>)[segment];
  }
  return typeof value === "string" ? value : undefined;
}

function minor(value: string): bigint {
  const match = /^(-?)([0-9]+)(?:\.([0-9]{1,2}))?$/.exec(value);
  if (!match) throw new Error("Invalid cash shift decimal.");
  const magnitude =
    BigInt(match[2]) * BigInt(100) + BigInt((match[3] ?? "").padEnd(2, "0"));
  return match[1] ? -magnitude : magnitude;
}

export function combineShiftDecimals(
  values: string[],
  subtract: string[] = [],
): string {
  const total =
    values.reduce((sum, value) => sum + minor(value), BigInt(0)) -
    subtract.reduce((sum, value) => sum + minor(value), BigInt(0));
  const magnitude = total < BigInt(0) ? -total : total;
  return (
    (total < BigInt(0) ? "-" : "") +
    String(magnitude / BigInt(100)) +
    "." +
    String(magnitude % BigInt(100)).padStart(2, "0")
  );
}

export function formatShiftDecimal(value: string, currency: string): string {
  const amount = minor(value);
  const magnitude = amount < BigInt(0) ? -amount : amount;
  const fraction = String(magnitude % BigInt(100))
    .padStart(2, "0")
    .replace(/0+$/, "");
  return (
    currencyDisplayMarker(currency) +
    " " +
    (amount < BigInt(0) ? "-" : "") +
    (magnitude / BigInt(100)).toLocaleString("en-PK") +
    (fraction ? "." + fraction : "")
  );
}
