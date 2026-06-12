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

// Approved widget colors that are readable in both light and dark modes
export type WidgetColor = "neutral" | "info" | "success" | "warning" | "danger";
export type BoardFillStyle = "solid" | "gradient";
export type WidgetFillStyle = "inherit" | BoardFillStyle;

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
  { id: "top-selling-products", type: "top-selling-products", category: "sales", title: "Top Products", description: "Best-selling inventory items by volume and revenue", defaultSize: "L", defaultColor: "neutral", icon: Boxes },
  { id: "recent-activity", type: "recent-activity", category: "activity", title: "Recent Activity", description: "Live audit logs of recent system activities", defaultSize: "L", defaultColor: "neutral", icon: Clock },
  { id: "credit-collected-today", type: "credit-collected-today", category: "money", title: "Credit Collected", description: "Credit settlements collected from customers today", defaultSize: "S", defaultColor: "success", icon: CreditCard },
  { id: "today-net", type: "today-net", category: "money", title: "Today's Net Cash", description: "Net operational cash flow (sales minus expenses)", defaultSize: "S", defaultColor: "success", icon: Wallet },
  { id: "today-closing", type: "today-closing", category: "money", title: "Drawer/Closing Status", description: "Current status of the daily drawer closing", defaultSize: "S", defaultColor: "neutral", icon: CalendarCheck },
  { id: "today-expenses", type: "today-expenses", category: "money", title: "Expenses Count", description: "Number of expense entries logged today", defaultSize: "S", defaultColor: "danger", icon: Wallet },
  { id: "stock-valuation", type: "stock-valuation", category: "inventory", title: "Stock Valuation", description: "Current inventory valuation at purchase cost", defaultSize: "S", defaultColor: "neutral", icon: Boxes },
  { id: "potential-profit-in-stock", type: "potential-profit-in-stock", category: "inventory", title: "Potential Profit", description: "Unearned profit potential in current active stock", defaultSize: "M", defaultColor: "warning", icon: Percent },
];

const subtitleClass = "text-sm font-semibold leading-snug text-slate-600 dark:text-slate-300";
const tinyMutedClass = "text-[11px] leading-snug text-slate-500 dark:text-slate-400";

function TrendBarChart({
  bars,
  maxValue,
  heightClass,
  barClassName,
  label,
}: {
  bars: { key: string | number; label: string; value: number; title: string }[];
  maxValue: number;
  heightClass: string;
  barClassName: string;
  label: string;
}) {
  const safeMax = Math.max(maxValue, 1);

  return (
    <div className={`flex items-end gap-1 ${heightClass}`} role="img" aria-label={label}>
      {bars.map((bar) => {
        const value = Number(bar.value ?? 0);
        const pct = (value / safeMax) * 100;
        const height = value > 0 ? Math.max(pct, 8) : 2;

        return (
          <div key={bar.key} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
            <div className="flex h-full w-full items-end">
              <div
                className={`w-full rounded-t-sm transition-colors ${barClassName}`}
                style={{ height: `${height}%` }}
                title={bar.title}
              />
            </div>
            <span className="text-xs font-bold leading-none text-slate-500 dark:text-slate-400">
              {bar.label}
            </span>
          </div>
        );
      })}
    </div>
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
    currency: string;
    labels: any;
    isPrivileged: boolean;
  }
) {
  const currency = state.currency;

  switch (type) {
    case "today-profit": {
      const isPositive = state.dashSummary.todayProfit >= 0;
      return (
        <div className="flex flex-col h-full justify-between">
          <div>
            <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">
              {formatCurrency(state.dashSummary.todayProfit, currency)}
            </p>
          </div>
          {size === "S" && (
            <p className="text-sm font-semibold leading-snug text-slate-600 dark:text-slate-300">
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
        <div className="flex flex-col h-full justify-between">
          <div>
            <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">
              {formatCurrency(state.dashSummary.grossSales, currency)}
            </p>
          </div>
          {size === "S" && (
            <p className="text-sm font-semibold leading-snug text-slate-600 dark:text-slate-300">
              Today&apos;s sales volume
            </p>
          )}
          {size === "M" && (
            <p className="text-sm font-semibold leading-snug text-slate-600 dark:text-slate-300 mt-2">
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
        <div className="flex flex-col h-full justify-between">
          <div>
            <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">
              {formatCurrency(state.dashSummary.returnsTotal, currency)}
            </p>
          </div>
          {size === "S" && (
            <p className="text-sm font-semibold leading-snug text-slate-600 dark:text-slate-300">
              Returned products
            </p>
          )}
          {size === "M" && (
            <p className="text-sm font-semibold leading-snug text-slate-600 dark:text-slate-300 mt-2">
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
        <div className="flex flex-col h-full justify-between">
          <div>
            <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">
              {formatCurrency(state.dashSummary.expensesTotal, currency)}
            </p>
          </div>
          {size === "S" && (
            <p className="text-sm font-semibold leading-snug text-slate-600 dark:text-slate-300">
              Operating expenditures
            </p>
          )}
          {size === "M" && (
            <p className="text-sm font-semibold leading-snug text-slate-600 dark:text-slate-300 mt-2">
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
        <div className="flex flex-col h-full justify-between">
          <div>
            <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">
              {state.dashSummary.lowStockCount} items
            </p>
          </div>
          {size === "S" && (
            <p className="text-sm font-semibold leading-snug text-slate-600 dark:text-slate-300">
              Below reorder thresholds
            </p>
          )}
          {size === "M" && (
            <p className="text-sm font-semibold leading-snug text-slate-600 dark:text-slate-300 mt-2">
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
        <div className="flex flex-col h-full justify-between">
          <div>
            <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">
              {state.dashSummary.pendingRepairsCount} jobs
            </p>
          </div>
          {size === "S" && (
            <p className="text-sm font-semibold leading-snug text-slate-600 dark:text-slate-300">
              Awaiting parts / In Progress
            </p>
          )}
          {size === "M" && (
            <p className="text-sm font-semibold leading-snug text-slate-600 dark:text-slate-300 mt-2">
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
        <div className="flex flex-col h-full justify-between">
          <div>
            <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">
              {formatCurrency(state.dashSummary.supplierDuesTotal, currency)}
            </p>
          </div>
          {size === "S" && (
            <p className="text-sm font-semibold leading-snug text-slate-600 dark:text-slate-300">
              Outstanding bills payable
            </p>
          )}
          {size === "M" && (
            <p className="text-sm font-semibold leading-snug text-slate-600 dark:text-slate-300 mt-2">
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
        <div className="flex flex-col h-full justify-between">
          <div>
            <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">
              {formatCurrency(state.dashSummary.customerDuesTotal, currency)}
            </p>
          </div>
          {size === "S" && (
            <p className="text-sm font-semibold leading-snug text-slate-600 dark:text-slate-300">
              Ledger credit receivable
            </p>
          )}
          {size === "M" && (
            <p className="text-sm font-semibold leading-snug text-slate-600 dark:text-slate-300 mt-2">
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
      const maxVal = Math.max(...state.weekSales.map((w) => w.total), 1);
      const weeklyTotal = state.weekSales.reduce((acc, w) => acc + w.total, 0);
      const highDay = state.weekSales.reduce((best, current) => current.total > (best?.total ?? -1) ? current : best, null as any);
      const chartBars = state.weekSales.map((bar, idx) => ({
        key: `${bar.date}-${idx}`,
        label: bar.label,
        value: Number(bar.total ?? 0),
        title: `${bar.date}: ${formatCurrency(bar.total, currency)}`,
      }));
      return (
        <div className="flex flex-col h-full justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">
              Last 7 Days Sales
            </p>
          </div>
          {size === "S" && (
            <div>
              <p className="text-lg font-bold text-slate-900 dark:text-white mt-1">
                {formatCurrency(weeklyTotal, currency)}
              </p>
              <p className={subtitleClass}>7-day total</p>
            </div>
          )}
          {size !== "S" && state.weekSales.length > 0 && (
            <TrendBarChart
              bars={chartBars}
              maxValue={maxVal}
              heightClass={size === "M" ? "h-12 my-2" : size === "L" ? "h-20 my-2" : "h-28 my-2"}
              barClassName="bg-blue-600/60 hover:bg-blue-700 dark:bg-blue-400/70 dark:hover:bg-blue-300"
              label="Weekly sales bar chart"
            />
          )}
          {(size === "L" || size === "XL") && (
            <div className="text-xs text-slate-500 dark:text-slate-400 border-t border-slate-200/50 pt-1 mt-1 dark:border-slate-700/50">
              Total weekly revenue: <strong className="text-slate-900 dark:text-white">
                {formatCurrency(weeklyTotal, currency)}
              </strong>
              {size === "XL" && highDay && (
                <p className="mt-1 font-semibold text-slate-600 dark:text-slate-300">
                  Best day: {highDay.label} at {formatCurrency(highDay.total, currency)}
                </p>
              )}
            </div>
          )}
        </div>
      );
    }

    case "monthly-sales": {
      const maxVal = Math.max(...state.monthSales.map((m) => m.total), 1);
      const totalMonth = state.monthSales.reduce((acc, m) => acc + m.total, 0);
      const bestDay = state.monthSales.reduce((best, current) => current.total > (best?.total ?? -1) ? current : best, null as any);
      const chartBars = state.monthSales.map((bar) => ({
        key: bar.day,
        label: size === "XL" || bar.day % 5 === 1 ? String(bar.day) : "",
        value: Number(bar.total ?? 0),
        title: `Day ${bar.day}: ${formatCurrency(bar.total, currency)}`,
      }));
      return (
        <div className="flex flex-col h-full justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">
              Monthly Sales Trend
            </p>
          </div>
          {size === "S" && (
            <div>
              <p className="text-lg font-bold text-slate-900 dark:text-white mt-1">
                {formatCurrency(totalMonth, currency)}
              </p>
              <p className={subtitleClass}>Month to date</p>
            </div>
          )}
          {size !== "S" && state.monthSales.length > 0 && (
            <TrendBarChart
              bars={chartBars}
              maxValue={maxVal}
              heightClass={size === "M" ? "h-12 my-2" : size === "L" ? "h-20 my-2" : "h-28 my-2"}
              barClassName="bg-cyan-600/55 hover:bg-cyan-700 dark:bg-cyan-400/70 dark:hover:bg-cyan-300"
              label="Monthly sales bar chart"
            />
          )}
          {(size === "L" || size === "XL") && (
            <div className="text-xs text-slate-500 dark:text-slate-400 border-t border-slate-200/50 pt-1 mt-1 dark:border-slate-700/50">
              Total month-to-date: <strong className="text-slate-900 dark:text-white">{formatCurrency(totalMonth, currency)}</strong>
              {size === "XL" && bestDay && (
                <p className="mt-1 font-semibold text-slate-600 dark:text-slate-300">
                  Best day: {bestDay.day} at {formatCurrency(bestDay.total, currency)}
                </p>
              )}
            </div>
          )}
        </div>
      );
    }

    case "top-selling-products": {
      const products = state.dashSummary.topSellingProducts || [];
      return (
        <div className="flex flex-col h-full justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">
              Top Selling Products
            </p>
          </div>
          {products.length === 0 ? (
            <p className="text-xs text-slate-400 italic">No sales recorded yet</p>
          ) : (
            <div className="space-y-1 mt-1 flex-1">
              {size === "S" && (
                <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                  #1: {products[0]?.productName} ({products[0]?.quantity} sold)
                </p>
              )}
              {size === "M" && (
                <div className="space-y-1 text-xs">
                  {products.slice(0, 3).map((p: any, idx: number) => (
                    <div key={p.productName} className="flex justify-between text-slate-700 dark:text-slate-300">
                      <span className="truncate max-w-[120px]">{idx + 1}. {p.productName}</span>
                      <span className="font-bold">{p.quantity} units</span>
                    </div>
                  ))}
                </div>
              )}
              {(size === "L" || size === "XL") && (
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-400">
                      <th className="pb-1">Product</th>
                      <th className="pb-1 text-right">Qty</th>
                      <th className="pb-1 text-right">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.slice(0, size === "XL" ? 10 : 5).map((p: any, idx: number) => (
                      <tr key={p.productName} className="border-b border-slate-100 dark:border-slate-800 last:border-0">
                        <td className="py-1 font-medium text-slate-900 dark:text-slate-100 truncate max-w-[150px]">
                          {idx + 1}. {p.productName}
                        </td>
                        <td className="py-1 text-right text-slate-700 dark:text-slate-300">{p.quantity}</td>
                        <td className="py-1 text-right font-bold text-slate-900 dark:text-white">
                          {formatCurrency(p.revenue, currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      );
    }

    case "recent-activity": {
      const logs = state.activity || [];
      return (
        <div className="flex flex-col h-full justify-between">
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
        <div className="flex flex-col h-full justify-between">
          <div>
            <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">
              {formatCurrency(collections, currency)}
            </p>
          </div>
          {size === "S" && (
            <p className="text-sm font-semibold leading-snug text-slate-600 dark:text-slate-300">
              Customer ledger collections
            </p>
          )}
          {size === "M" && (
            <p className="text-sm font-semibold leading-snug text-slate-600 dark:text-slate-300 mt-2">
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
        <div className="flex flex-col h-full justify-between">
          <div>
            <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">
              {formatCurrency(net, currency)}
            </p>
          </div>
          {size === "S" && (
            <p className="text-sm font-semibold leading-snug text-slate-600 dark:text-slate-300">
              Operational net cash flow
            </p>
          )}
          {size === "M" && (
            <p className="text-sm font-semibold leading-snug text-slate-600 dark:text-slate-300 mt-2">
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
        <div className="flex flex-col h-full justify-between">
          <div>
            <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">
              {isClosed ? "Closed" : "Open"}
            </p>
          </div>
          {size === "S" && (
            <p className="text-sm font-semibold leading-snug text-slate-600 dark:text-slate-300">
              Drawer status today
            </p>
          )}
          {size === "M" && (
            <p className="text-sm font-semibold leading-snug text-slate-600 dark:text-slate-300 mt-2">
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
        <div className="flex flex-col h-full justify-between">
          <div>
            <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">
              {state.expenses.todayCount} entries
            </p>
          </div>
          {size === "S" && (
            <p className="text-sm font-semibold leading-snug text-slate-600 dark:text-slate-300">
              Expense vouchers today
            </p>
          )}
          {size === "M" && (
            <p className="text-sm font-semibold leading-snug text-slate-600 dark:text-slate-300 mt-2">
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
        <div className="flex flex-col h-full justify-between">
          <div>
            <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">
              {formatCurrency(state.stockValue, currency)}
            </p>
          </div>
          {size === "S" && (
            <p className="text-sm font-semibold leading-snug text-slate-600 dark:text-slate-300">
              Cost value of stock lots
            </p>
          )}
          {size === "M" && (
            <p className="text-sm font-semibold leading-snug text-slate-600 dark:text-slate-300 mt-2">
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
        <div className="flex flex-col h-full justify-between">
          <div>
            <p className="text-xl font-black text-slate-900 dark:text-white mt-1">
              {formatCurrency(state.potentialProfit.potentialProfitInStock, currency)}
            </p>
          </div>
          {size === "S" && (
            <p className="text-sm font-semibold leading-snug text-slate-600 dark:text-slate-300">
              Unearned profit estimate
            </p>
          )}
          {size === "M" && (
            <div className="text-xs space-y-0.5 mt-2">
              <div className="flex justify-between">
                <span className="text-slate-500">Retail Value:</span>
                <span className="font-bold text-slate-800 dark:text-white">{formatCurrency(state.potentialProfit.totalInventorySaleValue, currency)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">FIFO Cost:</span>
                <span className="font-semibold text-slate-800 dark:text-white">{formatCurrency(state.potentialProfit.totalInventoryCostValue, currency)}</span>
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

    default:
      return null;
  }
}
