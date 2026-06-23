"use client";

import { Drawer } from "@/components/ui/drawer";
import { formatCurrency } from "@/lib/formatters";

type HeldBill = {
  id: string;
  status: string;
  label: string | null;
  customer_name: string | null;
  note: string | null;
  item_count: number;
  grand_total: number;
  created_at: string;
  updated_at: string;
};

type HeldBillsDrawerProps = {
  open: boolean;
  onClose: () => void;
  currency: string;
  bills: HeldBill[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onResume: (bill: HeldBill) => void;
  onCancel: (bill: HeldBill) => void;
};

export function HeldBillsDrawer({
  open,
  onClose,
  currency,
  bills,
  loading,
  error,
  onRefresh,
  onResume,
  onCancel,
}: HeldBillsDrawerProps) {
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Held bills"
      description="Paused carts that can be resumed or cancelled."
      widthClass="w-full sm:max-w-md"
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-500 dark:text-slate-400">
            {bills.length} held {bills.length === 1 ? "bill" : "bills"}
          </span>
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="text-sm font-bold text-blue-700 hover:text-blue-800 disabled:opacity-60 dark:text-blue-400 dark:hover:text-blue-300"
          >
            Refresh
          </button>
        </div>

        {loading && bills.length === 0 && (
          <p className="py-8 text-center text-sm text-slate-500">Loading…</p>
        )}

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-200">{error}</p>
        )}

        {!loading && bills.length === 0 && !error && (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center dark:border-slate-700 dark:bg-slate-900/50">
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">No held bills</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Tap a product to start a new sale.</p>
          </div>
        )}

        {bills.map((bill) => (
          <div
            key={bill.id}
            className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/50 sm:p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-bold text-slate-900 dark:text-slate-100">
                  {bill.label || bill.customer_name || "Held bill"}
                </p>
                {bill.customer_name && bill.label && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">{bill.customer_name}</p>
                )}
                {bill.note && (
                  <p className="mt-1 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{bill.note}</p>
                )}
              </div>
              <div className="text-right">
                <p className="text-sm font-black text-slate-950 dark:text-white">{formatCurrency(bill.grand_total, currency)}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{bill.item_count} items</p>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between gap-2">
              <span className="text-[11px] text-slate-400 dark:text-slate-500">
                {new Date(bill.updated_at).toLocaleString("en-PK", {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => onCancel(bill)}
                  disabled={loading}
                  className="h-9 rounded-lg border border-slate-200 px-3 text-xs font-bold text-red-700 hover:bg-red-50 disabled:opacity-60 dark:border-slate-700 dark:text-red-400 dark:hover:bg-red-950/30"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => onResume(bill)}
                  disabled={loading}
                  className="h-9 rounded-lg bg-blue-700 px-3 text-xs font-bold text-white transition hover:bg-blue-800 disabled:opacity-60"
                >
                  Resume
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Drawer>
  );
}
