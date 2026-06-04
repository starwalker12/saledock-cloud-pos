import { Award } from "lucide-react";
import { formatCurrency, formatNumber } from "@/lib/formatters";

type ServiceTransactionsProps = {
  currency: string;
  transactionCount: number;
  commissionEarned: number;
  principalHandled: number;
  totalCharged: number;
  byProvider: { provider: string; count: number; principal: number; commission: number }[];
  byDirection: { direction: string; count: number; principal: number; commission: number }[];
};

export function ServiceTransactions({
  currency,
  transactionCount,
  commissionEarned,
  principalHandled,
  totalCharged,
  byProvider,
  byDirection,
}: ServiceTransactionsProps) {
  return (
    <section id="service-transactions" className="mt-6 scroll-mt-20 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm sm:p-6">
      <h3 className="text-base font-black text-slate-950 flex items-center gap-2">
        <Award className="size-5 text-blue-600" />
        Service Transactions
      </h3>
      <p className="text-xs text-slate-500 mt-1">
        Mobile load, EasyPaisa, JazzCash, bank transfers, bill payments.
        <strong className="ml-1 font-semibold text-slate-700">Principal is pass-through, commission is shop income.</strong>
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Transactions</p>
          <p className="mt-1 text-2xl font-black text-slate-950">{formatNumber(transactionCount)}</p>
        </div>
        <div className="rounded-xl border border-slate-100 bg-emerald-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Commission earned</p>
          <p className="mt-1 text-2xl font-black text-emerald-900">{formatCurrency(commissionEarned, currency)}</p>
          <p className="mt-1 text-[10px] text-emerald-700">Counts toward profit.</p>
        </div>
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Principal handled</p>
          <p className="mt-1 text-2xl font-black text-slate-950">{formatCurrency(principalHandled, currency)}</p>
          <p className="mt-1 text-[10px] text-slate-500">Pass-through (NOT profit).</p>
        </div>
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total charged</p>
          <p className="mt-1 text-2xl font-black text-slate-950">{formatCurrency(totalCharged, currency)}</p>
          <p className="mt-1 text-[10px] text-slate-500">Customer-facing total.</p>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div>
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">By Provider</h4>
          {byProvider.length === 0 ? (
            <p className="text-sm text-slate-400 py-2">No service transactions recorded.</p>
          ) : (
            <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[420px] text-left text-sm">
                <thead className="border-b border-slate-200 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="py-2">Provider</th>
                    <th className="py-2 text-right">Txns</th>
                    <th className="py-2 text-right">Principal</th>
                    <th className="py-2 text-right">Commission</th>
                  </tr>
                </thead>
                <tbody>
                  {byProvider.map((row) => (
                    <tr key={row.provider} className="border-b border-slate-50">
                      <td className="py-2 font-semibold text-slate-800">{row.provider}</td>
                      <td className="py-2 text-right text-slate-700">{formatNumber(row.count)}</td>
                      <td className="py-2 text-right text-slate-700">{formatCurrency(row.principal, currency)}</td>
                      <td className="py-2 text-right font-bold text-emerald-800">+{formatCurrency(row.commission, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="space-y-2 md:hidden">
              {byProvider.map((row) => (
                <div key={row.provider} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                  <p className="font-semibold text-slate-800">{row.provider}</p>
                  <dl className="mt-1 grid grid-cols-3 gap-1 text-xs">
                    <div><dt className="text-slate-400">Txns</dt><dd className="font-semibold text-slate-700">{formatNumber(row.count)}</dd></div>
                    <div><dt className="text-slate-400">Principal</dt><dd className="font-semibold text-slate-700">{formatCurrency(row.principal, currency)}</dd></div>
                    <div><dt className="text-slate-400">Commission</dt><dd className="font-bold text-emerald-800">+{formatCurrency(row.commission, currency)}</dd></div>
                  </dl>
                </div>
              ))}
            </div>
            </>
          )}
        </div>

        <div>
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">By Direction / Type</h4>
          {byDirection.length === 0 ? (
            <p className="text-sm text-slate-400 py-2">No service transactions recorded.</p>
          ) : (
            <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[420px] text-left text-sm">
                <thead className="border-b border-slate-200 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="py-2">Direction</th>
                    <th className="py-2 text-right">Txns</th>
                    <th className="py-2 text-right">Principal</th>
                    <th className="py-2 text-right">Commission</th>
                  </tr>
                </thead>
                <tbody>
                  {byDirection.map((row) => (
                    <tr key={row.direction} className="border-b border-slate-50">
                      <td className="py-2 font-semibold text-slate-800 capitalize">{row.direction.replace(/_/g, " ")}</td>
                      <td className="py-2 text-right text-slate-700">{formatNumber(row.count)}</td>
                      <td className="py-2 text-right text-slate-700">{formatCurrency(row.principal, currency)}</td>
                      <td className="py-2 text-right font-bold text-emerald-800">+{formatCurrency(row.commission, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="space-y-2 md:hidden">
              {byDirection.map((row) => (
                <div key={row.direction} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                  <p className="font-semibold text-slate-800 capitalize">{row.direction.replace(/_/g, " ")}</p>
                  <dl className="mt-1 grid grid-cols-3 gap-1 text-xs">
                    <div><dt className="text-slate-400">Txns</dt><dd className="font-semibold text-slate-700">{formatNumber(row.count)}</dd></div>
                    <div><dt className="text-slate-400">Principal</dt><dd className="font-semibold text-slate-700">{formatCurrency(row.principal, currency)}</dd></div>
                    <div><dt className="text-slate-400">Commission</dt><dd className="font-bold text-emerald-800">+{formatCurrency(row.commission, currency)}</dd></div>
                  </dl>
                </div>
              ))}
            </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
