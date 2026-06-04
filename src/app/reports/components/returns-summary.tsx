import { RotateCcw } from "lucide-react";
import { formatCurrency, formatNumber } from "@/lib/formatters";

type ReturnsSummaryProps = {
  currency: string;
  returnCount: number;
  returnedProductQty: number;
  refundsByMethod: { method: string; amount: number }[];
  refundTotal: number;
};

export function ReturnsSummary({
  currency,
  returnCount,
  returnedProductQty,
  refundsByMethod,
  refundTotal,
}: ReturnsSummaryProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm sm:p-6">
      <h3 className="text-base font-black text-slate-950 flex items-center gap-2">
        <RotateCcw className="size-5 text-blue-600" />
        Returns & Refunds Summary
      </h3>
      <p className="text-xs text-slate-500 mt-1">Returned merchandise statistics and cash refunds.</p>
      <div className="mt-4 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Return Tickets</p>
            <p className="mt-1 text-2xl font-black text-slate-900">{formatNumber(returnCount)}</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Returned Units</p>
            <p className="mt-1 text-2xl font-black text-slate-900">{formatNumber(returnedProductQty)}</p>
          </div>
        </div>
        <div>
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Refund Methods Issued</h4>
          {refundsByMethod.length === 0 ? (
            <div className="text-center text-sm text-slate-400 py-4 border border-dashed border-slate-100 rounded-xl">
              No refunds processed.
            </div>
          ) : (
            <div className="space-y-2">
              {refundsByMethod.map((rm) => (
                <div key={rm.method} className="flex flex-wrap justify-between gap-2 border-b border-slate-50 py-1.5 text-sm">
                  <span className="text-slate-600 font-semibold capitalize">{rm.method}</span>
                  <span className="font-bold text-red-600">-{formatCurrency(rm.amount, currency)}</span>
                </div>
              ))}
              <div className="flex flex-wrap justify-between gap-2 border-t border-slate-200 pt-2 text-sm font-black">
                <span>Total Cash/Credit Refunded</span>
                <span className="text-red-700">{formatCurrency(refundTotal, currency)}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
