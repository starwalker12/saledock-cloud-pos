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
import { sortData } from "@/lib/sort";
import { SortableHeader } from "@/components/ui/sortable-header";
import { PurchaseFilterSelect, type PurchaseFilterOption } from "./filter-select";

type SearchParams = {
  q?: string;
  supplier_id?: string;
  status?: string;
  from?: string;
  to?: string;
  sort?: string;
  dir?: string;
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
const FILTER_GROUP_CLASS = "flex min-w-0 flex-col gap-1.5";
const FILTER_LABEL_CLASS = "text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400";
const FILTER_INPUT_CLASS =
  "h-10 w-full rounded-lg border border-slate-200 bg-[#fff] px-3 text-sm text-slate-900 outline-none focus:border-blue-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100";

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

  const sort = params.sort;
  const dir = params.dir === "desc" ? "desc" : "asc";

  const sortedPurchases = sortData(purchases, sort || "purchase_date", sort ? dir : "desc", {
    purchase_date: "date",
    purchase_no: "natural",
    supplier_name: "string",
    grand_total: "number",
    amount_paid: "number",
    balance_due: "number",
    status: "string",
  });

  const supplierDuesTotal = suppliers.reduce((s, x) => s + x.outstanding_balance, 0);
  const dueSupplierCount = suppliers.filter((s) => s.outstanding_balance > 0).length;
  const supplierFilterOptions: PurchaseFilterOption[] = [
    { value: "", label: "All" },
    ...suppliers.map((s) => ({
      value: s.id,
      label: `${s.name}${s.company ? ` · ${s.company}` : ""}`,
    })),
  ];
  const statusFilterOptions: PurchaseFilterOption[] = [
    { value: "all", label: "All" },
    { value: "unpaid", label: "Unpaid" },
    { value: "partial", label: "Partial" },
    { value: "paid", label: "Paid" },
  ];

  return (
    <AppShell pageTitle="Supplier Purchases">
      <div className="grid grid-cols-2 gap-2 md:gap-4 xl:grid-cols-4">
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

      <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-[#fff] shadow-sm dark:border-white/[0.07] dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-white/[0.07]">
          <div>
            <h2 className="text-base font-black text-slate-950 dark:text-white">All purchases</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
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
          {/* Mobile Filter form */}
          <form className="rounded-xl border border-slate-200 bg-[#fff] p-3 md:hidden dark:border-slate-800 dark:bg-slate-950" action="/suppliers/purchases">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
              <label className={FILTER_GROUP_CLASS}>
                <span className={FILTER_LABEL_CLASS}>Search</span>
                <input
                  name="q"
                  defaultValue={params.q ?? ""}
                  placeholder="Purchase #, ref, notes"
                  className={FILTER_INPUT_CLASS}
                />
              </label>
              <button type="submit" className="h-10 rounded-lg bg-slate-900 px-3 text-sm font-bold text-white dark:bg-slate-100 dark:text-slate-900 cursor-pointer">
                Apply
              </button>
            </div>

            <details open={Boolean(params.supplier_id || (params.status && params.status !== "all") || params.from || params.to)} className="mt-2 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-900">
              <summary className="cursor-pointer text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-400 select-none">
                Filters
              </summary>
              <div className="mt-3 grid gap-3">
                <PurchaseFilterSelect
                  name="supplier_id"
                  label="Supplier"
                  defaultValue={params.supplier_id ?? ""}
                  options={supplierFilterOptions}
                />

                <PurchaseFilterSelect
                  name="status"
                  label="Status"
                  defaultValue={statusValue}
                  options={statusFilterOptions}
                />

                <div className="grid grid-cols-2 gap-2">
                  <label className={FILTER_GROUP_CLASS}>
                    <span className={FILTER_LABEL_CLASS}>From</span>
                    <input
                      type="date"
                      name="from"
                      defaultValue={params.from ?? ""}
                      className={FILTER_INPUT_CLASS}
                    />
                  </label>
                  <label className={FILTER_GROUP_CLASS}>
                    <span className={FILTER_LABEL_CLASS}>To</span>
                    <input
                      type="date"
                      name="to"
                      defaultValue={params.to ?? ""}
                      className={FILTER_INPUT_CLASS}
                    />
                  </label>
                </div>
              </div>
            </details>

            {(params.q || params.supplier_id || (params.status && params.status !== "all") || params.from || params.to) && (
              <Link href="/suppliers/purchases" className="mt-2 inline-flex min-h-9 items-center text-xs font-semibold text-slate-600 underline dark:text-slate-400">
                Reset filters
              </Link>
            )}
          </form>

          {/* Desktop Filter form */}
          <form className="hidden md:grid md:grid-cols-2 md:items-end md:gap-4 lg:grid-cols-[minmax(14rem,1fr)_minmax(14rem,1fr)_9rem_10.5rem_10.5rem_auto_auto]" action="/suppliers/purchases">
            <label className={FILTER_GROUP_CLASS}>
              <span className={FILTER_LABEL_CLASS}>Search</span>
              <input
                name="q"
                defaultValue={params.q ?? ""}
                placeholder="Purchase #, ref, notes"
                className={FILTER_INPUT_CLASS}
              />
            </label>
            <PurchaseFilterSelect
              name="supplier_id"
              label="Supplier"
              defaultValue={params.supplier_id ?? ""}
              options={supplierFilterOptions}
            />
            <PurchaseFilterSelect
              name="status"
              label="Status"
              defaultValue={statusValue}
              options={statusFilterOptions}
            />
            <label className={FILTER_GROUP_CLASS}>
              <span className={FILTER_LABEL_CLASS}>From</span>
              <input
                type="date"
                name="from"
                defaultValue={params.from ?? ""}
                className={FILTER_INPUT_CLASS}
              />
            </label>
            <label className={FILTER_GROUP_CLASS}>
              <span className={FILTER_LABEL_CLASS}>To</span>
              <input
                type="date"
                name="to"
                defaultValue={params.to ?? ""}
                className={FILTER_INPUT_CLASS}
              />
            </label>
            <button type="submit" className="h-10 self-end rounded-lg bg-slate-900 px-4 text-sm font-bold text-white dark:bg-slate-100 dark:text-slate-900">
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
            <>
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="border-b border-slate-200 text-xs font-bold uppercase tracking-wide text-slate-500 dark:border-white/[0.07] dark:text-slate-400">
                  <tr>
                    <SortableHeader label="Date" columnKey="purchase_date" currentSortKey={sort} direction={dir} currentParams={params} />
                    <SortableHeader label="Purchase #" columnKey="purchase_no" currentSortKey={sort} direction={dir} currentParams={params} />
                    <SortableHeader label="Supplier" columnKey="supplier_name" currentSortKey={sort} direction={dir} currentParams={params} />
                    <SortableHeader label="Total" columnKey="grand_total" align="right" currentSortKey={sort} direction={dir} currentParams={params} />
                    <SortableHeader label="Paid" columnKey="amount_paid" align="right" currentSortKey={sort} direction={dir} currentParams={params} />
                    <SortableHeader label="Balance" columnKey="balance_due" align="right" currentSortKey={sort} direction={dir} currentParams={params} />
                    <SortableHeader label="Status" columnKey="status" currentSortKey={sort} direction={dir} currentParams={params} />
                    <th className="px-3 py-3 text-right" />
                  </tr>
                </thead>
                <tbody>
                  {sortedPurchases.map((p) => (
                    <tr key={p.id} className="border-b border-slate-100 align-top dark:border-white/[0.06]">
                      <td className="px-3 py-3 text-slate-700 dark:text-slate-300">{fmtDate(p.purchase_date)}</td>
                      <td className="px-3 py-3 font-bold text-slate-900 dark:text-slate-100">{p.purchase_no}</td>
                      <td className="px-3 py-3 text-slate-700 dark:text-slate-300">{p.supplier_name ?? "—"}</td>
                      <td className="px-3 py-3 text-right font-bold text-slate-900 dark:text-slate-100">
                        {formatCurrency(p.grand_total, currency)}
                      </td>
                      <td className="px-3 py-3 text-right text-emerald-700 dark:text-emerald-300">{formatCurrency(p.amount_paid, currency)}</td>
                      <td className="px-3 py-3 text-right text-rose-700 dark:text-rose-300">{formatCurrency(p.balance_due, currency)}</td>
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
                          className="inline-flex min-h-9 items-center rounded-md border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                        >
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:hidden">
              {/* Mobile Sort Controls */}
              <div className="flex flex-nowrap overflow-x-auto items-center gap-2 pb-3 text-xs font-semibold text-slate-500 border-b border-slate-100 dark:border-slate-800 scrollbar-none">
                <span className="shrink-0">Sort by:</span>
                {(
                  [
                    { key: "purchase_date", label: "Date" },
                    { key: "purchase_no", label: "Purchase #" },
                    { key: "supplier_name", label: "Supplier" },
                    { key: "grand_total", label: "Total" },
                    { key: "amount_paid", label: "Paid" },
                    { key: "balance_due", label: "Balance" },
                    { key: "status", label: "Status" },
                  ] as const
                ).map(({ key, label }) => {
                  const isCurrent = sort === key;
                  const activeDir = isCurrent && dir === "asc" ? "desc" : "asc";
                  const newParams = new URLSearchParams();
                  Object.entries(params).forEach(([k, v]) => {
                    if (v != null && v !== "") newParams.set(k, String(v));
                  });
                  newParams.set("sort", key);
                  newParams.set("dir", activeDir);
                  const href = `?${newParams.toString()}`;

                  return (
                    <Link
                      key={key}
                      href={href}
                      className={`shrink-0 rounded-full px-2.5 py-1 transition-colors ${
                        isCurrent
                          ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 font-bold"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                      }`}
                      aria-label={`Sort by ${label} ${isCurrent && dir === "asc" ? "descending" : "ascending"}`}
                    >
                      {label} {isCurrent && (dir === "asc" ? "↑" : "↓")}
                    </Link>
                  );
                })}
              </div>
              {sortedPurchases.map((p) => (
                <div key={p.id} className="rounded-xl border border-slate-200 bg-[#fff] p-4 dark:border-white/[0.07] dark:bg-slate-950">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900 dark:text-slate-100">{p.purchase_no}</p>
                      <p className="text-sm text-slate-500 dark:text-slate-400">{fmtDate(p.purchase_date)}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${STATUS_CLASS[p.status]}`}>
                      {STATUS_LABEL[p.status]}
                    </span>
                  </div>
                  <dl className="mt-3 grid gap-1.5 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-slate-500 dark:text-slate-400">Supplier</dt>
                      <dd className="font-semibold text-slate-700 dark:text-slate-300">{p.supplier_name ?? "—"}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-500 dark:text-slate-400">Total</dt>
                      <dd className="font-bold text-slate-900 dark:text-slate-100">{formatCurrency(p.grand_total, currency)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-500 dark:text-slate-400">Paid</dt>
                      <dd className="font-bold text-emerald-700 dark:text-emerald-300">{formatCurrency(p.amount_paid, currency)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-500 dark:text-slate-400">Balance</dt>
                      <dd className="font-bold text-rose-700 dark:text-rose-300">{formatCurrency(p.balance_due, currency)}</dd>
                    </div>
                  </dl>
                  <div className="mt-3 flex justify-end">
                    <Link
                      href={`/suppliers/purchases/${p.id}`}
                      className="inline-flex min-h-9 items-center rounded-md border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      Open
                    </Link>
                  </div>
                </div>
              ))}
            </div>
            </>
          )}
        </div>
      </div>

      {suppliers.some((s) => s.outstanding_balance > 0) && (
        <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-[#fff] shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <h3 className="text-base font-black text-slate-950">Supplier dues</h3>
            <p className="text-xs text-slate-500">Outstanding amounts owed to your suppliers.</p>
          </div>
          <div className="hidden overflow-x-auto p-5 sm:p-6 lg:block">
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
          <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2 sm:p-6 lg:hidden">
            {suppliers
              .filter((s) => s.outstanding_balance > 0)
              .sort((a, b) => b.outstanding_balance - a.outstanding_balance)
              .map((s) => (
                <div key={s.id} className="rounded-xl border border-slate-200 bg-[#fff] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900">{s.name}</p>
                      {s.company && <p className="text-sm text-slate-500">{s.company}</p>}
                    </div>
                    <span className="shrink-0 text-right font-bold text-rose-700">
                      {formatCurrency(s.outstanding_balance, currency)}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-sm text-slate-500">{s.phone ?? "—"}</span>
                    <Link
                      href={`/suppliers/${s.id}/ledger`}
                      className="inline-flex min-h-9 items-center rounded-md border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      View ledger
                    </Link>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
      <div className="h-20 lg:hidden" />
    </AppShell>
  );
}
