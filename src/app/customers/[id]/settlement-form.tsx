"use client";

import { useActionState, useEffect, useRef } from "react";
import { recordCreditPaymentAction, type ActionState } from "../actions";
import { CREDIT_PAYMENT_METHODS } from "@/lib/validation/customers";
import { Loader2 } from "lucide-react";
import { AppSelect } from "@/components/ui/app-select";

const initial: ActionState = { error: null, success: null };
const PAYMENT_OPTIONS = CREDIT_PAYMENT_METHODS.map((method) => ({
  value: method,
  label: method.toUpperCase().replace("_", " "),
}));

export function SettlementForm({
  customerId,
  outstandingBalance,
}: {
  customerId: string;
  outstandingBalance: number;
}) {
  const [state, action, pending] = useActionState(recordCreditPaymentAction, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
    }
  }, [state.success]);

  const input =
    "mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 outline-none focus:border-blue-600 disabled:bg-slate-50";

  return (
    <details className="group rounded-xl border border-blue-200 bg-blue-50/50 p-4">
      <summary className="cursor-pointer text-sm font-black text-blue-800 outline-none flex items-center justify-between">
        <span>Receive Settlement Payment</span>
        <span className="text-xs font-semibold px-2 py-0.5 rounded bg-blue-100 group-open:hidden">
          Record Payment
        </span>
      </summary>

      <form ref={formRef} action={action} className="mt-4 space-y-3 pt-3 border-t border-blue-100">
        <input type="hidden" name="customer_id" value={customerId} />

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-bold text-slate-700">Amount (PKR)</span>
            <input
              required
              type="number"
              min={0.01}
              max={outstandingBalance}
              step="0.01"
              name="amount"
              disabled={pending}
              className={input}
              placeholder={`Max: ${outstandingBalance}`}
            />
          </label>

          <label className="block">
            <span className="text-xs font-bold text-slate-700">Payment Method</span>
            <AppSelect
              name="method"
              defaultValue={CREDIT_PAYMENT_METHODS[0]}
              required
              disabled={pending}
              options={PAYMENT_OPTIONS}
              ariaLabel="Payment method"
              className="mt-1"
            />
          </label>
        </div>

        <label className="block">
          <span className="text-xs font-bold text-slate-700">Reference No (optional)</span>
          <input
            name="reference_number"
            disabled={pending}
            className={input}
            placeholder="e.g. Bank slip or Transaction ID"
          />
        </label>

        <label className="block">
          <span className="text-xs font-bold text-slate-700">Notes (optional)</span>
          <input
            name="notes"
            disabled={pending}
            className={input}
            placeholder="e.g. Partial recovery or Monthly clearance"
          />
        </label>

        {state.error && (
          <p
            role="alert"
            className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700"
          >
            {state.error}
          </p>
        )}
        {state.success && (
          <p
            role="status"
            aria-live="polite"
            className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700"
          >
            {state.success}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-blue-700 text-xs font-black text-white hover:bg-blue-800 transition disabled:opacity-60 cursor-pointer"
        >
          {pending ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              Processing...
            </>
          ) : (
            "Confirm & Save Settlement"
          )}
        </button>
      </form>
    </details>
  );
}
