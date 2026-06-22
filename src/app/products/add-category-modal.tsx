"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { FormModal } from "@/components/ui/form-modal";
import { saveCategoryAction, type ActionState } from "./actions";

const initial: ActionState = { error: null, success: null };

export function AddCategoryModal({
  open,
  onClose,
  onSaved,
  canWrite,
}: {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
  canWrite: boolean;
}) {
  const [state, action, pending] = useActionState(saveCategoryAction, initial);
  const formRef = useRef<HTMLFormElement>(null);
  const [name, setName] = useState("");

  useEffect(() => {
    if (state.success) {
      onSaved?.();
      onClose();
    }
  }, [state.success, onClose, onSaved]);

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title="Add category"
      description="Create a new category to organize products."
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="category-form"
            disabled={pending || !canWrite || !name.trim()}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-blue-700 px-5 text-sm font-bold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {pending && <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />}
            Add category
          </button>
        </>
      }
    >
      <form
        id="category-form"
        ref={formRef}
        action={action}
        className="grid gap-4"
      >
        <label className="block">
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            Name <span className="text-red-500">*</span>
          </span>
          <input
            required
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!canWrite || pending}
            autoFocus={open}
            className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-[#fff] px-3 text-sm text-slate-900 outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </label>
        <label className="block">
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Description (optional)</span>
          <textarea
            name="description"
            rows={3}
            disabled={!canWrite || pending}
            className="mt-1 w-full resize-y rounded-lg border border-slate-200 bg-[#fff] px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="is_active"
            defaultChecked
            disabled={!canWrite || pending}
            className="size-4"
          />
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Active</span>
        </label>
        {state.error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {state.error}
          </p>
        )}
      </form>
    </FormModal>
  );
}
