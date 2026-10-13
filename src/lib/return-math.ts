import { formatMinorUnits, moneyToMinorUnits } from "@/lib/money";

export type ReturnBasisLine = { id: string; lineMinor: bigint; quantity: number };

// All authoritative sale/return/FIFO/stock quantities are PostgreSQL INTEGER.
// Form input stays lexical until the database domain has been checked. Leading
// zeros remain accepted, as in the existing database input policy.
export function parseReturnQuantity(value: string): number | null {
  if (!/^[0-9]+$/.test(value)) return null;
  const canonical = value.replace(/^0+/, "") || "0";
  const maximum = "2147483647";
  if (canonical.length > maximum.length
    || (canonical.length === maximum.length && canonical > maximum)) return null;
  return Number(canonical);
}

export function allocateReturnBasis(lines: ReturnBasisLine[], grandMinor: bigint): Map<string, bigint> {
  const total = lines.reduce((sum, line) => sum + line.lineMinor, BigInt(0));
  const discount = total - grandMinor;
  if (discount < BigInt(0) || grandMinor < BigInt(0)
    || new Set(lines.map(line => line.id)).size !== lines.length
    || lines.some(line => line.lineMinor < BigInt(0) || !Number.isSafeInteger(line.quantity) || line.quantity <= 0)) {
    throw new Error("The original invoice totals cannot be verified.");
  }
  const shares = lines.map(line => ({ ...line,
    share: total === BigInt(0) ? BigInt(0) : discount * line.lineMinor / total,
    remainder: total === BigInt(0) ? BigInt(0) : discount * line.lineMinor % total,
  }));
  let remaining = discount - shares.reduce((sum, line) => sum + line.share, BigInt(0));
  shares.sort((a, b) => a.remainder === b.remainder ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    : a.remainder > b.remainder ? -1 : 1);
  for (const line of shares) {
    if (remaining > BigInt(0)) { line.share += BigInt(1); remaining -= BigInt(1); }
  }
  return new Map(shares.map(line => [line.id, line.lineMinor - line.share]));
}

export function cumulativeReturnCredit(netMinor: bigint, sold: number, returned: number, quantity: number): bigint {
  if (netMinor < BigInt(0) || ![sold, returned, quantity].every(Number.isSafeInteger)
    || sold <= 0 || returned < 0 || quantity < 0 || returned + quantity > sold) {
    throw new Error("Return quantity exceeds the quantity still available to return.");
  }
  return netMinor * BigInt(returned + quantity) / BigInt(sold)
    - netMinor * BigInt(returned) / BigInt(sold);
}

// Preview only. The database repeats eligibility and settlement under its locks.
export function previewReturnSettlement(creditMinor: bigint, due: string) {
  const dueMinor = moneyToMinorUnits(due);
  if (dueMinor === null || dueMinor < BigInt(0) || creditMinor < BigInt(0)) {
    throw new Error("The remaining invoice debt cannot be verified.");
  }
  const debtMinor = creditMinor < dueMinor ? creditMinor : dueMinor;
  return { credit: formatMinorUnits(creditMinor), debt: formatMinorUnits(debtMinor),
    refund: formatMinorUnits(creditMinor - debtMinor) };
}
