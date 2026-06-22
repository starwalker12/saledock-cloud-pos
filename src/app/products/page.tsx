import { redirect } from "next/navigation";
import { AlertTriangle, Boxes, Tag, Truck } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { StatCard } from "@/components/ui/stat-card";
import { getCurrentContext } from "@/lib/auth/session";
import {
  catalogCounts,
  listCategoriesWithCounts,
  listProducts,
  listSuppliers,
} from "@/lib/data/catalog";
import { env } from "@/lib/env";
import { formatNumber } from "@/lib/formatters";
import { canManageLossOverride, canWriteCatalog } from "@/lib/permissions";
import { CatalogTabs, type CatalogTab, type CatalogSearchParams } from "./catalog-tabs";

const CATALOG_TABS: CatalogTab[] = ["products", "categories", "suppliers"];

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<CatalogSearchParams>;
}) {
  if (!env.isSupabaseConfigured) redirect("/login");

  const { user, profile, organization } = await getCurrentContext();
  if (!user) redirect("/login");
  if (!profile?.organization_id) redirect("/setup");

  const params = await searchParams;
  const initialTab = CATALOG_TABS.includes(params.tab as CatalogTab)
    ? (params.tab as CatalogTab)
    : "products";
  const orgId = profile.organization_id;
  const canWrite = canWriteCatalog(profile.role);
  const canManageOverride = canManageLossOverride(profile.role);
  const currency = organization?.currency_code ?? "PKR";

  const [counts, categories, suppliers, products] = await Promise.all([
    catalogCounts(orgId),
    listCategoriesWithCounts(orgId),
    listSuppliers(orgId),
    listProducts(orgId, { includeInactive: true }),
  ]);

  return (
    <AppShell pageTitle="Products">
      <div className="grid grid-cols-2 gap-2 md:gap-4 lg:grid-cols-4">
        <StatCard
          label="Active products"
          value={formatNumber(counts.productsActive)}
          detail={`${formatNumber(counts.productsTotal)} total including archived.`}
          icon={<Boxes className="size-5" />}
        />
        <StatCard
          label="Low stock"
          value={formatNumber(counts.lowStock)}
          detail="At or below reorder level."
          icon={<AlertTriangle className="size-5" />}
        />
        <StatCard
          label="Active categories"
          value={formatNumber(counts.categories)}
          detail="Used to organize the catalog."
          icon={<Tag className="size-5" />}
        />
        <StatCard
          label="Active suppliers"
          value={formatNumber(counts.suppliers)}
          detail="Vendor contacts for restocking."
          icon={<Truck className="size-5" />}
        />
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-[#fff] shadow-sm md:mt-6 md:rounded-2xl dark:border-slate-800 dark:bg-slate-950">
        <CatalogTabs
          key={initialTab}
          initialTab={initialTab}
          params={params}
          currency={currency}
          products={products}
          categories={categories}
          suppliers={suppliers}
          canWrite={canWrite}
          canManageOverride={canManageOverride}
          role={profile.role}
        />
      </div>
    </AppShell>
  );
}
