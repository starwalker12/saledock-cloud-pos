"use client";

import {
  useActionState,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { SUPPLIER_PAYMENT_METHODS, type SupplierPaymentMethod } from "@/lib/validation/supplier-purchases";
import {
  recordSupplierPaymentAction,
  type SupplierPaymentActionState,
} from "../actions";
import { Loader2 } from "lucide-react";
import { AppSelect } from "@/components/ui/app-select";

const PAYMENT_LABELS: Record<SupplierPaymentMethod, string> = {
  cash: "Cash",
  card: "Card",
  easypaisa: "EasyPaisa",
  jazzcash: "JazzCash",
  bank_transfer: "Bank transfer",
};
const PAYMENT_OPTIONS = SUPPLIER_PAYMENT_METHODS.map((m) => ({
  value: m,
  label: PAYMENT_LABELS[m],
}));
const initialState: SupplierPaymentActionState = {
  error: null,
  success: null,
  payment_id: null,
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
  const [clientError, setClientError] = useState<string | null>(null);
  const paymentAction = useCallback(
    async (previous: SupplierPaymentActionState, formData: FormData) => {
      const next = await recordSupplierPaymentAction(previous, formData);
      if (next.success) {
        setAmount(0);
        setRef("");
        setNote("");
      }
      return next;
    },
    [],
  );
  const [state, action, pending] = useActionState(paymentAction, initialState);
  const submissionLocked = useRef(false);

  useEffect(() => {
    if (!state.success) return;
    const url = new URL(window.location.href);
    url.searchParams.set("suppaystate", crypto.randomUUID());
    router.replace(`${url.pathname}${url.search}`, { scroll: false });
  }, [router, state.success]);

  useEffect(() => {
    if (!pending) {
      submissionLocked.current = false;
    }
  }, [pending]);

  const submit = (e: React.FormEvent) => {
    if (submissionLocked.current) {
      e.preventDefault();
      return;
    }
    setClientError(null);
    if (amount <= 0) {
      e.preventDefault();
      setClientError("Amount must be greater than 0.");
      return;
    }
    if (maxAmount !== undefined && amount > maxAmount + 0.0001) {
      e.preventDefault();
      setClientError(`Amount cannot exceed Rs ${maxAmount}.`);
      return;
    }
    submissionLocked.current = true;
  };

  return (
    <form action={action} onSubmit={submit} className="space-y-3">
      <input type="hidden" name="supplier_id" value={supplierId} />
      <input type="hidden" name="purchase_id" value={purchaseId ?? ""} />
      <label className="block">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Amount *</span>
        <input
          type="number"
          min={0}
          step="0.01"
          name="amount"
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
        <AppSelect
          name="method"
          value={method}
          onChange={(nextValue) => setMethod(nextValue as SupplierPaymentMethod)}
          options={PAYMENT_OPTIONS}
          ariaLabel="Payment method"
          className="mt-1"
        />
      </label>
      <label className="block">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Reference (optional)</span>
        <input
          name="reference_no"
          value={ref}
          onChange={(e) => setRef(e.target.value)}
          className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3"
        />
      </label>
      <label className="block">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Note (optional)</span>
        <textarea
          name="note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
        />
      </label>

      {(clientError || state.error) && (
        <p
          role="alert"
          className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700"
        >
          {clientError || state.error}
        </p>
      )}
      {state.success && (
        <p
          role="status"
          aria-live="polite"
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700"
        >
          {state.success}
        </p>
      )}

      <button
        type="submit"
        disabled={pending || amount <= 0}
        className="inline-flex items-center justify-center gap-1.5 w-full rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-blue-800 disabled:opacity-50 cursor-pointer"
      >
        {pending ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Recording…
          </>
        ) : (
          "Record payment"
        )}
      </button>
    </form>
  );
}
