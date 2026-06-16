"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentContext } from "@/lib/auth/session";
import { canManageUsers } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import {
  inviteUserSchema,
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

type InviteProfileRow = ProfileSafetyRow & {
  last_login_at: string | null;
};

const INVITE_REDIRECT_PATH = "/auth/callback?next=%2Fdashboard";

function inviteRedirectTo(origin: string): string {
  return `${origin}${INVITE_REDIRECT_PATH}`;
}

function hasSignInProof(user: User | null | undefined, profileLastLoginAt?: string | null): boolean {
  return Boolean(user?.last_sign_in_at ?? profileLastLoginAt);
}

async function publicOrigin(): Promise<string> {
  const h = await headers();
  const forwardedHost = h.get("x-forwarded-host");
  const forwardedProto = h.get("x-forwarded-proto") ?? "https";
  if (forwardedHost) return `${forwardedProto}://${forwardedHost}`;
  const host = h.get("host");
  return host ? `${forwardedProto}://${host}` : "http://localhost:3000";
}

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

export async function inviteUserAction(
  _prev: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  const { error, context } = await requireUserManager();
  if (error || !context) return { error, success: null };
  const profile = context.profile;
  if (!profile?.organization_id) {
    return { error: "Organization profile is missing.", success: null };
  }

  const parsed = inviteUserSchema.safeParse({
    email: formData.get("email"),
    fullName: formData.get("fullName"),
    role: formData.get("role"),
    branchId: formData.get("branchId"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid staff invite.", success: null };
  }

  const admin = createAdminClient();
  const organizationId = profile.organization_id;
  const values = parsed.data;
  const origin = await publicOrigin();

  const existingUsers = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (existingUsers.error) return { error: existingUsers.error.message, success: null };
  const existingAuthUser = existingUsers.data.users.find(
    (user) => user.email?.toLowerCase() === values.email,
  );

  let authUserId = existingAuthUser?.id ?? null;
  let invited = false;
  let linkedAcceptedExistingUser = false;

  if (authUserId) {
    const { data: existingProfile, error: profileReadError } = await admin
      .from("profiles")
      .select("id, organization_id, role, is_active, last_login_at")
      .eq("id", authUserId)
      .maybeSingle<InviteProfileRow>();

    if (profileReadError) return { error: profileReadError.message, success: null };
    if (existingProfile?.organization_id && existingProfile.organization_id !== organizationId) {
      return { error: "That email is already linked to another shop.", success: null };
    }

    if (existingProfile?.organization_id === organizationId) {
      const status = hasSignInProof(existingAuthUser, existingProfile.last_login_at)
        ? "an accepted staff account"
        : "a pending staff invite";
      return {
        error: `That email is already on this staff list as ${status}. Use the staff table to edit it or resend the invite.`,
        success: null,
      };
    }

    if (!hasSignInProof(existingAuthUser)) {
      logAudit({
        module: "users",
        action: "users.invite_existing_unaccepted_blocked",
        details: `Blocked staff invite for existing auth account without sign-in proof: ${values.email}`,
        metadata: { email: values.email, role: values.role },
      });
      return {
        error:
          "This email already has an auth account, but we cannot verify that the person has accepted an invite or signed in. No staff profile was created.",
        success: null,
      };
    }

    linkedAcceptedExistingUser = true;
  }

  if (!authUserId) {
    const invite = await admin.auth.admin.inviteUserByEmail(values.email, {
      redirectTo: inviteRedirectTo(origin),
      data: { full_name: values.fullName },
    });
    if (invite.error || !invite.data.user) {
      logAudit({
        module: "users",
        action: "users.invite_failed",
        details: `Failed to send staff invite: ${values.email}`,
        metadata: { email: values.email, role: values.role, error: invite.error?.message ?? "No auth user returned" },
      });
      return { error: invite.error?.message ?? "Invite failed — email was not sent.", success: null };
    }
    authUserId = invite.data.user.id;
    invited = true;
  }

  const { data: existingProfile, error: profileReadError } = await admin
    .from("profiles")
    .select("id, organization_id")
    .eq("id", authUserId)
    .maybeSingle<{ id: string; organization_id: string | null }>();
  if (profileReadError) return { error: profileReadError.message, success: null };
  if (existingProfile?.organization_id && existingProfile.organization_id !== organizationId) {
    return { error: "That email is already linked to another organization.", success: null };
  }

  const payload = {
    id: authUserId,
    organization_id: organizationId,
    branch_id: values.branchId,
    full_name: values.fullName,
    role: values.role,
    is_active: true,
  };

  const result = existingProfile
    ? await admin.from("profiles").update(payload).eq("id", authUserId)
    : await admin.from("profiles").insert(payload);
  if (result.error) {
    logAudit({
      module: "users",
      action: "users.profile_create_failed",
      details: `Staff profile could not be saved for invite: ${values.email}`,
      metadata: { email: values.email, role: values.role, error: result.error.message, invite_email_sent: invited },
    });
    return {
      error: invited
        ? "Invite email was sent, but the staff profile could not be created. Please contact support before resending."
        : result.error.message,
      success: null,
    };
  }

  logAudit({
    module: "users",
    action: invited ? "users.invite_sent" : "users.existing_auth_linked",
    details: invited
      ? `Sent staff invite: ${values.fullName} (${values.email}) as ${values.role}`
      : `Linked existing signed-in auth account: ${values.fullName} (${values.email}) as ${values.role}`,
    metadata: {
      email: values.email,
      role: values.role,
      full_name: values.fullName,
      auth_user_id: authUserId,
      invite_email_sent: invited,
      accepted_existing_user: linkedAcceptedExistingUser,
    },
  });

  revalidatePath("/users");
  return {
    error: null,
    success: invited
      ? "Invite email sent. The user will stay Pending until they accept the email invite and sign in."
      : "Existing signed-in account linked. This user shows Accepted because Supabase already has sign-in proof.",
  };
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

export async function resendInviteAction(
  _prev: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  const { error, context } = await requireUserManager();
  if (error || !context) return { error, success: null };
  const profile = context.profile;
  if (!profile?.organization_id) return { error: "Organization profile is missing.", success: null };
  const organizationId = profile.organization_id;

  const parsed = profileIdSchema.safeParse({ profileId: formData.get("profileId") });
  if (!parsed.success) return { error: "Staff profile not found.", success: null };

  const admin = createAdminClient();
  const { data: targetProfile, error: profileError } = await admin
    .from("profiles")
    .select("id, organization_id, role, is_active, last_login_at")
    .eq("id", parsed.data.profileId)
    .eq("organization_id", organizationId)
    .maybeSingle<InviteProfileRow>();
  if (profileError) return { error: profileError.message, success: null };
  if (!targetProfile) return { error: "Staff profile not found.", success: null };

  const users = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (users.error) return { error: users.error.message, success: null };
  const user = users.data?.users.find((candidate) => candidate.id === targetProfile.id);
  if (!user?.email) {
    return { error: "No auth account is linked to this staff profile, so no invite email can be resent.", success: null };
  }
  if (hasSignInProof(user, targetProfile.last_login_at)) {
    return { error: "This staff member has already accepted the invite and signed in.", success: null };
  }

  const origin = await publicOrigin();
  const invite = await admin.auth.admin.inviteUserByEmail(user.email, {
    redirectTo: inviteRedirectTo(origin),
  });
  if (invite.error) {
    logAudit({
      module: "users",
      action: "users.invite_resend_failed",
      details: `Failed to resend staff invite: ${user.email}`,
      metadata: { profile_id: targetProfile.id, email: user.email, error: invite.error.message },
    });
    return { error: invite.error.message || "Invite email could not be resent.", success: null };
  }

  revalidatePath("/users");
  logAudit({
    module: "users",
    action: "users.invite_resent",
    details: `Resent staff invite: ${user.email}`,
    metadata: { profile_id: targetProfile.id, email: user.email },
  });
  return {
    error: null,
    success: "Invite email resent. The user will stay Pending until they accept the email invite and sign in.",
  };
}
