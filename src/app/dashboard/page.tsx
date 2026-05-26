import { redirect } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, Boxes, CalendarCheck, Coins, ReceiptText, Tag, TrendingUp, Truck, Users, Wallet, Wrench } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageCard } from "@/components/ui/page-card";
import { StatCard } from "@/components/ui/stat-card";
import { getCurrentContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { catalogCounts } from "@/lib/data/catalog";
import { invoiceCounts } from "@/lib/data/invoices";
import { expenseCounts } from "@/lib/data/expenses";
import { getClosing, getDayActivity, todayLocalDate } from "@/lib/data/daily-closing";
import { formatCurrency, formatNumber } from "@/lib/formatters";
import { getRepairsStats } from "@/lib/data/repairs";

async function countRows(table: string, organizationId: string) {
  const supabase = await createClient();
  const { count } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId);
  return count ?? 0;
}

async function debtorStats(organizationId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .select("outstanding_balance")
    .eq("organization_id", organizationId)
    .gt("outstanding_balance", 0);
  if (error) return { totalDebt: 0, debtorCount: 0 };
  const debtorCount = data?.length ?? 0;
  const totalDebt = data?.reduce((acc, c) => acc + Number(c.outstanding_balance ?? 0), 0) ?? 0;
  return { totalDebt, debtorCount };
}

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

export default async function DashboardPage() {
  if (!env.isSupabaseConfigured) {
    return (
      <AppShell pageTitle="Dashboard">
        <PageCard
          title="Supabase not configured"
          description="Add NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY to .env.local, then restart the dev server."
        />
      </AppShell>
    );
  }

  const { user, profile, organization } = await getCurrentContext();
  if (!user) redirect("/login");
  if (!profile?.organization_id) redirect("/setup");

  const orgId = profile.organization_id;
  const today = todayLocalDate();
  const branchId = profile.branch_id ?? null;
  const [catalog, invoices, customersCount, repairsStats, debt, stockValue, expenses, todayActivity, todayClosing] = await Promise.all([
    catalogCounts(orgId),
    invoiceCounts(orgId),
    countRows("customers", orgId),
    getRepairsStats(orgId),
    debtorStats(orgId),
    stockValueStats(orgId),
    expenseCounts(orgId),
    branchId ? getDayActivity(orgId, branchId, today) : Promise.resolve(null),
    branchId ? getClosing(orgId, branchId, today) : Promise.resolve(null),
  ]);
  const todayNet = invoices.todaySalesTotal - expenses.todayTotal;
  const expectedCashToday = todayActivity?.expectedCash ?? 0;
  const closingDifference = todayClosing?.cash_difference ?? null;
  const isTodayClosed = Boolean(todayClosing?.finalized_by);
  const currency = organization?.currency_code ?? "PKR";

  const isPrivileged =
    profile?.role === "owner" ||
    profile?.role === "admin" ||
    profile?.role === "manager";

  return (
    <AppShell pageTitle="Dashboard">
      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-xl font-black text-slate-950">
          Welcome, {profile.full_name}
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Role: <strong>{profile.role}</strong>
        </p>
      </div>

      <div className={`grid gap-4 sm:grid-cols-2 ${isPrivileged ? "xl:grid-cols-5" : "xl:grid-cols-4"}`}>
        <StatCard
          label="Active products"
          value={formatNumber(catalog.productsActive)}
          detail={catalog.productsActive === 0 ? "No active products yet." : `${formatNumber(catalog.productsTotal)} total including archived.`}
          icon={<Boxes className="size-5" />}
        />
        <StatCard
          label="Low stock"
          value={formatNumber(catalog.lowStock)}
          detail={catalog.lowStock === 0 ? "All stock above reorder level." : "At or below reorder level."}
          icon={<AlertTriangle className="size-5" />}
        />
        {isPrivileged && (
          <StatCard
            label="Stock valuation"
            value={formatCurrency(stockValue, currency)}
            detail="Asset value at purchase cost."
            icon={<Coins className="size-5" />}
          />
        )}
        <StatCard
          label="Categories"
          value={formatNumber(catalog.categories)}
          detail={catalog.categories === 0 ? "Add your first category." : "Active categories."}
          icon={<Tag className="size-5" />}
        />
        <StatCard
          label="Suppliers"
          value={formatNumber(catalog.suppliers)}
          detail={catalog.suppliers === 0 ? "Add suppliers for restocking." : "Active suppliers."}
          icon={<Truck className="size-5" />}
        />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Invoices"
          value={formatNumber(invoices.invoicesTotal)}
          detail={invoices.invoicesTotal === 0 ? "No invoices yet." : "Total invoices to date."}
          icon={<ReceiptText className="size-5" />}
        />
        <StatCard
          label="Open balances"
          value={formatCurrency(debt.totalDebt, currency)}
          detail={invoices.openInvoices === 0 ? "All invoices fully paid." : `${formatNumber(invoices.openInvoices)} unpaid invoice(s).`}
          icon={<TrendingUp className="size-5" />}
        />
        <StatCard
          label="Customers"
          value={formatNumber(customersCount)}
          detail={debt.debtorCount === 0 ? "All accounts fully settled." : `${formatNumber(debt.debtorCount)} debtor profile(s).`}
          icon={<Users className="size-5" />}
        />
        <StatCard
          label="Open repairs"
          value={formatNumber(repairsStats.openCount)}
          detail={repairsStats.readyCount > 0 ? `${formatNumber(repairsStats.readyCount)} job(s) ready for delivery.` : "No ready jobs."}
          icon={<Wrench className="size-5" />}
        />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Today expenses"
          value={formatCurrency(expenses.todayTotal, currency)}
          detail={expenses.todayCount === 0 ? "No expenses today." : `${formatNumber(expenses.todayCount)} entr${expenses.todayCount === 1 ? "y" : "ies"} today.`}
          icon={<Wallet className="size-5" />}
        />
        <StatCard
          label="Net today"
          value={formatCurrency(todayNet, currency)}
          detail="Sales − expenses for today."
          icon={<TrendingUp className="size-5" />}
        />
        <StatCard
          label={isTodayClosed ? "Today closed" : "Today closing"}
          value={isTodayClosed ? "Closed" : "Open"}
          detail={
            isTodayClosed && closingDifference !== null
              ? `Cash diff: ${formatCurrency(closingDifference, currency)}`
              : branchId
                ? `Expected cash: ${formatCurrency(expectedCashToday, currency)}`
                : "No branch assigned."
          }
          icon={<CalendarCheck className="size-5" />}
        />
        <StatCard
          label="Month expenses"
          value={formatCurrency(expenses.monthTotal, currency)}
          detail={expenses.monthCount === 0 ? "Nothing this month." : `${formatNumber(expenses.monthCount)} entr${expenses.monthCount === 1 ? "y" : "ies"} this month.`}
          icon={<Wallet className="size-5" />}
        />
      </div>
      <div className="mt-2 flex justify-end gap-4 text-xs">
        <Link href="/repairs" className="font-semibold text-blue-700 underline">
          View repairs →
        </Link>
        {isPrivileged && (
          <Link href="/reports" className="font-semibold text-blue-700 underline">
            View reports →
          </Link>
        )}
        {branchId && (
          <Link href="/daily-closing" className="font-semibold text-blue-700 underline">
            {isTodayClosed ? "Review today's closing →" : "Open daily closing →"}
          </Link>
        )}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <PageCard
          title="Today sales"
          description={
            invoices.todayCount === 0
              ? "No sales recorded today yet. Start a new sale in the POS."
              : `${formatNumber(invoices.todayCount)} invoice${invoices.todayCount === 1 ? "" : "s"} recorded today.`
          }
        >
          <p className="text-3xl font-black text-slate-950">
            {formatCurrency(invoices.todaySalesTotal, currency)}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            <TrendingUp className="mr-1 inline size-4 text-emerald-600" />
            Sum of grand totals from invoices dated today.
          </p>
        </PageCard>
        <PageCard
          title="What's next"
          description="POS checkout is live. Reports, Repairs workflow, and printable receipts are active."
        >
          <div className="grid gap-3 sm:grid-cols-3">
            {["Catalog ready", "POS live", "Repairs ready"].map((item) => (
              <div key={item} className="rounded-xl bg-blue-50 p-4 text-sm font-bold text-blue-800">
                {item}
              </div>
            ))}
          </div>
        </PageCard>
      </div>
    </AppShell>
  );
}
