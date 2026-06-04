import { TrendingUp } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";

type ProfitabilitySummaryProps = {
  currency: string;
  salesRevenue: number;
  productCost: number;
  grossProfit: number;
  serviceProfit: number;
  servicePrincipalHandled: number;
  totalExpenses: number;
  refundTotal: number;
  creditWriteOffs: number;
  estimatedNetProfit: number;
};

export function ProfitabilitySummary({
  currency,
  salesRevenue,
  productCost,
  grossProfit,
  serviceProfit,
  servicePrincipalHandled,
  totalExpenses,
  refundTotal,
  creditWriteOffs,
  estimatedNetProfit,
}: ProfitabilitySummaryProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm sm:p-6">
      <h3 className="text-base font-black text-slate-950 flex items-center gap-2">
        <TrendingUp className="size-5 text-blue-600" />
        Profitability Summary
      </h3>
      <p className="text-xs text-slate-500 mt-1">Direct margins on product trade and service delivery.</p>
      <div className="mt-4 space-y-3">
        <div className="flex flex-wrap justify-between gap-2 border-b border-slate-100 py-2">
          <span className="text-sm font-semibold text-slate-600">Sales Revenue (Net Sales)</span>
          <span className="text-sm font-bold text-slate-900">{formatCurrency(salesRevenue, currency)}</span>
        </div>
        <div className="flex flex-wrap justify-between gap-2 border-b border-slate-100 py-2">
          <span className="text-sm font-semibold text-slate-600">Product Cost of Sales (FIFO/Lots)</span>
          <span className="text-sm font-bold text-red-700">-{formatCurrency(productCost, currency)}</span>
        </div>
        <div className="flex flex-wrap justify-between gap-2 border-b border-slate-100 py-2">
          <span className="text-sm font-black text-slate-900">Gross Profit (Product Trade)</span>
          <span className="text-sm font-black text-emerald-700">{formatCurrency(grossProfit, currency)}</span>
        </div>
        <div className="flex flex-wrap justify-between gap-2 border-b border-slate-100 py-2">
          <span className="text-sm font-semibold text-slate-600">Service Commissions (Shop Income)</span>
          <span className="text-sm font-bold text-slate-900">+{formatCurrency(serviceProfit, currency)}</span>
        </div>
        <div className="flex flex-wrap justify-between gap-2 rounded-lg border-b border-slate-100 bg-slate-50/50 px-2 py-2 italic text-slate-500">
          <span className="text-xs font-semibold">Service Principal Handled (Pass-through)</span>
          <span className="text-xs font-semibold">{formatCurrency(servicePrincipalHandled, currency)}</span>
        </div>
        <div className="flex flex-wrap justify-between gap-2 border-b border-slate-100 py-2">
          <span className="text-sm font-semibold text-slate-600">Total Operating Expenses</span>
          <span className="text-sm font-bold text-red-700">-{formatCurrency(totalExpenses, currency)}</span>
        </div>
        <div className="flex flex-wrap justify-between gap-2 border-b border-slate-100 py-2">
          <span className="text-sm font-semibold text-slate-600">Refund/Return Outflow Impact</span>
          <span className="text-sm font-bold text-red-700">-{formatCurrency(refundTotal, currency)}</span>
        </div>
        {creditWriteOffs > 0 && (
          <div className="flex flex-wrap justify-between gap-2 border-b border-slate-100 py-2">
            <span className="text-sm font-semibold text-slate-600">Credit Write-offs / Bad Debt</span>
            <span className="text-sm font-bold text-rose-700">-{formatCurrency(creditWriteOffs, currency)}</span>
          </div>
        )}
        <div className="flex flex-wrap justify-between gap-2 border-t-2 border-dashed border-slate-200 pt-2">
          <span className="text-base font-black text-slate-950">Estimated Net Profit</span>
          <span className="text-base font-black text-emerald-800">{formatCurrency(estimatedNetProfit, currency)}</span>
        </div>
      </div>
    </section>
  );
}
