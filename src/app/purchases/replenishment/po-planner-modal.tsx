"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
// This modal is only ever rendered client-side (it is mounted in response to a
// user click, never during SSR), so `document` is always available here.
import Link from "next/link";
import { X, Printer, FileSpreadsheet, FileText, Trash2, Info } from "lucide-react";
import type { ReplenishmentSuggestion, ReplenishmentPriority } from "@/lib/data/replenishment";
import { AppSelect } from "@/components/ui/app-select";
import {
  downloadCsv,
  downloadXlsx,
  openPrintablePo,
  exportDateStamp,
  type PoMeta,
} from "@/lib/replenishment/po-export";
import { buildExportColumns, mapItemsToRows, type ExportItem } from "@/lib/replenishment/po-columns";

export type PoPrefill = {
  /** "all" | "__unassigned__" | supplierId */
  supplier: string;
  priorities: ReplenishmentPriority[];
};

type SupplierOption = { value: string; label: string };

const ALL_PRIORITIES: ReplenishmentPriority[] = ["critical", "high", "medium"];
const PRIORITY_TEXT: Record<ReplenishmentPriority, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
};

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "po";
}

export function PoPlannerModal({
  suggestions,
  supplierOptions,
  currency,
  shopName,
  preparedByDefault,
  createSupplierHref,
  prefill,
  onClose,
}: {
  suggestions: ReplenishmentSuggestion[];
  supplierOptions: SupplierOption[];
  currency: string;
  shopName: string | null;
  preparedByDefault: string;
  createSupplierHref: string;
  prefill: PoPrefill;
  onClose: () => void;
}) {
  const [priorities, setPriorities] = useState<ReplenishmentPriority[]>(
    prefill.priorities.length > 0 ? prefill.priorities : ALL_PRIORITIES,
  );
  const [supplierSel, setSupplierSel] = useState<string>(prefill.supplier);
  const [showCosts, setShowCosts] = useState(false);
  const [notes, setNotes] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [preparedBy, setPreparedBy] = useState(preparedByDefault);
  const [exportError, setExportError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Per-row draft edits (PO-only): removed rows and quantity overrides keyed by productId.
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [qtyOverrides, setQtyOverrides] = useState<Record<string, number>>({});

  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = original;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // Items matching the current priority + supplier selection (before per-row edits).
  const matchingItems = useMemo(() => {
    return suggestions.filter((s) => {
      if (!priorities.includes(s.priority)) return false;
      if (supplierSel === "all") return true;
      if (supplierSel === "__unassigned__") return s.supplierId === null;
      return s.supplierId === supplierSel;
    });
  }, [suggestions, priorities, supplierSel]);

  const draftItems = matchingItems.filter((s) => !removed.has(s.productId));

  function resetEdits() {
    setRemoved(new Set());
    setQtyOverrides({});
  }

  function togglePriority(p: ReplenishmentPriority) {
    setPriorities((prev) => {
      const next = prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p];
      return next.length === 0 ? prev : next; // keep at least one selected
    });
    resetEdits();
  }

  function qtyFor(s: ReplenishmentSuggestion): number {
    return qtyOverrides[s.productId] ?? s.suggestedQuantity;
  }

  const supplierLabel = useMemo(() => {
    if (supplierSel === "all") return "All suppliers";
    if (supplierSel === "__unassigned__") return "Unassigned / no supplier";
    return supplierOptions.find((o) => o.value === supplierSel)?.label ?? "Supplier";
  }, [supplierSel, supplierOptions]);

  const singleSupplier =
    supplierSel !== "all" && supplierSel !== "__unassigned__" ? draftItems[0] ?? null : null;

  function toExportItems(): ExportItem[] {
    return draftItems.map((s) => ({
      productName: s.productName,
      sku: s.sku,
      supplierName: s.supplierName,
      supplierCompany: s.supplierCompany,
      supplierPhone: s.supplierPhone,
      supplierEmail: s.supplierEmail,
      currentStock: s.currentStock,
      minimumStock: s.minimumStock,
      targetStock: s.targetStock,
      quantity: qtyFor(s),
      purchasePrice: s.purchasePrice,
      priority: s.priority,
      reason: s.reason,
    }));
  }

  function buildMeta(): PoMeta {
    return {
      shopName,
      supplierLabel,
      supplierCompany: singleSupplier?.supplierCompany ?? null,
      supplierPhone: singleSupplier?.supplierPhone ?? null,
      supplierEmail: singleSupplier?.supplierEmail ?? null,
      priorities: priorities.map((p) => PRIORITY_TEXT[p]).join(", "),
      preparedBy: preparedBy.trim() || null,
      expectedDate: expectedDate || null,
      notes: notes.trim() || null,
      showCosts,
      dateLabel: new Date().toLocaleDateString(),
    };
  }

  function filenameBase(): string {
    const scope =
      supplierSel === "all"
        ? "all-suppliers"
        : supplierSel === "__unassigned__"
        ? "unassigned"
        : slug(supplierLabel);
    return `saledock-purchase-order-${scope}-${exportDateStamp()}`;
  }

  function handleCsv() {
    if (draftItems.length === 0) return setExportError("No items in this purchase order draft.");
    setExportError(null);
    const columns = buildExportColumns(showCosts, currency);
    downloadCsv(`${filenameBase()}.csv`, columns, mapItemsToRows(toExportItems(), showCosts));
  }

  async function handleXlsx() {
    if (draftItems.length === 0) return setExportError("No items in this purchase order draft.");
    setExportError(null);
    setBusy(true);
    try {
      const columns = buildExportColumns(showCosts, currency);
      await downloadXlsx(`${filenameBase()}.xlsx`, columns, mapItemsToRows(toExportItems(), showCosts));
    } catch {
      setExportError("Excel export could not be generated. Please try CSV or Print.");
    } finally {
      setBusy(false);
    }
  }

  function handlePrint() {
    if (draftItems.length === 0) return setExportError("No items in this purchase order draft.");
    setExportError(null);
    const columns = buildExportColumns(showCosts, currency);
    const ok = openPrintablePo(
      "Purchase Order Draft",
      buildMeta(),
      columns,
      mapItemsToRows(toExportItems(), showCosts),
    );
    if (!ok) setExportError("Your browser blocked the print window. Allow pop-ups and try again.");
  }

  const priorityOptions: { value: string; label: string }[] = [
    { value: "all", label: "All suppliers" },
    { value: "__unassigned__", label: "Unassigned / no supplier" },
    ...supplierOptions,
  ];

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-[#020617]/75 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <button type="button" aria-label="Close purchase order planner" className="absolute inset-0 cursor-default" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="po-planner-title"
        className="relative flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl border border-slate-200 bg-[#fff] shadow-2xl dark:border-white/10 dark:bg-slate-900 sm:rounded-3xl"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-white/[0.06] sm:px-5">
          <div>
            <h2 id="po-planner-title" className="text-base font-black text-slate-950 dark:text-white">
              Create purchase order draft
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              No stock will change. Prices are not final — confirm rates with the supplier.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-8 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          {/* Controls */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Priorities</p>
              <div className="flex flex-wrap gap-1.5">
                {ALL_PRIORITIES.map((p) => {
                  const active = priorities.includes(p);
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => togglePriority(p)}
                      aria-pressed={active}
                      className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
                        active
                          ? "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-400"
                      }`}
                    >
                      {PRIORITY_TEXT[p]}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Supplier</p>
              <AppSelect
                value={supplierSel}
                onChange={(v) => {
                  setSupplierSel(v);
                  resetEdits();
                }}
                options={priorityOptions}
                ariaLabel="Supplier"
                buttonClassName="h-9 text-xs"
                className="w-full"
              />
              <Link
                href={createSupplierHref}
                className="mt-1.5 inline-block text-[11px] font-semibold text-blue-700 hover:underline dark:text-blue-300"
              >
                Need a new supplier? Add one in Products → Suppliers
              </Link>
            </div>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Expected date (optional)</span>
              <input
                type="date"
                value={expectedDate}
                onChange={(e) => setExpectedDate(e.target.value)}
                className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 focus:border-blue-400 focus:outline-none dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
              />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Prepared by (optional)</span>
              <input
                type="text"
                value={preparedBy}
                onChange={(e) => setPreparedBy(e.target.value)}
                placeholder="Name"
                className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 focus:border-blue-400 focus:outline-none dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
              />
            </label>
          </div>

          <label className="mt-4 block">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Notes (optional)</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Please confirm current rates and availability."
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-blue-400 focus:outline-none dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
            />
          </label>

          <label className="mt-4 flex items-center gap-2">
            <input type="checkbox" checked={showCosts} onChange={(e) => setShowCosts(e.target.checked)} />
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Show last known cost / estimate (off by default)
            </span>
          </label>

          {/* Items */}
          <div className="mt-4">
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Items ({draftItems.length})
              </p>
            </div>

            {draftItems.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-8 text-center dark:border-white/10 dark:bg-white/[0.02]">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">No matching items</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Adjust the priorities or supplier above to include items.
                </p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-white/10">
                <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-white/[0.06]">
                  {draftItems.map((s) => (
                    <div key={s.productId} className="flex items-center gap-3 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-slate-950 dark:text-white">{s.productName}</p>
                        <p className="truncate text-[10px] text-slate-400 dark:text-slate-500">
                          {s.sku ? `SKU: ${s.sku} · ` : ""}{PRIORITY_TEXT[s.priority]} · {s.reason}
                        </p>
                      </div>
                      <label className="flex shrink-0 items-center gap-1">
                        <span className="text-[10px] font-bold uppercase text-slate-400">Qty</span>
                        <input
                          type="number"
                          min={0}
                          value={qtyFor(s)}
                          onChange={(e) => {
                            const n = Math.max(0, Math.floor(Number(e.target.value) || 0));
                            setQtyOverrides((prev) => ({ ...prev, [s.productId]: n }));
                          }}
                          className="h-8 w-16 rounded-lg border border-slate-200 bg-white px-2 text-right text-xs text-slate-900 focus:border-blue-400 focus:outline-none dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
                          aria-label={`Order quantity for ${s.productName}`}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => setRemoved((prev) => new Set(prev).add(s.productId))}
                        aria-label={`Remove ${s.productName} from draft`}
                        className="flex size-7 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-900/20"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500">
              <Info className="size-3" />
              Editing quantity here only affects this draft export. It does not change product stock or settings.
            </p>
          </div>

          {exportError && (
            <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 dark:bg-rose-900/20 dark:text-rose-300">
              {exportError}
            </p>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-4 py-3 dark:border-white/[0.06] dark:bg-white/[0.02] sm:px-5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300"
          >
            Close
          </button>
          <button
            type="button"
            onClick={handleCsv}
            disabled={draftItems.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-200"
          >
            <FileText className="size-3.5" /> CSV
          </button>
          <button
            type="button"
            onClick={handleXlsx}
            disabled={draftItems.length === 0 || busy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-200"
          >
            <FileSpreadsheet className="size-3.5" /> {busy ? "Preparing…" : "Excel"}
          </button>
          <button
            type="button"
            onClick={handlePrint}
            disabled={draftItems.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0b2f6f] px-3 py-2 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            <Printer className="size-3.5" /> Print / PDF
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
