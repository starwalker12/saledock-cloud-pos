import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { getCurrentContext } from "@/lib/auth/session";
import {
  INVOICE_LIST_STATUSES,
  RECORDED_INVOICE_PAYMENT_METHODS,
  listInvoices,
  type InvoiceListFilters,
  type InvoiceListStatus,
  type RecordedInvoicePaymentMethod,
} from "@/lib/data/invoices";
import {
  formatKarachiTimestamp,
  getKarachiDayEndIso,
  getKarachiDayStartIso,
  isValidCalendarDate,
  validateDateRange,
} from "@/lib/datetime";
import { env } from "@/lib/env";
import { formatCurrency } from "@/lib/formatters";
import { sortData } from "@/lib/sort";
import { SortableHeader } from "@/components/ui/sortable-header";

type InvoiceSearchParams = {
  q?: string | string[];
  from?: string | string[];
  to?: string | string[];
  payment?: string | string[];
  status?: string | string[];
  sort?: string | string[];
  dir?: string | string[];
};

type ParsedInvoiceFilters = {
  search: string;
  from: string;
  to: string;
  payment: RecordedInvoicePaymentMethod | "";
  status: InvoiceListStatus | "";
  filters: InvoiceListFilters;
  error: string | null;
  hasFilterInput: boolean;
};

const PAYMENT_LABELS: Record<RecordedInvoicePaymentMethod, string> = {
  cash: "Cash",
  card: "Card",
  easypaisa: "Easypaisa",
  jazzcash: "JazzCash",
  bank_transfer: "Bank Transfer",
};

const STATUS_LABELS: Record<InvoiceListStatus, string> = {
  draft: "Draft",
  paid: "Paid",
  partial: "Partial",
  unpaid: "Unpaid",
  void: "Void",
};

function singleParam(value: string | string[] | undefined): string {
  if (typeof value === "string") return value;
  return Array.isArray(value) ? (value[0] ?? "") : "";
}

export function isValidInvoiceFilterDate(value: string): boolean {
  return isValidCalendarDate(value);
}

export function parseInvoiceFilterParams(
  params: InvoiceSearchParams,
): ParsedInvoiceFilters {
  const search = singleParam(params.q).trim();
  const from = singleParam(params.from);
  const to = singleParam(params.to);
  const paymentValue = singleParam(params.payment);
  const statusValue = singleParam(params.status);
  const hasFilterInput = Boolean(
    search || from || to || paymentValue || statusValue,
  );
  const dateRange = validateDateRange({ from, to });
  let error = dateRange.error;

  const payment = RECORDED_INVOICE_PAYMENT_METHODS.includes(
    paymentValue as RecordedInvoicePaymentMethod,
  )
    ? (paymentValue as RecordedInvoicePaymentMethod)
    : "";
  const status = INVOICE_LIST_STATUSES.includes(
    statusValue as InvoiceListStatus,
  )
    ? (statusValue as InvoiceListStatus)
    : "";

  if (!error && paymentValue && !payment) {
    error = "Select a valid recorded payment method.";
  }
  if (!error && statusValue && !status) {
    error = "Select a valid invoice status.";
  }

  return {
    search,
    from,
    to,
    payment,
    status,
    error,
    hasFilterInput,
    filters: error
      ? {}
      : {
          search: search || undefined,
          fromIso: from ? getKarachiDayStartIso(from) : undefined,
          toIso: to ? getKarachiDayEndIso(to) : undefined,
          paymentMethod: payment || undefined,
          status: status || undefined,
        },
  };
}

function fmtDate(iso: string) {
  return formatKarachiTimestamp(iso, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    paid: "bg-emerald-100 text-emerald-800",
    partial: "bg-amber-100 text-amber-800",
    unpaid: "bg-red-100 text-red-800",
    draft: "bg-slate-200 text-slate-700",
    void: "bg-slate-200 text-slate-500",
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${styles[status] ?? "bg-slate-100 text-slate-700"}`}
    >
      {status}
    </span>
  );
}

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<InvoiceSearchParams>;
}) {
  if (!env.isSupabaseConfigured) redirect("/login");
  const { user, profile, organization } = await getCurrentContext();
  if (!user) redirect("/login");
  if (!profile?.organization_id) redirect("/setup");

  const params = await searchParams;
  const parsedFilters = parseInvoiceFilterParams(params);
  const invoices = parsedFilters.error
    ? []
    : await listInvoices(profile.organization_id, parsedFilters.filters);
  const currency = organization?.currency_code ?? "PKR";
  const sort = singleParam(params.sort) || undefined;
  const dir = singleParam(params.dir) === "desc" ? "desc" : "asc";
  const sortableParams = {
    q: parsedFilters.search,
    from: parsedFilters.from,
    to: parsedFilters.to,
    payment: parsedFilters.payment,
    status: parsedFilters.status,
    sort,
    dir: singleParam(params.dir),
  };
  const filterFormKey = [
    parsedFilters.search,
    parsedFilters.from,
    parsedFilters.to,
    parsedFilters.payment,
    parsedFilters.status,
    sort ?? "",
    singleParam(params.dir),
  ].join("\u0000");

  const sortedInvoices = sortData(
    invoices,
    sort || "invoice_date",
    sort ? dir : "desc",
    {
      invoice_no: "natural",
      invoice_date: "date",
      customer_name: "string",
      grand_total: "number",
      amount_paid: "number",
      balance_due: "number",
      status: "string",
    },
  );

  return (
    <AppShell pageTitle="Invoices">
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-[#fff] shadow-sm md:rounded-2xl dark:border-white/[0.07] dark:bg-[#060f20]">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-3 py-3 md:px-5 md:py-4 dark:border-white/[0.07]">
          <div className="min-w-0">
            <h2 className="text-base font-black text-slate-950 dark:text-slate-50">
              All invoices
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Most recent first.
            </p>
          </div>
          <Link
            href="/pos"
            className="inline-flex min-h-10 shrink-0 items-center rounded-lg bg-blue-700 px-3 py-2 text-sm font-bold text-white hover:bg-blue-800 md:px-4 cursor-pointer"
          >
            New sale
          </Link>
        </div>

        <div className="border-b border-slate-200 px-3 py-4 md:px-5 dark:border-white/[0.07]">
          <form
            key={filterFormKey}
            action="/invoices"
            method="get"
            className="space-y-3"
          >
            {sort && <input type="hidden" name="sort" value={sort} />}
            {singleParam(params.dir) && (
              <input type="hidden" name="dir" value={singleParam(params.dir)} />
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <label className="block min-w-0">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Search
                </span>
                <input
                  type="search"
                  name="q"
                  defaultValue={parsedFilters.search}
                  placeholder="Invoice or customer"
                  className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-[#fff] px-3 text-sm text-slate-900 outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </label>
              <label className="block min-w-0">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  From Date
                </span>
                <input
                  type="date"
                  name="from"
                  defaultValue={parsedFilters.from}
                  className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-[#fff] px-3 text-sm text-slate-900 outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </label>
              <label className="block min-w-0">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  To Date
                </span>
                <input
                  type="date"
                  name="to"
                  defaultValue={parsedFilters.to}
                  className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-[#fff] px-3 text-sm text-slate-900 outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </label>
              <label className="block min-w-0">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Payment Method
                </span>
                <select
                  name="payment"
                  defaultValue={parsedFilters.payment}
                  className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-[#fff] px-3 text-sm text-slate-900 outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  <option value="">All payment methods</option>
                  {RECORDED_INVOICE_PAYMENT_METHODS.map((method) => (
                    <option key={method} value={method}>
                      {PAYMENT_LABELS[method]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block min-w-0">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Status
                </span>
                <select
                  name="status"
                  defaultValue={parsedFilters.status}
                  className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-[#fff] px-3 text-sm text-slate-900 outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  <option value="">All statuses</option>
                  {INVOICE_LIST_STATUSES.map((statusValue) => (
                    <option key={statusValue} value={statusValue}>
                      {STATUS_LABELS[statusValue]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                className="inline-flex min-h-10 items-center rounded-lg bg-slate-900 px-4 text-sm font-bold text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-[#fff] cursor-pointer"
              >
                Apply Filters
              </button>
              <Link
                href="/invoices"
                className="inline-flex min-h-10 items-center text-sm font-semibold text-slate-600 underline dark:text-slate-300"
              >
                Reset
              </Link>
            </div>
          </form>
          {parsedFilters.error && (
            <p
              role="alert"
              className="mt-3 text-sm font-semibold text-red-700 dark:text-red-400"
            >
              {parsedFilters.error}
            </p>
          )}
        </div>

        {invoices.length === 0 ? (
          <div className="p-6">
            {parsedFilters.hasFilterInput ? (
              <EmptyState
                title="No invoices match these filters"
                description={
                  parsedFilters.error ??
                  "Adjust the filters or reset the invoice list."
                }
                actionHref="/invoices"
                actionLabel="Reset filters"
                type="search"
              />
            ) : (
              <EmptyState
                title="No invoices yet"
                description="Start a sale from the POS to generate your first invoice."
                actionHref="/pos"
                actionLabel="Go to POS"
                type="empty"
              />
            )}
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500 dark:border-white/[0.07] dark:bg-white/[0.02] dark:text-slate-400">
                  <tr>
                    <SortableHeader
                      label="Invoice"
                      columnKey="invoice_no"
                      currentSortKey={sort}
                      direction={dir}
                      currentParams={sortableParams}
                    />
                    <SortableHeader
                      label="Date"
                      columnKey="invoice_date"
                      currentSortKey={sort}
                      direction={dir}
                      currentParams={sortableParams}
                    />
                    <SortableHeader
                      label="Customer"
                      columnKey="customer_name"
                      currentSortKey={sort}
                      direction={dir}
                      currentParams={sortableParams}
                    />
                    <SortableHeader
                      label="Total"
                      columnKey="grand_total"
                      align="right"
                      currentSortKey={sort}
                      direction={dir}
                      currentParams={sortableParams}
                    />
                    <SortableHeader
                      label="Paid"
                      columnKey="amount_paid"
                      align="right"
                      currentSortKey={sort}
                      direction={dir}
                      currentParams={sortableParams}
                    />
                    <SortableHeader
                      label="Due"
                      columnKey="balance_due"
                      align="right"
                      currentSortKey={sort}
                      direction={dir}
                      currentParams={sortableParams}
                    />
                    <SortableHeader
                      label="Status"
                      columnKey="status"
                      currentSortKey={sort}
                      direction={dir}
                      currentParams={sortableParams}
                    />
                    <th className="px-4 py-3 text-right" />
                  </tr>
                </thead>
                <tbody>
                  {sortedInvoices.map((inv) => (
                    <tr
                      key={inv.id}
                      className="border-b border-slate-100 dark:border-white/[0.05]"
                    >
                      <td className="px-4 py-3 font-bold text-slate-900 dark:text-slate-100">
                        {inv.invoice_no}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                        {fmtDate(inv.invoice_date)}
                      </td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                        {inv.customer_name ?? "Walk-in"}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-slate-900 dark:text-slate-100">
                        {formatCurrency(inv.grand_total, currency)}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-300">
                        {formatCurrency(inv.amount_paid, currency)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span
                          className={
                            inv.balance_due > 0
                              ? "font-bold text-red-700 dark:text-red-400"
                              : "text-slate-500 dark:text-slate-400"
                          }
                        >
                          {formatCurrency(inv.balance_due, currency)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill status={inv.status} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/invoices/${inv.id}`}
                          className="rounded-md border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="grid grid-cols-1 gap-2 p-2 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:grid-cols-2 lg:hidden">
              {sortedInvoices.map((inv) => (
                <li
                  key={inv.id}
                  className="rounded-xl border border-slate-200 bg-[#fff] p-3 shadow-sm dark:border-white/[0.07] dark:bg-slate-950"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-bold text-slate-900 dark:text-slate-100">
                        {inv.invoice_no}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {fmtDate(inv.invoice_date)}
                      </p>
                      <p className="mt-0.5 truncate text-sm text-slate-700 dark:text-slate-300">
                        {inv.customer_name ?? "Walk-in"}
                      </p>
                    </div>
                    <StatusPill status={inv.status} />
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
                    <div className="min-w-0 rounded-lg bg-slate-50 p-2 dark:bg-white/[0.04]">
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Total
                      </p>
                      <p className="break-words text-[11px] font-bold leading-tight text-slate-900 min-[380px]:text-xs dark:text-slate-100">
                        {formatCurrency(inv.grand_total, currency)}
                      </p>
                    </div>
                    <div className="min-w-0 rounded-lg bg-slate-50 p-2 dark:bg-white/[0.04]">
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Paid
                      </p>
                      <p className="break-words text-[11px] font-semibold leading-tight text-slate-700 min-[380px]:text-xs dark:text-slate-300">
                        {formatCurrency(inv.amount_paid, currency)}
                      </p>
                    </div>
                    <div className="min-w-0 rounded-lg bg-slate-50 p-2 dark:bg-white/[0.04]">
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Due
                      </p>
                      <p
                        className={
                          inv.balance_due > 0
                            ? "break-words text-[11px] font-bold leading-tight text-red-700 min-[380px]:text-xs dark:text-red-400"
                            : "break-words text-[11px] font-semibold leading-tight text-slate-500 min-[380px]:text-xs dark:text-slate-400"
                        }
                      >
                        {formatCurrency(inv.balance_due, currency)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 flex justify-end border-t border-slate-100 pt-2 dark:border-white/[0.05]">
                    <Link
                      href={`/invoices/${inv.id}`}
                      className="inline-flex min-h-9 items-center rounded-md border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-300 cursor-pointer"
                    >
                      View
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </AppShell>
  );
}
