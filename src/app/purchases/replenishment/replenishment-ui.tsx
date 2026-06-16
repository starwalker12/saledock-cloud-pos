"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Search, AlertTriangle, PackageCheck as PkgCheck, Truck, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import type { ReplenishmentSummary, ReplenishmentSuggestion, ReplenishmentPriority, SupplierGroup } from "@/lib/data/replenishment";
import { formatCurrency, formatNumber } from "@/lib/formatters";
import { AppSelect } from "@/components/ui/app-select";

const REPLENISHMENT_GRID_CLASS =
  "grid grid-cols-[minmax(20rem,2.2fr)_6rem_5.5rem_6rem_6rem_9rem_9rem_7.5rem] items-center gap-4";

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
  { value: "stock", label: "Sort: Stock level" },
  { value: "cost", label: "Sort: Est. cost" },
  { value: "name", label: "Sort: Name" },
];

export function ReplenishmentUI({
  summary,
  currency,
}: {
  summary: ReplenishmentSummary;
  currency: string;
}) {
  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<ReplenishmentPriority | "all">("all");
  const [sortBy, setSortBy] = useState<string>("priority");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const handleSort = (key: string) => {
    if (sortBy === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortDir("asc");
    }
  };

  const filtered = useMemo(() => {
    let groups = summary.supplierGroups;
    if (search) {
      const s = search.toLowerCase();
      groups = groups
        .map((g) => ({
          ...g,
          suggestions: g.suggestions.filter(
            (p) =>
              p.productName.toLowerCase().includes(s) || (p.sku ?? "").toLowerCase().includes(s),
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
    // Recalculate productCount and estimatedCost per group after filtering
    groups = groups.map((g) => ({
      ...g,
      productCount: g.suggestions.length,
      estimatedCost: g.suggestions.reduce((s, p) => s + (p.estimatedCost ?? 0), 0),
    }));
    // Sort groups by estimated cost descending
    groups.sort((a, b) => b.estimatedCost - a.estimatedCost);
    return groups;
  }, [summary.supplierGroups, search, priorityFilter]);

  const totalItems = filtered.reduce((s, g) => s + g.suggestions.length, 0);

  return (
    <div className="space-y-6">
      {/* Summary bar */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        <SummaryCard label="Items to reorder" value={formatNumber(summary.totalNeeded)} color="#059669" />
        <SummaryCard label="Critical" value={formatNumber(summary.criticalCount)} color="#dc2626" />
        <SummaryCard label="Suppliers" value={formatNumber(summary.suppliersInvolved)} color="#3b82f6" />
        <SummaryCard
          label="Est. cost"
          value={formatCurrency(summary.estimatedTotalCost, currency)}
          color="#d97706"
        />
      </div>

      {/* Filters */}
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
          ariaLabel="Priority"
          buttonClassName="h-9 text-xs"
          className="w-full sm:w-40"
        />
        <AppSelect
          value={
            sortBy === "productName"
              ? "name"
              : sortBy === "currentStock"
              ? "stock"
              : sortBy === "estimatedCost"
              ? "cost"
              : "priority"
          }
          onChange={(val) => {
            if (val === "name") {
              setSortBy("productName");
            } else if (val === "stock") {
              setSortBy("currentStock");
            } else if (val === "cost") {
              setSortBy("estimatedCost");
            } else {
              setSortBy("priority");
            }
            setSortDir("asc");
          }}
          options={SORT_OPTIONS}
          ariaLabel="Sort"
          buttonClassName="h-9 text-xs"
          className="w-full sm:w-44"
        />
      </div>

      {totalItems === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-[#fff] px-4 py-12 text-center dark:border-white/[0.08] dark:bg-white/[0.03]">
          <PkgCheck className="mb-2 size-8 text-slate-300 dark:text-slate-600" />
          <p className="text-sm font-bold text-slate-950 dark:text-white">All stocked up!</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            No products need replenishment right now.
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
              onSort={handleSort}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
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
  onSort,
}: {
  group: SupplierGroup;
  currency: string;
  sortBy: string;
  sortDir: "asc" | "desc";
  onSort: (key: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  const criticalCount = group.suggestions.filter((s) => s.priority === "critical").length;
  const highCount = group.suggestions.filter((s) => s.priority === "high").length;

  const sortedSuggestions = useMemo(() => {
    const sorted = [...group.suggestions];
    const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2 };

    sorted.sort((rowA, rowB) => {
      const a = rowA[sortBy as keyof ReplenishmentSuggestion];
      const b = rowB[sortBy as keyof ReplenishmentSuggestion];

      const aEmpty = a == null || a === "";
      const bEmpty = b == null || b === "";
      if (aEmpty && bEmpty) return 0;
      if (aEmpty) return 1;
      if (bEmpty) return -1;

      let cmp = 0;
      if (sortBy === "priority") {
        const valA = priorityOrder[a as string] ?? 99;
        const valB = priorityOrder[b as string] ?? 99;
        cmp = valA - valB;
      } else if (typeof a === "number" && typeof b === "number") {
        cmp = a - b;
      } else {
        cmp = String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
      }

      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [group.suggestions, sortBy, sortDir]);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-[#fff] shadow-sm dark:border-white/[0.07] dark:bg-white/[0.03]">
      {/* Group header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-2.5 text-left transition hover:bg-slate-50 dark:border-white/[0.06] dark:hover:bg-white/[0.05] md:px-4 md:py-3"
      >
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 md:gap-3">
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
        <div className="flex shrink-0 items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 md:gap-4 md:text-xs">
          <span>{group.productCount} items</span>
          <span className="font-bold text-slate-700 dark:text-slate-300">{formatCurrency(group.estimatedCost, currency)}</span>
          <ArrowUpDown className={`size-3 transition ${expanded ? "rotate-180" : ""}`} />
        </div>
      </button>

      {expanded && (
        <div>
          {/* Column headers */}
          <div className="hidden overflow-x-auto sm:block">
            <div className="min-w-[1120px]">
              <div className={`${REPLENISHMENT_GRID_CLASS} border-b border-slate-100 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:border-white/[0.06] dark:text-slate-500`}>
                <ReplenishmentHeader label="Product" columnKey="productName" currentSortKey={sortBy} direction={sortDir} onSort={onSort} />
                <ReplenishmentHeader label="Stock" columnKey="currentStock" currentSortKey={sortBy} direction={sortDir} onSort={onSort} align="right" />
                <ReplenishmentHeader label="Min" columnKey="minimumStock" currentSortKey={sortBy} direction={sortDir} onSort={onSort} align="right" />
                <ReplenishmentHeader label="Target" columnKey="targetStock" currentSortKey={sortBy} direction={sortDir} onSort={onSort} align="right" />
                <ReplenishmentHeader label="Order" columnKey="suggestedQuantity" currentSortKey={sortBy} direction={sortDir} onSort={onSort} align="right" />
                <ReplenishmentHeader label="Unit cost" columnKey="purchasePrice" currentSortKey={sortBy} direction={sortDir} onSort={onSort} align="right" />
                <ReplenishmentHeader label="Total" columnKey="estimatedCost" currentSortKey={sortBy} direction={sortDir} onSort={onSort} align="right" />
                <ReplenishmentHeader label="Priority" columnKey="priority" currentSortKey={sortBy} direction={sortDir} onSort={onSort} align="right" />
              </div>
              {sortedSuggestions.map((s) => (
                <ProductDesktopRow key={s.productId} suggestion={s} currency={currency} />
              ))}
            </div>
          </div>

          <div className="sm:hidden">
            {sortedSuggestions.map((s) => (
              <ProductMobileRow key={s.productId} suggestion={s} currency={currency} />
            ))}
          </div>
        </div>
      )}

      {/* Group actions */}
      {expanded && group.supplierId && (
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/50 px-4 py-2.5 dark:border-white/[0.06] dark:bg-white/[0.02]">
          <Link
            href={`/suppliers/purchases/new?supplier_id=${group.supplierId}`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0b2f6f] px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90"
          >
            <Truck className="size-3.5" />
            Create purchase order
          </Link>
        </div>
      )}
    </div>
  );
}

function ProductMobileRow({
  suggestion,
  currency,
}: {
  suggestion: ReplenishmentSuggestion;
  currency: string;
}) {
  return (
    <div className="border-b border-slate-50 px-4 py-2.5 text-xs last:border-b-0 dark:border-slate-800">
      {/* Product Name & SKU */}
      <div className="min-w-0">
        <p className="font-semibold text-slate-950 dark:text-white truncate">{suggestion.productName}</p>
        {suggestion.sku && (
          <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate">SKU: {suggestion.sku}</p>
        )}
        <span
          className={`mt-1 inline-block rounded-full px-1.5 py-0.5 text-[9px] font-semibold leading-tight ${priorityColor[suggestion.priority]}`}
        >
          {priorityLabel[suggestion.priority]}
        </span>
      </div>

      {/* Mobile-only grid block */}
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
      </div>
    </div>
  );
}

function ProductDesktopRow({
  suggestion,
  currency,
}: {
  suggestion: ReplenishmentSuggestion;
  currency: string;
}) {
  return (
    <div className={`${REPLENISHMENT_GRID_CLASS} border-b border-slate-50 px-4 py-2.5 text-xs last:border-b-0 dark:border-slate-800`}>
      <div className="min-w-0">
        <p className="truncate font-semibold text-slate-950 dark:text-white">{suggestion.productName}</p>
        {suggestion.sku && (
          <p className="truncate text-[10px] text-slate-400 dark:text-slate-500">SKU: {suggestion.sku}</p>
        )}
      </div>

      {/* Desktop Column Views */}
      <div className="text-right tabular-nums text-slate-700 dark:text-slate-300">
        {formatNumber(suggestion.currentStock)}
      </div>
      <div className="text-right tabular-nums text-slate-700 dark:text-slate-300">
        {formatNumber(suggestion.minimumStock)}
      </div>
      <div className="text-right tabular-nums text-slate-700 dark:text-slate-300">
        {formatNumber(suggestion.targetStock)}
      </div>
      <div className="text-right font-bold tabular-nums text-slate-950 dark:text-white">
        {formatNumber(suggestion.suggestedQuantity)}
      </div>
      <div className="text-right tabular-nums text-slate-700 dark:text-slate-300">
        {formatCurrency(suggestion.purchasePrice, currency)}
      </div>
      <div className="text-right font-semibold tabular-nums text-slate-950 dark:text-white">
        {suggestion.estimatedCost !== null
          ? formatCurrency(suggestion.estimatedCost, currency)
          : "—"}
      </div>
      <div className="flex justify-end">
        <span
          className={`inline-block rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-tight ${priorityColor[suggestion.priority]}`}
        >
          {priorityLabel[suggestion.priority]}
        </span>
      </div>
    </div>
  );
}
