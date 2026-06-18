"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  Search,
  AlertTriangle,
  PackageCheck as PkgCheck,
  Truck,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  FileText,
  FileSpreadsheet,
  Printer,
  ClipboardList,
  Phone,
  Mail,
  Building2,
} from "lucide-react";
import type { ReplenishmentSummary, ReplenishmentSuggestion, ReplenishmentPriority, SupplierGroup, ActiveSupplier, ActiveProduct } from "@/lib/data/replenishment";
import { formatCurrency, formatNumber } from "@/lib/formatters";
import { AppSelect } from "@/components/ui/app-select";
import { PoPlannerModal, type PoPrefill } from "./po-planner-modal";
import { ProductDetailModal } from "./product-detail-modal";
import {
  downloadCsv,
  downloadXlsx,
  openPrintablePo,
  exportDateStamp,
} from "@/lib/replenishment/po-export";
import { buildExportColumns, mapItemsToRows, type ExportItem } from "@/lib/replenishment/po-columns";

const GRID_WITH_COSTS =
  "grid grid-cols-[minmax(18rem,2.2fr)_6rem_5.5rem_6rem_6rem_9rem_9rem_7.5rem] items-center gap-4";
const GRID_NO_COSTS =
  "grid grid-cols-[minmax(18rem,2.6fr)_6rem_5.5rem_6rem_6rem_7.5rem] items-center gap-4";

function ReplenishmentHeader({
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
  align?: "left" | "right";
  className?: string;
}) {
  const isSorted = currentSortKey === columnKey;
  const nextDir = isSorted && direction === "asc" ? "desc" : "asc";
  const ariaLabel = isSorted
    ? `Sort by ${label} ${nextDir === "asc" ? "ascending" : "descending"}`
    : `Sort by ${label} ascending`;

  return (
    <button
      onClick={() => onSort(columnKey)}
      aria-label={ariaLabel}
      className={`group flex min-w-0 items-center gap-1 whitespace-nowrap hover:text-slate-700 dark:hover:text-slate-300 font-bold uppercase transition-colors cursor-pointer select-none w-full ${
        align === "right" ? "justify-end text-right" : "justify-start text-left"
      } ${className}`}
    >
      <span className="min-w-0 truncate">{label}</span>
      {isSorted ? (
        direction === "asc" ? (
          <ArrowUp className="size-3 shrink-0 text-blue-700 dark:text-blue-400" />
        ) : (
          <ArrowDown className="size-3 shrink-0 text-blue-700 dark:text-blue-400" />
        )
      ) : (
        <ArrowUpDown className="size-3 shrink-0 opacity-0 group-hover:opacity-40 transition-opacity text-slate-400 dark:text-slate-500" />
      )}
    </button>
  );
}

const priorityColor: Record<ReplenishmentPriority, string> = {
  critical: "text-rose-700 bg-rose-50 dark:text-rose-300 dark:bg-rose-900/20",
  high: "text-amber-700 bg-amber-50 dark:text-amber-300 dark:bg-amber-900/20",
  medium: "text-blue-700 bg-blue-50 dark:text-blue-300 dark:bg-blue-900/20",
};

const priorityLabel: Record<ReplenishmentPriority, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
};
const PRIORITY_OPTIONS = [
  { value: "all", label: "All priorities" },
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
];
const SORT_OPTIONS = [
  { value: "priority", label: "Sort: Priority" },
  { value: "supplier", label: "Sort: Supplier" },
  { value: "productName", label: "Sort: Product name" },
  { value: "currentStock", label: "Sort: Stock level" },
  { value: "suggestedQuantity", label: "Sort: Suggested qty" },
  { value: "estimatedCost", label: "Sort: Est. total" },
];

function suggestionToExportItem(s: ReplenishmentSuggestion): ExportItem {
  return {
    productName: s.productName,
    sku: s.sku,
    supplierName: s.supplierName,
    supplierCompany: s.supplierCompany,
    supplierPhone: s.supplierPhone,
    supplierEmail: s.supplierEmail,
    currentStock: s.currentStock,
    minimumStock: s.minimumStock,
    targetStock: s.targetStock,
    quantity: s.suggestedQuantity,
    purchasePrice: s.purchasePrice,
    priority: s.priority,
    reason: s.reason,
  };
}

export function ReplenishmentUI({
  summary,
  currency,
  shopName,
  preparedBy,
  createSupplierHref,
  allSuppliers,
  allProducts,
}: {
  summary: ReplenishmentSummary;
  currency: string;
  shopName: string | null;
  preparedBy: string;
  createSupplierHref: string;
  allSuppliers: ActiveSupplier[];
  allProducts: ActiveProduct[];
}) {
  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<ReplenishmentPriority | "all">("all");
  const [supplierFilter, setSupplierFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("priority");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [showCosts, setShowCosts] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [poModal, setPoModal] = useState<{ key: number; prefill: PoPrefill } | null>(null);
  const [productModal, setProductModal] = useState<ReplenishmentSuggestion | null>(null);

  const handleSort = (key: string) => {
    if (sortBy === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortDir("asc");
    }
  };

  // Supplier filter options from the suppliers that actually have items.
  const supplierFilterOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [{ value: "all", label: "All suppliers" }];
    const seen = new Set<string>();
    for (const g of summary.supplierGroups) {
      if (g.supplierId && !seen.has(g.supplierId)) {
        seen.add(g.supplierId);
        opts.push({ value: g.supplierId, label: g.supplierName ?? "Supplier" });
      }
    }
    if (summary.supplierGroups.some((g) => g.supplierId === null)) {
      opts.push({ value: "__unassigned__", label: "Unassigned / no supplier" });
    }
    return opts;
  }, [summary.supplierGroups]);

  const filtered = useMemo(() => {
    let groups = summary.supplierGroups;
    if (supplierFilter !== "all") {
      groups = groups.filter((g) =>
        supplierFilter === "__unassigned__" ? g.supplierId === null : g.supplierId === supplierFilter,
      );
    }
    if (search) {
      const s = search.toLowerCase();
      groups = groups
        .map((g) => ({
          ...g,
          suggestions: g.suggestions.filter(
            (p) => p.productName.toLowerCase().includes(s) || (p.sku ?? "").toLowerCase().includes(s),
          ),
        }))
        .filter((g) => g.suggestions.length > 0);
    }
    if (priorityFilter !== "all") {
      groups = groups
        .map((g) => ({
          ...g,
          suggestions: g.suggestions.filter((p) => p.priority === priorityFilter),
        }))
        .filter((g) => g.suggestions.length > 0);
    }
    groups = groups.map((g) => ({
      ...g,
      productCount: g.suggestions.length,
      estimatedCost: g.suggestions.reduce((s, p) => s + (p.estimatedCost ?? 0), 0),
    }));
    if (sortBy === "supplier") {
      // Group ordering alphabetically by supplier; Unassigned last.
      groups = [...groups].sort((a, b) => {
        if (a.supplierId === null) return 1;
        if (b.supplierId === null) return -1;
        return (a.supplierName ?? "").localeCompare(b.supplierName ?? "");
      });
    } else {
      groups = [...groups].sort((a, b) => b.estimatedCost - a.estimatedCost);
    }
    return groups;
  }, [summary.supplierGroups, search, priorityFilter, supplierFilter, sortBy]);

  const totalItems = filtered.reduce((s, g) => s + g.suggestions.length, 0);

  // Flatten the currently visible rows, in displayed group/row order, for export.
  const visibleItems = useMemo(() => {
    const items: ExportItem[] = [];
    const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2 };
    for (const g of filtered) {
      const rows = [...g.suggestions].sort((a, b) => {
        if (sortBy === "supplier" || sortBy === "priority") {
          return priorityOrder[a.priority] - priorityOrder[b.priority];
        }
        const av = a[sortBy as keyof ReplenishmentSuggestion];
        const bv = b[sortBy as keyof ReplenishmentSuggestion];
        let cmp = 0;
        if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
        else cmp = String(av ?? "").localeCompare(String(bv ?? ""), undefined, { numeric: true });
        return sortDir === "asc" ? cmp : -cmp;
      });
      for (const s of rows) items.push(suggestionToExportItem(s));
    }
    return items;
  }, [filtered, sortBy, sortDir]);

  function viewFilename(ext: string): string {
    return `saledock-replenishment-${exportDateStamp()}.${ext}`;
  }

  function handleViewCsv() {
    if (visibleItems.length === 0) return setExportError("No rows to export in the current view.");
    setExportError(null);
    const columns = buildExportColumns(showCosts, currency);
    downloadCsv(viewFilename("csv"), columns, mapItemsToRows(visibleItems, showCosts));
  }

  async function handleViewXlsx() {
    if (visibleItems.length === 0) return setExportError("No rows to export in the current view.");
    setExportError(null);
    setBusy(true);
    try {
      const columns = buildExportColumns(showCosts, currency);
      await downloadXlsx(viewFilename("xlsx"), columns, mapItemsToRows(visibleItems, showCosts));
    } catch {
      setExportError("Excel export could not be generated. Please try CSV or Print.");
    } finally {
      setBusy(false);
    }
  }

  function handleViewPrint() {
    if (visibleItems.length === 0) return setExportError("No rows to export in the current view.");
    setExportError(null);
    const columns = buildExportColumns(showCosts, currency);
    const ok = openPrintablePo(
      {
        shopName,
        title: "Replenishment Worksheet",
        supplierLabel:
          supplierFilter === "all"
            ? "All suppliers"
            : supplierFilter === "__unassigned__"
            ? "Unassigned / no supplier"
            : supplierFilterOptions.find((o) => o.value === supplierFilter)?.label ?? "Supplier",
        priorities: priorityFilter === "all" ? "All" : priorityLabel[priorityFilter],
        preparedBy: preparedBy || null,
        dateLabel: new Date().toLocaleDateString(),
      },
      columns,
      mapItemsToRows(visibleItems, showCosts),
    );
    if (!ok) setExportError("Your browser blocked the print window. Allow pop-ups and try again.");
  }

  function openPo(prefill: PoPrefill) {
    setPoModal({ key: Date.now(), prefill });
  }

  return (
    <div className="space-y-6">
      {/* Summary bar */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        <SummaryCard label="Items to reorder" value={formatNumber(summary.totalNeeded)} color="#059669" />
        <SummaryCard label="Critical" value={formatNumber(summary.criticalCount)} color="#dc2626" />
        <SummaryCard label="Suppliers" value={formatNumber(summary.suppliersInvolved)} color="#3b82f6" />
        <SummaryCard
          label="Est. cost"
          value={showCosts ? formatCurrency(summary.estimatedTotalCost, currency) : "Hidden"}
          color="#d97706"
        />
      </div>

      {/* Toolbar: filters + cost toggle + exports + Create PO */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search products..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-full rounded-lg border border-slate-200 bg-[#fff] pl-9 pr-3 text-xs font-medium text-slate-950 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white dark:placeholder:text-slate-500"
            />
          </div>
          <AppSelect
            value={priorityFilter}
            onChange={(nextValue) => setPriorityFilter(nextValue as ReplenishmentPriority | "all")}
            options={PRIORITY_OPTIONS}
            ariaLabel="Priority filter"
            buttonClassName="h-9 text-xs"
            className="w-full sm:w-40"
          />
          <AppSelect
            value={supplierFilter}
            onChange={(v) => setSupplierFilter(v)}
            options={supplierFilterOptions}
            ariaLabel="Supplier filter"
            buttonClassName="h-9 text-xs"
            className="w-full sm:w-48"
          />
          <AppSelect
            value={sortBy}
            onChange={(val) => {
              setSortBy(val);
              setSortDir("asc");
            }}
            options={SORT_OPTIONS}
            ariaLabel="Sort"
            buttonClassName="h-9 text-xs"
            className="w-full sm:w-48"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-slate-300">
            <input type="checkbox" checked={showCosts} onChange={(e) => setShowCosts(e.target.checked)} />
            Show previous cost prices
          </label>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleViewCsv}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-slate-200"
            >
              <FileText className="size-3.5" /> CSV
            </button>
            <button
              type="button"
              onClick={handleViewXlsx}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-slate-200"
            >
              <FileSpreadsheet className="size-3.5" /> {busy ? "Preparing…" : "Excel"}
            </button>
            <button
              type="button"
              onClick={handleViewPrint}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-slate-200"
            >
              <Printer className="size-3.5" /> Print / PDF
            </button>
            <button
              type="button"
              onClick={() => openPo({ supplier: "all", priorities: ["critical", "high", "medium"] })}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#0b2f6f] px-3 py-1.5 text-xs font-bold text-white transition hover:opacity-90"
            >
              <ClipboardList className="size-3.5" /> Create PO
            </button>
          </div>
        </div>

        {exportError && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 dark:bg-rose-900/20 dark:text-rose-300">
            {exportError}
          </p>
        )}
      </div>

      {totalItems === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-[#fff] px-4 py-12 text-center dark:border-white/[0.08] dark:bg-white/[0.03]">
          <PkgCheck className="mb-2 size-8 text-slate-300 dark:text-slate-600" />
          <p className="text-sm font-bold text-slate-950 dark:text-white">
            {summary.totalNeeded === 0 ? "All stocked up!" : "No items match your filters"}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {summary.totalNeeded === 0
              ? "No products need replenishment right now."
              : "Try clearing the search, supplier, or priority filters."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((group) => (
            <SupplierGroupCard
              key={group.supplierId ?? "__unassigned__"}
              group={group}
              currency={currency}
              sortBy={sortBy}
              sortDir={sortDir}
              showCosts={showCosts}
              onSort={handleSort}
              onCreatePo={() =>
                openPo({
                  supplier: group.supplierId ?? "__unassigned__",
                  priorities: ["critical", "high"],
                })
              }
              onOpenDetails={setProductModal}
            />
          ))}
        </div>
      )}

      {productModal && (
        <ProductDetailModal
          suggestion={productModal}
          currency={currency}
          showCosts={showCosts}
          onCreatePo={() =>
            openPo({
              supplier: productModal.supplierId ?? "__unassigned__",
              priorities: ["critical", "high", "medium"],
            })
          }
          onClose={() => setProductModal(null)}
        />
      )}

      {poModal && (
        <PoPlannerModal
          key={poModal.key}
          suggestions={summary.suggestions}
          allSuppliers={allSuppliers}
          allProducts={allProducts}
          currency={currency}
          shopName={shopName}
          preparedByDefault={preparedBy}
          createSupplierHref={createSupplierHref}
          prefill={poModal.prefill}
          onClose={() => setPoModal(null)}
        />
      )}
    </div>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-[#fff] p-3 dark:border-white/[0.06] dark:bg-white/[0.03]">
      <p className="text-[10px] font-semibold tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-bold text-slate-950 dark:text-white" style={{ color }}>
        {value}
      </p>
    </div>
  );
}

function SupplierGroupCard({
  group,
  currency,
  sortBy,
  sortDir,
  showCosts,
  onSort,
  onCreatePo,
  onOpenDetails,
}: {
  group: SupplierGroup;
  currency: string;
  sortBy: string;
  sortDir: "asc" | "desc";
  showCosts: boolean;
  onSort: (key: string) => void;
  onCreatePo: () => void;
  onOpenDetails: (s: ReplenishmentSuggestion) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  const criticalCount = group.suggestions.filter((s) => s.priority === "critical").length;
  const highCount = group.suggestions.filter((s) => s.priority === "high").length;

  const sortedSuggestions = useMemo(() => {
    const sorted = [...group.suggestions];
    const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2 };
    const rowSortBy = sortBy === "supplier" ? "priority" : sortBy;

    sorted.sort((rowA, rowB) => {
      const a = rowA[rowSortBy as keyof ReplenishmentSuggestion];
      const b = rowB[rowSortBy as keyof ReplenishmentSuggestion];

      const aEmpty = a == null || a === "";
      const bEmpty = b == null || b === "";
      if (aEmpty && bEmpty) return 0;
      if (aEmpty) return 1;
      if (bEmpty) return -1;

      let cmp = 0;
      if (rowSortBy === "priority") {
        cmp = (priorityOrder[a as string] ?? 99) - (priorityOrder[b as string] ?? 99);
      } else if (typeof a === "number" && typeof b === "number") {
        cmp = a - b;
      } else {
        cmp = String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [group.suggestions, sortBy, sortDir]);

  const gridClass = showCosts ? GRID_WITH_COSTS : GRID_NO_COSTS;
  const minWidth = showCosts ? "min-w-[1120px]" : "min-w-[860px]";

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-[#fff] shadow-sm dark:border-white/[0.07] dark:bg-white/[0.03]">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-2.5 text-left transition hover:bg-slate-50 dark:border-white/[0.06] dark:hover:bg-white/[0.05] md:px-4 md:py-3"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5 md:gap-3">
            <Truck className="size-4 shrink-0 text-slate-400" />
            <span className="truncate text-xs font-bold text-slate-950 dark:text-white md:text-sm">
              {group.supplierName ?? "Unassigned"}
            </span>
            {criticalCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-1.5 py-0.5 text-[9px] font-semibold text-rose-700 dark:bg-rose-900/20 dark:text-rose-300 md:px-2 md:text-[10px]">
                <AlertTriangle className="size-2.5" />
                {criticalCount} crit
              </span>
            )}
            {highCount > 0 && (
              <span className="inline-flex items-center rounded-full bg-amber-50 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700 dark:bg-amber-900/20 dark:text-amber-300 md:px-2 md:text-[10px]">
                {highCount} high
              </span>
            )}
          </div>
          {(group.supplierCompany || group.supplierPhone || group.supplierEmail) && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 pl-6 text-[10px] text-slate-400 dark:text-slate-500">
              {group.supplierCompany && (
                <span className="inline-flex items-center gap-1"><Building2 className="size-2.5" />{group.supplierCompany}</span>
              )}
              {group.supplierPhone && (
                <span className="inline-flex items-center gap-1"><Phone className="size-2.5" />{group.supplierPhone}</span>
              )}
              {group.supplierEmail && (
                <span className="inline-flex items-center gap-1"><Mail className="size-2.5" />{group.supplierEmail}</span>
              )}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 md:gap-4 md:text-xs">
          <span>{group.productCount} items</span>
          {showCosts && (
            <span className="font-bold text-slate-700 dark:text-slate-300">{formatCurrency(group.estimatedCost, currency)}</span>
          )}
          <ArrowUpDown className={`size-3 transition ${expanded ? "rotate-180" : ""}`} />
        </div>
      </button>

      {expanded && (
        <div>
          <div className="hidden overflow-x-auto sm:block">
            <div className={minWidth}>
              <div className={`${gridClass} border-b border-slate-100 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:border-white/[0.06] dark:text-slate-500`}>
                <ReplenishmentHeader label="Product" columnKey="productName" currentSortKey={sortBy} direction={sortDir} onSort={onSort} />
                <ReplenishmentHeader label="Stock" columnKey="currentStock" currentSortKey={sortBy} direction={sortDir} onSort={onSort} align="right" />
                <ReplenishmentHeader label="Min" columnKey="minimumStock" currentSortKey={sortBy} direction={sortDir} onSort={onSort} align="right" />
                <ReplenishmentHeader label="Target" columnKey="targetStock" currentSortKey={sortBy} direction={sortDir} onSort={onSort} align="right" />
                <ReplenishmentHeader label="Order" columnKey="suggestedQuantity" currentSortKey={sortBy} direction={sortDir} onSort={onSort} align="right" />
                {showCosts && (
                  <>
                    <ReplenishmentHeader label="Unit cost" columnKey="purchasePrice" currentSortKey={sortBy} direction={sortDir} onSort={onSort} align="right" />
                    <ReplenishmentHeader label="Total" columnKey="estimatedCost" currentSortKey={sortBy} direction={sortDir} onSort={onSort} align="right" />
                  </>
                )}
                <ReplenishmentHeader label="Priority" columnKey="priority" currentSortKey={sortBy} direction={sortDir} onSort={onSort} align="right" />
              </div>
              {showCosts && (
                <p className="px-4 py-1 text-[10px] italic text-slate-400 dark:text-slate-500">
                  Last known cost / estimate only — confirm rates with supplier.
                </p>
              )}
              {sortedSuggestions.map((s) => (
                <ProductDesktopRow key={s.productId} suggestion={s} currency={currency} showCosts={showCosts} gridClass={gridClass} onOpenDetails={onOpenDetails} />
              ))}
            </div>
          </div>

          <div className="sm:hidden">
            {sortedSuggestions.map((s) => (
              <ProductMobileRow key={s.productId} suggestion={s} currency={currency} showCosts={showCosts} onOpenDetails={onOpenDetails} />
            ))}
          </div>
        </div>
      )}

      {expanded && (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/50 px-4 py-2.5 dark:border-white/[0.06] dark:bg-white/[0.02]">
          {group.supplierId && (
            <Link
              href={`/suppliers/purchases/new?supplier_id=${group.supplierId}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-slate-200"
            >
              <Truck className="size-3.5" />
              Record purchase
            </Link>
          )}
          <button
            type="button"
            onClick={onCreatePo}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0b2f6f] px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90"
          >
            <ClipboardList className="size-3.5" />
            {group.supplierId ? "Create PO for this supplier" : "Create PO without supplier"}
          </button>
        </div>
      )}
    </div>
  );
}

function ProductMobileRow({
  suggestion,
  currency,
  showCosts,
  onOpenDetails,
}: {
  suggestion: ReplenishmentSuggestion;
  currency: string;
  showCosts: boolean;
  onOpenDetails: (s: ReplenishmentSuggestion) => void;
}) {
  return (
    <div className="border-b border-slate-50 px-4 py-3 text-xs transition-colors last:border-b-0 hover:bg-slate-50/70 dark:border-slate-800 dark:hover:bg-white/[0.03]">
      <div className="min-w-0">
        <button
          type="button"
          onClick={() => onOpenDetails(suggestion)}
          className="block max-w-full truncate text-left text-sm font-semibold text-blue-700 hover:underline dark:text-blue-300"
        >
          {suggestion.productName}
        </button>
        {suggestion.sku && (
          <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate">SKU: {suggestion.sku}</p>
        )}
        <span
          className={`mt-1 inline-block rounded-full px-1.5 py-0.5 text-[9px] font-semibold leading-tight ${priorityColor[suggestion.priority]}`}
        >
          {priorityLabel[suggestion.priority]} · {suggestion.reason}
        </span>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-2 rounded-lg bg-slate-50/60 p-2 text-[11px] text-slate-600 dark:bg-slate-950/40 dark:text-slate-400">
        <div>
          <span className="block text-[9px] text-slate-400 font-bold uppercase">Stock</span>
          <span className="font-semibold text-slate-800 dark:text-slate-200">{formatNumber(suggestion.currentStock)}</span>
        </div>
        <div>
          <span className="block text-[9px] text-slate-400 font-bold uppercase">Min / Target</span>
          <span className="font-semibold text-slate-800 dark:text-slate-200">{formatNumber(suggestion.minimumStock)} / {formatNumber(suggestion.targetStock)}</span>
        </div>
        <div>
          <span className="block text-[9px] text-slate-400 font-bold uppercase">To Order</span>
          <span className="font-bold text-slate-950 dark:text-white">{formatNumber(suggestion.suggestedQuantity)}</span>
        </div>
        {showCosts && (
          <>
            <div>
              <span className="block text-[9px] text-slate-400 font-bold uppercase">Unit Cost</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">{formatCurrency(suggestion.purchasePrice, currency)}</span>
            </div>
            <div className="col-span-2 text-right">
              <span className="block text-[9px] text-slate-400 font-bold uppercase">Est. Cost</span>
              <span className="font-bold text-slate-950 dark:text-white">
                {suggestion.estimatedCost !== null ? formatCurrency(suggestion.estimatedCost, currency) : "—"}
              </span>
            </div>
          </>
        )}
      </div>
      {showCosts && (
        <p className="mt-1 text-[9px] italic text-slate-400 dark:text-slate-500">Last known cost / estimate only.</p>
      )}
    </div>
  );
}

function ProductDesktopRow({
  suggestion,
  currency,
  showCosts,
  gridClass,
  onOpenDetails,
}: {
  suggestion: ReplenishmentSuggestion;
  currency: string;
  showCosts: boolean;
  gridClass: string;
  onOpenDetails: (s: ReplenishmentSuggestion) => void;
}) {
  return (
    <div className={`${gridClass} border-b border-slate-50 px-4 py-2.5 text-xs transition-colors last:border-b-0 hover:bg-slate-50/70 dark:border-slate-800 dark:hover:bg-white/[0.03]`}>
      <div className="min-w-0">
        <button
          type="button"
          onClick={() => onOpenDetails(suggestion)}
          className="block max-w-full truncate text-left font-semibold text-blue-700 hover:underline dark:text-blue-300"
        >
          {suggestion.productName}
        </button>
        {suggestion.sku && (
          <p className="truncate text-[10px] text-slate-400 dark:text-slate-500">SKU: {suggestion.sku}</p>
        )}
      </div>

      <div className="text-right tabular-nums text-slate-700 dark:text-slate-300">{formatNumber(suggestion.currentStock)}</div>
      <div className="text-right tabular-nums text-slate-700 dark:text-slate-300">{formatNumber(suggestion.minimumStock)}</div>
      <div className="text-right tabular-nums text-slate-700 dark:text-slate-300">{formatNumber(suggestion.targetStock)}</div>
      <div className="text-right font-bold tabular-nums text-slate-950 dark:text-white">{formatNumber(suggestion.suggestedQuantity)}</div>
      {showCosts && (
        <>
          <div className="text-right tabular-nums text-slate-700 dark:text-slate-300">{formatCurrency(suggestion.purchasePrice, currency)}</div>
          <div className="text-right font-semibold tabular-nums text-slate-950 dark:text-white">
            {suggestion.estimatedCost !== null ? formatCurrency(suggestion.estimatedCost, currency) : "—"}
          </div>
        </>
      )}
      <div className="flex justify-end">
        <span className={`inline-block rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-tight ${priorityColor[suggestion.priority]}`}>
          {priorityLabel[suggestion.priority]}
        </span>
      </div>
    </div>
  );
}
