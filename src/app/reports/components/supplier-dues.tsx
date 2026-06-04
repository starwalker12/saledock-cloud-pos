import Link from "next/link";
import { Truck } from "lucide-react";
import { formatCurrency, formatNumber } from "@/lib/formatters";

type SupplierDuesProps = {
  currency: string;
  monthTotal: number;
  monthCount: number;
  unpaidTotal: number;
  unpaidCount: number;
  totalSupplierDues: number;
  topSupplierDues: { id: string; name: string; company: string | null; outstanding_balance: number }[];
};

export function SupplierDues({
  currency,
  monthTotal,
  monthCount,
  unpaidTotal,
  unpaidCount,
  totalSupplierDues,
  topSupplierDues,
}: SupplierDuesProps) {
  return (
    <section id="supplier-dues" className="mt-6 scroll-mt-20 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm sm:p-6">
      <h3 className="text-base font-black text-slate-950 flex items-center gap-2">
        <Truck className="size-5 text-blue-600" />
        Supplier Dues & Purchases Snapshot
      </h3>
      <p className="text-xs text-slate-500 mt-1">
        Stock purchases create inventory value (not expenses). Dues are settled via supplier payments.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Purchases this month</p>
          <p className="mt-1 text-xl font-black text-slate-900">{formatCurrency(monthTotal, currency)}</p>
          <p className="text-xs text-slate-500">{formatNumber(monthCount)} purchase(s)</p>
        </div>
        <div className="rounded-xl border border-rose-100 bg-rose-50/50 p-3">
          <p className="text-[10px] font-bold text-rose-800 uppercase tracking-wider">Unpaid purchases</p>
          <p className="mt-1 text-xl font-black text-rose-900">{formatCurrency(unpaidTotal, currency)}</p>
          <p className="text-xs text-rose-600">{formatNumber(unpaidCount)} purchase(s) with balance</p>
        </div>
        <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-3">
          <p className="text-[10px] font-bold text-amber-800 uppercase tracking-wider">Total supplier dues</p>
          <p className="mt-1 text-xl font-black text-amber-900">{formatCurrency(totalSupplierDues, currency)}</p>
          <p className="text-xs text-amber-700">{topSupplierDues.length} supplier(s) owed</p>
        </div>
      </div>

      {topSupplierDues.length > 0 && (
        <div className="mt-5">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Top dues</h4>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs font-semibold uppercase text-slate-500">
                  <th className="py-2">Supplier</th>
                  <th className="py-2 text-right">Outstanding</th>
                  <th className="py-2 text-right" />
                </tr>
              </thead>
              <tbody>
                {topSupplierDues.map((s) => (
                  <tr key={s.id} className="border-b border-slate-50">
                    <td className="py-2 font-semibold text-slate-800">
                      {s.name}
                      {s.company ? <span className="ml-2 text-xs text-slate-500">{s.company}</span> : null}
                    </td>
                    <td className="py-2 text-right font-bold text-rose-700">
                      {formatCurrency(s.outstanding_balance, currency)}
                    </td>
                    <td className="py-2 text-right">
                      <Link href={`/suppliers/${s.id}/ledger`} className="text-xs font-semibold text-blue-700 underline">
                        Ledger
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-2 md:hidden">
            {topSupplierDues.map((s) => (
              <div key={s.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-800">{s.name}</p>
                    {s.company && <p className="text-xs text-slate-500">{s.company}</p>}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-bold text-rose-700">{formatCurrency(s.outstanding_balance, currency)}</p>
                    <Link href={`/suppliers/${s.id}/ledger`} className="text-xs font-semibold text-blue-700 underline">
                      Ledger
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
