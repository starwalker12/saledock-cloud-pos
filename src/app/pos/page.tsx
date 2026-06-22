import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { env } from "@/lib/env";
import { getCurrentContext } from "@/lib/auth/session";
import { listCategories } from "@/lib/data/catalog";
import { listPosCustomers, listPosProducts } from "@/lib/data/pos";
import { canUsePos, canWriteCatalog } from "@/lib/permissions";
import { PosClient } from "./pos-client";

export default async function PosPage() {
  if (!env.isSupabaseConfigured) redirect("/login");
  const { user, profile, organization } = await getCurrentContext();
  if (!user) redirect("/login");
  if (!profile?.organization_id) redirect("/setup");
  if (!canUsePos(profile.role)) redirect("/dashboard");

  const orgId = profile.organization_id;
  const [products, customers, categories] = await Promise.all([
    listPosProducts(orgId),
    listPosCustomers(orgId),
    listCategories(orgId),
  ]);

  return (
    <AppShell pageTitle="New sale">
      <PosClient
        products={products}
        customers={customers}
        categories={categories.filter((c) => c.is_active).map((c) => ({ id: c.id, name: c.name }))}
        currency={organization?.currency_code ?? "PKR"}
        canCheckout={canUsePos(profile.role)}
        canWriteCatalog={canWriteCatalog(profile.role)}
        orgId={profile.organization_id}
        userId={user.id}
      />
    </AppShell>
  );
}
