import { redirect } from "next/navigation";
import { AlertTriangle, Boxes, Coins, ReceiptText, Tag, TrendingUp, Truck, Users, Wrench } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageCard } from "@/components/ui/page-card";
import { StatCard } from "@/components/ui/stat-card";
import { getCurrentContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { catalogCounts } from "@/lib/data/catalog";
import { invoiceCounts } from "@/lib/data/invoices";
import { formatCurrency, formatNumber } from "@/lib/formatters";

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
      <AppShell>
        <PageCard
          title="Supabase not configured"
          description="Add NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY to .env.local, then restart the dev server."
        />
      </AppShell>
    );
  }

  const { user, profile, organization, branch } = await getCurrentContext();
  if (!user) redirect("/login");
  if (!profile?.organization_id) redirect("/setup");

  const orgId = profile.organization_id;
  const [catalog, invoices, customersCount, repairsCount, debt, stockValue] = await Promise.all([
    catalogCounts(orgId),
    invoiceCounts(orgId),
    countRows("customers", orgId),
    countRows("repairs", orgId),
    debtorStats(orgId),
    stockValueStats(orgId),
  ]);
  const currency = organization?.currency_code ?? "PKR";

  const isPrivileged =
    profile?.role === "owner" ||
    profile?.role === "admin" ||
    profile?.role === "manager";

  return (
    <AppShell>
      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5">
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-blue-700">
          {organization?.name ?? "Organization"}
        </p>
        <h2 className="mt-1 text-xl font-black text-slate-950">
          Welcome, {profile.full_name}
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Branch: <strong>{branch?.name ?? "—"}</strong> · Role: <strong>{profile.role}</strong>
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
          label="Repairs"
          value={formatNumber(repairsCount)}
          detail={repairsCount === 0 ? "No repair jobs yet." : "Repair jobs on record."}
          icon={<Wrench className="size-5" />}
        />
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
          description="POS checkout is live. Repairs, reports, and printable receipts can come next."
        >
          <div className="grid gap-3 sm:grid-cols-3">
            {["Catalog ready", "POS live", "RLS enforced"].map((item) => (
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
