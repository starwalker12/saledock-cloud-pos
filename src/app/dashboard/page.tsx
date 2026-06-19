import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { getCurrentContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { invoiceCounts } from "@/lib/data/invoices";
import { expenseCounts } from "@/lib/data/expenses";
import { getClosing, getDayActivity, todayLocalDate } from "@/lib/data/daily-closing";
import { getDashboardSummary, getDashboardAnalytics } from "@/lib/data/dashboard";
import { getPotentialProfitInStock } from "@/lib/data/reports";
import { formatNumber } from "@/lib/formatters";
import { getServerDict } from "@/lib/i18n/server";
import { DashboardStatLayout, type DashboardLayoutLabels } from "./dashboard-stat-layout";

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
    .limit(10);

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
          <div className="rounded-2xl border border-slate-200 bg-[#fff] p-8 text-center shadow-sm">
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

  const [invoices, stockValue, expenses, todayActivity, todayClosing, weekSales, activity, monthSales, dashSummary, potentialProfit, analytics] = await Promise.all([
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
    getDashboardAnalytics(orgId, branchId),
  ]);

  const { dict } = await getServerDict();
  const t = dict.dashboard as Record<string, string>;

  const isPrivileged = profile?.role === "owner" || profile?.role === "admin" || profile?.role === "manager";

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
    fillStyle: t.fillStyle || "Fill",
    solid: t.solid || "Solid",
    gradient: t.gradient || "Gradient",
    auto: t.auto || "Auto",
    textColor: t.textColor || "Text",
    white: t.white || "White",
    black: t.black || "Black",
  };

  return (
    <AppShell pageTitle="Dashboard" contentClassName="max-w-[3600px]">
      {/* Main dashboard card */}
      <div className="overflow-visible md:rounded-2xl md:border md:border-slate-200 md:bg-[#fff] md:shadow-sm md:dark:border-white/[0.07] md:dark:bg-[#060f20]">
        {/* Browser-style chrome bar */}
        <div className="hidden items-center gap-1.5 rounded-t-2xl border-b border-slate-100 bg-slate-50/80 px-4 py-2.5 dark:border-white/[0.06] dark:bg-white/[0.03] md:flex">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
          <span className="ml-2 truncate rounded-md border border-slate-200 bg-[#fff] px-2.5 py-0.5 text-[11px] font-medium text-slate-500 dark:border-white/[0.08] dark:bg-white/[0.05] dark:text-slate-400">
            {organization?.name ?? "SaleDock"} / dashboard
          </span>
        </div>

        {/* Main content area */}
        <div className="p-0 md:p-5">
          <DashboardStatLayout
            firstName={profile.full_name?.split(" ")[0] ?? "User"}
            role={profile.role}
            organizationName={organization?.name ?? "No shop"}
            labels={dashboardLayoutLabels}
            widgetData={{
              invoices,
              stockValue,
              expenses,
              todayActivity,
              todayClosing,
              weekSales,
              activity,
              monthSales,
              dashSummary,
              potentialProfit,
              analytics,
              currency,
              isPrivileged,
            }}
          />
        </div>
      </div>
    </AppShell>
  );
}
