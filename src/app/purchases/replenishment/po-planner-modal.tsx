"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
// This modal is only ever rendered client-side (it is mounted in response to a
// user click, never during SSR), so `document` is always available here.
import Link from "next/link";
import { X, Printer, FileSpreadsheet, FileText, Trash2, Info, Plus, Tag, Copy, Eraser, RotateCcw, UserPlus } from "lucide-react";
import type { ReplenishmentSuggestion, ReplenishmentPriority, ActiveSupplier } from "@/lib/data/replenishment";
import { AppSelect } from "@/components/ui/app-select";
import { formatCurrency } from "@/lib/formatters";
import { saveSupplierAction } from "@/app/products/actions";
import { listActiveSuppliersAction } from "./supplier-actions";
import {
  downloadCsv,
  downloadXlsx,
  openPrintablePo,
  exportDateStamp,
  type PoMeta,
  type MetaPair,
} from "@/lib/replenishment/po-export";
import { buildPoColumns, mapPoDraftRows, type PoDraftItem } from "@/lib/replenishment/po-columns";

export type PoPrefill = {
  /** "all" | "__unassigned__" | supplierId */
  supplier: string;
  priorities: ReplenishmentPriority[];
};

/** An editable purchase-order draft row. Edits here NEVER touch the database. */
type PoRow = {
  id: string;
  isCustom: boolean;
  name: string;
  sku: string | null;
  supplierName: string | null;
  supplierCompany: string | null;
  supplierPhone: string | null;
  supplierEmail: string | null;
  currentStock: number | null;
  minimumStock: number | null;
  targetStock: number | null;
  quantity: number;
  price: string;
  lastKnownCost: number;
  note: string;
  priority: ReplenishmentPriority | null;
  reason: string;
};

const ALL_PRIORITIES: ReplenishmentPriority[] = ["critical", "high", "medium"];
const PRIORITY_TEXT: Record<ReplenishmentPriority, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
};

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "po";
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function rowFromSuggestion(s: ReplenishmentSuggestion): PoRow {
  return {
    id: s.productId,
    isCustom: false,
    name: s.productName,
    sku: s.sku,
    supplierName: s.supplierName,
    supplierCompany: s.supplierCompany,
    supplierPhone: s.supplierPhone,
    supplierEmail: s.supplierEmail,
    currentStock: s.currentStock,
    minimumStock: s.minimumStock,
    targetStock: s.targetStock,
    quantity: s.suggestedQuantity,
    price: "",
    lastKnownCost: s.purchasePrice,
    note: "",
    priority: s.priority,
    reason: s.reason,
  };
}

export function PoPlannerModal({
  suggestions,
  allSuppliers,
  currency,
  shopName,
  preparedByDefault,
  createSupplierHref,
  prefill,
  onClose,
}: {
  suggestions: ReplenishmentSuggestion[];
  allSuppliers: ActiveSupplier[];
  currency: string;
  shopName: string | null;
  preparedByDefault: string;
  createSupplierHref: string;
  prefill: PoPrefill;
  onClose: () => void;
}) {
  const initialPriorities = prefill.priorities.length > 0 ? prefill.priorities : ALL_PRIORITIES;

  function matchSuggestions(prio: ReplenishmentPriority[], supplier: string): ReplenishmentSuggestion[] {
    return suggestions.filter((s) => {
      if (!prio.includes(s.priority)) return false;
      if (supplier === "all") return true;
      if (supplier === "__unassigned__") return s.supplierId === null;
      return s.supplierId === supplier;
    });
  }

  const [priorities, setPriorities] = useState<ReplenishmentPriority[]>(initialPriorities);
  const [supplierSel, setSupplierSel] = useState<string>(prefill.supplier);
  const [suppliers, setSuppliers] = useState<ActiveSupplier[]>(allSuppliers);
  const [rows, setRows] = useState<PoRow[]>(() => matchSuggestions(initialPriorities, prefill.supplier).map(rowFromSuggestion));
  const [seq, setSeq] = useState(0);

  // PO document fields (draft/export-only)
  const [poTitle, setPoTitle] = useState("Purchase Order Draft");
  const [poReference, setPoReference] = useState(`PO-${exportDateStamp().replace(/-/g, "")}`);
  const [contactPerson, setContactPerson] = useState("");
  const [deliveryNote, setDeliveryNote] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("Please confirm current rates and availability.");
  const [preparedBy, setPreparedBy] = useState(preparedByDefault);
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes] = useState("");

  const [exportError, setExportError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Quick add supplier (reuses the existing saveSupplierAction)
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

  function rebuildRows(nextPriorities: ReplenishmentPriority[], nextSupplier: string) {
    const suggestionRows = matchSuggestions(nextPriorities, nextSupplier).map(rowFromSuggestion);
    setRows((prev) => [...suggestionRows, ...prev.filter((r) => r.isCustom)]);
    setExportError(null);
  }
  function togglePriority(p: ReplenishmentPriority) {
    const next = priorities.includes(p) ? priorities.filter((x) => x !== p) : [...priorities, p];
    if (next.length === 0) return;
    setPriorities(next);
    rebuildRows(next, supplierSel);
  }
  function changeSupplier(v: string) {
    setSupplierSel(v);
    rebuildRows(priorities, v);
  }
  function updateRow(id: string, patch: Partial<PoRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  function removeRow(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }
  function duplicateRow(id: string) {
    setSeq((n) => n + 1);
    setRows((prev) => {
      const idx = prev.findIndex((r) => r.id === id);
      if (idx === -1) return prev;
      const copy: PoRow = { ...prev[idx], id: `dup-${seq + 1}`, isCustom: true };
      const next = [...prev];
      next.splice(idx + 1, 0, copy);
      return next;
    });
  }
  function clearPrice(id: string) {
    updateRow(id, { price: "" });
  }
  function fillBlankPricesWithLastCost() {
    setRows((prev) => prev.map((r) => (r.price === "" && r.lastKnownCost > 0 ? { ...r, price: String(round2(r.lastKnownCost)) } : r)));
  }
  function restoreSuggestedRows() {
    rebuildRows(priorities, supplierSel);
  }
  function addCustomRow() {
    setSeq((n) => n + 1);
    const single = suppliers.find((s) => s.id === supplierSel) ?? null;
    setRows((prev) => [
      ...prev,
      {
        id: `custom-${seq + 1}`,
        isCustom: true,
        name: "",
        sku: null,
        supplierName: single?.name ?? null,
        supplierCompany: single?.company ?? null,
        supplierPhone: single?.phone ?? null,
        supplierEmail: single?.email ?? null,
        currentStock: null,
        minimumStock: null,
        targetStock: null,
        quantity: 1,
        price: "",
        lastKnownCost: 0,
        note: "",
        priority: null,
        reason: "Custom item",
      },
    ]);
    setExportError(null);
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
      const beforeIds = new Set(suppliers.map((s) => s.id));
      const res = await saveSupplierAction({ error: null, success: null }, fd);
      if (res.error) {
        setQaError(res.error);
        return;
      }
      const refreshed = await listActiveSuppliersAction();
      setSuppliers(refreshed);
      const created =
        refreshed.find((s) => !beforeIds.has(s.id)) ??
        refreshed.find((s) => s.name.toLowerCase() === qaName.trim().toLowerCase());
      if (created) {
        setSupplierSel(created.id);
        rebuildRows(priorities, created.id);
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

  const selectedSupplier = useMemo(
    () => (supplierSel !== "all" && supplierSel !== "__unassigned__" ? suppliers.find((s) => s.id === supplierSel) ?? null : null),
    [suppliers, supplierSel],
  );

  const supplierLabel = useMemo(() => {
    if (supplierSel === "all") return "All suppliers";
    if (supplierSel === "__unassigned__") return "Unassigned / no supplier";
    return selectedSupplier?.name ?? "Supplier";
  }, [supplierSel, selectedSupplier]);

  const supplierDropdownOptions = useMemo(
    () => [
      { value: "all", label: "All suppliers" },
      { value: "__unassigned__", label: "Unassigned / no supplier" },
      ...suppliers.map((s) => ({ value: s.id, label: s.company ? `${s.name} — ${s.company}` : s.name })),
    ],
    [suppliers],
  );

  // Live summary
  const summary = useMemo(() => {
    let priced = 0;
    let quotedTotal = 0;
    for (const r of rows) {
      const p = r.price !== "" && Number.isFinite(Number(r.price)) && Number(r.price) >= 0 ? Number(r.price) : null;
      if (p !== null) {
        priced += 1;
        quotedTotal += r.quantity * p;
      }
    }
    return { total: rows.length, priced, unpriced: rows.length - priced, quotedTotal: round2(quotedTotal) };
  }, [rows]);

  const quotedTotalLabel = summary.priced > 0 ? formatCurrency(summary.quotedTotal, currency) : null;

  function toDraftItems(): PoDraftItem[] {
    return rows.map((r) => {
      const priceNum = r.price !== "" && Number.isFinite(Number(r.price)) && Number(r.price) >= 0 ? Number(r.price) : null;
      return {
        name: r.name.trim(),
        sku: r.sku,
        supplierName: r.supplierName,
        supplierCompany: r.supplierCompany,
        supplierPhone: r.supplierPhone,
        supplierEmail: r.supplierEmail,
        currentStock: r.currentStock,
        minimumStock: r.minimumStock,
        targetStock: r.targetStock,
        quantity: r.quantity,
        price: priceNum,
        note: r.note.trim(),
        priority: r.priority,
        reason: r.reason,
      };
    });
  }

  function validate(): string | null {
    if (rows.length === 0) return "No items in this purchase order draft. Add an item or change the filters.";
    for (const r of rows) {
      if (!r.name.trim()) return "Every item needs a name. Fill in or remove the blank item name.";
      if (!Number.isFinite(r.quantity) || r.quantity < 0) return "Quantity cannot be negative.";
      if (r.price !== "" && (!Number.isFinite(Number(r.price)) || Number(r.price) < 0)) return "Price cannot be negative.";
    }
    return null;
  }

  function metaPairs(): MetaPair[] {
    const pairs: MetaPair[] = [];
    pairs.push(["Document", poTitle.trim() || "Purchase Order Draft"]);
    if (poReference.trim()) pairs.push(["Reference", poReference.trim()]);
    if (shopName) pairs.push(["Shop", shopName]);
    pairs.push(["Supplier", supplierLabel]);
    if (contactPerson.trim()) pairs.push(["Contact person", contactPerson.trim()]);
    if (selectedSupplier?.company) pairs.push(["Company", selectedSupplier.company]);
    if (selectedSupplier?.phone) pairs.push(["Phone", selectedSupplier.phone]);
    if (selectedSupplier?.email) pairs.push(["Email", selectedSupplier.email]);
    pairs.push(["Priorities", priorities.map((p) => PRIORITY_TEXT[p]).join(", ")]);
    if (preparedBy.trim()) pairs.push(["Prepared by", preparedBy.trim()]);
    if (expectedDate) pairs.push(["Expected date", expectedDate]);
    if (deliveryNote.trim()) pairs.push(["Delivery / location", deliveryNote.trim()]);
    if (paymentTerms.trim()) pairs.push(["Payment / terms", paymentTerms.trim()]);
    if (notes.trim()) pairs.push(["PO notes", notes.trim()]);
    if (quotedTotalLabel) pairs.push(["Quoted total (priced rows only)", quotedTotalLabel]);
    pairs.push(["Note", "Draft purchase order — prices are quoted/draft only. Confirm with supplier. Not a payment or stock record."]);
    return pairs;
  }

  function buildMeta(): PoMeta {
    return {
      shopName,
      title: poTitle.trim() || "Purchase Order Draft",
      reference: poReference.trim() || null,
      supplierLabel,
      supplierCompany: selectedSupplier?.company ?? null,
      supplierPhone: selectedSupplier?.phone ?? null,
      supplierEmail: selectedSupplier?.email ?? null,
      contactPerson: contactPerson.trim() || null,
      priorities: priorities.map((p) => PRIORITY_TEXT[p]).join(", "),
      preparedBy: preparedBy.trim() || null,
      expectedDate: expectedDate || null,
      deliveryNote: deliveryNote.trim() || null,
      paymentTerms: paymentTerms.trim() || null,
      notes: notes.trim() || null,
      quotedTotalLabel,
      dateLabel: new Date().toLocaleDateString(),
    };
  }

  function filenameBase(): string {
    const scope = supplierSel === "all" ? "all-suppliers" : supplierSel === "__unassigned__" ? "unassigned" : slug(supplierLabel);
    return `saledock-purchase-order-${scope}-${exportDateStamp()}`;
  }

  function handleCsv() {
    const err = validate();
    if (err) return setExportError(err);
    setExportError(null);
    downloadCsv(`${filenameBase()}.csv`, buildPoColumns(currency), mapPoDraftRows(toDraftItems()), metaPairs());
  }
  async function handleXlsx() {
    const err = validate();
    if (err) return setExportError(err);
    setExportError(null);
    setBusy(true);
    try {
      await downloadXlsx(`${filenameBase()}.xlsx`, buildPoColumns(currency), mapPoDraftRows(toDraftItems()), metaPairs());
    } catch {
      setExportError("Excel export could not be generated. Please try CSV or Print.");
    } finally {
      setBusy(false);
    }
  }
  function handlePrint() {
    const err = validate();
    if (err) return setExportError(err);
    setExportError(null);
    const ok = openPrintablePo(buildMeta(), buildPoColumns(currency), mapPoDraftRows(toDraftItems()));
    if (!ok) setExportError("Your browser blocked the print window. Allow pop-ups and try again.");
  }

  const inputClass =
    "h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 focus:border-blue-400 focus:outline-none dark:border-white/10 dark:bg-white/[0.04] dark:text-white";

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-[#020617]/75 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <button type="button" aria-label="Close purchase order planner" className="absolute inset-0 cursor-default" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="po-planner-title"
        className="relative flex max-h-[94dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl border border-slate-200 bg-[#fff] shadow-2xl dark:border-white/10 dark:bg-slate-900 sm:rounded-3xl"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-white/[0.06] sm:px-5">
          <div>
            <h2 id="po-planner-title" className="text-base font-black text-slate-950 dark:text-white">Create purchase order draft</h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Edit everything freely — this is a draft for export only. No stock or product data will change.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex size-8 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10">
            <X className="size-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          {/* PO document fields */}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">PO title</span>
              <input type="text" value={poTitle} onChange={(e) => setPoTitle(e.target.value)} className={`mt-1 ${inputClass}`} />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Reference (optional)</span>
              <input type="text" value={poReference} onChange={(e) => setPoReference(e.target.value)} className={`mt-1 ${inputClass}`} />
            </label>
          </div>

          {/* Priorities + supplier */}
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Priorities</p>
              <div className="flex flex-wrap gap-1.5">
                {ALL_PRIORITIES.map((p) => {
                  const active = priorities.includes(p);
                  return (
                    <button key={p} type="button" onClick={() => togglePriority(p)} aria-pressed={active} className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${active ? "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-300" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-400"}`}>
                      {PRIORITY_TEXT[p]}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">Changing priorities or supplier rebuilds the suggested rows (custom rows are kept).</p>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Supplier</p>
              <AppSelect value={supplierSel} onChange={changeSupplier} options={supplierDropdownOptions} ariaLabel="Supplier" searchable buttonClassName="h-9 text-xs" className="w-full" />
              {selectedSupplier && (selectedSupplier.company || selectedSupplier.phone || selectedSupplier.email) && (
                <p className="mt-1.5 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
                  {[selectedSupplier.company, selectedSupplier.phone, selectedSupplier.email].filter(Boolean).join(" · ")}
                </p>
              )}
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => setQaOpen((v) => !v)} className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 hover:underline dark:text-blue-300">
                  <UserPlus className="size-3" /> Quick add supplier
                </button>
                <Link href={createSupplierHref} className="text-[11px] font-semibold text-slate-500 hover:underline dark:text-slate-400">
                  or manage in Products → Suppliers
                </Link>
              </div>
            </div>
          </div>

          {/* Quick add supplier */}
          {qaOpen && (
            <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50/50 p-3 dark:border-blue-900/50 dark:bg-blue-950/20">
              <p className="text-xs font-bold text-slate-700 dark:text-slate-200">Quick add supplier</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <input type="text" value={qaName} onChange={(e) => setQaName(e.target.value)} placeholder="Supplier name (required)" className={inputClass} aria-label="New supplier name" />
                <input type="text" value={qaCompany} onChange={(e) => setQaCompany(e.target.value)} placeholder="Company (optional)" className={inputClass} aria-label="New supplier company" />
                <input type="text" value={qaPhone} onChange={(e) => setQaPhone(e.target.value)} placeholder="Phone (optional)" className={inputClass} aria-label="New supplier phone" />
                <input type="email" value={qaEmail} onChange={(e) => setQaEmail(e.target.value)} placeholder="Email (optional)" className={inputClass} aria-label="New supplier email" />
              </div>
              {qaError && <p className="mt-2 text-[11px] font-medium text-rose-600 dark:text-rose-300">{qaError}</p>}
              <div className="mt-2 flex items-center justify-end gap-2">
                <button type="button" onClick={() => setQaOpen(false)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300">Cancel</button>
                <button type="button" onClick={handleQuickAddSupplier} disabled={qaPending} className="rounded-lg bg-[#0b2f6f] px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-60">
                  {qaPending ? "Saving…" : "Save supplier"}
                </button>
              </div>
            </div>
          )}

          {/* Contact / dates / terms */}
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Contact person (optional)</span>
              <input type="text" value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} className={`mt-1 ${inputClass}`} />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Expected date (optional)</span>
              <input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} className={`mt-1 ${inputClass}`} />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Prepared by (optional)</span>
              <input type="text" value={preparedBy} onChange={(e) => setPreparedBy(e.target.value)} placeholder="Name" className={`mt-1 ${inputClass}`} />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Delivery / location (optional)</span>
              <input type="text" value={deliveryNote} onChange={(e) => setDeliveryNote(e.target.value)} className={`mt-1 ${inputClass}`} />
            </label>
          </div>

          <label className="mt-3 block">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Payment / terms (optional)</span>
            <input type="text" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} className={`mt-1 ${inputClass}`} />
          </label>

          <label className="mt-3 block">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">PO notes (optional)</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Please confirm current rates and availability." className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-blue-400 focus:outline-none dark:border-white/10 dark:bg-white/[0.04] dark:text-white" />
          </label>

          {/* Items toolbar */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Items</p>
            <div className="flex flex-wrap items-center gap-1.5">
              <button type="button" onClick={fillBlankPricesWithLastCost} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300">
                <Tag className="size-3" /> Fill blank prices
              </button>
              <button type="button" onClick={restoreSuggestedRows} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300">
                <RotateCcw className="size-3" /> Restore suggested
              </button>
              <button type="button" onClick={addCustomRow} className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2 py-1.5 text-[11px] font-semibold text-blue-700 transition hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                <Plus className="size-3" /> Add custom item
              </button>
            </div>
          </div>

          {/* Live summary */}
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
            <span>Total rows: <strong className="text-slate-700 dark:text-slate-200">{summary.total}</strong></span>
            <span>Priced: <strong className="text-slate-700 dark:text-slate-200">{summary.priced}</strong></span>
            <span>No price: <strong className="text-slate-700 dark:text-slate-200">{summary.unpriced}</strong></span>
            {quotedTotalLabel && <span>Quoted total (priced only): <strong className="text-slate-700 dark:text-slate-200">{quotedTotalLabel}</strong></span>}
          </div>

          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Prices are draft / quoted only — leave blank to confirm with the supplier.</p>

          {rows.length === 0 ? (
            <div className="mt-2 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-8 text-center dark:border-white/10 dark:bg-white/[0.02]">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">No items yet</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Adjust priorities/supplier above, or use “Add custom item”.</p>
            </div>
          ) : (
            <div className="mt-2 space-y-2">
              {rows.map((r) => {
                const priceNum = r.price !== "" && Number.isFinite(Number(r.price)) ? Number(r.price) : null;
                const lineTotal = priceNum !== null && priceNum >= 0 ? round2(r.quantity * priceNum) : null;
                return (
                  <div key={r.id} className="rounded-xl border border-slate-200 p-3 dark:border-white/10">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <input type="text" value={r.name} onChange={(e) => updateRow(r.id, { name: e.target.value })} placeholder={r.isCustom ? "Custom item name" : "Item name"} aria-label="Item name" className={inputClass} />
                        <p className="mt-1 truncate text-[10px] text-slate-400 dark:text-slate-500">
                          {r.isCustom && !r.sku ? "Custom item" : `${r.sku ? `SKU: ${r.sku}` : ""}${r.priority ? ` · ${PRIORITY_TEXT[r.priority]}` : ""}${r.reason ? ` · ${r.reason}` : ""}`}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button type="button" onClick={() => duplicateRow(r.id)} aria-label={`Duplicate ${r.name || "item"}`} className="flex size-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/10">
                          <Copy className="size-3.5" />
                        </button>
                        <button type="button" onClick={() => removeRow(r.id)} aria-label={`Remove ${r.name || "item"}`} className="flex size-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-900/20">
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </div>

                    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <label className="block">
                        <span className="text-[10px] font-bold uppercase text-slate-400">Qty</span>
                        <input type="number" min={0} step={1} value={r.quantity} onChange={(e) => updateRow(r.id, { quantity: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} aria-label={`Order quantity for ${r.name || "item"}`} className={`mt-0.5 text-right ${inputClass}`} />
                      </label>
                      <label className="block">
                        <span className="text-[10px] font-bold uppercase text-slate-400">Unit price ({currency})</span>
                        <input type="number" min={0} step="0.01" value={r.price} onChange={(e) => { const v = e.target.value; updateRow(r.id, { price: v === "" || Number(v) >= 0 ? v : r.price }); }} placeholder="Blank" aria-label={`Unit price for ${r.name || "item"}`} className={`mt-0.5 text-right ${inputClass}`} />
                      </label>
                      <div className="block">
                        <span className="text-[10px] font-bold uppercase text-slate-400">Line total</span>
                        <div className="mt-0.5 flex h-9 items-center justify-end rounded-lg bg-slate-50 px-3 text-xs font-semibold text-slate-700 dark:bg-white/[0.03] dark:text-slate-200">
                          {lineTotal !== null ? `${currency} ${lineTotal.toLocaleString()}` : "—"}
                        </div>
                      </div>
                      <div className="flex items-end gap-1">
                        {r.lastKnownCost > 0 && (
                          <button type="button" onClick={() => updateRow(r.id, { price: String(round2(r.lastKnownCost)) })} className="h-9 flex-1 rounded-lg border border-slate-200 bg-white px-1 text-[10px] font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300">
                            Use last cost
                          </button>
                        )}
                        {r.price !== "" && (
                          <button type="button" onClick={() => clearPrice(r.id)} aria-label={`Clear price for ${r.name || "item"}`} className="flex size-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 transition hover:bg-slate-50 hover:text-slate-600 dark:border-white/10 dark:bg-white/[0.03]">
                            <Eraser className="size-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    <input type="text" value={r.note} onChange={(e) => updateRow(r.id, { note: e.target.value })} placeholder="Row note (optional)" aria-label={`Note for ${r.name || "item"}`} className={`mt-2 ${inputClass}`} />
                  </div>
                );
              })}
            </div>
          )}

          <p className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500">
            <Info className="size-3 shrink-0" />
            All edits here affect this draft export only. They do not change product names, stock, purchase prices, or supplier records.
          </p>

          {exportError && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 dark:bg-rose-900/20 dark:text-rose-300">{exportError}</p>}
        </div>

        {/* Footer actions */}
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-4 py-3 dark:border-white/[0.06] dark:bg-white/[0.02] sm:px-5">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300">Close</button>
          <button type="button" onClick={handleCsv} disabled={rows.length === 0} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-200">
            <FileText className="size-3.5" /> CSV
          </button>
          <button type="button" onClick={handleXlsx} disabled={rows.length === 0 || busy} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-200">
            <FileSpreadsheet className="size-3.5" /> {busy ? "Preparing…" : "Excel"}
          </button>
          <button type="button" onClick={handlePrint} disabled={rows.length === 0} className="inline-flex items-center gap-1.5 rounded-lg bg-[#0b2f6f] px-3 py-2 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-50">
            <Printer className="size-3.5" /> Print / PDF
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
