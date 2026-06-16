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
  invited_at: string | null;
  email_confirmed_at: string | null;
  invite_status: "accepted" | "pending" | "not_linked";
};

export type UserManagementData = {
  users: StaffUser[];
  branches: StaffBranch[];
  stats: {
    activeUsers: number;
    privilegedUsers: number;
    staffUsers: number;
    inactiveUsers: number;
  };
};

type ProfileRow = StaffProfile;

function authEmail(user: User | undefined): string | null {
  return user?.email ?? null;
}

function acceptedAt(user: User | undefined, profile: Pick<StaffProfile, "last_login_at">): string | null {
  return user?.last_sign_in_at ?? profile.last_login_at ?? null;
}

function inviteStatus(user: User | undefined, profile: Pick<StaffProfile, "last_login_at">): StaffUser["invite_status"] {
  if (!user) return "not_linked";
  return acceptedAt(user, profile) ? "accepted" : "pending";
}

export async function getUserManagementData(
  organizationId: string,
): Promise<UserManagementData> {
  const admin = createAdminClient();

  const [profilesRes, branchesRes, authRes] = await Promise.all([
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
  ]);

  if (profilesRes.error) throw new Error(profilesRes.error.message);
  if (branchesRes.error) throw new Error(branchesRes.error.message);
  if (authRes.error) throw new Error(authRes.error.message);

  const branches = branchesRes.data ?? [];
  const branchNameById = new Map(branches.map((branch) => [branch.id, branch.name]));
  const authById = new Map(authRes.data.users.map((user) => [user.id, user]));

  const users = (profilesRes.data ?? []).map((profile) => {
    const authUser = authById.get(profile.id);
    return {
      ...profile,
      email: authEmail(authUser),
      branch_name: profile.branch_id ? branchNameById.get(profile.branch_id) ?? null : null,
      auth_created_at: authUser?.created_at ?? null,
      last_sign_in_at: acceptedAt(authUser, profile),
      invited_at: authUser?.invited_at ?? null,
      email_confirmed_at: authUser?.email_confirmed_at ?? null,
      invite_status: inviteStatus(authUser, profile),
    } satisfies StaffUser;
  });

  const activeUsers = users.filter((user) => user.is_active).length;
  const privilegedUsers = users.filter(
    (user) => user.is_active && (user.role === "owner" || user.role === "admin"),
  ).length;
  const inactiveUsers = users.filter((user) => !user.is_active).length;

  return {
    users,
    branches,
    stats: {
      activeUsers,
      privilegedUsers,
      staffUsers: users.length - privilegedUsers,
      inactiveUsers,
    },
  };
}
