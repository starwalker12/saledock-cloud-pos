import { getSafeActionError } from "./safe-action-error";

const messages = new Set([
  "A shift is already open for this branch. Close it first.",
  "This shift is already closed or the request conflicts.",
  "Conflicting shift request.",
  "Conflicting expense request.",
  "Conflicting financial request.",
  "Conflicting Return request.",
  "Expense changed; refresh before editing.",
  "Expense changed; refresh and try again.",
  "This expense belongs to a closed cash shift and its financial details can no longer be changed.",
  "Factory Reset invalidated this pending operation. Refresh before continuing.",
  "Legacy shift requires supervised handover.",
  "Enter a valid cash amount with at most two decimals.",
  "Cash amount is outside the supported money domain.",
  "Cash shift totals exceed the supported money domain. This shift was not closed.",
]);

export function getCashShiftActionError(
  error: unknown,
  fallback: string,
): string {
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string" &&
    messages.has(error.message)
  ) {
    return error.message;
  }
  return getSafeActionError(error, fallback);
}
