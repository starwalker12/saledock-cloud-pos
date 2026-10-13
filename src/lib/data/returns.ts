import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSafeActionError } from "@/lib/errors/safe-action-error";
import {
  OPERATIONAL_HISTORY_MAX_ROWS,
  operationalHistoryResult,
  type OperationalHistoryResult,
} from "@/lib/operational-history";

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
  original_net_minor: string;
  remaining_due: string;
  eligibility_error: string | null;
  service_principal: number;
};

export type InvoiceReturnItem = {
  id: string;
  item_name: string;
  item_type: "product" | "service";
  quantity: number;
  line_total: number;
  restock: boolean;
  restock_quantity: number | null;
};

export type InvoiceReturnRow = {
  id: string;
  return_no: string;
  status: string;
  subtotal: number;
  refund_amount: number;
  return_math_version: number | null;
  debt_relief: number | null;
  restored_cost: number | null;
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
  return_math_version: number | null;
  debt_relief: number | null;
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
        .select("id, product_id, product_name, product_type, quantity, unit_price, line_total, service_transaction_amount")
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

  const { data: plan, error: planError } = await supabase.rpc("quote_invoice_return", {
    p_invoice_id: invoiceId,
    p_items: (items ?? []).map(item => ({ invoice_item_id: item.id, quantity: 0, restock_quantity: 0 })),
  });
  const eligibilityError = planError
    ? getSafeActionError(planError, "SaleDock cannot fully verify this invoice's return history. No return was made.")
    : null;
  const basis = new Map<string, { net_minor: string; returned_quantity: number }>(
    ((plan?.items ?? []) as Array<{ invoice_item_id: string; net_minor: string; returned_quantity: number }>)
      .map(item => [item.invoice_item_id, item]),
  );

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
      original_net_minor: basis.get(item.id)?.net_minor ?? "0",
      remaining_due: plan?.remaining_due ?? "0",
      eligibility_error: eligibilityError,
      service_principal: Number(item.service_transaction_amount ?? 0),
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
      `id, return_no, status, subtotal, refund_amount, return_math_version, debt_relief, restored_cost, refund_method, reference_number, notes, created_at,
       profiles(full_name),
       return_items(id, item_name, item_type, quantity, line_total, restock, restock_quantity)`,
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
      restock_quantity: number | null;
    }>;

    return {
      id: row.id,
      return_no: row.return_no,
      status: row.status,
      subtotal: Number(row.subtotal ?? 0),
      refund_amount: Number(row.refund_amount ?? 0),
      return_math_version: row.return_math_version,
      debt_relief: row.debt_relief === null ? null : Number(row.debt_relief),
      restored_cost: row.restored_cost === null ? null : Number(row.restored_cost),
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
        restock_quantity: item.restock_quantity,
      })),
    } satisfies InvoiceReturnRow;
  });
}

export type ReturnListFilters = {
  from?: string;
  to?: string;
  limit?: number;
};

export async function listReturns(
  organizationId: string,
  filters: ReturnListFilters = {},
): Promise<OperationalHistoryResult<ReturnListRow>> {
  const supabase = await createClient();
  const hasRange = Boolean(filters.from || filters.to);
  let totalCount: number | null = null;

  if (hasRange) {
    let countQuery = supabase
      .from("returns")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId);

    if (filters.from) countQuery = countQuery.gte("created_at", filters.from);
    if (filters.to) countQuery = countQuery.lte("created_at", filters.to);

    const { count, error: countError } = await countQuery;
    if (countError || count === null) {
      throw new Error("Unable to count return history.");
    }
    totalCount = count;
    if (count > OPERATIONAL_HISTORY_MAX_ROWS) {
      return operationalHistoryResult([], count);
    }
  }

  let query = supabase
    .from("returns")
    .select(
      `id, return_no, created_at, status, subtotal, refund_amount, return_math_version, debt_relief, refund_method, invoice_id,
       invoices(invoice_no),
       customers(name)`,
    )
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (filters.from) query = query.gte("created_at", filters.from);
  if (filters.to) query = query.lte("created_at", filters.to);

  if (!hasRange) {
    query = query.limit(filters.limit ?? 50);
  } else {
    query = query.limit(OPERATIONAL_HISTORY_MAX_ROWS);
  }

  const { data, error } = await query;

  if (error) throw new Error(error.message);

  const rows = (data ?? []).map((row) => {
    const invoices = row.invoices as { invoice_no?: string } | { invoice_no?: string }[] | null;
    const customers = row.customers as { name?: string } | { name?: string }[] | null;
    return {
      id: row.id,
      return_no: row.return_no,
      created_at: row.created_at,
      status: row.status,
      subtotal: Number(row.subtotal ?? 0),
      refund_amount: Number(row.refund_amount ?? 0),
      return_math_version: row.return_math_version,
      debt_relief: row.debt_relief === null ? null : Number(row.debt_relief),
      refund_method: row.refund_method,
      invoice_id: row.invoice_id,
      invoice_no: Array.isArray(invoices) ? invoices[0]?.invoice_no ?? null : invoices?.invoice_no ?? null,
      customer_name: Array.isArray(customers) ? customers[0]?.name ?? null : customers?.name ?? null,
    } satisfies ReturnListRow;
  });
  return operationalHistoryResult(rows, totalCount);
}

export type ReturnDetail = {
  id: string;
  return_no: string;
  created_at: string;
  status: string;
  subtotal: number;
  refund_amount: number;
  return_math_version: number | null;
  debt_relief: number | null;
  restored_cost: number | null;
  refund_method: string | null;
  reference_number: string | null;
  notes: string | null;
  invoice_id: string;
  invoice_no: string | null;
  invoice_date: string | null;
  branch_id: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  customer_address: string | null;
  created_by_name: string | null;
  items: Array<{
    id: string;
    item_name: string;
    item_type: "product" | "service";
    quantity: number;
    unit_price: number;
    line_total: number;
    restock: boolean;
    restock_quantity: number | null;
  }>;
};

export async function getReturnDetail(
  organizationId: string,
  returnId: string,
): Promise<ReturnDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("returns")
    .select(
      `id, return_no, status, subtotal, refund_amount, return_math_version, debt_relief, restored_cost, refund_method, reference_number, notes, created_at, invoice_id, branch_id,
       profiles(full_name),
       invoices(invoice_no, invoice_date),
       customers(name, phone, email, address),
       return_items(id, item_name, item_type, quantity, unit_price, line_total, restock, restock_quantity)`,
    )
    .eq("organization_id", organizationId)
    .eq("id", returnId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null; // Single row empty
    throw new Error(error.message);
  }

  if (!data) return null;

  const profiles = data.profiles as { full_name?: string } | { full_name?: string }[] | null;
  const createdByName = Array.isArray(profiles)
    ? profiles[0]?.full_name ?? null
    : profiles?.full_name ?? null;

  const invoices = data.invoices as { invoice_no?: string; invoice_date?: string } | { invoice_no?: string; invoice_date?: string }[] | null;
  const invoiceNo = Array.isArray(invoices) ? invoices[0]?.invoice_no ?? null : invoices?.invoice_no ?? null;
  const invoiceDate = Array.isArray(invoices) ? invoices[0]?.invoice_date ?? null : invoices?.invoice_date ?? null;

  const customers = data.customers as { name?: string; phone?: string; email?: string; address?: string } | { name?: string; phone?: string; email?: string; address?: string }[] | null;
  const custName = Array.isArray(customers) ? customers[0]?.name ?? null : customers?.name ?? null;
  const custPhone = Array.isArray(customers) ? customers[0]?.phone ?? null : customers?.phone ?? null;
  const custEmail = Array.isArray(customers) ? customers[0]?.email ?? null : customers?.email ?? null;
  const custAddress = Array.isArray(customers) ? customers[0]?.address ?? null : customers?.address ?? null;

  const items = (data.return_items ?? []) as Array<{
    id: string;
    item_name: string;
    item_type: "product" | "service";
    quantity: number;
    unit_price: number;
    line_total: number;
    restock: boolean;
    restock_quantity: number | null;
  }>;

  return {
    id: data.id,
    return_no: data.return_no,
    created_at: data.created_at,
    status: data.status,
    subtotal: Number(data.subtotal ?? 0),
    refund_amount: Number(data.refund_amount ?? 0),
    return_math_version: data.return_math_version,
    debt_relief: data.debt_relief === null ? null : Number(data.debt_relief),
    restored_cost: data.restored_cost === null ? null : Number(data.restored_cost),
    refund_method: data.refund_method,
    reference_number: data.reference_number,
    notes: data.notes,
    invoice_id: data.invoice_id,
    invoice_no: invoiceNo,
    invoice_date: invoiceDate,
    branch_id: data.branch_id,
    customer_name: custName,
    customer_phone: custPhone,
    customer_email: custEmail,
    customer_address: custAddress,
    created_by_name: createdByName,
    items: items.map((item) => ({
      id: item.id,
      item_name: item.item_name,
      item_type: item.item_type,
      quantity: Number(item.quantity ?? 0),
      unit_price: Number(item.unit_price ?? 0),
      line_total: Number(item.line_total ?? 0),
      restock: Boolean(item.restock),
      restock_quantity: item.restock_quantity,
    })),
  };
}
