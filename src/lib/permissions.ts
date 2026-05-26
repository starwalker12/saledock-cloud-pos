import type { ProfileRow } from "@/lib/auth/session";

export type Role = ProfileRow["role"];

const CATALOG_WRITERS: Role[] = ["owner", "admin", "manager"];
const POS_USERS: Role[] = ["owner", "admin", "manager", "cashier"];
const RETURN_PROCESSORS: Role[] = ["owner", "admin", "manager"];
const EXPENSE_MANAGERS: Role[] = ["owner", "admin", "manager"];
const DAY_CLOSERS: Role[] = ["owner", "admin", "manager"];
const DAY_REOPENERS: Role[] = ["owner", "admin"];
const REPORTS_VIEWERS: Role[] = ["owner", "admin", "manager"];
const REPAIR_CREATORS: Role[] = ["owner", "admin", "manager", "cashier", "technician"];
const REPAIR_EDITORS: Role[] = ["owner", "admin", "manager"];
const REPAIR_STATUS_UPDATERS: Role[] = ["owner", "admin", "manager", "technician"];
const SETTINGS_MANAGERS: Role[] = ["owner", "admin"];
const USER_MANAGERS: Role[] = ["owner", "admin"];
const AUDIT_LOG_VIEWERS: Role[] = ["owner", "admin"];

export function canWriteCatalog(role: Role | null | undefined): boolean {
  return role !== null && role !== undefined && CATALOG_WRITERS.includes(role);
}

export function canUsePos(role: Role | null | undefined): boolean {
  return role !== null && role !== undefined && POS_USERS.includes(role);
}

export function canProcessReturns(role: Role | null | undefined): boolean {
  return role !== null && role !== undefined && RETURN_PROCESSORS.includes(role);
}

export function canManageExpenses(role: Role | null | undefined): boolean {
  return role !== null && role !== undefined && EXPENSE_MANAGERS.includes(role);
}

export function canCloseDay(role: Role | null | undefined): boolean {
  return role !== null && role !== undefined && DAY_CLOSERS.includes(role);
}

export function canReopenDay(role: Role | null | undefined): boolean {
  return role !== null && role !== undefined && DAY_REOPENERS.includes(role);
}

export function canViewReports(role: Role | null | undefined): boolean {
  return role !== null && role !== undefined && REPORTS_VIEWERS.includes(role);
}

export function canCreateRepairs(role: Role | null | undefined): boolean {
  return role !== null && role !== undefined && REPAIR_CREATORS.includes(role);
}

export function canEditRepairs(role: Role | null | undefined): boolean {
  return role !== null && role !== undefined && REPAIR_EDITORS.includes(role);
}

export function canUpdateRepairStatus(role: Role | null | undefined): boolean {
  return role !== null && role !== undefined && REPAIR_STATUS_UPDATERS.includes(role);
}

export function canManageSettings(role: Role | null | undefined): boolean {
  return role !== null && role !== undefined && SETTINGS_MANAGERS.includes(role);
}

export function canManageUsers(role: Role | null | undefined): boolean {
  return role !== null && role !== undefined && USER_MANAGERS.includes(role);
}

export function canViewAuditLog(role: Role | null | undefined): boolean {
  return role !== null && role !== undefined && AUDIT_LOG_VIEWERS.includes(role);
}
