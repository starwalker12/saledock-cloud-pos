import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { getCurrentContext } from "@/lib/auth/session";
import { listReturns } from "@/lib/data/returns";
import { env } from "@/lib/env";
import { formatCurrency, formatNumber } from "@/lib/formatters";
import { OPERATIONAL_HISTORY_MAX_ROWS } from "@/lib/operational-history";
import { sortData } from "@/lib/sort";
import { SortableHeader } from "@/components/ui/sortable-header";
import {
  formatKarachiTimestamp,
  getKarachiDayEndIso,
  getKarachiDayStartIso,
  getKarachiHistoryPresetRange,
  type KarachiHistoryPreset,
  validateDateRange,
} from "@/lib/datetime";

type SearchParams = {
  from?: string;
  to?: string;
  sort?: string;
  dir?: string;
};

const RETURN_PRESETS: Array<{ label: string; value: KarachiHistoryPreset }> = [
  { label: "Today", value: "today" },
  { label: "Yesterday", value: "yesterday" },
  { label: "This week", value: "this_week" },
  { label: "This month", value: "this_month" },
  { label: "Last month", value: "last_month" },
];

const METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  card: "Card",
  easypaisa: "EasyPaisa",
  jazzcash: "JazzCash",
  bank_transfer: "Bank transfer",
};

function fmtDate(iso: string) {
  return formatKarachiTimestamp(iso, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function parseReturnFilterParams(params: SearchParams) {
  const range = validateDateRange({
    from: params.from ?? "",
    to: params.to ?? "",
  });
  return {
    ...range,
    hasRange: Boolean(range.from || range.to),
  };
}

export default async function ReturnsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  if (!env.isSupabaseConfigured) redirect("/login");
  const { user, profile, organization } = await getCurrentContext();
  if (!user) redirect("/login");
  if (!profile?.organization_id) redirect("/setup");

  const params = await searchParams;
  const parsedFilters = parseReturnFilterParams(params);
  const returnResult = parsedFilters.error
    ? { rows: [], totalCount: null, limitExceeded: false }
    : await listReturns(profile.organization_id, {
        from: parsedFilters.from
          ? getKarachiDayStartIso(parsedFilters.from)
          : undefined,
        to: parsedFilters.to
          ? getKarachiDayEndIso(parsedFilters.to)
          : undefined,
      });
  const returns = returnResult.rows;
  const currency = organization?.currency_code ?? "PKR";

  const sort = params.sort;
  const dir = params.dir === "desc" ? "desc" : "asc";
  const sortableParams = {
    from: parsedFilters.error ? "" : parsedFilters.from,
    to: parsedFilters.error ? "" : parsedFilters.to,
    sort,
    dir: params.dir,
  };

  function historyHref(from: string, to: string) {
    const query = new URLSearchParams({ from, to });
    if (sort) query.set("sort", sort);
    if (params.dir) query.set("dir", params.dir);
    return `/returns?${query.toString()}`;
  }

  const resetQuery = new URLSearchParams();
  if (sort) resetQuery.set("sort", sort);
  if (params.dir) resetQuery.set("dir", params.dir);
  const resetHref = resetQuery.size
    ? `/returns?${resetQuery.toString()}`
    : "/returns";

  const sortedReturns = sortData(returns, sort || "created_at", sort ? dir : "desc", {
    created_at: "date",
    return_no: "natural",
    invoice_no: "natural",
    customer_name: "string",
    subtotal: "number",
    refund_amount: "number",
    refund_method: "string",
  });

  return (
    <AppShell pageTitle="Returns">
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-700">
            Refund audit
          </p>
          <h1 className="text-2xl font-black text-slate-950">Returns</h1>
          <p className="mt-1 text-sm text-slate-600">
            Invoice-linked return documents, refund methods, and stock restoration records.
          </p>
        </div>
        <Link
          href="/invoices"
          className="inline-flex h-10 items-center justify-center rounded-lg bg-blue-700 px-4 text-sm font-bold text-white hover:bg-blue-800"
        >
          Find invoice
        </Link>
      </div>

      <section className="mb-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/[0.07] dark:bg-[#060f20]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-bold uppercase tracking-wide text-slate-500">
            Return date
          </span>
          {RETURN_PRESETS.map((preset) => {
            const range = getKarachiHistoryPresetRange(preset.value);
            const active =
              parsedFilters.from === range.from && parsedFilters.to === range.to;
            return (
              <Link
                key={preset.value}
                href={historyHref(range.from, range.to)}
                className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${
                  active
                    ? "border-blue-700 bg-blue-700 text-white"
                    : "border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                }`}
              >
                {preset.label}
              </Link>
            );
          })}
        </div>

        <form
          method="get"
          action="/returns"
          className="mt-3 grid gap-3 min-[380px]:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto] lg:items-end"
        >
          {sort && <input type="hidden" name="sort" value={sort} />}
          {params.dir && <input type="hidden" name="dir" value={params.dir} />}
          <label className="block min-w-0">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              From
            </span>
            <input
              type="date"
              name="from"
              defaultValue={parsedFilters.from}
              aria-invalid={parsedFilters.errorCode === "invalid_from" || parsedFilters.errorCode === "reversed"}
              className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-950"
            />
          </label>
          <label className="block min-w-0">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              To
            </span>
            <input
              type="date"
              name="to"
              defaultValue={parsedFilters.to}
              aria-invalid={parsedFilters.errorCode === "invalid_to" || parsedFilters.errorCode === "reversed"}
              className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-950"
            />
          </label>
          <button
            type="submit"
            className="h-10 rounded-lg bg-slate-900 px-4 text-sm font-bold text-white dark:bg-slate-100 dark:text-slate-900"
          >
            Apply
          </button>
          <Link
            href={resetHref}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Reset
          </Link>
        </form>

        {parsedFilters.error && (
          <p
            role="alert"
            className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300"
          >
            {parsedFilters.error}
          </p>
        )}
      </section>

      {parsedFilters.error ? null : returnResult.limitExceeded ? (
        <section
          role="alert"
          className="rounded-2xl border border-amber-300 bg-amber-50 p-6 shadow-sm dark:border-amber-800 dark:bg-amber-950/30"
        >
          <h2 className="text-lg font-black text-amber-950 dark:text-amber-100">
            This date range is too large to display safely
          </h2>
          <p className="mt-2 text-sm text-amber-900 dark:text-amber-200">
            {formatNumber(returnResult.totalCount ?? 0)} returns match this date range. Narrow the range to {formatNumber(OPERATIONAL_HISTORY_MAX_ROWS)} records or fewer to view complete history.
          </p>
        </section>
      ) : returns.length === 0 ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h2 className="text-lg font-black text-slate-950">
            {parsedFilters.hasRange ? "No returns match this date range" : "No returns yet"}
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            {parsedFilters.hasRange
              ? "Try a wider Return Date range or reset the filter."
              : "Open an invoice detail page to process the first return."}
          </p>
        </section>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/[0.07] dark:bg-[#060f20]">
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500 dark:bg-white/[0.02] dark:text-slate-400">
                <tr>
                  <SortableHeader label="Return" columnKey="created_at" currentSortKey={sort} direction={dir} currentParams={sortableParams} />
                  <SortableHeader label="Invoice" columnKey="invoice_no" currentSortKey={sort} direction={dir} currentParams={sortableParams} />
                  <SortableHeader label="Customer" columnKey="customer_name" currentSortKey={sort} direction={dir} currentParams={sortableParams} />
                  <SortableHeader label="Subtotal" columnKey="subtotal" align="right" currentSortKey={sort} direction={dir} currentParams={sortableParams} />
                  <SortableHeader label="Payout" columnKey="refund_amount" align="right" currentSortKey={sort} direction={dir} currentParams={sortableParams} />
                  <SortableHeader label="Method" columnKey="refund_method" currentSortKey={sort} direction={dir} currentParams={sortableParams} />
                </tr>
              </thead>
              <tbody>
                {sortedReturns.map((ret) => (
                  <tr key={ret.id} className="border-t border-slate-100 dark:border-white/[0.05]">
                    <td className="px-4 py-3">
                      <Link href={`/returns/${ret.id}`} className="font-black text-blue-700 hover:underline dark:text-blue-400">
                        {ret.return_no}
                      </Link>
                      <div className="text-xs text-slate-500">{fmtDate(ret.created_at)}</div>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/invoices/${ret.invoice_id}`} className="font-bold text-blue-700 hover:underline dark:text-blue-400">
                        {ret.invoice_no ?? "Invoice"}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{ret.customer_name ?? "Walk-in"}</td>
                    <td className="px-4 py-3 text-right font-bold text-slate-900 dark:text-slate-100">
                      {formatCurrency(ret.subtotal, currency)}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-slate-900 dark:text-slate-100">
                      {formatCurrency(ret.refund_amount, currency)}
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                      {ret.refund_method ? METHOD_LABELS[ret.refund_method] ?? ret.refund_method : "No payout"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-white/[0.05] lg:hidden">
            {sortedReturns.map((ret) => (
              <article key={ret.id} className="p-4 bg-white dark:bg-[#060f20]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Link href={`/returns/${ret.id}`} className="font-black text-blue-700 hover:underline dark:text-blue-400">
                      {ret.return_no}
                    </Link>
                    <p className="text-xs text-slate-500">{fmtDate(ret.created_at)}</p>
                  </div>
                  <p className="text-right text-sm font-black text-slate-900 dark:text-slate-100">
                    {formatCurrency(ret.subtotal, currency)}
                  </p>
                </div>
                <div className="mt-3 grid gap-2 text-sm text-slate-600 dark:text-slate-400">
                  <Link href={`/invoices/${ret.invoice_id}`} className="font-bold text-blue-700 underline dark:text-blue-400">
                    {ret.invoice_no ?? "Open invoice"}
                  </Link>
                  <p>{ret.customer_name ?? "Walk-in customer"}</p>
                  <p>
                    Payout {formatCurrency(ret.refund_amount, currency)} ·{" "}
                    {ret.refund_method ? METHOD_LABELS[ret.refund_method] ?? ret.refund_method : "No payout"}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </AppShell>
  );
}
