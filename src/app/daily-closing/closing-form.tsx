"use client";

import { useActionState, useState, useRef, type FormEvent } from "react";
import { closeDayAction, reopenDayAction, type ActionState } from "./actions";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";

const initial: ActionState = { error: null, success: null };

export function CloseDayForm({
  closingDate,
  expectedCash,
  countedCashDefault,
  notesDefault,
  canWrite,
  isClosed,
  currency,
}: {
  closingDate: string;
  expectedCash: number;
  countedCashDefault?: number;
  notesDefault?: string | null;
  canWrite: boolean;
  isClosed: boolean;
  currency: string;
}) {
  const [state, action, pending] = useActionState(closeDayAction, initial);
  const [counted, setCounted] = useState<string>(
    countedCashDefault !== undefined ? String(countedCashDefault) : "",
  );

  const countedNum = Number(counted || 0);
  const liveDiff = countedNum - expectedCash;
  const fmt = (n: number) =>
    `${currency} ${n.toLocaleString("en-PK", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="closing_date" value={closingDate} />

      <label className="block">
        <span className="text-sm font-semibold text-slate-700">Counted cash (PKR)</span>
        <input
          required
          type="number"
          min={0}
          step="0.01"
          name="counted_cash"
          value={counted}
          onChange={(e) => setCounted(e.target.value)}
          disabled={!canWrite}
          className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 outline-none focus:border-blue-600"
        />
      </label>

      <div className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
        <div className="flex justify-between">
          <span>Expected cash</span>
          <span className="font-bold">{fmt(expectedCash)}</span>
        </div>
        <div className="flex justify-between">
          <span>Counted cash</span>
          <span className="font-bold">{fmt(countedNum)}</span>
        </div>
        <div className="flex justify-between border-t border-slate-200 pt-2">
          <span>Difference</span>
          <span
            className={`font-black ${
              liveDiff === 0
                ? "text-slate-900"
                : liveDiff > 0
                  ? "text-emerald-700"
                  : "text-red-700"
            }`}
          >
            {fmt(liveDiff)}
          </span>
        </div>
      </div>

      <label className="block">
        <span className="text-sm font-semibold text-slate-700">Notes (optional)</span>
        <textarea
          name="notes"
          rows={2}
          defaultValue={notesDefault ?? ""}
          disabled={!canWrite}
          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-blue-600"
        />
      </label>

      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{state.error}</p>
      )}
      {state.success && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">{state.success}</p>
      )}

      <button
        type="submit"
        disabled={!canWrite || pending}
        className="h-11 w-full rounded-lg bg-blue-700 text-sm font-bold text-white transition hover:bg-blue-800 disabled:opacity-60"
      >
        {pending ? "Saving…" : isClosed ? "Re-save closing" : "Close day"}
      </button>
    </form>
  );
}

export function ReopenDayForm({
  closingDate,
  canReopen,
}: {
  closingDate: string;
  canReopen: boolean;
}) {
  const [state, action, pending] = useActionState(reopenDayAction, initial);
  const confirm = useConfirmDialog();
  const [isConfirming, setIsConfirming] = useState(false);
  const confirmedSubmitRef = useRef(false);

  if (!canReopen) return null;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    if (confirmedSubmitRef.current) {
      confirmedSubmitRef.current = false;
      return;
    }

    e.preventDefault();

    if (isConfirming || pending) return;

    setIsConfirming(true);

    const shouldReopen = await confirm({
      title: "Reopen closed day?",
      message: "This will allow editing sales and expenses for this day again.",
      confirmLabel: "Reopen day",
      cancelLabel: "Cancel",
      variant: "destructive",
    });

    setIsConfirming(false);

    if (!shouldReopen) return;

    confirmedSubmitRef.current = true;
    e.currentTarget.requestSubmit();
  }

  return (
    <form
      action={action}
      onSubmit={handleSubmit}
      className="mt-3"
    >
      <input type="hidden" name="closing_date" value={closingDate} />
      {state.error && (
        <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{state.error}</p>
      )}
      <button
        type="submit"
        disabled={pending || isConfirming}
        className="rounded-lg border border-red-200 px-4 py-2 text-xs font-bold text-red-700 hover:bg-red-50 disabled:opacity-60"
      >
        {pending ? "Reopening…" : "Reopen this day"}
      </button>
    </form>
  );
}
