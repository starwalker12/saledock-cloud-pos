import { CircleDollarSign, Coins, ReceiptText, TrendingUp, Wallet, Award } from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { formatCurrency, formatNumber } from "@/lib/formatters";

type FinancialStatsProps = {
  currency: string;
  grossSales: number;
  invoiceCount: number;
  salesRevenue: number;
  estimatedNetProfit: number;
  grossProfit: number;
  totalExpenses: number;
  refundTotal: number;
};

export function PrimaryFinancialStats({
  currency,
  grossSales,
  invoiceCount,
  salesRevenue,
  estimatedNetProfit,
  grossProfit,
  totalExpenses,
  refundTotal,
}: FinancialStatsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <StatCard
        label="Gross sales"
        value={formatCurrency(grossSales, currency)}
        detail={`${formatNumber(invoiceCount)} active invoice${invoiceCount === 1 ? "" : "s"}.`}
        icon={<ReceiptText className="size-5" />}
      />
      <StatCard
        label="Net Sales (Revenue)"
        value={formatCurrency(salesRevenue, currency)}
        detail="Total sales after discounts, before cost deductions."
        icon={<CircleDollarSign className="size-5" />}
      />
      {/* Highlighted Net Profit Card for wow factor */}
      <div className="rounded-2xl border-2 border-emerald-500 bg-emerald-50/70 p-5 shadow-md flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-emerald-800 uppercase tracking-wider">Estimated Net Profit</p>
          <p className="mt-2 text-3xl font-black text-emerald-950">
            {formatCurrency(estimatedNetProfit, currency)}
          </p>
          <p className="mt-3 text-xs font-semibold text-emerald-700 leading-5">
            Gross Profit ({formatCurrency(grossProfit, currency)}) − Expenses ({formatCurrency(totalExpenses, currency)}) − Refunds ({formatCurrency(refundTotal, currency)})
          </p>
        </div>
        <div className="rounded-xl bg-emerald-500 p-3 text-white">
          <TrendingUp className="size-6" />
        </div>
      </div>
    </div>
  );
}

type SecondaryStatsProps = {
  currency: string;
  grossMarginPercent: number;
  productCost: number;
  serviceProfit: number;
  totalExpenses: number;
};

export function SecondaryPerformanceStats({
  currency,
  grossMarginPercent,
  productCost,
  serviceProfit,
  totalExpenses,
}: SecondaryStatsProps) {
  return (
    <div className="mt-4 grid gap-4 sm:grid-cols-3">
      <StatCard
        label="Gross Profit Margin"
        value={`${formatNumber(grossMarginPercent)}%`}
        detail={`Asset Cost of Sales: ${formatCurrency(productCost, currency)}`}
        icon={<Coins className="size-5" />}
      />
      <StatCard
        label="Service Revenue / Profit"
        value={formatCurrency(serviceProfit, currency)}
        detail="Service billing total (assumes zero inventory cost)."
        icon={<Award className="size-5" />}
      />
      <StatCard
        label="Total Operating Expenses"
        value={formatCurrency(totalExpenses, currency)}
        detail="From active business expenses registry."
        icon={<Wallet className="size-5" />}
      />
    </div>
  );
}
