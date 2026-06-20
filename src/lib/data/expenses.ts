import "server-only";
import { createClient } from "@/lib/supabase/server";
import { escapeLike } from "@/lib/security/sanitize";
import { getKarachiDayStartIso, getKarachiMonthStartDate, getKarachiTodayDateString } from "@/lib/datetime";

export type ExpenseRow = {
  id: string;
  category: string;
  amount: number;
  payment_method: string;
  vendor_name: string | null;
  notes: string | null;
  status: "active" | "archived";
  spent_at: string;
  created_by: string | null;
  created_by_name: string | null;
};

export type ExpenseFilters = {
  search?: string;
  category?: string;
  payment_method?: string;
  from?: string; // ISO
  to?: string;   // ISO
  includeArchived?: boolean;
};

export async function listExpenses(
  organizationId: string,
  filters: ExpenseFilters = {},
): Promise<ExpenseRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("expenses")
    .select(
      `id, category, amount, payment_method, vendor_name, notes, status, spent_at, created_by,
       profiles!expenses_created_by_fkey(full_name)`,
    )
    .eq("organization_id", organizationId)
    .order("spent_at", { ascending: false });

  if (!filters.includeArchived) query = query.eq("status", "active");
  if (filters.category) query = query.eq("category", filters.category);
  if (filters.payment_method) query = query.eq("payment_method", filters.payment_method);
  if (filters.from) query = query.gte("spent_at", filters.from);
  if (filters.to) query = query.lte("spent_at", filters.to);
  if (filters.search) {
    const s = filters.search.replace(/[,()]/g, " ").trim();
    if (s) query = query.or(`category.ilike.%${escapeLike(s)}%,vendor_name.ilike.%${escapeLike(s)}%,notes.ilike.%${escapeLike(s)}%`);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data ?? []).map((r) => {
    const profs = r.profiles as { full_name?: string } | { full_name?: string }[] | null;
    const fullName = Array.isArray(profs) ? profs[0]?.full_name ?? null : profs?.full_name ?? null;
    return {
      id: r.id,
      category: r.category,
      amount: Number(r.amount ?? 0),
      payment_method: r.payment_method,
      vendor_name: r.vendor_name,
      notes: r.notes,
      status: r.status,
      spent_at: r.spent_at,
      created_by: r.created_by,
      created_by_name: fullName,
    } satisfies ExpenseRow;
  });
}

export async function getExpense(
  organizationId: string,
  expenseId: string,
): Promise<ExpenseRow | null> {
  const list = await listExpenses(organizationId, { includeArchived: true });
  return list.find((e) => e.id === expenseId) ?? null;
}

export async function listExpenseCategories(
  organizationId: string,
): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("expenses")
    .select("category")
    .eq("organization_id", organizationId);
  if (error) throw new Error(error.message);
  const set = new Set<string>();
  for (const r of data ?? []) if (r.category) set.add(r.category as string);
  return [...set].sort((a, b) => a.localeCompare(b));
}

export type ExpenseCounts = {
  todayTotal: number;
  todayCount: number;
  monthTotal: number;
  monthCount: number;
  topCategoryThisMonth: { name: string; total: number } | null;
  latest: { id: string; category: string; amount: number; spent_at: string } | null;
};

export async function expenseCounts(organizationId: string): Promise<ExpenseCounts> {
  const supabase = await createClient();
  // "Today" / "this month" use the shop's Asia/Karachi calendar (server-tz independent).
  const todayDate = getKarachiTodayDateString();
  const todayStart = new Date(getKarachiDayStartIso(todayDate));
  const monthStart = new Date(getKarachiDayStartIso(getKarachiMonthStartDate(todayDate)));

  const { data, error } = await supabase
    .from("expenses")
    .select("id, category, amount, spent_at")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .gte("spent_at", monthStart.toISOString())
    .order("spent_at", { ascending: false });
  if (error) throw new Error(error.message);

  const rows = (data ?? []).map((r) => ({
    id: r.id as string,
    category: r.category as string,
    amount: Number(r.amount ?? 0),
    spent_at: r.spent_at as string,
  }));

  let todayTotal = 0;
  let todayCount = 0;
  let monthTotal = 0;
  const byCategory = new Map<string, number>();
  for (const r of rows) {
    monthTotal += r.amount;
    byCategory.set(r.category, (byCategory.get(r.category) ?? 0) + r.amount);
    if (new Date(r.spent_at) >= todayStart) {
      todayTotal += r.amount;
      todayCount += 1;
    }
  }

  let topCategoryThisMonth: { name: string; total: number } | null = null;
  for (const [name, total] of byCategory) {
    if (!topCategoryThisMonth || total > topCategoryThisMonth.total) {
      topCategoryThisMonth = { name, total };
    }
  }

  return {
    todayTotal,
    todayCount,
    monthTotal,
    monthCount: rows.length,
    topCategoryThisMonth,
    latest: rows[0]
      ? { id: rows[0].id, category: rows[0].category, amount: rows[0].amount, spent_at: rows[0].spent_at }
      : null,
  };
}
