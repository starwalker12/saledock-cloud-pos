import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertCircle, BoxesIcon, Receipt, ShoppingBasket, Truck } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { StatCard } from "@/components/ui/stat-card";
import { getCurrentContext } from "@/lib/auth/session";
import { canManageSupplierPurchases } from "@/lib/permissions";
import {
  listSupplierPurchases,
  listSuppliersWithBalances,
  supplierPurchaseCounts,
  type SupplierPurchaseFilters,
  type SupplierPurchaseStatus,
} from "@/lib/data/supplier-purchases";
import { env } from "@/lib/env";
import { formatCurrency, formatNumber } from "@/lib/formatters";

type SearchParams = {
  q?: string;
  supplier_id?: string;
  status?: string;
  from?: string;
  to?: string;
};

const STATUS_LABEL: Record<SupplierPurchaseStatus, string> = {
  unpaid: "Unpaid",
  partial: "Partial",
  paid: "Paid",
};
const STATUS_CLASS: Record<SupplierPurchaseStatus, string> = {
  unpaid: "bg-rose-100 text-rose-800",
  partial: "bg-amber-100 text-amber-800",
  paid: "bg-emerald-100 text-emerald-800",
};

function fmtDate(d: string) {
  return new Date(`${d}T00:00:00`).toLocaleDateString("en-PK", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

export default async function SupplierPurchasesPage({
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
  const canWrite = canManageSupplierPurchases(profile.role);
  const currency = organization?.currency_code ?? "PKR";

  const statusValue = (params.status ?? "all") as SupplierPurchaseStatus | "all";

  const filters: SupplierPurchaseFilters = {
    search: params.q,
    supplier_id: params.supplier_id,
    status: statusValue === "all" ? undefined : statusValue,
    from: params.from || undefined,
    to: params.to || undefined,
  };

  const [counts, suppliers, purchases] = await Promise.all([
    supplierPurchaseCounts(orgId),
    listSuppliersWithBalances(orgId),
    listSupplierPurchases(orgId, filters),
  ]);

  const supplierDuesTotal = suppliers.reduce((s, x) => s + x.outstanding_balance, 0);
  const dueSupplierCount = suppliers.filter((s) => s.outstanding_balance > 0).length;

  return (
    <AppShell pageTitle="Supplier Purchases">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Purchases this month"
          value={formatCurrency(counts.monthTotal, currency)}
          detail={
            counts.monthCount === 0
              ? "No purchases this month."
              : `${formatNumber(counts.monthCount)} purchase${counts.monthCount === 1 ? "" : "s"} recorded.`
          }
          icon={<ShoppingBasket className="size-5" />}
        />
        <StatCard
          label="Unpaid purchases"
          value={formatCurrency(counts.unpaidTotal, currency)}
          detail={
            counts.unpaidCount === 0
              ? "All purchases settled."
              : `${formatNumber(counts.unpaidCount)} purchase${counts.unpaidCount === 1 ? "" : "s"} with a balance due.`
          }
          icon={<Receipt className="size-5" />}
        />
        <StatCard
          label="Total supplier dues"
          value={formatCurrency(supplierDuesTotal, currency)}
          detail={
            dueSupplierCount === 0
              ? "No supplier currently owed."
              : `${formatNumber(dueSupplierCount)} supplier${dueSupplierCount === 1 ? "" : "s"} owed money.`
          }
          icon={<Truck className="size-5" />}
        />
        <StatCard
          label="Suppliers on file"
          value={formatNumber(suppliers.length)}
          detail="Use the Suppliers tab in Products to add new vendors."
          icon={<BoxesIcon className="size-5" />}
        />
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-base font-black text-slate-950">All purchases</h2>
            <p className="text-xs text-slate-500">
              Stock purchases create stock lots (FIFO) and supplier dues. They are NOT expenses.
            </p>
          </div>
          {canWrite ? (
            <Link
              href="/suppliers/purchases/new"
              className="inline-flex h-10 items-center rounded-lg bg-blue-700 px-4 text-sm font-bold text-white hover:bg-blue-800"
            >
              Record purchase
            </Link>
          ) : (
            <p className="rounded-lg bg-amber-50 px-3 py-1 text-xs font-medium text-amber-900">
              <AlertCircle className="mr-1 inline size-3" />
              Your role ({profile.role}) cannot record purchases.
            </p>
          )}
        </div>

        <div className="space-y-5 p-5 sm:p-6">
          <form className="grid gap-3 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-end" action="/suppliers/purchases">
            <label className="block min-w-0">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Search</span>
              <input
                name="q"
                defaultValue={params.q ?? ""}
                placeholder="Purchase #, ref, notes"
                className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 outline-none focus:border-blue-600 lg:w-56"
              />
            </label>
            <label className="block min-w-0">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Supplier</span>
              <select
                name="supplier_id"
                defaultValue={params.supplier_id ?? ""}
                className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 outline-none focus:border-blue-600 lg:w-56"
              >
                <option value="">All</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.company ? ` · ${s.company}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="block min-w-0">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status</span>
              <select
                name="status"
                defaultValue={statusValue}
                className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 outline-none focus:border-blue-600 lg:w-40"
              >
                <option value="all">All</option>
                <option value="unpaid">Unpaid</option>
                <option value="partial">Partial</option>
                <option value="paid">Paid</option>
              </select>
            </label>
            <label className="block min-w-0">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">From</span>
              <input
                type="date"
                name="from"
                defaultValue={params.from ?? ""}
                className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 outline-none focus:border-blue-600 lg:w-auto"
              />
            </label>
            <label className="block min-w-0">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">To</span>
              <input
                type="date"
                name="to"
                defaultValue={params.to ?? ""}
                className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 outline-none focus:border-blue-600 lg:w-auto"
              />
            </label>
            <button type="submit" className="h-10 rounded-lg bg-slate-900 px-4 text-sm font-bold text-white">
              Apply
            </button>
            {(params.q || params.supplier_id || (params.status && params.status !== "all") || params.from || params.to) && (
              <Link href="/suppliers/purchases" className="self-center text-xs font-semibold text-slate-600 underline">
                Reset
              </Link>
            )}
          </form>

          {purchases.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
              <p className="text-sm font-semibold text-slate-600">No purchases match these filters.</p>
              {canWrite && (
                <p className="mt-1 text-xs text-slate-500">
                  Click <strong>Record purchase</strong> above to add your first stock purchase.
                </p>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="border-b border-slate-200 text-xs font-bold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-3">Date</th>
                    <th className="px-3 py-3">Purchase #</th>
                    <th className="px-3 py-3">Supplier</th>
                    <th className="px-3 py-3 text-right">Total</th>
                    <th className="px-3 py-3 text-right">Paid</th>
                    <th className="px-3 py-3 text-right">Balance</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3 text-right" />
                  </tr>
                </thead>
                <tbody>
                  {purchases.map((p) => (
                    <tr key={p.id} className="border-b border-slate-100 align-top">
                      <td className="px-3 py-3 text-slate-700">{fmtDate(p.purchase_date)}</td>
                      <td className="px-3 py-3 font-bold text-slate-900">{p.purchase_no}</td>
                      <td className="px-3 py-3 text-slate-700">{p.supplier_name ?? "—"}</td>
                      <td className="px-3 py-3 text-right font-bold text-slate-900">
                        {formatCurrency(p.grand_total, currency)}
                      </td>
                      <td className="px-3 py-3 text-right text-emerald-700">{formatCurrency(p.amount_paid, currency)}</td>
                      <td className="px-3 py-3 text-right text-rose-700">{formatCurrency(p.balance_due, currency)}</td>
                      <td className="px-3 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${STATUS_CLASS[p.status]}`}
                        >
                          {STATUS_LABEL[p.status]}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <Link
                          href={`/suppliers/purchases/${p.id}`}
                          className="inline-flex min-h-9 items-center rounded-md border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {suppliers.some((s) => s.outstanding_balance > 0) && (
        <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <h3 className="text-base font-black text-slate-950">Supplier dues</h3>
            <p className="text-xs text-slate-500">Outstanding amounts owed to your suppliers.</p>
          </div>
          <div className="overflow-x-auto p-5 sm:p-6">
            <table className="w-full min-w-[600px] text-left text-sm">
              <thead className="border-b border-slate-200 text-xs font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-3">Supplier</th>
                  <th className="px-3 py-3">Phone</th>
                  <th className="px-3 py-3 text-right">Outstanding</th>
                  <th className="px-3 py-3 text-right" />
                </tr>
              </thead>
              <tbody>
                {suppliers
                  .filter((s) => s.outstanding_balance > 0)
                  .sort((a, b) => b.outstanding_balance - a.outstanding_balance)
                  .map((s) => (
                    <tr key={s.id} className="border-b border-slate-100">
                      <td className="px-3 py-3 font-bold text-slate-900">
                        {s.name}
                        {s.company ? <span className="ml-2 text-xs font-medium text-slate-500">{s.company}</span> : null}
                      </td>
                      <td className="px-3 py-3 text-slate-700">{s.phone ?? "—"}</td>
                      <td className="px-3 py-3 text-right font-bold text-rose-700">
                        {formatCurrency(s.outstanding_balance, currency)}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <Link
                          href={`/suppliers/${s.id}/ledger`}
                          className="inline-flex min-h-9 items-center rounded-md border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          View ledger
                        </Link>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AppShell>
  );
}
