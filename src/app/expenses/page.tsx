import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertCircle, CalendarDays, Receipt, Tag, Wallet } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { StatCard } from "@/components/ui/stat-card";
import { getCurrentContext } from "@/lib/auth/session";
import { canManageExpenses } from "@/lib/permissions";
import {
  expenseCounts,
  listExpenseCategories,
  listExpenses,
  type ExpenseFilters,
} from "@/lib/data/expenses";
import { EXPENSE_PAYMENT_METHODS } from "@/lib/validation/expenses";
import { env } from "@/lib/env";
import { formatCurrency, formatNumber } from "@/lib/formatters";
import { ExpenseForm } from "./expense-form";
import { restoreExpenseAction } from "./actions";
import { VoidExpenseForm } from "./void-expense-form";

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Cash",
  card: "Card",
  easypaisa: "EasyPaisa",
  jazzcash: "JazzCash",
  bank_transfer: "Bank transfer",
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("en-PK", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type SearchParams = {
  q?: string;
  category?: string;
  payment_method?: string;
  from?: string;
  to?: string;
  archived?: string;
  edit?: string;
};

function StatusPill({ status }: { status: string }) {
  if (status === "archived") {
    return (
      <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-700">
        Voided
      </span>
    );
  }
  return (
    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800">
      Active
    </span>
  );
}

export default async function ExpensesPage({
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
  const canWrite = canManageExpenses(profile.role);
  const currency = organization?.currency_code ?? "PKR";

  const filters: ExpenseFilters = {
    search: params.q,
    category: params.category,
    payment_method: params.payment_method,
    from: params.from ? new Date(params.from).toISOString() : undefined,
    to: params.to ? new Date(`${params.to}T23:59:59.999`).toISOString() : undefined,
    includeArchived: params.archived === "1",
  };

  const [counts, expenses, knownCategories] = await Promise.all([
    expenseCounts(orgId),
    listExpenses(orgId, filters),
    listExpenseCategories(orgId),
  ]);

  const editing = params.edit ? expenses.find((e) => e.id === params.edit) : undefined;
  const isEdit = Boolean(editing);

  return (
    <AppShell pageTitle="Expenses">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Today expenses"
          value={formatCurrency(counts.todayTotal, currency)}
          detail={
            counts.todayCount === 0
              ? "No expenses today."
              : `${formatNumber(counts.todayCount)} entr${counts.todayCount === 1 ? "y" : "ies"} today.`
          }
          icon={<Wallet className="size-5" />}
        />
        <StatCard
          label="This month"
          value={formatCurrency(counts.monthTotal, currency)}
          detail={
            counts.monthCount === 0
              ? "No expenses this month."
              : `${formatNumber(counts.monthCount)} entr${counts.monthCount === 1 ? "y" : "ies"} so far.`
          }
          icon={<CalendarDays className="size-5" />}
        />
        <StatCard
          label="Top category (month)"
          value={counts.topCategoryThisMonth?.name ?? "—"}
          detail={
            counts.topCategoryThisMonth
              ? formatCurrency(counts.topCategoryThisMonth.total, currency)
              : "No data yet."
          }
          icon={<Tag className="size-5" />}
        />
        <StatCard
          label="Latest expense"
          value={counts.latest ? formatCurrency(counts.latest.amount, currency) : "—"}
          detail={
            counts.latest
              ? `${counts.latest.category} · ${fmtDate(counts.latest.spent_at)}`
              : "Nothing recorded yet."
          }
          icon={<Receipt className="size-5" />}
        />
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-black text-slate-950">All expenses</h2>
              <p className="text-xs text-slate-500">Most recent first.</p>
            </div>
            {!canWrite && (
              <p className="rounded-lg bg-amber-50 px-3 py-1 text-xs font-medium text-amber-900">
                <AlertCircle className="mr-1 inline size-3" />
                Your role ({profile.role}) cannot create or edit expenses.
              </p>
            )}
          </div>
        </div>

        <div className="space-y-5 p-5 sm:p-6">
          {canWrite && (
            <details open={isEdit} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <summary className="cursor-pointer text-sm font-bold text-slate-800">
                {isEdit ? `Edit expense: ${editing!.category}` : "Add a new expense"}
              </summary>
              <div className="mt-4">
                <ExpenseForm
                  key={editing?.id ?? "new"}
                  initialValues={editing}
                  knownCategories={knownCategories}
                  canWrite={canWrite}
                />
                {isEdit && (
                  <Link href="/expenses" className="mt-3 inline-block text-xs font-semibold text-slate-600 underline">
                    Cancel edit
                  </Link>
                )}
              </div>
            </details>
          )}

          <form className="grid gap-3 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-end" action="/expenses">
            <label className="block min-w-0">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Search</span>
              <input
                name="q"
                defaultValue={params.q ?? ""}
                placeholder="Category, vendor, notes"
                className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 outline-none focus:border-blue-600 lg:w-56"
              />
            </label>
            <label className="block min-w-0">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Category</span>
              <select
                name="category"
                defaultValue={params.category ?? ""}
                className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 outline-none focus:border-blue-600 lg:w-44"
              >
                <option value="">All</option>
                {knownCategories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="block min-w-0">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Method</span>
              <select
                name="payment_method"
                defaultValue={params.payment_method ?? ""}
                className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 outline-none focus:border-blue-600 lg:w-44"
              >
                <option value="">All</option>
                {EXPENSE_PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {PAYMENT_LABELS[m] ?? m}
                  </option>
                ))}
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
            <label className="flex min-h-10 items-center gap-2">
              <input
                type="checkbox"
                name="archived"
                value="1"
                defaultChecked={params.archived === "1"}
                className="size-4"
              />
              <span className="text-sm font-semibold text-slate-700">Show voided</span>
            </label>
            <button type="submit" className="h-10 rounded-lg bg-slate-900 px-4 text-sm font-bold text-white">
              Apply
            </button>
            {(params.q ||
              params.category ||
              params.payment_method ||
              params.from ||
              params.to ||
              params.archived) && (
              <Link href="/expenses" className="self-center text-xs font-semibold text-slate-600 underline">
                Reset
              </Link>
            )}
          </form>

          {expenses.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
              <p className="text-sm font-semibold text-slate-600">No expenses match these filters.</p>
              {canWrite && (
                <p className="mt-1 text-xs text-slate-500">Add your first expense using the form above.</p>
              )}
            </div>
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[820px] text-left text-sm">
                  <thead className="border-b border-slate-200 text-xs font-bold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-3">Date</th>
                      <th className="px-3 py-3">Category</th>
                      <th className="px-3 py-3">Vendor</th>
                      <th className="px-3 py-3">Method</th>
                      <th className="px-3 py-3">Created by</th>
                      <th className="px-3 py-3 text-right">Amount</th>
                      <th className="px-3 py-3">Status</th>
                      <th className="px-3 py-3 text-right" />
                    </tr>
                  </thead>
                  <tbody>
                    {expenses.map((e) => (
                      <tr key={e.id} className="border-b border-slate-100 align-top">
                        <td className="px-3 py-3 text-slate-700">{fmtDate(e.spent_at)}</td>
                        <td className="px-3 py-3 font-bold text-slate-900">{e.category}</td>
                        <td className="px-3 py-3 text-slate-700">{e.vendor_name ?? "—"}</td>
                        <td className="px-3 py-3 text-slate-700">{PAYMENT_LABELS[e.payment_method] ?? e.payment_method}</td>
                        <td className="px-3 py-3 text-slate-600">{e.created_by_name ?? "—"}</td>
                        <td className="px-3 py-3 text-right font-bold text-slate-900">{formatCurrency(e.amount, currency)}</td>
                        <td className="px-3 py-3"><StatusPill status={e.status} /></td>
                        <td className="px-3 py-3 text-right">
                          {canWrite ? <ExpenseActions id={e.id} status={e.status} /> : <span className="text-xs text-slate-400">View only</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="space-y-3 md:hidden">
                {expenses.map((e) => (
                  <li key={e.id} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-bold text-slate-900">{e.category}</p>
                        <p className="text-xs text-slate-500">{fmtDate(e.spent_at)}</p>
                        <p className="text-xs text-slate-500">{PAYMENT_LABELS[e.payment_method] ?? e.payment_method}{e.vendor_name ? ` · ${e.vendor_name}` : ""}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-lg font-black text-slate-950">{formatCurrency(e.amount, currency)}</p>
                        <StatusPill status={e.status} />
                      </div>
                    </div>
                    {e.notes && <p className="mt-2 text-xs text-slate-600">{e.notes}</p>}
                    {canWrite && (
                      <div className="mt-3 flex justify-end">
                        <ExpenseActions id={e.id} status={e.status} />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function ExpenseActions({ id, status }: { id: string; status: "active" | "archived" }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Link
        href={`/expenses?edit=${id}`}
        className="inline-flex min-h-9 items-center rounded-md border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
      >
        Edit
      </Link>
      {status === "active" ? (
        <VoidExpenseForm id={id} />
      ) : (
        <form action={restoreExpenseAction}>
          <input type="hidden" name="id" value={id} />
          <button
            type="submit"
            className="min-h-9 rounded-md border border-emerald-200 px-3 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
          >
            Restore
          </button>
        </form>
      )}
    </div>
  );
}
