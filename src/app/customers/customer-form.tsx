"use client";

import { useActionState, useEffect, useRef } from "react";
import { saveCustomerAction, type ActionState } from "./actions";
import type { CustomerRow } from "@/lib/data/customers";
import { Loader2 } from "lucide-react";

const initial: ActionState = { error: null, success: null };

export function CustomerForm({
  initialValues,
  onSaved,
  canWrite,
}: {
  initialValues?: Partial<CustomerRow>;
  onSaved?: () => void;
  canWrite: boolean;
}) {
  const [state, action, pending] = useActionState(saveCustomerAction, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success && !initialValues?.id) {
      formRef.current?.reset();
    }
    if (state.success) onSaved?.();
  }, [state.success, initialValues?.id, onSaved]);

  const input =
    "mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 outline-none focus:border-blue-600 disabled:bg-slate-50 disabled:text-slate-500";

  return (
    <form ref={formRef} action={action} className="grid gap-3 md:grid-cols-2">
      {initialValues?.id && <input type="hidden" name="id" value={initialValues.id} />}

      <label className="block md:col-span-2">
        <span className="text-sm font-semibold text-slate-700">Full Name <span className="text-red-500">*</span></span>
        <input
          required
          name="name"
          defaultValue={initialValues?.name ?? ""}
          disabled={!canWrite}
          className={input}
          placeholder="e.g. Muhammad Ali"
        />
      </label>

      <label className="block">
        <span className="text-sm font-semibold text-slate-700">Phone (optional)</span>
        <input
          name="phone"
          defaultValue={initialValues?.phone ?? ""}
          disabled={!canWrite}
          className={input}
          placeholder="e.g. 03001234567"
        />
      </label>

      <label className="block">
        <span className="text-sm font-semibold text-slate-700">Email (optional)</span>
        <input
          type="email"
          name="email"
          defaultValue={initialValues?.email ?? ""}
          disabled={!canWrite}
          className={input}
          placeholder="e.g. ali@gmail.com"
        />
      </label>

      <label className="block md:col-span-2">
        <span className="text-sm font-semibold text-slate-700">Address (optional)</span>
        <input
          name="address"
          defaultValue={initialValues?.address ?? ""}
          disabled={!canWrite}
          className={input}
          placeholder="e.g. Shop 12, Liberty Market, Lahore"
        />
      </label>

      <label className="block">
        <span className="text-sm font-semibold text-slate-700">Credit Limit (PKR)</span>
        <input
          type="number"
          min={0}
          step="0.01"
          name="credit_limit"
          defaultValue={initialValues?.credit_limit ?? 0}
          disabled={!canWrite}
          className={input}
        />
      </label>

      <div className="flex items-end pb-3">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="is_archived"
            defaultChecked={initialValues?.is_archived ?? false}
            disabled={!canWrite}
            className="size-4"
          />
          <span className="text-sm font-semibold text-slate-700">Archived</span>
        </label>
      </div>

      <label className="block md:col-span-2">
        <span className="text-sm font-semibold text-slate-700">Notes (optional)</span>
        <textarea
          name="notes"
          rows={2}
          defaultValue={initialValues?.notes ?? ""}
          disabled={!canWrite}
          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-blue-600 disabled:bg-slate-50"
          placeholder="Customer-specific billing or trade remarks..."
        />
      </label>

      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700 md:col-span-2">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 md:col-span-2">
          {state.success}
        </p>
      )}

      <div className="md:col-span-2">
        <button
          type="submit"
          disabled={pending || !canWrite}
          className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-lg bg-blue-700 px-4 text-sm font-bold text-white transition hover:bg-blue-800 disabled:opacity-60 md:h-10 md:w-auto cursor-pointer"
        >
          {pending ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Saving…
            </>
          ) : initialValues?.id ? (
            "Update customer"
          ) : (
            "Add customer"
          )}
        </button>
      </div>
    </form>
  );
}
