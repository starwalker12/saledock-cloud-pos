import "server-only";
import { createClient } from "@/lib/supabase/server";

export type CustomerRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  credit_limit: number;
  outstanding_balance: number;
  is_archived: boolean;
};

export type CustomerInvoice = {
  id: string;
  invoice_no: string;
  invoice_date: string;
  status: "draft" | "paid" | "partial" | "unpaid" | "void";
  grand_total: number;
  amount_paid: number;
  balance_due: number;
};

export type CustomerLedgerEntry = {
  id: string;
  entry_type: "invoice_credit" | "credit_payment" | "adjustment" | "refund" | "opening_balance" | "write_off";
  direction: "debit" | "credit";
  amount: number;
  balance_after: number;
  description: string | null;
  reference_number: string | null;
  created_at: string;
  invoice_id: string | null;
  invoice_no: string | null;
};

export type CustomerReturn = {
  id: string;
  return_no: string;
  created_at: string;
  status: string;
  subtotal: number;
  refund_amount: number;
  refund_method: string | null;
  reference_number: string | null;
  invoice_id: string;
  invoice_no: string | null;
};

export type CustomerCreditPayment = {
  id: string;
  amount: number;
  method: string;
  reference_number: string | null;
  notes: string | null;
  created_at: string;
  received_by_name: string | null;
};

export async function listCustomers(organizationId: string): Promise<CustomerRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .select("id, name, phone, email, address, notes, credit_limit, outstanding_balance, is_archived")
    .eq("organization_id", organizationId)
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    phone: r.phone,
    email: r.email,
    address: r.address,
    notes: r.notes,
    credit_limit: Number(r.credit_limit ?? 0),
    outstanding_balance: Number(r.outstanding_balance ?? 0),
    is_archived: r.is_archived,
  })) satisfies CustomerRow[];
}

export async function getCustomerDetail(
  customerId: string,
  organizationId: string,
): Promise<CustomerRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .select("id, name, phone, email, address, notes, credit_limit, outstanding_balance, is_archived")
    .eq("organization_id", organizationId)
    .eq("id", customerId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    id: data.id,
    name: data.name,
    phone: data.phone,
    email: data.email,
    address: data.address,
    notes: data.notes,
    credit_limit: Number(data.credit_limit ?? 0),
    outstanding_balance: Number(data.outstanding_balance ?? 0),
    is_archived: data.is_archived,
  } satisfies CustomerRow;
}

export async function listCustomerInvoices(
  customerId: string,
  organizationId: string,
): Promise<CustomerInvoice[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invoices")
    .select("id, invoice_no, invoice_date, status, grand_total, amount_paid, balance_due")
    .eq("organization_id", organizationId)
    .eq("customer_id", customerId)
    .order("invoice_date", { ascending: false });
  if (error) throw new Error(error.message);

  return (data ?? []).map((r) => ({
    id: r.id,
    invoice_no: r.invoice_no,
    invoice_date: r.invoice_date,
    status: r.status,
    grand_total: Number(r.grand_total ?? 0),
    amount_paid: Number(r.amount_paid ?? 0),
    balance_due: Number(r.balance_due ?? 0),
  })) satisfies CustomerInvoice[];
}

export async function listCustomerLedger(
  customerId: string,
  organizationId: string,
): Promise<CustomerLedgerEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customer_ledger_entries")
    .select(`
      id, entry_type, direction, amount, balance_after, description, reference_number, created_at, invoice_id,
      invoices(invoice_no)
    `)
    .eq("organization_id", organizationId)
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  return (data ?? []).map((r) => {
    const invs = r.invoices as { invoice_no?: string } | { invoice_no?: string }[] | null;
    const invoiceNo = Array.isArray(invs) ? invs[0]?.invoice_no ?? null : invs?.invoice_no ?? null;

    return {
      id: r.id,
      entry_type: r.entry_type,
      direction: r.direction,
      amount: Number(r.amount ?? 0),
      balance_after: Number(r.balance_after ?? 0),
      description: r.description,
      reference_number: r.reference_number,
      created_at: r.created_at,
      invoice_id: r.invoice_id,
      invoice_no: invoiceNo,
    } satisfies CustomerLedgerEntry;
  });
}

export async function listCustomerReturns(
  customerId: string,
  organizationId: string,
): Promise<CustomerReturn[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("returns")
    .select(`
      id, return_no, created_at, status, subtotal, refund_amount, refund_method,
      reference_number, invoice_id, invoices(invoice_no)
    `)
    .eq("organization_id", organizationId)
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  return (data ?? []).map((r) => {
    const invs = r.invoices as { invoice_no?: string } | { invoice_no?: string }[] | null;
    const invoiceNo = Array.isArray(invs) ? invs[0]?.invoice_no ?? null : invs?.invoice_no ?? null;

    return {
      id: r.id,
      return_no: r.return_no,
      created_at: r.created_at,
      status: r.status,
      subtotal: Number(r.subtotal ?? 0),
      refund_amount: Number(r.refund_amount ?? 0),
      refund_method: r.refund_method,
      reference_number: r.reference_number,
      invoice_id: r.invoice_id,
      invoice_no: invoiceNo,
    } satisfies CustomerReturn;
  });
}

export async function listCustomerCreditPayments(
  customerId: string,
  organizationId: string,
): Promise<CustomerCreditPayment[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("credit_payments")
    .select(`
      id, amount, method, reference_number, notes, created_at, received_by,
      profiles(full_name)
    `)
    .eq("organization_id", organizationId)
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  return (data ?? []).map((r) => {
    const profs = r.profiles as { full_name?: string } | { full_name?: string }[] | null;
    const cashierName = Array.isArray(profs) ? profs[0]?.full_name ?? null : profs?.full_name ?? null;

    return {
      id: r.id,
      amount: Number(r.amount ?? 0),
      method: r.method,
      reference_number: r.reference_number,
      notes: r.notes,
      created_at: r.created_at,
      received_by_name: cashierName,
    } satisfies CustomerCreditPayment;
  });
}
