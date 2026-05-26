import "server-only";
import { createClient } from "@/lib/supabase/server";

export type InvoiceItemReportRow = {
  invoice_id: string;
  product_name: string;
  product_type: "product" | "service";
  quantity: number;
  purchase_price: number;
  unit_price: number;
  item_discount: number;
  line_total: number;
  service_commission: number;
  service_transaction_amount: number;
  service_total_charged: number;
  service_provider: string | null;
  service_direction: string | null;
};

export type SalesSummaryReport = {
  grossSales: number;
  invoiceCount: number;
  averageInvoiceValue: number;
  totalDiscounts: number;
  openBalance: number;
  salesByDay: { date: string; count: number; gross: number; net: number }[];
};

export type PaymentSummaryReport = {
  cash: number;
  card: number;
  easypaisa: number;
  jazzcash: number;
  bank_transfer: number;
  customer_credit: number;
  total: number;
};

export type ProfitSummaryReport = {
  salesRevenue: number;
  productCost: number;
  grossProfit: number;
  grossMarginPercent: number;
  serviceProfit: number;
  servicePrincipalHandled: number;
  estimatedNetProfit: number;
};

export type ReturnsSummaryReport = {
  returnCount: number;
  refundTotal: number;
  refundsByMethod: { method: string; amount: number }[];
  returnedProductQty: number;
};

export type ExpensesSummaryReport = {
  totalExpenses: number;
  expensesByCategory: { category: string; amount: number }[];
  expensesByPaymentMethod: { method: string; amount: number }[];
  topCategories: { category: string; amount: number }[];
};

export type CustomerLedgerSummaryReport = {
  totalOutstandingBalance: number;
  debtorCount: number;
  topDebtors: { name: string; phone: string | null; balance: number }[];
  creditPaymentsReceived: number;
};

export type InventorySummaryReport = {
  activeProductCount: number;
  stockValuation: number;
  lowStockProducts: { name: string; current_stock: number; min_stock: number }[];
  outOfStockProducts: { name: string }[];
  topStockValueProducts: { name: string; quantity: number; cost_value: number }[];
};

export type TopProductsReport = {
  topProductsQty: { name: string; quantity: number; revenue: number }[];
  topProductsRevenue: { name: string; quantity: number; revenue: number }[];
  topServicesRevenue: { name: string; revenue: number }[];
};

export type ServiceTransactionsReport = {
  transactionCount: number;
  commissionEarned: number;
  principalHandled: number;
  totalCharged: number;
  byProvider: { provider: string; count: number; principal: number; commission: number }[];
  byDirection: { direction: string; count: number; principal: number; commission: number }[];
};

export type DailyClosingSummaryReport = {
  closedDaysCount: number;
  openDaysCount: number;
  totalCashDifference: number;
  recentClosings: { date: string; bills_count: number; expected: number; actual: number; difference: number }[];
};

export type ReportsData = {
  sales: SalesSummaryReport;
  payments: PaymentSummaryReport;
  profit: ProfitSummaryReport;
  returns: ReturnsSummaryReport;
  expenses: ExpensesSummaryReport;
  ledger: CustomerLedgerSummaryReport;
  inventory: InventorySummaryReport;
  topItems: TopProductsReport;
  services: ServiceTransactionsReport;
  lossPrevention: LossPreventionReport;
  closing: DailyClosingSummaryReport;
};

export type LossPreventionReport = {
  belowCostSaleCount: number;
  totalLossAmount: number;
  recent: {
    created_at: string;
    product_name: string;
    invoice_no: string;
    loss_amount: number;
    reason: string;
  }[];
};

function dayBounds(startDate: string, endDate: string): { start: string; end: string } {
  // Treat the local dates as calendar bounds and convert to ISO strings
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T23:59:59.999`);
  return { start: start.toISOString(), end: end.toISOString() };
}

export async function getReportsData(
  orgId: string,
  branchId: string | null,
  startDateStr: string,
  endDateStr: string,
): Promise<ReportsData> {
  const supabase = await createClient();
  const { start, end } = dayBounds(startDateStr, endDateStr);

  // 1. Fetch active Invoices in range
  let invoicesQuery = supabase
    .from("invoices")
    .select("id, invoice_date, grand_total, subtotal, discount_total, balance_due, status")
    .eq("organization_id", orgId)
    .neq("status", "void")
    .gte("invoice_date", start)
    .lte("invoice_date", end);

  if (branchId) {
    invoicesQuery = invoicesQuery.eq("branch_id", branchId);
  }

  const { data: invoices, error: invoicesError } = await invoicesQuery;
  if (invoicesError) throw new Error(`Invoices query error: ${invoicesError.message}`);

  const activeInvoices = invoices ?? [];
  const invoiceIds = activeInvoices.map((inv) => inv.id);

  // 2. Fetch invoice items for active invoices
  let invoiceItems: InvoiceItemReportRow[] = [];
  if (invoiceIds.length > 0) {
    const { data: items, error: itemsError } = await supabase
      .from("invoice_items")
      .select("invoice_id, product_name, product_type, quantity, purchase_price, unit_price, item_discount, line_total, service_commission, service_transaction_amount, service_total_charged, service_provider, service_direction")
      .eq("organization_id", orgId)
      .in("invoice_id", invoiceIds);

    if (itemsError) throw new Error(`Invoice items query error: ${itemsError.message}`);
    invoiceItems = (items ?? []) as unknown as InvoiceItemReportRow[];
  }

  // Group invoice items by invoice_id for quick access
  const itemsByInvoiceId = new Map<string, InvoiceItemReportRow[]>();
  for (const item of invoiceItems) {
    const list = itemsByInvoiceId.get(item.invoice_id) ?? [];
    list.push(item);
    itemsByInvoiceId.set(item.invoice_id, list);
  }

  // 3. Payments in range
  let paymentsQuery = supabase
    .from("payments")
    .select("amount, method")
    .eq("organization_id", orgId)
    .gte("paid_at", start)
    .lte("paid_at", end);

  if (branchId) {
    paymentsQuery = paymentsQuery.eq("branch_id", branchId);
  }

  const { data: payments, error: paymentsError } = await paymentsQuery;
  if (paymentsError) throw new Error(`Payments query error: ${paymentsError.message}`);

  // 4. Returns in range
  let returnsQuery = supabase
    .from("returns")
    .select("id, refund_amount, refund_method")
    .eq("organization_id", orgId)
    .eq("status", "completed")
    .gte("created_at", start)
    .lte("created_at", end);

  if (branchId) {
    returnsQuery = returnsQuery.eq("branch_id", branchId);
  }

  const { data: returnsData, error: returnsError } = await returnsQuery;
  if (returnsError) throw new Error(`Returns query error: ${returnsError.message}`);

  const completedReturns = returnsData ?? [];
  const returnIds = completedReturns.map((r) => r.id);

  // 5. Return items in range
  let returnedProductQty = 0;
  if (returnIds.length > 0) {
    const { data: retItems, error: retItemsError } = await supabase
      .from("return_items")
      .select("quantity")
      .in("return_id", returnIds);

    if (retItemsError) throw new Error(`Return items query error: ${retItemsError.message}`);
    returnedProductQty = (retItems ?? []).reduce((sum, item) => sum + Number(item.quantity ?? 0), 0);
  }

  // 6. Expenses in range
  let expensesQuery = supabase
    .from("expenses")
    .select("amount, category, payment_method")
    .eq("organization_id", orgId)
    .eq("status", "active")
    .gte("spent_at", start)
    .lte("spent_at", end);

  if (branchId) {
    expensesQuery = expensesQuery.eq("branch_id", branchId);
  }

  const { data: expenses, error: expensesError } = await expensesQuery;
  if (expensesError) throw new Error(`Expenses query error: ${expensesError.message}`);
  const activeExpenses = expenses ?? [];

  // 7. Customers ledger (outstanding balances are current/global, but we can query them)
  let customersQuery = supabase
    .from("customers")
    .select("name, phone, outstanding_balance")
    .eq("organization_id", orgId)
    .gt("outstanding_balance", 0);

  if (branchId) {
    customersQuery = customersQuery.eq("branch_id", branchId);
  }

  const { data: customerDebt, error: customersError } = await customersQuery;
  if (customersError) throw new Error(`Customers debt query error: ${customersError.message}`);

  const debtors = customerDebt ?? [];
  const totalOutstandingBalance = debtors.reduce((sum, c) => sum + Number(c.outstanding_balance ?? 0), 0);
  const debtorCount = debtors.length;
  const topDebtors = debtors
    .map((c) => ({ name: c.name, phone: c.phone, balance: Number(c.outstanding_balance ?? 0) }))
    .sort((a, b) => b.balance - a.balance)
    .slice(0, 5);

  // Credit payments received
  let creditPaymentsQuery = supabase
    .from("credit_payments")
    .select("amount")
    .eq("organization_id", orgId)
    .gte("created_at", start)
    .lte("created_at", end);

  if (branchId) {
    creditPaymentsQuery = creditPaymentsQuery.eq("branch_id", branchId);
  }

  const { data: creditPayments, error: creditPaymentsError } = await creditPaymentsQuery;
  if (creditPaymentsError) throw new Error(`Credit payments query error: ${creditPaymentsError.message}`);
  const creditPaymentsReceived = (creditPayments ?? []).reduce((sum, cp) => sum + Number(cp.amount ?? 0), 0);

  // 8. Inventory products & stock lots
  let productsQuery = supabase
    .from("products")
    .select("id, name, type, stock_quantity, minimum_stock, purchase_price")
    .eq("organization_id", orgId)
    .eq("is_active", true);

  if (branchId) {
    productsQuery = productsQuery.eq("branch_id", branchId);
  }

  const { data: products, error: productsError } = await productsQuery;
  if (productsError) throw new Error(`Products query error: ${productsError.message}`);
  const activeProducts = products ?? [];

  let stockLotsQuery = supabase
    .from("product_stock_lots")
    .select("quantity_remaining, unit_cost, products!inner(name, is_active)")
    .eq("organization_id", orgId)
    .eq("is_active", true)
    .gt("quantity_remaining", 0);

  if (branchId) {
    stockLotsQuery = stockLotsQuery.eq("branch_id", branchId);
  }

  const { data: stockLots, error: stockLotsError } = await stockLotsQuery;
  if (stockLotsError) throw new Error(`Stock lots query error: ${stockLotsError.message}`);
  const activeStockLots = stockLots ?? [];

  // 9. Daily closings
  let closingsQuery = supabase
    .from("daily_closings")
    .select("closing_date, bills_count, expected_closing_cash, actual_closing_cash, cash_difference, finalized_by")
    .eq("organization_id", orgId)
    .gte("closing_date", startDateStr)
    .lte("closing_date", endDateStr)
    .order("closing_date", { ascending: false });

  if (branchId) {
    closingsQuery = closingsQuery.eq("branch_id", branchId);
  }

  const { data: closings, error: closingsError } = await closingsQuery;
  if (closingsError) throw new Error(`Closings query error: ${closingsError.message}`);
  const dailyClosings = closings ?? [];

  // ================= CALCULATIONS =================

  // 1. Service Principal and Commission calculations
  const servicePrincipalHandled = invoiceItems
    .filter((item) => item.product_type === "service")
    .reduce((sum, item) => sum + Number(item.service_transaction_amount ?? 0), 0);

  const serviceProfit = invoiceItems
    .filter((item) => item.product_type === "service")
    .reduce((sum, item) => {
      const commission = Number(item.service_commission ?? 0);
      return sum + (commission > 0 ? commission : Number(item.line_total ?? 0));
    }, 0);

  const productSalesRevenue = invoiceItems
    .filter((item) => item.product_type === "product")
    .reduce((sum, item) => sum + Number(item.line_total ?? 0), 0);

  const cartDiscounts = activeInvoices.reduce((sum, inv) => sum + Number(inv.discount_total ?? 0), 0);

  // Gross Sales (Shop income before cart discounts, excluding service principal!)
  const grossSales = productSalesRevenue + serviceProfit;

  const lineDiscounts = invoiceItems.reduce((sum, item) => sum + Number(item.item_discount ?? 0), 0);
  const totalDiscounts = cartDiscounts + lineDiscounts;

  // Net Sales (Revenue) counts service commission only, completely excluding service principal!
  const salesRevenue = Math.max(grossSales - cartDiscounts, 0);

  const openBalance = activeInvoices.reduce((sum, inv) => sum + Number(inv.balance_due ?? 0), 0);
  const invoiceCount = activeInvoices.length;
  const averageInvoiceValue = invoiceCount > 0 ? salesRevenue / invoiceCount : 0;

  // Group sales by day, excluding service principal!
  const salesByDayMap = new Map<string, { date: string; count: number; gross: number; net: number }>();
  for (const inv of activeInvoices) {
    const day = inv.invoice_date.slice(0, 10);
    const items = itemsByInvoiceId.get(inv.id) ?? [];
    
    const invProductTotal = items
      .filter((item) => item.product_type === "product")
      .reduce((sum, item) => sum + Number(item.line_total ?? 0), 0);
      
    const invServiceComm = items
      .filter((item) => item.product_type === "service")
      .reduce((sum, item) => {
        const comm = Number(item.service_commission ?? 0);
        return sum + (comm > 0 ? comm : Number(item.line_total ?? 0));
      }, 0);

    const invGross = invProductTotal + invServiceComm;
    const invNet = Math.max(invGross - Number(inv.discount_total ?? 0), 0);

    const existing = salesByDayMap.get(day) ?? { date: day, count: 0, gross: 0, net: 0 };
    existing.count += 1;
    existing.gross += invGross;
    existing.net += invNet;
    salesByDayMap.set(day, existing);
  }
  const salesByDay = [...salesByDayMap.values()].sort((a, b) => a.date.localeCompare(b.date));

  // 2. Payment Summary calculations
  let payCash = 0;
  let payCard = 0;
  let payEasyPaisa = 0;
  let payJazzCash = 0;
  let payBankTransfer = 0;

  for (const p of payments ?? []) {
    const amount = Number(p.amount ?? 0);
    const method = String(p.method).toLowerCase();
    if (method === "cash") payCash += amount;
    else if (method === "card") payCard += amount;
    else if (method === "easypaisa") payEasyPaisa += amount;
    else if (method === "jazzcash") payJazzCash += amount;
    else if (method === "bank_transfer") payBankTransfer += amount;
  }

  // The balance due generated on invoices created during this period represents customer credit / unpaid sales.
  const payCredit = openBalance;
  const payTotal = payCash + payCard + payEasyPaisa + payJazzCash + payBankTransfer + payCredit;

  // 3. Profit Summary calculations
  const productCost = invoiceItems
    .filter((item) => item.product_type === "product")
    .reduce((sum, item) => sum + Number(item.purchase_price ?? 0) * Number(item.quantity ?? 0), 0);

  const grossProfit = Math.max(salesRevenue - productCost, 0);
  const grossMarginPercent = salesRevenue > 0 ? (grossProfit / salesRevenue) * 100 : 0;

  // 4. Returns / Refunds calculations
  const returnCount = completedReturns.length;
  const refundTotal = completedReturns.reduce((sum, ret) => sum + Number(ret.refund_amount ?? 0), 0);

  const totalExpenses = activeExpenses.reduce((sum, exp) => sum + Number(exp.amount ?? 0), 0);
  const estimatedNetProfit = grossProfit - totalExpenses - refundTotal;

  const refundsByMethodMap = new Map<string, number>();
  for (const ret of completedReturns) {
    const amt = Number(ret.refund_amount ?? 0);
    const method = ret.refund_method || "cash";
    refundsByMethodMap.set(method, (refundsByMethodMap.get(method) ?? 0) + amt);
  }
  const refundsByMethod = [...refundsByMethodMap].map(([method, amount]) => ({ method, amount }));

  // 5. Expenses calculations
  const expensesByCategoryMap = new Map<string, number>();
  const expensesByMethodMap = new Map<string, number>();

  for (const exp of activeExpenses) {
    const amt = Number(exp.amount ?? 0);
    expensesByCategoryMap.set(exp.category, (expensesByCategoryMap.get(exp.category) ?? 0) + amt);
    expensesByMethodMap.set(exp.payment_method, (expensesByMethodMap.get(exp.payment_method) ?? 0) + amt);
  }

  const expensesByCategory = [...expensesByCategoryMap]
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);

  const expensesByPaymentMethod = [...expensesByMethodMap]
    .map(([method, amount]) => ({ method, amount }))
    .sort((a, b) => b.amount - a.amount);

  const topCategories = expensesByCategory.slice(0, 5);

  // 6. Inventory calculations
  const activeProductCount = activeProducts.filter((p) => p.type === "product").length;
  const stockValuation = activeStockLots.reduce(
    (sum, lot) => sum + Number(lot.quantity_remaining ?? 0) * Number(lot.unit_cost ?? 0),
    0,
  );

  const outOfStockProducts = activeProducts
    .filter((p) => p.type === "product" && Number(p.stock_quantity ?? 0) === 0)
    .map((p) => ({ name: p.name }));

  const lowStockProducts = activeProducts
    .filter(
      (p) =>
        p.type === "product" &&
        Number(p.stock_quantity ?? 0) > 0 &&
        Number(p.stock_quantity ?? 0) <= Number(p.minimum_stock ?? 5),
    )
    .map((p) => ({ name: p.name, current_stock: Number(p.stock_quantity), min_stock: Number(p.minimum_stock) }));

  const productLotsMap = new Map<string, { name: string; quantity: number; cost_value: number }>();
  for (const lot of activeStockLots) {
    const products = lot.products as unknown as { name: string; is_active: boolean } | null;
    const pName = products?.name ?? "Unknown Product";
    const qty = Number(lot.quantity_remaining ?? 0);
    const costVal = qty * Number(lot.unit_cost ?? 0);

    const existing = productLotsMap.get(pName) || { name: pName, quantity: 0, cost_value: 0 };
    existing.quantity += qty;
    existing.cost_value += costVal;
    productLotsMap.set(pName, existing);
  }
  const topStockValueProducts = [...productLotsMap.values()]
    .sort((a, b) => b.cost_value - a.cost_value)
    .slice(0, 5);

  // 7. Top products / services calculations
  const productQtyMap = new Map<string, { name: string; quantity: number; revenue: number }>();
  const serviceQtyMap = new Map<string, { name: string; revenue: number }>();

  for (const item of invoiceItems) {
    const pName = item.product_name;
    const qty = Number(item.quantity ?? 0);
    const rev = Number(item.line_total ?? 0);

    if (item.product_type === "product") {
      const existing = productQtyMap.get(pName) || { name: pName, quantity: 0, revenue: 0 };
      existing.quantity += qty;
      existing.revenue += rev;
      productQtyMap.set(pName, existing);
    } else {
      const existing = serviceQtyMap.get(pName) || { name: pName, revenue: 0 };
      existing.revenue += rev;
      serviceQtyMap.set(pName, existing);
    }
  }

  const topProductsQty = [...productQtyMap.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 5);
  const topProductsRevenue = [...productQtyMap.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  const topServicesRevenue = [...serviceQtyMap.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5);

  // 7b. Service transactions breakdown (count, by-provider, by-direction).
  const serviceItems = invoiceItems.filter((i) => i.product_type === "service");
  const serviceTransactionCount = serviceItems.length;
  const serviceCommissionEarned = serviceItems.reduce(
    (s, i) => s + (Number(i.service_commission ?? 0) > 0 ? Number(i.service_commission) : Number(i.line_total ?? 0)),
    0,
  );
  const servicePrincipalHandledTotal = serviceItems.reduce(
    (s, i) => s + Number(i.service_transaction_amount ?? 0),
    0,
  );
  const serviceTotalCharged = serviceItems.reduce(
    (s, i) => s + (Number(i.service_total_charged ?? 0) > 0 ? Number(i.service_total_charged) : Number(i.line_total ?? 0)),
    0,
  );

  function bucket(items: typeof serviceItems, keyFn: (i: (typeof serviceItems)[number]) => string) {
    const map = new Map<string, { count: number; principal: number; commission: number }>();
    for (const i of items) {
      const k = keyFn(i) || "Unspecified";
      const prev = map.get(k) ?? { count: 0, principal: 0, commission: 0 };
      prev.count += 1;
      prev.principal += Number(i.service_transaction_amount ?? 0);
      const c = Number(i.service_commission ?? 0);
      prev.commission += c > 0 ? c : Number(i.line_total ?? 0);
      map.set(k, prev);
    }
    return map;
  }

  const byProviderMap = bucket(serviceItems, (i) => (i.service_provider ?? "").trim());
  const byDirectionMap = bucket(serviceItems, (i) => (i.service_direction ?? "").trim());
  const byProvider = [...byProviderMap.entries()]
    .map(([provider, v]) => ({ provider, ...v }))
    .sort((a, b) => b.commission - a.commission);
  const byDirection = [...byDirectionMap.entries()]
    .map(([direction, v]) => ({ direction, ...v }))
    .sort((a, b) => b.commission - a.commission);

  // 7c. Loss prevention — below-cost sale completions from audit_logs.
  const { data: lossRows } = await supabase
    .from("audit_logs")
    .select("created_at, details, metadata")
    .eq("organization_id", orgId)
    .eq("module", "pos")
    .eq("action", "pos.loss_sale_completed")
    .gte("created_at", start)
    .lte("created_at", end)
    .order("created_at", { ascending: false })
    .limit(50);

  type LossRow = { created_at: string; details?: string | null; metadata?: Record<string, unknown> | null };
  const lossEvents = (lossRows ?? []) as LossRow[];
  const totalLossAmount = lossEvents.reduce(
    (s, r) => s + Number((r.metadata as { loss_amount?: number })?.loss_amount ?? 0),
    0,
  );
  const recent = lossEvents.slice(0, 20).map((r) => {
    const md = (r.metadata as { product_name?: string; invoice_no?: string; loss_amount?: number; override_reason?: string }) ?? {};
    return {
      created_at: r.created_at,
      product_name: md.product_name ?? "—",
      invoice_no: md.invoice_no ?? "—",
      loss_amount: Number(md.loss_amount ?? 0),
      reason: md.override_reason ?? "",
    };
  });
  const lossPrevention = {
    belowCostSaleCount: lossEvents.length,
    totalLossAmount,
    recent,
  };

  // 8. Daily Closing calculations
  const closedDaysCount = dailyClosings.filter((c) => c.finalized_by !== null).length;
  const totalCashDifference = dailyClosings.reduce((sum, c) => sum + Number(c.cash_difference ?? 0), 0);

  // Calculate unclosed days
  const closedDatesSet = new Set(dailyClosings.filter((c) => c.finalized_by !== null).map((c) => c.closing_date));
  const startDay = new Date(startDateStr);
  const endDay = new Date(endDateStr);
  let openDaysCount = 0;

  for (let d = new Date(startDay); d <= endDay; d.setDate(d.getDate() + 1)) {
    const dayStr = d.toISOString().slice(0, 10);
    if (!closedDatesSet.has(dayStr)) {
      openDaysCount++;
    }
  }

  const recentClosings = dailyClosings.slice(0, 5).map((c) => ({
    date: c.closing_date,
    bills_count: Number(c.bills_count ?? 0),
    expected: Number(c.expected_closing_cash ?? 0),
    actual: Number(c.actual_closing_cash ?? 0),
    difference: Number(c.cash_difference ?? 0),
  }));

  return {
    sales: {
      grossSales,
      invoiceCount,
      averageInvoiceValue,
      totalDiscounts,
      openBalance,
      salesByDay,
    },
    payments: {
      cash: payCash,
      card: payCard,
      easypaisa: payEasyPaisa,
      jazzcash: payJazzCash,
      bank_transfer: payBankTransfer,
      customer_credit: payCredit,
      total: payTotal,
    },
    profit: {
      salesRevenue,
      productCost,
      grossProfit,
      grossMarginPercent,
      serviceProfit,
      servicePrincipalHandled,
      estimatedNetProfit,
    },
    returns: {
      returnCount,
      refundTotal,
      refundsByMethod,
      returnedProductQty,
    },
    expenses: {
      totalExpenses,
      expensesByCategory,
      expensesByPaymentMethod,
      topCategories,
    },
    ledger: {
      totalOutstandingBalance,
      debtorCount,
      topDebtors,
      creditPaymentsReceived,
    },
    inventory: {
      activeProductCount,
      stockValuation,
      lowStockProducts,
      outOfStockProducts,
      topStockValueProducts,
    },
    topItems: {
      topProductsQty,
      topProductsRevenue,
      topServicesRevenue,
    },
    services: {
      transactionCount: serviceTransactionCount,
      commissionEarned: serviceCommissionEarned,
      principalHandled: servicePrincipalHandledTotal,
      totalCharged: serviceTotalCharged,
      byProvider,
      byDirection,
    },
    lossPrevention,
    closing: {
      closedDaysCount,
      openDaysCount,
      totalCashDifference,
      recentClosings,
    },
  };
}
