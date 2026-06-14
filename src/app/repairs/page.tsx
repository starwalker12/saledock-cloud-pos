import Link from "next/link";
import { redirect } from "next/navigation";
import { Wrench, Layers, CalendarCheck, Coins, Plus, Eye } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { getCurrentContext } from "@/lib/auth/session";
import { canCreateRepairs } from "@/lib/permissions";
import { listRepairs, getRepairsStats } from "@/lib/data/repairs";
import { listCustomers } from "@/lib/data/customers";
import { env } from "@/lib/env";
import { formatCurrency, formatNumber } from "@/lib/formatters";
import { RepairForm } from "./repair-form";
import { sortData } from "@/lib/sort";
import { SortableHeader } from "@/components/ui/sortable-header";

type SearchParams = {
  q?: string;
  status?: string;
  from?: string;
  to?: string;
  add?: string;
  edit?: string;
  sort?: string;
  dir?: string;
};

const STATUS_LABELS: Record<string, string> = {
  received: "Received",
  waiting_for_parts: "Waiting for Parts",
  in_progress: "In Progress",
  completed: "Ready for Delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-PK", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

export default async function RepairsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  if (!env.isSupabaseConfigured) redirect("/login");

  const { user, profile, organization } = await getCurrentContext();
  if (!user) redirect("/login");
  if (!profile?.organization_id) redirect("/setup");

  const orgId = profile.organization_id;
  const params = await searchParams;
  const canWrite = canCreateRepairs(profile.role);
  const currency = organization?.currency_code ?? "PKR";

  // Build filter payload
  const filters = {
    status: params.status,
    search: params.q,
    startDate: params.from,
    endDate: params.to,
  };

  const [stats, repairs, customers] = await Promise.all([
    getRepairsStats(orgId),
    listRepairs(orgId, filters),
    listCustomers(orgId),
  ]);

  const sort = params.sort;
  const dir = params.dir === "desc" ? "desc" : "asc";

  const repairsWithBalance = repairs.map((r) => ({
    ...r,
    balance_due: Math.max(r.estimated_cost - r.advance_paid, 0),
  }));

  const sortedRepairs = sortData(repairsWithBalance, sort || "created_at", sort ? dir : "desc", {
    job_no: "natural",
    customer_name: "string",
    estimated_cost: "number",
    advance_paid: "number",
    balance_due: "number",
    status: "string",
    created_at: "date",
  });

  const showIntake = params.add === "1";
  const editing = params.edit ? sortedRepairs.find((r) => r.id === params.edit) : undefined;
  const showModal = showIntake || Boolean(editing);

  return (
    <AppShell pageTitle="Repairs">
      {/* Dynamic Summary Cards */}
      <div className="grid grid-cols-2 gap-2 md:gap-4 xl:grid-cols-4">
        <StatCard
          label="Open repair jobs"
          value={formatNumber(stats.openCount)}
          detail="In-take, progress, or waiting parts."
          icon={<Wrench className="size-5" />}
        />
        <StatCard
          label="Ready for delivery"
          value={formatNumber(stats.readyCount)}
          detail="Repair completed successfully."
          icon={<CalendarCheck className="size-5" />}
        />
        <StatCard
          label="Delivered (this month)"
          value={formatNumber(stats.deliveredThisMonth)}
          detail="Successfully returned to customer."
          icon={<Layers className="size-5" />}
        />
        <StatCard
          label="Total cash advances"
          value={formatCurrency(stats.totalAdvances, currency)}
          detail="Advance payments collected."
          icon={<Coins className="size-5" />}
        />
      </div>

      {/* Repairs Table / Card Area */}
      <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-black text-slate-950">Active Repairs</h2>
              <p className="text-xs text-slate-500">Track faults, advances, and timeline history.</p>
            </div>
            {canWrite && (
              <Link
                href="/repairs?add=1"
                className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-blue-700 px-4 text-sm font-bold text-white hover:bg-blue-800 transition"
              >
                <Plus className="size-4" /> Intake Repair
              </Link>
            )}
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="border-b border-slate-100 bg-slate-50/50 p-4">
          {/* Mobile Filter form */}
          <form method="get" className="rounded-xl border border-slate-200 bg-[#fff] p-3 md:hidden dark:border-slate-800 dark:bg-slate-950" action="/repairs">
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <label className="block min-w-0">
                <span className="sr-only">Search repairs</span>
                <input
                  type="text"
                  name="q"
                  defaultValue={params.q ?? ""}
                  placeholder="Search job no, model, serial..."
                  className="h-10 w-full rounded-lg border border-slate-200 bg-[#fff] px-3 text-sm outline-none focus:border-blue-600 dark:border-slate-800 dark:bg-slate-950"
                />
              </label>
              <button type="submit" className="h-10 rounded-lg bg-slate-900 px-3 text-sm font-bold text-white dark:bg-slate-100 dark:text-slate-900 cursor-pointer">
                Apply
              </button>
            </div>

            <details open={Boolean(params.status || params.from || params.to)} className="mt-2 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-900">
              <summary className="cursor-pointer text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-400 select-none">
                Filters
              </summary>
              <div className="mt-3 grid gap-3">
                <label className="block min-w-0">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status</span>
                  <select
                    name="status"
                    defaultValue={params.status ?? ""}
                    className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-[#fff] px-3 text-sm outline-none focus:border-blue-600 dark:border-slate-800 dark:bg-slate-950"
                  >
                    <option value="">All statuses</option>
                    <option value="received">Received</option>
                    <option value="waiting_for_parts">Waiting for parts</option>
                    <option value="in_progress">In Progress</option>
                    <option value="completed">Ready for delivery</option>
                    <option value="delivered">Delivered</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
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

            {(params.q || params.status || params.from || params.to) && (
              <Link href="/repairs" className="mt-2 inline-flex min-h-9 items-center text-xs font-semibold text-slate-600 underline dark:text-slate-400">
                Reset filters
              </Link>
            )}
          </form>

          {/* Desktop Filter form */}
          <form method="get" className="hidden md:grid md:gap-3 md:grid-cols-2 lg:flex lg:flex-wrap lg:items-end" action="/repairs">
            <div className="min-w-0 sm:col-span-2 lg:w-full lg:max-w-xs">
              <label className="mb-1 block text-slate-500 text-xs font-semibold uppercase tracking-wide">Search</label>
              <input
                type="text"
                name="q"
                defaultValue={params.q ?? ""}
                placeholder="Search job no, model, serial..."
                className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none transition focus:border-blue-600"
              />
            </div>

            <div className="min-w-0">
              <label className="mb-1 block text-slate-500 text-xs font-semibold uppercase tracking-wide">Status</label>
              <select
                name="status"
                defaultValue={params.status ?? ""}
                className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none transition focus:border-blue-600 lg:w-auto"
              >
                <option value="">All statuses</option>
                <option value="received">Received</option>
                <option value="waiting_for_parts">Waiting for parts</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Ready for delivery</option>
                <option value="delivered">Delivered</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

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

            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                className="h-9 rounded-lg bg-slate-900 px-4 font-bold text-white hover:bg-slate-800 transition"
              >
                Filter
              </button>
              {(params.q || params.status || params.from || params.to) && (
                <Link
                  href="/repairs"
                  className="inline-flex h-9 items-center rounded-lg border border-slate-200 bg-white px-3 text-slate-600 hover:bg-slate-50 transition"
                >
                  Clear
                </Link>
              )}
            </div>
          </form>
        </div>

        {/* Repairs list rendering */}
        {repairs.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="No repairs found"
              description={
                (params.q || params.status || params.from || params.to)
                  ? "No repairs matched your search query or filters. Try adjusting filters."
                  : "Track device repairs by recording a new intake ticket."
              }
              searchQuery={params.q}
              resetHref={(params.q || params.status || params.from || params.to) ? "/repairs" : undefined}
              actionHref={canWrite && !(params.q || params.status || params.from || params.to) ? "/repairs?add=1" : undefined}
              actionLabel={canWrite && !(params.q || params.status || params.from || params.to) ? "Intake Repair" : undefined}
              type={(params.q || params.status || params.from || params.to) ? "search" : "empty"}
            />
          </div>
        ) : (
          <div>
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-sm min-w-[900px]">
                <thead className="border-b border-slate-200 bg-slate-50/50 text-xs font-bold uppercase tracking-wide text-slate-500">
                  <tr>
                    <SortableHeader label="Job No" columnKey="job_no" currentSortKey={sort} direction={dir} currentParams={params} />
                    <SortableHeader label="Customer" columnKey="customer_name" currentSortKey={sort} direction={dir} currentParams={params} />
                    <th className="px-4 py-3 select-none border-b border-slate-200 dark:border-white/[0.07] font-bold uppercase text-slate-500">Device & Fault</th>
                    <SortableHeader label="Estimate" columnKey="estimated_cost" align="right" currentSortKey={sort} direction={dir} currentParams={params} />
                    <SortableHeader label="Advance Paid" columnKey="advance_paid" align="right" currentSortKey={sort} direction={dir} currentParams={params} />
                    <SortableHeader label="Balance Due" columnKey="balance_due" align="right" currentSortKey={sort} direction={dir} currentParams={params} />
                    <SortableHeader label="Status" columnKey="status" currentSortKey={sort} direction={dir} currentParams={params} />
                    <SortableHeader label="Intake Date" columnKey="created_at" currentSortKey={sort} direction={dir} currentParams={params} />
                    <th className="px-4 py-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRepairs.map((r) => {
                    const balance = Math.max(r.estimated_cost - r.advance_paid, 0);

                    return (
                      <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="px-4 py-3 font-bold text-slate-900 whitespace-nowrap">{r.job_no}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <p className="font-semibold text-slate-800">{r.customer_name}</p>
                          {r.customer_phone && <p className="text-xs text-slate-500">{r.customer_phone}</p>}
                        </td>
                        <td className="px-4 py-3 max-w-[220px]">
                          <span className="font-semibold text-slate-800">{r.device_type}</span>
                          {r.device_model && <span className="text-xs text-slate-500 ml-1">({r.device_model})</span>}
                          <p className="text-xs text-slate-500 truncate" title={r.problem_description}>{r.problem_description}</p>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatCurrency(r.estimated_cost, currency)}</td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-700">{formatCurrency(r.advance_paid, currency)}</td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatCurrency(balance, currency)}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${
                            r.status === "delivered"
                              ? "bg-emerald-50 text-emerald-700"
                              : r.status === "completed"
                              ? "bg-blue-50 text-blue-700"
                              : r.status === "cancelled"
                              ? "bg-rose-50 text-rose-700"
                              : "bg-amber-50 text-amber-700"
                          }`}>
                            {STATUS_LABELS[r.status] || r.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{fmtDate(r.created_at)}</td>
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          <div className="flex justify-center gap-1.5">
                            <Link
                              href={`/repairs/${r.id}`}
                              className="inline-flex size-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition"
                              title="View detail / history"
                            >
                              <Eye className="size-4" />
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card List View */}
            <div className="block md:hidden p-4 space-y-3">
              {sortedRepairs.map((r) => {
                const balance = Math.max(r.estimated_cost - r.advance_paid, 0);

                return (
                  <div key={r.id} className="rounded-2xl border border-slate-200 bg-[#fff] p-4 shadow-sm space-y-3 dark:border-slate-800 dark:bg-slate-900">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-black text-slate-900 dark:text-slate-50">{r.job_no}</span>
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                        r.status === "delivered"
                          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                          : r.status === "completed"
                          ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                          : r.status === "cancelled"
                          ? "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
                          : "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                      }`}>
                        {STATUS_LABELS[r.status] || r.status}
                      </span>
                    </div>

                    <div>
                      <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">{r.customer_name}</h4>
                      {r.customer_phone && <p className="text-xs text-slate-500 dark:text-slate-400">{r.customer_phone}</p>}
                    </div>

                    <div className="rounded-xl border border-slate-100 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-950/40 p-3 text-xs space-y-1.5">
                      <p>
                        <span className="font-bold text-slate-600 dark:text-slate-400">Device:</span> {r.device_type} {r.device_model && `(${r.device_model})`}
                      </p>
                      <p className="text-slate-500 dark:text-slate-400">
                        <span className="font-bold text-slate-600 dark:text-slate-400">Fault:</span> {r.problem_description}
                      </p>
                      <div className="grid gap-2 border-t border-slate-100 dark:border-slate-800 pt-2 mt-2 font-bold min-[380px]:grid-cols-3">
                        <div>
                          <p className="text-[10px] text-slate-400">Est. Cost</p>
                          <p className="text-slate-700 dark:text-slate-300">{formatCurrency(r.estimated_cost, currency)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-400">Paid Adv</p>
                          <p className="text-slate-500 dark:text-slate-400">{formatCurrency(r.advance_paid, currency)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-400">Bal Due</p>
                          <p className="text-rose-700 dark:text-rose-400">{formatCurrency(balance, currency)}</p>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Link
                        href={`/repairs/${r.id}`}
                        className="flex-1 inline-flex h-9 items-center justify-center gap-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        <Eye className="size-3.5" /> View Workflow & Receipts
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Intake / Edit Modal */}
      {showModal && (
        <RepairForm
          customers={customers}
          repair={editing}
          onClose={async () => {
            "use server";
            redirect("/repairs");
          }}
        />
      )}
      <div className="h-20 md:hidden" />
    </AppShell>
  );
}
