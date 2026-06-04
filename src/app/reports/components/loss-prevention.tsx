import { Award } from "lucide-react";
import { formatCurrency, formatNumber } from "@/lib/formatters";

type LossPreventionProps = {
  currency: string;
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

export function LossPrevention({
  currency,
  belowCostSaleCount,
  totalLossAmount,
  recent,
}: LossPreventionProps) {
  return (
    <section id="loss-prevention" className="mt-6 scroll-mt-20 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm sm:p-6">
      <h3 className="text-base font-black text-slate-950 flex items-center gap-2">
        <Award className="size-5 text-red-600" />
        Loss Prevention
      </h3>
      <p className="text-xs text-slate-500 mt-1">
        Below-cost sales completed under admin override during this date range.
        Standard checkouts that would have lost money are blocked entirely.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Below-cost sales (overrides used)</p>
          <p className="mt-1 text-2xl font-black text-slate-950">{formatNumber(belowCostSaleCount)}</p>
        </div>
        <div className="rounded-xl border border-slate-100 bg-red-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-red-700">Total loss amount</p>
          <p className="mt-1 text-2xl font-black text-red-900">{formatCurrency(totalLossAmount, currency)}</p>
          <p className="mt-1 text-[10px] text-red-700">FIFO cost − effective revenue.</p>
        </div>
      </div>

      <div className="mt-4">
        <h4 className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-2">Recent overrides</h4>
        {recent.length === 0 ? (
          <p className="text-sm text-slate-400 py-2">No below-cost sales in this period. Loss prevention is doing its job.</p>
        ) : (
          <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="border-b border-slate-200 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-2">Date</th>
                  <th className="py-2">Invoice</th>
                  <th className="py-2">Product</th>
                  <th className="py-2 text-right">Loss</th>
                  <th className="py-2">Reason</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r, i) => (
                  <tr key={`${r.invoice_no}-${i}`} className="border-b border-slate-50">
                    <td className="py-2 text-slate-700">{new Date(r.created_at).toLocaleDateString("en-PK")}</td>
                    <td className="py-2 font-semibold text-slate-800">{r.invoice_no}</td>
                    <td className="py-2 text-slate-700">{r.product_name}</td>
                    <td className="py-2 text-right font-bold text-red-700">{formatCurrency(r.loss_amount, currency)}</td>
                    <td className="py-2 text-slate-600">{r.reason || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-2 md:hidden">
            {recent.map((r, i) => (
              <div key={`${r.invoice_no}-${i}`} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-800">{r.invoice_no}</p>
                    <p className="text-xs text-slate-500">{new Date(r.created_at).toLocaleDateString("en-PK")}</p>
                  </div>
                  <span className="shrink-0 font-bold text-red-700">{formatCurrency(r.loss_amount, currency)}</span>
                </div>
                <p className="mt-1 text-xs text-slate-600">Product: {r.product_name}</p>
                {r.reason && <p className="text-xs text-slate-500">Reason: {r.reason}</p>}
              </div>
            ))}
          </div>
          </>
        )}
      </div>
    </section>
  );
}
