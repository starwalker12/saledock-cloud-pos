import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export const RATE_LIMIT_MAX_ATTEMPTS = 10;
export const RATE_LIMIT_WINDOW_MINUTES = 10;

export type RateLimitResult = {
  allowed: boolean;
};

export async function checkRateLimit(email: string, ipAddress: string): Promise<RateLimitResult> {
  const cutoff = new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60 * 1000).toISOString();

  const supabase = createAdminClient();
  const { count, error } = await supabase
    .from("login_attempts")
    .select("*", { count: "exact", head: true })
    .eq("email", email.toLowerCase().trim())
    .eq("ip_address", ipAddress)
    .eq("attempt_type", "signin")
    .eq("success", false)
    .gte("created_at", cutoff);

  if (error) {
    console.error("[rate-limit] check failed, failing open:", error.message);
    return { allowed: true };
  }

  return { allowed: (count ?? 0) < RATE_LIMIT_MAX_ATTEMPTS };
}

export async function recordAttempt(
  email: string,
  ipAddress: string,
  success: boolean,
): Promise<void> {
  try {
    const supabase = createAdminClient();
    await supabase.from("login_attempts").insert({
      email: email.toLowerCase().trim(),
      ip_address: ipAddress,
      attempt_type: "signin",
      success,
    });
  } catch (err) {
    console.error("[rate-limit] recordAttempt failed:", err);
  }
}

export async function clearAttempts(email: string, ipAddress: string): Promise<void> {
  try {
    const supabase = createAdminClient();
    await supabase
      .from("login_attempts")
      .delete()
      .eq("email", email.toLowerCase().trim())
      .eq("ip_address", ipAddress)
      .eq("attempt_type", "signin");
  } catch (err) {
    console.error("[rate-limit] clearAttempts failed:", err);
  }
}

export function extractClientIp(forwardedFor: string | null): string | null {
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() ?? null;
  }
  return null;
}
