export const MONEY_PRECISION_MESSAGE = "Amount must have no more than 2 decimal places.";
const MAX_MINOR_UNITS = BigInt("999999999999");
const ZERO = BigInt(0);
const HUNDRED = BigInt(100);
type MoneyInput = string | number;

export function moneyToMinorUnits(value: unknown): bigint | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).trim();
  if (text.length > 128) return null;
  const match = text.match(/^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i);
  if (!match || !(match[2] || match[3])) return null;
  const fraction = match[3] ?? "";
  const digits = (match[2] + fraction).replace(/^0+/, "");
  if (!digits) return ZERO;
  const significant = digits.replace(/0+$/, "");
  const scale = fraction.length - Number(match[4] ?? 0) - (digits.length - significant.length);
  if (!Number.isSafeInteger(scale) || scale > 2 || significant.length + 2 - scale > 12) return null;
  const minor = BigInt(significant) * (BigInt(10) ** BigInt(2 - scale));
  if (minor > MAX_MINOR_UNITS) return null;
  return match[1] === "-" ? -minor : minor;
}

export function formatMinorUnits(minor: bigint): string {
  const magnitude = minor < ZERO ? -minor : minor;
  return `${minor < ZERO ? "-" : ""}${magnitude / HUNDRED}.${String(magnitude % HUNDRED).padStart(2, "0")}`;
}

function moneyNumber(minor: bigint): number {
  // Only cross back to the existing numeric transport after exact decimal arithmetic.
  if (minor < -MAX_MINOR_UNITS || minor > MAX_MINOR_UNITS) return NaN;
  return Number(formatMinorUnits(minor));
}

export function sumMoney(values: MoneyInput[]): number {
  let total = ZERO;
  for (const value of values) {
    const minor = moneyToMinorUnits(value);
    if (minor === null) return NaN;
    total += minor;
  }
  return moneyNumber(total);
}

export function subtractMoney(left: MoneyInput, right: MoneyInput): number {
  const a = moneyToMinorUnits(left), b = moneyToMinorUnits(right);
  return a === null || b === null ? NaN : moneyNumber(a - b);
}

export function multiplyMoney(value: MoneyInput, quantity: number): number {
  const minor = moneyToMinorUnits(value);
  return minor === null || !Number.isSafeInteger(quantity) ? NaN : moneyNumber(minor * BigInt(quantity));
}

export function lineMoney(unitPrice: MoneyInput, quantity: number, discount: MoneyInput): number {
  return Math.max(subtractMoney(multiplyMoney(unitPrice, quantity), discount), 0);
}
