export type Permission =
  | "can_sell"
  | "can_discount"
  | "can_return"
  | "can_void_invoice"
  | "can_view_reports"
  | "can_manage_stock"
  | "can_sell_at_loss"
  | "can_change_settings";

export type PermissionMap = Record<Permission, boolean>;

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
