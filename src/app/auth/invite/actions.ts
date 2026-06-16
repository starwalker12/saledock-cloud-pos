"use server";

import { getCurrentContext } from "@/lib/auth/session";
import { logAudit } from "@/lib/audit";

export type StaffInviteAcceptanceResult =
  | { ok: true }
  | { ok: false; message: string };

export async function recordStaffInviteAcceptedAction(): Promise<StaffInviteAcceptanceResult> {
  const { user, profile } = await getCurrentContext();
  if (!user) {
    return {
      ok: false,
      message: "The invite was verified, but SaleDock could not start a signed-in session. Please ask the shop owner to resend the invite.",
    };
  }
  if (!profile?.organization_id) {
    return {
      ok: false,
      message: "This invite opened a SaleDock account, but it is not linked to this shop. Ask the shop owner to resend the invite or contact support.",
    };
  }
  if (!profile.is_active) {
    return {
      ok: false,
      message: "This staff account is inactive. Ask the shop owner to reactivate it before signing in.",
    };
  }

  try {
    await logAudit({
      module: "users",
      action: "users.invite_accepted",
      details: `Staff invite accepted: ${profile.full_name || user.email || profile.id}`,
      metadata: {
        profile_id: profile.id,
        email: user.email ?? null,
        role: profile.role,
      },
    });
  } catch (error) {
    console.error("[InviteAccept] Failed to record invite acceptance audit event:", error);
  }

  return { ok: true };
}
