"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { recordSupplierWriteOffAction } from "@/app/suppliers/purchases/actions";

export function SupplierWriteOffForm({
  supplierId,
  maxAmount,
}: {
  supplierId: string;
  maxAmount: number;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState<number>(maxAmount);
  const [reason, setReason] = useState<string>("");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!confirming) {
      setConfirming(true);
      return;
    }
    if (amount <= 0) {
      setError("Amount must be greater than 0.");
      setConfirming(false);
      return;
    }
    if (amount > maxAmount + 0.0001) {
      setError(`Amount cannot exceed Rs ${maxAmount}.`);
      setConfirming(false);
      return;
    }
    if (!reason.trim()) {
      setError("A reason is required.");
      setConfirming(false);
      return;
    }
    startTransition(async () => {
      const res = await recordSupplierWriteOffAction(supplierId, amount, reason.trim());
      if (!res.ok) {
        setError(res.error);
        setConfirming(false);
        return;
      }
      setSuccess("Write-off recorded.");
      setAmount(0);
      setReason("");
      setConfirming(false);
      router.refresh();
    });
  };

  const cancelConfirm = () => {
    setConfirming(false);
    setError(null);
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
          disabled={confirming}
        />
        <span className="mt-1 block text-[10px] text-slate-500">Max Rs {maxAmount.toLocaleString()}</span>
      </label>
      <label className="block">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Reason *</span>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
          placeholder="Why is this being written off?"
          required
          disabled={confirming}
        />
      </label>

      {confirming && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
          <p className="font-bold text-amber-900">Confirm write-off</p>
          <p className="mt-1 text-amber-800">
            This will reduce the supplier&apos;s outstanding balance by <strong>Rs {amount.toLocaleString()}</strong>.
            This action is traceable but cannot be reversed.
          </p>
        </div>
      )}

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

      <div className="flex gap-2">
        {confirming ? (
          <>
            <button
              type="button"
              onClick={cancelConfirm}
              disabled={pending}
              className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="flex-1 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-rose-700 disabled:opacity-50"
            >
              {pending ? "Writing off…" : "Confirm write-off"}
            </button>
          </>
        ) : (
          <button
            type="submit"
            disabled={amount <= 0 || !reason.trim()}
            className="w-full rounded-xl border border-rose-200 bg-white px-4 py-2.5 text-sm font-bold text-rose-700 shadow-sm hover:bg-rose-50 disabled:opacity-50"
          >
            Write off balance
          </button>
        )}
      </div>
    </form>
  );
}
