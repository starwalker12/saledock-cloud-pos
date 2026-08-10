import "server-only";
import { createClient } from "@/lib/supabase/server";
import {
  getKarachiDayStartIso,
  getKarachiTodayDateString,
} from "@/lib/datetime";

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

export const INVOICE_LIST_STATUSES = [
  "draft",
  "paid",
  "partial",
  "unpaid",
  "void",
] as const;

export type InvoiceListStatus = (typeof INVOICE_LIST_STATUSES)[number];

// Customer-credit checkout records debt rather than a payment row, so this
// list intentionally contains only methods represented in `payments.method`.
export const RECORDED_INVOICE_PAYMENT_METHODS = [
  "cash",
  "card",
  "easypaisa",
  "jazzcash",
  "bank_transfer",
] as const;

export type RecordedInvoicePaymentMethod =
  (typeof RECORDED_INVOICE_PAYMENT_METHODS)[number];

export type InvoiceListFilters = {
  search?: string;
  fromIso?: string;
  toIso?: string;
  paymentMethod?: RecordedInvoicePaymentMethod;
  status?: InvoiceListStatus;
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
  service_provider: string | null;
  service_direction: string | null;
  service_transaction_amount: number;
  service_commission: number;
  service_total_charged: number;
  service_reference_no: string | null;
  service_note: string | null;
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
  amount_tendered: number;
  change_due: number;
  balance_due: number;
  note: string | null;
  customer: {
    id: string;
    name: string;
    phone: string | null;
    address: string | null;
  } | null;
  branch: {
    id: string;
    name: string;
    phone: string | null;
    address: string | null;
  } | null;
  cashier_name: string | null;
  items: InvoiceItemRow[];
  payments: InvoicePaymentRow[];
};

type InvoiceQueryRow = {
  id: string;
  invoice_no: string;
  invoice_date: string;
  status: InvoiceListStatus;
  grand_total: number | string | null;
  amount_paid: number | string | null;
  balance_due: number | string | null;
  customers: { name?: string } | { name?: string }[] | null;
};

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export function invoiceLiteralSearchPattern(value: string): string {
  const escaped = value.replace(/[\\%_]/g, "\\$&");
  return `%${escaped}%`;
}

function selectForInvoiceList({
  customerInner,
  paymentInner,
}: {
  customerInner: boolean;
  paymentInner: boolean;
}): string {
  const customerRelation = customerInner
    ? "customers!inner(name)"
    : "customers(name)";
  const paymentRelation = paymentInner
    ? ", payments!inner(method, organization_id)"
    : "";
  return `id, invoice_no, invoice_date, status, grand_total, amount_paid, balance_due,
          ${customerRelation}${paymentRelation}`;
}

async function queryInvoiceRows(
  supabase: SupabaseClient,
  organizationId: string,
  filters: InvoiceListFilters,
  limit: number,
  searchColumn?: "invoice_no" | "customer_name",
): Promise<InvoiceQueryRow[]> {
  const paymentInner = Boolean(filters.paymentMethod);
  let query = supabase
    .from("invoices")
    .select(
      selectForInvoiceList({
        customerInner: searchColumn === "customer_name",
        paymentInner,
      }),
    )
    .eq("organization_id", organizationId);

  if (filters.fromIso) query = query.gte("invoice_date", filters.fromIso);
  if (filters.toIso) query = query.lte("invoice_date", filters.toIso);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.paymentMethod) {
    query = query
      .eq("payments.organization_id", organizationId)
      .eq("payments.method", filters.paymentMethod);
  }
  if (filters.search && searchColumn) {
    const column =
      searchColumn === "invoice_no" ? "invoice_no" : "customers.name";
    query = query.ilike(column, invoiceLiteralSearchPattern(filters.search));
  }

  const { data, error } = await query
    .order("invoice_date", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as InvoiceQueryRow[];
}

function toInvoiceListRow(r: InvoiceQueryRow): InvoiceListRow {
  const c = r.customers as { name?: string } | { name?: string }[] | null;
  const customerName = Array.isArray(c)
    ? (c[0]?.name ?? null)
    : (c?.name ?? null);
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
}

export async function listInvoices(
  organizationId: string,
  filters: InvoiceListFilters = {},
  limit = 100,
): Promise<InvoiceListRow[]> {
  const supabase = await createClient();
  const search = filters.search?.trim();
  const normalizedFilters = { ...filters, search: search || undefined };

  if (!search) {
    const rows = await queryInvoiceRows(
      supabase,
      organizationId,
      normalizedFilters,
      limit,
    );
    return rows.map(toInvoiceListRow);
  }

  // Search is an OR across two separately parameterized database queries. This
  // avoids raw PostgREST filter interpolation while keeping every active filter
  // ahead of each branch limit. The top N of the union must be present in the
  // top N of at least one branch, so merging and applying the final cap is exact.
  const [numberRows, customerRows] = await Promise.all([
    queryInvoiceRows(
      supabase,
      organizationId,
      normalizedFilters,
      limit,
      "invoice_no",
    ),
    queryInvoiceRows(
      supabase,
      organizationId,
      normalizedFilters,
      limit,
      "customer_name",
    ),
  ]);

  const uniqueRows = new Map<string, InvoiceQueryRow>();
  for (const row of [...numberRows, ...customerRows])
    uniqueRows.set(row.id, row);

  return [...uniqueRows.values()]
    .sort(
      (a, b) =>
        new Date(b.invoice_date).getTime() - new Date(a.invoice_date).getTime(),
    )
    .slice(0, limit)
    .map(toInvoiceListRow);
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
       amount_paid, amount_tendered, change_due, balance_due, note, branch_id, created_by,
       customers(id, name, phone, address),
       branches(id, name, phone, address)`,
    )
    .eq("organization_id", organizationId)
    .eq("id", invoiceId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!inv) return null;

  const [items, pays, cashier] = await Promise.all([
    (async () => {
      try {
        const { data, error: itemErr } = await supabase
          .from("invoice_items")
          .select(
            `id, product_name, product_type, quantity, unit_price, item_discount, line_total,
               purchase_price, service_provider, service_direction, service_transaction_amount,
               service_commission, service_total_charged, service_reference_no, service_note`,
          )
          .eq("invoice_id", invoiceId)
          .order("created_at", { ascending: true });
        if (itemErr) {
          console.error(
            "[getInvoiceDetail] invoice_items query failed:",
            itemErr.message,
          );
          return [];
        }
        return data ?? [];
      } catch (err) {
        console.error("[getInvoiceDetail] invoice_items query failed:", err);
        return [];
      }
    })(),
    (async () => {
      try {
        const { data, error: payErr } = await supabase
          .from("payments")
          .select("id, method, amount, reference_no, paid_at")
          .eq("invoice_id", invoiceId)
          .order("paid_at", { ascending: true });
        if (payErr) {
          console.error(
            "[getInvoiceDetail] payments query failed:",
            payErr.message,
          );
          return [];
        }
        return data ?? [];
      } catch (err) {
        console.error("[getInvoiceDetail] payments query failed:", err);
        return [];
      }
    })(),
    (async () => {
      if (!inv.created_by) return { data: null };
      try {
        return await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", inv.created_by)
          .maybeSingle();
      } catch (err) {
        console.error("[getInvoiceDetail] cashier query failed:", err);
        return { data: null };
      }
    })(),
  ]);

  if ("error" in cashier && cashier.error) {
    console.error(
      "[getInvoiceDetail] cashier query failed:",
      cashier.error.message,
    );
  }

  type Joined = {
    id?: string;
    name?: string;
    phone?: string;
    address?: string;
  };
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
    amount_tendered: Number(inv.amount_tendered ?? inv.amount_paid ?? 0),
    change_due: Number(inv.change_due ?? 0),
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
    cashier_name:
      (cashier?.data as { full_name?: string } | null)?.full_name ?? null,
    items: (items ?? []).map((i) => ({
      id: i.id,
      product_name: i.product_name,
      product_type: i.product_type,
      quantity: Number(i.quantity ?? 0),
      unit_price: Number(i.unit_price ?? 0),
      item_discount: Number(i.item_discount ?? 0),
      line_total: Number(i.line_total ?? 0),
      purchase_price: Number(i.purchase_price ?? 0),
      service_provider: i.service_provider,
      service_direction: i.service_direction,
      service_transaction_amount: Number(i.service_transaction_amount ?? 0),
      service_commission: Number(i.service_commission ?? 0),
      service_total_charged: Number(i.service_total_charged ?? 0),
      service_reference_no: i.service_reference_no,
      service_note: i.service_note,
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
  // "Today" = the shop's Asia/Karachi calendar day (server-tz independent).
  const todayStart = getKarachiDayStartIso(getKarachiTodayDateString());

  const [total, todayInvoices, openInvoices] = await Promise.all([
    supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId),
    supabase
      .from("invoices")
      .select("grand_total")
      .eq("organization_id", organizationId)
      .gte("invoice_date", todayStart),
    supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .in("status", ["partial", "unpaid"]),
  ]);

  const todaySalesTotal =
    todayInvoices.data?.reduce((s, r) => s + Number(r.grand_total ?? 0), 0) ??
    0;
  const todayCount = todayInvoices.data?.length ?? 0;

  return {
    invoicesTotal: total.count ?? 0,
    todaySalesTotal,
    todayCount,
    openInvoices: openInvoices.count ?? 0,
  };
}
