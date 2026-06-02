import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { ProfileRow } from "@/lib/auth/session";

export type Permission =
  | "can_sell"
  | "can_discount"
  | "can_return"
  | "can_void_invoice"
  | "can_view_reports"
  | "can_manage_stock"
  | "can_sell_at_loss"
  | "can_change_settings";

type PermissionMap = Record<Permission, boolean>;

export const PERMISSIONS: Permission[] = [
  "can_sell",
  "can_discount",
  "can_return",
  "can_void_invoice",
  "can_view_reports",
  "can_manage_stock",
  "can_sell_at_loss",
  "can_change_settings",
];

export const ROLE_DEFAULTS: Record<string, PermissionMap> = {
  owner: {
    can_sell: true,
    can_discount: true,
    can_return: true,
    can_void_invoice: true,
    can_view_reports: true,
    can_manage_stock: true,
    can_sell_at_loss: true,
    can_change_settings: true,
  },
  admin: {
    can_sell: true,
    can_discount: true,
    can_return: true,
    can_void_invoice: true,
    can_view_reports: true,
    can_manage_stock: true,
    can_sell_at_loss: true,
    can_change_settings: true,
  },
  manager: {
    can_sell: true,
    can_discount: true,
    can_return: true,
    can_void_invoice: false,
    can_view_reports: true,
    can_manage_stock: true,
    can_sell_at_loss: false,
    can_change_settings: false,
  },
  cashier: {
    can_sell: true,
    can_discount: true,
    can_return: false,
    can_void_invoice: false,
    can_view_reports: false,
    can_manage_stock: false,
    can_sell_at_loss: false,
    can_change_settings: false,
  },
  technician: {
    can_sell: false,
    can_discount: false,
    can_return: false,
    can_void_invoice: false,
    can_view_reports: false,
    can_manage_stock: false,
    can_sell_at_loss: false,
    can_change_settings: false,
  },
};

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
