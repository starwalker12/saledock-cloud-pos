import Link from "next/link";
import { redirect } from "next/navigation";
import { Users, AlertCircle, ShieldAlert, BadgeCent } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { StatCard } from "@/components/ui/stat-card";
import { ConfirmForm } from "@/components/ui/confirm-form";
import { getCurrentContext } from "@/lib/auth/session";
import { listCustomers, type CustomerRow } from "@/lib/data/customers";
import { canWriteCatalog } from "@/lib/permissions";
import { env } from "@/lib/env";
import { formatCurrency, formatNumber } from "@/lib/formatters";
import { archiveCustomerAction, restoreCustomerAction } from "./actions";
import { CustomerForm } from "./customer-form";

type SearchParams = {
  q?: string;
  inactive?: string;
  edit?: string;
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

  return (
    <AppShell pageTitle="Customers">
      {/* Dynamic Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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

      <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
          <h2 className="text-base font-black text-slate-950">Customer Management</h2>
          <p className="text-xs text-slate-500">Create, edit, archive profiles and manage active credit lines.</p>
        </div>

        <div className="p-5 sm:p-6">
          {!canWrite && (
            <p className="mb-5 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
              Your role ({profile.role}) can view customers but cannot edit profiles or record settlements.
            </p>
          )}

          {/* Form Block */}
          {canWrite && (
            <details open={isEdit} className="mb-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <summary className="cursor-pointer text-sm font-bold text-slate-800 outline-none">
                {isEdit ? `Edit customer: ${editing!.name}` : "Create a new customer profile"}
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
          <form className="flex flex-wrap items-end gap-3 mb-6" action="/customers">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Search</span>
              <input
                name="q"
                defaultValue={params.q ?? ""}
                placeholder="Name or phone number"
                className="mt-1 h-10 w-64 max-w-full rounded-lg border border-slate-200 px-3 outline-none focus:border-blue-600"
              />
            </label>

            <label className="flex items-center gap-2 pb-2">
              <input
                type="checkbox"
                name="inactive"
                value="1"
                defaultChecked={params.inactive === "1"}
                className="size-4"
              />
              <span className="text-sm font-semibold text-slate-700">Show archived</span>
            </label>

            <button type="submit" className="h-10 rounded-lg bg-slate-900 px-4 text-sm font-bold text-white transition hover:bg-slate-800">
              Apply
            </button>

            {(params.q || params.inactive) && (
              <Link href="/customers" className="pb-2 text-xs font-semibold text-slate-600 underline">
                Reset filters
              </Link>
            )}
          </form>

          {/* Grid Table */}
          {filteredCustomers.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
              <p className="text-sm font-semibold text-slate-600">No customers match these filters.</p>
              {canWrite && (
                <p className="mt-1 text-xs text-slate-500">Create your first profile using the form above.</p>
              )}
            </div>
          ) : (
            <>
              {/* Desktop Table View */}
              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full min-w-[800px] text-left text-sm">
                  <thead className="border-b border-slate-200 text-xs font-bold uppercase tracking-wide text-slate-500 bg-slate-50">
                    <tr>
                      <th className="px-4 py-3">Customer Name</th>
                      <th className="px-4 py-3">Contact</th>
                      <th className="px-4 py-3">Address</th>
                      <th className="px-4 py-3 text-right">Credit Limit</th>
                      <th className="px-4 py-3 text-right">Balance Due</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCustomers.map((c) => (
                      <tr key={c.id} className="border-b border-slate-100 align-middle hover:bg-slate-50/55">
                        <td className="px-4 py-3">
                          <Link href={`/customers/${c.id}`} className="font-bold text-blue-700 hover:underline">
                            {c.name}
                          </Link>
                          {c.notes && <div className="text-[11px] text-slate-400 max-w-[200px] truncate">{c.notes}</div>}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">
                          <div>{c.phone ?? "—"}</div>
                          <div className="text-slate-400">{c.email ?? ""}</div>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-700 truncate max-w-[150px]">{c.address ?? "—"}</td>
                        <td className="px-4 py-3 text-right text-sm text-slate-700">{formatCurrency(c.credit_limit, currency)}</td>
                        <td className={`px-4 py-3 text-right text-sm font-bold ${c.outstanding_balance > 0 ? "text-red-600" : "text-emerald-700"}`}>
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
              <div className="space-y-3 lg:hidden">
                {filteredCustomers.map((c) => (
                  <div key={c.id} className="rounded-xl border border-slate-200 p-4 bg-white shadow-sm hover:border-slate-300">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <Link href={`/customers/${c.id}`} className="font-bold text-blue-700 hover:underline text-base">
                          {c.name}
                        </Link>
                        <div className="text-xs text-slate-500">{c.phone ?? "No phone"}</div>
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                        c.is_archived ? "bg-slate-200 text-slate-700" : "bg-emerald-100 text-emerald-800"
                      }`}>
                        {c.is_archived ? "Archived" : "Active"}
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2 text-sm border-t border-slate-100 pt-3">
                      <div>
                        <span className="text-xs text-slate-400">Balance Due</span>
                        <div className={`font-bold ${c.outstanding_balance > 0 ? "text-red-600" : "text-emerald-700"}`}>
                          {formatCurrency(c.outstanding_balance, currency)}
                        </div>
                      </div>
                      <div>
                        <span className="text-xs text-slate-400">Credit Limit</span>
                        <div className="font-semibold text-slate-700">{formatCurrency(c.credit_limit, currency)}</div>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                      <Link href={`/customers/${c.id}`} className="text-xs font-bold text-blue-700 hover:underline">
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
    <div className="flex items-center justify-end gap-2">
      <Link
        href={`/customers?edit=${c.id}`}
        className="rounded-md border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 bg-white"
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
                className="rounded-md border border-emerald-200 px-3 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 bg-white"
              >
                Restore
              </button>
            </form>
          ) : (
            <ConfirmForm action={archiveCustomerAction} message="Archive this customer? Their sales history will be preserved.">
              <input type="hidden" name="id" value={c.id} />
              <button
                type="submit"
                className="rounded-md border border-red-200 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 bg-white"
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
