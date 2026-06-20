import Link from "next/link";
import { redirect } from "next/navigation";
import { ScrollText, AlertCircle, ChevronDown, User, Clock } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { getCurrentContext } from "@/lib/auth/session";
import { canViewAuditLog } from "@/lib/permissions";
import { listAuditLogs, getAuditModules, getAuditActors } from "@/lib/data/audit-logs";
import { env } from "@/lib/env";
import { sortData } from "@/lib/sort";
import { SortableHeader } from "@/components/ui/sortable-header";
import { AppSelect } from "@/components/ui/app-select";

type SearchParams = {
  q?: string;
  module?: string;
  action?: string;
  from?: string;
  to?: string;
  actor?: string;
  limit?: string;
  before?: string;
  sort?: string;
  dir?: string;
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

  const sort = params.sort;
  const dir = params.dir === "desc" ? "desc" : "asc";

  const sortedLogs = sortData(logs, sort || "created_at", sort ? dir : "desc", {
    created_at: "date",
    actor_name: "string",
    module: "string",
    action: "string",
    details: "string",
  });

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
  const moduleOptions = [
    { value: "", label: "All modules" },
    ...modules.map((m) => ({ value: m, label: fmtModule(m) })),
  ];
  const actorOptions = [
    { value: "", label: "All users" },
    ...actors.map((a) => ({ value: a.id, label: a.full_name })),
  ];

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
          {/* Mobile Filter form */}
          <form method="get" className="rounded-xl border border-slate-200 bg-[#fff] p-3 md:hidden dark:border-slate-800 dark:bg-slate-950" action="/audit-log">
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <label className="block min-w-0">
                <span className="sr-only">Search logs</span>
                <input
                  type="text"
                  name="q"
                  defaultValue={params.q ?? ""}
                  placeholder="Search details, actions…"
                  className="h-10 w-full rounded-lg border border-slate-200 bg-[#fff] px-3 text-sm outline-none focus:border-blue-600 dark:border-slate-800 dark:bg-slate-950"
                />
              </label>
              <button type="submit" className="h-10 rounded-lg bg-slate-900 px-3 text-sm font-bold text-white dark:bg-slate-100 dark:text-slate-900 cursor-pointer">
                Apply
              </button>
            </div>

            <details open={Boolean(params.module || params.actor || params.from || params.to)} className="mt-2 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-900">
              <summary className="cursor-pointer text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-400 select-none">
                Filters
              </summary>
              <div className="mt-3 grid gap-3">
                <label className="block min-w-0">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Module</span>
                  <AppSelect
                    name="module"
                    defaultValue={params.module ?? ""}
                    options={moduleOptions}
                    ariaLabel="Module"
                    searchable={modules.length > 8}
                    className="mt-1"
                  />
                </label>

                <label className="block min-w-0">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">User</span>
                  <AppSelect
                    name="actor"
                    defaultValue={params.actor ?? ""}
                    options={actorOptions}
                    ariaLabel="User"
                    searchable={actors.length > 8}
                    className="mt-1"
                  />
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <label className="block min-w-0">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">From</span>
                    <input
                      type="date"
                      name="from"
                      defaultValue={params.from ?? ""}
                      className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-[#fff] px-3 text-sm outline-none focus:border-blue-600 dark:border-slate-800 dark:bg-slate-950"
                    />
                  </label>
                  <label className="block min-w-0">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">To</span>
                    <input
                      type="date"
                      name="to"
                      defaultValue={params.to ?? ""}
                      className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-[#fff] px-3 text-sm outline-none focus:border-blue-600 dark:border-slate-800 dark:bg-slate-950"
                    />
                  </label>
                </div>
              </div>
            </details>

            {hasActiveFilters && (
              <Link href="/audit-log" className="mt-2 inline-flex min-h-9 items-center text-xs font-semibold text-slate-600 underline dark:text-slate-400">
                Reset filters
              </Link>
            )}
          </form>

          {/* Desktop Filter form */}
          <form
            method="get"
            className="hidden md:grid md:gap-3 md:grid-cols-2 lg:flex lg:flex-wrap lg:items-end"
          >
            {/* Search */}
            <div className="min-w-0 sm:col-span-2 lg:w-full lg:max-w-xs">
              <label className="mb-1 block text-slate-500 text-xs font-semibold uppercase tracking-wide">Search</label>
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
              <label className="mb-1 block text-slate-500 text-xs font-semibold uppercase tracking-wide">Module</label>
              <AppSelect
                name="module"
                defaultValue={params.module ?? ""}
                options={moduleOptions}
                ariaLabel="Module"
                searchable={modules.length > 8}
                buttonClassName="h-9 text-xs"
                className="lg:w-44"
              />
            </div>

            {/* Actor Filter */}
            <div className="min-w-0">
              <label className="mb-1 block text-slate-500 text-xs font-semibold uppercase tracking-wide">User</label>
              <AppSelect
                name="actor"
                defaultValue={params.actor ?? ""}
                options={actorOptions}
                ariaLabel="User"
                searchable={actors.length > 8}
                buttonClassName="h-9 text-xs"
                className="lg:w-44"
              />
            </div>

            {/* Date Range */}
            <div className="grid gap-2 min-[380px]:grid-cols-2 sm:col-span-2 lg:col-span-1">
              <div className="min-w-0">
                <label className="mb-1 block text-slate-500 text-xs font-semibold uppercase tracking-wide">From</label>
                <input
                  type="date"
                  name="from"
                  defaultValue={params.from ?? ""}
                  className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none"
                />
              </div>
              <div className="min-w-0">
                <label className="mb-1 block text-slate-500 text-xs font-semibold uppercase tracking-wide">To</label>
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
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-left text-sm min-w-[860px]">
                <thead className="border-b border-slate-200 bg-slate-50/50 text-xs font-bold uppercase tracking-wide text-slate-500">
                  <tr>
                    <SortableHeader label="Date / Time" columnKey="created_at" currentSortKey={sort} direction={dir} currentParams={params} />
                    <SortableHeader label="User" columnKey="actor_name" currentSortKey={sort} direction={dir} currentParams={params} />
                    <SortableHeader label="Module" columnKey="module" currentSortKey={sort} direction={dir} currentParams={params} />
                    <SortableHeader label="Action" columnKey="action" currentSortKey={sort} direction={dir} currentParams={params} />
                    <SortableHeader label="Details" columnKey="details" currentSortKey={sort} direction={dir} currentParams={params} />
                    <th className="px-4 py-3 select-none border-b border-slate-200 dark:border-white/[0.07] font-bold uppercase text-slate-500">Level</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedLogs.map((log) => {
                    const severity = actionSeverity(log.action);
                    return (
                      <tr key={log.id} className="border-b border-slate-100 hover:bg-slate-50/50 dark:hover:bg-white/[0.03]">
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
            <div className="block lg:hidden divide-y divide-slate-100 p-3 space-y-3 dark:divide-slate-800">
              {sortedLogs.map((log) => {
                const severity = actionSeverity(log.action);
                return (
                  <div key={log.id} className="pt-3 first:pt-0 space-y-2">
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
                      <div className="flex size-6 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
                        <User className="size-3 text-slate-500 dark:text-slate-400" />
                      </div>
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        {log.actor_name ?? "System"}
                      </span>
                      <span className="inline-flex rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                        {fmtModule(log.module)}
                      </span>
                    </div>

                    {/* Action + Details */}
                    <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3 text-xs space-y-1 dark:border-slate-800 dark:bg-slate-900/50">
                      <p className="font-bold text-slate-700 dark:text-slate-300">{fmtAction(log.action)}</p>
                      {log.details && (
                        <p className="text-slate-500 dark:text-slate-400 break-words">{log.details}</p>
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
      <div className="h-20 lg:hidden" />
    </AppShell>
  );
}
