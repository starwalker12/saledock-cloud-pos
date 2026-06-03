import Link from "next/link";
import { redirect } from "next/navigation";
import {
  CalendarCheck,
  CalendarDays,
  CircleDollarSign,
  ReceiptText,
  RotateCcw,
  Scale,
  Wallet,
  HandCoins,
  BadgeMinus,
  Clock,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { StatCard } from "@/components/ui/stat-card";
import { getCurrentContext } from "@/lib/auth/session";
import { canCloseDay, canReopenDay, canOpenShift } from "@/lib/permissions";
import {
  getClosing,
  getDayActivity,
  listRecentClosings,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHOD_ORDER,
  todayLocalDate,
  type PaymentMethodKey,
} from "@/lib/data/daily-closing";
import { getCurrentShift, getShiftHistory, getShiftActivity, getShiftStaffSummary } from "@/lib/data/shifts";
import { env } from "@/lib/env";
import { formatCurrency, formatNumber } from "@/lib/formatters";
import { CloseDayForm, ReopenDayForm } from "./closing-form";
import { ClosingPrintButtons, ShiftPrintButton } from "./print-button";
import {
  OpenShiftForm,
  CloseShiftForm,
  ShiftHistoryTable,
  ShiftStaffSummary,
  ShiftPrintSection,
} from "./shift-ui";

type SearchParams = { date?: string };

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("en-PK", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtDay(d: string) {
  return new Date(`${d}T00:00:00`).toLocaleDateString("en-PK", {
    year: "numeric",
    month: "long",
    day: "2-digit",
    weekday: "long",
  });
}

function isoToInput(d: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  return todayLocalDate();
}

export default async function DailyClosingPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  if (!env.isSupabaseConfigured) redirect("/login");

  const { user, profile, organization, branch } = await getCurrentContext();
  if (!user) redirect("/login");
  if (!profile?.organization_id) redirect("/setup");
  if (!profile.branch_id) {
    return (
      <AppShell pageTitle="Daily Closing">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          Your profile is not assigned to a branch yet. Ask the owner to assign you to a branch.
        </div>
      </AppShell>
    );
  }

  const params = await searchParams;
  const date = isoToInput(params.date ?? todayLocalDate());
  const orgId = profile.organization_id;
  const branchId = profile.branch_id;
  const currency = organization?.currency_code ?? "PKR";
  const writer = canCloseDay(profile.role);
  const reopener = canReopenDay(profile.role);
  const canOpen = canOpenShift(profile.role);

  const [activity, closing, recent, currentShift, shiftHistory] = await Promise.all([
    getDayActivity(orgId, branchId, date),
    getClosing(orgId, branchId, date),
    listRecentClosings(orgId, branchId, 14),
    getCurrentShift(orgId, branchId),
    getShiftHistory(orgId, branchId, 10),
  ]);

  let shiftActivity = null;
  let shiftStaff = null;
  if (currentShift) {
    [shiftActivity, shiftStaff] = await Promise.all([
      getShiftActivity(orgId, branchId, currentShift.opened_at),
      getShiftStaffSummary(orgId, branchId, currentShift.opened_at),
    ]);
  }

  const isClosed = Boolean(closing?.finalized_by);
  const isToday = date === todayLocalDate();

  // For closed days, show the snapshotted numbers; for open days, the live activity.
  const displayed = closing && isClosed
    ? {
        bills: closing.bills_count,
        gross: activity.grossSales,
        cash: closing.cash_sales,
        digital: closing.digital_payments,
        credit: closing.credit_pending,
        expenses: closing.expenses_total,
        refunds: closing.refunds_total,
        expected: closing.expected_closing_cash,
        creditCollectionCash: closing.credit_collection_cash,
        creditCollectionDigital: closing.credit_collection_digital,
        creditWriteOffs: closing.credit_write_offs,
      }
    : {
        bills: activity.invoicesCount,
        gross: activity.grossSales,
        cash: activity.paymentsByMethod.cash,
        digital:
          activity.paymentsByMethod.card +
          activity.paymentsByMethod.easypaisa +
          activity.paymentsByMethod.jazzcash +
          activity.paymentsByMethod.bank_transfer,
        credit: activity.creditPending,
        expenses: activity.expensesTotal,
        refunds: activity.refundsTotal,
        expected: activity.expectedCash,
        creditCollectionCash: activity.creditCollectionCash,
        creditCollectionDigital: activity.creditCollectionDigital,
        creditWriteOffs: activity.creditWriteOffs,
      };

  return (
    <AppShell pageTitle="Daily Closing">
      <form
        action="/daily-closing"
        className="mb-5 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"
      >
        <div className="grid gap-3 min-[380px]:grid-cols-[1fr_auto_auto] min-[380px]:items-end">
          <label className="block min-w-0">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Closing date
            </span>
            <input
              type="date"
              name="date"
              defaultValue={date}
              max={todayLocalDate()}
              className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 outline-none focus:border-blue-600"
            />
          </label>
          <button
            type="submit"
            className="h-10 rounded-lg bg-slate-900 px-4 text-sm font-bold text-white"
          >
            Load
          </button>
          {!isToday && (
            <Link href="/daily-closing" className="pb-2 text-xs font-semibold text-slate-600 underline">
              Today
            </Link>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-2 text-left text-xs text-slate-500 sm:items-end sm:text-right">
          <div>
            <p>{branch?.name ? `Branch: ${branch.name}` : ""}</p>
            <p>{fmtDay(date)}</p>
          </div>
          <ClosingPrintButtons />
          <ShiftPrintButton hasShift={Boolean(currentShift)} />
        </div>
      </form>

      <div className="a4-print">
      {/* Status banner */}
      <div className={`mb-5 rounded-2xl border p-4 ${isClosed ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white"}`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-col gap-2 min-[380px]:flex-row min-[380px]:items-center min-[380px]:gap-3">
            <span
              className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${
                isClosed ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"
              }`}
            >
              {isClosed ? "Closed" : "Open"}
            </span>
            <div className="text-sm text-slate-700">
              {isClosed && closing?.finalized_at ? (
                <>
                  Closed by <strong>{closing.finalized_by_name ?? "—"}</strong> at{" "}
                  <strong>{fmtDate(closing.finalized_at)}</strong>
                </>
              ) : (
                "Day is open. Close it after counting cash to lock the figures."
              )}
            </div>
          </div>
          {isClosed && reopener && <ReopenDayForm closingDate={date} canReopen={reopener} />}
        </div>
      </div>

      {/* ── Shift Card ──────────────────────────────────────────────────── */}
      <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Clock className="size-5 text-slate-400" />
          <h2 className="text-base font-black text-slate-950">
            {currentShift ? "Active Shift" : "Cash Drawer Shift"}
          </h2>
          {currentShift && (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800">
              Open
            </span>
          )}
        </div>

        {currentShift && shiftActivity ? (
          <CloseShiftForm
            shift={currentShift}
            activity={shiftActivity}
            canClose={writer}
            currency={currency}
          />
        ) : (
          <OpenShiftForm
            canOpen={canOpen}
            startingCashDefault={0}
          />
        )}
      </section>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label="Gross sales"
          value={formatCurrency(displayed.gross, currency)}
          detail={`${formatNumber(displayed.bills)} invoice${displayed.bills === 1 ? "" : "s"}.`}
          icon={<ReceiptText className="size-5" />}
        />
        <StatCard
          label="Refunds"
          value={formatCurrency(displayed.refunds, currency)}
          detail={`${formatNumber(activity.refundsCount)} return${activity.refundsCount === 1 ? "" : "s"} today.`}
          icon={<RotateCcw className="size-5" />}
        />
        <StatCard
          label="Expenses"
          value={formatCurrency(displayed.expenses, currency)}
          detail="Active expenses only (voided excluded)."
          icon={<Wallet className="size-5" />}
        />
        <StatCard
          label="Cash payments"
          value={formatCurrency(displayed.cash, currency)}
          detail="Cash received on this day."
          icon={<CircleDollarSign className="size-5" />}
        />
        <StatCard
          label="Digital payments"
          value={formatCurrency(displayed.digital, currency)}
          detail="Card / EasyPaisa / JazzCash / Bank transfer."
          icon={<CalendarDays className="size-5" />}
        />
        <StatCard
          label="Credit pending"
          value={formatCurrency(displayed.credit, currency)}
          detail="Outstanding balance on today's invoices."
          icon={<Scale className="size-5" />}
        />
        <StatCard
          label="Credit collection cash"
          value={formatCurrency(displayed.creditCollectionCash, currency)}
          detail="Cash settlements received from customers."
          icon={<HandCoins className="size-5" />}
        />
        <StatCard
          label="Credit collection digital"
          value={formatCurrency(displayed.creditCollectionDigital, currency)}
          detail="Digital settlements received from customers."
          icon={<CalendarDays className="size-5" />}
        />
        <StatCard
          label="Credit write-offs"
          value={formatCurrency(displayed.creditWriteOffs, currency)}
          detail="Bad debt written off (P&L impact)."
          icon={<BadgeMinus className="size-5" />}
        />
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        {/* Breakdown */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-base font-black text-slate-950">Payment method breakdown</h2>
          <p className="text-xs text-slate-500">Live totals from the payments table for this day.</p>
          <div className="hidden md:block">
            <table className="mt-3 w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-2">Method</th>
                  <th className="py-2 text-right">Received</th>
                  <th className="py-2 text-right">Refunded</th>
                  <th className="py-2 text-right">Net</th>
                </tr>
              </thead>
              <tbody>
                {PAYMENT_METHOD_ORDER.map((m: PaymentMethodKey) => {
                  const recv = activity.paymentsByMethod[m];
                  const ref = activity.refundsByMethod[m];
                  return (
                    <tr key={m} className="border-b border-slate-100">
                      <td className="py-2 font-semibold text-slate-900">{PAYMENT_METHOD_LABELS[m]}</td>
                      <td className="py-2 text-right">{formatCurrency(recv, currency)}</td>
                      <td className="py-2 text-right text-red-700">{ref ? `-${formatCurrency(ref, currency)}` : "—"}</td>
                      <td className="py-2 text-right font-bold">{formatCurrency(recv - ref, currency)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-3 space-y-2 md:hidden">
            {PAYMENT_METHOD_ORDER.map((m: PaymentMethodKey) => {
              const recv = activity.paymentsByMethod[m];
              const ref = activity.refundsByMethod[m];
              return (
                <div key={m} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2">
                  <span className="text-sm font-semibold text-slate-900">{PAYMENT_METHOD_LABELS[m]}</span>
                  <div className="text-right">
                    <span className="text-sm font-bold text-slate-900">{formatCurrency(recv - ref, currency)}</span>
                    {ref > 0 && <span className="ml-1 text-xs text-red-600">(-{formatCurrency(ref, currency)})</span>}
                  </div>
                </div>
              );
            })}
          </div>

          <h3 className="mt-6 text-base font-black text-slate-950">Expense breakdown</h3>
          {activity.expensesByCategory.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">No expenses recorded for this day.</p>
          ) : (
            <ul className="mt-3 space-y-1 text-sm">
              {activity.expensesByCategory.map((e) => (
                <li key={e.category} className="flex justify-between border-b border-slate-100 py-1">
                  <span className="text-slate-700">{e.category}</span>
                  <span className="font-semibold text-slate-900">{formatCurrency(e.amount, currency)}</span>
                </li>
              ))}
              <li className="flex justify-between pt-2 text-sm font-bold">
                <span>Total</span>
                <span>{formatCurrency(activity.expensesTotal, currency)}</span>
              </li>
            </ul>
          )}
        </section>

        {/* Closing card */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-base font-black text-slate-950">Cash reconciliation</h2>
          <p className="text-xs text-slate-500">
            Expected = cash received − cash refunds − cash expenses.
          </p>
          {!writer && (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
              Your role ({profile.role}) can view daily closing but cannot close the day.
            </p>
          )}
          <div className="mt-4">
            <CloseDayForm
              closingDate={date}
              expectedCash={displayed.expected}
              countedCashDefault={closing?.actual_closing_cash}
              notesDefault={closing?.notes}
              canWrite={writer}
              isClosed={isClosed}
              currency={currency}
            />
          </div>
        </section>
      </div>

      {/* Staff-wise summary for active shift */}
      {currentShift && shiftStaff && shiftStaff.length > 0 && (
        <div className="mt-6">
          <ShiftStaffSummary staff={shiftStaff} currency={currency} />
        </div>
      )}

      {/* Shift history */}
      <section className="mt-6">
        <div className="mb-3 flex items-center gap-2">
          <Clock className="size-5 text-slate-400" />
          <h2 className="text-base font-black text-slate-950">Shift History</h2>
        </div>
        <ShiftHistoryTable shifts={shiftHistory} currency={currency} />
      </section>

      <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-base font-black text-slate-950">Recent closings</h2>
            <p className="text-xs text-slate-500">Last 14 days. Click a row to load it.</p>
          </div>
          <CalendarCheck className="size-5 text-slate-400" />
        </div>
        {recent.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">No closings recorded yet.</div>
        ) : (
          <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Bills</th>
                  <th className="px-4 py-3 text-right">Cash sales</th>
                  <th className="px-4 py-3 text-right">Expected</th>
                  <th className="px-4 py-3 text-right">Counted</th>
                  <th className="px-4 py-3 text-right">Difference</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {recent.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100">
                    <td className="px-4 py-3 text-slate-700">{fmtDay(r.closing_date)}</td>
                    <td className="px-4 py-3">
                      {r.is_closed ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800">
                          Closed
                        </span>
                      ) : (
                        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-700">
                          Draft
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">{formatNumber(r.bills_count)}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(r.cash_sales, currency)}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(r.expected_closing_cash, currency)}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(r.actual_closing_cash, currency)}</td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={
                          r.cash_difference === 0
                            ? "text-slate-500"
                            : r.cash_difference > 0
                              ? "font-bold text-emerald-700"
                              : "font-bold text-red-700"
                        }
                      >
                        {formatCurrency(r.cash_difference, currency)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/daily-closing?date=${r.closing_date}`}
                        className="rounded-md border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-3 md:hidden">
            {recent.map((r) => (
              <div key={r.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900">{fmtDay(r.closing_date)}</p>
                  </div>
                  {r.is_closed ? (
                    <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800">
                      Closed
                    </span>
                  ) : (
                    <span className="shrink-0 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-700">
                      Draft
                    </span>
                  )}
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <dt className="text-xs text-slate-500">Bills</dt>
                    <dd className="font-semibold text-slate-900">{formatNumber(r.bills_count)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Cash sales</dt>
                    <dd className="font-semibold text-slate-900">{formatCurrency(r.cash_sales, currency)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Expected</dt>
                    <dd className="font-semibold text-slate-900">{formatCurrency(r.expected_closing_cash, currency)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Counted</dt>
                    <dd className="font-semibold text-slate-900">{formatCurrency(r.actual_closing_cash, currency)}</dd>
                  </div>
                </dl>
                <div className="mt-2 flex items-center justify-between">
                  <span className={`text-sm font-bold ${
                    r.cash_difference === 0
                      ? "text-slate-500"
                      : r.cash_difference > 0
                        ? "text-emerald-700"
                        : "text-red-700"
                  }`}>
                    Diff: {formatCurrency(r.cash_difference, currency)}
                  </span>
                  <Link
                    href={`/daily-closing?date=${r.closing_date}`}
                    className="rounded-md border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Open
                  </Link>
                </div>
              </div>
            ))}
          </div>
          </>
        )}
      </section>
      </div>

      {/* 80mm thermal closing receipt — hidden on screen, shown only when
          body[data-print-mode="thermal"] is set by ClosingPrintButtons. */}
      <article className="thermal-print hidden bg-white text-black">
        <header className="text-center">
          <p className="text-[11px] font-bold uppercase">
            {organization?.name ?? "Gadget Zone"}
          </p>
          {branch?.name && <p className="text-[10px]">{branch.name}</p>}
          <p className="mt-1 text-[10px] font-bold uppercase">Daily Closing</p>
        </header>
        <div className="my-2 border-y border-dashed border-black py-1 text-[10px]">
          <div className="flex justify-between gap-2"><span>Date</span><span className="text-right">{fmtDay(date)}</span></div>
          <div className="flex justify-between gap-2"><span>Status</span><strong>{isClosed ? "Closed" : "Open"}</strong></div>
          {isClosed && closing?.finalized_at && (
            <>
              <div className="flex justify-between gap-2"><span>Closed by</span><span className="text-right">{closing.finalized_by_name ?? "—"}</span></div>
              <div className="flex justify-between gap-2"><span>Closed at</span><span className="text-right">{fmtDate(closing.finalized_at)}</span></div>
            </>
          )}
        </div>
        <table className="w-full text-[10px]">
          <tbody>
            <tr><td>Invoices</td><td className="text-right">{formatNumber(displayed.bills)}</td></tr>
            <tr><td>Gross sales</td><td className="text-right">{formatCurrency(displayed.gross, currency)}</td></tr>
            <tr><td>Refunds</td><td className="text-right">{formatCurrency(displayed.refunds, currency)}</td></tr>
            <tr><td>Expenses</td><td className="text-right">{formatCurrency(displayed.expenses, currency)}</td></tr>
            <tr><td>Credit pending</td><td className="text-right">{formatCurrency(displayed.credit, currency)}</td></tr>
          </tbody>
        </table>
        <div className="my-2 border-t border-dashed border-black pt-1 text-[10px] font-bold">
          <p className="uppercase">Payment methods</p>
        </div>
        <table className="w-full text-[10px]">
          <tbody>
            {PAYMENT_METHOD_ORDER.map((m: PaymentMethodKey) => {
              const recv = activity.paymentsByMethod[m];
              const ref = activity.refundsByMethod[m];
              if (recv === 0 && ref === 0) return null;
              return (
                <tr key={m}>
                  <td>{PAYMENT_METHOD_LABELS[m]}</td>
                  <td className="text-right">
                    {formatCurrency(recv - ref, currency)}
                    {ref > 0 && <span className="ml-1 text-[8px]">(net)</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="my-2 border-y border-dashed border-black py-1 text-[10px]">
          <div className="flex justify-between gap-2"><span>Expected cash</span><strong>{formatCurrency(displayed.expected, currency)}</strong></div>
          {isClosed && (
            <>
              <div className="flex justify-between gap-2"><span>Counted cash</span><strong>{formatCurrency(closing?.actual_closing_cash ?? 0, currency)}</strong></div>
              <div className="flex justify-between gap-2"><span>Difference</span><strong>{formatCurrency(closing?.cash_difference ?? 0, currency)}</strong></div>
            </>
          )}
        </div>
        {closing?.notes && (
          <p className="mt-2 text-[9px] italic">{closing.notes}</p>
        )}
        <footer className="mt-3 border-t border-dashed border-black pt-2 text-center text-[9px]">
          Thank you. Closing summary.
        </footer>
      </article>

      {/* Shift thermal print receipt — hidden on screen */}
      {currentShift && shiftActivity && (
        <ShiftPrintSection
          shift={currentShift}
          activity={shiftActivity}
          staff={shiftStaff ?? []}
          organizationName={organization?.name ?? null}
          branchName={branch?.name ?? null}
          currency={currency}
        />
      )}
    </AppShell>
  );
}
