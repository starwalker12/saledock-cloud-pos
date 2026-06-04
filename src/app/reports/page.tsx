import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { getCurrentContext } from "@/lib/auth/session";
import { canViewReportsNew } from "@/lib/staff-permissions";
import { getReportsData, getPotentialProfitInStock } from "@/lib/data/reports";
import { getBrandingSettings } from "@/lib/data/settings";
import {
  listSuppliersWithBalances,
  supplierPurchaseCounts,
} from "@/lib/data/supplier-purchases";
import { PrintButton } from "./print-button";
import {
  ReportFilters,
  PrintLetterhead,
  PrimaryFinancialStats,
  SecondaryPerformanceStats,
  ProfitabilitySummary,
  SalesRevenueSplits,
  ExpensesBreakdown,
  ReturnsSummary,
  CustomerLedger,
  TopPerformers,
  ServiceTransactions,
  LossPrevention,
  StockValuation,
  DailyClosing,
  PotentialProfit,
  SupplierDues,
} from "./components";

type SearchParams = {
  range?: string;
  startDate?: string;
  endDate?: string;
};

function fmtDay(d: string) {
  return new Date(`${d}T00:00:00`).toLocaleDateString("en-PK", {
    year: "numeric",
    month: "long",
    day: "2-digit",
  });
}

function getRangeDates(range: string, customStart?: string, customEnd?: string) {
  const today = new Date();

  const formatLocal = (d: Date) => {
    const tz = d.getTimezoneOffset() * 60_000;
    return new Date(d.getTime() - tz).toISOString().slice(0, 10);
  };

  let start = formatLocal(today);
  let end = formatLocal(today);

  switch (range) {
    case "today":
      start = formatLocal(today);
      end = formatLocal(today);
      break;
    case "yesterday": {
      const yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);
      start = formatLocal(yesterday);
      end = formatLocal(yesterday);
      break;
    }
    case "this_week": {
      const dayOfWeek = today.getDay();
      const diff = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
      const monday = new Date(today);
      monday.setDate(diff);
      start = formatLocal(monday);
      end = formatLocal(today);
      break;
    }
    case "this_month": {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      start = formatLocal(firstDay);
      end = formatLocal(today);
      break;
    }
    case "last_month": {
      const firstDayLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const lastDayLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
      start = formatLocal(firstDayLastMonth);
      end = formatLocal(lastDayLastMonth);
      break;
    }
    case "custom":
      if (customStart) start = customStart;
      if (customEnd) end = customEnd;
      break;
    default: {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      start = formatLocal(firstDay);
      end = formatLocal(today);
      break;
    }
  }

  return { start, end };
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { user, profile, organization, branch } = await getCurrentContext();

  if (!user) redirect("/login");
  if (!profile?.organization_id) redirect("/setup");

  // Enforce access control permissions: Cashier and Technician must be redirected
  if (!(await canViewReportsNew(profile))) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const range = params.range ?? "this_month";
  const { start, end } = getRangeDates(range, params.startDate, params.endDate);

  const orgId = profile.organization_id;
  const branchId = profile.branch_id ?? null;
  const currency = organization?.currency_code ?? "PKR";

  const [data, branding, supplierBalances, purchaseCounts, potentialProfit] = await Promise.all([
    getReportsData(orgId, branchId, start, end),
    getBrandingSettings(orgId, branchId),
    listSuppliersWithBalances(orgId),
    supplierPurchaseCounts(orgId),
    getPotentialProfitInStock(orgId),
  ]);
  const totalSupplierDues = supplierBalances.reduce((s, x) => s + x.outstanding_balance, 0);
  const topSupplierDues = supplierBalances
    .filter((s) => s.outstanding_balance > 0)
    .sort((a, b) => b.outstanding_balance - a.outstanding_balance)
    .slice(0, 5);

  const quickRanges = [
    { label: "Today", value: "today" },
    { label: "Yesterday", value: "yesterday" },
    { label: "This Week", value: "this_week" },
    { label: "This Month", value: "this_month" },
    { label: "Last Month", value: "last_month" },
  ];

  return (
    <AppShell pageTitle="Reports">
      {/* CSS overrides for print view */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body {
            background-color: white !important;
            color: black !important;
          }
          nav, header, sidebar, .print\\:hidden, button, form {
            display: none !important;
          }
          main {
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
          }
          .shadow-sm {
            box-shadow: none !important;
          }
          .border {
            border-color: #cbd5e1 !important;
          }
        }
      ` }} />

      {/* Header and Controls */}
      <div className="mb-6 flex flex-col gap-4 print:hidden sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-xl font-black text-slate-950">Management Reports</h2>
          <p className="mt-1 text-sm text-slate-500">
            Branch: <strong>{branch?.name ?? "All Branches"}</strong> · Range: {fmtDay(start)} to {fmtDay(end)}
          </p>
        </div>
        <PrintButton />
      </div>

      <ReportFilters start={start} end={end} range={range} quickRanges={quickRanges} />

      <PrintLetterhead
        branding={branding}
        organizationName={organization?.name}
        branchName={branch?.name}
        start={start}
        end={end}
        fmtDay={fmtDay}
      />

      <PrimaryFinancialStats
        currency={currency}
        grossSales={data.sales.grossSales}
        invoiceCount={data.sales.invoiceCount}
        salesRevenue={data.profit.salesRevenue}
        estimatedNetProfit={data.profit.estimatedNetProfit}
        grossProfit={data.profit.grossProfit}
        totalExpenses={data.expenses.totalExpenses}
        refundTotal={data.returns.refundTotal}
      />

      <SecondaryPerformanceStats
        currency={currency}
        grossMarginPercent={data.profit.grossMarginPercent}
        productCost={data.profit.productCost}
        serviceProfit={data.profit.serviceProfit}
        totalExpenses={data.expenses.totalExpenses}
      />

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <ProfitabilitySummary
          currency={currency}
          salesRevenue={data.profit.salesRevenue}
          productCost={data.profit.productCost}
          grossProfit={data.profit.grossProfit}
          serviceProfit={data.profit.serviceProfit}
          servicePrincipalHandled={data.profit.servicePrincipalHandled}
          totalExpenses={data.expenses.totalExpenses}
          refundTotal={data.returns.refundTotal}
          creditWriteOffs={data.profit.creditWriteOffs}
          estimatedNetProfit={data.profit.estimatedNetProfit}
        />
        <SalesRevenueSplits currency={currency} payments={data.payments} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <ExpensesBreakdown
          currency={currency}
          expensesByCategory={data.expenses.expensesByCategory}
          expensesByPaymentMethod={data.expenses.expensesByPaymentMethod}
        />
        <ReturnsSummary
          currency={currency}
          returnCount={data.returns.returnCount}
          returnedProductQty={data.returns.returnedProductQty}
          refundsByMethod={data.returns.refundsByMethod}
          refundTotal={data.returns.refundTotal}
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <CustomerLedger
          currency={currency}
          debtorCount={data.ledger.debtorCount}
          creditPaymentsReceived={data.ledger.creditPaymentsReceived}
          creditWriteOffs={data.ledger.creditWriteOffs}
          topDebtors={data.ledger.topDebtors}
          totalOutstandingBalance={data.ledger.totalOutstandingBalance}
        />
        <TopPerformers
          currency={currency}
          topProductsQty={data.topItems.topProductsQty}
          topServicesRevenue={data.topItems.topServicesRevenue}
        />
      </div>

      <ServiceTransactions
        currency={currency}
        transactionCount={data.services.transactionCount}
        commissionEarned={data.services.commissionEarned}
        principalHandled={data.services.principalHandled}
        totalCharged={data.services.totalCharged}
        byProvider={data.services.byProvider}
        byDirection={data.services.byDirection}
      />

      <LossPrevention
        currency={currency}
        belowCostSaleCount={data.lossPrevention.belowCostSaleCount}
        totalLossAmount={data.lossPrevention.totalLossAmount}
        recent={data.lossPrevention.recent}
      />

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <StockValuation
          currency={currency}
          activeProductCount={data.inventory.activeProductCount}
          stockValuation={data.inventory.stockValuation}
          topStockValueProducts={data.inventory.topStockValueProducts}
          outOfStockProducts={data.inventory.outOfStockProducts}
          lowStockProducts={data.inventory.lowStockProducts}
        />
        <DailyClosing
          currency={currency}
          closedDaysCount={data.closing.closedDaysCount}
          openDaysCount={data.closing.openDaysCount}
          totalCashDifference={data.closing.totalCashDifference}
          recentClosings={data.closing.recentClosings}
          fmtDay={fmtDay}
        />
      </div>

      <PotentialProfit
        currency={currency}
        totalInventorySaleValue={potentialProfit.totalInventorySaleValue}
        totalInventoryCostValue={potentialProfit.totalInventoryCostValue}
        potentialProfitInStock={potentialProfit.potentialProfitInStock}
        marginPercent={potentialProfit.marginPercent}
      />

      <SupplierDues
        currency={currency}
        monthTotal={purchaseCounts.monthTotal}
        monthCount={purchaseCounts.monthCount}
        unpaidTotal={purchaseCounts.unpaidTotal}
        unpaidCount={purchaseCounts.unpaidCount}
        totalSupplierDues={totalSupplierDues}
        topSupplierDues={topSupplierDues}
      />
    </AppShell>
  );
}
