import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getCurrentContext } from "@/lib/auth/session";

/**
 * Fire-and-forget audit logger for server actions.
 * Fails silently to avoid blocking the main action.
 */
export async function logAudit(params: {
  module: string;
  action: string;
  details: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const { profile } = await getCurrentContext();
    if (!profile?.organization_id) return;

    const supabase = await createClient();
    await supabase.from("audit_logs").insert({
      organization_id: profile.organization_id,
      branch_id: profile.branch_id,
      actor_id: profile.id,
      module: params.module,
      action: params.action,
      details: params.details,
      metadata: params.metadata ?? {},
    });
  } catch (err) {
    console.error(`[audit] FAILED to record "${params.action}" (${params.module}):`, err);
  }
}
