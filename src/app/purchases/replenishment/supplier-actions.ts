"use server";

import { getCurrentContext } from "@/lib/auth/session";
import { canViewReplenishment } from "@/lib/permissions";
import { getActiveSuppliers, type ActiveSupplier } from "@/lib/data/replenishment";

/**
 * Read-only refresh of the organization's active suppliers, used by the PO
 * planner after a "Quick add supplier" so the new supplier can be shown and
 * selected. Organization-scoped and permission-gated; no writes, no service role.
 */
export async function listActiveSuppliersAction(): Promise<ActiveSupplier[]> {
  const { user, profile } = await getCurrentContext();
  if (!user || !profile?.organization_id) return [];
  if (!canViewReplenishment(profile.role)) return [];
  return getActiveSuppliers(profile.organization_id);
}
