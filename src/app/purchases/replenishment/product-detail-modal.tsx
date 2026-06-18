"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
// Rendered only client-side (opened on a user click), so `document` is available.
import { X, ClipboardList, Building2, Phone, Mail } from "lucide-react";
import type { ReplenishmentSuggestion, ReplenishmentPriority } from "@/lib/data/replenishment";
import { formatCurrency, formatNumber } from "@/lib/formatters";

const PRIORITY_TEXT: Record<ReplenishmentPriority, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
};
const priorityColor: Record<ReplenishmentPriority, string> = {
  critical: "text-rose-700 bg-rose-50 dark:text-rose-300 dark:bg-rose-900/20",
  high: "text-amber-700 bg-amber-50 dark:text-amber-300 dark:bg-amber-900/20",
  medium: "text-blue-700 bg-blue-50 dark:text-blue-300 dark:bg-blue-900/20",
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-2 last:border-b-0 dark:border-white/[0.06]">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</span>
      <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 text-right">{value}</span>
    </div>
  );
}

/**
 * Read-only product detail popup opened from the Replenishment table. It only
 * displays existing row data — it does not fetch, edit, or change anything.
 */
export function ProductDetailModal({
  suggestion,
  currency,
  showCosts,
  onCreatePo,
  onClose,
}: {
  suggestion: ReplenishmentSuggestion;
  currency: string;
  showCosts: boolean;
  onCreatePo: () => void;
  onClose: () => void;
}) {
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

  const s = suggestion;
  const supplierContact = [s.supplierCompany, s.supplierPhone, s.supplierEmail].filter(Boolean);

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-[#020617]/75 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <button type="button" aria-label="Close product details" className="absolute inset-0 cursor-default" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-detail-title"
        className="relative flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-slate-200 bg-[#fff] shadow-2xl dark:border-white/10 dark:bg-slate-900 sm:rounded-3xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-white/[0.06] sm:px-5">
          <div className="min-w-0">
            <h2 id="product-detail-title" className="truncate text-base font-black text-slate-950 dark:text-white">{s.productName}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {s.sku && <span className="text-xs text-slate-500 dark:text-slate-400">SKU: {s.sku}</span>}
              <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${priorityColor[s.priority]}`}>{PRIORITY_TEXT[s.priority]}</span>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex size-9 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10">
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 sm:px-5">
          {/* Supplier */}
          <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3 dark:border-white/10 dark:bg-white/[0.02]">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">Supplier</p>
            <p className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-slate-100">{s.supplierName ?? "Unassigned"}</p>
            {supplierContact.length > 0 && (
              <div className="mt-1 flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
                {s.supplierCompany && <span className="inline-flex items-center gap-1.5"><Building2 className="size-3" />{s.supplierCompany}</span>}
                {s.supplierPhone && <span className="inline-flex items-center gap-1.5"><Phone className="size-3" />{s.supplierPhone}</span>}
                {s.supplierEmail && <span className="inline-flex items-center gap-1.5"><Mail className="size-3" />{s.supplierEmail}</span>}
              </div>
            )}
          </div>

          {/* Stock + order */}
          <div className="rounded-xl border border-slate-200 px-3 dark:border-white/10">
            <Row label="Current stock" value={formatNumber(s.currentStock)} />
            <Row label="Minimum stock" value={formatNumber(s.minimumStock)} />
            <Row label="Target stock" value={formatNumber(s.targetStock)} />
            <Row label="Suggested order" value={formatNumber(s.suggestedQuantity)} />
            <Row label="Reason" value={s.reason || "—"} />
            {showCosts && <Row label="Last known unit cost" value={formatCurrency(s.purchasePrice, currency)} />}
            {showCosts && <Row label="Estimated total" value={s.estimatedCost !== null ? formatCurrency(s.estimatedCost, currency) : "—"} />}
          </div>
          {showCosts && (
            <p className="mt-1.5 text-[11px] italic text-slate-400 dark:text-slate-500">Last known cost / estimate only — confirm rates with supplier.</p>
          )}
          <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">Read-only details. Nothing here changes product data or stock.</p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-4 py-3 dark:border-white/[0.06] dark:bg-white/[0.02] sm:px-5">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 bg-[#fff] px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300">Close</button>
          <button type="button" onClick={() => { onClose(); onCreatePo(); }} className="inline-flex items-center gap-1.5 rounded-lg bg-[#0b2f6f] px-3 py-2 text-sm font-bold text-white transition hover:opacity-90">
            <ClipboardList className="size-4" />
            {s.supplierId ? "Create PO for this supplier" : "Create PO without supplier"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
