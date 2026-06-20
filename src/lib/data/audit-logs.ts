import "server-only";
import { createClient } from "@/lib/supabase/server";
import { escapeLike } from "@/lib/security/sanitize";
import { getKarachiDayEndIso, getKarachiDayStartIso } from "@/lib/datetime";

export type AuditLogRow = {
  id: string;
  organization_id: string;
  branch_id: string | null;
  actor_id: string | null;
  actor_name: string | null;
  module: string;
  action: string;
  details: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type AuditLogFilters = {
  search?: string;
  module?: string;
  action?: string;
  startDate?: string;
  endDate?: string;
  actorId?: string;
  limit?: number;
  before?: string; // cursor: ISO timestamp for "load more"
};

export async function listAuditLogs(
  organizationId: string,
  filters?: AuditLogFilters
): Promise<{ logs: AuditLogRow[]; hasMore: boolean }> {
  const supabase = await createClient();
  const limit = Math.min(filters?.limit ?? 50, 100);

  let query = supabase
    .from("audit_logs")
    .select(`
      *,
      profiles:actor_id (full_name)
    `)
    .eq("organization_id", organizationId);

  if (filters?.search) {
    const term = `%${escapeLike(filters.search)}%`;
    query = query.or(`details.ilike.${term},action.ilike.${term},module.ilike.${term}`);
  }

  if (filters?.module) {
    query = query.eq("module", filters.module);
  }

  if (filters?.action) {
    query = query.eq("action", filters.action);
  }

  if (filters?.actorId) {
    query = query.eq("actor_id", filters.actorId);
  }

  if (filters?.startDate) {
    query = query.gte("created_at", getKarachiDayStartIso(filters.startDate));
  }
  if (filters?.endDate) {
    query = query.lte("created_at", getKarachiDayEndIso(filters.endDate));
  }

  if (filters?.before) {
    query = query.lt("created_at", filters.before);
  }

  // Fetch one extra to determine hasMore
  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(limit + 1);

  if (error) throw new Error(error.message);

  const rows = data ?? [];
  const hasMore = rows.length > limit;
  const trimmed = hasMore ? rows.slice(0, limit) : rows;

  const logs: AuditLogRow[] = trimmed.map((r) => {
    const prof = r.profiles as { full_name?: string } | { full_name?: string }[] | null;
    const actorName = Array.isArray(prof) ? prof[0]?.full_name ?? null : prof?.full_name ?? null;

    return {
      id: r.id,
      organization_id: r.organization_id,
      branch_id: r.branch_id,
      actor_id: r.actor_id,
      actor_name: actorName,
      module: r.module,
      action: r.action,
      details: r.details,
      metadata: (r.metadata ?? {}) as Record<string, unknown>,
      created_at: r.created_at,
    };
  });

  return { logs, hasMore };
}

export async function getAuditModules(organizationId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("audit_logs")
    .select("module")
    .eq("organization_id", organizationId);

  if (error) throw new Error(error.message);

  const unique = [...new Set((data ?? []).map((r) => r.module))].sort();
  return unique;
}

export type AuditActor = {
  id: string;
  full_name: string;
};

export async function getAuditActors(organizationId: string): Promise<AuditActor[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("audit_logs")
    .select("actor_id, profiles:actor_id (id, full_name)")
    .eq("organization_id", organizationId);

  if (error) throw new Error(error.message);

  const actorMap = new Map<string, string>();
  for (const r of data ?? []) {
    if (!r.actor_id) continue;
    const prof = r.profiles as { id?: string; full_name?: string } | { id?: string; full_name?: string }[] | null;
    const name = Array.isArray(prof) ? prof[0]?.full_name : prof?.full_name;
    if (name && !actorMap.has(r.actor_id)) {
      actorMap.set(r.actor_id, name);
    }
  }

  return Array.from(actorMap.entries())
    .map(([id, full_name]) => ({ id, full_name }))
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
}
