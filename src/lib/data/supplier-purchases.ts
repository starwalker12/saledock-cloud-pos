import "server-only";
import { createClient } from "@/lib/supabase/server";
import { escapeLike } from "@/lib/security/sanitize";

export type SupplierPurchaseStatus = "unpaid" | "partial" | "paid";

export type SupplierPurchaseRow = {
  id: string;
  purchase_no: string;
  supplier_id: string;
  supplier_name: string | null;
  status: SupplierPurchaseStatus;
  purchase_date: string;
  subtotal: number;
  discount_total: number;
  grand_total: number;
  amount_paid: number;
  balance_due: number;
  reference_no: string | null;
  notes: string | null;
  created_at: string;
  created_by_name: string | null;
};

export type SupplierPurchaseItemRow = {
  id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_cost: number;
  line_total: number;
  stock_lot_id: string | null;
  notes: string | null;
};

export type SupplierPaymentRow = {
  id: string;
  supplier_id: string;
  supplier_name: string | null;
  purchase_id: string | null;
  purchase_no: string | null;
  method: string;
  amount: number;
  reference_no: string | null;
  note: string | null;
  paid_at: string;
  created_by_name: string | null;
};

export type SupplierLedgerEntry = {
  id: string;
  entry_type: "purchase_credit" | "payment_debit" | "adjustment";
  direction: "credit" | "debit";
  amount: number;
  balance_after: number;
  description: string | null;
  reference_number: string | null;
  purchase_id: string | null;
  payment_id: string | null;
  created_at: string;
};

export type SupplierPurchaseFilters = {
  search?: string;
  supplier_id?: string;
  status?: SupplierPurchaseStatus | "all";
  from?: string;
  to?: string;
};

type ProfileLike = { full_name?: string } | { full_name?: string }[] | null;
function nameOf(p: ProfileLike): string | null {
  return Array.isArray(p) ? p[0]?.full_name ?? null : p?.full_name ?? null;
}

export async function listSupplierPurchases(
  organizationId: string,
  filters: SupplierPurchaseFilters = {},
): Promise<SupplierPurchaseRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("supplier_purchases")
    .select(
      `id, purchase_no, supplier_id, status, purchase_date, subtotal, discount_total,
       grand_total, amount_paid, balance_due, reference_no, notes, created_at,
       suppliers(name),
       profiles!supplier_purchases_created_by_fkey(full_name)`,
    )
    .eq("organization_id", organizationId)
    .order("purchase_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (filters.supplier_id) query = query.eq("supplier_id", filters.supplier_id);
  if (filters.status && filters.status !== "all") query = query.eq("status", filters.status);
  if (filters.from) query = query.gte("purchase_date", filters.from);
  if (filters.to) query = query.lte("purchase_date", filters.to);
  if (filters.search) {
    const s = filters.search.replace(/[,()]/g, " ").trim();
    if (s) query = query.or(`purchase_no.ilike.%${escapeLike(s)}%,reference_no.ilike.%${escapeLike(s)}%,notes.ilike.%${escapeLike(s)}%`);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data ?? []).map((r) => {
    const sup = r.suppliers as { name?: string } | { name?: string }[] | null;
    const supName = Array.isArray(sup) ? sup[0]?.name ?? null : sup?.name ?? null;
    return {
      id: r.id,
      purchase_no: r.purchase_no,
      supplier_id: r.supplier_id,
      supplier_name: supName,
      status: r.status as SupplierPurchaseStatus,
      purchase_date: r.purchase_date,
      subtotal: Number(r.subtotal ?? 0),
      discount_total: Number(r.discount_total ?? 0),
      grand_total: Number(r.grand_total ?? 0),
      amount_paid: Number(r.amount_paid ?? 0),
      balance_due: Number(r.balance_due ?? 0),
      reference_no: r.reference_no,
      notes: r.notes,
      created_at: r.created_at,
      created_by_name: nameOf(r.profiles as ProfileLike),
    } satisfies SupplierPurchaseRow;
  });
}

export async function getSupplierPurchase(
  organizationId: string,
  purchaseId: string,
): Promise<{
  purchase: SupplierPurchaseRow;
  items: SupplierPurchaseItemRow[];
  payments: SupplierPaymentRow[];
} | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("supplier_purchases")
    .select(
      `id, purchase_no, supplier_id, status, purchase_date, subtotal, discount_total,
       grand_total, amount_paid, balance_due, reference_no, notes, created_at,
       suppliers(name),
       profiles!supplier_purchases_created_by_fkey(full_name)`,
    )
    .eq("organization_id", organizationId)
    .eq("id", purchaseId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  const sup = data.suppliers as { name?: string } | { name?: string }[] | null;
  const supName = Array.isArray(sup) ? sup[0]?.name ?? null : sup?.name ?? null;

  const purchase: SupplierPurchaseRow = {
    id: data.id,
    purchase_no: data.purchase_no,
    supplier_id: data.supplier_id,
    supplier_name: supName,
    status: data.status as SupplierPurchaseStatus,
    purchase_date: data.purchase_date,
    subtotal: Number(data.subtotal ?? 0),
    discount_total: Number(data.discount_total ?? 0),
    grand_total: Number(data.grand_total ?? 0),
    amount_paid: Number(data.amount_paid ?? 0),
    balance_due: Number(data.balance_due ?? 0),
    reference_no: data.reference_no,
    notes: data.notes,
    created_at: data.created_at,
    created_by_name: nameOf(data.profiles as ProfileLike),
  };

  const { data: itemsData, error: itemsErr } = await supabase
    .from("supplier_purchase_items")
    .select("id, product_id, product_name, quantity, unit_cost, line_total, stock_lot_id, notes")
    .eq("organization_id", organizationId)
    .eq("purchase_id", purchaseId)
    .order("created_at", { ascending: true });
  if (itemsErr) throw new Error(itemsErr.message);

  const items: SupplierPurchaseItemRow[] = (itemsData ?? []).map((r) => ({
    id: r.id,
    product_id: r.product_id,
    product_name: r.product_name,
    quantity: Number(r.quantity ?? 0),
    unit_cost: Number(r.unit_cost ?? 0),
    line_total: Number(r.line_total ?? 0),
    stock_lot_id: r.stock_lot_id,
    notes: r.notes,
  }));

  const { data: paysData, error: paysErr } = await supabase
    .from("supplier_payments")
    .select(
      `id, supplier_id, purchase_id, method, amount, reference_no, note, paid_at,
       suppliers(name),
       supplier_purchases(purchase_no),
       profiles!supplier_payments_created_by_fkey(full_name)`,
    )
    .eq("organization_id", organizationId)
    .eq("purchase_id", purchaseId)
    .order("paid_at", { ascending: false });
  if (paysErr) throw new Error(paysErr.message);

  const payments: SupplierPaymentRow[] = (paysData ?? []).map((r) => {
    const s = r.suppliers as { name?: string } | { name?: string }[] | null;
    const p = r.supplier_purchases as { purchase_no?: string } | { purchase_no?: string }[] | null;
    return {
      id: r.id,
      supplier_id: r.supplier_id,
      supplier_name: Array.isArray(s) ? s[0]?.name ?? null : s?.name ?? null,
      purchase_id: r.purchase_id,
      purchase_no: Array.isArray(p) ? p[0]?.purchase_no ?? null : p?.purchase_no ?? null,
      method: r.method,
      amount: Number(r.amount ?? 0),
      reference_no: r.reference_no,
      note: r.note,
      paid_at: r.paid_at,
      created_by_name: nameOf(r.profiles as ProfileLike),
    };
  });

  return { purchase, items, payments };
}

export async function listSupplierPayments(
  organizationId: string,
  filters: { supplier_id?: string; from?: string; to?: string; limit?: number } = {},
): Promise<SupplierPaymentRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("supplier_payments")
    .select(
      `id, supplier_id, purchase_id, method, amount, reference_no, note, paid_at,
       suppliers(name),
       supplier_purchases(purchase_no),
       profiles!supplier_payments_created_by_fkey(full_name)`,
    )
    .eq("organization_id", organizationId)
    .order("paid_at", { ascending: false });

  if (filters.supplier_id) query = query.eq("supplier_id", filters.supplier_id);
  if (filters.from) query = query.gte("paid_at", filters.from);
  if (filters.to) query = query.lte("paid_at", filters.to);
  if (filters.limit) query = query.limit(filters.limit);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data ?? []).map((r) => {
    const s = r.suppliers as { name?: string } | { name?: string }[] | null;
    const p = r.supplier_purchases as { purchase_no?: string } | { purchase_no?: string }[] | null;
    return {
      id: r.id,
      supplier_id: r.supplier_id,
      supplier_name: Array.isArray(s) ? s[0]?.name ?? null : s?.name ?? null,
      purchase_id: r.purchase_id,
      purchase_no: Array.isArray(p) ? p[0]?.purchase_no ?? null : p?.purchase_no ?? null,
      method: r.method,
      amount: Number(r.amount ?? 0),
      reference_no: r.reference_no,
      note: r.note,
      paid_at: r.paid_at,
      created_by_name: nameOf(r.profiles as ProfileLike),
    };
  });
}

export async function listSupplierLedger(
  organizationId: string,
  supplierId: string,
  filters?: { from?: string; to?: string },
): Promise<SupplierLedgerEntry[]> {
  const supabase = await createClient();
  let query = supabase
    .from("supplier_ledger_entries")
    .select(
      "id, entry_type, direction, amount, balance_after, description, reference_number, purchase_id, payment_id, created_at",
    )
    .eq("organization_id", organizationId)
    .eq("supplier_id", supplierId)
    .order("created_at", { ascending: false });

  if (filters?.from) query = query.gte("created_at", filters.from);
  if (filters?.to) query = query.lte("created_at", filters.to);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data ?? []).map((r) => ({
    id: r.id,
    entry_type: r.entry_type,
    direction: r.direction,
    amount: Number(r.amount ?? 0),
    balance_after: Number(r.balance_after ?? 0),
    description: r.description,
    reference_number: r.reference_number,
    purchase_id: r.purchase_id,
    payment_id: r.payment_id,
    created_at: r.created_at,
  }));
}

export async function getSupplierLedgerOpeningBalance(
  organizationId: string,
  supplierId: string,
  beforeDate: string,
): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("supplier_ledger_entries")
    .select("balance_after")
    .eq("organization_id", organizationId)
    .eq("supplier_id", supplierId)
    .lt("created_at", beforeDate)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? Number(data.balance_after ?? 0) : 0;
}

export type SupplierWithBalance = {
  id: string;
  name: string;
  company: string | null;
  phone: string | null;
  outstanding_balance: number;
  is_active: boolean;
};

export async function listSuppliersWithBalances(
  organizationId: string,
): Promise<SupplierWithBalance[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("suppliers")
    .select("id, name, company, phone, outstanding_balance, is_active")
    .eq("organization_id", organizationId)
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    company: r.company,
    phone: r.phone,
    outstanding_balance: Number(r.outstanding_balance ?? 0),
    is_active: r.is_active,
  }));
}

export type SupplierPurchaseCounts = {
  monthTotal: number;
  monthCount: number;
  unpaidTotal: number;
  unpaidCount: number;
};

export async function supplierPurchaseCounts(
  organizationId: string,
): Promise<SupplierPurchaseCounts> {
  const supabase = await createClient();
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString()
    .slice(0, 10);
  const { data, error } = await supabase
    .from("supplier_purchases")
    .select("grand_total, balance_due, purchase_date")
    .eq("organization_id", organizationId);
  if (error) throw new Error(error.message);
  let monthTotal = 0;
  let monthCount = 0;
  let unpaidTotal = 0;
  let unpaidCount = 0;
  for (const r of data ?? []) {
    const grand = Number(r.grand_total ?? 0);
    const bal = Number(r.balance_due ?? 0);
    if (r.purchase_date >= monthStart) {
      monthTotal += grand;
      monthCount += 1;
    }
    if (bal > 0) {
      unpaidTotal += bal;
      unpaidCount += 1;
    }
  }
  return { monthTotal, monthCount, unpaidTotal, unpaidCount };
}
