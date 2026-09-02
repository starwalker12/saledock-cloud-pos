import { createClient } from "@/lib/supabase/server";
import {
  OPERATIONAL_HISTORY_MAX_ROWS,
  operationalHistoryResult,
  type OperationalHistoryResult,
} from "@/lib/operational-history";

export type StockLotRow = {
  id: string;
  lot_number: string | null;
  purchase_date: string;
  quantity_received: number;
  quantity_remaining: number;
  unit_cost: number;
  notes: string | null;
  is_active: boolean;
  supplier_name: string | null;
  created_at: string;
};

export type StockMovementRow = {
  id: string;
  movement_type: "purchase" | "sale" | "return_in" | "return_out" | "adjustment_in" | "adjustment_out" | "opening_stock" | "void";
  quantity: number;
  unit_cost: number | null;
  reference_type: string | null;
  reference_id: string | null;
  invoice_no?: string | null;
  notes: string | null;
  created_at: string;
  created_by_name: string | null;
};

export async function listStockLots(productId: string, orgId: string): Promise<StockLotRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("product_stock_lots")
    .select(`
      id,
      lot_number,
      purchase_date,
      quantity_received,
      quantity_remaining,
      unit_cost,
      notes,
      is_active,
      created_at,
      suppliers (name)
    `)
    .eq("product_id", productId)
    .eq("organization_id", orgId)
    .order("purchase_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error listing stock lots:", error);
    return [];
  }

  return (data || []).map((row) => {
    const suppliers = row.suppliers as unknown as { name: string }[] | { name: string } | null;
    const supplierName = Array.isArray(suppliers)
      ? suppliers[0]?.name ?? null
      : (suppliers as { name: string } | null)?.name ?? null;

    return {
      id: row.id,
      lot_number: row.lot_number,
      purchase_date: row.purchase_date,
      quantity_received: row.quantity_received,
      quantity_remaining: row.quantity_remaining,
      unit_cost: Number(row.unit_cost),
      notes: row.notes,
      is_active: row.is_active,
      supplier_name: supplierName,
      created_at: row.created_at,
    };
  });
}

export type StockMovementFilters = {
  from?: string;
  to?: string;
};

export async function listStockMovements(
  productId: string,
  orgId: string,
  filters: StockMovementFilters = {},
): Promise<OperationalHistoryResult<StockMovementRow>> {
  const supabase = await createClient();
  let countQuery = supabase
    .from("stock_movements")
    .select("id", { count: "exact", head: true })
    .eq("product_id", productId)
    .eq("organization_id", orgId);

  if (filters.from) countQuery = countQuery.gte("created_at", filters.from);
  if (filters.to) countQuery = countQuery.lte("created_at", filters.to);

  const { count, error: countError } = await countQuery;
  if (countError || count === null) {
    throw new Error("Unable to count movement history.");
  }
  if (count > OPERATIONAL_HISTORY_MAX_ROWS) {
    return operationalHistoryResult([], count);
  }

  let query = supabase
    .from("stock_movements")
    .select(`
      id,
      movement_type,
      quantity,
      unit_cost,
      reference_type,
      reference_id,
      notes,
      created_at,
      invoices (invoice_no),
      profiles (full_name)
    `)
    .eq("product_id", productId)
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });

  if (filters.from) query = query.gte("created_at", filters.from);
  if (filters.to) query = query.lte("created_at", filters.to);
  query = query.limit(OPERATIONAL_HISTORY_MAX_ROWS);

  const { data, error } = await query;

  if (error) {
    console.error("Error listing stock movements:", error);
    throw new Error("Unable to load movement history.");
  }

  const rows = (data || []).map((row) => {
    const invoices = row.invoices as unknown as { invoice_no: string | null }[] | { invoice_no: string | null } | null;
    const invoiceNo = Array.isArray(invoices)
      ? invoices[0]?.invoice_no ?? null
      : (invoices as { invoice_no: string | null } | null)?.invoice_no ?? null;

    const profiles = row.profiles as unknown as { full_name: string | null }[] | { full_name: string | null } | null;
    const createdByName = Array.isArray(profiles)
      ? profiles[0]?.full_name ?? null
      : (profiles as { full_name: string | null } | null)?.full_name ?? null;

    return {
      id: row.id,
      movement_type: row.movement_type as StockMovementRow["movement_type"],
      quantity: row.quantity,
      unit_cost: row.unit_cost ? Number(row.unit_cost) : null,
      reference_type: row.reference_type,
      reference_id: row.reference_id,
      invoice_no: invoiceNo,
      notes: row.notes,
      created_at: row.created_at,
      created_by_name: createdByName,
    };
  });
  return operationalHistoryResult(rows, count);
}

export async function getProductStockSummary(productId: string, orgId: string) {
  const lots = await listStockLots(productId, orgId);
  const activeLots = lots.filter(l => l.is_active && l.quantity_remaining > 0);
  
  const totalRemaining = activeLots.reduce((acc, l) => acc + l.quantity_remaining, 0);
  const totalCostValue = activeLots.reduce((acc, l) => acc + (l.quantity_remaining * l.unit_cost), 0);
  const weightedAverageCost = totalRemaining > 0 ? (totalCostValue / totalRemaining) : 0;

  return {
    totalRemaining,
    weightedAverageCost,
    activeLotsCount: activeLots.length,
    lastPurchaseCost: lots.length > 0 ? lots[0].unit_cost : 0,
  };
}
