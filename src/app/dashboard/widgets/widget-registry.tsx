/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import Link from "next/link";
import {
  TrendingUp,
  ShoppingCart,
  RotateCcw,
  Wallet,
  PackageSearch,
  Wrench,
  Briefcase,
  Users,
  CalendarCheck,
  CreditCard,
  Boxes,
  Clock,
  Percent,
} from "lucide-react";
import { formatCurrency, formatNumber } from "@/lib/formatters";
import {
  VerticalBars,
  HorizontalBars,
  TrendLine,
  Sparkline,
  PieDonut,
  RankingList,
  ChartEmpty,
  type ChartPoint,
} from "./widget-charts";

// Approved widget colors that are readable in both light and dark modes
export type WidgetColor = "neutral" | "info" | "success" | "warning" | "danger";
export type BoardFillStyle = "solid" | "gradient";
export type WidgetFillStyle = "inherit" | BoardFillStyle;
export type WidgetTextColor = "auto" | "white" | "black";

export const WIDGET_COLORS: {
  value: WidgetColor;
  label: string;
  solidBg: string;
  solidBorder: string;
  solidText: string;
  solidMuted: string;
  gradientBg: string;
  text: string;
  chip: string;
}[] = [
  {
    value: "neutral",
    label: "Slate",
    solidBg: "bg-[#475569]",
    solidBorder: "border-[#64748b]",
    solidText: "#ffffff",
    solidMuted: "rgba(255,255,255,0.78)",
    gradientBg: "bg-gradient-to-br from-[#f8fafc] via-[#f1f5f9] to-[#e2e8f0] dark:from-[#1e293b] dark:via-[#162033] dark:to-[#0f172a]",
    text: "text-slate-800 dark:text-slate-200",
    chip: "bg-slate-400",
  },
  {
    value: "info",
    label: "Blue",
    solidBg: "bg-[#2563eb]",
    solidBorder: "border-[#1d4ed8]",
    solidText: "#ffffff",
    solidMuted: "rgba(255,255,255,0.80)",
    gradientBg: "bg-gradient-to-br from-[#eff6ff] via-[#dbeafe] to-[#bfdbfe] dark:from-[#1e3a8a]/50 dark:via-[#1e40af]/35 dark:to-[#0f172a]",
    text: "text-blue-800 dark:text-blue-200",
    chip: "bg-blue-400",
  },
  {
    value: "success",
    label: "Green",
    solidBg: "bg-[#22c55e]",
    solidBorder: "border-[#16a34a]",
    solidText: "#052e16",
    solidMuted: "rgba(5,46,22,0.74)",
    gradientBg: "bg-gradient-to-br from-[#f0fdf4] via-[#dcfce7] to-[#bbf7d0] dark:from-[#064e3b]/55 dark:via-[#065f46]/35 dark:to-[#052e2b]",
    text: "text-green-800 dark:text-green-200",
    chip: "bg-green-400",
  },
  {
    value: "warning",
    label: "Amber",
    solidBg: "bg-[#ffce1b]",
    solidBorder: "border-[#d97706]",
    solidText: "#422006",
    solidMuted: "rgba(66,32,6,0.74)",
    gradientBg: "bg-gradient-to-br from-[#fffbeb] via-[#fef3c7] to-[#fde68a] dark:from-[#78350f]/55 dark:via-[#92400e]/35 dark:to-[#451a03]",
    text: "text-amber-800 dark:text-amber-200",
    chip: "bg-amber-400",
  },
  {
    value: "danger",
    label: "Rose",
    solidBg: "bg-[#dc2626]",
    solidBorder: "border-[#b91c1c]",
    solidText: "#ffffff",
    solidMuted: "rgba(255,255,255,0.80)",
    gradientBg: "bg-gradient-to-br from-[#fef2f2] via-[#fee2e2] to-[#fecaca] dark:from-[#7f1d1d]/55 dark:via-[#991b1b]/35 dark:to-[#450a0a]",
    text: "text-red-800 dark:text-red-200",
    chip: "bg-red-400",
  },
];

export function getWidgetColorMeta(color: WidgetColor) {
  return WIDGET_COLORS.find((c) => c.value === color) ?? WIDGET_COLORS[0];
}

// ── Chart-type system ──────────────────────────────────────────────────────
// Chartable widgets can be viewed in several ways for the SAME underlying
// metric. The view is purely presentational — the numbers are identical
// across views; only the rendering changes.
export type ChartType = "card" | "bar" | "line" | "area" | "pie" | "donut" | "sparkline" | "table";

export const CHART_TYPE_LABELS: Record<ChartType, string> = {
  card: "Card",
  bar: "Bar",
  line: "Line",
  area: "Area",
  pie: "Pie",
  donut: "Donut",
  sparkline: "Trend",
  table: "Table",
};

type ChartableConfig = { types: ChartType[]; defaultType: ChartType };

// Which widgets are chartable, the views they support, and their default view.
// For ranked metrics, "bar" renders horizontal bars (long product names stay
// readable); for trend metrics, "bar" renders vertical bars.
export const CHARTABLE_WIDGETS: Record<string, ChartableConfig> = {
  "weekly-sales": { types: ["bar", "line", "area", "sparkline", "card"], defaultType: "bar" },
  "monthly-sales": { types: ["bar", "line", "area", "card"], defaultType: "bar" },
  "top-selling-products": { types: ["table", "bar", "donut", "pie", "card"], defaultType: "table" },
  "top-products-revenue": { types: ["bar", "table", "donut", "pie", "card"], defaultType: "bar" },
  "dues-overview": { types: ["bar", "donut", "table", "card"], defaultType: "bar" },
  "sales-vs-expenses": { types: ["bar", "donut", "table", "card"], defaultType: "bar" },
  // Phase 2 analytics widgets
  "invoice-status": { types: ["donut", "pie", "bar", "table", "card"], defaultType: "donut" },
  "payment-method-split": { types: ["donut", "pie", "bar", "table", "card"], defaultType: "donut" },
  "expense-category-breakdown": { types: ["donut", "pie", "bar", "table", "card"], defaultType: "donut" },
  "repair-status-breakdown": { types: ["donut", "pie", "bar", "table", "card"], defaultType: "donut" },
  "sales-by-weekday": { types: ["bar", "donut", "table", "card"], defaultType: "bar" },
  "stock-by-category": { types: ["bar", "donut", "table", "card"], defaultType: "bar" },
  "top-customer-dues": { types: ["bar", "table", "card"], defaultType: "bar" },
};

export function isChartable(type: string): boolean {
  return Object.prototype.hasOwnProperty.call(CHARTABLE_WIDGETS, type);
}

export function getChartTypesForWidget(type: string): ChartType[] {
  return CHARTABLE_WIDGETS[type]?.types ?? [];
}

export function resolveChartType(type: string, chartType?: string): ChartType {
  const config = CHARTABLE_WIDGETS[type];
  if (!config) return "card";
  if (chartType && config.types.includes(chartType as ChartType)) {
    return chartType as ChartType;
  }
  return config.defaultType;
}

export type WidgetSize = "S" | "M" | "L" | "XL";

export type WidgetDef = {
  id: string;
  type: string;
  category: "sales" | "money" | "inventory" | "customers" | "repairs" | "suppliers" | "activity";
  title: string;
  description: string;
  defaultSize: WidgetSize;
  defaultColor: WidgetColor;
  icon: React.ComponentType<{ className?: string }>;
};

export const WIDGET_CATALOG: WidgetDef[] = [
  { id: "today-profit", type: "today-profit", category: "sales", title: "Today's Net Profit", description: "Estimated net profit earned from today's operations", defaultSize: "S", defaultColor: "success", icon: TrendingUp },
  { id: "gross-sales", type: "gross-sales", category: "sales", title: "Gross Sales", description: "Total value of all sales rung up today", defaultSize: "S", defaultColor: "success", icon: ShoppingCart },
  { id: "returns", type: "returns", category: "sales", title: "Returns & Refunds", description: "Value of items returned by customers today", defaultSize: "S", defaultColor: "danger", icon: RotateCcw },
  { id: "expenses", type: "expenses", category: "money", title: "Today's Expenses", description: "Total business expenses logged today", defaultSize: "S", defaultColor: "danger", icon: Wallet },
  { id: "low-stock", type: "low-stock", category: "inventory", title: "Low Stock Items", description: "Count and list of items below warning threshold", defaultSize: "S", defaultColor: "warning", icon: PackageSearch },
  { id: "pending-repairs", type: "pending-repairs", category: "repairs", title: "Pending Repairs", description: "Technician repair jobs currently in progress", defaultSize: "S", defaultColor: "warning", icon: Wrench },
  { id: "supplier-dues", type: "supplier-dues", category: "suppliers", title: "Supplier Dues", description: "Outstanding balance owed to wholesale suppliers", defaultSize: "S", defaultColor: "warning", icon: Briefcase },
  { id: "customer-dues", type: "customer-dues", category: "customers", title: "Customer Dues", description: "Outstanding credit owed to the shop by customers", defaultSize: "S", defaultColor: "warning", icon: Users },
  { id: "weekly-sales", type: "weekly-sales", category: "sales", title: "Weekly Sales Trend", description: "Sales total over the last 7 operating days", defaultSize: "M", defaultColor: "info", icon: TrendingUp },
  { id: "monthly-sales", type: "monthly-sales", category: "sales", title: "Monthly Sales Trend", description: "Sales total over the current calendar month", defaultSize: "M", defaultColor: "info", icon: TrendingUp },
  { id: "top-selling-products", type: "top-selling-products", category: "sales", title: "Top Products by Quantity", description: "Best-selling items by units sold — view as table, bars, donut, or pie", defaultSize: "L", defaultColor: "neutral", icon: Boxes },
  { id: "top-products-revenue", type: "top-products-revenue", category: "sales", title: "Top Products by Revenue", description: "Highest-earning items by sales value — view as bars, donut, pie, or table", defaultSize: "L", defaultColor: "info", icon: TrendingUp },
  { id: "dues-overview", type: "dues-overview", category: "money", title: "Dues Overview", description: "Money owed to you (customers) vs money you owe (suppliers), side by side", defaultSize: "M", defaultColor: "warning", icon: Users },
  { id: "sales-vs-expenses", type: "sales-vs-expenses", category: "money", title: "Sales vs Expenses", description: "Today's gross sales next to today's expenses — view as bar, donut, or table", defaultSize: "M", defaultColor: "info", icon: ShoppingCart },
  // Phase 2 analytics widgets (read-only, this-month / current snapshots)
  { id: "invoice-status", type: "invoice-status", category: "sales", title: "Invoice Status", description: "Paid / partial / unpaid invoices this month — view as donut, pie, bar, or table", defaultSize: "M", defaultColor: "info", icon: CreditCard },
  { id: "payment-method-split", type: "payment-method-split", category: "money", title: "Payment Methods", description: "How customers paid this month (cash, card, bank…) — view as donut, pie, bar, or table", defaultSize: "M", defaultColor: "info", icon: CreditCard },
  { id: "expense-category-breakdown", type: "expense-category-breakdown", category: "money", title: "Expense Categories", description: "This month's expenses grouped by category — view as donut, pie, bar, or table", defaultSize: "M", defaultColor: "danger", icon: Wallet },
  { id: "repair-status-breakdown", type: "repair-status-breakdown", category: "repairs", title: "Repair Status", description: "Repairs by status over the last 90 days — view as donut, pie, bar, or table", defaultSize: "M", defaultColor: "warning", icon: Wrench },
  { id: "sales-by-weekday", type: "sales-by-weekday", category: "sales", title: "Sales by Day of Week", description: "Which weekdays sell best (last 8 weeks) — view as bar, donut, or table", defaultSize: "M", defaultColor: "info", icon: CalendarCheck },
  { id: "stock-by-category", type: "stock-by-category", category: "inventory", title: "Stock by Category", description: "Units in stock grouped by product category — view as bar, donut, or table", defaultSize: "M", defaultColor: "neutral", icon: Boxes },
  { id: "top-customer-dues", type: "top-customer-dues", category: "customers", title: "Top Customer Dues", description: "Customers ranked by outstanding balance — view as bar, table, or card", defaultSize: "L", defaultColor: "warning", icon: Users },
  { id: "avg-order-value", type: "avg-order-value", category: "sales", title: "Average Order Value", description: "Average invoice value this month", defaultSize: "S", defaultColor: "success", icon: Percent },
  { id: "recent-activity", type: "recent-activity", category: "activity", title: "Recent Activity", description: "Live audit logs of recent system activities", defaultSize: "L", defaultColor: "neutral", icon: Clock },
  { id: "credit-collected-today", type: "credit-collected-today", category: "money", title: "Credit Collected", description: "Credit settlements collected from customers today", defaultSize: "S", defaultColor: "success", icon: CreditCard },
  { id: "today-net", type: "today-net", category: "money", title: "Today's Net Cash", description: "Net operational cash flow (sales minus expenses)", defaultSize: "S", defaultColor: "success", icon: Wallet },
  { id: "today-closing", type: "today-closing", category: "money", title: "Drawer/Closing Status", description: "Current status of the daily drawer closing", defaultSize: "S", defaultColor: "neutral", icon: CalendarCheck },
  { id: "today-expenses", type: "today-expenses", category: "money", title: "Expenses Count", description: "Number of expense entries logged today", defaultSize: "S", defaultColor: "danger", icon: Wallet },
  { id: "stock-valuation", type: "stock-valuation", category: "inventory", title: "Stock Valuation", description: "Current inventory valuation at purchase cost", defaultSize: "S", defaultColor: "neutral", icon: Boxes },
  { id: "potential-profit-in-stock", type: "potential-profit-in-stock", category: "inventory", title: "Potential Profit", description: "Unearned profit potential in current active stock", defaultSize: "M", defaultColor: "warning", icon: Percent },
];

const subtitleClass = "truncate text-[13px] font-semibold leading-tight text-slate-600 dark:text-slate-300";
const tinyMutedClass = "truncate text-[11px] leading-tight text-slate-500 dark:text-slate-400";

// Shared chart frame: an optional headline value and a flexible plot area that
// fills the remaining card height. The widget card header already shows the
// title, so the frame does not repeat it — that keeps charts vertically
// justified and prevents the "cut off" plots the owner reported (Part B). The
// `title` is passed through as an aria-label only.
function ChartFrame({
  title,
  value,
  sub,
  children,
}: {
  title: string;
  value?: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-1" aria-label={title}>
      {value && (
        <p className="widget-chart-strong shrink-0 truncate text-lg font-black leading-tight text-slate-900 dark:text-white">{value}</p>
      )}
      <div className="flex min-h-0 flex-1 flex-col justify-end">{children}</div>
      {sub && (
        <p className="widget-chart-muted shrink-0 truncate border-t border-slate-200/50 pt-1 text-[11px] font-medium text-slate-500 dark:border-slate-700/50 dark:text-slate-400">
          {sub}
        </p>
      )}
    </div>
  );
}

// Dispatch a time-series metric (weekly / monthly sales) to the chosen view.
function renderTrendChart(view: ChartType, points: ChartPoint[], animate: boolean) {
  if (view === "sparkline") {
    return (
      <div className="flex h-full items-center">
        <Sparkline points={points} />
      </div>
    );
  }
  if (view === "line" || view === "area") {
    // A line/area trend needs at least three non-zero points to read as a trend.
    // With fewer, a single spike over a flat baseline looks broken, so show an
    // honest note and point the owner to Bar view (the card still shows the total).
    const nonZeroCount = points.filter((p) => (Number(p.value) || 0) > 0).length;
    if (nonZeroCount < 3) {
      return <ChartEmpty message="Not enough activity yet for a trend — try the Bar view" />;
    }
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="min-h-0 flex-1">
          <TrendLine points={points} heightClass="h-full min-h-[2.5rem]" area={view === "area"} animate={animate} />
        </div>
        <div className="widget-chart-muted mt-1 flex shrink-0 justify-between gap-2 text-[10px] font-bold text-slate-500 dark:text-slate-400">
          <span className="min-w-0 truncate">{points[0]?.label}</span>
          <span className="min-w-0 truncate text-right">{points[points.length - 1]?.label}</span>
        </div>
      </div>
    );
  }
  return <VerticalBars points={points} heightClass="h-full min-h-[2.5rem]" animate={animate} />;
}

type LabelledDatum = { label: string; value: number };

// Humanise raw enum/method values like "bank_transfer" → "Bank Transfer".
function prettyLabel(raw: string): string {
  return String(raw)
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// Shared renderer for distribution / ranked widgets (status, method, category,
// dues, stock…). Picks the view, caps rows/slices by card size, shows "+ X more"
// when capped, and keeps a clean empty state. Purely presentational.
function renderDistribution(opts: {
  view: ChartType;
  title: string;
  data: LabelledDatum[];
  size: WidgetSize;
  fmt: (value: number) => string;
  animate: boolean;
  emptyMessage: string;
  colored?: boolean;
  centerLabel?: string;
}) {
  const { view, title, data, size, fmt, animate, emptyMessage, colored = false, centerLabel = "Total" } = opts;
  const usable = data.filter((d) => Number(d.value) > 0);

  if (usable.length === 0) {
    return (
      <ChartFrame title={title}>
        <ChartEmpty message={emptyMessage} />
      </ChartFrame>
    );
  }

  if (view === "card") {
    const top = usable[0];
    return (
      <div className="flex h-full min-h-0 min-w-0 flex-col justify-between gap-1">
        <div>
          <p className="widget-chart-strong truncate text-base font-black leading-tight text-slate-900 dark:text-white">
            {top.label}
          </p>
        </div>
        <p className={subtitleClass}>{fmt(top.value)} · {usable.length} total</p>
      </div>
    );
  }

  const sliceLimit = size === "S" ? 4 : size === "M" ? 5 : 6;
  const barLimit = size === "S" ? 3 : size === "M" ? 4 : 6;
  const tableLimit = size === "XL" ? 10 : size === "L" ? 6 : 4;

  if (view === "donut" || view === "pie") {
    const slices = usable.slice(0, sliceLimit).map((d) => ({ label: d.label, value: d.value }));
    const overallTotal = data.reduce((sum, d) => sum + (Number(d.value) || 0), 0);
    return (
      <ChartFrame title={title}>
        <PieDonut
          slices={slices}
          formatValue={fmt}
          donut={view === "donut"}
          moreCount={Math.max(usable.length - sliceLimit, 0)}
          animate={animate}
          size={size}
          centerValue={fmt(overallTotal)}
          centerLabel={centerLabel}
        />
      </ChartFrame>
    );
  }

  if (view === "table") {
    const rows = usable.slice(0, tableLimit).map((d) => ({ label: d.label, value: d.value }));
    return (
      <ChartFrame title={title}>
        <RankingList rows={rows} formatValue={fmt} moreCount={Math.max(usable.length - tableLimit, 0)} />
      </ChartFrame>
    );
  }

  const rows = usable.slice(0, barLimit).map((d) => ({ label: d.label, value: d.value }));
  return (
    <ChartFrame title={title}>
      <HorizontalBars rows={rows} formatValue={fmt} colored={colored} moreCount={Math.max(usable.length - barLimit, 0)} animate={animate} />
    </ChartFrame>
  );
}

export function renderWidgetContent(
  type: string,
  size: WidgetSize,
  state: {
    invoices: any;
    stockValue: number;
    expenses: any;
    todayActivity: any;
    todayClosing: any;
    weekSales: any[];
    activity: any[];
    monthSales: any[];
    dashSummary: any;
    potentialProfit: any;
    analytics: any;
    currency: string;
    labels: any;
    isPrivileged: boolean;
    editing?: boolean;
  },
  chartType?: string,
) {
  const currency = state.currency;
  const view = resolveChartType(type, chartType);
  const animate = !state.editing;

  switch (type) {
    case "today-profit": {
      const isPositive = state.dashSummary.todayProfit >= 0;
      return (
        <div className="flex h-full min-h-0 min-w-0 flex-col justify-between gap-1">
          <div>
            <p className="truncate text-2xl font-black leading-tight text-slate-900 dark:text-white">
              {formatCurrency(state.dashSummary.todayProfit, currency)}
            </p>
          </div>
          {size === "S" && (
            <p className="truncate text-[13px] font-semibold leading-tight text-slate-600 dark:text-slate-300">
              {isPositive ? "Sales net profit" : "Negative net profit"}
            </p>
          )}
          {size === "M" && (
            <div className={`text-xs font-bold rounded-lg px-2 py-1 inline-block mt-2 ${isPositive ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-rose-500/10 text-rose-600 dark:text-rose-400"}`}>
              {isPositive ? "▲ Estimated Net Profit" : "▼ Operating Under Margin"}
            </div>
          )}
          {(size === "L" || size === "XL") && (
            <div className="mt-2 space-y-1 text-xs border-t border-slate-200/50 pt-2 dark:border-slate-700/50">
              <div className="flex justify-between">
                <span className="text-slate-500">Gross Sales:</span>
                <span className="font-bold text-slate-900 dark:text-white">{formatCurrency(state.dashSummary.grossSales, currency)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Expenses:</span>
                <span className="font-bold text-rose-600">-{formatCurrency(state.dashSummary.expensesTotal, currency)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Returns:</span>
                <span className="font-bold text-rose-600">-{formatCurrency(state.dashSummary.returnsTotal, currency)}</span>
              </div>
              {size === "XL" && (
                <div className="flex justify-between border-t border-dashed border-slate-200/50 pt-1 mt-1 dark:border-slate-700/50">
                  <span className="text-slate-500">Invoices:</span>
                  <span className="font-bold text-slate-900 dark:text-white">{state.dashSummary.returnsCount + 1} rung up</span>
                </div>
              )}
            </div>
          )}
        </div>
      );
    }

    case "gross-sales": {
      return (
        <div className="flex h-full min-h-0 min-w-0 flex-col justify-between gap-1">
          <div>
            <p className="truncate text-2xl font-black leading-tight text-slate-900 dark:text-white">
              {formatCurrency(state.dashSummary.grossSales, currency)}
            </p>
          </div>
          {size === "S" && (
            <p className="truncate text-[13px] font-semibold leading-tight text-slate-600 dark:text-slate-300">
              Today&apos;s sales volume
            </p>
          )}
          {size === "M" && (
            <p className="truncate text-[13px] font-semibold leading-tight text-slate-600 dark:text-slate-300">
              Rung up on {formatNumber(state.dashSummary.returnsCount + 1)} invoices today.
            </p>
          )}
          {(size === "L" || size === "XL") && (
            <div className="mt-2 space-y-1 text-xs border-t border-slate-200/50 pt-2 dark:border-slate-700/50">
              <div className="flex justify-between">
                <span className="text-slate-500">Active Invoices:</span>
                <span className="font-bold text-slate-900 dark:text-white">{state.dashSummary.returnsCount + 1}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Average Order:</span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {formatCurrency(state.dashSummary.grossSales / Math.max(state.dashSummary.returnsCount + 1, 1), currency)}
                </span>
              </div>
              {size === "XL" && (
                <div className="mt-1 pt-1 border-t border-dashed border-slate-200/50 text-xs text-slate-400">
                  Includes cash, digital receipts, and ledger customer credit entries.
                </div>
              )}
            </div>
          )}
        </div>
      );
    }

    case "returns": {
      return (
        <div className="flex h-full min-h-0 min-w-0 flex-col justify-between gap-1">
          <div>
            <p className="truncate text-2xl font-black leading-tight text-slate-900 dark:text-white">
              {formatCurrency(state.dashSummary.returnsTotal, currency)}
            </p>
          </div>
          {size === "S" && (
            <p className="truncate text-[13px] font-semibold leading-tight text-slate-600 dark:text-slate-300">
              Returned products
            </p>
          )}
          {size === "M" && (
            <p className="truncate text-[13px] font-semibold leading-tight text-slate-600 dark:text-slate-300">
              From {formatNumber(state.dashSummary.returnsCount)} returned transactions.
            </p>
          )}
          {(size === "L" || size === "XL") && (
            <div className="mt-2 space-y-1 text-xs border-t border-slate-200/50 pt-2 dark:border-slate-700/50">
              <div className="flex justify-between">
                <span className="text-slate-500">Return Tickets:</span>
                <span className="font-bold text-slate-900 dark:text-white">{state.dashSummary.returnsCount} ticket(s)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Outflow impact:</span>
                <span className="font-bold text-rose-600">-{formatCurrency(state.dashSummary.returnsTotal, currency)}</span>
              </div>
              {size === "XL" && (
                <div className="mt-1 pt-1 border-t border-dashed border-slate-200/50 text-xs text-slate-400">
                  Requires manager authentication to approve returns and issue drawer cash refunds.
                </div>
              )}
            </div>
          )}
        </div>
      );
    }

    case "expenses": {
      return (
        <div className="flex h-full min-h-0 min-w-0 flex-col justify-between gap-1">
          <div>
            <p className="truncate text-2xl font-black leading-tight text-slate-900 dark:text-white">
              {formatCurrency(state.dashSummary.expensesTotal, currency)}
            </p>
          </div>
          {size === "S" && (
            <p className="truncate text-[13px] font-semibold leading-tight text-slate-600 dark:text-slate-300">
              Operating expenditures
            </p>
          )}
          {size === "M" && (
            <p className="truncate text-[13px] font-semibold leading-tight text-slate-600 dark:text-slate-300">
              Total of {formatNumber(state.expenses.todayCount)} expenses logged today.
            </p>
          )}
          {(size === "L" || size === "XL") && (
            <div className="mt-2 space-y-1 text-xs border-t border-slate-200/50 pt-2 dark:border-slate-700/50">
              <div className="flex justify-between">
                <span className="text-slate-500">Expense Count:</span>
                <span className="font-bold text-slate-900 dark:text-white">{state.expenses.todayCount} entries</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Average Expense:</span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {formatCurrency(state.dashSummary.expensesTotal / Math.max(state.expenses.todayCount, 1), currency)}
                </span>
              </div>
              {size === "XL" && (
                <div className="mt-1 pt-1 border-t border-dashed border-slate-200/50 text-xs text-slate-400">
                  Tracks salaries, utilities, transport, and general maintenance operations.
                </div>
              )}
            </div>
          )}
        </div>
      );
    }

    case "low-stock": {
      return (
        <div className="flex h-full min-h-0 min-w-0 flex-col justify-between gap-1">
          <div>
            <p className="truncate text-2xl font-black leading-tight text-slate-900 dark:text-white">
              {state.dashSummary.lowStockCount} items
            </p>
          </div>
          {size === "S" && (
            <p className="truncate text-[13px] font-semibold leading-tight text-slate-600 dark:text-slate-300">
              Below reorder thresholds
            </p>
          )}
          {size === "M" && (
            <p className="truncate text-[13px] font-semibold leading-tight text-slate-600 dark:text-slate-300">
              Stock replenishment is recommended.
            </p>
          )}
          {(size === "L" || size === "XL") && (
            <div className="mt-2 space-y-1 text-xs border-t border-slate-200/50 pt-2 dark:border-slate-700/50">
              <p className="text-xs font-bold text-slate-400 uppercase">Status Summary</p>
              <div className="flex justify-between text-slate-600 dark:text-slate-300">
                <span>Total catalog lines:</span>
                <span>Active</span>
              </div>
              <p className="text-xs text-amber-600 dark:text-amber-400 font-semibold mt-1">
                {state.dashSummary.lowStockCount > 0 ? "Items require immediate reorder" : "All products sufficiently stocked"}
              </p>
              {size === "XL" && (
                <Link href="/purchases/replenishment" className="mt-2 text-center block text-xs font-bold text-blue-700 dark:text-blue-400 hover:underline">
                  Open Replenishment Center →
                </Link>
              )}
            </div>
          )}
        </div>
      );
    }

    case "pending-repairs": {
      return (
        <div className="flex h-full min-h-0 min-w-0 flex-col justify-between gap-1">
          <div>
            <p className="truncate text-2xl font-black leading-tight text-slate-900 dark:text-white">
              {state.dashSummary.pendingRepairsCount} jobs
            </p>
          </div>
          {size === "S" && (
            <p className="truncate text-[13px] font-semibold leading-tight text-slate-600 dark:text-slate-300">
              Awaiting parts / In Progress
            </p>
          )}
          {size === "M" && (
            <p className="truncate text-[13px] font-semibold leading-tight text-slate-600 dark:text-slate-300">
              Assigned technician queues.
            </p>
          )}
          {(size === "L" || size === "XL") && (
            <div className="mt-2 space-y-1 text-xs border-t border-slate-200/50 pt-2 dark:border-slate-700/50">
              <div className="flex justify-between">
                <span className="text-slate-500">Uncollected jobs:</span>
                <span className="font-bold text-slate-900 dark:text-white">{state.dashSummary.pendingRepairsCount} active</span>
              </div>
              <p className="text-xs text-amber-600 dark:text-amber-400 font-semibold mt-1">
                Technicians currently working on client repairs.
              </p>
              {size === "XL" && (
                <Link href="/repairs" className="mt-2 text-center block text-xs font-bold text-blue-700 dark:text-blue-400 hover:underline">
                  Manage Repairs Panel →
                </Link>
              )}
            </div>
          )}
        </div>
      );
    }

    case "supplier-dues": {
      return (
        <div className="flex h-full min-h-0 min-w-0 flex-col justify-between gap-1">
          <div>
            <p className="truncate text-2xl font-black leading-tight text-slate-900 dark:text-white">
              {formatCurrency(state.dashSummary.supplierDuesTotal, currency)}
            </p>
          </div>
          {size === "S" && (
            <p className="truncate text-[13px] font-semibold leading-tight text-slate-600 dark:text-slate-300">
              Outstanding bills payable
            </p>
          )}
          {size === "M" && (
            <p className="truncate text-[13px] font-semibold leading-tight text-slate-600 dark:text-slate-300">
              Credit owed to suppliers.
            </p>
          )}
          {(size === "L" || size === "XL") && (
            <div className="mt-2 space-y-1 text-xs border-t border-slate-200/50 pt-2 dark:border-slate-700/50">
              <div className="flex justify-between">
                <span className="text-slate-500">Balance:</span>
                <span className="font-bold text-slate-900 dark:text-white">{formatCurrency(state.dashSummary.supplierDuesTotal, currency)}</span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Outstanding dues automatically accumulate from unpaid FIFO purchase lots.
              </p>
              {size === "XL" && (
                <Link href="/suppliers/dues" className="mt-2 block text-center text-xs font-bold text-blue-700 hover:underline dark:text-blue-400">
                  Open Supplier Dues
                </Link>
              )}
            </div>
          )}
        </div>
      );
    }

    case "customer-dues": {
      return (
        <div className="flex h-full min-h-0 min-w-0 flex-col justify-between gap-1">
          <div>
            <p className="truncate text-2xl font-black leading-tight text-slate-900 dark:text-white">
              {formatCurrency(state.dashSummary.customerDuesTotal, currency)}
            </p>
          </div>
          {size === "S" && (
            <p className="truncate text-[13px] font-semibold leading-tight text-slate-600 dark:text-slate-300">
              Ledger credit receivable
            </p>
          )}
          {size === "M" && (
            <p className="truncate text-[13px] font-semibold leading-tight text-slate-600 dark:text-slate-300">
              Outstanding credit balance.
            </p>
          )}
          {(size === "L" || size === "XL") && (
            <div className="mt-2 space-y-1 text-xs border-t border-slate-200/50 pt-2 dark:border-slate-700/50">
              <div className="flex justify-between">
                <span className="text-slate-500">Debts Owed:</span>
                <span className="font-bold text-slate-900 dark:text-white">{formatCurrency(state.dashSummary.customerDuesTotal, currency)}</span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Customers with ledger balances. Collect settlements to clear.
              </p>
              {size === "XL" && (
                <Link href="/customers" className="mt-2 block text-center text-xs font-bold text-blue-700 hover:underline dark:text-blue-400">
                  Review Customer Accounts
                </Link>
              )}
            </div>
          )}
        </div>
      );
    }

    case "weekly-sales": {
      const weeklyTotal = state.weekSales.reduce((acc, w) => acc + w.total, 0);
      const highDay = state.weekSales.reduce((best, current) => current.total > (best?.total ?? -1) ? current : best, null as any);
      const points: ChartPoint[] = state.weekSales.map((bar, idx) => ({
        key: `${bar.date}-${idx}`,
        label: bar.label,
        value: Number(bar.total ?? 0),
        title: `${bar.date}: ${formatCurrency(bar.total, currency)}`,
      }));

      if (state.weekSales.length === 0) {
        return (
          <ChartFrame title="Weekly Sales (7 days)">
            <ChartEmpty message="No sales in the last 7 days" />
          </ChartFrame>
        );
      }

      if (view === "card") {
        return (
          <div className="flex h-full min-h-0 min-w-0 flex-col justify-between gap-1">
            <div>
              <p className="truncate text-2xl font-black leading-tight text-slate-900 dark:text-white">
                {formatCurrency(weeklyTotal, currency)}
              </p>
            </div>
            <p className={subtitleClass}>7-day total{highDay ? ` · Best ${highDay.label}` : ""}</p>
          </div>
        );
      }

      return (
        <ChartFrame
          title="Weekly Sales (7 days)"
          value={formatCurrency(weeklyTotal, currency)}
          sub={(size === "L" || size === "XL") && highDay ? `Best day: ${highDay.label} · ${formatCurrency(highDay.total, currency)}` : undefined}
        >
          {renderTrendChart(view, points, animate)}
        </ChartFrame>
      );
    }

    case "monthly-sales": {
      const totalMonth = state.monthSales.reduce((acc, m) => acc + m.total, 0);
      const bestDay = state.monthSales.reduce((best, current) => current.total > (best?.total ?? -1) ? current : best, null as any);
      const points: ChartPoint[] = state.monthSales.map((bar) => ({
        key: bar.day,
        label: size === "XL" || bar.day % 5 === 1 ? String(bar.day) : "",
        value: Number(bar.total ?? 0),
        title: `Day ${bar.day}: ${formatCurrency(bar.total, currency)}`,
      }));

      if (state.monthSales.length === 0) {
        return (
          <ChartFrame title="Monthly Sales Trend">
            <ChartEmpty message="No sales recorded this month" />
          </ChartFrame>
        );
      }

      if (view === "card") {
        return (
          <div className="flex h-full min-h-0 min-w-0 flex-col justify-between gap-1">
            <div>
              <p className="truncate text-2xl font-black leading-tight text-slate-900 dark:text-white">
                {formatCurrency(totalMonth, currency)}
              </p>
            </div>
            <p className={subtitleClass}>Month to date</p>
          </div>
        );
      }

      return (
        <ChartFrame
          title="Monthly Sales Trend"
          value={formatCurrency(totalMonth, currency)}
          sub={(size === "L" || size === "XL") && bestDay ? `Best day: ${bestDay.day} · ${formatCurrency(bestDay.total, currency)}` : undefined}
        >
          {renderTrendChart(view, points, animate)}
        </ChartFrame>
      );
    }

    case "top-selling-products":
    case "top-products-revenue": {
      const byRevenue = type === "top-products-revenue";
      const base = state.dashSummary.topSellingProducts || [];
      // Sort by revenue for the revenue variant. This only re-orders values that
      // the server already computed — no money figures are recalculated here.
      const products = byRevenue
        ? [...base].sort((a: any, b: any) => Number(b.revenue ?? 0) - Number(a.revenue ?? 0))
        : base;
      const title = byRevenue ? "Top Products by Revenue" : "Top Products by Quantity";
      const valueOf = (p: any) => (byRevenue ? Number(p.revenue ?? 0) : Number(p.quantity ?? 0));
      const fmt = byRevenue
        ? (v: number) => formatCurrency(v, currency)
        : (v: number) => formatNumber(v);
      const subOf = (p: any) =>
        byRevenue ? `${formatNumber(p.quantity)} sold` : formatCurrency(p.revenue, currency);

      if (products.length === 0) {
        return (
          <ChartFrame title={title}>
            <ChartEmpty message="No sales recorded yet" />
          </ChartFrame>
        );
      }

      if (view === "card") {
        const top = products[0];
        return (
          <div className="flex h-full min-h-0 min-w-0 flex-col justify-between gap-1">
            <div>
              <p className="truncate text-base font-black leading-tight text-slate-900 dark:text-white">
                #1 {top.productName}
              </p>
            </div>
            <p className={subtitleClass}>
              {fmt(valueOf(top))}{byRevenue ? "" : " units"} · {subOf(top)}
            </p>
          </div>
        );
      }

      // Cap row/slice counts by card size so smaller cards never overflow.
      const sliceLimit = size === "S" ? 4 : size === "M" ? 5 : 6;
      const barLimit = size === "S" ? 3 : size === "M" ? 4 : 6;

      if (view === "donut" || view === "pie") {
        const slices = products.slice(0, sliceLimit).map((p: any) => ({ label: p.productName, value: valueOf(p) }));
        const overallTotal = products.reduce((sum: number, p: any) => sum + (Number(valueOf(p)) || 0), 0);
        return (
          <ChartFrame title={title}>
            <PieDonut
              slices={slices}
              formatValue={fmt}
              donut={view === "donut"}
              moreCount={Math.max(products.length - sliceLimit, 0)}
              animate={animate}
              size={size}
              centerValue={fmt(overallTotal)}
              centerLabel={byRevenue ? "Revenue" : "Units"}
            />
          </ChartFrame>
        );
      }

      if (view === "bar") {
        const rows = products.slice(0, barLimit).map((p: any) => ({ label: p.productName, value: valueOf(p), sub: subOf(p) }));
        return (
          <ChartFrame title={title}>
            <HorizontalBars rows={rows} formatValue={fmt} moreCount={Math.max(products.length - barLimit, 0)} animate={animate} />
          </ChartFrame>
        );
      }

      // table / list (default for the quantity variant)
      const limit = size === "XL" ? 10 : size === "L" ? 6 : 4;
      const rows = products.slice(0, limit).map((p: any) => ({ label: p.productName, value: valueOf(p), sub: subOf(p) }));
      return (
        <ChartFrame title={title}>
          <RankingList rows={rows} formatValue={fmt} />
        </ChartFrame>
      );
    }

    case "dues-overview": {
      const receivable = Number(state.dashSummary.customerDuesTotal ?? 0);
      const payable = Number(state.dashSummary.supplierDuesTotal ?? 0);
      const fmt = (v: number) => formatCurrency(v, currency);
      const rows = [
        { label: "Receivable (customers)", value: receivable },
        { label: "Payable (suppliers)", value: payable },
      ];

      if (receivable <= 0 && payable <= 0) {
        return (
          <ChartFrame title="Dues Overview">
            <ChartEmpty message="No outstanding dues" />
          </ChartFrame>
        );
      }

      if (view === "card") {
        return (
          <div className="flex h-full min-h-0 min-w-0 flex-col justify-center gap-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400">Receivable:</span>
              <span className="font-black text-slate-900 dark:text-white">{fmt(receivable)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400">Payable:</span>
              <span className="font-black text-slate-900 dark:text-white">{fmt(payable)}</span>
            </div>
          </div>
        );
      }

      if (view === "donut") {
        return (
          <ChartFrame title="Dues Overview">
            <PieDonut
              slices={rows}
              formatValue={fmt}
              donut
              animate={animate}
              size={size}
              centerValue={fmt(receivable - payable)}
              centerLabel="Net Dues"
            />
          </ChartFrame>
        );
      }

      if (view === "table") {
        return (
          <ChartFrame title="Dues Overview">
            <RankingList rows={rows} formatValue={fmt} />
          </ChartFrame>
        );
      }

      return (
        <ChartFrame title="Dues Overview">
          <HorizontalBars rows={rows} formatValue={fmt} colored animate={animate} />
        </ChartFrame>
      );
    }

    case "sales-vs-expenses": {
      // Both values are already computed by the server (getDashboardSummary);
      // this widget only displays them side by side — no new calculation.
      const sales = Number(state.dashSummary.grossSales ?? 0);
      const expensesTotal = Number(state.dashSummary.expensesTotal ?? 0);
      const fmt = (v: number) => formatCurrency(v, currency);
      const rows = [
        { label: "Sales (today)", value: sales },
        { label: "Expenses (today)", value: expensesTotal },
      ];

      if (sales <= 0 && expensesTotal <= 0) {
        return (
          <ChartFrame title="Sales vs Expenses">
            <ChartEmpty message="No sales or expenses today yet" />
          </ChartFrame>
        );
      }

      if (view === "card") {
        return (
          <div className="flex h-full min-h-0 min-w-0 flex-col justify-center gap-1.5 text-xs">
            <div className="flex justify-between">
              <span className="widget-chart-muted text-slate-500 dark:text-slate-400">Sales:</span>
              <span className="widget-chart-strong font-black text-slate-900 dark:text-white">{fmt(sales)}</span>
            </div>
            <div className="flex justify-between">
              <span className="widget-chart-muted text-slate-500 dark:text-slate-400">Expenses:</span>
              <span className="widget-chart-strong font-black text-slate-900 dark:text-white">{fmt(expensesTotal)}</span>
            </div>
          </div>
        );
      }

      if (view === "donut") {
        return (
          <ChartFrame title="Sales vs Expenses">
            <PieDonut
              slices={rows}
              formatValue={fmt}
              donut
              animate={animate}
              size={size}
              centerValue={fmt(sales - expensesTotal)}
              centerLabel="Net Cash"
            />
          </ChartFrame>
        );
      }

      if (view === "table") {
        return (
          <ChartFrame title="Sales vs Expenses">
            <RankingList rows={rows} formatValue={fmt} />
          </ChartFrame>
        );
      }

      return (
        <ChartFrame title="Sales vs Expenses">
          <HorizontalBars rows={rows} formatValue={fmt} colored animate={animate} />
        </ChartFrame>
      );
    }

    case "recent-activity": {
      const logs = state.activity || [];
      return (
        <div className="flex h-full min-h-0 min-w-0 flex-col justify-between gap-1">
          <div>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">
              Recent Activity Logs
            </p>
          </div>
          {logs.length === 0 ? (
            <p className="text-xs text-slate-400 italic">No activity logged today</p>
          ) : (
            <div className="space-y-1.5 mt-1 flex-1 overflow-hidden">
              {size === "S" && (
                <p className="truncate text-sm font-semibold leading-snug text-slate-800 dark:text-slate-200">
                  Latest: {logs[0]?.left}
                </p>
              )}
              {size === "M" && (
                <div className="space-y-1 text-xs">
                  {logs.slice(0, 3).map((l: any) => (
                    <div key={l.id} className="flex justify-between text-slate-700 dark:text-slate-300 truncate">
                      <span className="truncate max-w-[150px]">{l.left}</span>
                      <span className="font-bold text-slate-500">{new Date(l.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  ))}
                </div>
              )}
              {(size === "L" || size === "XL") && (
                <div className="space-y-1 text-xs">
                  {logs.slice(0, size === "XL" ? 8 : 4).map((l: any) => (
                    <div key={l.id} className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 py-1 last:border-0 truncate">
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: l.color }} />
                      <span className="text-slate-700 dark:text-slate-300 truncate flex-1">{l.left}</span>
                      <span className="font-bold text-xs text-slate-400 shrink-0">
                        {new Date(l.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      );
    }

    case "credit-collected-today": {
      const collections = (state.todayActivity?.creditCollectionCash ?? 0) + (state.todayActivity?.creditCollectionDigital ?? 0);
      return (
        <div className="flex h-full min-h-0 min-w-0 flex-col justify-between gap-1">
          <div>
            <p className="truncate text-2xl font-black leading-tight text-slate-900 dark:text-white">
              {formatCurrency(collections, currency)}
            </p>
          </div>
          {size === "S" && (
            <p className="truncate text-[13px] font-semibold leading-tight text-slate-600 dark:text-slate-300">
              Customer ledger collections
            </p>
          )}
          {size === "M" && (
            <p className="truncate text-[13px] font-semibold leading-tight text-slate-600 dark:text-slate-300">
              Settlements received from active ledger accounts.
            </p>
          )}
          {(size === "L" || size === "XL") && (
            <div className="mt-2 space-y-1 text-xs border-t border-slate-200/50 pt-2 dark:border-slate-700/50">
              <div className="flex justify-between">
                <span className="text-slate-500">Cash collection:</span>
                <span className="font-bold text-slate-900 dark:text-white">{formatCurrency(state.todayActivity?.creditCollectionCash ?? 0, currency)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Digital collection:</span>
                <span className="font-bold text-slate-900 dark:text-white">{formatCurrency(state.todayActivity?.creditCollectionDigital ?? 0, currency)}</span>
              </div>
              {size === "XL" && (
                <p className={tinyMutedClass}>
                  Total settlements: {formatCurrency(collections, currency)}
                </p>
              )}
            </div>
          )}
        </div>
      );
    }

    case "today-net": {
      const net = state.invoices.todaySalesTotal - state.expenses.todayTotal;
      return (
        <div className="flex h-full min-h-0 min-w-0 flex-col justify-between gap-1">
          <div>
            <p className="truncate text-2xl font-black leading-tight text-slate-900 dark:text-white">
              {formatCurrency(net, currency)}
            </p>
          </div>
          {size === "S" && (
            <p className="truncate text-[13px] font-semibold leading-tight text-slate-600 dark:text-slate-300">
              Operational net cash flow
            </p>
          )}
          {size === "M" && (
            <p className="truncate text-[13px] font-semibold leading-tight text-slate-600 dark:text-slate-300">
              Calculated as today&apos;s invoices minus expenses.
            </p>
          )}
          {(size === "L" || size === "XL") && (
            <div className="mt-2 space-y-1 text-xs border-t border-slate-200/50 pt-2 dark:border-slate-700/50">
              <div className="flex justify-between">
                <span className="text-slate-500">Sales Inflow:</span>
                <span className="font-bold text-emerald-600">+{formatCurrency(state.invoices.todaySalesTotal, currency)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Expenses Outflow:</span>
                <span className="font-bold text-rose-600">-{formatCurrency(state.expenses.todayTotal, currency)}</span>
              </div>
              {size === "XL" && (
                <p className={tinyMutedClass}>
                  Net result: {net >= 0 ? "positive operational flow" : "expense-heavy day"}.
                </p>
              )}
            </div>
          )}
        </div>
      );
    }

    case "today-closing": {
      const isClosed = Boolean(state.todayClosing?.finalized_by);
      return (
        <div className="flex h-full min-h-0 min-w-0 flex-col justify-between gap-1">
          <div>
            <p className="truncate text-2xl font-black leading-tight text-slate-900 dark:text-white">
              {isClosed ? "Closed" : "Open"}
            </p>
          </div>
          {size === "S" && (
            <p className="truncate text-[13px] font-semibold leading-tight text-slate-600 dark:text-slate-300">
              Drawer status today
            </p>
          )}
          {size === "M" && (
            <p className="truncate text-[13px] font-semibold leading-tight text-slate-600 dark:text-slate-300">
              {isClosed ? "Finalized by manager." : "Expected drawer cash accumulating."}
            </p>
          )}
          {(size === "L" || size === "XL") && (
            <div className="mt-2 space-y-1 text-xs border-t border-slate-200/50 pt-2 dark:border-slate-700/50">
              <div className="flex justify-between">
                <span className="text-slate-500">Expected Cash:</span>
                <span className="font-bold text-slate-900 dark:text-white">{formatCurrency(state.todayActivity?.expectedCash ?? 0, currency)}</span>
              </div>
              {isClosed && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Cash Difference:</span>
                  <span className={`font-bold ${state.todayClosing?.cash_difference >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                    {formatCurrency(state.todayClosing?.cash_difference ?? 0, currency)}
                  </span>
                </div>
              )}
              {size === "XL" && (
                <p className={tinyMutedClass}>
                  {isClosed ? "The drawer was finalized for this branch." : "The drawer is still open for today."}
                </p>
              )}
            </div>
          )}
        </div>
      );
    }

    case "today-expenses": {
      return (
        <div className="flex h-full min-h-0 min-w-0 flex-col justify-between gap-1">
          <div>
            <p className="truncate text-2xl font-black leading-tight text-slate-900 dark:text-white">
              {state.expenses.todayCount} entries
            </p>
          </div>
          {size === "S" && (
            <p className="truncate text-[13px] font-semibold leading-tight text-slate-600 dark:text-slate-300">
              Expense vouchers today
            </p>
          )}
          {size === "M" && (
            <p className="truncate text-[13px] font-semibold leading-tight text-slate-600 dark:text-slate-300">
              Totaling {formatCurrency(state.expenses.todayTotal, currency)}.
            </p>
          )}
          {(size === "L" || size === "XL") && (
            <div className="mt-2 space-y-1 text-xs border-t border-slate-200/50 pt-2 dark:border-slate-700/50">
              <div className="flex justify-between">
                <span className="text-slate-500">Total Outflow:</span>
                <span className="font-bold text-rose-600">-{formatCurrency(state.expenses.todayTotal, currency)}</span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Vouchers require name, category, payment mode, and supporting bill details.
              </p>
              {size === "XL" && state.expenses.topCategoryThisMonth && (
                <div className="flex justify-between border-t border-dashed border-slate-200/50 pt-1 mt-1 dark:border-slate-700/50">
                  <span className="text-slate-500">Top month category:</span>
                  <span className="font-bold text-slate-900 dark:text-white">{state.expenses.topCategoryThisMonth.name}</span>
                </div>
              )}
            </div>
          )}
        </div>
      );
    }

    case "stock-valuation": {
      return (
        <div className="flex h-full min-h-0 min-w-0 flex-col justify-between gap-1">
          <div>
            <p className="truncate text-2xl font-black leading-tight text-slate-900 dark:text-white">
              {formatCurrency(state.stockValue, currency)}
            </p>
          </div>
          {size === "S" && (
            <p className="truncate text-[13px] font-semibold leading-tight text-slate-600 dark:text-slate-300">
              Cost value of stock lots
            </p>
          )}
          {size === "M" && (
            <p className="truncate text-[13px] font-semibold leading-tight text-slate-600 dark:text-slate-300">
              Calculated using FIFO batch pricing logs.
            </p>
          )}
          {(size === "L" || size === "XL") && (
            <div className="mt-2 space-y-1 text-xs border-t border-slate-200/50 pt-2 dark:border-slate-700/50">
              <p className="text-xs text-slate-400">
                Asset valuation shows absolute cost spent to procure all active store products.
              </p>
              {size === "XL" && (
                <p className={tinyMutedClass}>
                  Uses active stock lots with quantity remaining above zero.
                </p>
              )}
            </div>
          )}
        </div>
      );
    }

    case "potential-profit-in-stock": {
      return (
        <div className="flex h-full min-h-0 min-w-0 flex-col justify-between gap-1">
          <div>
            <p className="truncate text-xl font-black leading-tight text-slate-900 dark:text-white">
              {formatCurrency(state.potentialProfit.potentialProfitInStock, currency)}
            </p>
          </div>
          {size === "S" && (
            <p className="truncate text-[13px] font-semibold leading-tight text-slate-600 dark:text-slate-300">
              Unearned profit estimate
            </p>
          )}
          {size === "M" && (
            <div className="mt-1 grid gap-0.5 text-[11px] leading-tight">
              <div className="flex min-w-0 justify-between gap-2">
                <span className="shrink-0 text-slate-500">Retail:</span>
                <span className="truncate text-right font-bold text-slate-800 dark:text-white">{formatCurrency(state.potentialProfit.totalInventorySaleValue, currency)}</span>
              </div>
              <div className="flex min-w-0 justify-between gap-2">
                <span className="shrink-0 text-slate-500">FIFO:</span>
                <span className="truncate text-right font-semibold text-slate-800 dark:text-white">{formatCurrency(state.potentialProfit.totalInventoryCostValue, currency)}</span>
              </div>
            </div>
          )}
          {(size === "L" || size === "XL") && (
            <div className="mt-2 space-y-1 text-xs border-t border-slate-200/50 pt-2 dark:border-slate-700/50">
              <div className="flex justify-between">
                <span className="text-slate-500">Retail Value:</span>
                <span className="font-bold text-slate-900 dark:text-white">{formatCurrency(state.potentialProfit.totalInventorySaleValue, currency)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">FIFO Cost:</span>
                <span className="font-bold text-slate-900 dark:text-white">{formatCurrency(state.potentialProfit.totalInventoryCostValue, currency)}</span>
              </div>
              {state.potentialProfit.marginPercent !== null && (
                <div className={`flex justify-between ${size === "XL" ? "border-t border-dashed border-slate-200/50 pt-1 mt-1 dark:border-slate-700/50" : ""}`}>
                  <span className="text-slate-500">Average Margin:</span>
                  <span className="font-black text-emerald-600 dark:text-emerald-400">{state.potentialProfit.marginPercent}%</span>
                </div>
              )}
              {size === "XL" && (
                <p className={tinyMutedClass}>
                  Sale value minus FIFO stock cost for currently active inventory.
                </p>
              )}
            </div>
          )}
        </div>
      );
    }

    case "invoice-status": {
      const s = state.analytics?.invoiceStatus ?? { paid: 0, partial: 0, unpaid: 0 };
      const data: LabelledDatum[] = [
        { label: "Paid", value: Number(s.paid ?? 0) },
        { label: "Partial", value: Number(s.partial ?? 0) },
        { label: "Unpaid", value: Number(s.unpaid ?? 0) },
      ];
      return renderDistribution({
        view, title: "Invoice Status (this month)", data, size, animate,
        fmt: (v) => formatNumber(v), colored: true,
        emptyMessage: "No invoices yet this month",
      });
    }

    case "payment-method-split": {
      const data: LabelledDatum[] = (state.analytics?.paymentMethods ?? []).map((d: LabelledDatum) => ({
        label: prettyLabel(d.label), value: Number(d.value ?? 0),
      }));
      return renderDistribution({
        view, title: "Payment Methods (this month)", data, size, animate,
        fmt: (v) => formatCurrency(v, currency), colored: true,
        emptyMessage: "No payments recorded yet this month",
      });
    }

    case "expense-category-breakdown": {
      const data: LabelledDatum[] = (state.analytics?.expenseCategories ?? []).map((d: LabelledDatum) => ({
        label: prettyLabel(d.label), value: Number(d.value ?? 0),
      }));
      return renderDistribution({
        view, title: "Expense Categories (this month)", data, size, animate,
        fmt: (v) => formatCurrency(v, currency), colored: true,
        emptyMessage: "No expenses logged yet this month",
      });
    }

    case "repair-status-breakdown": {
      const data: LabelledDatum[] = (state.analytics?.repairStatuses ?? []).map((d: LabelledDatum) => ({
        label: prettyLabel(d.label), value: Number(d.value ?? 0),
      }));
      return renderDistribution({
        view, title: "Repair Status (last 90 days)", data, size, animate,
        fmt: (v) => formatNumber(v), colored: true,
        emptyMessage: "No repairs in the last 90 days",
      });
    }

    case "stock-by-category": {
      const data: LabelledDatum[] = (state.analytics?.stockByCategory ?? []).map((d: LabelledDatum) => ({
        label: d.label, value: Number(d.value ?? 0),
      }));
      return renderDistribution({
        view, title: "Stock by Category", data, size, animate,
        fmt: (v) => formatNumber(v), colored: true,
        emptyMessage: "No stock on hand yet",
      });
    }

    case "top-customer-dues": {
      const data: LabelledDatum[] = (state.analytics?.topCustomerDues ?? []).map((d: LabelledDatum) => ({
        label: d.label, value: Number(d.value ?? 0),
      }));
      return renderDistribution({
        view, title: "Top Customer Dues", data, size, animate,
        fmt: (v) => formatCurrency(v, currency), colored: false,
        emptyMessage: "No outstanding customer dues",
      });
    }

    case "sales-by-weekday": {
      const series: LabelledDatum[] = state.analytics?.salesByWeekday ?? [];
      const total = series.reduce((sum, d) => sum + Number(d.value ?? 0), 0);
      const best = series.reduce((b, d) => (Number(d.value ?? 0) > (b?.value ?? -1) ? d : b), null as LabelledDatum | null);

      if (total <= 0) {
        return (
          <ChartFrame title="Sales by Day of Week">
            <ChartEmpty message="No sales in the last 8 weeks" />
          </ChartFrame>
        );
      }

      if (view === "card") {
        return (
          <div className="flex h-full min-h-0 min-w-0 flex-col justify-between gap-1">
            <div>
              <p className="widget-chart-strong truncate text-base font-black leading-tight text-slate-900 dark:text-white">
                {best ? best.label : "—"}
              </p>
            </div>
            <p className={subtitleClass}>Best weekday{best ? ` · ${formatCurrency(best.value, currency)}` : ""}</p>
          </div>
        );
      }

      if (view === "donut") {
        return (
          <ChartFrame title="Sales by Day of Week">
            <PieDonut
              slices={series}
              formatValue={(v) => formatCurrency(v, currency)}
              donut
              animate={animate}
              size={size}
              centerValue={formatCurrency(total, currency)}
              centerLabel="Sales"
            />
          </ChartFrame>
        );
      }

      if (view === "table") {
        return (
          <ChartFrame title="Sales by Day of Week">
            <RankingList rows={series} formatValue={(v) => formatCurrency(v, currency)} />
          </ChartFrame>
        );
      }

      const points: ChartPoint[] = series.map((d, idx) => ({
        key: `${d.label}-${idx}`,
        label: d.label,
        value: Number(d.value ?? 0),
        title: `${d.label}: ${formatCurrency(d.value, currency)}`,
      }));
      return (
        <ChartFrame
          title="Sales by Day of Week"
          sub={(size === "L" || size === "XL") && best ? `Best: ${best.label} · ${formatCurrency(best.value, currency)}` : undefined}
        >
          <VerticalBars points={points} heightClass="h-full min-h-[2.5rem]" animate={animate} />
        </ChartFrame>
      );
    }

    case "avg-order-value": {
      const aov = state.analytics?.avgOrderValue ?? { total: 0, count: 0, average: 0 };
      return (
        <div className="flex h-full min-h-0 min-w-0 flex-col justify-between gap-1">
          <div>
            <p className="truncate text-2xl font-black leading-tight text-slate-900 dark:text-white">
              {formatCurrency(Number(aov.average ?? 0), currency)}
            </p>
          </div>
          {size === "S" && (
            <p className="truncate text-[13px] font-semibold leading-tight text-slate-600 dark:text-slate-300">
              Avg invoice this month
            </p>
          )}
          {size !== "S" && (
            <div className="mt-1 space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Invoices:</span>
                <span className="font-bold text-slate-900 dark:text-white">{formatNumber(Number(aov.count ?? 0))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Total sales:</span>
                <span className="font-bold text-slate-900 dark:text-white">{formatCurrency(Number(aov.total ?? 0), currency)}</span>
              </div>
            </div>
          )}
        </div>
      );
    }

    default:
      return null;
  }
}
