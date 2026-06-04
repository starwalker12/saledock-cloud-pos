import { CreditCard } from "lucide-react";
import { formatCurrency, formatNumber } from "@/lib/formatters";

type SalesRevenueSplitsProps = {
  currency: string;
  payments: {
    cash: number;
    card: number;
    easypaisa: number;
    jazzcash: number;
    bank_transfer: number;
    customer_credit: number;
    total: number;
  };
};

export function SalesRevenueSplits({ currency, payments }: SalesRevenueSplitsProps) {
  const methods = [
    { label: "Cash Drawer", value: payments.cash },
    { label: "Credit Card Terminal", value: payments.card },
    { label: "EasyPaisa", value: payments.easypaisa },
    { label: "JazzCash", value: payments.jazzcash },
    { label: "Bank Transfer", value: payments.bank_transfer },
    { label: "Customer Ledger (Outstanding Credit)", value: payments.customer_credit, isCredit: true },
  ];

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm sm:p-6">
      <h3 className="text-base font-black text-slate-950 flex items-center gap-2">
        <CreditCard className="size-5 text-blue-600" />
        Payment Methods Summary
      </h3>
      <p className="text-xs text-slate-500 mt-1">Sales revenue splits by cash drawer and digital rails.</p>
      <div className="mt-4 space-y-4">
        {methods.map((method) => {
          const sharePercent = payments.total > 0 ? (method.value / payments.total) * 100 : 0;
          return (
            <div key={method.label}>
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="font-semibold text-slate-700">{method.label}</span>
                <span className="font-bold text-slate-900">
                  {formatCurrency(method.value, currency)}
                  <span className="text-xs font-semibold text-slate-400 ml-1">({formatNumber(sharePercent)}%)</span>
                </span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                <div
                  className={`h-full rounded-full ${method.isCredit ? "bg-slate-500" : "bg-blue-600"}`}
                  style={{ width: `${sharePercent}%` }}
                />
              </div>
            </div>
          );
        })}
        <div className="flex justify-between pt-2 border-t border-slate-200 text-sm font-black">
          <span>Total Reconciled Methods</span>
          <span>{formatCurrency(payments.total, currency)}</span>
        </div>
      </div>
    </section>
  );
}
