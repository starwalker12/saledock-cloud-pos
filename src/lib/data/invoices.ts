import "server-only";
import { createClient } from "@/lib/supabase/server";

export type InvoiceListRow = {
  id: string;
  invoice_no: string;
  invoice_date: string;
  status: "draft" | "paid" | "partial" | "unpaid" | "void";
  grand_total: number;
  amount_paid: number;
  balance_due: number;
  customer_name: string | null;
};

export type InvoiceItemRow = {
  id: string;
  product_name: string;
  product_type: "product" | "service";
  quantity: number;
  unit_price: number;
  item_discount: number;
  line_total: number;
  purchase_price: number;
};

export type InvoicePaymentRow = {
  id: string;
  method: string;
  amount: number;
  reference_no: string | null;
  paid_at: string;
};

export type InvoiceDetail = {
  id: string;
  invoice_no: string;
  invoice_date: string;
  status: InvoiceListRow["status"];
  subtotal: number;
  discount_total: number;
  grand_total: number;
  amount_paid: number;
  balance_due: number;
  note: string | null;
  customer: { id: string; name: string; phone: string | null; address: string | null } | null;
  branch: { id: string; name: string; phone: string | null; address: string | null } | null;
  cashier_name: string | null;
  items: InvoiceItemRow[];
  payments: InvoicePaymentRow[];
};

export async function listInvoices(
  organizationId: string,
  limit = 100,
): Promise<InvoiceListRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invoices")
    .select(
      `id, invoice_no, invoice_date, status, grand_total, amount_paid, balance_due,
       customers(name)`,
    )
    .eq("organization_id", organizationId)
    .order("invoice_date", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);

  return (data ?? []).map((r) => {
    const c = r.customers as { name?: string } | { name?: string }[] | null;
    const customerName = Array.isArray(c) ? c[0]?.name ?? null : c?.name ?? null;
    return {
      id: r.id,
      invoice_no: r.invoice_no,
      invoice_date: r.invoice_date,
      status: r.status,
      grand_total: Number(r.grand_total ?? 0),
      amount_paid: Number(r.amount_paid ?? 0),
      balance_due: Number(r.balance_due ?? 0),
      customer_name: customerName,
    } satisfies InvoiceListRow;
  });
}

export async function getInvoiceDetail(
  organizationId: string,
  invoiceId: string,
): Promise<InvoiceDetail | null> {
  const supabase = await createClient();

  const { data: inv, error } = await supabase
    .from("invoices")
    .select(
      `id, invoice_no, invoice_date, status, subtotal, discount_total, grand_total,
       amount_paid, balance_due, note, branch_id, created_by,
       customers(id, name, phone, address),
       branches(id, name, phone, address)`,
    )
    .eq("organization_id", organizationId)
    .eq("id", invoiceId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!inv) return null;

  const [{ data: items, error: itemErr }, { data: pays, error: payErr }, cashier] =
    await Promise.all([
      supabase
        .from("invoice_items")
        .select("id, product_name, product_type, quantity, unit_price, item_discount, line_total, purchase_price")
        .eq("invoice_id", invoiceId)
        .order("created_at", { ascending: true }),
      supabase
        .from("payments")
        .select("id, method, amount, reference_no, paid_at")
        .eq("invoice_id", invoiceId)
        .order("paid_at", { ascending: true }),
      inv.created_by
        ? supabase.from("profiles").select("full_name").eq("id", inv.created_by).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
  if (itemErr) throw new Error(itemErr.message);
  if (payErr) throw new Error(payErr.message);

  type Joined = { id?: string; name?: string; phone?: string; address?: string };
  const c = inv.customers as Joined | Joined[] | null;
  const customer = (Array.isArray(c) ? c[0] : c) ?? null;
  const b = inv.branches as Joined | Joined[] | null;
  const branch = (Array.isArray(b) ? b[0] : b) ?? null;

  return {
    id: inv.id,
    invoice_no: inv.invoice_no,
    invoice_date: inv.invoice_date,
    status: inv.status,
    subtotal: Number(inv.subtotal ?? 0),
    discount_total: Number(inv.discount_total ?? 0),
    grand_total: Number(inv.grand_total ?? 0),
    amount_paid: Number(inv.amount_paid ?? 0),
    balance_due: Number(inv.balance_due ?? 0),
    note: inv.note,
    customer:
      customer && customer.id
        ? {
            id: customer.id,
            name: customer.name ?? "",
            phone: customer.phone ?? null,
            address: customer.address ?? null,
          }
        : null,
    branch:
      branch && branch.id
        ? {
            id: branch.id,
            name: branch.name ?? "",
            phone: branch.phone ?? null,
            address: branch.address ?? null,
          }
        : null,
    cashier_name: (cashier?.data as { full_name?: string } | null)?.full_name ?? null,
    items: (items ?? []).map((i) => ({
      id: i.id,
      product_name: i.product_name,
      product_type: i.product_type,
      quantity: Number(i.quantity ?? 0),
      unit_price: Number(i.unit_price ?? 0),
      item_discount: Number(i.item_discount ?? 0),
      line_total: Number(i.line_total ?? 0),
      purchase_price: Number(i.purchase_price ?? 0),
    })),
    payments: (pays ?? []).map((p) => ({
      id: p.id,
      method: p.method,
      amount: Number(p.amount ?? 0),
      reference_no: p.reference_no,
      paid_at: p.paid_at,
    })),
  };
}

export async function invoiceCounts(organizationId: string) {
  const supabase = await createClient();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [total, todayInvoices, openInvoices] = await Promise.all([
    supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId),
    supabase
      .from("invoices")
      .select("grand_total")
      .eq("organization_id", organizationId)
      .gte("invoice_date", todayStart.toISOString()),
    supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .in("status", ["partial", "unpaid"]),
  ]);

  const todaySalesTotal =
    todayInvoices.data?.reduce((s, r) => s + Number(r.grand_total ?? 0), 0) ?? 0;
  const todayCount = todayInvoices.data?.length ?? 0;

  return {
    invoicesTotal: total.count ?? 0,
    todaySalesTotal,
    todayCount,
    openInvoices: openInvoices.count ?? 0,
  };
}
