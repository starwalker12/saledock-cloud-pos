"use server";

import { revalidatePath } from "next/cache";
import { getCurrentContext } from "@/lib/auth/session";
import { canViewReplenishment, canWriteCatalog } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { getActiveSuppliers, type ActiveSupplier } from "@/lib/data/replenishment";

export type AssignSupplierResult = { ok: true } | { ok: false; error: string };

/**
 * Assign / change / clear the supplier of a saved product. This is the ONLY
 * product-data write in this feature. It updates ONLY `supplier_id` — never
 * name, price, purchase_price, stock, or any other field. Organization-scoped
 * (both product and supplier validated against the caller's org), permission-
 * gated to catalog writers, no service-role use.
 */
export async function assignProductSupplierAction(
  productId: string,
  supplierId: string | null,
): Promise<AssignSupplierResult> {
  const { user, profile } = await getCurrentContext();
  if (!user || !profile?.organization_id) {
    return { ok: false, error: "Please sign in again to change the supplier." };
  }
  if (!canWriteCatalog(profile.role)) {
    return { ok: false, error: "Only owners, admins, and managers can change a product's supplier." };
  }
  if (!productId || typeof productId !== "string") {
    return { ok: false, error: "We could not identify this product. Please reopen and try again." };
  }
  const orgId = profile.organization_id;
  const supabase = await createClient();

  const { data: product, error: productError } = await supabase
    .from("products")
    .select("id, name")
    .eq("id", productId)
    .eq("organization_id", orgId)
    .maybeSingle<{ id: string; name: string }>();
  if (productError) {
    console.error("[replenishment] assign supplier product lookup failed:", productError.message);
    return { ok: false, error: "We could not update the supplier right now. Please try again." };
  }
  if (!product) {
    return { ok: false, error: "This product was not found for your shop." };
  }

  if (supplierId) {
    const { data: supplier, error: supplierError } = await supabase
      .from("suppliers")
      .select("id, is_active")
      .eq("id", supplierId)
      .eq("organization_id", orgId)
      .maybeSingle<{ id: string; is_active: boolean }>();
    if (supplierError) {
      console.error("[replenishment] assign supplier lookup failed:", supplierError.message);
      return { ok: false, error: "We could not update the supplier right now. Please try again." };
    }
    if (!supplier) {
      return { ok: false, error: "That supplier was not found for your shop." };
    }
    if (!supplier.is_active) {
      return { ok: false, error: "That supplier is inactive. Please pick an active supplier." };
    }
  }

  const { error: updateError } = await supabase
    .from("products")
    .update({ supplier_id: supplierId })
    .eq("id", productId)
    .eq("organization_id", orgId);
  if (updateError) {
    console.error("[replenishment] assign supplier update failed:", updateError.message);
    return { ok: false, error: "We could not update the supplier right now. Please try again." };
  }

  logAudit({
    module: "products",
    action: "product.supplier_assigned",
    details: `Supplier ${supplierId ? "assigned" : "cleared"} for product ${product.name}`,
    metadata: { product_id: productId, supplier_id: supplierId },
  });

  revalidatePath("/purchases/replenishment");
  revalidatePath("/products");
  return { ok: true };
}

/**
 * Read-only refresh of the organization's active suppliers, used by the PO
 * planner after a "Quick add supplier" so the new supplier can be shown and
 * selected. Organization-scoped and permission-gated; no writes, no service role.
 */
export async function listActiveSuppliersAction(): Promise<ActiveSupplier[]> {
  const { user, profile } = await getCurrentContext();
  if (!user || !profile?.organization_id) return [];
  if (!canViewReplenishment(profile.role)) return [];
  return getActiveSuppliers(profile.organization_id);
}
