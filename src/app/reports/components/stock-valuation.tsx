import { Boxes } from "lucide-react";
import { formatCurrency, formatNumber } from "@/lib/formatters";

type StockValuationProps = {
  currency: string;
  activeProductCount: number;
  stockValuation: number;
  topStockValueProducts: { name: string; quantity: number; cost_value: number }[];
  outOfStockProducts: { name: string }[];
  lowStockProducts: { name: string; current_stock: number; min_stock: number }[];
};

export function StockValuation({
  currency,
  activeProductCount,
  stockValuation,
  topStockValueProducts,
  outOfStockProducts,
  lowStockProducts,
}: StockValuationProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm sm:p-6">
      <h3 className="text-base font-black text-slate-950 flex items-center gap-2">
        <Boxes className="size-5 text-blue-600" />
        FIFO Stock Lots Valuation
      </h3>
      <p className="text-xs text-slate-500 mt-1">Capital stock valuation computed at lot purchase cost.</p>
      <div className="mt-4 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Physical Catalog Lines</p>
            <p className="mt-1 text-2xl font-black text-slate-900">{formatNumber(activeProductCount)}</p>
          </div>
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4">
            <p className="text-xs font-bold text-emerald-800 uppercase tracking-wider">Active Asset Value</p>
            <p className="mt-1 text-2xl font-black text-emerald-950">{formatCurrency(stockValuation, currency)}</p>
          </div>
        </div>

        <div>
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Valuable Stock Concentrates</h4>
          {topStockValueProducts.length === 0 ? (
            <p className="text-sm text-slate-400 py-2">No products in stock.</p>
          ) : (
            <div className="space-y-2">
              {topStockValueProducts.map((item) => (
                <div key={item.name} className="flex flex-wrap justify-between gap-2 border-b border-slate-50 py-1.5 text-sm">
                  <span className="min-w-0 break-words font-semibold text-slate-700 sm:max-w-[280px] sm:truncate">{item.name}</span>
                  <span className="font-bold text-slate-900">{formatCurrency(item.cost_value, currency)} <span className="ml-1 text-xs font-normal text-slate-400">({formatNumber(item.quantity)} units)</span></span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid gap-4 pt-2 sm:grid-cols-2">
          <div>
            <h4 className="text-xs font-bold text-red-500 uppercase tracking-wide mb-2">Out of Stock Warnings</h4>
            {outOfStockProducts.length === 0 ? (
              <p className="text-xs text-slate-400">Zero critical gaps.</p>
            ) : (
              <ul className="text-xs text-slate-600 list-disc list-inside space-y-1 max-h-[120px] overflow-y-auto">
                {outOfStockProducts.slice(0, 5).map((p) => (
                  <li key={p.name} className="truncate">{p.name}</li>
                ))}
                {outOfStockProducts.length > 5 && <li className="text-slate-400">+ {outOfStockProducts.length - 5} more</li>}
              </ul>
            )}
          </div>
          <div>
            <h4 className="text-xs font-bold text-amber-600 uppercase tracking-wide mb-2">Low Stock Warnings</h4>
            {lowStockProducts.length === 0 ? (
              <p className="text-xs text-slate-400">All levels optimal.</p>
            ) : (
              <ul className="text-xs text-slate-600 list-disc list-inside space-y-1 max-h-[120px] overflow-y-auto">
                {lowStockProducts.slice(0, 5).map((p) => (
                  <li key={p.name} className="truncate">{p.name} (have {p.current_stock})</li>
                ))}
                {lowStockProducts.length > 5 && <li className="text-slate-400">+ {lowStockProducts.length - 5} more</li>}
              </ul>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
