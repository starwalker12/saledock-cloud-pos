import { CalendarCheck } from "lucide-react";
import { formatCurrency, formatNumber } from "@/lib/formatters";

type DailyClosingProps = {
  currency: string;
  closedDaysCount: number;
  openDaysCount: number;
  totalCashDifference: number;
  recentClosings: { date: string; bills_count: number; expected: number; actual?: number; difference: number }[];
  fmtDay: (d: string) => string;
};

export function DailyClosing({
  currency,
  closedDaysCount,
  openDaysCount,
  totalCashDifference,
  recentClosings,
  fmtDay,
}: DailyClosingProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm sm:p-6">
      <h3 className="text-base font-black text-slate-950 flex items-center gap-2">
        <CalendarCheck className="size-5 text-blue-600" />
        Daily closings Auditor
      </h3>
      <p className="text-xs text-slate-500 mt-1">Audit status of business days and physical cash discrepancies.</p>
      <div className="mt-4 space-y-4">
        <div className="grid gap-3 sm:grid-cols-3 sm:gap-4">
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-center">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Closed Days</p>
            <p className="mt-1 text-xl font-black text-slate-900">{formatNumber(closedDaysCount)}</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-center">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Open Days</p>
            <p className="mt-1 text-xl font-black text-amber-800">{formatNumber(openDaysCount)}</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-center">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Drawer Diff</p>
            <p className={`mt-1 text-xl font-black ${totalCashDifference === 0 ? "text-slate-500" : totalCashDifference > 0 ? "text-emerald-700" : "text-red-700"}`}>
              {formatCurrency(totalCashDifference, currency)}
            </p>
          </div>
        </div>

        <div>
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Recent Logs</h4>
          {recentClosings.length === 0 ? (
            <div className="text-center text-sm text-slate-400 py-4 border border-dashed border-slate-100 rounded-xl">
              No daily closing logs compiled.
            </div>
          ) : (
            <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[520px] text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 font-semibold text-slate-500 uppercase">
                    <th className="py-2">Date</th>
                    <th className="py-2 text-right">Bills</th>
                    <th className="py-2 text-right">Expected Cash</th>
                    <th className="py-2 text-right">Difference</th>
                  </tr>
                </thead>
                <tbody>
                  {recentClosings.map((c) => (
                    <tr key={c.date} className="border-b border-slate-50 py-1">
                      <td className="py-2 font-semibold text-slate-800">{fmtDay(c.date)}</td>
                      <td className="py-2 text-right font-medium text-slate-900">{formatNumber(c.bills_count)}</td>
                      <td className="py-2 text-right font-medium text-slate-900">{formatCurrency(c.expected, currency)}</td>
                      <td className={`py-2 text-right font-bold ${c.difference === 0 ? "text-slate-500" : c.difference > 0 ? "text-emerald-700" : "text-red-700"}`}>
                        {c.difference > 0 ? "+" : ""}{formatCurrency(c.difference, currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="space-y-2 md:hidden">
              {recentClosings.map((c) => (
                <div key={c.date} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                  <p className="text-sm font-semibold text-slate-800">{fmtDay(c.date)}</p>
                  <dl className="mt-1 grid grid-cols-3 gap-1 text-xs">
                    <div><dt className="text-slate-400">Bills</dt><dd className="font-semibold text-slate-900">{formatNumber(c.bills_count)}</dd></div>
                    <div><dt className="text-slate-400">Expected</dt><dd className="font-semibold text-slate-900">{formatCurrency(c.expected, currency)}</dd></div>
                    <div>
                      <dt className="text-slate-400">Diff</dt>
                      <dd className={`font-bold ${c.difference === 0 ? "text-slate-500" : c.difference > 0 ? "text-emerald-700" : "text-red-700"}`}>
                        {c.difference > 0 ? "+" : ""}{formatCurrency(c.difference, currency)}
                      </dd>
                    </div>
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
