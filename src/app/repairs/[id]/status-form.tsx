"use client";

import { useActionState, useState } from "react";
import { updateRepairStatusAction } from "../actions";
import type { RepairRow } from "@/lib/data/repairs";
import type { RepairStatus } from "@/lib/validation/repairs";

const defaultState = { error: null as string | null, success: null as string | null };

export function StatusForm({ repair }: { repair: RepairRow }) {
  const [state, formAction, isPending] = useActionState(updateRepairStatusAction, defaultState);
  const [status, setStatus] = useState(repair.status);
  const [finalCost, setFinalCost] = useState(repair.final_cost || repair.estimated_cost);

  const showFinalCost = status === "delivered" || status === "completed";
  const showDiagnosis = status === "completed" || status === "in_progress" || status === "waiting_for_parts";

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="id" value={repair.id} />
      <input type="hidden" name="old_status" value={repair.status} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">
            Update Workflow Status
          </label>
          <select
            name="status"
            value={status}
            onChange={(e) => setStatus(e.target.value as RepairStatus)}
            className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-blue-600 bg-amber-50/50 font-bold"
          >
            <option value="received">Received</option>
            <option value="waiting_for_parts">Waiting for Parts</option>
            <option value="in_progress">In Progress (Repairing)</option>
            <option value="completed">Ready for Delivery (Completed)</option>
            <option value="delivered">Delivered to Customer</option>
            <option value="cancelled">Cancelled</option>
          </select>
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
        <div className="rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-700">
          {state.error}
        </div>
      )}
      {state.success && (
        <div className="rounded-xl bg-green-50 p-3 text-xs font-semibold text-green-700">
          {state.success}
        </div>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="h-10 w-full rounded-xl bg-slate-900 text-sm font-bold text-white hover:bg-slate-800 transition disabled:opacity-60"
      >
        {isPending ? "Updating status..." : "Log Status Change"}
      </button>
    </form>
  );
}
