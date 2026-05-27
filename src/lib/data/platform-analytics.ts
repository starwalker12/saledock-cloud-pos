import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requirePlatformAdmin } from "@/lib/platform/admin";

export type PlatformOverview = {
  totalUsers: number;
  totalProfiles: number;
  totalOrganizations: number;
  onboardedOrganizations: number;
  incompleteOnboarding: number;
  totalBranches: number;
  totalProducts: number;
  totalCustomers: number;
  totalInvoices: number;
  organizationsToday: number;
  organizations7d: number;
  organizations30d: number;
  backupImports: number;
  backupImportsFailed: number;
  backupImportsCompleted: number;
};

export type PlatformTenant = {
  id: string;
  name: string;
  ownerEmail: string | null;
  ownerName: string | null;
  created_at: string | null;
  onboardingCompleted: boolean;
  branchCount: number;
  productCount: number;
  invoiceCount: number;
};

export type PlatformActivity = {
  orgName: string | null;
  action: string;
  timestamp: string | null;
  metadata: Record<string, unknown> | null;
};

async function safeCount(
  table: string,
  column = "id",
  filters?: Record<string, unknown>,
): Promise<number> {
  try {
    const admin = await createAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any = (admin.from(table) as any).select(column, {
      count: "exact",
      head: true,
    });
    if (filters) {
      for (const [k, v] of Object.entries(filters)) {
        query = query.eq(k, v);
      }
    }
    const { count } = await query;
    return count ?? 0;
  } catch {
    return 0;
  }
}

export async function getPlatformOverview(): Promise<PlatformOverview> {
  await requirePlatformAdmin();

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000).toISOString();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000).toISOString();

  const [
    totalUsers,
    totalProfiles,
    totalOrganizations,
    onboardedOrganizations,
    incompleteOnboarding,
    totalBranches,
    totalProducts,
    totalCustomers,
    totalInvoices,
    organizationsToday,
    organizations7d,
    organizations30d,
  ] = await Promise.all([
    safeCount("profiles"),
    safeCount("profiles"),
    safeCount("organizations"),
    safeCount("organizations", "id", { onboarding_completed: true }),
    (async () => {
      const p = await safeCount("profiles", "id", { onboarding_completed: false });
      const o = await safeCount("organizations", "id", { onboarding_completed: false });
      return p + o;
    })(),
    safeCount("branches"),
    safeCount("products"),
    safeCount("customers"),
    safeCount("invoices"),
    safeCount("organizations", "id", { created_at_gt: todayStart }),
    safeCount("organizations", "id", { created_at_gt: sevenDaysAgo }),
    safeCount("organizations", "id", { created_at_gt: thirtyDaysAgo }),
  ]);

  // Backup import stats from audit_logs
  let backupImports = 0;
  let backupImportsFailed = 0;
  let backupImportsCompleted = 0;
  try {
    const admin = await createAdminClient();
    const { count: all } = await admin
      .from("audit_logs")
      .select("id", { count: "exact", head: true })
      .like("action", "backup.import%");
    backupImports = all ?? 0;

    const { count: failed } = await admin
      .from("audit_logs")
      .select("id", { count: "exact", head: true })
      .eq("action", "backup.import_failed");
    backupImportsFailed = failed ?? 0;

    const { count: completed } = await admin
      .from("audit_logs")
      .select("id", { count: "exact", head: true })
      .eq("action", "backup.import_completed");
    backupImportsCompleted = completed ?? 0;
  } catch {
    // audit_logs may not exist or have no data
  }

  return {
    totalUsers,
    totalProfiles,
    totalOrganizations,
    onboardedOrganizations,
    incompleteOnboarding,
    totalBranches,
    totalProducts,
    totalCustomers,
    totalInvoices,
    organizationsToday,
    organizations7d,
    organizations30d,
    backupImports,
    backupImportsFailed,
    backupImportsCompleted,
  };
}

export async function getPlatformTenants(): Promise<PlatformTenant[]> {
  await requirePlatformAdmin();
  const admin = await createAdminClient();

  const { data: orgs } = await admin
    .from("organizations")
    .select("id, name, owner_name, email, created_at, onboarding_completed")
    .order("created_at", { ascending: false })
    .limit(100);

  if (!orgs) return [];

  const orgRows = orgs as { id: string; name: string; email: string | null; owner_name: string | null; created_at: string | null; onboarding_completed: boolean }[];
  const tenants: PlatformTenant[] = await Promise.all(
    orgRows.map(async (org) => {
      const [branchCount, productCount, invoiceCount] = await Promise.all([
        safeCount("branches", "id", { organization_id: org.id }),
        safeCount("products", "id", { organization_id: org.id }),
        safeCount("invoices", "id", { organization_id: org.id }),
      ]);
      return {
        id: org.id,
        name: org.name,
        ownerEmail: org.email ?? null,
        ownerName: org.owner_name ?? null,
        created_at: org.created_at,
        onboardingCompleted: !!org.onboarding_completed,
        branchCount,
        productCount,
        invoiceCount,
      };
    }),
  );

  return tenants;
}

export async function getPlatformRecentActivity(limit = 30): Promise<PlatformActivity[]> {
  await requirePlatformAdmin();
  const admin = await createAdminClient();

  const { data: logs } = await admin
    .from("audit_logs")
    .select("organization_id, actor_id, action, created_at, metadata")
    .in("action", [
      "onboarding.completed",
      "backup.import_started",
      "backup.import_completed",
      "backup.import_failed",
      "factory_reset.executed",
      "settings.updated",
    ])
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!logs) return [];

  type LogRow = { organization_id: string | null; action: string; created_at: string | null; metadata: unknown };
  const logRows = logs as LogRow[];

  // Resolve org names
  const orgIds = [...new Set(logRows.map((l) => l.organization_id).filter(Boolean))];
  let orgNames = new Map<string, string>();
  if (orgIds.length > 0) {
    const { data: orgs } = await admin
      .from("organizations")
      .select("id, name")
      .in("id", orgIds);
    if (orgs) {
      const orgRows = orgs as { id: string; name: string }[];
      orgNames = new Map(orgRows.map((o) => [o.id, o.name]));
    }
  }

  return logRows.map((l) => ({
    orgName: orgNames.get(l.organization_id ?? "") ?? null,
    action: l.action,
    timestamp: l.created_at,
    metadata: l.metadata as Record<string, unknown> | null,
  }));
}

export async function getPlatformSettingsMap(): Promise<Record<string, unknown>> {
  await requirePlatformAdmin();
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("platform_settings")
    .select("key, value");

  const map: Record<string, unknown> = {};
  if (rows) {
    for (const row of rows) {
      map[row.key] = row.value;
    }
  }
  return map;
}
