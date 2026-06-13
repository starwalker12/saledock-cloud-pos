"use client";

import { useActionState, useEffect, useRef } from "react";
import { saveSupplierAction, type ActionState } from "./actions";
import type { SupplierRow } from "@/lib/data/catalog";
import { Loader2 } from "lucide-react";

const initial: ActionState = { error: null, success: null };

export function SupplierForm({
  initialValues,
  onSaved,
  canWrite,
}: {
  initialValues?: Partial<SupplierRow>;
  onSaved?: () => void;
  canWrite: boolean;
}) {
  const [state, action, pending] = useActionState(saveSupplierAction, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success && !initialValues?.id) formRef.current?.reset();
    if (state.success) onSaved?.();
  }, [state.success, initialValues?.id, onSaved]);

  const input = "mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 outline-none focus:border-blue-600";

  return (
    <form ref={formRef} action={action} className="grid gap-3 sm:grid-cols-2">
      {initialValues?.id && <input type="hidden" name="id" value={initialValues.id} />}
      <label className="block">
        <span className="text-sm font-semibold text-slate-700">Name <span className="text-red-500">*</span></span>
        <input required name="name" defaultValue={initialValues?.name ?? ""} disabled={!canWrite} className={input} />
      </label>
      <label className="block">
        <span className="text-sm font-semibold text-slate-700">Company (optional)</span>
        <input name="company" defaultValue={initialValues?.company ?? ""} disabled={!canWrite} className={input} />
      </label>
      <label className="block">
        <span className="text-sm font-semibold text-slate-700">Phone (optional)</span>
        <input name="phone" defaultValue={initialValues?.phone ?? ""} disabled={!canWrite} className={input} />
      </label>
      <label className="block">
        <span className="text-sm font-semibold text-slate-700">Email (optional)</span>
        <input type="email" name="email" defaultValue={initialValues?.email ?? ""} disabled={!canWrite} className={input} />
      </label>
      <label className="block sm:col-span-2">
        <span className="text-sm font-semibold text-slate-700">Address (optional)</span>
        <input name="address" defaultValue={initialValues?.address ?? ""} disabled={!canWrite} className={input} />
      </label>
      <label className="block sm:col-span-2">
        <span className="text-sm font-semibold text-slate-700">Notes (optional)</span>
        <textarea name="notes" rows={2} defaultValue={initialValues?.notes ?? ""} disabled={!canWrite} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-blue-600" />
      </label>
      <label className="flex items-center gap-2 sm:col-span-2">
        <input type="checkbox" name="is_active" defaultChecked={initialValues?.is_active ?? true} disabled={!canWrite} className="size-4" />
        <span className="text-sm font-semibold text-slate-700">Active</span>
      </label>
      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700 sm:col-span-2">{state.error}</p>
      )}
      {state.success && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 sm:col-span-2">{state.success}</p>
      )}
      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={pending || !canWrite}
          className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-blue-700 px-4 text-sm font-bold text-white transition hover:bg-blue-800 disabled:opacity-60 cursor-pointer"
        >
          {pending ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Saving…
            </>
          ) : initialValues?.id ? (
            "Update supplier"
          ) : (
            "Add supplier"
          )}
        </button>
      </div>
    </form>
  );
}
