"use client";

import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { useState, useRef, type FormEvent, type ReactNode } from "react";

export function ConfirmForm({
  action,
  message,
  title = "Are you sure?",
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "destructive",
  children,
}: {
  action: (formData: FormData) => void | Promise<void>;
  message: string;
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "destructive";
  children: ReactNode;
}) {
  const confirm = useConfirmDialog();
  const [isConfirming, setIsConfirming] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const confirmedSubmitRef = useRef(false);
  const submissionLockRef = useRef(false);

  async function runAction(formData: FormData) {
    setIsSubmitting(true);
    try {
      await action(formData);
    } finally {
      submissionLockRef.current = false;
      setIsSubmitting(false);
    }
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    if (confirmedSubmitRef.current) {
      confirmedSubmitRef.current = false;
      return;
    }

    e.preventDefault();

    if (isConfirming || isSubmitting || submissionLockRef.current) return;

    const form = e.currentTarget;
    setIsConfirming(true);

    const shouldProceed = await confirm({
      title,
      message,
      confirmLabel,
      cancelLabel,
      variant,
    });

    setIsConfirming(false);

    if (!shouldProceed) return;

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    submissionLockRef.current = true;
    confirmedSubmitRef.current = true;
    form.requestSubmit();
  }

  return (
    <form
      action={runAction}
      onSubmit={handleSubmit}
      aria-busy={isSubmitting || undefined}
    >
      <fieldset disabled={isConfirming || isSubmitting} className="contents">
        {children}
      </fieldset>
    </form>
  );
}
