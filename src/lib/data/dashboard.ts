import "server-only";
import { createClient } from "@/lib/supabase/server";
import { FINALIZED_INVOICE_STATUSES } from "./daily-closing";

export type TopProduct = {
  productName: string;
  quantity: number;
  revenue: number;
};

export type DashboardSummary = {
  todayProfit: number;
  grossSales: number;
  returnsTotal: number;
  returnsCount: number;
  expensesTotal: number;
  lowStockCount: number;
  topSellingProducts: TopProduct[];
  pendingRepairsCount: number;
  supplierDuesTotal: number;
  customerDuesTotal: number;
};

function todayBounds(): { start: string; end: string } {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60_000;
  const localDate = new Date(d.getTime() - tz).toISOString().slice(0, 10);
  const start = new Date(`${localDate}T00:00:00`);
  const end = new Date(`${localDate}T23:59:59.999`);
  return { start: start.toISOString(), end: end.toISOString() };
}

function last7DaysBounds(): { start: string; end: string } {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60_000;
  const localDate = new Date(d.getTime() - tz).toISOString().slice(0, 10);
  const start = new Date(`${localDate}T00:00:00`);
  start.setDate(start.getDate() - 6);
  const end = new Date(`${localDate}T23:59:59.999`);
  return { start: start.toISOString(), end: end.toISOString() };
}

export async function getDashboardSummary(
  organizationId: string,
  branchId: string | null,
): Promise<DashboardSummary> {
  const supabase = await createClient();
  const { start: todayStart, end: todayEnd } = todayBounds();

  // Today's finalized invoices
  let invoicesQuery = supabase
    .from("invoices")
    .select("id, grand_total")
    .eq("organization_id", organizationId)
    .in("status", FINALIZED_INVOICE_STATUSES)
    .gte("invoice_date", todayStart)
    .lte("invoice_date", todayEnd);
  if (branchId) {
    invoicesQuery = invoicesQuery.eq("branch_id", branchId);
  }

  // Today's completed returns
  let returnsQuery = supabase
    .from("returns")
    .select("refund_amount")
    .eq("organization_id", organizationId)
    .eq("status", "completed")
    .gte("created_at", todayStart)
    .lte("created_at", todayEnd);
  if (branchId) {
    returnsQuery = returnsQuery.eq("branch_id", branchId);
  }

  // Today's active expenses
  let expensesQuery = supabase
    .from("expenses")
    .select("amount")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .gte("spent_at", todayStart)
    .lte("spent_at", todayEnd);
  if (branchId) {
    expensesQuery = expensesQuery.eq("branch_id", branchId);
  }

  // Low stock products (org-wide)
  const lowStockQuery = supabase
    .from("products")
    .select("stock_quantity, minimum_stock")
    .eq("organization_id", organizationId)
    .eq("type", "product");

  // Pending repairs
  let repairsQuery = supabase
    .from("repairs")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .in("status", ["received", "waiting_for_parts", "in_progress"]);
  if (branchId) {
    repairsQuery = repairsQuery.eq("branch_id", branchId);
  }

  // Customer dues (org-wide)
  const customerDuesQuery = supabase
    .from("customers")
    .select("outstanding_balance")
    .eq("organization_id", organizationId)
    .gt("outstanding_balance", 0);

  // Supplier dues (org-wide)
  const supplierDuesQuery = supabase
    .from("suppliers")
    .select("outstanding_balance")
    .eq("organization_id", organizationId)
    .gt("outstanding_balance", 0);

  const [
    invoicesRes,
    returnsRes,
    expensesRes,
    lowStockRes,
    repairsRes,
    customerDuesRes,
    supplierDuesRes,
  ] = await Promise.all([
    invoicesQuery,
    returnsQuery,
    expensesQuery,
    lowStockQuery,
    repairsQuery,
    customerDuesQuery,
    supplierDuesQuery,
  ]);

  if (invoicesRes.error) throw new Error(invoicesRes.error.message);
  if (returnsRes.error) throw new Error(returnsRes.error.message);
  if (expensesRes.error) throw new Error(expensesRes.error.message);
  if (customerDuesRes.error) throw new Error(customerDuesRes.error.message);
  if (supplierDuesRes.error) throw new Error(supplierDuesRes.error.message);

  const invoices = invoicesRes.data ?? [];
  const grossSales = invoices.reduce((s, r) => s + Number(r.grand_total ?? 0), 0);

  const returns = returnsRes.data ?? [];
  const returnsTotal = returns.reduce((s, r) => s + Number(r.refund_amount ?? 0), 0);
  const returnsCount = returns.length;

  const expenses = expensesRes.data ?? [];
  const expensesTotal = expenses.reduce((s, r) => s + Number(r.amount ?? 0), 0);

  const lowStockCount =
    lowStockRes.data?.filter(
      (p) => Number(p.stock_quantity ?? 0) <= Number(p.minimum_stock ?? 0),
    ).length ?? 0;

  const pendingRepairsCount = repairsRes.count ?? 0;

  const customerDuesTotal =
    customerDuesRes.data?.reduce((s, r) => s + Number(r.outstanding_balance ?? 0), 0) ?? 0;

  const supplierDuesTotal =
    supplierDuesRes.data?.reduce((s, r) => s + Number(r.outstanding_balance ?? 0), 0) ?? 0;

  // Profit and top-selling from today's invoice items
  const invoiceIds = invoices.map((r) => r.id);
  let profitFromItems = 0;
  let topSellingProducts: TopProduct[] = [];

  if (invoiceIds.length > 0) {
    const itemsRes = await supabase
      .from("invoice_items")
      .select("product_name, product_type, quantity, purchase_price, line_total")
      .in("invoice_id", invoiceIds);

    if (!itemsRes.error && itemsRes.data) {
      const productMap = new Map<string, { quantity: number; revenue: number }>();
      for (const item of itemsRes.data) {
        const qty = Number(item.quantity ?? 0);
        const rev = Number(item.line_total ?? 0);
        if (item.product_type === "product") {
          const cost = Number(item.purchase_price ?? 0) * qty;
          profitFromItems += rev - cost;
        }
        const name = item.product_name as string;
        const existing = productMap.get(name);
        if (existing) {
          existing.quantity += qty;
          existing.revenue += rev;
        } else {
          productMap.set(name, { quantity: qty, revenue: rev });
        }
      }
      topSellingProducts = [...productMap.entries()]
        .map(([n, { quantity, revenue }]) => ({ productName: n, quantity, revenue }))
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 5);
    }
  }

  // Fallback to last 7 days if no sales today
  if (topSellingProducts.length === 0) {
    const { start: weekStart, end: weekEnd } = last7DaysBounds();
    let weekQuery = supabase
      .from("invoices")
      .select("id")
      .eq("organization_id", organizationId)
      .in("status", FINALIZED_INVOICE_STATUSES)
      .gte("invoice_date", weekStart)
      .lte("invoice_date", weekEnd);
    if (branchId) {
      weekQuery = weekQuery.eq("branch_id", branchId);
    }
    const weekRes = await weekQuery;
    const weekIds = (weekRes.data ?? []).map((r) => r.id);
    if (weekIds.length > 0) {
      const weekItemsRes = await supabase
        .from("invoice_items")
        .select("product_name, quantity, line_total")
        .in("invoice_id", weekIds);
      if (!weekItemsRes.error && weekItemsRes.data) {
        const productMap = new Map<string, { quantity: number; revenue: number }>();
        for (const item of weekItemsRes.data) {
          const name = item.product_name as string;
          const qty = Number(item.quantity ?? 0);
          const rev = Number(item.line_total ?? 0);
          const existing = productMap.get(name);
          if (existing) {
            existing.quantity += qty;
            existing.revenue += rev;
          } else {
            productMap.set(name, { quantity: qty, revenue: rev });
          }
        }
        topSellingProducts = [...productMap.entries()]
          .map(([n, { quantity, revenue }]) => ({ productName: n, quantity, revenue }))
          .sort((a, b) => b.quantity - a.quantity)
          .slice(0, 5);
      }
    }
  }

  const todayProfit = profitFromItems - expensesTotal - returnsTotal;

  return {
    todayProfit,
    grossSales,
    returnsTotal,
    returnsCount,
    expensesTotal,
    lowStockCount,
    topSellingProducts,
    pendingRepairsCount,
    customerDuesTotal,
    supplierDuesTotal,
  };
}

// ── Phase 2 analytics ────────────────────────────────────────────────────────
// Read-only, organization-scoped breakdowns for the dashboard chart widgets.
// Every query mirrors the trusted scoping already used in reports.ts /
// getDashboardSummary (organization_id, branch where applicable, the same status
// filters). Nothing here mutates data or invents a money formula — each value is
// a count or a sum of an existing trusted column. Each section fails soft (an
// empty result) so one unavailable query can never crash the dashboard.

export type LabelledDatum = { label: string; value: number };

export type DashboardAnalytics = {
  invoiceStatus: { paid: number; partial: number; unpaid: number };
  avgOrderValue: { total: number; count: number; average: number };
  paymentMethods: LabelledDatum[];
  expenseCategories: LabelledDatum[];
  repairStatuses: LabelledDatum[];
  salesByWeekday: LabelledDatum[];
  topCustomerDues: LabelledDatum[];
  stockByCategory: LabelledDatum[];
};

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function sortDescTopN(map: Map<string, number>, limit: number): LabelledDatum[] {
  return [...map.entries()]
    .map(([label, value]) => ({ label, value }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

export async function getDashboardAnalytics(
  organizationId: string,
  branchId: string | null,
): Promise<DashboardAnalytics> {
  const supabase = await createClient();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0).toISOString();
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).toISOString();
  const repairsSince = new Date(now);
  repairsSince.setDate(repairsSince.getDate() - 90);
  repairsSince.setHours(0, 0, 0, 0);
  const weekdaySince = new Date(now);
  weekdaySince.setDate(weekdaySince.getDate() - 55); // ~8 weeks
  weekdaySince.setHours(0, 0, 0, 0);

  // Finalized, non-void invoices this month → status breakdown + average order value.
  let invoicesQuery = supabase
    .from("invoices")
    .select("status, grand_total")
    .eq("organization_id", organizationId)
    .neq("status", "void")
    .neq("status", "draft")
    .gte("invoice_date", monthStart)
    .lte("invoice_date", monthEnd);
  if (branchId) invoicesQuery = invoicesQuery.eq("branch_id", branchId);

  let paymentsQuery = supabase
    .from("payments")
    .select("amount, method")
    .eq("organization_id", organizationId)
    .gte("paid_at", monthStart)
    .lte("paid_at", monthEnd);
  if (branchId) paymentsQuery = paymentsQuery.eq("branch_id", branchId);

  let expensesQuery = supabase
    .from("expenses")
    .select("amount, category")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .gte("spent_at", monthStart)
    .lte("spent_at", monthEnd);
  if (branchId) expensesQuery = expensesQuery.eq("branch_id", branchId);

  let repairsQuery = supabase
    .from("repairs")
    .select("status")
    .eq("organization_id", organizationId)
    .gte("created_at", repairsSince.toISOString());
  if (branchId) repairsQuery = repairsQuery.eq("branch_id", branchId);

  // Customer dues are an org-wide current snapshot (matches the existing
  // customer-dues widget, which is not branch-scoped).
  const customersQuery = supabase
    .from("customers")
    .select("name, outstanding_balance")
    .eq("organization_id", organizationId)
    .gt("outstanding_balance", 0)
    .order("outstanding_balance", { ascending: false })
    .limit(12);

  const productsQuery = supabase
    .from("products")
    .select("category, stock_quantity")
    .eq("organization_id", organizationId)
    .eq("type", "product");

  const salesByDayQuery = supabase.rpc("get_sales_by_day", {
    p_org_id: organizationId,
    p_branch_id: branchId ?? null,
    p_start_date: weekdaySince.toISOString(),
    p_end_date: now.toISOString(),
  });

  const [invRes, payRes, expRes, repRes, custRes, prodRes, sbdRes] = await Promise.all([
    invoicesQuery,
    paymentsQuery,
    expensesQuery,
    repairsQuery,
    customersQuery,
    productsQuery,
    salesByDayQuery,
  ]);

  // Invoice status + average order value.
  const invoices = (invRes.data ?? []) as { status: string; grand_total: number | null }[];
  let paid = 0;
  let partial = 0;
  let unpaid = 0;
  let aovTotal = 0;
  for (const inv of invoices) {
    const total = Number(inv.grand_total ?? 0);
    aovTotal += total;
    if (inv.status === "paid") paid += 1;
    else if (inv.status === "partial") partial += 1;
    else if (inv.status === "unpaid") unpaid += 1;
  }
  const aovCount = invoices.length;

  // Payment method split.
  const methodMap = new Map<string, number>();
  for (const p of (payRes.data ?? []) as { amount: number | null; method: string | null }[]) {
    const key = p.method || "Other";
    methodMap.set(key, (methodMap.get(key) ?? 0) + Number(p.amount ?? 0));
  }

  // Expense categories.
  const expenseMap = new Map<string, number>();
  for (const e of (expRes.data ?? []) as { amount: number | null; category: string | null }[]) {
    const key = e.category || "Uncategorized";
    expenseMap.set(key, (expenseMap.get(key) ?? 0) + Number(e.amount ?? 0));
  }

  // Repair status counts.
  const repairMap = new Map<string, number>();
  for (const r of (repRes.data ?? []) as { status: string | null }[]) {
    const key = r.status || "unknown";
    repairMap.set(key, (repairMap.get(key) ?? 0) + 1);
  }

  // Sales by weekday (sum of the RPC's trusted net total per day).
  const weekdayTotals = new Array(7).fill(0) as number[];
  for (const row of (sbdRes.data ?? []) as { date: string; net: number | null }[]) {
    if (!row.date) continue;
    const jsDay = new Date(`${row.date}T00:00:00`).getDay(); // 0 = Sun
    const idx = (jsDay + 6) % 7; // 0 = Mon
    weekdayTotals[idx] += Number(row.net ?? 0);
  }

  // Stock by category.
  const stockMap = new Map<string, number>();
  for (const p of (prodRes.data ?? []) as { category: string | null; stock_quantity: number | null }[]) {
    const key = p.category || "Miscellaneous";
    stockMap.set(key, (stockMap.get(key) ?? 0) + Number(p.stock_quantity ?? 0));
  }

  return {
    invoiceStatus: { paid, partial, unpaid },
    avgOrderValue: { total: aovTotal, count: aovCount, average: aovCount > 0 ? aovTotal / aovCount : 0 },
    paymentMethods: sortDescTopN(methodMap, 8),
    expenseCategories: sortDescTopN(expenseMap, 8),
    repairStatuses: sortDescTopN(repairMap, 8),
    salesByWeekday: WEEKDAY_LABELS.map((label, i) => ({ label, value: weekdayTotals[i] })),
    topCustomerDues: ((custRes.data ?? []) as { name: string | null; outstanding_balance: number | null }[]).map((c) => ({
      label: c.name || "Unnamed",
      value: Number(c.outstanding_balance ?? 0),
    })),
    stockByCategory: sortDescTopN(stockMap, 8),
  };
}
