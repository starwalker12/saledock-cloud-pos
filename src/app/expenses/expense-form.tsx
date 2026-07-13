"use client";

import { useActionState, useEffect, useRef } from "react";
import { saveExpenseAction, type ActionState } from "./actions";
import {
  EXPENSE_PAYMENT_METHODS,
  SUGGESTED_CATEGORIES,
} from "@/lib/validation/expenses";
import type { ExpenseRow } from "@/lib/data/expenses";
import { Loader2 } from "lucide-react";
import { AppSelect } from "@/components/ui/app-select";

const initial: ActionState = { error: null, success: null };

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Cash",
  card: "Card",
  easypaisa: "EasyPaisa",
  jazzcash: "JazzCash",
  bank_transfer: "Bank transfer",
};

function toLocalDateTimeInput(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  const tz = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 16);
}

export function ExpenseForm({
  initialValues,
  knownCategories,
  canWrite,
}: {
  initialValues?: Partial<ExpenseRow>;
  knownCategories: string[];
  canWrite: boolean;
}) {
  const [state, action, pending] = useActionState(saveExpenseAction, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success && !initialValues?.id) formRef.current?.reset();
  }, [state.success, initialValues?.id]);

  const input =
    "mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 outline-none focus:border-blue-600";

  const allCategories = [
    ...new Set([...knownCategories, ...SUGGESTED_CATEGORIES]),
  ].sort((a, b) => a.localeCompare(b));
  const paymentOptions = EXPENSE_PAYMENT_METHODS.map((m) => ({
    value: m,
    label: PAYMENT_LABELS[m] ?? m,
  }));

  return (
    <form ref={formRef} action={action} className="grid gap-3 sm:grid-cols-2">
      {initialValues?.id && <input type="hidden" name="id" value={initialValues.id} />}

      <label className="block">
        <span className="text-sm font-semibold text-slate-700">Category <span className="text-red-500">*</span></span>
        <input
          required
          name="category"
          list="expense-category-options"
          defaultValue={initialValues?.category ?? ""}
          disabled={!canWrite}
          placeholder="e.g. Rent, Utilities, Marketing"
          className={input}
        />
        <datalist id="expense-category-options">
          {allCategories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </label>

      <label className="block">
        <span className="text-sm font-semibold text-slate-700">Amount (PKR) <span className="text-red-500">*</span></span>
        <input
          required
          type="number"
          min={0.01}
          step="0.01"
          name="amount"
          defaultValue={initialValues?.amount ?? ""}
          disabled={!canWrite}
          className={input}
        />
      </label>

      <label className="block">
        <span className="text-sm font-semibold text-slate-700">Payment method</span>
        <AppSelect
          name="payment_method"
          defaultValue={initialValues?.payment_method ?? "cash"}
          disabled={!canWrite}
          options={paymentOptions}
          ariaLabel="Payment method"
          className="mt-1"
          buttonClassName="h-11"
        />
      </label>

      <label className="block">
        <span className="text-sm font-semibold text-slate-700">Date &amp; time</span>
        <input
          type="datetime-local"
          name="spent_at"
          defaultValue={toLocalDateTimeInput(initialValues?.spent_at)}
          disabled={!canWrite}
          className={input}
        />
      </label>

      <label className="block sm:col-span-2">
        <span className="text-sm font-semibold text-slate-700">Vendor / paid to (optional)</span>
        <input
          name="vendor_name"
          defaultValue={initialValues?.vendor_name ?? ""}
          disabled={!canWrite}
          className={input}
        />
      </label>

      <label className="block sm:col-span-2">
        <span className="text-sm font-semibold text-slate-700">Notes (optional)</span>
        <textarea
          name="notes"
          rows={2}
          defaultValue={initialValues?.notes ?? ""}
          disabled={!canWrite}
          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-blue-600"
        />
      </label>

      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700 sm:col-span-2">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 sm:col-span-2">
          {state.success}
        </p>
      )}

      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={pending || !canWrite}
          className="inline-flex h-11 items-center justify-center gap-1.5 rounded-lg bg-blue-700 px-4 text-sm font-bold text-white transition hover:bg-blue-800 disabled:opacity-60 cursor-pointer"
        >
          {pending ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Saving…
            </>
          ) : initialValues?.id ? (
            "Update expense"
          ) : (
            "Add expense"
          )}
        </button>
      </div>
    </form>
  );
}
