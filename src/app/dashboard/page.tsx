import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Wrench, BarChart3,
  TrendingUp, Users, Wallet, CalendarCheck,
  Bell, PackageSearch, CreditCard,
  Boxes, Clock,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { getCurrentContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { invoiceCounts } from "@/lib/data/invoices";
import { expenseCounts } from "@/lib/data/expenses";
import { getClosing, getDayActivity, todayLocalDate } from "@/lib/data/daily-closing";
import { getDashboardSummary } from "@/lib/data/dashboard";
import { getPotentialProfitInStock } from "@/lib/data/reports";
import { formatCurrency, formatNumber } from "@/lib/formatters";
import { getServerDict } from "@/lib/i18n/server";
import { DashboardStatLayout, type DashboardLayoutLabels, type DashboardStatCard } from "./dashboard-stat-layout";

async function stockValueStats(organizationId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("product_stock_lots")
    .select("quantity_remaining, unit_cost")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .gt("quantity_remaining", 0);
  if (error) return 0;
  return data?.reduce((acc, lot) => acc + (Number(lot.quantity_remaining) * Number(lot.unit_cost)), 0) ?? 0;
}

async function weeklySales(organizationId: string, branchId: string | null) {
  const supabase = await createClient();
  const today = new Date();
  const dayAgo = new Date(today);
  dayAgo.setDate(dayAgo.getDate() - 6);
  dayAgo.setHours(0, 0, 0, 0);
  const startStr = dayAgo.toISOString();

  let query = supabase
    .from("invoices")
    .select("invoice_date, grand_total")
    .eq("organization_id", organizationId)
    .gte("invoice_date", startStr)
    .neq("status", "void")
    .order("invoice_date", { ascending: true });

  if (branchId) {
    query = query.eq("branch_id", branchId);
  }

  const { data } = await query;
  if (!data || data.length === 0) return [];

  const dayTotals = new Map<string, number>();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    dayTotals.set(d.toISOString().split("T")[0], 0);
  }

  for (const row of data) {
    const dateStr = row.invoice_date?.split("T")[0];
    if (dateStr && dayTotals.has(dateStr)) {
      dayTotals.set(dateStr, dayTotals.get(dateStr)! + Number(row.grand_total ?? 0));
    }
  }

  const labels = ["S", "M", "T", "W", "T", "F", "S"];
  const dayOfWeek = today.getDay();
  const orderedLabels = [...labels.slice(dayOfWeek + 1), ...labels.slice(0, dayOfWeek + 1)];

  return Array.from(dayTotals.entries()).map(([dateStr, total], i) => ({
    label: orderedLabels[i] ?? dateStr.slice(5),
    total,
    date: dateStr,
  }));
}

async function monthlySales(organizationId: string, branchId: string | null) {
  const supabase = await createClient();
  const today = new Date();
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  startOfMonth.setHours(0, 0, 0, 0);
  const startStr = startOfMonth.toISOString();

  let query = supabase
    .from("invoices")
    .select("invoice_date, grand_total")
    .eq("organization_id", organizationId)
    .gte("invoice_date", startStr)
    .neq("status", "void")
    .order("invoice_date", { ascending: true });

  if (branchId) {
    query = query.eq("branch_id", branchId);
  }

  const { data } = await query;
  if (!data || data.length === 0) return [];

  const dayTotals = new Map<number, number>();
  for (const row of data) {
    const d = new Date(row.invoice_date);
    const day = d.getDate();
    dayTotals.set(day, (dayTotals.get(day) ?? 0) + Number(row.grand_total ?? 0));
  }

  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const result: { day: number; total: number }[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    result.push({ day: d, total: dayTotals.get(d) ?? 0 });
  }
  return result;
}

async function recentActivity(organizationId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("audit_logs")
    .select("id, action, details, module, metadata, created_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(5);

  if (!data || data.length === 0) return [];

  return data.map((r) => {
    const meta = (r.metadata ?? {}) as Record<string, unknown>;
    let icon = "receipt";
    let rightText = "";
    let color = "#3b82f6";

    if (r.module === "pos" || r.module === "invoices") {
      icon = "sale";
      rightText = meta.amount ? `Rs ${formatNumber(Number(meta.amount))}` : "";
      color = "#3b82f6";
    } else if (r.module === "stock" || r.module === "inventory") {
      icon = "stock";
      rightText = meta.quantity ? `Qty ${meta.quantity}` : "";
      color = "#f59e0b";
    } else if (r.module === "repairs") {
      icon = "repair";
      rightText = r.action?.includes("ready") || r.action?.includes("complete") ? "Ready" : "Updated";
      color = "#8b5cf6";
    } else if (r.module === "payments" || r.module === "customers") {
      icon = "payment";
      rightText = meta.amount ? `Rs ${formatNumber(Number(meta.amount))}` : "";
      color = "#10b981";
    } else if (r.module === "expenses") {
      icon = "expense";
      rightText = meta.amount ? `Rs ${formatNumber(Number(meta.amount))}` : "";
      color = "#ef4444";
    } else if (r.module === "privacy") {
      icon = "privacy";
      color = "#6366f1";
    }

    const actionLabel = r.action?.replace(/\./g, " ")?.replace(/_/g, " ") ?? "";
    const details = r.details ?? "";

    return {
      id: r.id,
      icon,
      left: actionLabel ? `${actionLabel}${details ? ` — ${details}` : ""}` : details,
      right: rightText,
      color,
      time: r.created_at,
    };
  });
}

export default async function DashboardPage() {
  if (!env.isSupabaseConfigured) {
    return (
      <AppShell pageTitle="Dashboard">
        <div className="flex items-center justify-center py-20">
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <h2 className="text-lg font-black text-slate-950">Supabase not configured</h2>
            <p className="mt-2 text-sm text-slate-500">
              Add NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY to .env.local, then restart the dev server.
            </p>
          </div>
        </div>
      </AppShell>
    );
  }

  const { user, profile, organization } = await getCurrentContext();
  if (!user) redirect("/login");
  if (!profile?.organization_id) redirect("/setup");

  const orgId = profile.organization_id;
  const today = todayLocalDate();
  const branchId = profile.branch_id ?? null;
  const currency = organization?.currency_code ?? "PKR";

  const [invoices, stockValue, expenses, todayActivity, todayClosing, weekSales, activity, monthSales, dashSummary, potentialProfit] = await Promise.all([
    invoiceCounts(orgId),
    stockValueStats(orgId),
    expenseCounts(orgId),
    branchId ? getDayActivity(orgId, branchId, today) : Promise.resolve(null),
    branchId ? getClosing(orgId, branchId, today) : Promise.resolve(null),
    weeklySales(orgId, branchId),
    recentActivity(orgId),
    monthlySales(orgId, branchId),
    getDashboardSummary(orgId, branchId),
    getPotentialProfitInStock(orgId),
  ]);

  const { dict } = await getServerDict();
  const t = dict.dashboard as Record<string, string>;

  const todayNet = invoices.todaySalesTotal - expenses.todayTotal;
  const expectedCashToday = todayActivity?.expectedCash ?? 0;
  const closingDifference = todayClosing?.cash_difference ?? null;
  const isTodayClosed = Boolean(todayClosing?.finalized_by);
  const creditCollectedToday = (todayActivity?.creditCollectionCash ?? 0) + (todayActivity?.creditCollectionDigital ?? 0);

  const isPrivileged = profile?.role === "owner" || profile?.role === "admin" || profile?.role === "manager";

  const isProfitPositive = dashSummary.todayProfit >= 0;

  const statCards: DashboardStatCard[] = [
    {
      id: "today-profit",
      label: t.todayProfit,
      value: formatCurrency(dashSummary.todayProfit, currency),
      change: isProfitPositive ? `${t.fromSales} ${t.today}` : `${t.estimatedProfit}`,
      tone: isProfitPositive ? "success" : "danger",
      icon: "trendingUp",
    },
    {
      id: "gross-sales",
      label: t.grossSales,
      value: formatCurrency(dashSummary.grossSales, currency),
      change: dashSummary.grossSales > 0 ? `${formatNumber(dashSummary.returnsCount + 1)} ${t.invoices}` : t.noSalesYet,
      tone: "success",
      icon: "shoppingCart",
    },
    {
      id: "returns",
      label: t.returns,
      value: formatCurrency(dashSummary.returnsTotal, currency),
      change: dashSummary.returnsCount > 0 ? `${formatNumber(dashSummary.returnsCount)} return${dashSummary.returnsCount === 1 ? "" : "s"}` : "0 returns",
      tone: "danger",
      icon: "rotateCcw",
    },
    {
      id: "expenses",
      label: t.expenses,
      value: formatCurrency(dashSummary.expensesTotal, currency),
      change: dashSummary.expensesTotal > 0 ? `${t.today}` : "0 expenses",
      tone: "danger",
      icon: "wallet",
    },
    {
      id: "low-stock",
      label: t.lowStock,
      value: dashSummary.lowStockCount > 0 ? `${formatNumber(dashSummary.lowStockCount)} item${dashSummary.lowStockCount === 1 ? "" : "s"}` : "0 items",
      change: dashSummary.lowStockCount > 0 ? "Below minimum stock" : "All stocked",
      tone: "warning",
      icon: "packageSearch",
      href: "/purchases/replenishment",
    },
    {
      id: "pending-repairs",
      label: t.pendingRepairs,
      value: `${formatNumber(dashSummary.pendingRepairsCount)} job${dashSummary.pendingRepairsCount === 1 ? "" : "s"}`,
      change: dashSummary.pendingRepairsCount > 0 ? "In progress" : "No pending jobs",
      tone: "warning",
      icon: "wrench",
    },
    {
      id: "supplier-dues",
      label: t.supplierDues,
      value: formatCurrency(dashSummary.supplierDuesTotal, currency),
      change: dashSummary.supplierDuesTotal > 0 ? t.suppliersPayable : "All settled",
      tone: "warning",
      icon: "briefcase",
    },
    {
      id: "customer-dues",
      label: t.customerDues,
      value: formatCurrency(dashSummary.customerDuesTotal, currency),
      change: dashSummary.customerDuesTotal > 0 ? t.customersOwe : "All settled",
      tone: "warning",
      icon: "users",
    },
  ];

  const dashboardLayoutLabels: DashboardLayoutLabels = {
    editLayout: t.editLayout || "Edit layout",
    done: t.done || "Done",
    resetLayout: t.resetLayout || "Reset to default",
    dragToReorder: t.dragToReorder || "Drag to reorder",
    moveEarlier: t.moveEarlier || "Move earlier",
    moveLater: t.moveLater || "Move later",
    cardSize: t.cardSize || "Card size",
    setCardSize: t.setCardSize || "Set card size",
    small: t.small || "Small",
    medium: t.medium || "Medium",
    large: t.large || "Large",
  };

  const maxBar = Math.max(...weekSales.map((w) => w.total), 1);
  const maxMonthlyBar = Math.max(...monthSales.map((m) => m.total), 1);

  const ACTIVITY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
    sale: TrendingUp,
    stock: PackageSearch,
    repair: Wrench,
    payment: CreditCard,
    expense: Wallet,
    privacy: Bell,
  };

  const activityBg: Record<string, string> = {
    sale: "rgba(59,130,246,0.12)",
    stock: "rgba(245,158,11,0.12)",
    repair: "rgba(139,92,246,0.12)",
    payment: "rgba(16,185,129,0.12)",
    expense: "rgba(239,68,68,0.12)",
    privacy: "rgba(99,102,241,0.12)",
  };

  return (
    <AppShell pageTitle="Dashboard">
      {/* Main dashboard card */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/[0.07] dark:bg-[#060f20]">
        {/* Browser-style chrome bar */}
        <div className="flex items-center gap-1.5 border-b border-slate-100 bg-slate-50/80 px-4 py-2.5 dark:border-white/[0.06] dark:bg-white/[0.03]">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
          <span className="ml-2 truncate rounded-md border border-slate-200 bg-white px-2.5 py-0.5 text-[11px] font-medium text-slate-500 dark:border-white/[0.08] dark:bg-white/[0.05] dark:text-slate-400">
            {organization?.name ?? "SaleDock"} / dashboard
          </span>
        </div>

          {/* Main content area */}
          <div className="p-3.5 sm:p-5">
            <DashboardStatLayout
              cards={statCards}
              firstName={profile.full_name?.split(" ")[0] ?? "User"}
              role={profile.role}
              organizationName={organization?.name ?? "No shop"}
              labels={dashboardLayoutLabels}
            />

            {/* Top-selling products */}
            {dashSummary.topSellingProducts.length > 0 && (
              <div className="mt-3 sm:mt-4">
                <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3 dark:border-white/[0.06] dark:bg-white/[0.03]">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      {t.topSelling}
                    </p>
                    <Link href="/products" className="text-[10px] font-semibold text-blue-700 hover:underline dark:text-blue-400">
                      {t.viewReport}
                    </Link>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-[11px]">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-white/[0.06]">
                          <th className="pb-1.5 font-semibold text-slate-500 dark:text-slate-400">#</th>
                          <th className="pb-1.5 font-semibold text-slate-500 dark:text-slate-400">Product</th>
                          <th className="pb-1.5 text-right font-semibold text-slate-500 dark:text-slate-400">{t.itemsSold}</th>
                          <th className="pb-1.5 text-right font-semibold text-slate-500 dark:text-slate-400">Revenue</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dashSummary.topSellingProducts.map((p, i) => (
                          <tr key={p.productName} className="border-b border-slate-100 last:border-0 dark:border-white/[0.04]">
                            <td className="py-1.5 text-slate-400">{i + 1}</td>
                            <td className="py-1.5 font-medium text-slate-950 dark:text-white">{p.productName}</td>
                            <td className="py-1.5 text-right text-slate-700 dark:text-slate-300">{formatNumber(p.quantity)}</td>
                            <td className="py-1.5 text-right font-semibold text-slate-950 dark:text-white">{formatCurrency(p.revenue, currency)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Activity + weekly chart */}
            <div className="mt-3 grid grid-cols-1 gap-3 sm:mt-4 lg:grid-cols-[1fr_180px]">
              {/* Activity feed */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Recent activity
                  </h2>
                  <Link href="/audit-log" className="text-[10px] font-semibold text-blue-700 hover:underline dark:text-blue-400">
                    View all
                  </Link>
                </div>

                {activity.length === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/50 px-4 py-6 text-center dark:border-white/[0.06] dark:bg-white/[0.02]">
                    <Clock className="mb-1 size-5 text-slate-300 dark:text-slate-600" />
                    <p className="text-xs font-semibold text-slate-400 dark:text-slate-500">No activity yet</p>
                    <p className="mt-0.5 text-[10px] text-slate-400 dark:text-slate-500">
                      Start ringing up sales — activity will appear here.
                    </p>
                  </div>
                ) : (
                  activity.map((row) => {
                    const ActIcon = ACTIVITY_ICONS[row.icon] ?? Bell;
                    const bgColor = activityBg[row.icon] ?? "rgba(100,116,139,0.12)";
                    return (
                      <div
                        key={row.id}
                        className="flex items-center gap-2.5 rounded-lg border border-slate-100 bg-slate-50/30 p-2.5 transition hover:bg-slate-100/50 dark:border-white/[0.05] dark:bg-white/[0.02] dark:hover:bg-white/[0.05]"
                      >
                        <span
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
                          style={{ background: bgColor, color: row.color }}
                        >
                          <ActIcon className="h-3 w-3" />
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-slate-700 dark:text-slate-300">
                          {row.left}
                        </span>
                        {row.right && (
                          <span className="shrink-0 text-[11px] font-bold" style={{ color: row.color }}>
                            {row.right}
                          </span>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Weekly sales bar chart */}
              <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3 dark:border-white/[0.06] dark:bg-white/[0.03]">
                <p className="mb-2 text-[9px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Weekly sales
                </p>
                {weekSales.length === 0 ? (
                  <div className="flex h-[52px] items-center justify-center">
                    <p className="text-[10px] text-slate-400 dark:text-slate-500">No data</p>
                  </div>
                ) : (
                  <div className="flex items-end gap-0.5" style={{ height: "52px" }}>
                    {weekSales.map((bar) => {
                      const pct = (bar.total / maxBar) * 100;
                      const isPeak = bar.total === maxBar;
                      return (
                        <div key={bar.date} className="flex flex-1 flex-col items-center gap-1">
                          <div className="flex h-[44px] w-full items-end">
                            <div
                              className="w-full rounded-t-sm"
                              style={{
                                height: `${Math.max(pct, 3)}%`,
                                background: isPeak
                                  ? "linear-gradient(to top,#0b2f6f,#00b8b0)"
                                  : "rgba(11,47,111,0.2)",
                                transition: "height 0.3s ease",
                              }}
                            />
                          </div>
                          <span className="text-[7px] font-medium text-slate-400 dark:text-slate-500">{bar.label}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Monthly sales histogram */}
            <div className="mt-3 sm:mt-4">
              <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3 dark:border-white/[0.06] dark:bg-white/[0.03]">
                <p className="mb-2 text-[9px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Monthly sales
                </p>
                {monthSales.length === 0 ? (
                  <div className="flex h-[52px] items-center justify-center">
                    <p className="text-[10px] text-slate-400 dark:text-slate-500">No monthly sales yet</p>
                  </div>
                ) : (
                  <div className="flex items-end gap-px" style={{ height: "52px" }}>
                    {monthSales.map((bar) => {
                      const pct = (bar.total / maxMonthlyBar) * 100;
                      const isPeak = bar.total === maxMonthlyBar;
                      return (
                        <div key={bar.day} className="flex flex-1 flex-col items-center gap-1">
                          <div className="flex h-[44px] w-full items-end">
                            <div
                              className="w-full rounded-t-sm"
                              style={{
                                height: `${Math.max(pct, 3)}%`,
                                background: isPeak
                                  ? "linear-gradient(to top,#0b2f6f,#00b8b0)"
                                  : "rgba(11,47,111,0.2)",
                                transition: "height 0.3s ease",
                              }}
                            />
                          </div>
                          <span className="text-[6px] font-medium text-slate-400 dark:text-slate-500">{bar.day}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Sales summary + quick links for mobile */}
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3 dark:border-white/[0.06] dark:bg-white/[0.03]">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Credit collected today
                </p>
                <p className="mt-1 text-base font-bold text-emerald-700 dark:text-emerald-400">
                  {formatCurrency(creditCollectedToday, currency)}
                </p>
                <p className="mt-0.5 text-[10px] text-slate-400 dark:text-slate-500">
                  Cash + digital settlements
                </p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3 dark:border-white/[0.06] dark:bg-white/[0.03]">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Today net
                </p>
                <p className={`mt-1 text-base font-bold ${todayNet >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}`}>
                  {formatCurrency(todayNet, currency)}
                </p>
                <p className="mt-0.5 text-[10px] text-slate-400 dark:text-slate-500">
                  Sales minus expenses
                </p>
              </div>

              <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3 dark:border-white/[0.06] dark:bg-white/[0.03]">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {isTodayClosed ? "Today closed" : "Today closing"}
                </p>
                <p className="mt-1 text-base font-bold text-slate-950 dark:text-white">
                  {isTodayClosed ? "Closed" : "Open"}
                </p>
                <p className="mt-0.5 text-[10px] text-slate-400 dark:text-slate-500">
                  {isTodayClosed && closingDifference !== null
                    ? `Cash diff: ${formatCurrency(closingDifference, currency)}`
                    : branchId
                      ? `Expected cash: ${formatCurrency(expectedCashToday, currency)}`
                      : "No branch assigned"}
                </p>
              </div>

              <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3 dark:border-white/[0.06] dark:bg-white/[0.03]">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Today expenses
                </p>
                <p className="mt-1 text-base font-bold text-rose-700 dark:text-rose-400">
                  {formatCurrency(expenses.todayTotal, currency)}
                </p>
                <p className="mt-0.5 text-[10px] text-slate-400 dark:text-slate-500">
                  {expenses.todayCount === 0 ? "No expenses" : `${formatNumber(expenses.todayCount)} entr${expenses.todayCount === 1 ? "y" : "ies"}`}
                </p>
              </div>

              <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3 dark:border-white/[0.06] dark:bg-white/[0.03]">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Stock valuation
                </p>
                <p className="mt-1 text-base font-bold text-slate-950 dark:text-white">
                  {formatCurrency(stockValue, currency)}
                </p>
                <p className="mt-0.5 text-[10px] text-slate-400 dark:text-slate-500">
                  At purchase cost
                </p>
              </div>

              <div className="rounded-xl border border-amber-100 bg-amber-50/40 p-3 dark:border-amber-800/30 dark:bg-amber-900/10">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Potential profit in stock
                </p>
                <p className="mt-1 text-base font-bold text-amber-800 dark:text-amber-300">
                  {formatCurrency(potentialProfit.potentialProfitInStock, currency)}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                  <span>Sale value: {formatCurrency(potentialProfit.totalInventorySaleValue, currency)}</span>
                  <span>Cost: {formatCurrency(potentialProfit.totalInventoryCostValue, currency)}</span>
                  {potentialProfit.marginPercent !== null && (
                    <span>Margin: {potentialProfit.marginPercent}%</span>
                  )}
                </div>
                <p className="mt-0.5 text-[10px] italic text-amber-600 dark:text-amber-400">
                  If all current stock sold at current prices (not yet earned).
                </p>
              </div>
            </div>

            {/* Bottom links row */}
            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3 dark:border-white/[0.06]">
              <Link
                href="/reports"
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-white/[0.08] dark:text-slate-400 dark:hover:bg-white/[0.05]"
              >
                <BarChart3 className="size-3" />
                Reports
              </Link>
              {branchId && (
                <Link
                  href="/daily-closing"
                  className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-white/[0.08] dark:text-slate-400 dark:hover:bg-white/[0.05]"
                >
                  <CalendarCheck className="size-3" />
                  {isTodayClosed ? "Review closing" : "Open closing"}
                </Link>
              )}
              <Link
                href="/products"
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-white/[0.08] dark:text-slate-400 dark:hover:bg-white/[0.05]"
              >
                <Boxes className="size-3" />
                Inventory
              </Link>
              {isPrivileged && (
                <Link
                  href="/audit-log"
                  className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-white/[0.08] dark:text-slate-400 dark:hover:bg-white/[0.05]"
                >
                  <Clock className="size-3" />
                  Audit log
                </Link>
              )}
              <Link
                href="/customers"
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-white/[0.08] dark:text-slate-400 dark:hover:bg-white/[0.05]"
              >
                <Users className="size-3" />
                Customers
              </Link>
            </div>
          </div>
      </div>
    </AppShell>
  );
}
