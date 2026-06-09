"use client";

import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { voidExpenseAction } from "./actions";
import { useState, useRef, type FormEvent } from "react";

export function VoidExpenseForm({ id }: { id: string }) {
  const confirm = useConfirmDialog();
  const [isConfirming, setIsConfirming] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const confirmedSubmitRef = useRef(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    if (confirmedSubmitRef.current) {
      confirmedSubmitRef.current = false;
      return;
    }

    e.preventDefault();

    if (isConfirming || isSubmitting) return;

    setIsConfirming(true);

    const shouldVoid = await confirm({
      title: "Void this expense?",
      message: "This expense will be hidden from reports. This action cannot be undone.",
      confirmLabel: "Void expense",
      cancelLabel: "Cancel",
      variant: "destructive",
    });

    setIsConfirming(false);

    if (!shouldVoid) return;

    confirmedSubmitRef.current = true;
    setIsSubmitting(true);
    e.currentTarget.requestSubmit();
  }

  return (
    <form action={voidExpenseAction} onSubmit={handleSubmit}>
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={isConfirming || isSubmitting}
        className="min-h-9 rounded-md border border-red-200 px-3 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-55"
      >
        {isSubmitting ? "Voiding..." : "Void"}
      </button>
    </form>
  );
}
