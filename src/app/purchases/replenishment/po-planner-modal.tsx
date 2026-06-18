"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
// Rendered only client-side (opened on a user click), so `document` is available.
import Link from "next/link";
import { X, Printer, FileSpreadsheet, FileText, Trash2, Plus, Tag, Copy, Eraser, RotateCcw, UserPlus, PackageSearch } from "lucide-react";
import type { ReplenishmentSuggestion, ReplenishmentPriority, ActiveSupplier, ActiveProduct } from "@/lib/data/replenishment";
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

type RowKind = "suggested" | "saved" | "custom";

/** An editable PO draft row. Edits here never touch the database. */
type PoRow = {
  id: string;
  kind: RowKind;
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
const PRIORITY_TEXT: Record<ReplenishmentPriority, string> = { critical: "Critical", high: "High", medium: "Medium" };

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "po";
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function rowFromSuggestion(s: ReplenishmentSuggestion): PoRow {
  return {
    id: s.productId,
    kind: "suggested",
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
  allProducts,
  currency,
  shopName,
  preparedByDefault,
  createSupplierHref,
  prefill,
  onClose,
}: {
  suggestions: ReplenishmentSuggestion[];
  allSuppliers: ActiveSupplier[];
  allProducts: ActiveProduct[];
  currency: string;
  shopName: string | null;
  preparedByDefault: string;
  createSupplierHref: string;
  prefill: PoPrefill;
  onClose: () => void;
}) {
  function matchSuggestions(prio: ReplenishmentPriority[], supplier: string): ReplenishmentSuggestion[] {
    return suggestions.filter((s) => {
      // Empty priorities => no priority filter (all low-stock for the supplier).
      if (prio.length > 0 && !prio.includes(s.priority)) return false;
      if (supplier === "all") return true;
      if (supplier === "__unassigned__") return s.supplierId === null;
      return s.supplierId === supplier;
    });
  }

  const initialSupplier = allSuppliers.find((s) => s.id === prefill.supplier) ?? null;

  const [priorities, setPriorities] = useState<ReplenishmentPriority[]>(prefill.priorities);
  const [supplierSel, setSupplierSel] = useState<string>(prefill.supplier);
  const [suppliers, setSuppliers] = useState<ActiveSupplier[]>(allSuppliers);
  const [rows, setRows] = useState<PoRow[]>(() => matchSuggestions(prefill.priorities, prefill.supplier).map(rowFromSuggestion));
  const [seq, setSeq] = useState(0);

  // Document
  const [poTitle, setPoTitle] = useState("Purchase Order");
  const [poReference, setPoReference] = useState(`PO-${exportDateStamp().replace(/-/g, "")}`);
  const [expectedDate, setExpectedDate] = useState("");
  const [preparedBy, setPreparedBy] = useState(preparedByDefault);

  // Editable supplier / send-to details (for this PO only — never saved back)
  const [poSupplierName, setPoSupplierName] = useState(initialSupplier?.name ?? "");
  const [poCompany, setPoCompany] = useState(initialSupplier?.company ?? "");
  const [poContact, setPoContact] = useState("");
  const [poPhone, setPoPhone] = useState(initialSupplier?.phone ?? "");
  const [poEmail, setPoEmail] = useState(initialSupplier?.email ?? "");

  // Terms & notes
  const [deliveryNote, setDeliveryNote] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("Please confirm current rates and availability.");
  const [notes, setNotes] = useState("");

  const [topError, setTopError] = useState<string | null>(null);
  const [invalidRowId, setInvalidRowId] = useState<string | null>(null);
  const [suggestionNote, setSuggestionNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Quick add supplier
  const [qaOpen, setQaOpen] = useState(false);
  const [qaName, setQaName] = useState("");
  const [qaCompany, setQaCompany] = useState("");
  const [qaPhone, setQaPhone] = useState("");
  const [qaEmail, setQaEmail] = useState("");
  const [qaError, setQaError] = useState<string | null>(null);
  const [qaPending, setQaPending] = useState(false);

  // Saved product picker value (reset after each add)
  const [savedPick, setSavedPick] = useState("");

  const bodyRef = useRef<HTMLDivElement | null>(null);
  const errorRef = useRef<HTMLDivElement | null>(null);
  const itemsRef = useRef<HTMLDivElement | null>(null);

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

  function prefillSupplierFields(sup: ActiveSupplier | null, fallbackLabel: string) {
    setPoSupplierName(sup?.name ?? (fallbackLabel === "All suppliers" || fallbackLabel === "Unassigned" ? "" : fallbackLabel));
    setPoCompany(sup?.company ?? "");
    setPoPhone(sup?.phone ?? "");
    setPoEmail(sup?.email ?? "");
    setPoContact("");
  }

  function rebuildSuggested(nextPriorities: ReplenishmentPriority[], nextSupplier: string, announce: boolean) {
    const suggestionRows = matchSuggestions(nextPriorities, nextSupplier).map(rowFromSuggestion);
    setRows((prev) => [...suggestionRows, ...prev.filter((r) => r.kind !== "suggested")]);
    if (announce) {
      setSuggestionNote(
        suggestionRows.length === 0
          ? "No low-stock suggestions match this supplier/priority. You can add saved products or custom items."
          : null,
      );
    } else {
      setSuggestionNote(null);
    }
    setTopError(null);
    setInvalidRowId(null);
  }

  function togglePriority(p: ReplenishmentPriority) {
    const next = priorities.includes(p) ? priorities.filter((x) => x !== p) : [...priorities, p];
    setPriorities(next);
    rebuildSuggested(next, supplierSel, false);
  }
  function changeSupplier(v: string) {
    setSupplierSel(v);
    const sup = suppliers.find((s) => s.id === v) ?? null;
    prefillSupplierFields(sup, v === "all" ? "All suppliers" : v === "__unassigned__" ? "Unassigned" : sup?.name ?? "");
    rebuildSuggested(priorities, v, false);
  }
  function updateRow(id: string, patch: Partial<PoRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    if (invalidRowId === id) {
      setInvalidRowId(null);
      setTopError(null);
    }
  }
  function removeRow(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }
  function focusRow(id: string) {
    requestAnimationFrame(() => {
      const el = itemsRef.current?.querySelector<HTMLInputElement>(`[data-row-name="${id}"]`);
      if (el) {
        el.focus();
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
  }
  function duplicateRow(id: string) {
    const newId = `dup-${seq + 1}`;
    setSeq((n) => n + 1);
    setRows((prev) => {
      const idx = prev.findIndex((r) => r.id === id);
      if (idx === -1) return prev;
      const copy: PoRow = { ...prev[idx], id: newId, kind: "custom" };
      const next = [...prev];
      next.splice(idx + 1, 0, copy);
      return next;
    });
  }
  function addCustomRow() {
    const newId = `custom-${seq + 1}`;
    setSeq((n) => n + 1);
    const sup = suppliers.find((s) => s.id === supplierSel) ?? null;
    setRows((prev) => [
      ...prev,
      {
        id: newId,
        kind: "custom",
        name: "",
        sku: null,
        supplierName: sup?.name ?? null,
        supplierCompany: sup?.company ?? null,
        supplierPhone: sup?.phone ?? null,
        supplierEmail: sup?.email ?? null,
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
    setTopError(null);
    focusRow(newId);
  }
  function addSavedProduct(productId: string) {
    const p = allProducts.find((x) => x.id === productId);
    if (!p) return;
    const newId = `saved-${p.id}-${seq + 1}`;
    setSeq((n) => n + 1);
    setRows((prev) => [
      ...prev,
      {
        id: newId,
        kind: "saved",
        name: p.name,
        sku: p.sku,
        supplierName: p.supplierName,
        supplierCompany: null,
        supplierPhone: null,
        supplierEmail: null,
        currentStock: p.currentStock,
        minimumStock: null,
        targetStock: null,
        quantity: 1,
        price: "",
        lastKnownCost: p.purchasePrice,
        note: "",
        priority: null,
        reason: "Saved product",
      },
    ]);
    setTopError(null);
    focusRow(newId);
  }
  function clearPrice(id: string) {
    updateRow(id, { price: "" });
  }
  function fillBlankPricesWithLastCost() {
    setRows((prev) => prev.map((r) => (r.price === "" && r.lastKnownCost > 0 ? { ...r, price: String(round2(r.lastKnownCost)) } : r)));
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
      const created = refreshed.find((s) => !beforeIds.has(s.id)) ?? refreshed.find((s) => s.name.toLowerCase() === qaName.trim().toLowerCase());
      if (created) {
        setSupplierSel(created.id);
        prefillSupplierFields(created, created.name);
        rebuildSuggested(priorities, created.id, false);
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

  const supplierDropdownOptions = useMemo(
    () => [
      { value: "all", label: "All suppliers" },
      { value: "__unassigned__", label: "Unassigned / no supplier" },
      ...suppliers.map((s) => ({ value: s.id, label: s.company ? `${s.name} — ${s.company}` : s.name })),
    ],
    [suppliers],
  );

  // Saved-product options: products for the selected supplier first, then the rest.
  const productOptions = useMemo(() => {
    const realSupplier = supplierSel !== "all" && supplierSel !== "__unassigned__" ? supplierSel : null;
    const mk = (p: ActiveProduct) => ({
      value: p.id,
      label: `${p.name}${p.sku ? ` · ${p.sku}` : ""}${p.supplierName ? ` (${p.supplierName})` : ""}`,
    });
    const sorted = realSupplier
      ? [...allProducts].sort((a, b) => {
          const aMatch = a.supplierId === realSupplier ? 0 : 1;
          const bMatch = b.supplierId === realSupplier ? 0 : 1;
          return aMatch - bMatch || a.name.localeCompare(b.name);
        })
      : allProducts;
    return [{ value: "", label: "Add a saved product…" }, ...sorted.map(mk)];
  }, [allProducts, supplierSel]);

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

  const supplierLabel = poSupplierName.trim() ||
    (supplierSel === "all" ? "All suppliers" : supplierSel === "__unassigned__" ? "Unassigned / no supplier" : "Supplier");

  function toDraftItems(): PoDraftItem[] {
    return rows.map((r) => {
      const priceNum = r.price !== "" && Number.isFinite(Number(r.price)) && Number(r.price) >= 0 ? Number(r.price) : null;
      return {
        name: r.name.trim(),
        sku: r.sku,
        supplierName: poSupplierName.trim() || r.supplierName,
        supplierCompany: null,
        supplierPhone: null,
        supplierEmail: null,
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

  function validate(): boolean {
    if (rows.length === 0) {
      setInvalidRowId(null);
      setTopError("Add at least one item to export this purchase order.");
      requestAnimationFrame(() => { bodyRef.current?.scrollTo({ top: 0, behavior: "smooth" }); errorRef.current?.scrollIntoView({ block: "center" }); });
      return false;
    }
    for (const r of rows) {
      if (!r.name.trim()) return failRow(r.id, "This item needs a product name.");
      if (!Number.isFinite(r.quantity) || r.quantity < 0) return failRow(r.id, "Quantity cannot be negative.");
      if (r.price !== "" && (!Number.isFinite(Number(r.price)) || Number(r.price) < 0)) return failRow(r.id, "Price cannot be negative.");
    }
    setTopError(null);
    setInvalidRowId(null);
    return true;
  }
  function failRow(id: string, message: string): boolean {
    setInvalidRowId(id);
    setTopError(message);
    requestAnimationFrame(() => {
      const el = itemsRef.current?.querySelector(`[data-row-id="${id}"]`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return false;
  }

  function metaPairs(): MetaPair[] {
    const pairs: MetaPair[] = [];
    pairs.push(["Document", poTitle.trim() || "Purchase Order"]);
    if (poReference.trim()) pairs.push(["Reference", poReference.trim()]);
    if (shopName) pairs.push(["Shop", shopName]);
    pairs.push(["Date", new Date().toLocaleDateString()]);
    pairs.push(["Supplier", supplierLabel]);
    const contact = [poContact.trim(), poCompany.trim(), poPhone.trim(), poEmail.trim()].filter(Boolean).join(" · ");
    if (contact) pairs.push(["Supplier contact", contact]);
    if (preparedBy.trim()) pairs.push(["Prepared by", preparedBy.trim()]);
    if (expectedDate) pairs.push(["Expected date", expectedDate]);
    if (deliveryNote.trim()) pairs.push(["Delivery / location", deliveryNote.trim()]);
    if (paymentTerms.trim()) pairs.push(["Payment / terms", paymentTerms.trim()]);
    if (notes.trim()) pairs.push(["Notes", notes.trim()]);
    if (quotedTotalLabel) pairs.push(["Quoted total", quotedTotalLabel]);
    return pairs;
  }
  function buildMeta(): PoMeta {
    return {
      shopName,
      title: poTitle.trim() || "Purchase Order",
      reference: poReference.trim() || null,
      supplierLabel,
      supplierCompany: poCompany.trim() || null,
      supplierPhone: poPhone.trim() || null,
      supplierEmail: poEmail.trim() || null,
      contactPerson: poContact.trim() || null,
      priorities: priorities.length > 0 ? priorities.map((p) => PRIORITY_TEXT[p]).join(", ") : "All items",
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
    const scope = poSupplierName.trim() ? slug(poSupplierName) : supplierSel === "__unassigned__" ? "unassigned" : "all-suppliers";
    return `saledock-purchase-order-${scope}-${exportDateStamp()}`;
  }

  function handleCsv() {
    if (!validate()) return;
    downloadCsv(`${filenameBase()}.csv`, buildPoColumns(currency), mapPoDraftRows(toDraftItems()), metaPairs());
  }
  async function handleXlsx() {
    if (!validate()) return;
    setBusy(true);
    try {
      await downloadXlsx(`${filenameBase()}.xlsx`, buildPoColumns(currency), mapPoDraftRows(toDraftItems()), metaPairs());
    } catch {
      setTopError("Excel export could not be generated. Please try CSV or Print.");
    } finally {
      setBusy(false);
    }
  }
  function handlePrint() {
    if (!validate()) return;
    const ok = openPrintablePo(buildMeta(), buildPoColumns(currency), mapPoDraftRows(toDraftItems()));
    if (!ok) setTopError("Your browser blocked the print window. Allow pop-ups and try again.");
  }

  const inputClass =
    "h-11 w-full rounded-lg border border-slate-200 bg-[#fff] px-3 text-sm text-slate-900 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:border-white/10 dark:bg-white/[0.04] dark:text-white";
  const labelClass = "text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400";
  const sectionClass = "rounded-2xl border border-slate-200 bg-[#fff] p-4 dark:border-white/10 dark:bg-white/[0.02]";
  const sectionTitle = "mb-3 text-sm font-black text-slate-950 dark:text-white";

  return createPortal(
    <div className="animate-fade-in fixed inset-0 z-[90] flex items-end justify-center bg-[#020617]/75 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <button type="button" aria-label="Close purchase order planner" className="absolute inset-0 cursor-default" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="po-planner-title"
        className="animate-scale-in relative flex h-[100dvh] w-full max-w-4xl flex-col overflow-hidden border border-slate-200 bg-slate-50 shadow-2xl dark:border-white/10 dark:bg-slate-900 sm:h-auto sm:max-h-[92dvh] sm:rounded-3xl"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-[#fff] px-4 py-3 dark:border-white/[0.06] dark:bg-slate-900 sm:px-5">
          <div>
            <h2 id="po-planner-title" className="text-lg font-black text-slate-950 dark:text-white">Build purchase order</h2>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">This PO is for ordering only.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex size-9 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10">
            <X className="size-5" />
          </button>
        </div>

        {/* Body */}
        <div ref={bodyRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
          {topError && (
            <div ref={errorRef} className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300">
              {topError}
            </div>
          )}

          {/* A. Document */}
          <section className={sectionClass}>
            <p className={sectionTitle}>Document</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block"><span className={labelClass}>PO title</span><input type="text" value={poTitle} onChange={(e) => setPoTitle(e.target.value)} className={`mt-1 ${inputClass}`} /></label>
              <label className="block"><span className={labelClass}>Reference</span><input type="text" value={poReference} onChange={(e) => setPoReference(e.target.value)} className={`mt-1 ${inputClass}`} /></label>
              <label className="block"><span className={labelClass}>Expected date</span><input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} className={`mt-1 ${inputClass}`} /></label>
              <label className="block"><span className={labelClass}>Prepared by</span><input type="text" value={preparedBy} onChange={(e) => setPreparedBy(e.target.value)} placeholder="Name" className={`mt-1 ${inputClass}`} /></label>
            </div>
          </section>

          {/* B. Supplier / Send to */}
          <section className={sectionClass}>
            <p className={sectionTitle}>Supplier / Send to</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <span className={labelClass}>Choose supplier</span>
                <AppSelect value={supplierSel} onChange={changeSupplier} options={supplierDropdownOptions} ariaLabel="Supplier" searchable buttonClassName="mt-1 h-11 text-sm" className="w-full" />
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => setQaOpen((v) => !v)} className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:underline dark:text-blue-300"><UserPlus className="size-3.5" /> Quick add supplier</button>
                  <Link href={createSupplierHref} className="text-xs font-semibold text-slate-500 hover:underline dark:text-slate-400">or manage suppliers</Link>
                </div>
              </div>
              <label className="block"><span className={labelClass}>Supplier name on PO</span><input type="text" value={poSupplierName} onChange={(e) => setPoSupplierName(e.target.value)} placeholder="Type or pick a supplier" className={`mt-1 ${inputClass}`} /></label>
              <label className="block"><span className={labelClass}>Company</span><input type="text" value={poCompany} onChange={(e) => setPoCompany(e.target.value)} className={`mt-1 ${inputClass}`} /></label>
              <label className="block"><span className={labelClass}>Contact person</span><input type="text" value={poContact} onChange={(e) => setPoContact(e.target.value)} className={`mt-1 ${inputClass}`} /></label>
              <label className="block"><span className={labelClass}>Phone</span><input type="text" value={poPhone} onChange={(e) => setPoPhone(e.target.value)} className={`mt-1 ${inputClass}`} /></label>
              <label className="block"><span className={labelClass}>Email</span><input type="email" value={poEmail} onChange={(e) => setPoEmail(e.target.value)} className={`mt-1 ${inputClass}`} /></label>
            </div>
            <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">Supplier details here are used on this PO only. They do not change your saved supplier.</p>

            {qaOpen && (
              <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50/60 p-3 dark:border-blue-900/50 dark:bg-blue-950/20">
                <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Quick add supplier</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
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
          </section>

          {/* C. Products */}
          <section className={sectionClass}>
            <p className={sectionTitle}>Products</p>

            <div className="flex flex-wrap items-center gap-1.5">
              {ALL_PRIORITIES.map((p) => {
                const active = priorities.includes(p);
                return (
                  <button key={p} type="button" onClick={() => togglePriority(p)} aria-pressed={active} className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${active ? "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-300" : "border-slate-200 bg-[#fff] text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-400"}`}>
                    {PRIORITY_TEXT[p]}
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">Optional — use priorities only if you want to start from low-stock suggestions.</p>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => rebuildSuggested(priorities, supplierSel, true)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-[#fff] px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300"><RotateCcw className="size-3.5" /> Restore low-stock suggestions</button>
              <button type="button" onClick={fillBlankPricesWithLastCost} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-[#fff] px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300"><Tag className="size-3.5" /> Fill blank prices</button>
              <button type="button" onClick={addCustomRow} className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 transition hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-300"><Plus className="size-3.5" /> Add custom item</button>
            </div>

            <div className="mt-2">
              <span className={labelClass}><PackageSearch className="mr-1 inline size-3.5" /> Add saved product</span>
              <AppSelect value={savedPick} onChange={(v) => { if (v) { addSavedProduct(v); setSavedPick(""); } }} options={productOptions} ariaLabel="Add saved product" searchable buttonClassName="mt-1 h-11 text-sm" className="w-full" />
            </div>

            {suggestionNote && <p className="mt-2 rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600 dark:bg-white/[0.04] dark:text-slate-300">{suggestionNote}</p>}

            {/* Live summary */}
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
              <span>Items: <strong className="text-slate-700 dark:text-slate-200">{summary.total}</strong></span>
              <span>Priced: <strong className="text-slate-700 dark:text-slate-200">{summary.priced}</strong></span>
              <span>No price: <strong className="text-slate-700 dark:text-slate-200">{summary.unpriced}</strong></span>
              {quotedTotalLabel && <span>Quoted total: <strong className="text-slate-700 dark:text-slate-200">{quotedTotalLabel}</strong></span>}
            </div>

            {rows.length === 0 ? (
              <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-8 text-center dark:border-white/10 dark:bg-white/[0.02]">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">No items yet</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Restore low-stock suggestions, add a saved product, or add a custom item.</p>
              </div>
            ) : (
              <div ref={itemsRef} className="mt-3 space-y-2">
                {rows.map((r) => {
                  const priceNum = r.price !== "" && Number.isFinite(Number(r.price)) ? Number(r.price) : null;
                  const lineTotal = priceNum !== null && priceNum >= 0 ? round2(r.quantity * priceNum) : null;
                  const invalid = invalidRowId === r.id;
                  return (
                    <div key={r.id} data-row-id={r.id} className={`rounded-xl border p-3 ${invalid ? "border-rose-400 ring-2 ring-rose-200 dark:border-rose-500 dark:ring-rose-900/40" : "border-slate-200 dark:border-white/10"}`}>
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <input data-row-name={r.id} type="text" value={r.name} onChange={(e) => updateRow(r.id, { name: e.target.value })} placeholder={r.kind === "custom" ? "Custom item name" : "Item name"} aria-label="Item name" className={inputClass} />
                          <p className="mt-1 truncate text-[11px] text-slate-400 dark:text-slate-500">
                            {r.kind === "saved" ? "Saved product" : r.kind === "custom" ? "Custom item" : `${r.sku ? `SKU: ${r.sku}` : ""}${r.priority ? ` · ${PRIORITY_TEXT[r.priority]}` : ""}${r.reason ? ` · ${r.reason}` : ""}`}
                            {r.currentStock !== null ? ` · stock ${r.currentStock}` : ""}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <button type="button" onClick={() => duplicateRow(r.id)} aria-label={`Duplicate ${r.name || "item"}`} className="flex size-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/10"><Copy className="size-4" /></button>
                          <button type="button" onClick={() => removeRow(r.id)} aria-label={`Remove ${r.name || "item"}`} className="flex size-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-900/20"><Trash2 className="size-4" /></button>
                        </div>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <label className="block"><span className="text-[10px] font-bold uppercase text-slate-400">Qty</span><input type="number" min={0} step={1} value={r.quantity} onChange={(e) => updateRow(r.id, { quantity: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} aria-label={`Quantity for ${r.name || "item"}`} className={`mt-0.5 text-right ${inputClass}`} /></label>
                        <label className="block"><span className="text-[10px] font-bold uppercase text-slate-400">Unit price ({currency})</span><input type="number" min={0} step="0.01" value={r.price} onChange={(e) => { const v = e.target.value; updateRow(r.id, { price: v === "" || Number(v) >= 0 ? v : r.price }); }} placeholder="Blank" aria-label={`Unit price for ${r.name || "item"}`} className={`mt-0.5 text-right ${inputClass}`} /></label>
                        <div className="block"><span className="text-[10px] font-bold uppercase text-slate-400">Line total</span><div className="mt-0.5 flex h-11 items-center justify-end rounded-lg bg-slate-100 px-3 text-sm font-semibold text-slate-700 dark:bg-white/[0.04] dark:text-slate-200">{lineTotal !== null ? `${currency} ${lineTotal.toLocaleString()}` : "—"}</div></div>
                        <div className="flex items-end gap-1">
                          {r.lastKnownCost > 0 && <button type="button" onClick={() => updateRow(r.id, { price: String(round2(r.lastKnownCost)) })} className="h-11 flex-1 rounded-lg border border-slate-200 bg-[#fff] px-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300">Use last cost</button>}
                          {r.price !== "" && <button type="button" onClick={() => clearPrice(r.id)} aria-label={`Clear price for ${r.name || "item"}`} className="flex size-11 items-center justify-center rounded-lg border border-slate-200 bg-[#fff] text-slate-400 transition hover:bg-slate-50 hover:text-slate-600 dark:border-white/10 dark:bg-white/[0.03]"><Eraser className="size-4" /></button>}
                        </div>
                      </div>
                      <input type="text" value={r.note} onChange={(e) => updateRow(r.id, { note: e.target.value })} placeholder="Row note (optional)" aria-label={`Note for ${r.name || "item"}`} className={`mt-2 ${inputClass}`} />
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* D. Terms & notes */}
          <section className={sectionClass}>
            <p className={sectionTitle}>Terms &amp; notes</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block"><span className={labelClass}>Delivery / location</span><input type="text" value={deliveryNote} onChange={(e) => setDeliveryNote(e.target.value)} className={`mt-1 ${inputClass}`} /></label>
              <label className="block"><span className={labelClass}>Payment / terms</span><input type="text" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} className={`mt-1 ${inputClass}`} /></label>
            </div>
            <label className="mt-3 block"><span className={labelClass}>PO notes</span><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Anything else for the supplier." className="mt-1 w-full rounded-lg border border-slate-200 bg-[#fff] px-3 py-2 text-sm text-slate-900 focus:border-blue-400 focus:outline-none dark:border-white/10 dark:bg-white/[0.04] dark:text-white" /></label>
          </section>
        </div>

        {/* E. Export footer */}
        <div className="border-t border-slate-200 bg-[#fff] px-4 py-3 dark:border-white/[0.06] dark:bg-slate-900 sm:px-5">
          {topError && <p className="mb-2 text-xs font-semibold text-rose-600 dark:text-rose-300">{topError}</p>}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 bg-[#fff] px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300">Close</button>
            <button type="button" onClick={handleCsv} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-[#fff] px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-200"><FileText className="size-4" /> CSV</button>
            <button type="button" onClick={handleXlsx} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-[#fff] px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-200"><FileSpreadsheet className="size-4" /> {busy ? "Preparing…" : "Excel"}</button>
            <button type="button" onClick={handlePrint} className="inline-flex items-center gap-1.5 rounded-lg bg-[#0b2f6f] px-4 py-2 text-sm font-bold text-white transition hover:opacity-90"><Printer className="size-4" /> Print / PDF</button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
