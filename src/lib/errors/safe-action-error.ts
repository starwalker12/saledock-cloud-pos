/**
 * Maps an error from a server action / Supabase call to a message that is SAFE
 * to show end users — never raw Postgres / Supabase / RPC / constraint / column
 * / table / function details.
 *
 * Our own RPCs raise intentional, user-facing business rules with SQLSTATE
 * `P0001` (the PL/pgSQL `raise exception` default) — e.g. "Insufficient stock
 * for Mouse (have 2, need 5)". Those strings are authored by us and are safe and
 * useful, so they are passed through unchanged. Every other error is mapped to
 * safe, generic wording and the raw detail is dropped. (Existing server-side
 * logging / audit trails still capture the underlying error for developers; this
 * helper only governs what the browser sees.)
 *
 * Usage:
 *   if (error) return err(getSafeActionError(error, "We couldn't save this. Please try again."));
 */

const GENERIC_FALLBACK = "Something went wrong. Please try again.";

type ErrorLike = { code?: unknown; message?: unknown };

function readCode(error: unknown): string | undefined {
  if (error && typeof error === "object" && "code" in error) {
    const c = (error as ErrorLike).code;
    if (typeof c === "string" && c.length > 0) return c;
  }
  return undefined;
}

function readMessage(error: unknown): string | undefined {
  if (error && typeof error === "object" && "message" in error) {
    const m = (error as ErrorLike).message;
    if (typeof m === "string" && m.trim().length > 0) return m.trim();
  }
  return undefined;
}

export function getSafeActionError(
  error: unknown,
  fallback: string = GENERIC_FALLBACK,
): string {
  const code = readCode(error);

  // Intentional business rules raised by our own RPCs (`raise exception`).
  // These are authored, user-facing messages and are safe to show.
  if (code === "P0001") {
    return readMessage(error) ?? fallback;
  }

  switch (code) {
    // Not authenticated (session expired / missing).
    case "28000":
      return "Your session has expired. Please sign in again.";
    // Row-Level Security / insufficient privilege.
    case "42501":
      return "You don't have permission to do this.";
    // PostgREST: no rows where exactly one was expected.
    case "PGRST116":
      return "This item could not be found, or you don't have access to it.";
    // Unique violation.
    case "23505":
      return "This already exists. Please review your entry and try again.";
    // Foreign-key violation.
    case "23503":
      return "This can't be completed because it's still linked to other records.";
    // Not-null / check / restrict violations.
    case "23502":
    case "23514":
      return "Some required details are missing or invalid. Please review and try again.";
    default:
      return fallback;
  }
}
