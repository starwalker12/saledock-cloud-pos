import { redirect } from "next/navigation";
import Link from "next/link";
import { DollarSign, Truck, Users, Wallet } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { StatCard } from "@/components/ui/stat-card";
import { getCurrentContext } from "@/lib/auth/session";
import { canManageSupplierPurchases } from "@/lib/permissions";
import { listSuppliersWithBalances } from "@/lib/data/supplier-purchases";
import { env } from "@/lib/env";
import { formatCurrency, formatNumber } from "@/lib/formatters";
import { sortData } from "@/lib/sort";
import { SortableHeader } from "@/components/ui/sortable-header";

export default async function SupplierDuesPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; dir?: string }>;
}) {
  if (!env.isSupabaseConfigured) redirect("/login");

  const { user, profile, organization } = await getCurrentContext();
  if (!user) redirect("/login");
  if (!profile?.organization_id) redirect("/setup");

  if (!canManageSupplierPurchases(profile?.role)) {
    redirect("/dashboard");
  }

  const orgId = profile.organization_id;
  const currency = organization?.currency_code ?? "PKR";
  const params = await searchParams;

  const suppliers = await listSuppliersWithBalances(orgId);

  const dueSuppliers = suppliers
    .filter((s) => s.outstanding_balance > 0);

  const sort = params.sort;
  const dir = params.dir === "desc" ? "desc" : "asc";

  const sortedSuppliers = sortData(dueSuppliers, sort || "outstanding_balance", sort ? dir : "desc", {
    name: "string",
    phone: "string",
    outstanding_balance: "number",
  });

  const totalOwed = dueSuppliers.reduce((s, x) => s + x.outstanding_balance, 0);

  return (
    <AppShell pageTitle="Supplier Dues">
      <div className="grid grid-cols-2 gap-2 md:gap-4 xl:grid-cols-4">
        <StatCard
          label="Total supplier dues"
          value={formatCurrency(totalOwed, currency)}
          detail={
            dueSuppliers.length === 0
              ? "No supplier currently owed."
              : `${formatNumber(totalOwed)} owed across ${formatNumber(dueSuppliers.length)} supplier${dueSuppliers.length === 1 ? "" : "s"}.`
          }
          icon={<Truck className="size-5" />}
        />
        <StatCard
          label="Suppliers with dues"
          value={formatNumber(dueSuppliers.length)}
          detail={
            dueSuppliers.length === 0
              ? "All suppliers are settled."
              : `${formatNumber(dueSuppliers.length)} supplier${dueSuppliers.length === 1 ? "" : "s"} have outstanding balances.`
          }
          icon={<Users className="size-5" />}
        />
        <StatCard
          label="Average owed"
          value={formatCurrency(dueSuppliers.length > 0 ? totalOwed / dueSuppliers.length : 0, currency)}
          detail="Average outstanding per supplier."
          icon={<Wallet className="size-5" />}
        />
        <StatCard
          label="Total suppliers on file"
          value={formatNumber(suppliers.length)}
          detail="Use the Suppliers tab in Products to add new vendors."
          icon={<DollarSign className="size-5" />}
        />
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <h2 className="text-base font-black text-slate-950 dark:text-white">Supplier dues</h2>
          <p className="text-xs text-slate-500">Outstanding amounts owed to your suppliers.</p>
        </div>

        {dueSuppliers.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-semibold text-slate-600">No outstanding dues.</p>
            <p className="mt-1 text-xs text-slate-500">All suppliers are currently settled.</p>
          </div>
        ) : (
          <>
          <div className="hidden overflow-x-auto p-5 sm:p-6 md:block">
            <table className="w-full min-w-[600px] text-left text-sm">
              <thead className="border-b border-slate-200 text-xs font-bold uppercase tracking-wide text-slate-500 dark:border-slate-800">
                <tr>
                  <SortableHeader label="Supplier" columnKey="name" currentSortKey={sort} direction={dir} currentParams={params} />
                  <SortableHeader label="Phone" columnKey="phone" currentSortKey={sort} direction={dir} currentParams={params} />
                  <SortableHeader label="Outstanding" columnKey="outstanding_balance" align="right" currentSortKey={sort} direction={dir} currentParams={params} />
                  <th className="px-3 py-3 text-right" />
                </tr>
              </thead>
              <tbody>
                {sortedSuppliers.map((s) => (
                  <tr key={s.id} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="px-3 py-3 font-bold text-slate-900 dark:text-white">
                      {s.name}
                      {s.company ? <span className="ml-2 text-xs font-medium text-slate-500">{s.company}</span> : null}
                    </td>
                    <td className="px-3 py-3 text-slate-700 dark:text-slate-300">{s.phone ?? "—"}</td>
                    <td className="px-3 py-3 text-right font-bold text-rose-700">
                      {formatCurrency(s.outstanding_balance, currency)}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/suppliers/${s.id}/statement`}
                          className="inline-flex min-h-9 items-center rounded-md border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                        >
                          Statement
                        </Link>
                        <Link
                          href={`/suppliers/${s.id}/ledger`}
                          className="inline-flex min-h-9 items-center rounded-md border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                        >
                          View ledger
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-3 p-5 sm:p-6 md:hidden">
            {sortedSuppliers.map((s) => (
              <div key={s.id} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900 dark:text-white">{s.name}</p>
                    {s.company && <p className="text-sm text-slate-500">{s.company}</p>}
                  </div>
                  <span className="shrink-0 text-right font-bold text-rose-700">
                    {formatCurrency(s.outstanding_balance, currency)}
                  </span>
                </div>
                <div className="mt-2 text-sm text-slate-500 dark:text-slate-300">{s.phone ?? "—"}</div>
                <div className="mt-3 flex gap-2">
                  <Link
                    href={`/suppliers/${s.id}/statement`}
                    className="inline-flex min-h-9 items-center rounded-md border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    Statement
                  </Link>
                  <Link
                    href={`/suppliers/${s.id}/ledger`}
                    className="inline-flex min-h-9 items-center rounded-md border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    View ledger
                  </Link>
                </div>
              </div>
            ))}
          </div>
          </>
        )}
      </div>
      <div className="h-20 md:hidden" />
    </AppShell>
  );
}
