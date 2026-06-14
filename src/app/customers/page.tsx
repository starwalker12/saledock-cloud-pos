import Link from "next/link";
import { redirect } from "next/navigation";
import { Users, AlertCircle, ShieldAlert, BadgeCent } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { StatCard } from "@/components/ui/stat-card";
import { ConfirmForm } from "@/components/ui/confirm-form";
import { EmptyState } from "@/components/ui/empty-state";
import { getCurrentContext } from "@/lib/auth/session";
import { listCustomers, type CustomerRow } from "@/lib/data/customers";
import { canWriteCatalog } from "@/lib/permissions";
import { env } from "@/lib/env";
import { formatCurrency, formatNumber } from "@/lib/formatters";
import { archiveCustomerAction, restoreCustomerAction } from "./actions";
import { CustomerForm } from "./customer-form";
import { sortData } from "@/lib/sort";
import { SortableHeader } from "@/components/ui/sortable-header";

type SearchParams = {
  q?: string;
  inactive?: string;
  edit?: string;
  sort?: string;
  dir?: string;
};

export default async function CustomersPage({
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
  const canWrite = canWriteCatalog(profile.role);
  const currency = organization?.currency_code ?? "PKR";

  const allCustomers = await listCustomers(orgId);

  // Apply filters
  const searchQ = (params.q ?? "").trim().toLowerCase();
  const showInactive = params.inactive === "1";

  const filteredCustomers = allCustomers.filter((c) => {
    // Check search term
    const matchesSearch =
      searchQ === "" ||
      c.name.toLowerCase().includes(searchQ) ||
      (c.phone && c.phone.toLowerCase().includes(searchQ));
    
    // Check archive status
    const matchesStatus = showInactive ? true : !c.is_archived;

    return matchesSearch && matchesStatus;
  });

  // Calculate high-level stats
  const totalCount = allCustomers.length;
  const activeCount = allCustomers.filter((c) => !c.is_archived).length;
  const debtorCustomers = allCustomers.filter((c) => c.outstanding_balance > 0);
  const totalDebt = debtorCustomers.reduce((acc, c) => acc + c.outstanding_balance, 0);

  const editing = params.edit ? allCustomers.find((c) => c.id === params.edit) : undefined;
  const isEdit = Boolean(editing);

  const sort = params.sort;
  const dir = params.dir === "desc" ? "desc" : "asc";

  const sortedCustomers = sortData(filteredCustomers, sort || "name", sort ? dir : "asc", {
    name: "string",
    phone: "string",
    email: "string",
    address: "string",
    credit_limit: "number",
    outstanding_balance: "number",
    is_archived: "string",
  });

  return (
    <AppShell pageTitle="Customers">
      {/* Dynamic Stat Cards */}
      <div className="grid grid-cols-2 gap-2 md:gap-4 xl:grid-cols-4">
        <StatCard
          label="Total customers"
          value={formatNumber(totalCount)}
          detail={`${formatNumber(activeCount)} active profiles.`}
          icon={<Users className="size-5" />}
        />
        <StatCard
          label="Active debtors"
          value={formatNumber(debtorCustomers.length)}
          detail="Customers with balance due."
          icon={<AlertCircle className="size-5" />}
        />
        <StatCard
          label="Total outstanding"
          value={formatCurrency(totalDebt, currency)}
          detail="Total outstanding credit."
          icon={<BadgeCent className="size-5" />}
        />
        <StatCard
          label="Credit risk ratio"
          value={totalCount === 0 ? "0%" : `${Math.round((debtorCustomers.length / totalCount) * 100)}%`}
          detail="Percentage of customers owing."
          icon={<ShieldAlert className="size-5" />}
        />
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-[#fff] dark:border-white/[0.07] dark:bg-[#060f20] shadow-sm md:mt-6 md:rounded-2xl">
        <div className="border-b border-slate-200 dark:border-white/[0.07] bg-slate-50 dark:bg-white/[0.02] px-3 py-3 md:px-5 md:py-4">
          <h2 className="text-base font-black text-slate-950 dark:text-slate-55">Customer Management</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">Create, edit, archive profiles and manage active credit lines.</p>
        </div>

        <div className="p-3 md:p-6">
          {!canWrite && (
            <p className="mb-5 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
              Your role ({profile.role}) can view customers but cannot edit profiles or record settlements.
            </p>
          )}

          {/* Form Block */}
          {canWrite && (
            <details open={isEdit} className="mb-4 rounded-xl border border-slate-200 dark:border-white/[0.07] bg-slate-50 dark:bg-white/[0.01] p-3 md:mb-6 md:p-4">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-lg bg-[var(--primary-accent-bg)] px-3 py-2 text-sm font-black text-[var(--primary-accent-text)] outline-none md:min-h-0 md:bg-transparent md:px-0 md:py-0 md:text-slate-800 dark:text-slate-200 [&::-webkit-details-marker]:hidden">
                <span>{isEdit ? `Edit customer: ${editing!.name}` : "Create a new customer profile"}</span>
                <span className="text-[11px] opacity-80 md:hidden">Tap to open</span>
              </summary>
              <div className="mt-4">
                <CustomerForm key={editing?.id ?? "new"} initialValues={editing} canWrite={canWrite} />
                {isEdit && (
                  <Link href="/customers" className="mt-3 inline-block text-xs font-semibold text-slate-600 underline">
                    Cancel edit
                  </Link>
                )}
              </div>
            </details>
          )}

          {/* Search Filters */}
          <form className="mb-4 grid gap-2 rounded-xl border border-slate-200 dark:border-white/[0.07] bg-[#fff] dark:bg-slate-900 md:dark:bg-transparent p-3 md:mb-6 md:flex md:flex-wrap md:items-end md:border-0 md:p-0" action="/customers">
            <div className="grid grid-cols-[1fr_auto] gap-2 md:contents">
              <label className="block min-w-0">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Search</span>
                <input
                  name="q"
                  defaultValue={params.q ?? ""}
                  placeholder="Name or phone number"
                  className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-[#fff] dark:bg-slate-900 dark:border-white/[0.12] dark:text-slate-100 px-3 outline-none focus:border-blue-600 md:w-64"
                />
              </label>
              <button type="submit" className="mt-5 h-10 rounded-lg bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 px-4 text-sm font-bold text-white transition md:mt-0">
                Apply
              </button>
            </div>

            <label className="flex min-h-10 items-center gap-2 rounded-lg bg-slate-50 dark:bg-white/[0.02] px-3 md:bg-transparent md:px-0 md:pb-2 cursor-pointer">
              <input
                type="checkbox"
                name="inactive"
                value="1"
                defaultChecked={params.inactive === "1"}
                className="size-4"
              />
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Show archived</span>
            </label>

            {(params.q || params.inactive) && (
              <Link href="/customers" className="inline-flex min-h-9 items-center text-xs font-semibold text-slate-600 underline md:pb-2">
                Reset filters
              </Link>
            )}
          </form>

          {/* Grid Table */}
          {sortedCustomers.length === 0 ? (
            <EmptyState
              title="No customers found"
              description={
                (params.q || params.inactive)
                  ? "No customers matched your search query or filters. Try adjusting your search query."
                  : "Get started by adding your first customer using the form above."
              }
              searchQuery={params.q}
              resetHref={(params.q || params.inactive) ? "/customers" : undefined}
              type={(params.q || params.inactive) ? "search" : "empty"}
            />
          ) : (
            <>
              {/* Desktop Table View */}
              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full min-w-[800px] text-left text-sm">
                  <thead className="border-b border-slate-200 text-xs font-bold uppercase tracking-wide text-slate-500 bg-slate-50 dark:bg-white/[0.02] dark:text-slate-400">
                    <tr>
                      <SortableHeader label="Customer Name" columnKey="name" currentSortKey={sort} direction={dir} currentParams={params} />
                      <SortableHeader label="Contact" columnKey="phone" currentSortKey={sort} direction={dir} currentParams={params} />
                      <SortableHeader label="Address" columnKey="address" currentSortKey={sort} direction={dir} currentParams={params} />
                      <SortableHeader label="Credit Limit" columnKey="credit_limit" align="right" currentSortKey={sort} direction={dir} currentParams={params} />
                      <SortableHeader label="Balance Due" columnKey="outstanding_balance" align="right" currentSortKey={sort} direction={dir} currentParams={params} />
                      <SortableHeader label="Status" columnKey="is_archived" currentSortKey={sort} direction={dir} currentParams={params} />
                      <th className="px-4 py-3 text-right" />
                    </tr>
                  </thead>
                  <tbody>
                    {sortedCustomers.map((c) => (
                      <tr key={c.id} className="border-b border-slate-100 dark:border-white/[0.05] align-middle hover:bg-slate-50/55 dark:hover:bg-white/[0.02]">
                        <td className="px-4 py-3 font-bold text-slate-900 dark:text-slate-100">
                          <Link href={`/customers/${c.id}`} className="font-bold text-blue-700 dark:text-blue-400 hover:underline">
                            {c.name}
                          </Link>
                          {c.notes && <div className="text-[11px] text-slate-400 dark:text-slate-500 max-w-[200px] truncate">{c.notes}</div>}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">
                          <div>{c.phone ?? "—"}</div>
                          <div className="text-slate-400 dark:text-slate-500">{c.email ?? ""}</div>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300 truncate max-w-[150px]">{c.address ?? "—"}</td>
                        <td className="px-4 py-3 text-right text-sm text-slate-700 dark:text-slate-300">{formatCurrency(c.credit_limit, currency)}</td>
                        <td className={`px-4 py-3 text-right text-sm font-bold ${c.outstanding_balance > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400"}`}>
                          {formatCurrency(c.outstanding_balance, currency)}
                        </td>
                        <td className="px-4 py-3">
                          {c.is_archived ? (
                            <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-700">Archived</span>
                          ) : (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800">Active</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <CustomerActions c={c} canWrite={canWrite} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card View */}
              <div className="space-y-2 lg:hidden">
                {sortedCustomers.map((c) => (
                  <div key={c.id} className="rounded-xl border border-slate-200 dark:border-white/[0.07] bg-[#fff] dark:bg-[#060f20] p-3 shadow-sm hover:border-slate-300 dark:hover:border-slate-700">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link href={`/customers/${c.id}`} className="break-words text-sm font-bold leading-snug text-blue-700 dark:text-blue-400 hover:underline">
                          {c.name}
                        </Link>
                        <div className="text-xs text-slate-500 dark:text-slate-400">{c.phone ?? "No phone"}</div>
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                        c.is_archived ? "bg-slate-200 text-slate-700" : "bg-emerald-100 text-emerald-800"
                      }`}>
                        {c.is_archived ? "Archived" : "Active"}
                      </span>
                    </div>

                    <div className="mt-2 grid grid-cols-2 gap-2 border-t border-slate-100 dark:border-white/[0.05] pt-2 text-sm">
                      <div className="rounded-lg bg-slate-50 dark:bg-white/[0.02] p-2">
                        <span className="text-xs text-slate-400 dark:text-slate-500">Balance Due</span>
                        <div className={`font-bold ${c.outstanding_balance > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400"}`}>
                          {formatCurrency(c.outstanding_balance, currency)}
                        </div>
                      </div>
                      <div className="rounded-lg bg-slate-50 dark:bg-white/[0.02] p-2">
                        <span className="text-xs text-slate-400 dark:text-slate-500">Credit Limit</span>
                        <div className="font-semibold text-slate-700 dark:text-slate-300">{formatCurrency(c.credit_limit, currency)}</div>
                      </div>
                    </div>

                    <div className="mt-2 flex flex-col gap-2 border-t border-slate-100 dark:border-white/[0.05] pt-2">
                      <Link href={`/customers/${c.id}`} className="inline-flex min-h-9 items-center text-xs font-bold text-blue-700 dark:text-blue-400 hover:underline">
                        View profile & ledger →
                      </Link>
                      <CustomerActions c={c} canWrite={canWrite} />
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function CustomerActions({ c, canWrite }: { c: CustomerRow; canWrite: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Link
        href={`/customers?edit=${c.id}`}
        className="inline-flex min-h-9 items-center rounded-md border border-slate-200 dark:border-white/[0.08] bg-[#fff] dark:bg-slate-900 px-3 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.04] cursor-pointer"
      >
        Edit
      </Link>
      {canWrite && (
        <>
          {c.is_archived ? (
            <form action={restoreCustomerAction}>
              <input type="hidden" name="id" value={c.id} />
              <button
                type="submit"
                className="inline-flex min-h-9 items-center rounded-md border border-emerald-200 dark:border-emerald-800/40 bg-[#fff] dark:bg-slate-900 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 cursor-pointer"
              >
                Restore
              </button>
            </form>
          ) : (
            <ConfirmForm action={archiveCustomerAction} message="Archive this customer? Their sales history will be preserved.">
              <input type="hidden" name="id" value={c.id} />
              <button
                type="submit"
                className="inline-flex min-h-9 items-center rounded-md border border-red-200 dark:border-red-800/40 bg-[#fff] dark:bg-slate-900 px-3 py-1 text-xs font-semibold text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 cursor-pointer"
              >
                Archive
              </button>
            </ConfirmForm>
          )}
        </>
      )}
    </div>
  );
}
