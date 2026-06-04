import { Wallet } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";

type ExpensesBreakdownProps = {
  currency: string;
  expensesByCategory: { category: string; amount: number }[];
  expensesByPaymentMethod: { method: string; amount: number }[];
};

export function ExpensesBreakdown({ currency, expensesByCategory, expensesByPaymentMethod }: ExpensesBreakdownProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm sm:p-6">
      <h3 className="text-base font-black text-slate-950 flex items-center gap-2">
        <Wallet className="size-5 text-blue-600" />
        Operating Expenses Breakdown
      </h3>
      <p className="text-xs text-slate-500 mt-1">Summary of active expenditures during this cycle.</p>
      {expensesByCategory.length === 0 ? (
        <div className="mt-8 text-center text-sm text-slate-400 py-6">No expenses logged in this range.</div>
      ) : (
        <div className="mt-4 space-y-4">
          <div>
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">By Category</h4>
            <div className="space-y-2">
              {expensesByCategory.map((c) => (
                <div key={c.category} className="flex flex-wrap justify-between gap-2 border-b border-slate-50 py-1.5 text-sm">
                  <span className="text-slate-600 font-semibold">{c.category}</span>
                  <span className="font-bold text-slate-950">{formatCurrency(c.amount, currency)}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="pt-2">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">By Payment Method</h4>
            <div className="space-y-2">
              {expensesByPaymentMethod.map((m) => (
                <div key={m.method} className="flex flex-wrap justify-between gap-2 border-b border-slate-50 py-1.5 text-sm">
                  <span className="text-slate-600 font-semibold capitalize">{m.method}</span>
                  <span className="font-bold text-slate-950">{formatCurrency(m.amount, currency)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
