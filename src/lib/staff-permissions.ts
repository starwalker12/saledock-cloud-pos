import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { ProfileRow } from "@/lib/auth/session";
import { ROLE_DEFAULTS, type Permission } from "./staff-permissions-shared";

type StaffPermissionsRow = {
  id: string;
  organization_id: string;
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

const getStaffPermissionsRow = cache(
  async (
    organizationId: string | null,
    profileId: string,
  ): Promise<StaffPermissionsRow | null> => {
    if (!organizationId) return null;
    const supabase = await createClient();
    const { data } = await supabase
      .from("staff_permissions")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("profile_id", profileId)
      .maybeSingle<StaffPermissionsRow>();
    return data ?? null;
  },
);

export async function userCan(
  profile: Pick<ProfileRow, "id" | "organization_id" | "role">,
  permission: Permission,
): Promise<boolean> {
  // Owner and admin always have every permission — locked by design.
  if (profile.role === "owner" || profile.role === "admin") return true;

  const roleDefault = ROLE_DEFAULTS[profile.role]?.[permission] ?? false;

  try {
    const row = await getStaffPermissionsRow(profile.organization_id, profile.id);
    if (!row) return roleDefault;

    const override = row[permission];
    return override !== null ? override : roleDefault;
  } catch (err) {
    console.warn("[staff-permissions] Lookup failed, falling back to role default:", err);
    return roleDefault;
  }
}

export async function canSellNew(profile: Pick<ProfileRow, "id" | "organization_id" | "role">): Promise<boolean> {
  return userCan(profile, "can_sell");
}

export async function canDiscountNew(profile: Pick<ProfileRow, "id" | "organization_id" | "role">): Promise<boolean> {
  return userCan(profile, "can_discount");
}

export async function canReturnNew(profile: Pick<ProfileRow, "id" | "organization_id" | "role">): Promise<boolean> {
  return userCan(profile, "can_return");
}

export async function canVoidInvoiceNew(profile: Pick<ProfileRow, "id" | "organization_id" | "role">): Promise<boolean> {
  return userCan(profile, "can_void_invoice");
}

export async function canViewReportsNew(profile: Pick<ProfileRow, "id" | "organization_id" | "role">): Promise<boolean> {
  return userCan(profile, "can_view_reports");
}

export async function canManageStockNew(profile: Pick<ProfileRow, "id" | "organization_id" | "role">): Promise<boolean> {
  return userCan(profile, "can_manage_stock");
}

export async function canSellAtLossNew(profile: Pick<ProfileRow, "id" | "organization_id" | "role">): Promise<boolean> {
  return userCan(profile, "can_sell_at_loss");
}

export async function canChangeSettingsNew(profile: Pick<ProfileRow, "id" | "organization_id" | "role">): Promise<boolean> {
  return userCan(profile, "can_change_settings");
}
