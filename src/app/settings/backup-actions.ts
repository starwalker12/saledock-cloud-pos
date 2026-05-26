"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentContext } from "@/lib/auth/session";
import { logAudit } from "@/lib/audit";
import { revalidatePath } from "next/cache";

export type ExportData = {
  categories: unknown[];
  suppliers: unknown[];
  products: unknown[];
  lots: unknown[];
  movements: unknown[];
  customers: unknown[];
  invoices: unknown[];
  invoiceItems: unknown[];
  payments: unknown[];
  ledgerEntries: unknown[];
  returns: unknown[];
  returnItems: unknown[];
  returnStockAllocations: unknown[];
  expenses: unknown[];
  repairs: unknown[];
  closings: unknown[];
  auditLogs: unknown[];
};

export type ImportState = {
  success: boolean;
  error?: string;
  message?: string;
  importedCounts?: {
    categories: number;
    suppliers: number;
    products: number;
    customers: number;
  };
};

export type ImportCategory = {
  id: string;
  name: string;
  description: string | null;
  is_active?: boolean;
};

export type ImportSupplier = {
  id: string;
  name: string;
  company: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  is_active?: boolean;
};

export type ImportCustomer = {
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  outstanding_balance?: number;
};

export type ImportProduct = {
  name: string;
  sku: string | null;
  barcode: string | null;
  type?: string;
  purchase_price?: number;
  sale_price?: number;
  stock_quantity?: number;
  minimum_stock?: number;
  allow_sell_at_loss?: boolean;
  sell_at_loss_reason?: string;
  notes: string | null;
  is_active?: boolean;
  category_id?: string | null;
  supplier_id?: string | null;
};

export async function fetchExportDataAction(): Promise<{ success: boolean; data?: ExportData; error?: string }> {
  try {
    const { user, profile } = await getCurrentContext();
    if (!user || !profile) {
      return { success: false, error: "Not authenticated." };
    }

    if (profile.role !== "owner" && profile.role !== "admin") {
      return { success: false, error: "Only Owners and Admins can export data." };
    }

    const orgId = profile.organization_id;
    if (!orgId) {
      return { success: false, error: "No organization assigned." };
    }

    const supabase = await createClient();

    // Fetch all tables in parallel
    const [
      cats,
      sups,
      prods,
      lots,
      movs,
      custs,
      invs,
      invItems,
      pays,
      ledgers,
      returns,
      returnItems,
      returnStockAllocations,
      exps,
      reps,
      closings,
      audits
    ] = await Promise.all([
      supabase.from("product_categories").select("*").eq("organization_id", orgId),
      supabase.from("suppliers").select("*").eq("organization_id", orgId),
      supabase.from("products").select("*").eq("organization_id", orgId),
      supabase.from("product_stock_lots").select("*").eq("organization_id", orgId),
      supabase.from("stock_movements").select("*").eq("organization_id", orgId),
      supabase.from("customers").select("*").eq("organization_id", orgId),
      supabase.from("invoices").select("*").eq("organization_id", orgId),
      supabase.from("invoice_items").select("*").eq("organization_id", orgId),
      supabase.from("payments").select("*").eq("organization_id", orgId),
      supabase.from("customer_ledger_entries").select("*").eq("organization_id", orgId),
      supabase.from("returns").select("*").eq("organization_id", orgId),
      supabase.from("return_items").select("*").eq("organization_id", orgId),
      supabase.from("return_stock_allocations").select("*").eq("organization_id", orgId),
      supabase.from("expenses").select("*").eq("organization_id", orgId),
      supabase.from("repairs").select("*").eq("organization_id", orgId),
      supabase.from("daily_closings").select("*").eq("organization_id", orgId),
      supabase.from("audit_logs").select("*").eq("organization_id", orgId)
    ]);

    // Handle any critical query errors
    if (cats.error) throw new Error("Failed to export categories: " + cats.error.message);
    if (sups.error) throw new Error("Failed to export suppliers: " + sups.error.message);
    if (prods.error) throw new Error("Failed to export products: " + prods.error.message);
    if (returns.error) throw new Error("Failed to export returns: " + returns.error.message);
    if (returnItems.error) throw new Error("Failed to export return items: " + returnItems.error.message);
    if (returnStockAllocations.error) {
      throw new Error("Failed to export return stock allocations: " + returnStockAllocations.error.message);
    }

    const data: ExportData = {
      categories: cats.data ?? [],
      suppliers: sups.data ?? [],
      products: prods.data ?? [],
      lots: lots.data ?? [],
      movements: movs.data ?? [],
      customers: custs.data ?? [],
      invoices: invs.data ?? [],
      invoiceItems: invItems.data ?? [],
      payments: pays.data ?? [],
      ledgerEntries: ledgers.data ?? [],
      returns: returns.data ?? [],
      returnItems: returnItems.data ?? [],
      returnStockAllocations: returnStockAllocations.data ?? [],
      expenses: exps.data ?? [],
      repairs: reps.data ?? [],
      closings: closings.data ?? [],
      auditLogs: audits.data ?? []
    };

    // Log the backup action
    await logAudit({
      module: "settings",
      action: "BACKUP_EXPORT",
      details: `Owner exported database backup ZIP containing ${data.products.length} products, ${data.invoices.length} invoices, and other POS data.`
    });

    return { success: true, data };
  } catch (error) {
    const err = error as Error;
    console.error("Backup export failed:", err);
    return { success: false, error: err.message || "An unexpected error occurred during export data preparation." };
  }
}

export async function importDataAction(
  prevState: ImportState | null,
  payload: {
    categories: ImportCategory[];
    suppliers: ImportSupplier[];
    products: ImportProduct[];
    customers: ImportCustomer[];
  }
): Promise<ImportState> {
  try {
    const { user, profile } = await getCurrentContext();
    if (!user || !profile) {
      return { success: false, error: "Not authenticated." };
    }

    if (profile.role !== "owner" && profile.role !== "admin") {
      return { success: false, error: "Only Owners and Admins can import data." };
    }

    const orgId = profile.organization_id;
    const branchId = profile.branch_id;
    if (!orgId || !branchId) {
      return { success: false, error: "No organization/branch assigned." };
    }

    const supabase = await createClient();

    // 1. Fetch current org master records to avoid duplicates
    const [existingCats, existingSups, existingProds, existingCusts] = await Promise.all([
      supabase.from("product_categories").select("id, name").eq("organization_id", orgId),
      supabase.from("suppliers").select("id, name").eq("organization_id", orgId),
      supabase.from("products").select("id, name, sku").eq("organization_id", orgId),
      supabase.from("customers").select("id, name, phone").eq("organization_id", orgId)
    ]);

    const catMap = new Map(existingCats.data?.map(c => [c.name.toLowerCase(), c.id]));
    const supMap = new Map(existingSups.data?.map(s => [s.name.toLowerCase(), s.id]));
    const prodSkuMap = new Map(existingProds.data?.map(p => [p.sku?.toLowerCase(), p.id]));
    const prodNameMap = new Map(existingProds.data?.map(p => [p.name.toLowerCase(), p.id]));
    const custMap = new Map(existingCusts.data?.map(c => [`${c.name.toLowerCase()}-${c.phone || ""}`, c.id]));

    let catImported = 0;
    let supImported = 0;
    let prodImported = 0;
    let custImported = 0;

    // 2. Import Categories
    const categoryIdMapping = new Map<string, string>(); // oldId -> newId
    for (const c of payload.categories) {
      const nameKey = c.name.toLowerCase();
      if (catMap.has(nameKey)) {
        categoryIdMapping.set(c.id, catMap.get(nameKey)!);
      } else {
        const { data, error } = await supabase
          .from("product_categories")
          .insert({
            organization_id: orgId,
            name: c.name,
            description: c.description,
            is_active: c.is_active ?? true
          })
          .select("id")
          .single();
        if (error) {
          console.error("Failed importing category row:", c, error);
          continue;
        }
        categoryIdMapping.set(c.id, data.id);
        catMap.set(nameKey, data.id);
        catImported++;
      }
    }

    // 3. Import Suppliers
    const supplierIdMapping = new Map<string, string>(); // oldId -> newId
    for (const s of payload.suppliers) {
      const nameKey = s.name.toLowerCase();
      if (supMap.has(nameKey)) {
        supplierIdMapping.set(s.id, supMap.get(nameKey)!);
      } else {
        const { data, error } = await supabase
          .from("suppliers")
          .insert({
            organization_id: orgId,
            name: s.name,
            company: s.company,
            phone: s.phone,
            email: s.email,
            address: s.address,
            notes: s.notes,
            is_active: s.is_active ?? true
          })
          .select("id")
          .single();
        if (error) {
          console.error("Failed importing supplier row:", s, error);
          continue;
        }
        supplierIdMapping.set(s.id, data.id);
        supMap.set(nameKey, data.id);
        supImported++;
      }
    }

    // 4. Import Customers
    for (const c of payload.customers) {
      const namePhoneKey = `${c.name.toLowerCase()}-${c.phone || ""}`;
      if (!custMap.has(namePhoneKey)) {
        const { error } = await supabase
          .from("customers")
          .insert({
            organization_id: orgId,
            name: c.name,
            phone: c.phone,
            email: c.email,
            address: c.address,
            notes: c.notes,
            outstanding_balance: c.outstanding_balance ?? 0
          });
        if (error) {
          console.error("Failed importing customer row:", c, error);
          continue;
        }
        custImported++;
      }
    }

    // 5. Import Products
    for (const p of payload.products) {
      const skuKey = p.sku?.toLowerCase();
      const nameKey = p.name.toLowerCase();
      const hasProd = (skuKey && prodSkuMap.has(skuKey)) || prodNameMap.has(nameKey);
      if (!hasProd) {
        const mappedCatId = p.category_id ? categoryIdMapping.get(p.category_id) : null;
        const mappedSupId = p.supplier_id ? supplierIdMapping.get(p.supplier_id) : null;

        const { error } = await supabase
          .from("products")
          .insert({
            organization_id: orgId,
            category_id: mappedCatId ?? null,
            supplier_id: mappedSupId ?? null,
            name: p.name,
            sku: p.sku,
            barcode: p.barcode,
            type: p.type || "product",
            purchase_price: p.purchase_price ?? 0,
            sale_price: p.sale_price ?? 0,
            stock_quantity: p.stock_quantity ?? 0,
            minimum_stock: p.minimum_stock ?? 0,
            allow_sell_at_loss: p.allow_sell_at_loss ?? false,
            sell_at_loss_reason: p.sell_at_loss_reason || "",
            notes: p.notes,
            is_active: p.is_active ?? true
          });
        if (error) {
          console.error("Failed importing product row:", p, error);
          continue;
        }
        prodImported++;
      }
    }

    // Log the restore/import action
    await logAudit({
      module: "settings",
      action: "BACKUP_IMPORT",
      details: `Owner imported core POS data from backup, registering ${prodImported} new products, ${catImported} new categories, ${supImported} new suppliers, and ${custImported} new customers.`
    });

    revalidatePath("/settings");
    revalidatePath("/dashboard");
    revalidatePath("/products");
    revalidatePath("/customers");

    return {
      success: true,
      message: "Data imported successfully.",
      importedCounts: {
        categories: catImported,
        suppliers: supImported,
        products: prodImported,
        customers: custImported
      }
    };
  } catch (error) {
    const err = error as Error;
    console.error("Data import failed:", err);
    return { success: false, error: err.message || "An unexpected error occurred during restore." };
  }
}
