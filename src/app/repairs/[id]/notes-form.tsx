"use client";

import { useActionState } from "react";
import { saveDiagnosisAndNotesAction } from "../actions";
import type { RepairRow } from "@/lib/data/repairs";

const defaultState = { error: null as string | null, success: null as string | null };

export function NotesForm({ repair }: { repair: RepairRow }) {
  const [state, formAction, isPending] = useActionState(saveDiagnosisAndNotesAction, defaultState);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="id" value={repair.id} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">
            General Diagnosis
          </label>
          <textarea
            name="diagnosis"
            defaultValue={repair.diagnosis ?? ""}
            placeholder="Technical details of faults found..."
            rows={3}
            className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm outline-none transition focus:border-blue-600"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">
            Internal Shop Notes
          </label>
          <textarea
            name="notes"
            defaultValue={repair.notes ?? ""}
            placeholder="Shop-only notes, private from customer receipts..."
            rows={3}
            className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm outline-none transition focus:border-blue-600"
          />
        </div>
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

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isPending}
          className="h-10 rounded-xl bg-blue-700 px-5 text-sm font-bold text-white hover:bg-blue-800 transition disabled:opacity-60"
        >
          {isPending ? "Saving notes..." : "Save Job Notes"}
        </button>
      </div>
    </form>
  );
}
