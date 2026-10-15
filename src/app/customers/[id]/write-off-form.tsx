"use client";

import {
  useOperationRequestKey,
  confirmingOperationAction,
} from "@/lib/hooks/use-operation-request-key";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { recordWriteOffAction, type ActionState } from "../actions";

const initial: ActionState = { error: null, success: null };
import { Loader2 } from "lucide-react";

export function WriteOffForm({
  customerId,
  outstandingBalance,
}: {
  customerId: string;
  outstandingBalance: number;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(
    confirmingOperationAction(
      "customer-writeoff:" + customerId,
      recordWriteOffAction,
    ),
    initial,
  );
  const requestKey = useOperationRequestKey(
    "customer-writeoff:" + customerId,
    state.success ? state : null,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
      const url = new URL(window.location.href);
      url.searchParams.set("writestate", crypto.randomUUID());
      router.replace(`${url.pathname}${url.search}`, { scroll: false });
    }
  }, [router, state]);

  const input =
    "mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 outline-none focus:border-red-600 disabled:bg-slate-50";

  return (
    <details className="group rounded-xl border border-red-200 bg-red-50/50 p-4">
      <summary className="cursor-pointer text-sm font-black text-red-800 outline-none flex items-center justify-between">
        <span>Write Off Uncollectible Credit</span>
        <span className="text-xs font-semibold px-2 py-0.5 rounded bg-red-100 group-open:hidden">
          Owner/Admin Only
        </span>
      </summary>

      <form
        ref={formRef}
        action={action}
        className="mt-4 space-y-3 pt-3 border-t border-red-100"
      >
        <input type="hidden" name="request_key" value={requestKey} />
        <input type="hidden" name="customer_id" value={customerId} />

        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
          Write-offs reduce the customer&#39;s outstanding balance but are
          recorded as bad debt in Reports/P&amp;L. They do not increase cash or
          digital collection amounts.
        </div>

        <label className="block">
          <span className="text-xs font-bold text-slate-700">
            Amount to write off
          </span>
          <input
            required
            type="number"
            min={0.01}
            max={outstandingBalance}
            step="0.01"
            name="amount"
            disabled={pending || !requestKey}
            className={input}
            placeholder={`Max: ${outstandingBalance}`}
          />
        </label>

        <label className="block">
          <span className="text-xs font-bold text-slate-700">
            Reason for write-off *
          </span>
          <textarea
            required
            name="reason"
            rows={2}
            disabled={pending || !requestKey}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-red-600 disabled:bg-slate-50"
            placeholder="e.g. Customer unreachable, deceased, disputed charge, etc."
          />
        </label>

        {state.error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
            {state.error}
          </p>
        )}
        {state.success && (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
            {state.success}
          </p>
        )}

        <button
          type="submit"
          disabled={pending || !requestKey}
          className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-red-700 text-xs font-black text-white hover:bg-red-800 transition disabled:opacity-60 cursor-pointer"
        >
          {pending ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              Processing...
            </>
          ) : (
            "Confirm Write-Off"
          )}
        </button>
      </form>
    </details>
  );
}
