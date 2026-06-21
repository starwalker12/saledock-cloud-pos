"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentContext } from "@/lib/auth/session";
import { canManageUsers } from "@/lib/permissions";
import { PERMISSIONS } from "@/lib/staff-permissions-shared";
import { logAudit } from "@/lib/audit";
import { getSafeActionError } from "@/lib/errors/safe-action-error";

export type PermissionActionState = {
  error: string | null;
  success: string | null;
};

async function requireOwnerOrAdmin() {
  const context = await getCurrentContext();
  if (!context.user || !context.profile?.organization_id) {
    return { error: "You must be signed in.", context: null as null };
  }
  if (!canManageUsers(context.profile.role)) {
    logAudit({ module: "settings", action: "permission.denied", details: "Attempted permission edit without owner/admin role" });
    return { error: "Only owners and admins can edit permissions.", context: null as null };
  }
  return { error: null, context };
}

export async function updateStaffPermissionsAction(
  prev: PermissionActionState,
  formData: FormData,
): Promise<PermissionActionState> {
  const { error, context } = await requireOwnerOrAdmin();
  if (error || !context) return { error, success: null };

  const profile = context.profile;
  if (!profile?.organization_id) return { error: "Organization missing.", success: null };

  const profileId = formData.get("profileId");
  if (typeof profileId !== "string" || !profileId) {
    return { error: "Missing profile ID.", success: null };
  }

  if (profileId === profile.id) {
    return { error: "You cannot edit your own permissions.", success: null };
  }

  const changes: Record<string, boolean | null> = {};
  for (const perm of PERMISSIONS) {
    const raw = formData.get(perm);
    if (raw === "true") changes[perm] = true;
    else if (raw === "false") changes[perm] = false;
  }

  if (Object.keys(changes).length === 0) {
    return { error: "No permissions to update.", success: null };
  }

  const admin = createAdminClient();
  const orgId = profile.organization_id;

  // The service-role client bypasses RLS, so verify the target belongs to the
  // manager's organization before reading or writing permission overrides.
  const { data: targetProfile, error: targetError } = await admin
    .from("profiles")
    .select("id, role")
    .eq("organization_id", orgId)
    .eq("id", profileId)
    .maybeSingle<{ id: string; role: string }>();

  if (targetError) {
    console.error("[permissions] Target lookup failed:", targetError);
    return {
      error: getSafeActionError(
        targetError,
        "We couldn't verify this staff account. Please try again.",
      ),
      success: null,
    };
  }
  if (!targetProfile) {
    return { error: "This staff account could not be found in your shop.", success: null };
  }
  if (targetProfile.role === "owner" || targetProfile.role === "admin") {
    return { error: "Owner and admin permissions are set by their role.", success: null };
  }

  const { data: existing } = await admin
    .from("staff_permissions")
    .select("id")
    .eq("organization_id", orgId)
    .eq("profile_id", profileId)
    .maybeSingle<{ id: string }>();

  const payload = { organization_id: orgId, profile_id: profileId, ...changes };

  if (existing) {
    const { error: updateErr } = await admin
      .from("staff_permissions")
      .update(payload)
      .eq("id", existing.id);
    if (updateErr) {
      console.error("[permissions] Update failed:", updateErr);
      return { error: getSafeActionError(updateErr, "We couldn't update permissions. Please try again."), success: null };
    }
  } else {
    const { error: insertErr } = await admin
      .from("staff_permissions")
      .insert(payload);
    if (insertErr) {
      console.error("[permissions] Insert failed:", insertErr);
      return { error: getSafeActionError(insertErr, "We couldn't update permissions. Please try again."), success: null };
    }
  }

  revalidatePath("/settings/permissions");
  logAudit({
    module: "settings",
    action: "permissions.updated",
    details: `Updated permissions for profile ${profileId}`,
    metadata: { profile_id: profileId, changes },
  });

  return { error: null, success: "Permissions saved." };
}
