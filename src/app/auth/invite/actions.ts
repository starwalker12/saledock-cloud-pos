"use server";

import { getCurrentContext } from "@/lib/auth/session";
import { logAudit } from "@/lib/audit";

export async function recordStaffInviteAcceptedAction(): Promise<void> {
  const { user, profile } = await getCurrentContext();
  if (!user || !profile?.organization_id) return;

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
}
