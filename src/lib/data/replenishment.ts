import "server-only";
import { createClient } from "@/lib/supabase/server";

export type ReplenishmentPriority = "critical" | "high" | "medium";

export type ReplenishmentSuggestion = {
  productId: string;
  productName: string;
  sku: string | null;
  currentStock: number;
  minimumStock: number;
  targetStock: number;
  suggestedQuantity: number;
  purchasePrice: number;
  estimatedCost: number | null;
  supplierId: string | null;
  supplierName: string | null;
  supplierCompany: string | null;
  supplierPhone: string | null;
  supplierEmail: string | null;
  priority: ReplenishmentPriority;
  reason: string;
};

export type ReplenishmentSummary = {
  totalNeeded: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  suppliersInvolved: number;
  estimatedTotalCost: number;
  suggestions: ReplenishmentSuggestion[];
  supplierGroups: SupplierGroup[];
};

export type ActiveSupplier = {
  id: string;
  name: string;
  company: string | null;
  phone: string | null;
  email: string | null;
};

/**
 * Read-only list of all active suppliers in the organization (for the PO planner
 * supplier dropdown). Organization-scoped via the user's RLS session — no
 * service-role use, no writes.
 */
export async function getActiveSuppliers(organizationId: string): Promise<ActiveSupplier[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("suppliers")
    .select("id, name, company, phone, email")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .order("name", { ascending: true });
  if (error) {
    console.error("[replenishment] active suppliers load failed:", error.message);
    return [];
  }
  return (data ?? []).map((s) => ({
    id: s.id as string,
    name: s.name as string,
    company: (s.company as string | null) ?? null,
    phone: (s.phone as string | null) ?? null,
    email: (s.email as string | null) ?? null,
  }));
}

export type SupplierGroup = {
  supplierId: string | null;
  supplierName: string | null;
  supplierCompany: string | null;
  supplierPhone: string | null;
  supplierEmail: string | null;
  productCount: number;
  estimatedCost: number;
  suggestions: ReplenishmentSuggestion[];
};

function determinePriority(
  currentStock: number,
  minimumStock: number,
): { priority: ReplenishmentPriority; reason: string } {
  if (currentStock <= 0) return { priority: "critical", reason: "Out of stock" };
  if (currentStock <= minimumStock) return { priority: "high", reason: "Below reorder level" };
  const buffer = Math.max(Math.ceil(minimumStock * 0.2), 1);
  if (currentStock <= minimumStock + buffer) return { priority: "medium", reason: "Approaching reorder level" };
  return { priority: "high" as ReplenishmentPriority, reason: "" };
}

function calcTargetStock(currentStock: number, minimumStock: number): number {
  return Math.max(minimumStock * 2, 10);
}

export async function getReplenishmentSuggestions(
  organizationId: string,
  filters?: {
    search?: string;
    priority?: ReplenishmentPriority;
    supplierId?: string;
    sortBy?: "priority" | "stock" | "cost" | "name";
  },
): Promise<ReplenishmentSummary> {
  const supabase = await createClient();

  const query = supabase
    .from("products")
    .select(
      `id, name, sku, purchase_price, stock_quantity, minimum_stock, supplier_id,
       suppliers(name, company, phone, email), is_active, type`,
    )
    .eq("organization_id", organizationId)
    .eq("type", "product")
    .eq("is_active", true)
    .order("name", { ascending: true });

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const allSuggestions: ReplenishmentSuggestion[] = [];

  for (const row of data ?? []) {
    const currentStock = Number(row.stock_quantity ?? 0);
    const minimumStock = Number(row.minimum_stock ?? 0);
    const { priority, reason } = determinePriority(currentStock, minimumStock);
    if (!reason) continue;

    const targetStock = calcTargetStock(currentStock, minimumStock);
    const suggestedQuantity = Math.max(targetStock - currentStock, 0);
    const purchasePrice = Number(row.purchase_price ?? 0);
    const estimatedCost = purchasePrice > 0 ? suggestedQuantity * purchasePrice : null;

    type SupplierJoin = { name?: string; company?: string | null; phone?: string | null; email?: string | null };
    const supsRaw = row.suppliers as SupplierJoin | SupplierJoin[] | null;
    const sup = Array.isArray(supsRaw) ? supsRaw[0] ?? null : supsRaw;
    const supplierName = sup?.name ?? null;
    const supplierCompany = sup?.company ?? null;
    const supplierPhone = sup?.phone ?? null;
    const supplierEmail = sup?.email ?? null;

    allSuggestions.push({
      productId: row.id,
      productName: row.name,
      sku: row.sku,
      currentStock,
      minimumStock,
      targetStock,
      suggestedQuantity,
      purchasePrice,
      estimatedCost,
      supplierId: row.supplier_id,
      supplierName,
      supplierCompany,
      supplierPhone,
      supplierEmail,
      priority,
      reason,
    });
  }

  // Apply filters
  let filtered = allSuggestions;
  if (filters?.search) {
    const s = filters.search.toLowerCase();
    filtered = filtered.filter(
      (p) =>
        p.productName.toLowerCase().includes(s) ||
        (p.sku ?? "").toLowerCase().includes(s),
    );
  }
  if (filters?.priority) {
    filtered = filtered.filter((p) => p.priority === filters.priority);
  }
  if (filters?.supplierId) {
    filtered = filtered.filter((p) => p.supplierId === filters.supplierId);
  }

  // Sort
  if (filters?.sortBy === "stock") {
    filtered.sort((a, b) => a.currentStock - b.currentStock);
  } else if (filters?.sortBy === "cost") {
    filtered.sort((a, b) => (b.estimatedCost ?? 0) - (a.estimatedCost ?? 0));
  } else if (filters?.sortBy === "name") {
    filtered.sort((a, b) => a.productName.localeCompare(b.productName));
  } else {
    // Default: priority order (critical first, then high, then medium)
    const priorityOrder: Record<ReplenishmentPriority, number> = { critical: 0, high: 1, medium: 2 };
    filtered.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
  }

  // Build supplier groups
  const groupMap = new Map<string, SupplierGroup>();
  for (const s of filtered) {
    const key = s.supplierId ?? "__unassigned__";
    let group = groupMap.get(key);
    if (!group) {
      group = {
        supplierId: s.supplierId,
        supplierName: s.supplierName,
        supplierCompany: s.supplierCompany,
        supplierPhone: s.supplierPhone,
        supplierEmail: s.supplierEmail,
        productCount: 0,
        estimatedCost: 0,
        suggestions: [],
      };
      groupMap.set(key, group);
    }
    group.productCount++;
    if (s.estimatedCost !== null) group.estimatedCost += s.estimatedCost;
    group.suggestions.push(s);
  }
  const supplierGroups = [...groupMap.entries()]
    .sort(([, a], [, b]) => (b.estimatedCost ?? 0) - (a.estimatedCost ?? 0))
    .map(([, g]) => g);

  const criticalCount = filtered.filter((s) => s.priority === "critical").length;
  const highCount = filtered.filter((s) => s.priority === "high").length;
  const mediumCount = filtered.filter((s) => s.priority === "medium").length;
  const estimatedTotalCost = filtered.reduce((s, r) => s + (r.estimatedCost ?? 0), 0);

  return {
    totalNeeded: filtered.length,
    criticalCount,
    highCount,
    mediumCount,
    suppliersInvolved: supplierGroups.length,
    estimatedTotalCost,
    suggestions: filtered,
    supplierGroups,
  };
}
