import { redirect } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { getCurrentContext } from "@/lib/auth/session";
import { canManageSupplierPurchases } from "@/lib/permissions";
import { listPosProducts } from "@/lib/data/pos";
import { listSuppliersWithBalances } from "@/lib/data/supplier-purchases";
import { env } from "@/lib/env";
import { NewPurchaseForm } from "./new-purchase-form";

export default async function NewSupplierPurchasePage() {
  if (!env.isSupabaseConfigured) redirect("/login");
  const { user, profile, organization } = await getCurrentContext();
  if (!user) redirect("/login");
  if (!profile?.organization_id) redirect("/setup");
  if (!canManageSupplierPurchases(profile.role)) redirect("/suppliers/purchases");

  const orgId = profile.organization_id;
  const [allProducts, suppliers] = await Promise.all([
    listPosProducts(orgId),
    listSuppliersWithBalances(orgId),
  ]);
  // Only physical products can be purchased into stock.
  const products = allProducts
    .filter((p) => p.type === "product")
    .map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      purchase_price: p.purchase_price,
      stock_quantity: p.stock_quantity,
    }));

  return (
    <AppShell pageTitle="Record purchase">
      <div className="mb-3 flex items-center justify-between">
        <Link
          href="/suppliers/purchases"
          className="text-xs font-semibold text-slate-600 underline"
        >
          ← Back to purchases
        </Link>
      </div>
      <NewPurchaseForm
        suppliers={suppliers
          .filter((s) => s.is_active)
          .map((s) => ({ id: s.id, name: s.name, company: s.company }))}
        products={products}
        currency={organization?.currency_code ?? "PKR"}
      />
    </AppShell>
  );
}
