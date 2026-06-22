import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getProductImagePublicUrl } from "@/lib/storage/product-images.server";

export type PosProduct = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  category_id: string | null;
  category_name: string | null;
  image_path: string | null;
  image_url: string | null;
  type: "product" | "service";
  purchase_price: number;
  sale_price: number;
  stock_quantity: number;
  minimum_stock: number;
  allow_sell_at_loss: boolean;
  sell_at_loss_reason: string;
  service_type: string | null;
  default_commission_amount: number;
  requires_account_number: boolean;
  requires_provider: boolean;
  requires_reference: boolean;
};

export type PosCustomer = {
  id: string;
  name: string;
  phone: string | null;
};

export async function listPosProducts(organizationId: string): Promise<PosProduct[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select(
      `id, name, sku, barcode, category_id, image_path, type, purchase_price, sale_price,
       stock_quantity, minimum_stock, allow_sell_at_loss, sell_at_loss_reason,
       service_type, default_commission_amount, requires_account_number, requires_provider, requires_reference,
       product_categories(name)`,
    )
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);

  return (data ?? []).map((r) => {
    const cats = r.product_categories as { name?: string } | { name?: string }[] | null;
    const categoryName = Array.isArray(cats) ? cats[0]?.name ?? null : cats?.name ?? null;
    return {
      id: r.id,
      name: r.name,
      sku: r.sku,
      barcode: r.barcode,
      category_id: r.category_id,
      category_name: categoryName,
      image_path: r.image_path,
      image_url: getProductImagePublicUrl(supabase, r.image_path),
      type: r.type,
      purchase_price: Number(r.purchase_price ?? 0),
      sale_price: Number(r.sale_price ?? 0),
      stock_quantity: Number(r.stock_quantity ?? 0),
      minimum_stock: Number(r.minimum_stock ?? 0),
      allow_sell_at_loss: Boolean(r.allow_sell_at_loss),
      sell_at_loss_reason: r.sell_at_loss_reason ?? "",
      service_type: r.service_type ?? null,
      default_commission_amount: Number(r.default_commission_amount ?? 0),
      requires_account_number: Boolean(r.requires_account_number),
      requires_provider: Boolean(r.requires_provider),
      requires_reference: Boolean(r.requires_reference),
    } satisfies PosProduct;
  });
}

export async function listPosCustomers(organizationId: string): Promise<PosCustomer[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .select("id, name, phone")
    .eq("organization_id", organizationId)
    .eq("is_archived", false)
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as PosCustomer[];
}
