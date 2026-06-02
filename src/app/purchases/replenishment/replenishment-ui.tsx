"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Search, AlertTriangle, PackageCheck as PkgCheck, Truck, ArrowUpDown } from "lucide-react";
import type { ReplenishmentSummary, ReplenishmentSuggestion, ReplenishmentPriority, SupplierGroup } from "@/lib/data/replenishment";
import { formatCurrency, formatNumber } from "@/lib/formatters";

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

export function ReplenishmentUI({
  summary,
  currency,
}: {
  summary: ReplenishmentSummary;
  currency: string;
}) {
  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<ReplenishmentPriority | "all">("all");
  const [sortBy, setSortBy] = useState<"priority" | "stock" | "cost" | "name">("priority");

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
            className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-xs font-medium text-slate-950 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white dark:placeholder:text-slate-500"
          />
        </div>
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value as ReplenishmentPriority | "all")}
          className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-slate-300"
        >
          <option value="all">All priorities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as "priority" | "stock" | "cost" | "name")}
          className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-slate-300"
        >
          <option value="priority">Sort: Priority</option>
          <option value="stock">Sort: Stock level</option>
          <option value="cost">Sort: Est. cost</option>
          <option value="name">Sort: Name</option>
        </select>
      </div>

      {totalItems === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-12 text-center dark:border-white/[0.08] dark:bg-white/[0.03]">
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
    <div className="rounded-xl border border-slate-100 bg-white p-3 dark:border-white/[0.06] dark:bg-white/[0.03]">
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
}: {
  group: SupplierGroup;
  currency: string;
}) {
  const [expanded, setExpanded] = useState(true);

  const criticalCount = group.suggestions.filter((s) => s.priority === "critical").length;
  const highCount = group.suggestions.filter((s) => s.priority === "high").length;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/[0.07] dark:bg-white/[0.03]">
      {/* Group header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 text-left transition hover:bg-slate-50 dark:border-white/[0.06] dark:hover:bg-white/[0.05]"
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Truck className="size-4 shrink-0 text-slate-400" />
          <span className="truncate text-sm font-bold text-slate-950 dark:text-white">
            {group.supplierName ?? "Unassigned"}
          </span>
          {criticalCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700 dark:bg-rose-900/20 dark:text-rose-300">
              <AlertTriangle className="size-3" />
              {criticalCount} critical
            </span>
          )}
          {highCount > 0 && (
            <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
              {highCount} high
            </span>
          )}
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
          <span>{group.productCount} items</span>
          <span>{formatCurrency(group.estimatedCost, currency)}</span>
          <ArrowUpDown className={`size-3 transition ${expanded ? "rotate-180" : ""}`} />
        </div>
      </button>

      {expanded && (
        <div className="divide-y divide-slate-100 dark:divide-white/[0.06]">
          {/* Column headers */}
          <div className="hidden grid-cols-12 gap-2 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400 sm:grid dark:text-slate-500">
            <div className="col-span-4">Product</div>
            <div className="col-span-1 text-right">Stock</div>
            <div className="col-span-1 text-right">Min</div>
            <div className="col-span-1 text-right">Target</div>
            <div className="col-span-1 text-right">Order</div>
            <div className="col-span-2 text-right">Unit cost</div>
            <div className="col-span-1 text-right">Total</div>
            <div className="col-span-1">Priority</div>
          </div>

          {/* Sort suggestions within group */}
          {[...group.suggestions]
            .sort((a, b) => {
              const order = { critical: 0, high: 1, medium: 2 };
              return order[a.priority] - order[b.priority];
            })
            .map((s) => (
              <ProductRow key={s.productId} suggestion={s} currency={currency} />
            ))}
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

function ProductRow({
  suggestion,
  currency,
}: {
  suggestion: ReplenishmentSuggestion;
  currency: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 px-4 py-2.5 text-xs sm:grid-cols-12 sm:gap-2">
      <div className="col-span-2 min-w-0 sm:col-span-4">
        <p className="truncate font-semibold text-slate-950 dark:text-white">{suggestion.productName}</p>
        {suggestion.sku && (
          <p className="truncate text-[10px] text-slate-400 dark:text-slate-500">SKU: {suggestion.sku}</p>
        )}
      </div>
      <div className="text-right text-slate-700 sm:col-span-1 dark:text-slate-300">
        {formatNumber(suggestion.currentStock)}
      </div>
      <div className="text-right text-slate-700 sm:col-span-1 dark:text-slate-300">
        {formatNumber(suggestion.minimumStock)}
      </div>
      <div className="text-right text-slate-700 sm:col-span-1 dark:text-slate-300">
        {formatNumber(suggestion.targetStock)}
      </div>
      <div className="text-right font-bold text-slate-950 sm:col-span-1 dark:text-white">
        {formatNumber(suggestion.suggestedQuantity)}
      </div>
      <div className="text-right text-slate-700 sm:col-span-2 dark:text-slate-300">
        {formatCurrency(suggestion.purchasePrice, currency)}
      </div>
      <div className="text-right font-semibold text-slate-950 sm:col-span-1 dark:text-white">
        {suggestion.estimatedCost !== null
          ? formatCurrency(suggestion.estimatedCost, currency)
          : "—"}
      </div>
      <div className="sm:col-span-1">
        <span
          className={`inline-block rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-tight ${priorityColor[suggestion.priority]}`}
        >
          {priorityLabel[suggestion.priority]}
        </span>
      </div>
    </div>
  );
}
