"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { updateRepairStatusAction, type ActionState } from "../actions";
import type { RepairRow } from "@/lib/data/repairs";
import type { RepairStatus } from "@/lib/validation/repairs";
import { AppSelect } from "@/components/ui/app-select";

type StatusActionState = ActionState & { reconciliationKey?: string };
const defaultState: StatusActionState = { error: null, success: null };

async function settleStatusAction(previous: StatusActionState, formData: FormData): Promise<StatusActionState> {
  const next = await updateRepairStatusAction(previous, formData);
  if (!next.success && !next.id) return next;
  return { ...next, reconciliationKey: crypto.randomUUID() };
}

const STATUS_OPTIONS = [
  { value: "received", label: "Received" },
  { value: "waiting_for_parts", label: "Waiting for Parts" },
  { value: "in_progress", label: "In Progress (Repairing)" },
  { value: "completed", label: "Ready for Delivery (Completed)" },
  { value: "delivered", label: "Delivered to Customer" },
  { value: "cancelled", label: "Cancelled" },
];

export function StatusForm({ repair }: { repair: RepairRow }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [state, formAction, isPending] = useActionState(settleStatusAction, defaultState);
  const submitLocked = useRef(false);
  const reconciledKey = useRef<string | null>(null);
  const waitingForRepair = Boolean(
    state.reconciliationKey && searchParams.get("repairstatusstate") !== state.reconciliationKey,
  );
  const [status, setStatus] = useState(repair.status);
  const [finalCost, setFinalCost] = useState(repair.final_cost || repair.estimated_cost);

  useEffect(() => {
    const key = state.reconciliationKey;
    if (!key || reconciledKey.current === key) return;
    reconciledKey.current = key;
    const url = new URL(window.location.href);
    url.searchParams.set("repairstatusstate", key);
    router.replace(`${url.pathname}${url.search}${url.hash}`, { scroll: false });
  }, [router, state.reconciliationKey]);

  useEffect(() => {
    // Keep old_status protected until fresh Server Component props arrive.
    if (!isPending && !waitingForRepair) submitLocked.current = false;
  }, [isPending, waitingForRepair, state]);

  const showFinalCost = status === "delivered" || status === "completed";
  const showDiagnosis = status === "completed" || status === "in_progress" || status === "waiting_for_parts";

  return (
    <form
      action={formAction}
      aria-busy={isPending}
      onSubmit={(event) => {
        if (submitLocked.current || isPending || waitingForRepair) {
          event.preventDefault();
          return;
        }
        submitLocked.current = true;
      }}
      className="space-y-4"
    >
      <input type="hidden" name="id" value={repair.id} />
      <input type="hidden" name="old_status" value={repair.status} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">
            Update Workflow Status
          </label>
          <AppSelect
            name="status"
            value={status}
            onChange={(nextValue) => setStatus(nextValue as RepairStatus)}
            options={STATUS_OPTIONS}
            ariaLabel="Update workflow status"
            buttonClassName="bg-amber-50/50 font-bold"
          />
        </div>

        {showFinalCost && (
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Final Repair Cost (PKR)
            </label>
            <input
              type="number"
              name="final_cost"
              min="0"
              step="1"
              value={finalCost}
              onChange={(e) => setFinalCost(parseFloat(e.target.value) || 0)}
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-blue-600 font-semibold"
            />
          </div>
        )}
      </div>

      {showDiagnosis && (
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">
            Technician Diagnosis / Action taken
          </label>
          <input
            type="text"
            name="diagnosis"
            defaultValue={repair.diagnosis ?? ""}
            placeholder="e.g. Swapped battery with new stock lot"
            className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-blue-600"
          />
        </div>
      )}

      <div>
        <label className="block text-xs font-bold text-slate-700 mb-1">
          Intake or Workflow Notes
        </label>
        <textarea
          name="status_note"
          placeholder="Describe changes or technician comments..."
          rows={2}
          className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm outline-none transition focus:border-blue-600"
        />
      </div>

      {state.error && (
        <div role="alert" className="rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-700">
          {state.error}
        </div>
      )}
      {state.success && (
        <div role="status" aria-live="polite" className="rounded-xl bg-green-50 p-3 text-xs font-semibold text-green-700">
          {state.success}
        </div>
      )}

      <button
        type="submit"
        disabled={isPending || waitingForRepair}
        className="h-10 w-full rounded-xl bg-slate-900 text-sm font-bold text-white hover:bg-slate-800 transition disabled:opacity-60"
      >
        {isPending ? "Updating status..." : waitingForRepair ? "Refreshing repair..." : "Log Status Change"}
      </button>
    </form>
  );
}
