"use client";

import { useState, useTransition, useActionState } from "react";
import { PlusCircle, ArrowUpDown, Loader2, Info } from "lucide-react";
import { getProductInventoryDataAction, addStockLotAction, recordStockAdjustmentAction } from "./inventory-actions";
import type { SupplierRow } from "@/lib/data/catalog";
import type { StockLotRow, StockMovementRow } from "@/lib/data/inventory";
import type { ActionState } from "./inventory-actions";
import { formatCurrency, formatNumber } from "@/lib/formatters";

type Props = {
  productId: string;
  productName: string;
  suppliers: SupplierRow[];
  currency: string;
  canWrite: boolean;
};

export function InventorySection({ productId, productName, suppliers, currency, canWrite }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // Data State
  const [lots, setLots] = useState<StockLotRow[]>([]);
  const [movements, setMovements] = useState<StockMovementRow[]>([]);
  const [summary, setSummary] = useState<{
    totalRemaining: number;
    weightedAverageCost: number;
    activeLotsCount: number;
    lastPurchaseCost: number;
  } | null>(null);

  // Sub-tabs
  const [activeSubTab, setActiveSubTab] = useState<"lots" | "movements" | "restock" | "adjust">("lots");

  // Form transition
  const [pending] = useTransition();

  // Helper load functions (declared prior to hook usage)
  async function reloadData() {
    try {
      const res = await getProductInventoryDataAction(productId);
      setLots(res.lots);
      setMovements(res.movements);
      setSummary(res.summary);
    } catch (e) {
      console.error(e);
    }
  }

  async function loadData() {
    setLoading(true);
    try {
      const res = await getProductInventoryDataAction(productId);
      setLots(res.lots);
      setMovements(res.movements);
      setSummary(res.summary);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  // Action states for forms
  const [lotState, lotAction] = useActionState(
    async (prev: ActionState, formData: FormData) => {
      const res = await addStockLotAction(productId, prev, formData);
      if (res.success) {
        await reloadData();
      }
      return res;
    },
    { error: null, success: null }
  );

  const [adjustState, adjustAction] = useActionState(
    async (prev: ActionState, formData: FormData) => {
      const res = await recordStockAdjustmentAction(productId, prev, formData);
      if (res.success) {
        await reloadData();
      }
      return res;
    },
    { error: null, success: null }
  );

  function handleToggle() {
    const next = !open;
    setOpen(next);
    if (next) {
      loadData();
    }
  }

  const fmtDate = (iso: string) => {
    return new Date(iso).toLocaleDateString("en-PK", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
      <button
        onClick={handleToggle}
        className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-blue-700 hover:underline outline-none dark:text-slate-200"
      >
        <ArrowUpDown className="size-3.5" />
        {open ? "Hide Inventory Ledger" : "Manage Stock lots & FIFO FIFO Ledger"}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-4xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl overflow-y-auto max-h-[90vh] dark:border-slate-800 dark:bg-slate-950 text-left">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4 dark:border-slate-800">
              <div>
                <h4 className="text-lg font-black text-slate-900 dark:text-slate-100">
                  Inventory & FIFO Ledger: {productName}
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Manage restock batches, track movement history, and audit stock levels.
                </p>
              </div>
              <button
                onClick={handleToggle}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
              >
                Close
              </button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12 text-sm text-slate-500 gap-2">
                <Loader2 className="size-4 animate-spin text-blue-700 dark:text-slate-100" />
                Loading stock batches...
              </div>
            ) : (
              <div>
                {/* Cost & Summary Header */}
                {summary && (
                  <div className="grid gap-3 grid-cols-2 md:grid-cols-4 mb-4">
                    <div className="rounded-lg bg-white border border-slate-100 p-3 shadow-xs dark:bg-slate-900 dark:border-slate-800">
                      <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Total remaining</span>
                      <strong className="block mt-1 text-sm font-black text-slate-900 dark:text-white">{formatNumber(summary.totalRemaining)} items</strong>
                    </div>
                    <div className="rounded-lg bg-white border border-slate-100 p-3 shadow-xs dark:bg-slate-900 dark:border-slate-800">
                      <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">FIFO Weighted Cost</span>
                      <strong className="block mt-1 text-sm font-black text-slate-900 dark:text-white">{formatCurrency(summary.weightedAverageCost, currency)}</strong>
                    </div>
                    <div className="rounded-lg bg-white border border-slate-100 p-3 shadow-xs dark:bg-slate-900 dark:border-slate-800">
                      <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Active Cost Batches</span>
                      <strong className="block mt-1 text-sm font-black text-slate-900 dark:text-white">{formatNumber(summary.activeLotsCount)} lots</strong>
                    </div>
                    <div className="rounded-lg bg-white border border-slate-100 p-3 shadow-xs dark:bg-slate-900 dark:border-slate-800">
                      <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Last restock cost</span>
                      <strong className="block mt-1 text-sm font-black text-slate-900 dark:text-white">{formatCurrency(summary.lastPurchaseCost, currency)}</strong>
                    </div>
                  </div>
                )}

                {/* Navigation Sub-Tabs */}
                <div className="flex flex-wrap gap-1 border-b border-slate-200 pb-2 mb-3 dark:border-slate-800">
                  <button
                    onClick={() => setActiveSubTab("lots")}
                    className={`rounded-md px-3 py-1.5 text-xs font-bold transition ${
                      activeSubTab === "lots" ? "bg-white text-blue-700 shadow-xs border border-slate-200 dark:bg-slate-900 dark:text-white dark:border-slate-800" : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
                    }`}
                  >
                    Active Lots
                  </button>
                  <button
                    onClick={() => setActiveSubTab("movements")}
                    className={`rounded-md px-3 py-1.5 text-xs font-bold transition ${
                      activeSubTab === "movements" ? "bg-white text-blue-700 shadow-xs border border-slate-200 dark:bg-slate-900 dark:text-white dark:border-slate-800" : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
                    }`}
                  >
                    Movement ledger
                  </button>
                  {canWrite && (
                    <>
                      <button
                        onClick={() => setActiveSubTab("restock")}
                        className={`flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-bold transition ${
                          activeSubTab === "restock" ? "bg-white text-blue-700 shadow-xs border border-slate-200 dark:bg-slate-900 dark:text-white dark:border-slate-800" : "text-slate-550 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
                        }`}
                      >
                        <PlusCircle className="size-3" />
                        Add Stock Lot
                      </button>
                      <button
                        onClick={() => setActiveSubTab("adjust")}
                        className={`flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-bold transition ${
                          activeSubTab === "adjust" ? "bg-white text-blue-700 shadow-xs border border-slate-200 dark:bg-slate-900 dark:text-white dark:border-slate-800" : "text-slate-550 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
                        }`}
                      >
                        <ArrowUpDown className="size-3" />
                        Manual Audit
                      </button>
                    </>
                  )}
                </div>

                {/* Content Panel */}
                <div>
                  {/* 1. Lots Tab */}
                  {activeSubTab === "lots" && (
                    <div>
                      {lots.length === 0 ? (
                        <p className="text-xs text-slate-500 py-4 text-center dark:text-slate-400">No restock lots recorded. Restock via restock tab to initialize FIFO.</p>
                      ) : (
                        <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs min-w-[500px]">
                          <thead>
                            <tr className="border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50">
                              <th className="px-2.5 py-2">Lot Number</th>
                              <th className="px-2.5 py-2">Purchase Date</th>
                              <th className="px-2.5 py-2 text-right">Received</th>
                              <th className="px-2.5 py-2 text-right">Remaining</th>
                              <th className="px-2.5 py-2 text-right">Unit Cost</th>
                              <th className="px-2.5 py-2">Supplier</th>
                              <th className="px-2.5 py-2">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {lots.map((l) => (
                              <tr key={l.id} className="border-b border-slate-100 hover:bg-white/50">
                                <td className="px-2.5 py-2 font-mono font-bold text-slate-800">{l.lot_number ?? "—"}</td>
                                <td className="px-2.5 py-2 text-slate-600">{fmtDate(l.purchase_date)}</td>
                                <td className="px-2.5 py-2 text-right text-slate-600">{formatNumber(l.quantity_received)}</td>
                                <td className="px-2.5 py-2 text-right font-black text-slate-800">{formatNumber(l.quantity_remaining)}</td>
                                <td className="px-2.5 py-2 text-right font-semibold text-slate-700">{formatCurrency(l.unit_cost, currency)}</td>
                                <td className="px-2.5 py-2 text-slate-600">{l.supplier_name ?? "—"}</td>
                                <td className="px-2.5 py-2">
                                  {l.is_active && l.quantity_remaining > 0 ? (
                                    <span className="rounded bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-800 uppercase">Available</span>
                                  ) : (
                                    <span className="rounded bg-slate-100 border border-slate-200 px-1.5 py-0.5 text-[9px] font-bold text-slate-500 uppercase">Exhausted</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* 2. Movements Tab */}
                {activeSubTab === "movements" && (
                  <div>
                    {movements.length === 0 ? (
                      <p className="text-xs text-slate-500 py-4 text-center">No inventory movements recorded yet.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs min-w-[500px]">
                          <thead>
                            <tr className="border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50">
                              <th className="px-2.5 py-2">Date</th>
                              <th className="px-2.5 py-2">Type</th>
                              <th className="px-2.5 py-2 text-right">Quantity</th>
                              <th className="px-2.5 py-2 text-right">Unit Cost</th>
                              <th className="px-2.5 py-2">References</th>
                              <th className="px-2.5 py-2">Staff</th>
                              <th className="px-2.5 py-2">Audit Notes</th>
                            </tr>
                          </thead>
                          <tbody>
                            {movements.map((m) => (
                              <tr key={m.id} className="border-b border-slate-100 hover:bg-white/50">
                                <td className="px-2.5 py-2 text-slate-500 whitespace-nowrap">{fmtDate(m.created_at)}</td>
                                <td className="px-2.5 py-2">
                                  <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                                    m.movement_type === "purchase" || m.movement_type === "adjustment_in"
                                      ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                                      : m.movement_type === "sale" || m.movement_type === "adjustment_out"
                                      ? "bg-red-50 text-red-700 border border-red-100"
                                      : "bg-blue-50 text-blue-700 border border-blue-100"
                                  }`}>
                                    {m.movement_type.replace("_", " ")}
                                  </span>
                                </td>
                                <td className="px-2.5 py-2 text-right font-bold text-slate-800">
                                  {m.movement_type === "sale" || m.movement_type === "adjustment_out" || m.movement_type === "return_out" ? "-" : "+"}
                                  {formatNumber(m.quantity)}
                                </td>
                                <td className="px-2.5 py-2 text-right text-slate-600">{m.unit_cost ? formatCurrency(m.unit_cost, currency) : "—"}</td>
                                <td className="px-2.5 py-2 font-mono text-slate-600">
                                  {m.invoice_no ? `Invoice: ${m.invoice_no}` : m.reference_type ?? "—"}
                                </td>
                                <td className="px-2.5 py-2 text-slate-600">{m.created_by_name ?? "System"}</td>
                                <td className="px-2.5 py-2 text-slate-550 italic max-w-[200px] truncate" title={m.notes ?? ""}>{m.notes ?? "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* 3. Restock Form */}
                {activeSubTab === "restock" && (
                  <form action={lotAction} className="rounded-lg bg-white border border-slate-200 p-4 space-y-3">
                    <h5 className="text-xs font-bold text-slate-800 uppercase flex items-center gap-1.5">
                      <PlusCircle className="size-3.5 text-blue-700" />
                      Add restock cost batch lot for {productName}
                    </h5>

                    {lotState.error && (
                      <p className="rounded bg-red-50 border border-red-100 px-3 py-2 text-xs font-semibold text-red-700">{lotState.error}</p>
                    )}
                    {lotState.success && (
                      <p className="rounded bg-emerald-50 border border-emerald-100 px-3 py-2 text-xs font-semibold text-emerald-800">{lotState.success}</p>
                    )}

                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block text-xs font-bold text-slate-600">
                        Received Quantity *
                        <input
                          type="number"
                          name="quantity_received"
                          min="1"
                          required
                          className="mt-1 h-9 w-full rounded-md border border-slate-200 px-2 outline-none focus:border-blue-600 text-sm font-semibold"
                        />
                      </label>
                      <label className="block text-xs font-bold text-slate-600">
                        Unit Purchase Cost ({currency}) *
                        <input
                          type="number"
                          name="unit_cost"
                          min="0"
                          step="0.01"
                          required
                          className="mt-1 h-9 w-full rounded-md border border-slate-200 px-2 outline-none focus:border-blue-600 text-sm font-semibold"
                        />
                      </label>
                      <label className="block text-xs font-bold text-slate-600">
                        Supplier (Optional)
                        <select
                          name="supplier_id"
                          className="mt-1 h-9 w-full rounded-md border border-slate-200 px-2 outline-none focus:border-blue-600 text-sm font-semibold bg-white"
                        >
                          <option value="">No supplier</option>
                          {suppliers.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name} {s.company ? `(${s.company})` : ""}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block text-xs font-bold text-slate-600">
                        Lot Number (Optional)
                        <input
                          type="text"
                          name="lot_number"
                          placeholder="e.g. BATCH-A1"
                          className="mt-1 h-9 w-full rounded-md border border-slate-200 px-2 outline-none focus:border-blue-600 text-sm font-semibold"
                        />
                      </label>
                      <label className="block text-xs font-bold text-slate-600">
                        Purchase Date (Optional)
                        <input
                          type="date"
                          name="purchase_date"
                          defaultValue={new Date().toISOString().split("T")[0]}
                          className="mt-1 h-9 w-full rounded-md border border-slate-200 px-2 outline-none focus:border-blue-600 text-sm font-semibold"
                        />
                      </label>
                      <label className="block text-xs font-bold text-slate-600">
                        Audit remarks notes
                        <input
                          type="text"
                          name="notes"
                          placeholder="Restock notes..."
                          className="mt-1 h-9 w-full rounded-md border border-slate-200 px-2 outline-none focus:border-blue-600 text-sm font-semibold"
                        />
                      </label>
                    </div>

                    <button
                      type="submit"
                      disabled={pending}
                      className="h-10 rounded-md bg-blue-700 text-xs font-bold text-white px-4 hover:bg-blue-800 disabled:opacity-60 flex items-center justify-center gap-1.5"
                    >
                      {pending && <Loader2 className="size-3.5 animate-spin" />}
                      Add Restock Lot Batch
                    </button>
                  </form>
                )}

                {/* 4. Manual Stock Adjustment Form */}
                {activeSubTab === "adjust" && (
                  <form action={adjustAction} className="rounded-lg bg-white border border-slate-200 p-4 space-y-3">
                    <h5 className="text-xs font-bold text-slate-800 uppercase flex items-center gap-1.5">
                      <ArrowUpDown className="size-3.5 text-blue-700" />
                      Perform Manual Inventory Audit/Adjustment for {productName}
                    </h5>

                    <p className="text-[11px] text-amber-800 bg-amber-50 rounded p-2.5 flex items-start gap-1">
                      <Info className="size-3.5 shrink-0 mt-0.5" />
                      <span>
                        <strong>Safety Warning:</strong> Adjustment Out consumes active lots FIFO, and Adjustment In inserts a batch using the product&apos;s dynamic weighted average unit cost. Ensure details are traceably documented.
                      </span>
                    </p>

                    {adjustState.error && (
                      <p className="rounded bg-red-50 border border-red-100 px-3 py-2 text-xs font-semibold text-red-700">{adjustState.error}</p>
                    )}
                    {adjustState.success && (
                      <p className="rounded bg-emerald-50 border border-emerald-100 px-3 py-2 text-xs font-semibold text-emerald-800">{adjustState.success}</p>
                    )}

                    <div className="grid gap-3 sm:grid-cols-3">
                      <label className="block text-xs font-bold text-slate-600">
                        Adjustment Type *
                        <select
                          name="adjustment_type"
                          required
                          className="mt-1 h-9 w-full rounded-md border border-slate-200 px-2 outline-none focus:border-blue-600 text-sm font-semibold bg-white"
                        >
                          <option value="in">Adjustment IN (+ Stock)</option>
                          <option value="out">Adjustment OUT (- Stock)</option>
                        </select>
                      </label>
                      <label className="block text-xs font-bold text-slate-600">
                        Audit Quantity *
                        <input
                          type="number"
                          name="quantity"
                          min="1"
                          required
                          className="mt-1 h-9 w-full rounded-md border border-slate-200 px-2 outline-none focus:border-blue-600 text-sm font-semibold"
                        />
                      </label>
                      <label className="block text-xs font-bold text-slate-600">
                        Reason / Audit details *
                        <input
                          type="text"
                          name="notes"
                          required
                          placeholder="Audit reason..."
                          className="mt-1 h-9 w-full rounded-md border border-slate-200 px-2 outline-none focus:border-blue-600 text-sm font-semibold"
                        />
                      </label>
                    </div>

                    <button
                      type="submit"
                      disabled={pending}
                      className="h-10 rounded-md bg-slate-900 text-xs font-bold text-white px-4 hover:bg-slate-800 disabled:opacity-60 flex items-center justify-center gap-1.5"
                    >
                      {pending && <Loader2 className="size-3.5 animate-spin" />}
                      Execute Adjustment
                    </button>
                  </form>
                )}
              </div>
            </div>
          )}
          </div>
        </div>
      )}
    </div>
  );
}
