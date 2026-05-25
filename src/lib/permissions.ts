import type { ProfileRow } from "@/lib/auth/session";

export type Role = ProfileRow["role"];

const CATALOG_WRITERS: Role[] = ["owner", "admin", "manager"];
const POS_USERS: Role[] = ["owner", "admin", "manager", "cashier"];
const RETURN_PROCESSORS: Role[] = ["owner", "admin", "manager"];
const EXPENSE_MANAGERS: Role[] = ["owner", "admin", "manager"];
const DAY_CLOSERS: Role[] = ["owner", "admin", "manager"];
const DAY_REOPENERS: Role[] = ["owner", "admin"];
const REPORTS_VIEWERS: Role[] = ["owner", "admin", "manager"];

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
