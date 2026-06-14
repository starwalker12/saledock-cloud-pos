"use client";

import { useActionState, useState, useMemo } from "react";
import {
  Clock,
  Play,
  Square,
  CircleDollarSign,
  ReceiptText,
  RotateCcw,
  Wallet,
  Scale,
  HandCoins,
  BadgeMinus,
  User,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { openShiftAction, closeShiftAction, type ShiftActionState } from "./shift-actions";
import { formatCurrency, formatNumber } from "@/lib/formatters";

// ── Types & constants replicated for client-side safety (no "server-only" deps) ─

type PaymentMethodKey = "cash" | "card" | "easypaisa" | "jazzcash" | "bank_transfer" | "customer_credit";

const PAYMENT_METHOD_ORDER: PaymentMethodKey[] = [
  "cash", "card", "easypaisa", "jazzcash", "bank_transfer", "customer_credit",
];

const PAYMENT_METHOD_LABELS: Record<PaymentMethodKey, string> = {
  cash: "Cash",
  card: "Card",
  easypaisa: "EasyPaisa",
  jazzcash: "JazzCash",
  bank_transfer: "Bank transfer",
  customer_credit: "Customer credit",
};

export type CashShiftRow = {
  id: string;
  organization_id: string;
  branch_id: string;
  opened_at: string;
  closed_at: string | null;
  opened_by: string;
  opened_by_name: string | null;
  closed_by: string | null;
  closed_by_name: string | null;
  starting_cash: number;
  expected_cash: number;
  counted_cash: number | null;
  cash_difference: number | null;
  notes: string | null;
  status: "open" | "closed";
  created_at: string;
  updated_at: string;
};

export type ShiftActivity = {
  invoicesCount: number;
  grossSales: number;
  paymentsByMethod: Record<PaymentMethodKey, number>;
  paymentsTotal: number;
  refundsCount: number;
  refundsTotal: number;
  refundsByMethod: Record<PaymentMethodKey, number>;
  expensesTotal: number;
  expensesCash: number;
  expensesByCategory: { category: string; amount: number }[];
  creditPending: number;
  expectedCash: number;
  creditCollectionCash: number;
  creditCollectionDigital: number;
  creditWriteOffs: number;
};

export type StaffActivity = {
  user_id: string;
  user_name: string | null;
  role: string | null;
  paymentsTotal: number;
  paymentsCash: number;
  paymentsDigital: number;
};

const initial: ShiftActionState = { error: null, success: null };

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString("en-PK", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtShortId(id: string) {
  return id.slice(0, 8);
}

// ── Open Shift Form ────────────────────────────────────────────────────────────

export function OpenShiftForm({
  canOpen,
  startingCashDefault,
  notesDefault,
}: {
  canOpen: boolean;
  startingCashDefault?: number;
  notesDefault?: string | null;
}) {
  const [state, action, pending] = useActionState(openShiftAction, initial);
  const [starting, setStarting] = useState(
    startingCashDefault !== undefined ? String(startingCashDefault) : "0",
  );
  const startingNum = Number(starting || 0);

  if (!canOpen) {
    return (
      <p className="rounded-lg bg-amber-50 dark:bg-amber-950/20 px-3 py-2 text-xs font-medium text-amber-900 dark:text-amber-400">
        Your role cannot open a shift. Ask the owner, admin, or manager.
      </p>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <label className="block">
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Starting cash (PKR)</span>
        <input
          required
          type="number"
          min={0}
          step="0.01"
          name="starting_cash"
          value={starting}
          onChange={(e) => setStarting(e.target.value)}
          disabled={pending}
          className="mt-1 h-11 w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-[#fff] dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-3 outline-none focus:border-blue-600 dark:focus:border-blue-500"
        />
      </label>

      <p className="rounded-xl bg-blue-50 dark:bg-blue-950/20 p-3 text-xs text-blue-800 dark:text-blue-300">
        Enter the amount of cash in the drawer at the start of your shift. This
        becomes the baseline for expected cash at closing.
      </p>

      <label className="block">
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Notes (optional)</span>
        <textarea
          name="notes"
          rows={2}
          defaultValue={notesDefault ?? ""}
          disabled={pending}
          className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-[#fff] dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-3 py-2 outline-none focus:border-blue-600 dark:focus:border-blue-500"
        />
      </label>

      {state.error && (
        <p className="rounded-lg bg-red-50 dark:bg-red-950/20 px-3 py-2 text-sm font-medium text-red-700 dark:text-red-400">{state.error}</p>
      )}
      {state.success && (
        <p className="rounded-lg bg-emerald-50 dark:bg-emerald-950/20 px-3 py-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">{state.success}</p>
      )}

      <button
        type="submit"
        disabled={pending || startingNum < 0}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 text-sm font-bold text-white transition hover:bg-emerald-800 disabled:opacity-60"
      >
        <Play className="size-4" />
        {pending ? "Opening…" : "Open shift"}
      </button>
    </form>
  );
}

// ── Close Shift Form ───────────────────────────────────────────────────────────

export function CloseShiftForm({
  shift,
  activity,
  canClose,
  currency,
}: {
  shift: CashShiftRow;
  activity: ShiftActivity;
  canClose: boolean;
  currency: string;
}) {
  const [state, action, pending] = useActionState(closeShiftAction, initial);
  const [counted, setCounted] = useState("");
  const [notes, setNotes] = useState("");

  const countedNum = Number(counted || 0);
  // Expected cash in drawer = starting cash + net cash flow
  const expected = shift.starting_cash + activity.expectedCash;
  const liveDiff = countedNum - expected;

  const fmt = (n: number) => formatCurrency(n, currency);
  const digitalTotal =
    activity.paymentsByMethod.card +
    activity.paymentsByMethod.easypaisa +
    activity.paymentsByMethod.jazzcash +
    activity.paymentsByMethod.bank_transfer;

  return (
    <div className="space-y-4">
      {/* Shift info header */}
      <div className="rounded-xl border border-blue-200 dark:border-blue-900/30 bg-blue-50 dark:bg-blue-950/20 p-3 text-xs text-blue-900 dark:text-blue-300">
        <div className="flex items-center gap-2 font-semibold">
          <Clock className="size-4" />
          <span>Shift #{fmtShortId(shift.id)} — Active</span>
        </div>
        <div className="mt-1 grid gap-x-4 gap-y-1 sm:grid-cols-2">
          <span>Opened by: <strong>{shift.opened_by_name ?? "—"}</strong></span>
          <span>Opened at: <strong>{fmtTime(shift.opened_at)}</strong></span>
          <span>Starting cash: <strong>{fmt(shift.starting_cash)}</strong></span>
        </div>
      </div>

      {/* Live activity totals */}
      <div className="grid gap-3 grid-cols-1 min-[380px]:grid-cols-2 xl:grid-cols-3">
        <StatBox label="Invoices" value={String(activity.invoicesCount)} detail="Gross" icon={<ReceiptText className="size-4" />} />
        <StatBox label="Gross sales" value={fmt(activity.grossSales)} detail="All invoices" icon={<CircleDollarSign className="size-4" />} />
        <StatBox label="Cash payments" value={fmt(activity.paymentsByMethod.cash)} detail="Cash received" icon={<CircleDollarSign className="size-4" />} />
        <StatBox label="Digital payments" value={fmt(digitalTotal)} detail="Card / EasyPaisa / JazzCash / Bank" icon={<Wallet className="size-4" />} />
        <StatBox label="Refunds" value={fmt(activity.refundsTotal)} detail={`${activity.refundsCount} returns`} icon={<RotateCcw className="size-4" />} />
        <StatBox label="Expenses (cash)" value={fmt(activity.expensesCash)} detail="Cash expenses this shift" icon={<Wallet className="size-4" />} />
        <StatBox label="Credit pending" value={fmt(activity.creditPending)} detail="Outstanding on invoices" icon={<Scale className="size-4" />} />
        <StatBox label="Credit collections" value={fmt(activity.creditCollectionCash + activity.creditCollectionDigital)} detail={`Cash ${fmt(activity.creditCollectionCash)} / Digital ${fmt(activity.creditCollectionDigital)}`} icon={<HandCoins className="size-4" />} />
        <StatBox label="Credit write-offs" value={fmt(activity.creditWriteOffs)} detail="Bad debt (P&L impact)" icon={<BadgeMinus className="size-4" />} />
      </div>

      {/* Close form */}
      <form action={action} className="space-y-4">
        <input type="hidden" name="shift_id" value={shift.id} />

        <label className="block">
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Counted cash (PKR)</span>
          <input
            required
            type="number"
            min={0}
            step="0.01"
            name="counted_cash"
            value={counted}
            onChange={(e) => setCounted(e.target.value)}
            disabled={pending || !canClose}
            className="mt-1 h-11 w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-[#fff] dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-3 outline-none focus:border-blue-600 dark:focus:border-blue-500"
          />
        </label>

        <div className="grid gap-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 p-3 text-sm text-slate-950 dark:text-slate-100">
          <div className="flex justify-between">
            <span className="text-slate-600 dark:text-slate-400">Starting cash</span>
            <span className="font-bold">{fmt(shift.starting_cash)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600 dark:text-slate-400">Net cash flow</span>
            <span className="font-bold">{fmt(activity.expectedCash)}</span>
          </div>
          <div className="flex justify-between border-t border-slate-200 dark:border-slate-800 pt-2">
            <span className="text-slate-600 dark:text-slate-400">Expected cash (drawer)</span>
            <span className="font-bold">{fmt(expected)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600 dark:text-slate-400">Counted cash</span>
            <span className="font-bold">{fmt(countedNum)}</span>
          </div>
          <div className="flex justify-between border-t border-slate-200 dark:border-slate-800 pt-2">
            <span className="text-slate-700 dark:text-slate-300 font-medium">Difference</span>
            <span
              className={`font-black ${
                liveDiff === 0
                  ? "text-slate-900 dark:text-slate-100"
                  : liveDiff > 0
                    ? "text-emerald-700 dark:text-emerald-400"
                    : "text-red-700 dark:text-red-400"
              }`}
            >
              {fmt(liveDiff)}
            </span>
          </div>
        </div>

        <label className="block">
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Notes (optional)</span>
          <textarea
            name="notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={pending || !canClose}
            className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-[#fff] dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-3 py-2 outline-none focus:border-blue-600 dark:focus:border-blue-500"
          />
        </label>

        {!canClose && (
          <p className="rounded-lg bg-amber-50 dark:bg-amber-950/20 px-3 py-2 text-xs font-medium text-amber-900 dark:text-amber-400">
            Your role cannot close shifts. Ask the owner, admin, or manager.
          </p>
        )}
        {state.error && (
          <p className="rounded-lg bg-red-50 dark:bg-red-950/20 px-3 py-2 text-sm font-medium text-red-700 dark:text-red-400">{state.error}</p>
        )}
        {state.success && (
          <p className="rounded-lg bg-emerald-50 dark:bg-emerald-950/20 px-3 py-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">{state.success}</p>
        )}

        <button
          type="submit"
          disabled={pending || !canClose}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-red-700 text-sm font-bold text-white transition hover:bg-red-800 disabled:opacity-60"
        >
          <Square className="size-4" />
          {pending ? "Closing…" : "Close shift"}
        </button>
      </form>
    </div>
  );
}

function SortableHeader({
  label,
  columnKey,
  currentSortKey,
  direction,
  onSort,
  align = "left",
  className = "",
}: {
  label: string;
  columnKey: string;
  currentSortKey: string;
  direction: "asc" | "desc";
  onSort: (key: string) => void;
  align?: "left" | "right" | "center";
  className?: string;
}) {
  const isSorted = currentSortKey === columnKey;
  const alignClass =
    align === "right"
      ? "justify-end text-right"
      : align === "center"
      ? "justify-center text-center"
      : "justify-start text-left";

  return (
    <th className={`${className} p-0 select-none border-b border-slate-200 dark:border-white/[0.07]`}>
      <button
        type="button"
        onClick={() => onSort(columnKey)}
        className={`flex items-center gap-1 px-4 py-3 font-bold uppercase transition-colors hover:bg-slate-100 dark:hover:bg-white/[0.04] cursor-pointer w-full text-slate-500 dark:text-slate-400 ${alignClass}`}
      >
        <span>{label}</span>
        {isSorted && (
          direction === "asc" ? (
            <ArrowUp className="size-3.5 shrink-0 text-blue-700 dark:text-blue-400" />
          ) : (
            <ArrowDown className="size-3.5 shrink-0 text-blue-700 dark:text-blue-400" />
          )
        )}
      </button>
    </th>
  );
}

export function ShiftHistoryTable({
  shifts,
  currency,
}: {
  shifts: CashShiftRow[];
  currency: string;
}) {
  const fmt = (n: number) => formatCurrency(n, currency);

  const [sortBy, setSortBy] = useState<string>("opened_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const handleSort = (key: string) => {
    if (sortBy === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortDir("asc");
    }
  };

  const sortedShifts = useMemo(() => {
    const sorted = [...shifts];
    sorted.sort((rowA, rowB) => {
      const a = rowA[sortBy as keyof CashShiftRow];
      const b = rowB[sortBy as keyof CashShiftRow];

      const aEmpty = a == null || a === "";
      const bEmpty = b == null || b === "";
      if (aEmpty && bEmpty) return 0;
      if (aEmpty) return 1;
      if (bEmpty) return -1;

      let cmp = 0;
      if (sortBy === "opened_at" || sortBy === "closed_at" || sortBy === "created_at") {
        const valA = new Date(a as string).getTime();
        const valB = new Date(b as string).getTime();
        cmp = valA - valB;
      } else if (typeof a === "number" && typeof b === "number") {
        cmp = a - b;
      } else {
        cmp = String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
      }

      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [shifts, sortBy, sortDir]);

  if (shifts.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-[#fff] dark:bg-slate-900 p-8 text-center text-sm text-slate-500 dark:text-slate-400 shadow-sm">
        No shifts recorded yet.
      </div>
    );
  }

  return (
    <>
      <div className="hidden md:block overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-[#fff] dark:bg-slate-900 shadow-sm">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <tr>
              <SortableHeader label="ID" columnKey="id" currentSortKey={sortBy} direction={sortDir} onSort={handleSort} />
              <SortableHeader label="Opened" columnKey="opened_at" currentSortKey={sortBy} direction={sortDir} onSort={handleSort} />
              <SortableHeader label="By" columnKey="opened_by_name" currentSortKey={sortBy} direction={sortDir} onSort={handleSort} />
              <SortableHeader label="Start" columnKey="starting_cash" align="right" currentSortKey={sortBy} direction={sortDir} onSort={handleSort} />
              <SortableHeader label="Expected" columnKey="expected_cash" align="right" currentSortKey={sortBy} direction={sortDir} onSort={handleSort} />
              <SortableHeader label="Counted" columnKey="counted_cash" align="right" currentSortKey={sortBy} direction={sortDir} onSort={handleSort} />
              <SortableHeader label="Diff" columnKey="cash_difference" align="right" currentSortKey={sortBy} direction={sortDir} onSort={handleSort} />
              <SortableHeader label="Status" columnKey="status" currentSortKey={sortBy} direction={sortDir} onSort={handleSort} />
            </tr>
          </thead>
          <tbody>
            {sortedShifts.map((s) => (
              <tr key={s.id} className="border-b border-slate-100 dark:border-slate-800/60">
                <td className="px-4 py-3 font-mono text-xs text-slate-500 dark:text-slate-400">
                  {fmtShortId(s.id)}
                </td>
                <td className="px-4 py-3 text-xs text-slate-700 dark:text-slate-305 font-medium">
                  {fmtTime(s.opened_at)}
                </td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-305">{s.opened_by_name ?? "—"}</td>
                <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-305">{fmt(s.starting_cash)}</td>
                <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-305">
                  {s.status === "closed" ? fmt(s.expected_cash) : "—"}
                </td>
                <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-305">
                  {s.counted_cash !== null ? fmt(s.counted_cash) : "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  {s.cash_difference !== null ? (
                    <span
                      className={
                        s.cash_difference === 0
                          ? "text-slate-500 dark:text-slate-400"
                          : s.cash_difference > 0
                            ? "font-bold text-emerald-700 dark:text-emerald-400"
                            : "font-bold text-red-700 dark:text-red-400"
                      }
                    >
                      {fmt(s.cash_difference)}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-3">
                  {s.status === "open" ? (
                    <span className="rounded-full bg-emerald-100 dark:bg-emerald-900/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800 dark:text-emerald-400">
                      Open
                    </span>
                  ) : (
                    <span className="rounded-full bg-slate-200 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-700 dark:text-slate-300">
                      Closed
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 md:hidden">
        {sortedShifts.map((s) => (
          <div key={s.id} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-[#fff] dark:bg-slate-900 p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-xs font-semibold text-slate-500 dark:text-slate-400">
                Shift #{fmtShortId(s.id)}
              </span>
              {s.status === "open" ? (
                <span className="rounded-full bg-emerald-100 dark:bg-emerald-900/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800 dark:text-emerald-400">
                  Open
                </span>
              ) : (
                <span className="rounded-full bg-slate-200 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-700 dark:text-slate-300">
                  Closed
                </span>
              )}
            </div>
            
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <div>
                <span className="text-slate-500 dark:text-slate-400 block">Opened</span>
                <span className="font-medium text-slate-900 dark:text-slate-200">{fmtTime(s.opened_at)}</span>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400 block">Opened By</span>
                <span className="font-medium text-slate-900 dark:text-slate-200">{s.opened_by_name ?? "—"}</span>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400 block">Starting Cash</span>
                <span className="font-medium text-slate-900 dark:text-slate-200">{fmt(s.starting_cash)}</span>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400 block">Expected Cash</span>
                <span className="font-medium text-slate-900 dark:text-slate-200">
                  {s.status === "closed" ? fmt(s.expected_cash) : "—"}
                </span>
              </div>
              {s.status === "closed" && (
                <>
                  <div>
                    <span className="text-slate-500 dark:text-slate-400 block">Counted Cash</span>
                    <span className="font-medium text-slate-900 dark:text-slate-200">
                      {s.counted_cash !== null ? fmt(s.counted_cash) : "—"}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-slate-400 block">Difference</span>
                    <span className={`font-bold ${
                      s.cash_difference === 0
                        ? "text-slate-500 dark:text-slate-400"
                        : s.cash_difference! > 0
                          ? "text-emerald-700 dark:text-emerald-400"
                          : "text-red-700 dark:text-red-400"
                    }`}>
                      {s.cash_difference !== null ? fmt(s.cash_difference) : "—"}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// ── Staff Summary ──────────────────────────────────────────────────────────────

export function ShiftStaffSummary({
  staff,
  currency,
}: {
  staff: StaffActivity[];
  currency: string;
}) {
  const fmt = (n: number) => formatCurrency(n, currency);

  if (staff.length === 0) return null;

  return (
    <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-[#fff] dark:bg-slate-900 p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <User className="size-5 text-slate-400" />
        <h2 className="text-base font-black text-slate-950 dark:text-slate-100">Staff activity (this shift)</h2>
      </div>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        Payments received grouped by staff member.
      </p>

      {/* Desktop view */}
      <div className="mt-3 hidden md:block overflow-x-auto">
        <table className="w-full min-w-[400px] text-left text-sm">
          <thead className="border-b border-slate-200 dark:border-slate-800 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <tr>
              <th className="py-2">Staff</th>
              <th className="py-2 text-right">Total</th>
              <th className="py-2 text-right">Cash</th>
              <th className="py-2 text-right">Digital</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s.user_id} className="border-b border-slate-100 dark:border-slate-800/60">
                <td className="py-2">
                  {s.user_name ? (
                    <span className="font-semibold text-slate-900 dark:text-slate-200">{s.user_name}</span>
                  ) : (
                    <span className="italic text-slate-400 dark:text-slate-500 font-medium">Unassigned</span>
                  )}
                  {s.role && (
                    <span className="ml-2 rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:text-slate-450">
                      {s.role}
                    </span>
                  )}
                </td>
                <td className="py-2 text-right font-bold text-slate-900 dark:text-slate-100">{fmt(s.paymentsTotal)}</td>
                <td className="py-2 text-right text-slate-705 dark:text-slate-305">{fmt(s.paymentsCash)}</td>
                <td className="py-2 text-right text-slate-705 dark:text-slate-305">{fmt(s.paymentsDigital)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile view */}
      <div className="mt-3 space-y-3 md:hidden">
        {staff.map((s) => (
          <div key={s.user_id} className="rounded-xl border border-slate-100 dark:border-slate-800/80 p-3 bg-slate-50/50 dark:bg-slate-900/50">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                {s.user_name ? (
                  <span className="font-semibold text-slate-900 dark:text-slate-200 text-sm block truncate">{s.user_name}</span>
                ) : (
                  <span className="italic text-slate-400 dark:text-slate-500 text-sm block">Unassigned</span>
                )}
                {s.role && (
                  <span className="inline-block mt-0.5 rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:text-slate-400">
                    {s.role}
                  </span>
                )}
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-500 dark:text-slate-400 block">Total</span>
                <span className="font-bold text-sm text-slate-900 dark:text-slate-100">{fmt(s.paymentsTotal)}</span>
              </div>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 border-t border-slate-100/50 dark:border-slate-800/30 pt-2 text-xs">
              <div>
                <span className="text-slate-500 dark:text-slate-400 block">Cash</span>
                <span className="font-medium text-slate-700 dark:text-slate-305">{fmt(s.paymentsCash)}</span>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400 block">Digital</span>
                <span className="font-medium text-slate-700 dark:text-slate-305">{fmt(s.paymentsDigital)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Shift Print Section ────────────────────────────────────────────────────────
// Rendered inside page.tsx for print. Matches existing thermal-print pattern.

export function ShiftPrintSection({
  shift,
  activity,
  staff,
  organizationName,
  branchName,
  currency,
}: {
  shift: CashShiftRow;
  activity: ShiftActivity;
  staff: StaffActivity[];
  organizationName: string | null;
  branchName: string | null;
  currency: string;
}) {
  const fmt = (n: number) => formatCurrency(n, currency);

  return (
    <article className="shift-thermal-print hidden bg-white text-black">
      <header className="text-center">
        <p className="text-[11px] font-bold uppercase">
          {organizationName ?? "Gadget Zone"}
        </p>
        {branchName && <p className="text-[10px]">{branchName}</p>}
        <p className="mt-1 text-[10px] font-bold uppercase">Shift Report</p>
      </header>
      <div className="my-2 border-y border-dashed border-black py-1 text-[10px]">
        <div className="flex justify-between gap-2">
          <span>Shift</span>
          <span className="text-right font-mono">{fmtShortId(shift.id)}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span>Opened by</span>
          <span className="text-right">{shift.opened_by_name ?? "—"}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span>Opened at</span>
          <span className="text-right">{fmtTime(shift.opened_at)}</span>
        </div>
        {shift.closed_at && (
          <>
            <div className="flex justify-between gap-2">
              <span>Closed by</span>
              <span className="text-right">{shift.closed_by_name ?? "—"}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span>Closed at</span>
              <span className="text-right">{fmtTime(shift.closed_at)}</span>
            </div>
          </>
        )}
        <div className="flex justify-between gap-2">
          <span>Status</span>
          <strong className="text-right">{shift.status === "open" ? "Open" : "Closed"}</strong>
        </div>
      </div>
      <table className="w-full text-[10px]">
        <tbody>
          <tr><td>Invoices</td><td className="text-right">{formatNumber(activity.invoicesCount)}</td></tr>
          <tr><td>Gross sales</td><td className="text-right">{fmt(activity.grossSales)}</td></tr>
          <tr><td>Refunds</td><td className="text-right">{fmt(activity.refundsTotal)}</td></tr>
          <tr><td>Expenses (cash)</td><td className="text-right">{fmt(activity.expensesCash)}</td></tr>
          <tr><td>Credit pending</td><td className="text-right">{fmt(activity.creditPending)}</td></tr>
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
                  {fmt(recv - ref)}
                  {ref > 0 && <span className="ml-1 text-[8px]">(net)</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {staff.length > 0 && (
        <>
          <div className="my-2 border-t border-dashed border-black pt-1 text-[10px] font-bold">
            <p className="uppercase">Staff activity</p>
          </div>
          <table className="w-full text-[10px]">
            <tbody>
              {staff.map((s) => (
                <tr key={s.user_id}>
                  <td>{s.user_name ?? "Unassigned"}</td>
                  <td className="text-right">{fmt(s.paymentsTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      <div className="my-2 border-y border-dashed border-black py-1 text-[10px]">
        <div className="flex justify-between gap-2">
          <span>Starting cash</span>
          <span className="text-right">{fmt(shift.starting_cash)}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span>Expected cash</span>
          <strong className="text-right">{fmt(shift.starting_cash + activity.expectedCash)}</strong>
        </div>
        {shift.counted_cash !== null && (
          <>
            <div className="flex justify-between gap-2">
              <span>Counted cash</span>
              <strong className="text-right">{fmt(shift.counted_cash)}</strong>
            </div>
            <div className="flex justify-between gap-2">
              <span>Difference</span>
              <strong className="text-right">{fmt(shift.cash_difference ?? 0)}</strong>
            </div>
          </>
        )}
      </div>
      {shift.notes && (
        <p className="mt-2 text-[9px] italic">{shift.notes}</p>
      )}
      <footer className="mt-3 border-t border-dashed border-black pt-2 text-center text-[9px]">
        Shift report · Printed {new Date().toLocaleString("en-PK")}
      </footer>
    </article>
  );
}

// ── StatBox helper ─────────────────────────────────────────────────────────────

function StatBox({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-[#fff] dark:bg-slate-900 p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{label}</p>
          <p className="mt-1 text-sm font-black text-slate-950 dark:text-slate-100">{value}</p>
        </div>
        <div className="shrink-0 rounded-lg bg-blue-50 dark:bg-blue-900/30 p-2 text-blue-700 dark:text-blue-400">{icon}</div>
      </div>
      <p className="mt-2 text-[10px] text-slate-500 dark:text-slate-400">{detail}</p>
    </div>
  );
}
