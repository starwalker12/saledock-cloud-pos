import "server-only";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { escapeLike } from "@/lib/security/sanitize";

export type CategoryRow = {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  product_count?: number;
};

export type SupplierRow = {
  id: string;
  name: string;
  company: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  is_active: boolean;
};

export type ProductRow = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  category_id: string | null;
  supplier_id: string | null;
  category_name: string | null;
  supplier_name: string | null;
  type: "product" | "service";
  purchase_price: number;
  sale_price: number;
  stock_quantity: number;
  minimum_stock: number;
  allow_sell_at_loss: boolean;
  sell_at_loss_reason: string;
  notes: string | null;
  is_active: boolean;
};

export async function listCategories(organizationId: string): Promise<CategoryRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("product_categories")
    .select("id, name, description, is_active")
    .eq("organization_id", organizationId)
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as CategoryRow[];
}

export async function listCategoriesWithCounts(organizationId: string): Promise<CategoryRow[]> {
  const supabase = await createClient();
  const [cats, prods] = await Promise.all([
    supabase
      .from("product_categories")
      .select("id, name, description, is_active")
      .eq("organization_id", organizationId)
      .order("name", { ascending: true }),
    supabase
      .from("products")
      .select("category_id")
      .eq("organization_id", organizationId)
      .eq("is_active", true),
  ]);
  if (cats.error) throw new Error(cats.error.message);
  if (prods.error) throw new Error(prods.error.message);

  const counts = new Map<string, number>();
  for (const p of prods.data ?? []) {
    if (p.category_id) counts.set(p.category_id, (counts.get(p.category_id) ?? 0) + 1);
  }
  return (cats.data ?? []).map((c) => ({
    ...(c as CategoryRow),
    product_count: counts.get(c.id) ?? 0,
  }));
}

export async function listSuppliers(organizationId: string): Promise<SupplierRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("suppliers")
    .select("id, name, company, phone, email, address, notes, is_active")
    .eq("organization_id", organizationId)
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as SupplierRow[];
}

export type ProductFilters = {
  search?: string;
  categoryId?: string;
  lowStockOnly?: boolean;
  includeInactive?: boolean;
  productId?: string;
};

export async function listProducts(
  organizationId: string,
  filters: ProductFilters = {},
): Promise<ProductRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("products")
    .select(
      `id, name, sku, barcode, category_id, supplier_id, type, purchase_price, sale_price,
       stock_quantity, minimum_stock, allow_sell_at_loss, sell_at_loss_reason, notes, is_active,
       product_categories(name), suppliers(name)`,
    )
    .eq("organization_id", organizationId)
    .order("name", { ascending: true });

  if (!filters.includeInactive) query = query.eq("is_active", true);
  if (filters.productId) query = query.eq("id", filters.productId);
  if (filters.categoryId) query = query.eq("category_id", filters.categoryId);
  if (filters.search) {
    const s = filters.search.replace(/[,()]/g, " ").trim();
    if (s) {
      query = query.or(`name.ilike.%${escapeLike(s)}%,sku.ilike.%${escapeLike(s)}%,barcode.ilike.%${escapeLike(s)}%`);
    }
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  let rows = (data ?? []).map((r) => {
    const cats = r.product_categories as { name?: string } | { name?: string }[] | null;
    const sups = r.suppliers as { name?: string } | { name?: string }[] | null;
    const categoryName = Array.isArray(cats) ? cats[0]?.name ?? null : cats?.name ?? null;
    const supplierName = Array.isArray(sups) ? sups[0]?.name ?? null : sups?.name ?? null;
    return {
      id: r.id,
      name: r.name,
      sku: r.sku,
      barcode: r.barcode,
      category_id: r.category_id,
      supplier_id: r.supplier_id,
      category_name: categoryName,
      supplier_name: supplierName,
      type: r.type,
      purchase_price: Number(r.purchase_price ?? 0),
      sale_price: Number(r.sale_price ?? 0),
      stock_quantity: Number(r.stock_quantity ?? 0),
      minimum_stock: Number(r.minimum_stock ?? 0),
      allow_sell_at_loss: Boolean(r.allow_sell_at_loss),
      sell_at_loss_reason: r.sell_at_loss_reason ?? "",
      notes: r.notes,
      is_active: r.is_active,
    } as ProductRow;
  });

  if (filters.lowStockOnly) {
    rows = rows.filter((p) => p.type === "product" && p.stock_quantity <= p.minimum_stock);
  }

  return rows;
}

export async function getProductById(
  organizationId: string,
  productId: string,
): Promise<ProductRow | null> {
  if (!z.string().uuid().safeParse(productId).success) return null;
  const products = await listProducts(organizationId, {
    includeInactive: true,
    productId,
  });
  return products[0] ?? null;
}

export async function catalogCounts(organizationId: string) {
  const supabase = await createClient();
  const [products, activeProducts, categories, suppliers, lowStockSource] = await Promise.all([
    supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId),
    supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("is_active", true),
    supabase
      .from("product_categories")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("is_active", true),
    supabase
      .from("suppliers")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("is_active", true),
    supabase
      .from("products")
      .select("stock_quantity, minimum_stock, type, is_active")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .eq("type", "product"),
  ]);

  const lowStock =
    lowStockSource.data?.filter(
      (p) => Number(p.stock_quantity ?? 0) <= Number(p.minimum_stock ?? 0),
    ).length ?? 0;

  return {
    productsTotal: products.count ?? 0,
    productsActive: activeProducts.count ?? 0,
    categories: categories.count ?? 0,
    suppliers: suppliers.count ?? 0,
    lowStock,
  };
}
