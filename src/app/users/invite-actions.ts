"use server";

import { randomBytes, createHash } from "crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCurrentContext } from "@/lib/auth/session";
import { canManageUsers } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { verifyRecaptchaToken } from "@/lib/security/recaptcha";
import { z } from "zod";
import { STAFF_ROLES, inviteUserSchema, type StaffRole } from "@/lib/validation/users";
import { type StaffInvitation as BaseStaffInvitation } from "@/lib/data/users";

const INVITE_TOKEN_BYTES = 32;
const INVITE_LIFETIME_DAYS = 7;
const INVITE_REDIRECT_PATH = "/auth/invite";

export type StaffInviteFormValues = {
  fullName: string;
  email: string;
  role: StaffRole;
  branchId: string;
};

export type StaffInviteActionState = {
  error: string | null;
  success: string | null;
  values?: StaffInviteFormValues;
};

export type StaffInvitationStatus = "pending" | "accepted" | "declined" | "revoked" | "expired";

export type StaffInvitation = BaseStaffInvitation & {
  organization_name: string;
};

function generateInviteToken(): string {
  return randomBytes(INVITE_TOKEN_BYTES).toString("hex");
}

function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function publicOrigin(): Promise<string> {
  const h = await headers();
  const forwardedHost = h.get("x-forwarded-host");
  const forwardedProto = h.get("x-forwarded-proto") ?? "https";
  if (forwardedHost) return `${forwardedProto}://${forwardedHost}`;
  const host = h.get("host");
  return host ? `${forwardedProto}://${host}` : "http://localhost:3000";
}

function buildInviteRedirectUrl(origin: string, rawToken: string, next?: string | null): string {
  const url = new URL(INVITE_REDIRECT_PATH, origin);
  url.searchParams.set("token", rawToken);
  url.searchParams.set("next", next && /^\/(?!\/)[a-zA-Z0-9/._-]*$/.test(next) ? next : "/dashboard");
  return url.toString();
}

async function requireUserManager() {
  const context = await getCurrentContext();
  if (!context.user || !context.profile?.organization_id) {
    return { error: "You must be signed in as an organization user.", context: null };
  }
  if (!canManageUsers(context.profile.role)) {
    return { error: "Only owners and admins can manage staff invitations.", context: null };
  }
  return { error: null, context };
}

function readInviteFormValues(formData: FormData): StaffInviteFormValues {
  const role = String(formData.get("role") ?? "cashier");
  return {
    fullName: String(formData.get("fullName") ?? ""),
    email: String(formData.get("email") ?? ""),
    role: STAFF_ROLES.includes(role as StaffRole) ? (role as StaffRole) : "cashier",
    branchId: String(formData.get("branchId") ?? ""),
  };
}

function inviteError(message: string, values: StaffInviteFormValues): StaffInviteActionState {
  return { error: message, success: null, values };
}

function inviteSuccess(message: string): StaffInviteActionState {
  return {
    error: null,
    success: message,
    values: { fullName: "", email: "", role: "cashier", branchId: "" },
  };
}

async function findAuthUserByEmail(email: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error || !data) return { user: null, error };
  const lower = email.toLowerCase();
  const user = data.users.find((u) => u.email?.toLowerCase() === lower);
  return { user: user ?? null, error: null };
}

async function isConvertibleUnfinishedOwner(authUserId: string) {
  const { profile } = await findProfileByAuthUserId(authUserId);
  if (!profile) return true;
  return !profile.organization_id && !profile.onboarding_completed;
}

async function findProfileByAuthUserId(authUserId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("id, organization_id, role, is_active, full_name, onboarding_completed")
    .eq("id", authUserId)
    .maybeSingle<{ id: string; organization_id: string | null; role: StaffRole; is_active: boolean; full_name: string; onboarding_completed: boolean }>();
  return { profile: data, error };
}

async function findExistingInvite(organizationId: string, email: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("staff_invitations")
    .select("id, status, expires_at, token_hash, full_name, role, branch_id")
    .eq("organization_id", organizationId)
    .eq("email", email.toLowerCase())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string; status: StaffInvitationStatus; expires_at: string | null; token_hash: string | null; full_name: string; role: StaffRole; branch_id: string | null }>();
  return { invite: data, error };
}

export async function inviteStaffAction(
  _prev: StaffInviteActionState,
  formData: FormData,
): Promise<StaffInviteActionState> {
  const submittedValues = readInviteFormValues(formData);
  const { error: authError, context } = await requireUserManager();
  if (authError || !context) return inviteError(authError ?? "Only owners and admins can manage staff invitations.", submittedValues);

  const profile = context.profile;
  if (!profile?.organization_id) {
    return inviteError("Organization profile is missing.", submittedValues);
  }

  const parsed = inviteUserSchema.safeParse({
    email: formData.get("email"),
    fullName: formData.get("fullName"),
    role: formData.get("role"),
    branchId: formData.get("branchId"),
  });
  if (!parsed.success) {
    return inviteError(parsed.error.issues[0]?.message ?? "Invalid staff invite.", submittedValues);
  }

  const admin = createAdminClient();
  const organizationId = profile.organization_id;
  const values = parsed.data;

  // 1. Same-shop staff block: a profile already attached to this organization.
  const { user: existingAuthUser } = await findAuthUserByEmail(values.email);
  if (existingAuthUser) {
    const { profile: existingProfile } = await findProfileByAuthUserId(existingAuthUser.id);
    if (existingProfile?.organization_id === organizationId) {
      logAudit({
        module: "users",
        action: "users.invite_blocked_duplicate_staff",
        details: `Blocked duplicate staff invite: ${values.email} already on this staff list`,
        metadata: { email: values.email, role: values.role, status: existingProfile.is_active ? "active" : "inactive" },
      });
      return inviteError(
        `That email is already on this staff list (${existingProfile.is_active ? "active" : "inactive"}). Edit the existing staff member instead.`,
        submittedValues,
      );
    }
    if (existingProfile?.organization_id && existingProfile.organization_id !== organizationId) {
      logAudit({
        module: "users",
        action: "users.invite_blocked_existing_shop",
        details: `Blocked invite: ${values.email} already belongs to another shop`,
        metadata: { email: values.email, role: values.role, target_organization_id: existingProfile.organization_id },
      });
      return inviteError("This email is already connected to another shop. Use a different email for staff access.", submittedValues);
    }
  }

  // 2. Existing accepted invite block.
  const { invite: existingInvite } = await findExistingInvite(organizationId, values.email);
  if (existingInvite?.status === "accepted") {
    logAudit({
      module: "users",
      action: "users.invite_blocked_duplicate_accepted",
      details: `Blocked duplicate invite: ${values.email} already accepted an invite`,
      metadata: { email: values.email, role: values.role, invitation_id: existingInvite.id },
    });
    return inviteError("This email has already accepted an invite to this shop.", submittedValues);
  }

  // 3. Create or reactivate invitation row.
  const rawToken = generateInviteToken();
  const tokenHash = hashInviteToken(rawToken);
  const expiresAt = new Date(Date.now() + INVITE_LIFETIME_DAYS * 24 * 60 * 60 * 1000).toISOString();

  let invitationId: string;
  if (existingInvite) {
    // Reactivate a declined/revoked/expired invite as a fresh pending invite.
    const { error: reactivateError } = await admin
      .from("staff_invitations")
      .update({
        full_name: values.fullName,
        role: values.role,
        branch_id: values.branchId || null,
        status: "pending",
        token_hash: tokenHash,
        sent_at: null,
        accepted_at: null,
        declined_at: null,
        revoked_at: null,
        expires_at: expiresAt,
        invited_by: profile.id,
      })
      .eq("id", existingInvite.id);

    if (reactivateError) {
      logAudit({
        module: "users",
        action: "users.invite_reactivate_failed",
        details: `Failed to reactivate invitation for ${values.email}`,
        metadata: { email: values.email, role: values.role, invitation_id: existingInvite.id, error: reactivateError.message },
      });
      return inviteError("We could not prepare the staff invitation. Please try again.", submittedValues);
    }
    invitationId = existingInvite.id;
  } else {
    const { data: invitation, error: insertError } = await admin
      .from("staff_invitations")
      .insert({
        organization_id: organizationId,
        email: values.email.toLowerCase(),
        full_name: values.fullName,
        role: values.role,
        branch_id: values.branchId || null,
        permissions: null,
        status: "pending",
        invited_by: profile.id,
        token_hash: tokenHash,
        expires_at: expiresAt,
      })
      .select("id, email")
      .single<{ id: string; email: string }>();

    if (insertError || !invitation) {
      logAudit({
        module: "users",
        action: "users.invite_create_failed",
        details: `Failed to create staff invitation record for ${values.email}`,
        metadata: { email: values.email, role: values.role, error: insertError?.message },
      });
      return inviteError("We could not create the staff invitation. Please try again.", submittedValues);
    }
    invitationId = invitation.id;
  }

  // 4. Send Supabase invite email. This creates an auth user if one does not exist.
  const origin = await publicOrigin();
  const redirectTo = buildInviteRedirectUrl(origin, rawToken);
  const inviteResult = await admin.auth.admin.inviteUserByEmail(values.email, {
    redirectTo,
    data: { full_name: values.fullName, invitation_id: invitationId },
  });

  if (inviteResult.error || !inviteResult.data.user) {
    // Rollback the invitation row so the owner can retry cleanly.
    await admin.from("staff_invitations").delete().eq("id", invitationId);
    logAudit({
      module: "users",
      action: "users.invite_send_failed",
      details: `Failed to send Supabase invite email to ${values.email}`,
      metadata: { email: values.email, role: values.role, invitation_id: invitationId, error: inviteResult.error?.message },
    });
    return inviteError("Invite could not be sent. Check the email address and try again.", submittedValues);
  }

  // 5. Record the Supabase auth user id and sent timestamp.
  const sentAt = new Date().toISOString();
  const { error: updateError } = await admin
    .from("staff_invitations")
    .update({
      invited_auth_user_id: inviteResult.data.user.id,
      sent_at: sentAt,
    })
    .eq("id", invitationId);

  if (updateError) {
    // Non-fatal: the invite was sent, but our metadata is incomplete. Log it.
    logAudit({
      module: "users",
      action: "users.invite_metadata_update_failed",
      details: `Invite sent but metadata update failed for ${values.email}`,
      metadata: { email: values.email, role: values.role, invitation_id: invitationId, error: updateError.message },
    });
  }

  const actionName = existingInvite ? "users.invite_resent_via_create" : "users.invite_sent";
  logAudit({
    module: "users",
    action: actionName,
    details: `Sent staff invite: ${values.fullName} (${values.email}) as ${values.role}`,
    metadata: {
      email: values.email,
      role: values.role,
      full_name: values.fullName,
      invitation_id: invitationId,
      invited_auth_user_id: inviteResult.data.user.id,
    },
  });

  revalidatePath("/users");
  return inviteSuccess("Invite email sent. The staff member must open the email and click Accept to join.");
}

export async function resendStaffInviteAction(invitationId: string): Promise<StaffInviteActionState> {
  const { error: authError, context } = await requireUserManager();
  if (authError || !context) return { error: authError ?? "Only owners and admins can manage staff invitations.", success: null };
  const profile = context.profile;
  if (!profile?.organization_id) return { error: "Organization profile is missing.", success: null };
  const organizationId = profile.organization_id;

  const admin = createAdminClient();
  const { data: invite, error: inviteError } = await admin
    .from("staff_invitations")
    .select("id, organization_id, email, full_name, role, status, expires_at")
    .eq("id", invitationId)
    .eq("organization_id", organizationId)
    .maybeSingle<{ id: string; organization_id: string; email: string; full_name: string; role: StaffRole; status: StaffInvitationStatus; expires_at: string | null }>();

  if (inviteError || !invite) {
    return { error: "Invitation not found.", success: null };
  }

  if (invite.status !== "pending") {
    return { error: `This invite is ${invite.status} and cannot be resent.`, success: null };
  }

  const rawToken = generateInviteToken();
  const tokenHash = hashInviteToken(rawToken);
  const expiresAt = new Date(Date.now() + INVITE_LIFETIME_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { error: updateError } = await admin
    .from("staff_invitations")
    .update({ token_hash: tokenHash, expires_at: expiresAt, sent_at: new Date().toISOString() })
    .eq("id", invite.id);

  if (updateError) {
    logAudit({
      module: "users",
      action: "users.invite_resend_token_failed",
      details: `Failed to rotate invite token for ${invite.email}`,
      metadata: { email: invite.email, invitation_id: invite.id, error: updateError.message },
    });
    return { error: "Could not prepare the resent invite. Please try again.", success: null };
  }

  const origin = await publicOrigin();
  const redirectTo = buildInviteRedirectUrl(origin, rawToken);
  const inviteResult = await admin.auth.admin.inviteUserByEmail(invite.email, {
    redirectTo,
    data: { full_name: invite.full_name, invitation_id: invite.id },
  });

  if (inviteResult.error) {
    logAudit({
      module: "users",
      action: "users.invite_resend_failed",
      details: `Failed to resend staff invite to ${invite.email}`,
      metadata: { email: invite.email, invitation_id: invite.id, error: inviteResult.error.message },
    });
    return { error: "Invite email could not be resent. Please try again.", success: null };
  }

  await admin
    .from("staff_invitations")
    .update({ invited_auth_user_id: inviteResult.data.user?.id ?? null })
    .eq("id", invite.id);

  revalidatePath("/users");
  logAudit({
    module: "users",
    action: "users.invite_resent",
    details: `Resent staff invite to ${invite.email}`,
    metadata: { email: invite.email, role: invite.role, invitation_id: invite.id },
  });

  return { error: null, success: "Invite email resent. The staff member must click Accept to join." };
}

export async function revokeStaffInviteAction(invitationId: string): Promise<StaffInviteActionState> {
  const { error: authError, context } = await requireUserManager();
  if (authError || !context) return { error: authError ?? "Only owners and admins can manage staff invitations.", success: null };
  const profile = context.profile;
  if (!profile?.organization_id) return { error: "Organization profile is missing.", success: null };
  const organizationId = profile.organization_id;

  const admin = createAdminClient();
  const { data: invite, error: inviteError } = await admin
    .from("staff_invitations")
    .select("id, organization_id, email, status")
    .eq("id", invitationId)
    .eq("organization_id", organizationId)
    .maybeSingle<{ id: string; organization_id: string; email: string; status: StaffInvitationStatus }>();

  if (inviteError || !invite) {
    return { error: "Invitation not found.", success: null };
  }

  if (invite.status !== "pending") {
    return { error: `This invite is already ${invite.status}.`, success: null };
  }

  const { error: updateError } = await admin
    .from("staff_invitations")
    .update({ status: "revoked", revoked_at: new Date().toISOString(), token_hash: null })
    .eq("id", invite.id);

  if (updateError) {
    return { error: "Could not revoke the invite. Please try again.", success: null };
  }

  revalidatePath("/users");
  logAudit({
    module: "users",
    action: "users.invite_revoked",
    details: `Revoked staff invite for ${invite.email}`,
    metadata: { email: invite.email, invitation_id: invite.id },
  });

  return { error: null, success: "Invite revoked. The link will no longer work." };
}

export async function getStaffInviteByTokenAction(rawToken: string): Promise<
  | { ok: true; invite: StaffInvitation }
  | { ok: false; error: string }
> {
  if (!rawToken || rawToken.length < 32) {
    return { ok: false, error: "This invite link is invalid. Ask the shop owner to resend the invite." };
  }

  const admin = createAdminClient();
  const tokenHash = hashInviteToken(rawToken);

  const { data: invite, error } = await admin
    .from("staff_invitations")
    .select(
      `id, organization_id, email, full_name, role, branch_id, permissions, status,
       invited_by, invited_auth_user_id, accepted_auth_user_id, sent_at, accepted_at,
       declined_at, revoked_at, expires_at, created_at`,
    )
    .eq("token_hash", tokenHash)
    .maybeSingle<{
      id: string;
      organization_id: string;
      email: string;
      full_name: string;
      role: StaffRole;
      branch_id: string | null;
      permissions: Record<string, unknown> | null;
      status: StaffInvitationStatus;
      invited_by: string;
      invited_auth_user_id: string | null;
      accepted_auth_user_id: string | null;
      sent_at: string | null;
      accepted_at: string | null;
      declined_at: string | null;
      revoked_at: string | null;
      expires_at: string | null;
      created_at: string;
    }>();

  if (error) {
    console.error("[invite] lookup failed:", error.message);
    return { ok: false, error: "We could not verify this invite link. Please try again." };
  }

  if (!invite) {
    return { ok: false, error: "This invite link is invalid or has been revoked. Ask the shop owner to resend the invite." };
  }

  if (invite.status !== "pending") {
    const messages: Record<StaffInvitationStatus, string> = {
      accepted: "This invite has already been accepted.",
      declined: "This invite was declined. Ask the shop owner to send a new invite if this was a mistake.",
      revoked: "This invite has been revoked. Ask the shop owner to send a new invite.",
      expired: "This invite link has expired. Ask the shop owner to resend the invite.",
      pending: "",
    };
    return { ok: false, error: messages[invite.status] };
  }

  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    await admin.from("staff_invitations").update({ status: "expired", token_hash: null }).eq("id", invite.id);
    return { ok: false, error: "This invite link has expired. Ask the shop owner to resend the invite." };
  }

  const [orgResult, branchResult, inviterResult] = await Promise.all([
    admin.from("organizations").select("name").eq("id", invite.organization_id).maybeSingle<{ name: string }>(),
    invite.branch_id
      ? admin.from("branches").select("name").eq("id", invite.branch_id).maybeSingle<{ name: string }>()
      : Promise.resolve({ data: null, error: null }),
    admin.from("profiles").select("full_name").eq("id", invite.invited_by).maybeSingle<{ full_name: string }>(),
  ]);

  return {
    ok: true,
    invite: {
      ...invite,
      invited_by_name: inviterResult.data?.full_name ?? null,
      organization_name: orgResult.data?.name ?? "Unknown shop",
      branch_name: branchResult.data?.name ?? null,
    },
  };
}

export async function declineStaffInviteAction(rawToken: string): Promise<
  | { ok: true }
  | { ok: false; error: string }
> {
  if (!rawToken) return { ok: false, error: "Invite link is missing." };

  const admin = createAdminClient();
  const tokenHash = hashInviteToken(rawToken);

  const { data: invite, error } = await admin
    .from("staff_invitations")
    .select("id, status")
    .eq("token_hash", tokenHash)
    .maybeSingle<{ id: string; status: StaffInvitationStatus }>();

  if (error || !invite) {
    return { ok: false, error: "This invite link is invalid or has been revoked." };
  }

  if (invite.status !== "pending") {
    return { ok: false, error: `This invite is already ${invite.status}.` };
  }

  const { error: updateError } = await admin
    .from("staff_invitations")
    .update({ status: "declined", declined_at: new Date().toISOString(), token_hash: null })
    .eq("id", invite.id);

  if (updateError) {
    return { ok: false, error: "Could not decline the invite. Please try again." };
  }

  logAudit({
    module: "users",
    action: "users.invite_declined",
    details: `Staff invite declined`,
    metadata: { invitation_id: invite.id },
  });

  return { ok: true };
}

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter.")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter.")
  .regex(/[0-9]/, "Password must contain at least one number.")
  .regex(/[^a-zA-Z0-9]/, "Password must contain at least one special character.");

export async function acceptStaffInviteAction(
  rawToken: string,
  formData: { password: string; confirmPassword: string; recaptchaToken: string | null },
): Promise<
  | { ok: true; redirectTo: string }
  | { ok: false; error: string }
> {
  if (!rawToken) return { ok: false, error: "Invite link is missing." };

  // 1. Look up invitation first so we can decide whether this user needs a password.
  const admin = createAdminClient();
  const tokenHash = hashInviteToken(rawToken);

  const { data: invite, error: inviteError } = await admin
    .from("staff_invitations")
    .select(
      `id, organization_id, email, full_name, role, branch_id, permissions, status, invited_auth_user_id, expires_at`,
    )
    .eq("token_hash", tokenHash)
    .maybeSingle<{
      id: string;
      organization_id: string;
      email: string;
      full_name: string;
      role: StaffRole;
      branch_id: string | null;
      permissions: Record<string, unknown> | null;
      status: StaffInvitationStatus;
      invited_auth_user_id: string | null;
      expires_at: string | null;
    }>();

  if (inviteError || !invite) {
    return { ok: false, error: "This invite link is invalid or has been revoked. Ask the shop owner to resend the invite." };
  }

  if (invite.status !== "pending") {
    const messages: Record<StaffInvitationStatus, string> = {
      accepted: "This invite has already been accepted.",
      declined: "This invite was declined. Ask the shop owner to send a new invite if this was a mistake.",
      revoked: "This invite has been revoked. Ask the shop owner to send a new invite.",
      expired: "This invite link has expired. Ask the shop owner to resend the invite.",
      pending: "",
    };
    return { ok: false, error: messages[invite.status] };
  }

  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    await admin.from("staff_invitations").update({ status: "expired", token_hash: null }).eq("id", invite.id);
    return { ok: false, error: "This invite link has expired. Ask the shop owner to resend the invite." };
  }

  // 2. Verify CAPTCHA.
  const recaptchaResult = await verifyRecaptchaToken(formData.recaptchaToken);
  if (!recaptchaResult.success) {
    return { ok: false, error: recaptchaResult.error ?? "Security check failed." };
  }

  // 3. If the caller is signed in, enforce that their session email matches the
  // invite email. The client also checks this, but this is the server-side guard.
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user.email && session.user.email.toLowerCase() !== invite.email.toLowerCase()) {
    return { ok: false, error: "Please sign in with the email address this invitation was sent to." };
  }

  // 4. Ensure a Supabase auth user exists for this email. The invite email should
  // have created one, but if it was already an existing auth user we handle it.
  let authUserId = invite.invited_auth_user_id;
  let authUser: User | null = null;
  if (!authUserId) {
    const { user: existingUser } = await findAuthUserByEmail(invite.email);
    if (existingUser) {
      authUserId = existingUser.id;
      authUser = existingUser;
    }
  } else {
    const { data: userRecord, error: userRecordError } = await admin.auth.admin.getUserById(authUserId);
    if (!userRecordError && userRecord?.user) {
      authUser = userRecord.user;
    }
  }

  if (!authUserId) {
    return { ok: false, error: "No account is linked to this invite. Ask the shop owner to resend the invite." };
  }

  // 5. Detect unfinished owner-signup accounts. These users have a verified email
  // but never completed shop setup, so it is safe to convert them to staff.
  const isUnfinishedOwner = authUser?.email_confirmed_at
    ? await isConvertibleUnfinishedOwner(authUserId)
    : false;

  // Safety: do not silently overwrite an active account. An active account has a
  // completed profile in an organization. Unfinished owner signups are exempt.
  if (authUser?.email_confirmed_at && authUser?.last_sign_in_at && !isUnfinishedOwner) {
    return {
      ok: false,
      error: "This email already has an active SaleDock account. Please sign in with your existing password first, then open this invite link again.",
    };
  }

  // 6. Set the user's password and confirm their email via service role.
  // This is the only place a password is ever set for an invited staff member.
  // Unfinished owner-signup accounts already have a password, so skip this step.
  if (!isUnfinishedOwner) {
    if (formData.password !== formData.confirmPassword) {
      return { ok: false, error: "Passwords do not match." };
    }
    const passwordParsed = passwordSchema.safeParse(formData.password);
    if (!passwordParsed.success) {
      return { ok: false, error: passwordParsed.error.issues[0]?.message ?? "Password does not meet requirements." };
    }

    const { error: updateAuthError } = await admin.auth.admin.updateUserById(authUserId, {
      password: formData.password,
      email_confirm: true,
    });

    if (updateAuthError) {
      const msg = updateAuthError.message.toLowerCase();
      if (msg.includes("same password") || msg.includes("different") || updateAuthError.code === "same_password") {
        return { ok: false, error: "Your new password must be different from any previous password." };
      }
      logAudit({
        module: "users",
        action: "users.invite_accept_password_failed",
        details: `Failed to set password for invited staff ${invite.email}`,
        metadata: { email: invite.email, invitation_id: invite.id, error: updateAuthError.message },
      });
      return { ok: false, error: "Could not set your password. Please try again with a stronger password." };
    }
  }

  // 7. Create or update the staff profile in the invited organization.
  const { profile: existingProfile } = await findProfileByAuthUserId(authUserId);
  if (existingProfile?.organization_id && existingProfile.organization_id !== invite.organization_id) {
    return { ok: false, error: "This account is already connected to another shop. Use a different email or contact support." };
  }

  const profilePayload = {
    id: authUserId,
    organization_id: invite.organization_id,
    branch_id: invite.branch_id,
    full_name: invite.full_name,
    role: invite.role,
    is_active: true,
    onboarding_completed: true,
  };

  const { error: profileError } = existingProfile
    ? await admin.from("profiles").update(profilePayload).eq("id", authUserId)
    : await admin.from("profiles").insert(profilePayload);

  if (profileError) {
    logAudit({
      module: "users",
      action: "users.invite_accept_profile_failed",
      details: `${isUnfinishedOwner ? "Converted unfinished owner" : "Password was set"} but profile creation failed for ${invite.email}`,
      metadata: { email: invite.email, invitation_id: invite.id, error: profileError.message, is_unfinished_owner: isUnfinishedOwner },
    });
    return { ok: false, error: "We could not finish joining the shop. Please contact support." };
  }

  // 8. Clean up any onboarding draft for converted unfinished owners.
  if (isUnfinishedOwner) {
    const { error: draftDeleteError } = await admin.from("onboarding_drafts").delete().eq("user_id", authUserId);
    if (draftDeleteError) {
      logAudit({
        module: "users",
        action: "users.invite_accept_draft_cleanup_failed",
        details: `Profile created but onboarding draft cleanup failed for ${invite.email}`,
        metadata: { email: invite.email, invitation_id: invite.id, error: draftDeleteError.message },
      });
    }
  }

  // 9. Copy invitation permissions to staff_permissions if present.
  if (invite.permissions && Object.keys(invite.permissions).length > 0) {
    const perms = invite.permissions as Record<string, boolean | null>;
    const { error: permError } = await admin.from("staff_permissions").upsert(
      {
        organization_id: invite.organization_id,
        profile_id: authUserId,
        can_sell: perms.can_sell ?? null,
        can_discount: perms.can_discount ?? null,
        can_return: perms.can_return ?? null,
        can_void_invoice: perms.can_void_invoice ?? null,
        can_view_reports: perms.can_view_reports ?? null,
        can_manage_stock: perms.can_manage_stock ?? null,
        can_sell_at_loss: perms.can_sell_at_loss ?? null,
        can_change_settings: perms.can_change_settings ?? null,
      },
      { onConflict: "organization_id, profile_id" },
    );

    if (permError) {
      logAudit({
        module: "users",
        action: "users.invite_accept_permissions_failed",
        details: `Profile created but permission copy failed for ${invite.email}`,
        metadata: { email: invite.email, invitation_id: invite.id, error: permError.message },
      });
      // Non-fatal: role-based permissions still apply.
    }
  }

  // 10. Mark invitation accepted.
  const { error: acceptError } = await admin
    .from("staff_invitations")
    .update({
      status: "accepted",
      accepted_at: new Date().toISOString(),
      accepted_auth_user_id: authUserId,
      token_hash: null,
    })
    .eq("id", invite.id);

  if (acceptError) {
    logAudit({
      module: "users",
      action: "users.invite_accept_marker_failed",
      details: `Profile created but invitation status update failed for ${invite.email}`,
      metadata: { email: invite.email, invitation_id: invite.id, error: acceptError.message },
    });
  }

  logAudit({
    module: "users",
    action: "users.invite_accepted",
    details: `Staff invite accepted: ${invite.full_name} (${invite.email}) as ${invite.role}`,
    metadata: {
      email: invite.email,
      role: invite.role,
      full_name: invite.full_name,
      invitation_id: invite.id,
      auth_user_id: authUserId,
      organization_id: invite.organization_id,
      is_unfinished_owner: isUnfinishedOwner,
    },
  });

  // 11. Unfinished owners keep their existing session. New invitees had their
  // session invalidated by the password update, so send them to login.
  return { ok: true, redirectTo: isUnfinishedOwner ? "/dashboard" : "/login?invite_accepted=1" };
}

export async function listStaffInvitationsAction(organizationId: string): Promise<StaffInvitation[]> {
  const { error: authError, context } = await requireUserManager();
  if (authError || !context || !context.profile?.organization_id) return [];
  if (context.profile.organization_id !== organizationId) return [];

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("staff_invitations")
    .select(
      `id, organization_id, email, full_name, role, branch_id, permissions, status,
       invited_by, invited_auth_user_id, accepted_auth_user_id, sent_at, accepted_at,
       declined_at, revoked_at, expires_at, created_at`,
    )
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .returns<{
      id: string;
      organization_id: string;
      email: string;
      full_name: string;
      role: StaffRole;
      branch_id: string | null;
      permissions: Record<string, unknown> | null;
      status: StaffInvitationStatus;
      invited_by: string;
      invited_auth_user_id: string | null;
      accepted_auth_user_id: string | null;
      sent_at: string | null;
      accepted_at: string | null;
      declined_at: string | null;
      revoked_at: string | null;
      expires_at: string | null;
      created_at: string;
    }[]>();

  if (error || !data) {
    console.error("[invite] list failed:", error?.message);
    return [];
  }

  const [orgs, branches, inviters] = await Promise.all([
    admin.from("organizations").select("id, name").eq("id", organizationId).returns<{ id: string; name: string }[]>(),
    admin.from("branches").select("id, name").eq("organization_id", organizationId).returns<{ id: string; name: string }[]>(),
    admin.from("profiles").select("id, full_name").eq("organization_id", organizationId).returns<{ id: string; full_name: string }[]>(),
  ]);

  const orgNameById = new Map((orgs.data ?? []).map((o) => [o.id, o.name]));
  const branchNameById = new Map((branches.data ?? []).map((b) => [b.id, b.name]));
  const inviterNameById = new Map((inviters.data ?? []).map((p) => [p.id, p.full_name]));

  return data.map((invite) => ({
    ...invite,
    invited_by_name: inviterNameById.get(invite.invited_by) ?? null,
    organization_name: orgNameById.get(invite.organization_id) ?? "Unknown shop",
    branch_name: invite.branch_id ? branchNameById.get(invite.branch_id) ?? null : null,
  }));
}
