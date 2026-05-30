import "server-only";
import { createClient } from "@/lib/supabase/server";

export type PaymentMethodKey =
  | "cash"
  | "card"
  | "easypaisa"
  | "jazzcash"
  | "bank_transfer"
  | "customer_credit";

export type MethodTotals = Record<PaymentMethodKey, number>;

export const PAYMENT_METHOD_ORDER: PaymentMethodKey[] = [
  "cash",
  "card",
  "easypaisa",
  "jazzcash",
  "bank_transfer",
  "customer_credit",
];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethodKey, string> = {
  cash: "Cash",
  card: "Card",
  easypaisa: "EasyPaisa",
  jazzcash: "JazzCash",
  bank_transfer: "Bank transfer",
  customer_credit: "Customer credit",
};

export type ExpenseBreakdown = { category: string; amount: number };

export type DayActivity = {
  branchId: string;
  date: string; // yyyy-mm-dd
  invoicesCount: number;
  grossSales: number;
  paymentsByMethod: MethodTotals;
  paymentsTotal: number;
  refundsCount: number;
  refundsTotal: number;
  refundsByMethod: MethodTotals;
  expensesTotal: number;
  expensesCash: number;
  expensesByCategory: ExpenseBreakdown[];
  creditPending: number;
  expectedCash: number;
  creditCollectionCash: number;
  creditCollectionDigital: number;
  creditWriteOffs: number;
};

export type DailyClosingRow = {
  id: string;
  organization_id: string;
  branch_id: string;
  closing_date: string;
  bills_count: number;
  cash_sales: number;
  digital_payments: number;
  credit_pending: number;
  expenses_total: number;
  refunds_total: number;
  expected_closing_cash: number;
  actual_closing_cash: number;
  cash_difference: number;
  credit_collection_cash: number;
  credit_collection_digital: number;
  credit_write_offs: number;
  notes: string | null;
  finalized_by: string | null;
  finalized_by_name: string | null;
  finalized_at: string | null;
  created_at: string;
  updated_at: string;
};

function dayBounds(date: string): { start: string; end: string } {
  // Treat the date as the local calendar day; convert to UTC ISO bounds.
  const start = new Date(`${date}T00:00:00`);
  const end = new Date(`${date}T23:59:59.999`);
  return { start: start.toISOString(), end: end.toISOString() };
}

export function emptyMethodTotals(): MethodTotals {
  return {
    cash: 0,
    card: 0,
    easypaisa: 0,
    jazzcash: 0,
    bank_transfer: 0,
    customer_credit: 0,
  };
}

export async function getDayActivity(
  organizationId: string,
  branchId: string,
  date: string,
): Promise<DayActivity> {
  const supabase = await createClient();
  const { start, end } = dayBounds(date);

  // Invoices in the day: gross sales + count + credit pending.
  const invoicesRes = await supabase
    .from("invoices")
    .select("id, grand_total, balance_due")
    .eq("organization_id", organizationId)
    .eq("branch_id", branchId)
    .gte("invoice_date", start)
    .lte("invoice_date", end);

  // Payments received in the day, by method (independent of invoice_date — captures partial payments on older invoices).
  const paymentsRes = await supabase
    .from("payments")
    .select("amount, method")
    .eq("organization_id", organizationId)
    .eq("branch_id", branchId)
    .gte("paid_at", start)
    .lte("paid_at", end);

  // Returns in the day (cash impact = refund_amount where refund_method='cash').
  const returnsRes = await supabase
    .from("returns")
    .select("refund_amount, refund_method, status")
    .eq("organization_id", organizationId)
    .eq("branch_id", branchId)
    .eq("status", "completed")
    .gte("created_at", start)
    .lte("created_at", end);

  // Expenses in the day.
  const expensesRes = await supabase
    .from("expenses")
    .select("amount, category, payment_method")
    .eq("organization_id", organizationId)
    .eq("branch_id", branchId)
    .eq("status", "active")
    .gte("spent_at", start)
    .lte("spent_at", end);

  if (invoicesRes.error) throw new Error(invoicesRes.error.message);
  if (paymentsRes.error) throw new Error(paymentsRes.error.message);
  if (returnsRes.error) throw new Error(returnsRes.error.message);
  if (expensesRes.error) throw new Error(expensesRes.error.message);

  const invoices = invoicesRes.data ?? [];
  const grossSales = invoices.reduce((s, r) => s + Number(r.grand_total ?? 0), 0);
  const creditPending = invoices.reduce((s, r) => s + Number(r.balance_due ?? 0), 0);

  const paymentsByMethod = emptyMethodTotals();
  for (const p of paymentsRes.data ?? []) {
    const m = p.method as PaymentMethodKey;
    if (m in paymentsByMethod) paymentsByMethod[m] += Number(p.amount ?? 0);
  }
  const paymentsTotal = Object.values(paymentsByMethod).reduce((a, b) => a + b, 0);

  const refundsByMethod = emptyMethodTotals();
  let refundsTotal = 0;
  for (const r of returnsRes.data ?? []) {
    const amount = Number(r.refund_amount ?? 0);
    refundsTotal += amount;
    const m = r.refund_method as PaymentMethodKey | null;
    if (m && m in refundsByMethod) refundsByMethod[m] += amount;
  }

  const expensesByCategoryMap = new Map<string, number>();
  let expensesTotal = 0;
  let expensesCash = 0;
  for (const e of expensesRes.data ?? []) {
    const amount = Number(e.amount ?? 0);
    expensesTotal += amount;
    expensesByCategoryMap.set(e.category, (expensesByCategoryMap.get(e.category) ?? 0) + amount);
    if (e.payment_method === "cash") expensesCash += amount;
  }
  const expensesByCategory: ExpenseBreakdown[] = [...expensesByCategoryMap]
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);

  const { creditCollectionCash, creditCollectionDigital, creditWriteOffs } = await getCreditCollections(organizationId, branchId, date);

  const expectedCash = paymentsByMethod.cash - refundsByMethod.cash - expensesCash + creditCollectionCash;

  return {
    branchId,
    date,
    invoicesCount: invoices.length,
    grossSales,
    paymentsByMethod,
    paymentsTotal,
    refundsCount: (returnsRes.data ?? []).length,
    refundsTotal,
    refundsByMethod,
    expensesTotal,
    expensesCash,
    expensesByCategory,
    creditPending,
    expectedCash,
    creditCollectionCash,
    creditCollectionDigital,
    creditWriteOffs,
  };
}

export async function getCreditCollections(
  organizationId: string,
  branchId: string,
  date: string,
): Promise<{ creditCollectionCash: number; creditCollectionDigital: number; creditWriteOffs: number }> {
  const supabase = await createClient();
  const { start, end } = dayBounds(date);

  const digitalMethods = ["card", "easypaisa", "jazzcash", "bank_transfer"];

  // Credit payment settlements for this day
  const cpRes = await supabase
    .from("credit_payments")
    .select("amount, method")
    .eq("organization_id", organizationId)
    .eq("branch_id", branchId)
    .gte("created_at", start)
    .lte("created_at", end);

  let creditCollectionCash = 0;
  let creditCollectionDigital = 0;

  for (const cp of cpRes.data ?? []) {
    const amt = Number(cp.amount ?? 0);
    if (digitalMethods.includes(cp.method)) {
      creditCollectionDigital += amt;
    } else {
      creditCollectionCash += amt;
    }
  }

  // Write-offs for this day
  const woRes = await supabase
    .from("customer_write_offs")
    .select("amount")
    .eq("organization_id", organizationId)
    .eq("branch_id", branchId)
    .gte("created_at", start)
    .lte("created_at", end);

  const creditWriteOffs = (woRes.data ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0);

  return { creditCollectionCash, creditCollectionDigital, creditWriteOffs };
}

export async function getClosing(
  organizationId: string,
  branchId: string,
  date: string,
): Promise<DailyClosingRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("daily_closings")
    .select(
      `id, organization_id, branch_id, closing_date, bills_count, cash_sales, digital_payments,
       credit_pending, expenses_total, refunds_total, expected_closing_cash, actual_closing_cash,
       cash_difference, credit_collection_cash, credit_collection_digital, credit_write_offs,
       notes, finalized_by, finalized_at, created_at, updated_at,
       profiles!daily_closings_finalized_by_fkey(full_name)`,
    )
    .eq("organization_id", organizationId)
    .eq("branch_id", branchId)
    .eq("closing_date", date)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const profs = data.profiles as { full_name?: string } | { full_name?: string }[] | null;
  const name = Array.isArray(profs) ? profs[0]?.full_name ?? null : profs?.full_name ?? null;
  return {
    id: data.id,
    organization_id: data.organization_id,
    branch_id: data.branch_id,
    closing_date: data.closing_date,
    bills_count: Number(data.bills_count ?? 0),
    cash_sales: Number(data.cash_sales ?? 0),
    digital_payments: Number(data.digital_payments ?? 0),
    credit_pending: Number(data.credit_pending ?? 0),
    expenses_total: Number(data.expenses_total ?? 0),
    refunds_total: Number(data.refunds_total ?? 0),
    expected_closing_cash: Number(data.expected_closing_cash ?? 0),
    actual_closing_cash: Number(data.actual_closing_cash ?? 0),
    cash_difference: Number(data.cash_difference ?? 0),
    credit_collection_cash: Number(data.credit_collection_cash ?? 0),
    credit_collection_digital: Number(data.credit_collection_digital ?? 0),
    credit_write_offs: Number(data.credit_write_offs ?? 0),
    notes: data.notes,
    finalized_by: data.finalized_by,
    finalized_by_name: name,
    finalized_at: data.finalized_at,
    created_at: data.created_at,
    updated_at: data.updated_at,
  };
}

export type RecentClosing = {
  id: string;
  closing_date: string;
  bills_count: number;
  cash_sales: number;
  expected_closing_cash: number;
  actual_closing_cash: number;
  cash_difference: number;
  is_closed: boolean;
  finalized_at: string | null;
  finalized_by_name: string | null;
};

export async function listRecentClosings(
  organizationId: string,
  branchId: string,
  limit = 14,
): Promise<RecentClosing[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("daily_closings")
    .select(
      `id, closing_date, bills_count, cash_sales, expected_closing_cash, actual_closing_cash,
       cash_difference, finalized_at, finalized_by,
       profiles!daily_closings_finalized_by_fkey(full_name)`,
    )
    .eq("organization_id", organizationId)
    .eq("branch_id", branchId)
    .order("closing_date", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => {
    const profs = r.profiles as { full_name?: string } | { full_name?: string }[] | null;
    const name = Array.isArray(profs) ? profs[0]?.full_name ?? null : profs?.full_name ?? null;
    return {
      id: r.id,
      closing_date: r.closing_date,
      bills_count: Number(r.bills_count ?? 0),
      cash_sales: Number(r.cash_sales ?? 0),
      expected_closing_cash: Number(r.expected_closing_cash ?? 0),
      actual_closing_cash: Number(r.actual_closing_cash ?? 0),
      cash_difference: Number(r.cash_difference ?? 0),
      is_closed: Boolean(r.finalized_by),
      finalized_at: r.finalized_at,
      finalized_by_name: name,
    } satisfies RecentClosing;
  });
}

export function todayLocalDate(): string {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}
