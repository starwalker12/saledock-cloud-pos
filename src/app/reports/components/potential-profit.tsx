import { Boxes } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";

type PotentialProfitProps = {
  currency: string;
  totalInventorySaleValue: number;
  totalInventoryCostValue: number;
  potentialProfitInStock: number;
  marginPercent: number | null;
};

export function PotentialProfit({
  currency,
  totalInventorySaleValue,
  totalInventoryCostValue,
  potentialProfitInStock,
  marginPercent,
}: PotentialProfitProps) {
  return (
    <section className="mt-6 rounded-2xl border border-amber-200 bg-white p-4 shadow-sm sm:p-6">
      <h3 className="text-base font-black text-slate-950 flex items-center gap-2">
        <Boxes className="size-5 text-amber-600" />
        Potential profit in stock
      </h3>
      <p className="text-xs text-slate-500 mt-1">
        If all current stock sold at current prices (not yet earned).
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Inventory Sale Value</p>
          <p className="mt-1 text-2xl font-black text-slate-900">{formatCurrency(totalInventorySaleValue, currency)}</p>
        </div>
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Inventory Cost Value</p>
          <p className="mt-1 text-2xl font-black text-slate-900">{formatCurrency(totalInventoryCostValue, currency)}</p>
        </div>
        <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-4">
          <p className="text-xs font-bold text-amber-800 uppercase tracking-wider">Potential Profit</p>
          <p className={`mt-1 text-2xl font-black ${potentialProfitInStock >= 0 ? "text-amber-950" : "text-red-700"}`}>
            {formatCurrency(potentialProfitInStock, currency)}
          </p>
          {marginPercent !== null && (
            <p className="mt-0.5 text-xs font-semibold text-amber-700">
              {marginPercent}% margin on current stock
            </p>
          )}
        </div>
      </div>
      <p className="mt-3 text-xs text-slate-400 italic leading-relaxed">
        Unrealized. Sale value is computed from current selling prices; cost value uses real FIFO lot purchase costs.
        Services are excluded. Only active, in-stock physical products with remaining quantity &gt; 0 are counted.
      </p>
    </section>
  );
}
