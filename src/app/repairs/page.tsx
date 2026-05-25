import Link from "next/link";
import { redirect } from "next/navigation";
import { Wrench, Layers, AlertCircle, CalendarCheck, Coins, Plus, Eye } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { StatCard } from "@/components/ui/stat-card";
import { getCurrentContext } from "@/lib/auth/session";
import { canCreateRepairs } from "@/lib/permissions";
import { listRepairs, getRepairsStats } from "@/lib/data/repairs";
import { listCustomers } from "@/lib/data/customers";
import { env } from "@/lib/env";
import { formatCurrency, formatNumber } from "@/lib/formatters";
import { RepairForm } from "./repair-form";

type SearchParams = {
  q?: string;
  status?: string;
  from?: string;
  to?: string;
  add?: string;
  edit?: string;
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

  const showIntake = params.add === "1";
  const editing = params.edit ? repairs.find((r) => r.id === params.edit) : undefined;
  const showModal = showIntake || Boolean(editing);

  return (
    <AppShell pageTitle="Repairs">
      {/* Dynamic Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
          <form method="get" className="flex flex-wrap items-end gap-3 text-xs font-bold text-slate-700">
            <div className="w-full sm:max-w-xs">
              <label className="mb-1 block text-slate-500">Search</label>
              <input
                type="text"
                name="q"
                defaultValue={params.q ?? ""}
                placeholder="Search job no, model, serial..."
                className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none transition focus:border-blue-600"
              />
            </div>

            <div>
              <label className="mb-1 block text-slate-500">Status</label>
              <select
                name="status"
                defaultValue={params.status ?? ""}
                className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none transition focus:border-blue-600"
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

            <div className="flex gap-2">
              <div>
                <label className="mb-1 block text-slate-500">From</label>
                <input
                  type="date"
                  name="from"
                  defaultValue={params.from ?? ""}
                  className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-slate-500">To</label>
                <input
                  type="date"
                  name="to"
                  defaultValue={params.to ?? ""}
                  className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none"
                />
              </div>
            </div>

            <div className="flex gap-2">
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
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <AlertCircle className="size-10 text-slate-300" />
            <h3 className="mt-2 text-sm font-bold text-slate-800">No repairs found</h3>
            <p className="mt-1 text-xs text-slate-500">Try adjusting your filters or record a new intake.</p>
          </div>
        ) : (
          <div>
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-sm min-w-[900px]">
                <thead className="border-b border-slate-200 bg-slate-50/50 text-xs font-bold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Job No</th>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">Device & Fault</th>
                    <th className="px-4 py-3 text-right">Estimate</th>
                    <th className="px-4 py-3 text-right">Advance Paid</th>
                    <th className="px-4 py-3 text-right">Balance Due</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Intake Date</th>
                    <th className="px-4 py-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {repairs.map((r) => {
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
            <div className="block md:hidden divide-y divide-slate-100 p-4 space-y-4">
              {repairs.map((r) => {
                const balance = Math.max(r.estimated_cost - r.advance_paid, 0);

                return (
                  <div key={r.id} className="pt-4 first:pt-0 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-black text-slate-900">{r.job_no}</span>
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
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
                    </div>

                    <div>
                      <h4 className="text-sm font-semibold text-slate-800">{r.customer_name}</h4>
                      {r.customer_phone && <p className="text-xs text-slate-500">{r.customer_phone}</p>}
                    </div>

                    <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3 text-xs space-y-1.5">
                      <p>
                        <span className="font-bold text-slate-600">Device:</span> {r.device_type} {r.device_model && `(${r.device_model})`}
                      </p>
                      <p className="text-slate-500">
                        <span className="font-bold text-slate-600">Fault:</span> {r.problem_description}
                      </p>
                      <div className="grid grid-cols-3 gap-2 border-t border-slate-100 pt-2 mt-2 font-bold">
                        <div>
                          <p className="text-[10px] text-slate-400">Est. Cost</p>
                          <p className="text-slate-700">{formatCurrency(r.estimated_cost, currency)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-400">Paid Adv</p>
                          <p className="text-slate-500">{formatCurrency(r.advance_paid, currency)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-400">Bal Due</p>
                          <p className="text-rose-700">{formatCurrency(balance, currency)}</p>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Link
                        href={`/repairs/${r.id}`}
                        className="flex-1 inline-flex h-9 items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:bg-slate-50"
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
    </AppShell>
  );
}
