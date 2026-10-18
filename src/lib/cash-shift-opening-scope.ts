// Each protected opening adds one exact row. Closing does not remove it, and
// passive imported/legacy history cannot advance this operational lifecycle.
export function cashShiftOpeningScope(
  organizationId: string,
  branchId: string,
  exactOpenings: number,
) {
  if (!Number.isSafeInteger(exactOpenings) || exactOpenings < 0)
    throw new Error("Unable to establish the shift opening lifecycle.");
  return `shift-open:${organizationId}:${branchId}:${exactOpenings}`;
}
