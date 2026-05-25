import "server-only";
import { createClient } from "@/lib/supabase/server";

export type ReturnableInvoiceItem = {
  id: string;
  product_id: string | null;
  item_name: string;
  item_type: "product" | "service";
  quantity_sold: number;
  quantity_returned: number;
  quantity_returnable: number;
  unit_price: number;
  line_total: number;
  return_unit_total: number;
};

export type InvoiceReturnItem = {
  id: string;
  item_name: string;
  item_type: "product" | "service";
  quantity: number;
  line_total: number;
  restock: boolean;
};

export type InvoiceReturnRow = {
  id: string;
  return_no: string;
  status: string;
  subtotal: number;
  refund_amount: number;
  refund_method: string | null;
  reference_number: string | null;
  notes: string | null;
  created_at: string;
  created_by_name: string | null;
  items: InvoiceReturnItem[];
};

export type ReturnListRow = {
  id: string;
  return_no: string;
  created_at: string;
  status: string;
  subtotal: number;
  refund_amount: number;
  refund_method: string | null;
  invoice_id: string;
  invoice_no: string | null;
  customer_name: string | null;
};

export async function listReturnableInvoiceItems(
  organizationId: string,
  invoiceId: string,
): Promise<ReturnableInvoiceItem[]> {
  const supabase = await createClient();

  const [{ data: items, error: itemsError }, { data: returned, error: returnedError }] =
    await Promise.all([
      supabase
        .from("invoice_items")
        .select("id, product_id, product_name, product_type, quantity, unit_price, line_total")
        .eq("organization_id", organizationId)
        .eq("invoice_id", invoiceId)
        .order("created_at", { ascending: true }),
      supabase
        .from("return_items")
        .select("invoice_item_id, quantity, returns!inner(status)")
        .eq("organization_id", organizationId)
        .eq("invoice_id", invoiceId)
        .eq("returns.status", "completed"),
    ]);

  if (itemsError) throw new Error(itemsError.message);
  if (returnedError) throw new Error(returnedError.message);

  const returnedByItem = new Map<string, number>();
  for (const row of returned ?? []) {
    returnedByItem.set(
      row.invoice_item_id,
      (returnedByItem.get(row.invoice_item_id) ?? 0) + Number(row.quantity ?? 0),
    );
  }

  return (items ?? []).map((item) => {
    const quantitySold = Number(item.quantity ?? 0);
    const quantityReturned = returnedByItem.get(item.id) ?? 0;
    const lineTotal = Number(item.line_total ?? 0);
    return {
      id: item.id,
      product_id: item.product_id,
      item_name: item.product_name,
      item_type: item.product_type,
      quantity_sold: quantitySold,
      quantity_returned: quantityReturned,
      quantity_returnable: Math.max(quantitySold - quantityReturned, 0),
      unit_price: Number(item.unit_price ?? 0),
      line_total: lineTotal,
      return_unit_total: quantitySold > 0 ? lineTotal / quantitySold : 0,
    } satisfies ReturnableInvoiceItem;
  });
}

export async function listReturnsForInvoice(
  organizationId: string,
  invoiceId: string,
): Promise<InvoiceReturnRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("returns")
    .select(
      `id, return_no, status, subtotal, refund_amount, refund_method, reference_number, notes, created_at,
       profiles(full_name),
       return_items(id, item_name, item_type, quantity, line_total, restock)`,
    )
    .eq("organization_id", organizationId)
    .eq("invoice_id", invoiceId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const profiles = row.profiles as { full_name?: string } | { full_name?: string }[] | null;
    const createdByName = Array.isArray(profiles)
      ? profiles[0]?.full_name ?? null
      : profiles?.full_name ?? null;
    const items = (row.return_items ?? []) as Array<{
      id: string;
      item_name: string;
      item_type: "product" | "service";
      quantity: number;
      line_total: number;
      restock: boolean;
    }>;

    return {
      id: row.id,
      return_no: row.return_no,
      status: row.status,
      subtotal: Number(row.subtotal ?? 0),
      refund_amount: Number(row.refund_amount ?? 0),
      refund_method: row.refund_method,
      reference_number: row.reference_number,
      notes: row.notes,
      created_at: row.created_at,
      created_by_name: createdByName,
      items: items.map((item) => ({
        id: item.id,
        item_name: item.item_name,
        item_type: item.item_type,
        quantity: Number(item.quantity ?? 0),
        line_total: Number(item.line_total ?? 0),
        restock: Boolean(item.restock),
      })),
    } satisfies InvoiceReturnRow;
  });
}

export async function listRecentReturns(
  organizationId: string,
  limit = 50,
): Promise<ReturnListRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("returns")
    .select(
      `id, return_no, created_at, status, subtotal, refund_amount, refund_method, invoice_id,
       invoices(invoice_no),
       customers(name)`,
    )
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const invoices = row.invoices as { invoice_no?: string } | { invoice_no?: string }[] | null;
    const customers = row.customers as { name?: string } | { name?: string }[] | null;
    return {
      id: row.id,
      return_no: row.return_no,
      created_at: row.created_at,
      status: row.status,
      subtotal: Number(row.subtotal ?? 0),
      refund_amount: Number(row.refund_amount ?? 0),
      refund_method: row.refund_method,
      invoice_id: row.invoice_id,
      invoice_no: Array.isArray(invoices) ? invoices[0]?.invoice_no ?? null : invoices?.invoice_no ?? null,
      customer_name: Array.isArray(customers) ? customers[0]?.name ?? null : customers?.name ?? null,
    } satisfies ReturnListRow;
  });
}
