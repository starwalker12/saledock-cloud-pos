"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SUPPLIER_PAYMENT_METHODS, type SupplierPaymentMethod } from "@/lib/validation/supplier-purchases";
import { recordSupplierPaymentAction } from "../actions";

const PAYMENT_LABELS: Record<SupplierPaymentMethod, string> = {
  cash: "Cash",
  card: "Card",
  easypaisa: "EasyPaisa",
  jazzcash: "JazzCash",
  bank_transfer: "Bank transfer",
};

export function RecordPaymentForm({
  supplierId,
  purchaseId,
  maxAmount,
}: {
  supplierId: string;
  purchaseId?: string;
  maxAmount?: number;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState<number>(maxAmount ?? 0);
  const [method, setMethod] = useState<SupplierPaymentMethod>("cash");
  const [ref, setRef] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (amount <= 0) {
      setError("Amount must be greater than 0.");
      return;
    }
    if (maxAmount !== undefined && amount > maxAmount + 0.0001) {
      setError(`Amount cannot exceed Rs ${maxAmount}.`);
      return;
    }
    startTransition(async () => {
      const res = await recordSupplierPaymentAction({
        supplier_id: supplierId,
        purchase_id: purchaseId,
        method,
        amount,
        reference_no: ref || null,
        note: note || null,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSuccess("Payment recorded.");
      setAmount(0);
      setRef("");
      setNote("");
      router.refresh();
    });
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Amount *</span>
        <input
          type="number"
          min={0}
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(Math.max(0, Number(e.target.value || 0)))}
          className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3"
          required
        />
        {maxAmount !== undefined && (
          <span className="mt-1 block text-[10px] text-slate-500">Max Rs {maxAmount.toLocaleString()}</span>
        )}
      </label>
      <label className="block">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Method</span>
        <select
          value={method}
          onChange={(e) => setMethod(e.target.value as SupplierPaymentMethod)}
          className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3"
        >
          {SUPPLIER_PAYMENT_METHODS.map((m) => (
            <option key={m} value={m}>
              {PAYMENT_LABELS[m]}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Reference (optional)</span>
        <input
          value={ref}
          onChange={(e) => setRef(e.target.value)}
          className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3"
        />
      </label>
      <label className="block">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Note (optional)</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
        />
      </label>

      {error && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
          {error}
        </p>
      )}
      {success && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
          {success}
        </p>
      )}

      <button
        type="submit"
        disabled={pending || amount <= 0}
        className="w-full rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-blue-800 disabled:opacity-50"
      >
        {pending ? "Recording…" : "Record payment"}
      </button>
    </form>
  );
}
