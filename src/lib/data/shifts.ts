import "server-only";
import { createClient } from "@/lib/supabase/server";
import { emptyMethodTotals, FINALIZED_INVOICE_STATUSES, type MethodTotals, type PaymentMethodKey, type ExpenseBreakdown } from "./daily-closing";

export type CashShiftRow = {
  id: string;
  organization_id: string;
  branch_id: string;
  opened_at: string;
  closed_at: string | null;
  opened_by: string;
  opened_by_name: string | null;
  closed_by: string | null;
  closed_by_name: string | null;
  starting_cash: number;
  expected_cash: number;
  counted_cash: number | null;
  cash_difference: number | null;
  notes: string | null;
  status: "open" | "closed";
  created_at: string;
  updated_at: string;
};

export type ShiftActivity = {
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

export async function getCurrentShift(
  organizationId: string,
  branchId: string,
): Promise<CashShiftRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cash_shifts")
    .select(
      `id, organization_id, branch_id, opened_at, closed_at, opened_by, closed_by,
       starting_cash, expected_cash, counted_cash, cash_difference, notes, status,
       created_at, updated_at,
       opener:profiles!cash_shifts_opened_by_fkey(full_name),
       closer:profiles!cash_shifts_closed_by_fkey(full_name)`,
    )
    .eq("organization_id", organizationId)
    .eq("branch_id", branchId)
    .eq("status", "open")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return mapRow(data);
}

export async function getShiftHistory(
  organizationId: string,
  branchId: string,
  limit = 20,
): Promise<CashShiftRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cash_shifts")
    .select(
      `id, organization_id, branch_id, opened_at, closed_at, opened_by, closed_by,
       starting_cash, expected_cash, counted_cash, cash_difference, notes, status,
       created_at, updated_at,
       opener:profiles!cash_shifts_opened_by_fkey(full_name),
       closer:profiles!cash_shifts_closed_by_fkey(full_name)`,
    )
    .eq("organization_id", organizationId)
    .eq("branch_id", branchId)
    .order("opened_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapRow);
}

function mapRow(data: Record<string, unknown>): CashShiftRow {
  const opener = data.opener as { full_name?: string } | null;
  const closer = data.closer as { full_name?: string } | null;
  return {
    id: data.id as string,
    organization_id: data.organization_id as string,
    branch_id: data.branch_id as string,
    opened_at: data.opened_at as string,
    closed_at: data.closed_at as string | null,
    opened_by: data.opened_by as string,
    opened_by_name: opener?.full_name ?? null,
    closed_by: data.closed_by as string | null,
    closed_by_name: closer?.full_name ?? null,
    starting_cash: Number(data.starting_cash ?? 0),
    expected_cash: Number(data.expected_cash ?? 0),
    counted_cash: data.counted_cash !== null ? Number(data.counted_cash) : null,
    cash_difference: data.cash_difference !== null ? Number(data.cash_difference) : null,
    notes: data.notes as string | null,
    status: data.status as "open" | "closed",
    created_at: data.created_at as string,
    updated_at: data.updated_at as string,
  };
}

export async function getShiftActivity(
  organizationId: string,
  branchId: string,
  openedAt: string,
  closedAt?: string,
): Promise<ShiftActivity> {
  const supabase = await createClient();
  const end = closedAt ?? new Date().toISOString();

  const invoicesRes = await supabase
    .from("invoices")
    .select("id, grand_total, balance_due")
    .eq("organization_id", organizationId)
    .eq("branch_id", branchId)
    .in("status", FINALIZED_INVOICE_STATUSES)
    .gte("invoice_date", openedAt)
    .lte("invoice_date", end);

  // Payments in the shift window. No invoice_status filter needed:
  // POS checkout creates payments only for finalized invoices; no void/cancel RPC exists.
  const paymentsRes = await supabase
    .from("payments")
    .select("amount, method")
    .eq("organization_id", organizationId)
    .eq("branch_id", branchId)
    .gte("paid_at", openedAt)
    .lte("paid_at", end);

  const returnsRes = await supabase
    .from("returns")
    .select("refund_amount, refund_method, status")
    .eq("organization_id", organizationId)
    .eq("branch_id", branchId)
    .eq("status", "completed")
    .gte("created_at", openedAt)
    .lte("created_at", end);

  const expensesRes = await supabase
    .from("expenses")
    .select("amount, category, payment_method")
    .eq("organization_id", organizationId)
    .eq("branch_id", branchId)
    .eq("status", "active")
    .gte("spent_at", openedAt)
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

  const { creditCollectionCash, creditCollectionDigital, creditWriteOffs } =
    await getShiftCreditCollections(organizationId, branchId, openedAt, end);

  const expectedCash = paymentsByMethod.cash - refundsByMethod.cash - expensesCash + creditCollectionCash;

  return {
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

async function getShiftCreditCollections(
  organizationId: string,
  branchId: string,
  start: string,
  end: string,
): Promise<{ creditCollectionCash: number; creditCollectionDigital: number; creditWriteOffs: number }> {
  const supabase = await createClient();
  const digitalMethods = ["card", "easypaisa", "jazzcash", "bank_transfer"];

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

export type StaffActivity = {
  user_id: string;
  user_name: string | null;
  role: string | null;
  paymentsTotal: number;
  paymentsCash: number;
  paymentsDigital: number;
};

export async function getShiftStaffSummary(
  organizationId: string,
  branchId: string,
  openedAt: string,
  closedAt?: string,
): Promise<StaffActivity[]> {
  const supabase = await createClient();
  const end = closedAt ?? new Date().toISOString();

  // Payments for staff summary. No invoice_status filter needed:
  // POS checkout creates payments only for finalized invoices; no void/cancel RPC exists.
  const paymentsRes = await supabase
    .from("payments")
    .select("amount, method, received_by")
    .eq("organization_id", organizationId)
    .eq("branch_id", branchId)
    .gte("paid_at", openedAt)
    .lte("paid_at", end);

  if (paymentsRes.error) throw new Error(paymentsRes.error.message);

  const digitalMethods = ["card", "easypaisa", "jazzcash", "bank_transfer", "customer_credit"];

  const staffMap = new Map<string, { cash: number; digital: number }>();
  const unassigned = { cash: 0, digital: 0 };

  for (const p of paymentsRes.data ?? []) {
    const amt = Number(p.amount ?? 0);
    const userId = p.received_by as string | null;
    const method = p.method as string;
    const isDigital = digitalMethods.includes(method);

    if (!userId) {
      if (isDigital) unassigned.digital += amt;
      else unassigned.cash += amt;
      continue;
    }

    if (!staffMap.has(userId)) {
      staffMap.set(userId, { cash: 0, digital: 0 });
    }
    const entry = staffMap.get(userId)!;
    if (isDigital) entry.digital += amt;
    else entry.cash += amt;
  }

  // Fetch profiles for all user IDs found
  const userIds = [...staffMap.keys()];
  const profilesRes = userIds.length > 0
    ? await supabase
        .from("profiles")
        .select("id, full_name, role")
        .in("id", userIds)
    : { data: [] };

  const profileMap = new Map<string, { full_name: string | null; role: string | null }>();
  for (const p of (profilesRes.data ?? []) as Array<{ id: string; full_name: string | null; role: string | null }>) {
    profileMap.set(p.id, { full_name: p.full_name, role: p.role });
  }

  const result: StaffActivity[] = [];

  for (const [userId, totals] of staffMap) {
    const profile = profileMap.get(userId);
    const total = totals.cash + totals.digital;
    result.push({
      user_id: userId,
      user_name: profile?.full_name ?? null,
      role: profile?.role ?? null,
      paymentsTotal: total,
      paymentsCash: totals.cash,
      paymentsDigital: totals.digital,
    });
  }

  // Sort by total descending
  result.sort((a, b) => b.paymentsTotal - a.paymentsTotal);

  if (unassigned.cash > 0 || unassigned.digital > 0) {
    const total = unassigned.cash + unassigned.digital;
    result.push({
      user_id: "unassigned",
      user_name: null,
      role: null,
      paymentsTotal: total,
      paymentsCash: unassigned.cash,
      paymentsDigital: unassigned.digital,
    });
  }

  return result;
}
