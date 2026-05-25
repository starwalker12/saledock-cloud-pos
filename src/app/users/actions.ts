"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentContext } from "@/lib/auth/session";
import { canManageUsers } from "@/lib/permissions";
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

  if (!authUserId) {
    const invite = await admin.auth.admin.inviteUserByEmail(values.email, {
      redirectTo: `${origin}/auth/callback?next=/dashboard`,
      data: { full_name: values.fullName },
    });
    if (invite.error || !invite.data.user) {
      return { error: invite.error?.message ?? "Failed to send staff invite.", success: null };
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
  if (result.error) return { error: result.error.message, success: null };

  revalidatePath("/users");
  return {
    error: null,
    success: invited
      ? "Staff invite sent and profile created."
      : "Existing auth user linked to this staff profile.",
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
  const safetyError = await assertSafePrivilegeChange({
    organizationId,
    profileId: parsed.data.profileId,
    nextRole: parsed.data.role,
    nextActive: true,
  });
  if (safetyError) return;

  await admin
    .from("profiles")
    .update({
      full_name: parsed.data.fullName,
      role: parsed.data.role,
      branch_id: parsed.data.branchId,
    })
    .eq("organization_id", organizationId)
    .eq("id", parsed.data.profileId);
  revalidatePath("/users");
}

export async function deactivateUserAction(formData: FormData): Promise<void> {
  const { error, context } = await requireUserManager();
  if (error || !context) return;
  const profile = context.profile;
  if (!profile?.organization_id) return;
  const organizationId = profile.organization_id;

  const parsed = profileIdSchema.safeParse({ profileId: formData.get("profileId") });
  if (!parsed.success) return;
  if (parsed.data.profileId === profile.id && profile.role === "owner") return;

  const safetyError = await assertSafePrivilegeChange({
    organizationId,
    profileId: parsed.data.profileId,
    nextRole: "cashier",
    nextActive: false,
  });
  if (safetyError) return;

  const admin = createAdminClient();
  await admin
    .from("profiles")
    .update({ is_active: false })
    .eq("organization_id", organizationId)
    .eq("id", parsed.data.profileId);
  revalidatePath("/users");
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
  await admin
    .from("profiles")
    .update({ is_active: true })
    .eq("organization_id", organizationId)
    .eq("id", parsed.data.profileId);
  revalidatePath("/users");
}

export async function resendInviteAction(formData: FormData): Promise<void> {
  const { error, context } = await requireUserManager();
  if (error || !context) return;
  const profile = context.profile;
  if (!profile?.organization_id) return;
  const organizationId = profile.organization_id;

  const parsed = profileIdSchema.safeParse({ profileId: formData.get("profileId") });
  if (!parsed.success) return;

  const admin = createAdminClient();
  const { data: targetProfile } = await admin
    .from("profiles")
    .select("id, organization_id")
    .eq("id", parsed.data.profileId)
    .eq("organization_id", organizationId)
    .maybeSingle<{ id: string; organization_id: string }>();
  if (!targetProfile) return;

  const users = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const user = users.data?.users.find((candidate) => candidate.id === targetProfile.id);
  if (!user?.email) return;

  const origin = await publicOrigin();
  await admin.auth.admin.inviteUserByEmail(user.email, {
    redirectTo: `${origin}/auth/callback?next=/dashboard`,
  });
  revalidatePath("/users");
}
