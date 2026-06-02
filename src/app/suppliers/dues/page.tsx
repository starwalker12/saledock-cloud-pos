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

export default async function SupplierDuesPage() {
  if (!env.isSupabaseConfigured) redirect("/login");

  const { user, profile, organization } = await getCurrentContext();
  if (!user) redirect("/login");
  if (!profile?.organization_id) redirect("/setup");

  if (!canManageSupplierPurchases(profile?.role)) {
    redirect("/dashboard");
  }

  const orgId = profile.organization_id;
  const currency = organization?.currency_code ?? "PKR";

  const suppliers = await listSuppliersWithBalances(orgId);

  const dueSuppliers = suppliers
    .filter((s) => s.outstanding_balance > 0)
    .sort((a, b) => b.outstanding_balance - a.outstanding_balance);

  const totalOwed = dueSuppliers.reduce((s, x) => s + x.outstanding_balance, 0);

  return (
    <AppShell pageTitle="Supplier Dues">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
          <div className="overflow-x-auto p-5 sm:p-6">
            <table className="w-full min-w-[600px] text-left text-sm">
              <thead className="border-b border-slate-200 text-xs font-bold uppercase tracking-wide text-slate-500 dark:border-slate-800">
                <tr>
                  <th className="px-3 py-3">Supplier</th>
                  <th className="px-3 py-3">Phone</th>
                  <th className="px-3 py-3 text-right">Outstanding</th>
                  <th className="px-3 py-3 text-right" />
                </tr>
              </thead>
              <tbody>
                {dueSuppliers.map((s) => (
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
        )}
      </div>
    </AppShell>
  );
}
