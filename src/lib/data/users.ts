import "server-only";
import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { StaffRole } from "@/lib/validation/users";

export type StaffBranch = {
  id: string;
  name: string;
  is_active: boolean;
};

export type StaffProfile = {
  id: string;
  organization_id: string | null;
  branch_id: string | null;
  full_name: string;
  role: StaffRole;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
};

export type StaffUser = StaffProfile & {
  email: string | null;
  branch_name: string | null;
  auth_created_at: string | null;
  last_sign_in_at: string | null;
  invite_status: "accepted" | "not_linked";
};

export type StaffInvitationStatus = "pending" | "accepted" | "declined" | "revoked" | "expired";

export type StaffInvitation = {
  id: string;
  organization_id: string;
  email: string;
  full_name: string;
  role: StaffRole;
  branch_id: string | null;
  branch_name: string | null;
  permissions: Record<string, unknown> | null;
  status: StaffInvitationStatus;
  invited_by: string;
  invited_by_name: string | null;
  invited_auth_user_id: string | null;
  accepted_auth_user_id: string | null;
  sent_at: string | null;
  accepted_at: string | null;
  declined_at: string | null;
  revoked_at: string | null;
  expires_at: string | null;
  created_at: string;
};

export type UserManagementData = {
  users: StaffUser[];
  invitations: StaffInvitation[];
  branches: StaffBranch[];
  stats: {
    activeUsers: number;
    privilegedUsers: number;
    staffUsers: number;
    inactiveUsers: number;
    pendingInvites: number;
  };
};

type ProfileRow = StaffProfile;

function authEmail(user: User | undefined): string | null {
  return user?.email ?? null;
}

function acceptedAt(user: User | undefined, profile: Pick<StaffProfile, "last_login_at">): string | null {
  return user?.last_sign_in_at ?? profile.last_login_at ?? null;
}

function inviteStatus(
  user: User | undefined,
  profile: Pick<StaffProfile, "role" | "last_login_at">,
): StaffUser["invite_status"] {
  if (!user) return "not_linked";
  return user.email_confirmed_at || acceptedAt(user, profile) ? "accepted" : "not_linked";
}

export async function getUserManagementData(
  organizationId: string,
): Promise<UserManagementData> {
  const admin = createAdminClient();

  const [profilesRes, branchesRes, authRes, invitationsRes, invitersRes] = await Promise.all([
    admin
      .from("profiles")
      .select("id, organization_id, branch_id, full_name, role, is_active, last_login_at, created_at, updated_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: true })
      .returns<ProfileRow[]>(),
    admin
      .from("branches")
      .select("id, name, is_active")
      .eq("organization_id", organizationId)
      .order("name", { ascending: true })
      .returns<StaffBranch[]>(),
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    admin
      .from("staff_invitations")
      .select("id, organization_id, email, full_name, role, branch_id, status, invited_by, invited_auth_user_id, accepted_auth_user_id, sent_at, accepted_at, declined_at, revoked_at, expires_at, created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .returns<StaffInvitation[]>(),
    admin
      .from("profiles")
      .select("id, full_name")
      .eq("organization_id", organizationId)
      .returns<{ id: string; full_name: string }[]>(),
  ]);

  if (profilesRes.error) throw new Error(profilesRes.error.message);
  if (branchesRes.error) throw new Error(branchesRes.error.message);
  if (authRes.error) throw new Error(authRes.error.message);
  if (invitationsRes.error) throw new Error(invitationsRes.error.message);

  const branches = branchesRes.data ?? [];
  const branchNameById = new Map(branches.map((branch) => [branch.id, branch.name]));
  const authById = new Map(authRes.data.users.map((user) => [user.id, user]));
  const inviterNameById = new Map((invitersRes.data ?? []).map((p) => [p.id, p.full_name]));

  const users = (profilesRes.data ?? []).map((profile) => {
    const authUser = authById.get(profile.id);
    const status = inviteStatus(authUser, profile);
    return {
      ...profile,
      email: authEmail(authUser),
      branch_name: profile.branch_id ? branchNameById.get(profile.branch_id) ?? null : null,
      auth_created_at: authUser?.created_at ?? null,
      last_sign_in_at: status === "accepted" ? acceptedAt(authUser, profile) : null,
      invite_status: status,
    } satisfies StaffUser;
  });

  const invitations = (invitationsRes.data ?? []).map((invite) => ({
    ...invite,
    permissions: invite.permissions ?? null,
    organization_name: null,
    branch_name: invite.branch_id ? branchNameById.get(invite.branch_id) ?? null : null,
    invited_by_name: inviterNameById.get(invite.invited_by) ?? null,
  }));

  const activeUsers = users.filter((user) => user.is_active).length;
  const privilegedUsers = users.filter(
    (user) => user.is_active && (user.role === "owner" || user.role === "admin"),
  ).length;
  const inactiveUsers = users.filter((user) => !user.is_active).length;

  return {
    users,
    invitations,
    branches,
    stats: {
      activeUsers,
      privilegedUsers,
      staffUsers: users.length - privilegedUsers,
      inactiveUsers,
      pendingInvites: invitations.filter((i) => i.status === "pending").length,
    },
  };
}
