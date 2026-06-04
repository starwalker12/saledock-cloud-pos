import { Award } from "lucide-react";
import { formatCurrency, formatNumber } from "@/lib/formatters";

type TopPerformersProps = {
  currency: string;
  topProductsQty: { name: string; quantity: number; revenue: number }[];
  topServicesRevenue: { name: string; revenue: number }[];
};

export function TopPerformers({ currency, topProductsQty, topServicesRevenue }: TopPerformersProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm sm:p-6">
      <h3 className="text-base font-black text-slate-950 flex items-center gap-2">
        <Award className="size-5 text-blue-600" />
        Top Performing Catalog Lines
      </h3>
      <p className="text-xs text-slate-500 mt-1">High volume units, top revenues, and service commissions.</p>
      <div className="mt-4 space-y-4">
        <div>
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Top Products by Quantity Sold</h4>
          {topProductsQty.length === 0 ? (
            <p className="text-sm text-slate-400 py-2">No physical products sold.</p>
          ) : (
            <div className="space-y-2">
              {topProductsQty.map((item) => (
                <div key={item.name} className="flex flex-wrap justify-between gap-2 border-b border-slate-50 py-1 text-sm">
                  <span className="min-w-0 break-words font-semibold text-slate-700 sm:max-w-[280px] sm:truncate">{item.name}</span>
                  <span className="font-bold text-slate-900">{formatNumber(item.quantity)} units <span className="ml-1 text-xs font-normal text-slate-400">({formatCurrency(item.revenue, currency)})</span></span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="pt-2">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Top Services by Commission Revenue</h4>
          {topServicesRevenue.length === 0 ? (
            <p className="text-sm text-slate-400 py-2">No service commissions recorded.</p>
          ) : (
            <div className="space-y-2">
              {topServicesRevenue.map((item) => (
                <div key={item.name} className="flex flex-wrap justify-between gap-2 border-b border-slate-50 py-1 text-sm">
                  <span className="min-w-0 break-words font-semibold text-slate-700 sm:max-w-[280px] sm:truncate">{item.name}</span>
                  <span className="font-bold text-emerald-800">+{formatCurrency(item.revenue, currency)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
