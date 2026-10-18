"use client";

import {
  useEffect,
  useActionState,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  voidExpenseAction,
  restoreExpenseAction,
  type ActionState,
} from "./actions";

const initial: ActionState = { error: null, success: null };

export function VoidExpenseForm({
  id,
  revision,
}: {
  id: string;
  revision: number;
}) {
  const confirm = useConfirmDialog();
  const router = useRouter();
  const [state, action, pending] = useActionState(voidExpenseAction, initial);
  useEffect(() => {
    if (!state.success) return;
    const url = new URL(window.location.href);
    url.searchParams.set("expensestate", crypto.randomUUID());
    router.replace(`${url.pathname}${url.search}`, { scroll: false });
  }, [router, state]);

  const [confirming, setConfirming] = useState(false);
  const confirmed = useRef(false);
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (confirmed.current) {
      confirmed.current = false;
      return;
    }
    event.preventDefault();
    if (confirming || pending) return;
    const form = event.currentTarget;
    setConfirming(true);
    const approved = await confirm({
      title: "Void this expense?",
      message:
        "This expense will be marked as void and hidden from normal expense lists and reports. You can restore it later from Show voided while its cash shift remains open. Expenses in a closed cash shift cannot be changed.",
      confirmLabel: "Void expense",
      cancelLabel: "Cancel",
      variant: "destructive",
    });
    setConfirming(false);
    if (!approved) return;
    confirmed.current = true;
    form.requestSubmit();
  }
  return (
    <form action={action} onSubmit={handleSubmit}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="revision" value={state.revision ?? revision} />
      <button
        type="submit"
        disabled={confirming || pending}
        className="min-h-11 rounded-md border border-red-200 px-3 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-55"
      >
        {pending ? "Voiding..." : "Void"}
      </button>
      {state.error && (
        <p role="alert" className="mt-2 max-w-xs text-xs text-red-700">
          {state.error}
        </p>
      )}
    </form>
  );
}

export function RestoreExpenseForm({
  id,
  revision,
}: {
  id: string;
  revision: number;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(
    restoreExpenseAction,
    initial,
  );
  useEffect(() => {
    if (!state.success) return;
    const url = new URL(window.location.href);
    url.searchParams.set("expensestate", crypto.randomUUID());
    router.replace(`${url.pathname}${url.search}`, { scroll: false });
  }, [router, state]);

  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="revision" value={state.revision ?? revision} />
      <button
        type="submit"
        disabled={pending}
        className="min-h-11 rounded-md border border-emerald-200 px-3 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
      >
        {pending ? "Restoring..." : "Restore"}
      </button>
      {state.error && (
        <p role="alert" className="mt-2 max-w-xs text-xs text-red-700">
          {state.error}
        </p>
      )}
    </form>
  );
}
