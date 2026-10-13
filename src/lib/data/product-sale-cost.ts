import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { moneyToMinorUnits, multiplyMoney, sumMoney } from "@/lib/money";

type Provenance = {
  source_trust_version: number | null;
  source_effective_at: string | null;
  source_transaction_id: string | null;
};
type SaleInvoice = Provenance & { id: string; organization_id: string };
type SaleItem = Provenance & {
  id: string; organization_id: string; invoice_id: string;
  product_id: string | null; product_type: string;
  quantity: number; purchase_price: number | string;
};
type SaleAllocation = Provenance & {
  id: string; organization_id: string; invoice_id: string;
  invoice_item_id: string; product_id: string; quantity: number;
  unit_cost: number | string;
};

const COST_ERROR = "Original sale cost cannot be verified.";
const fail = (): never => { throw new Error(COST_ERROR); };
const validQuantity = (quantity: number) => Number.isInteger(quantity)
  && quantity > 0 && quantity <= 2147483647;
const hasProvenance = (row: Provenance) => row.source_trust_version === 1
  && row.source_transaction_id !== null && row.source_transaction_id !== ""
  && row.source_effective_at !== null && Number.isFinite(Date.parse(row.source_effective_at));

// #376 assigns the same source transaction and effective timestamp to the
// invoice, its items and original FIFO allocations. No chronology inference.
function sameSource(row: Provenance, invoice: SaleInvoice): boolean {
  return hasProvenance(row) && hasProvenance(invoice)
    && row.source_transaction_id === invoice.source_transaction_id
    && row.source_effective_at === invoice.source_effective_at;
}

export function calculateProductSaleCost(
  organizationId: string,
  invoices: SaleInvoice[],
  items: SaleItem[],
  allocations: SaleAllocation[],
): number {
  const parents = new Map(invoices.map(invoice => [invoice.id, invoice]));
  const byItem = new Map<string, SaleAllocation[]>();
  for (const allocation of allocations) {
    const rows = byItem.get(allocation.invoice_item_id) ?? [];
    rows.push(allocation);
    byItem.set(allocation.invoice_item_id, rows);
  }
  const costs: number[] = [];
  for (const item of items) {
    if (item.product_type !== "product") continue;
    if (item.organization_id !== organizationId || !validQuantity(item.quantity)) fail();
    if (item.source_trust_version === null && item.source_effective_at === null
      && item.source_transaction_id === null) {
      // Compatibility interpretation only: existing legacy/imported cache.
      costs.push(multiplyMoney(item.purchase_price, item.quantity));
      continue;
    }
    const invoice = parents.get(item.invoice_id);
    if (!invoice) return fail();
    if (invoice.organization_id !== organizationId || !item.product_id
      || !sameSource(item, invoice)) fail();
    const rows = byItem.get(item.id) ?? [];
    let quantity = BigInt(0);
    const identities = new Set<string>();
    for (const allocation of rows) {
      const cost = moneyToMinorUnits(allocation.unit_cost);
      if (identities.has(allocation.id) || allocation.organization_id !== organizationId
        || allocation.invoice_id !== item.invoice_id || allocation.invoice_item_id !== item.id
        || allocation.product_id !== item.product_id || !sameSource(allocation, invoice)
        || !validQuantity(allocation.quantity) || cost === null || cost < BigInt(0)) fail();
      identities.add(allocation.id);
      quantity += BigInt(allocation.quantity);
      costs.push(multiplyMoney(allocation.unit_cost, allocation.quantity));
    }
    if (quantity !== BigInt(item.quantity)) fail();
  }
  const total = sumMoney(costs);
  if (!Number.isFinite(total)) fail();
  return total;
}

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;

// Pagination and small ID batches are transport details, not an invoice-line
// business limit. Protected source rows are immutable between these reads.
async function readRows<T>(
  supabase: ServerSupabaseClient, organizationId: string,
  table: string, columns: string, identityColumn: string, identities: string[],
  productsOnly = false,
): Promise<T[]> {
  const rows: T[] = [];
  for (let batch = 0; batch < identities.length; batch += 100) {
    const ids = identities.slice(batch, batch + 100);
    for (let offset = 0; ; offset += 1000) {
      let query = supabase.from(table).select(columns)
        .eq("organization_id", organizationId).in(identityColumn, ids)
        .order("id").range(offset, offset + 999);
      if (productsOnly) query = query.eq("product_type", "product");
      const { data, error } = await query;
      if (error) throw new Error(`${COST_ERROR} ${error.message}`);
      rows.push(...((data ?? []) as unknown as T[]));
      if (!data || data.length < 1000) break;
    }
  }
  return rows;
}

export async function getProductSaleCostForInvoices(
  supabase: ServerSupabaseClient, organizationId: string, invoiceIds: string[],
): Promise<number> {
  const ids = [...new Set(invoiceIds)];
  if (ids.length === 0) return 0;
  const provenance = "source_trust_version, source_effective_at, source_transaction_id";
  const items = await readRows<SaleItem>(supabase, organizationId, "invoice_items",
    `id, organization_id, invoice_id, product_id, product_type, quantity, purchase_price, ${provenance}`,
    "invoice_id", ids, true);
  const trusted = items.filter(item => item.source_trust_version !== null
    || item.source_effective_at !== null || item.source_transaction_id !== null);
  const [invoices, allocations] = await Promise.all([
    readRows<SaleInvoice>(supabase, organizationId, "invoices",
      `id, organization_id, ${provenance}`, "id", [...new Set(trusted.map(item => item.invoice_id))]),
    readRows<SaleAllocation>(supabase, organizationId, "invoice_item_stock_allocations",
      `id, organization_id, invoice_id, invoice_item_id, product_id, quantity, unit_cost, ${provenance}`,
      "invoice_item_id", trusted.map(item => item.id)),
  ]);
  return calculateProductSaleCost(organizationId, invoices, items, allocations);
}
