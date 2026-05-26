import Link from "next/link";
import { redirect } from "next/navigation";
import { ScrollText, AlertCircle, ChevronDown, User, Clock } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { getCurrentContext } from "@/lib/auth/session";
import { canViewAuditLog } from "@/lib/permissions";
import { listAuditLogs, getAuditModules, getAuditActors } from "@/lib/data/audit-logs";
import { env } from "@/lib/env";

type SearchParams = {
  q?: string;
  module?: string;
  action?: string;
  from?: string;
  to?: string;
  actor?: string;
  limit?: string;
  before?: string;
};

/** Derive a severity/color from the action string */
function actionSeverity(action: string): {
  label: string;
  className: string;
} {
  if (action.includes("delete") || action.includes("deactivat") || action.includes("void") || action.includes("cancel")) {
    return { label: "Warning", className: "bg-amber-50 text-amber-700" };
  }
  if (action.includes("reopen")) {
    return { label: "Caution", className: "bg-rose-50 text-rose-700" };
  }
  if (action.includes("create") || action.includes("invite") || action.includes("checkout") || action.includes("complete")) {
    return { label: "Success", className: "bg-emerald-50 text-emerald-700" };
  }
  return { label: "Info", className: "bg-blue-50 text-blue-700" };
}

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-PK", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-PK", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-PK", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

/** Prettify module name */
function fmtModule(mod: string) {
  return mod
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Prettify action name */
function fmtAction(action: string) {
  return action
    .replace(/\./g, " → ")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Render metadata as key-value pairs */
function MetadataPreview({ metadata }: { metadata: Record<string, unknown> }) {
  const entries = Object.entries(metadata).filter(([, v]) => v !== null && v !== undefined && v !== "");
  if (entries.length === 0) return null;

  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {entries.slice(0, 4).map(([key, val]) => (
        <span
          key={key}
          className="inline-flex rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500"
          title={`${key}: ${String(val)}`}
        >
          {key}: {String(val).length > 24 ? `${String(val).slice(0, 24)}…` : String(val)}
        </span>
      ))}
      {entries.length > 4 && (
        <span className="inline-flex rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">
          +{entries.length - 4} more
        </span>
      )}
    </div>
  );
}

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  if (!env.isSupabaseConfigured) redirect("/login");

  const { user, profile } = await getCurrentContext();
  if (!user) redirect("/login");
  if (!profile?.organization_id) redirect("/setup");

  // Permission check — owner/admin only
  if (!canViewAuditLog(profile.role)) redirect("/dashboard");

  const orgId = profile.organization_id;
  const params = await searchParams;

  const filters = {
    search: params.q,
    module: params.module,
    action: params.action,
    startDate: params.from,
    endDate: params.to,
    actorId: params.actor,
    limit: params.limit ? parseInt(params.limit, 10) : 50,
    before: params.before,
  };

  const [{ logs, hasMore }, modules, actors] = await Promise.all([
    listAuditLogs(orgId, filters),
    getAuditModules(orgId),
    getAuditActors(orgId),
  ]);

  // Build "load more" URL
  const lastLog = logs[logs.length - 1];
  const loadMoreParams = new URLSearchParams();
  if (params.q) loadMoreParams.set("q", params.q);
  if (params.module) loadMoreParams.set("module", params.module);
  if (params.action) loadMoreParams.set("action", params.action);
  if (params.from) loadMoreParams.set("from", params.from);
  if (params.to) loadMoreParams.set("to", params.to);
  if (params.actor) loadMoreParams.set("actor", params.actor);
  if (lastLog) loadMoreParams.set("before", lastLog.created_at);
  const loadMoreHref = `/audit-log?${loadMoreParams.toString()}`;

  const hasActiveFilters = params.q || params.module || params.action || params.from || params.to || params.actor;

  return (
    <AppShell pageTitle="Audit Log">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-indigo-50">
          <ScrollText className="size-5 text-indigo-600" />
        </div>
        <div>
          <h2 className="text-base font-black text-slate-950">System Activity Log</h2>
          <p className="text-xs text-slate-500">
            Track all changes and actions across your organization.
          </p>
        </div>
      </div>

      {/* Main Card */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {/* Filter Toolbar */}
        <div className="border-b border-slate-100 bg-slate-50/50 p-4">
          <form
            method="get"
            className="grid gap-3 text-xs font-bold text-slate-700 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-end"
          >
            {/* Search */}
            <div className="min-w-0 sm:col-span-2 lg:w-full lg:max-w-xs">
              <label className="mb-1 block text-slate-500">Search</label>
              <input
                type="text"
                name="q"
                defaultValue={params.q ?? ""}
                placeholder="Search details, actions…"
                className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none transition focus:border-blue-600"
              />
            </div>

            {/* Module Filter */}
            <div className="min-w-0">
              <label className="mb-1 block text-slate-500">Module</label>
              <select
                name="module"
                defaultValue={params.module ?? ""}
                className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none transition focus:border-blue-600 lg:w-auto"
              >
                <option value="">All modules</option>
                {modules.map((m) => (
                  <option key={m} value={m}>
                    {fmtModule(m)}
                  </option>
                ))}
              </select>
            </div>

            {/* Actor Filter */}
            <div className="min-w-0">
              <label className="mb-1 block text-slate-500">User</label>
              <select
                name="actor"
                defaultValue={params.actor ?? ""}
                className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none transition focus:border-blue-600 lg:w-auto"
              >
                <option value="">All users</option>
                {actors.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.full_name}
                  </option>
                ))}
              </select>
            </div>

            {/* Date Range */}
            <div className="grid gap-2 min-[380px]:grid-cols-2 sm:col-span-2 lg:col-span-1">
              <div className="min-w-0">
                <label className="mb-1 block text-slate-500">From</label>
                <input
                  type="date"
                  name="from"
                  defaultValue={params.from ?? ""}
                  className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none"
                />
              </div>
              <div className="min-w-0">
                <label className="mb-1 block text-slate-500">To</label>
                <input
                  type="date"
                  name="to"
                  defaultValue={params.to ?? ""}
                  className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none"
                />
              </div>
            </div>

            {/* Filter / Clear Buttons */}
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                className="h-9 rounded-lg bg-slate-900 px-4 font-bold text-white hover:bg-slate-800 transition"
              >
                Filter
              </button>
              {hasActiveFilters && (
                <Link
                  href="/audit-log"
                  className="inline-flex h-9 items-center rounded-lg border border-slate-200 bg-white px-3 text-slate-600 hover:bg-slate-50 transition"
                >
                  Clear
                </Link>
              )}
            </div>
          </form>
        </div>

        {/* Results */}
        {logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <AlertCircle className="size-10 text-slate-300" />
            <h3 className="mt-2 text-sm font-bold text-slate-800">No audit logs found</h3>
            <p className="mt-1 text-xs text-slate-500">
              {hasActiveFilters
                ? "Try adjusting your filters to see results."
                : "Audit entries will appear here as actions are performed in the system."}
            </p>
          </div>
        ) : (
          <div>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-sm min-w-[860px]">
                <thead className="border-b border-slate-200 bg-slate-50/50 text-xs font-bold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Date / Time</th>
                    <th className="px-4 py-3">User</th>
                    <th className="px-4 py-3">Module</th>
                    <th className="px-4 py-3">Action</th>
                    <th className="px-4 py-3">Details</th>
                    <th className="px-4 py-3">Level</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => {
                    const severity = actionSeverity(log.action);
                    return (
                      <tr key={log.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-1.5 text-xs text-slate-500">
                            <Clock className="size-3.5 shrink-0" />
                            <span>{fmtDateTime(log.created_at)}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <div className="flex size-6 items-center justify-center rounded-full bg-slate-100">
                              <User className="size-3 text-slate-500" />
                            </div>
                            <span className="text-xs font-semibold text-slate-800">
                              {log.actor_name ?? "System"}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="inline-flex rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">
                            {fmtModule(log.module)}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-xs font-semibold text-slate-700">
                          {fmtAction(log.action)}
                        </td>
                        <td className="px-4 py-3 max-w-[300px]">
                          <p className="text-xs text-slate-600 truncate" title={log.details ?? undefined}>
                            {log.details ?? "—"}
                          </p>
                          <MetadataPreview metadata={log.metadata} />
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${severity.className}`}>
                            {severity.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card List */}
            <div className="block md:hidden divide-y divide-slate-100 p-4 space-y-4">
              {logs.map((log) => {
                const severity = actionSeverity(log.action);
                return (
                  <div key={log.id} className="pt-4 first:pt-0 space-y-2.5">
                    {/* Header: date + severity */}
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-1 text-[11px] text-slate-500">
                        <Clock className="size-3" />
                        {fmtDate(log.created_at)} · {fmtTime(log.created_at)}
                      </span>
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${severity.className}`}>
                        {severity.label}
                      </span>
                    </div>

                    {/* User + Module */}
                    <div className="flex items-center gap-2">
                      <div className="flex size-6 items-center justify-center rounded-full bg-slate-100">
                        <User className="size-3 text-slate-500" />
                      </div>
                      <span className="text-xs font-bold text-slate-800">
                        {log.actor_name ?? "System"}
                      </span>
                      <span className="inline-flex rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">
                        {fmtModule(log.module)}
                      </span>
                    </div>

                    {/* Action + Details */}
                    <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3 text-xs space-y-1">
                      <p className="font-bold text-slate-700">{fmtAction(log.action)}</p>
                      {log.details && (
                        <p className="text-slate-500">{log.details}</p>
                      )}
                      <MetadataPreview metadata={log.metadata} />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Load More */}
            {hasMore && (
              <div className="border-t border-slate-100 p-4 text-center">
                <Link
                  href={loadMoreHref}
                  className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-5 text-sm font-bold text-slate-700 hover:bg-slate-50 transition"
                >
                  <ChevronDown className="size-4" />
                  Load more entries
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
