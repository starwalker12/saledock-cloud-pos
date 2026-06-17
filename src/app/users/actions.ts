"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentContext } from "@/lib/auth/session";
import { canManageUsers } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import {
  profileIdSchema,
  updateUserProfileSchema,
  type StaffRole,
} from "@/lib/validation/users";

export type UserActionState = {
  error: string | null;
  success: string | null;
};

type ProfileSafetyRow = {
  id: string;
  organization_id: string | null;
  role: StaffRole;
  is_active: boolean;
};

async function requireUserManager() {
  const context = await getCurrentContext();
  if (!context.user || !context.profile?.organization_id) {
    return { error: "You must be signed in as an organization user.", context: null as null };
  }
  if (!canManageUsers(context.profile.role)) {
    return { error: "Only owners and admins can manage staff users.", context: null as null };
  }
  return { error: null, context };
}

async function assertSafePrivilegeChange({
  organizationId,
  profileId,
  nextRole,
  nextActive,
}: {
  organizationId: string;
  profileId: string;
  nextRole: StaffRole;
  nextActive: boolean;
}): Promise<string | null> {
  const admin = createAdminClient();
  const { data: target, error: targetError } = await admin
    .from("profiles")
    .select("id, organization_id, role, is_active")
    .eq("id", profileId)
    .maybeSingle<ProfileSafetyRow>();

  if (targetError) return targetError.message;
  if (!target || target.organization_id !== organizationId) return "Staff profile not found.";

  const currentlyPrivileged =
    target.is_active && (target.role === "owner" || target.role === "admin");
  const willBePrivileged = nextActive && (nextRole === "owner" || nextRole === "admin");
  if (!currentlyPrivileged || willBePrivileged) return null;

  const { count, error } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .in("role", ["owner", "admin"])
    .neq("id", profileId);
  if (error) return error.message;

  return (count ?? 0) > 0
    ? null
    : "At least one active owner or admin must remain.";
}

export async function updateUserProfileAction(formData: FormData): Promise<void> {
  const { error, context } = await requireUserManager();
  if (error || !context) return;
  const profile = context.profile;
  if (!profile?.organization_id) return;
  const organizationId = profile.organization_id;

  const parsed = updateUserProfileSchema.safeParse({
    profileId: formData.get("profileId"),
    fullName: formData.get("fullName"),
    role: formData.get("role"),
    branchId: formData.get("branchId"),
  });
  if (!parsed.success) return;

  const admin = createAdminClient();
  const { data: targetProfile, error: targetError } = await admin
    .from("profiles")
    .select("id, organization_id, role, branch_id, full_name, is_active")
    .eq("id", parsed.data.profileId)
    .maybeSingle<(ProfileSafetyRow & { branch_id: string | null; full_name: string })>();
  if (targetError || !targetProfile || targetProfile.organization_id !== organizationId) return;

  if (parsed.data.profileId === profile.id && parsed.data.role !== profile.role) {
    logAudit({
      module: "users",
      action: "users.self_role_change_blocked",
      details: "Blocked a user manager from changing their own role.",
      metadata: { profile_id: parsed.data.profileId, attempted_role: parsed.data.role },
    });
    return;
  }

  const safetyError = await assertSafePrivilegeChange({
    organizationId,
    profileId: parsed.data.profileId,
    nextRole: parsed.data.role,
    nextActive: true,
  });
  if (safetyError) {
    await logAudit({
      module: "users",
      action: "users.last_privilege_role_change_blocked",
      details: `Blocked role change for last active owner\/admin: ${targetProfile.full_name}`,
      metadata: {
        profile_id: parsed.data.profileId,
        attempted_role: parsed.data.role,
        reason: "last_active_owner_admin",
      },
    });
    return;
  }

  const { error: updateError } = await admin
    .from("profiles")
    .update({
      full_name: parsed.data.fullName,
      role: parsed.data.role,
      branch_id: parsed.data.branchId,
    })
    .eq("organization_id", organizationId)
    .eq("id", parsed.data.profileId);
  if (updateError) return;
  revalidatePath("/users");
  logAudit({
    module: "users",
    action: "users.profile_updated",
    details: `Updated staff profile: ${parsed.data.fullName} → role ${parsed.data.role}`,
    metadata: {
      profile_id: parsed.data.profileId,
      full_name: parsed.data.fullName,
      role: parsed.data.role,
      branch_id: parsed.data.branchId,
      previous: {
        full_name: targetProfile.full_name,
        role: targetProfile.role,
        branch_id: targetProfile.branch_id,
      },
    },
  });
}

export async function deactivateUserAction(formData: FormData): Promise<void> {
  const { error, context } = await requireUserManager();
  if (error || !context) return;
  const profile = context.profile;
  if (!profile?.organization_id) return;
  const organizationId = profile.organization_id;

  const parsed = profileIdSchema.safeParse({ profileId: formData.get("profileId") });
  if (!parsed.success) return;
  if (parsed.data.profileId === profile.id) {
    logAudit({
      module: "users",
      action: "users.self_deactivate_blocked",
      details: "Blocked a user manager from deactivating their own account.",
      metadata: { profile_id: parsed.data.profileId },
    });
    return;
  }

  const safetyError = await assertSafePrivilegeChange({
    organizationId,
    profileId: parsed.data.profileId,
    nextRole: "cashier",
    nextActive: false,
  });
  if (safetyError) {
    await logAudit({
      module: "users",
      action: "users.last_privilege_deactivate_blocked",
      details: `Blocked deactivation of last active owner\/admin: ${parsed.data.profileId}`,
      metadata: {
        profile_id: parsed.data.profileId,
        reason: "last_active_owner_admin",
      },
    });
    return;
  }

  const admin = createAdminClient();
  const { error: updateError } = await admin
    .from("profiles")
    .update({ is_active: false })
    .eq("organization_id", organizationId)
    .eq("id", parsed.data.profileId);
  if (updateError) return;
  revalidatePath("/users");
  logAudit({
    module: "users",
    action: "users.deactivated",
    details: `Deactivated staff: ${parsed.data.profileId}`,
    metadata: { profile_id: parsed.data.profileId },
  });
}

export async function reactivateUserAction(formData: FormData): Promise<void> {
  const { error, context } = await requireUserManager();
  if (error || !context) return;
  const profile = context.profile;
  if (!profile?.organization_id) return;
  const organizationId = profile.organization_id;

  const parsed = profileIdSchema.safeParse({ profileId: formData.get("profileId") });
  if (!parsed.success) return;

  const admin = createAdminClient();
  const { error: updateError } = await admin
    .from("profiles")
    .update({ is_active: true })
    .eq("organization_id", organizationId)
    .eq("id", parsed.data.profileId);
  if (updateError) return;
  revalidatePath("/users");
  logAudit({
    module: "users",
    action: "users.reactivated",
    details: `Reactivated staff: ${parsed.data.profileId}`,
    metadata: { profile_id: parsed.data.profileId },
  });
}
