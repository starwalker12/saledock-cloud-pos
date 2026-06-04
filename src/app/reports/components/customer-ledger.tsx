import { Scale } from "lucide-react";
import { formatCurrency, formatNumber } from "@/lib/formatters";

type CustomerLedgerProps = {
  currency: string;
  debtorCount: number;
  creditPaymentsReceived: number;
  creditWriteOffs: number;
  topDebtors: { name: string; phone: string | null; balance: number }[];
  totalOutstandingBalance: number;
};

export function CustomerLedger({
  currency,
  debtorCount,
  creditPaymentsReceived,
  creditWriteOffs,
  topDebtors,
  totalOutstandingBalance,
}: CustomerLedgerProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm sm:p-6">
      <h3 className="text-base font-black text-slate-950 flex items-center gap-2">
        <Scale className="size-5 text-blue-600" />
        Customer Outstanding Ledger
      </h3>
      <p className="text-xs text-slate-500 mt-1">Outstanding debt books and settlement recovery cycles.</p>
      <div className="mt-4 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Debtor Accounts</p>
            <p className="mt-1 text-2xl font-black text-slate-900">{formatNumber(debtorCount)}</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Ledger Debt Settlements</p>
            <p className="mt-1 text-2xl font-black text-emerald-800">+{formatCurrency(creditPaymentsReceived, currency)}</p>
          </div>
          <div className="rounded-xl border border-rose-100 bg-rose-50/50 p-4">
            <p className="text-xs font-bold text-rose-800 uppercase tracking-wider">Credit Write-offs</p>
            <p className="mt-1 text-2xl font-black text-rose-900">{formatCurrency(creditWriteOffs, currency)}</p>
          </div>
        </div>
        <div>
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Top Debt Outstanding Profiles</h4>
          {topDebtors.length === 0 ? (
            <div className="text-center text-sm text-slate-400 py-4 border border-dashed border-slate-100 rounded-xl">
              No active debtors on ledger.
            </div>
          ) : (
            <div className="space-y-2">
              {topDebtors.map((d) => (
                <div key={d.name} className="flex flex-wrap justify-between gap-2 border-b border-slate-50 py-1.5 text-sm">
                  <div className="min-w-0">
                    <p className="break-words font-semibold text-slate-800">{d.name}</p>
                    <p className="text-xs text-slate-400">{d.phone ?? "No phone"}</p>
                  </div>
                  <span className="font-bold text-slate-950">{formatCurrency(d.balance, currency)}</span>
                </div>
              ))}
              <div className="flex flex-wrap justify-between gap-2 border-t border-slate-200 pt-3 text-sm font-black">
                <span>Total Debts Outstanding</span>
                <span className="text-slate-950">{formatCurrency(totalOutstandingBalance, currency)}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
