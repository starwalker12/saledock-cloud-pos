import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { StaffRole } from "@/lib/validation/users";
import { ROLE_DEFAULTS, type Permission, PERMISSIONS } from "@/lib/staff-permissions";
import type { StaffBranch } from "./users";

type ProfileRow = {
  id: string;
  organization_id: string | null;
  branch_id: string | null;
  full_name: string;
  role: StaffRole;
  is_active: boolean;
};

type StaffPermissionOverride = {
  profile_id: string;
  can_sell: boolean | null;
  can_discount: boolean | null;
  can_return: boolean | null;
  can_void_invoice: boolean | null;
  can_view_reports: boolean | null;
  can_manage_stock: boolean | null;
  can_sell_at_loss: boolean | null;
  can_change_settings: boolean | null;
};

export type PermissionEditorStaff = {
  id: string;
  full_name: string;
  email: string | null;
  branch_name: string | null;
  role: StaffRole;
  is_active: boolean;
  /** Effective resolved permission values (role default + override) */
  effective: Record<Permission, boolean>;
  /** Raw override values from DB (null = inherit role default) */
  overrides: Record<Permission, boolean | null>;
};

export type PermissionEditorData = {
  staff: PermissionEditorStaff[];
  branches: StaffBranch[];
};

export async function getPermissionEditorData(
  organizationId: string,
): Promise<PermissionEditorData> {
  const admin = createAdminClient();

  const [profilesRes, overridesRes, branchesRes, authRes] = await Promise.all([
    admin
      .from("profiles")
      .select("id, organization_id, branch_id, full_name, role, is_active")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: true })
      .returns<ProfileRow[]>(),
    admin
      .from("staff_permissions")
      .select("profile_id, can_sell, can_discount, can_return, can_void_invoice, can_view_reports, can_manage_stock, can_sell_at_loss, can_change_settings")
      .eq("organization_id", organizationId)
      .returns<StaffPermissionOverride[]>(),
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
  const branchNameById = new Map(branches.map((b) => [b.id, b.name]));
  const overridesByProfile = new Map(overridesRes.data?.map((r) => [r.profile_id, r]) ?? []);
  const authByProfile = new Map(authRes.data.users.map((u) => [u.id, u]));

  const staff: PermissionEditorStaff[] = (profilesRes.data ?? [])
    .filter((p) => p.role !== "owner" && p.role !== "admin")
    .map((profile) => {
      const overrides = overridesByProfile.get(profile.id) ?? null;
      const roleDefaults = ROLE_DEFAULTS[profile.role] ?? {};
      const effective = {} as Record<Permission, boolean>;
      const overridesOut = {} as Record<Permission, boolean | null>;
      const authUser = authByProfile.get(profile.id);

      for (const perm of PERMISSIONS) {
        const overrideVal = overrides?.[perm] ?? null;
        overridesOut[perm] = overrideVal;
        effective[perm] = overrideVal !== null ? overrideVal : (roleDefaults[perm] ?? false);
      }

      return {
        id: profile.id,
        full_name: profile.full_name,
        email: authUser?.email ?? null,
        branch_name: profile.branch_id ? branchNameById.get(profile.branch_id) ?? null : null,
        role: profile.role,
        is_active: profile.is_active,
        effective,
        overrides: overridesOut,
      };
    });

  return { staff, branches };
}
