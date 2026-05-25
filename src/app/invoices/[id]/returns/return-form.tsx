"use client";

import { useActionState, useMemo, useState } from "react";
import { createInvoiceReturnAction, type ReturnActionState } from "./actions";
import type { ReturnableInvoiceItem } from "@/lib/data/returns";
import { formatCurrency } from "@/lib/formatters";
import { REFUND_METHODS } from "@/lib/validation/returns";

const initial: ReturnActionState = { error: null, success: null };

const METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  card: "Card",
  easypaisa: "EasyPaisa",
  jazzcash: "JazzCash",
  bank_transfer: "Bank transfer",
};

export function ReturnForm({
  invoiceId,
  items,
  currency,
  canProcess,
}: {
  invoiceId: string;
  items: ReturnableInvoiceItem[];
  currency: string;
  canProcess: boolean;
}) {
  const [state, action, pending] = useActionState(createInvoiceReturnAction, initial);
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  const refundTotal = useMemo(
    () =>
      items.reduce(
        (sum, item) => sum + (quantities[item.id] ?? 0) * item.return_unit_total,
        0,
      ),
    [items, quantities],
  );

  const hasReturnableItems = items.some((item) => item.quantity_returnable > 0);

  if (!canProcess) {
    return (
      <section className="print-hidden mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5">
        <h2 className="text-sm font-black text-amber-900">Returns restricted</h2>
        <p className="mt-1 text-sm text-amber-800">
          Owner, admin, or manager access is required to process returns.
        </p>
      </section>
    );
  }

  return (
    <section className="print-hidden mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">
            Returns / refunds
          </p>
          <h2 className="text-lg font-black text-slate-950">Process return</h2>
        </div>
        <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm font-black text-slate-900">
          {formatCurrency(refundTotal, currency)}
        </div>
      </div>

      <div className="mt-4 grid gap-2 text-xs text-slate-600 sm:grid-cols-3">
        <p className="rounded-lg bg-blue-50 p-3 font-semibold text-blue-800">
          Cannot return more than the remaining sold quantity.
        </p>
        <p className="rounded-lg bg-emerald-50 p-3 font-semibold text-emerald-800">
          Product returns restock original FIFO lots when selected.
        </p>
        <p className="rounded-lg bg-slate-50 p-3 font-semibold text-slate-700">
          Service refunds never create stock movements.
        </p>
      </div>

      {!hasReturnableItems ? (
        <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm font-semibold text-slate-600">
          All items on this invoice have already been returned.
        </p>
      ) : (
        <form action={action} className="mt-5 space-y-4">
          <input type="hidden" name="invoice_id" value={invoiceId} />

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Item</th>
                  <th className="px-3 py-2 text-right">Sold</th>
                  <th className="px-3 py-2 text-right">Returned</th>
                  <th className="px-3 py-2 text-right">Return qty</th>
                  <th className="px-3 py-2">Restock</th>
                  <th className="px-3 py-2 text-right">Refund value</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const qty = quantities[item.id] ?? 0;
                  return (
                    <tr key={item.id} className="border-t border-slate-100">
                      <td className="px-3 py-3">
                        <input type="hidden" name="invoice_item_id" value={item.id} />
                        <div className="font-bold text-slate-900">{item.item_name}</div>
                        <div className="text-xs text-slate-500">
                          {item.item_type === "service" ? "Service" : "Product"} ·{" "}
                          {formatCurrency(item.return_unit_total, currency)} per returned unit
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right">{item.quantity_sold}</td>
                      <td className="px-3 py-3 text-right">{item.quantity_returned}</td>
                      <td className="px-3 py-3 text-right">
                        <input
                          name="quantity"
                          type="number"
                          min={0}
                          max={item.quantity_returnable}
                          step={1}
                          defaultValue={0}
                          disabled={pending || item.quantity_returnable === 0}
                          onChange={(event) =>
                            setQuantities((current) => ({
                              ...current,
                              [item.id]: Math.min(
                                Number(event.target.value || 0),
                                item.quantity_returnable,
                              ),
                            }))
                          }
                          className="h-10 w-24 rounded-lg border border-slate-200 px-3 text-right outline-none focus:border-blue-600 disabled:bg-slate-50"
                        />
                      </td>
                      <td className="px-3 py-3">
                        {item.item_type === "product" ? (
                          <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700">
                            <input
                              type="checkbox"
                              name="restock_item_id"
                              value={item.id}
                              defaultChecked
                              disabled={pending || item.quantity_returnable === 0}
                              className="size-4 rounded border-slate-300"
                            />
                            Restore stock
                          </label>
                        ) : (
                          <span className="text-xs font-semibold text-slate-500">No stock</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right font-bold">
                        {formatCurrency(qty * item.return_unit_total, currency)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="text-xs font-bold text-slate-700">Refund amount</span>
              <input
                name="refund_amount"
                type="number"
                min={0}
                max={refundTotal}
                step="0.01"
                defaultValue="0"
                disabled={pending}
                className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 outline-none focus:border-blue-600 disabled:bg-slate-50"
              />
            </label>
            <label className="block">
              <span className="text-xs font-bold text-slate-700">Refund method</span>
              <select
                name="refund_method"
                disabled={pending}
                className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 outline-none focus:border-blue-600 disabled:bg-slate-50"
              >
                <option value="">No payout now</option>
                {REFUND_METHODS.map((method) => (
                  <option key={method} value={method}>
                    {METHOD_LABELS[method]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-bold text-slate-700">Reference</span>
              <input
                name="reference_number"
                disabled={pending}
                className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 outline-none focus:border-blue-600 disabled:bg-slate-50"
                placeholder="Optional refund reference"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-xs font-bold text-slate-700">Notes</span>
            <textarea
              name="notes"
              rows={3}
              disabled={pending}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-blue-600 disabled:bg-slate-50"
              placeholder="Reason, condition, or approval note"
            />
          </label>

          {state.error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
              {state.error}
            </p>
          )}
          {state.success && (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
              {state.success}
            </p>
          )}

          <button
            type="submit"
            disabled={pending || refundTotal <= 0}
            className="h-11 w-full rounded-lg bg-blue-700 text-sm font-black text-white transition hover:bg-blue-800 disabled:opacity-60 sm:w-auto sm:px-6"
          >
            {pending ? "Processing return..." : "Process return"}
          </button>
        </form>
      )}
    </section>
  );
}
