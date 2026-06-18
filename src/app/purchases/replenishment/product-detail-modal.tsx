"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
// Rendered only client-side (opened on a user click), so `document` is available.
import { X, ClipboardList, Building2, Phone, Mail, UserPlus, Loader2, CheckCircle2 } from "lucide-react";
import type { ReplenishmentSuggestion, ReplenishmentPriority, ActiveSupplier } from "@/lib/data/replenishment";
import { formatCurrency, formatNumber } from "@/lib/formatters";
import { AppSelect } from "@/components/ui/app-select";
import { saveSupplierAction } from "@/app/products/actions";
import { assignProductSupplierAction, listActiveSuppliersAction } from "./supplier-actions";

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
const UNASSIGNED = "__unassigned__";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-2.5 last:border-b-0 dark:border-white/[0.06]">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</span>
      <span className="text-right text-sm font-semibold text-slate-900 dark:text-slate-100">{value}</span>
    </div>
  );
}

/**
 * Product detail popup opened from the Replenishment table. All product data is
 * read-only EXCEPT the supplier, which can be assigned/changed/cleared (the only
 * product-data write). Nothing else here changes name, price, stock, etc.
 */
export function ProductDetailModal({
  suggestion,
  allSuppliers,
  currency,
  showCosts,
  onCreatePo,
  onClose,
}: {
  suggestion: ReplenishmentSuggestion;
  allSuppliers: ActiveSupplier[];
  currency: string;
  showCosts: boolean;
  onCreatePo: () => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const s = suggestion;

  const [suppliers, setSuppliers] = useState<ActiveSupplier[]>(allSuppliers);
  // The product's current saved supplier (updates after a successful assignment).
  const [currentSupplierId, setCurrentSupplierId] = useState<string | null>(s.supplierId);
  const [assignSel, setAssignSel] = useState<string>(s.supplierId ?? UNASSIGNED);
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [assignSuccess, setAssignSuccess] = useState<string | null>(null);

  // Quick add supplier
  const [qaOpen, setQaOpen] = useState(false);
  const [qaName, setQaName] = useState("");
  const [qaCompany, setQaCompany] = useState("");
  const [qaPhone, setQaPhone] = useState("");
  const [qaEmail, setQaEmail] = useState("");
  const [qaError, setQaError] = useState<string | null>(null);
  const [qaPending, setQaPending] = useState(false);

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

  const currentSupplierName = useMemo(() => {
    if (!currentSupplierId) return s.supplierName ?? null;
    return suppliers.find((x) => x.id === currentSupplierId)?.name ?? s.supplierName ?? null;
  }, [currentSupplierId, suppliers, s.supplierName]);

  const supplierContact = currentSupplierId
    ? (() => {
        const sup = suppliers.find((x) => x.id === currentSupplierId);
        return [sup?.company ?? s.supplierCompany, sup?.phone ?? s.supplierPhone, sup?.email ?? s.supplierEmail].filter(Boolean) as string[];
      })()
    : [];

  const dirty = (assignSel === UNASSIGNED ? null : assignSel) !== currentSupplierId;

  const supplierOptions = useMemo(
    () => [{ value: UNASSIGNED, label: "Unassigned / no supplier" }, ...suppliers.map((x) => ({ value: x.id, label: x.company ? `${x.name} — ${x.company}` : x.name }))],
    [suppliers],
  );

  async function handleSaveAssignment() {
    const nextSupplierId = assignSel === UNASSIGNED ? null : assignSel;
    setAssigning(true);
    setAssignError(null);
    setAssignSuccess(null);
    try {
      const res = await assignProductSupplierAction(s.productId, nextSupplierId);
      if (!res.ok) {
        setAssignError(res.error);
        return;
      }
      setCurrentSupplierId(nextSupplierId);
      setAssignSuccess(nextSupplierId ? "Supplier assigned." : "Supplier cleared.");
      // Refresh the server-rendered replenishment table so the change shows immediately.
      router.refresh();
    } catch {
      setAssignError("We could not update the supplier right now. Please try again.");
    } finally {
      setAssigning(false);
    }
  }

  async function handleQuickAddSupplier() {
    if (!qaName.trim()) {
      setQaError("Supplier name is required.");
      return;
    }
    setQaPending(true);
    setQaError(null);
    try {
      const fd = new FormData();
      fd.set("name", qaName.trim());
      if (qaCompany.trim()) fd.set("company", qaCompany.trim());
      if (qaPhone.trim()) fd.set("phone", qaPhone.trim());
      if (qaEmail.trim()) fd.set("email", qaEmail.trim());
      const beforeIds = new Set(suppliers.map((x) => x.id));
      const res = await saveSupplierAction({ error: null, success: null }, fd);
      if (res.error) {
        setQaError(res.error);
        return;
      }
      const refreshed = await listActiveSuppliersAction();
      setSuppliers(refreshed);
      const created = refreshed.find((x) => !beforeIds.has(x.id)) ?? refreshed.find((x) => x.name.toLowerCase() === qaName.trim().toLowerCase());
      if (created) {
        setAssignSel(created.id);
        setAssignSuccess(null);
        setAssignError(null);
      }
      setQaOpen(false);
      setQaName("");
      setQaCompany("");
      setQaPhone("");
      setQaEmail("");
    } catch {
      setQaError("Could not save supplier right now. Please try again.");
    } finally {
      setQaPending(false);
    }
  }

  const inputClass =
    "h-11 w-full rounded-lg border border-slate-200 bg-[#fff] px-3 text-sm text-slate-900 focus:border-blue-400 focus:outline-none dark:border-white/10 dark:bg-white/[0.04] dark:text-white";

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-[#020617]/75 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <button type="button" aria-label="Close product details" className="absolute inset-0 cursor-default" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-detail-title"
        className="relative flex h-[100dvh] w-full max-w-lg flex-col overflow-hidden border border-slate-200 bg-[#fff] shadow-2xl dark:border-white/10 dark:bg-slate-900 sm:h-auto sm:max-h-[92dvh] sm:rounded-3xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-white/[0.06] sm:px-5">
          <div className="min-w-0">
            <h2 id="product-detail-title" className="truncate text-lg font-black text-slate-950 dark:text-white">{s.productName}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {s.sku && <span className="text-xs text-slate-500 dark:text-slate-400">SKU: {s.sku}</span>}
              <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${priorityColor[s.priority]}`}>{PRIORITY_TEXT[s.priority]}</span>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex size-9 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10">
            <X className="size-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 sm:px-5">
          {/* Supplier — assignable */}
          <div className="mb-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-3 dark:border-white/10 dark:bg-white/[0.02]">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">Supplier</p>
            <p className="mt-0.5 text-base font-bold text-slate-900 dark:text-slate-100">{currentSupplierName ?? "Unassigned"}</p>
            {supplierContact.length > 0 && (
              <div className="mt-1 flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
                {supplierContact[0] && <span className="inline-flex items-center gap-1.5"><Building2 className="size-3" />{supplierContact[0]}</span>}
                {currentSupplierId && suppliers.find((x) => x.id === currentSupplierId)?.phone && <span className="inline-flex items-center gap-1.5"><Phone className="size-3" />{suppliers.find((x) => x.id === currentSupplierId)?.phone}</span>}
                {currentSupplierId && suppliers.find((x) => x.id === currentSupplierId)?.email && <span className="inline-flex items-center gap-1.5"><Mail className="size-3" />{suppliers.find((x) => x.id === currentSupplierId)?.email}</span>}
              </div>
            )}

            <div className="mt-3">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Assign / change supplier</span>
              <AppSelect value={assignSel} onChange={(v) => { setAssignSel(v); setAssignSuccess(null); setAssignError(null); }} options={supplierOptions} ariaLabel="Assign supplier" searchable buttonClassName="mt-1 h-11 text-sm" className="w-full" />
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => setQaOpen((v) => !v)} className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:underline dark:text-blue-300"><UserPlus className="size-3.5" /> Quick add supplier</button>
                {assignSel !== UNASSIGNED && <button type="button" onClick={() => { setAssignSel(UNASSIGNED); setAssignSuccess(null); setAssignError(null); }} className="text-xs font-semibold text-slate-500 hover:underline dark:text-slate-400">Clear supplier</button>}
              </div>

              {qaOpen && (
                <div className="mt-2 rounded-xl border border-blue-200 bg-blue-50/60 p-3 dark:border-blue-900/50 dark:bg-blue-950/20">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <input type="text" value={qaName} onChange={(e) => setQaName(e.target.value)} placeholder="Supplier name (required)" className={inputClass} aria-label="New supplier name" />
                    <input type="text" value={qaCompany} onChange={(e) => setQaCompany(e.target.value)} placeholder="Company (optional)" className={inputClass} aria-label="New supplier company" />
                    <input type="text" value={qaPhone} onChange={(e) => setQaPhone(e.target.value)} placeholder="Phone (optional)" className={inputClass} aria-label="New supplier phone" />
                    <input type="email" value={qaEmail} onChange={(e) => setQaEmail(e.target.value)} placeholder="Email (optional)" className={inputClass} aria-label="New supplier email" />
                  </div>
                  {qaError && <p className="mt-2 text-xs font-medium text-rose-600 dark:text-rose-300">{qaError}</p>}
                  <div className="mt-2 flex items-center justify-end gap-2">
                    <button type="button" onClick={() => setQaOpen(false)} className="rounded-lg border border-slate-200 bg-[#fff] px-3 py-2 text-xs font-semibold text-slate-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300">Cancel</button>
                    <button type="button" onClick={handleQuickAddSupplier} disabled={qaPending} className="rounded-lg bg-[#0b2f6f] px-3 py-2 text-xs font-bold text-white disabled:opacity-60">{qaPending ? "Saving…" : "Save supplier"}</button>
                  </div>
                </div>
              )}

              {assignError && <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 dark:bg-rose-900/20 dark:text-rose-300">{assignError}</p>}
              {assignSuccess && <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300"><CheckCircle2 className="size-3.5" />{assignSuccess}</p>}

              <button type="button" onClick={handleSaveAssignment} disabled={assigning || !dirty} className="mt-2 inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-[#0b2f6f] text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50">
                {assigning ? (<><Loader2 className="size-4 animate-spin" /> Saving…</>) : "Save supplier assignment"}
              </button>
            </div>
          </div>

          {/* Stock + order (read-only) */}
          <div className="rounded-2xl border border-slate-200 px-3 dark:border-white/10">
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
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-4 py-3 dark:border-white/[0.06] dark:bg-white/[0.02] sm:px-5">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 bg-[#fff] px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300">Close</button>
          <button type="button" onClick={() => { onClose(); onCreatePo(); }} className="inline-flex items-center gap-1.5 rounded-lg bg-[#0b2f6f] px-3 py-2 text-sm font-bold text-white transition hover:opacity-90">
            <ClipboardList className="size-4" />
            {currentSupplierId ? "Create PO for this supplier" : "Create PO without supplier"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
