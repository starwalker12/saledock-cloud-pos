"use client";

import { useActionState, useState } from "react";
import { loadDemoDataAction, removeDemoDataAction } from "./demo-actions";
import { AlertTriangle, CheckCircle, Database, RefreshCw, Trash2 } from "lucide-react";

export function DemoTab() {
  const [confirmCreate, setConfirmCreate] = useState("");
  const [confirmRemove, setConfirmRemove] = useState("");

  const [createState, createAction, isCreating] = useActionState(
    loadDemoDataAction,
    null
  );
  const [removeState, removeAction, isRemoving] = useActionState(
    removeDemoDataAction,
    null
  );

  return (
    <div className="space-y-6">
      {/* Informative Header */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-start gap-4">
          <div className="hidden rounded-xl bg-blue-50 p-3 text-blue-700 sm:block">
            <Database className="size-6" />
          </div>
          <div>
            <h3 className="text-lg font-black text-slate-950">Controlled Demonstration Seeding</h3>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Populate your organization with realistic, high-quality POS demonstration records.
              This covers categories, suppliers, stock lots, products, services, customers, invoices,
              returns, refunds, repairs, expenses, closing reports, and active audit logs.
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-slate-500">
              <span className="rounded-lg bg-slate-100 px-2.5 py-1">Org Scoped Isolation</span>
              <span className="rounded-lg bg-slate-100 px-2.5 py-1">Tagged with [DEMO] prefix</span>
              <span className="rounded-lg bg-slate-100 px-2.5 py-1">No email invitations sent</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Create Demo Data Form */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h4 className="text-md font-bold text-slate-900">Load Demo Records</h4>
          <p className="mt-1 text-xs text-slate-500">
            Seeds a standard stack of shop records. Existing actual records will not be altered.
          </p>

          <form action={createAction} className="mt-6 space-y-4">
            <div>
              <label htmlFor="create-confirm" className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                To confirm, type <span className="text-blue-700">CREATE DEMO DATA</span> below:
              </label>
              <input
                id="create-confirm"
                name="confirmation"
                type="text"
                value={confirmCreate}
                onChange={(e) => setConfirmCreate(e.target.value)}
                placeholder="CREATE DEMO DATA"
                disabled={isCreating || isRemoving}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-700 focus:bg-white"
              />
            </div>

            {createState?.error && (
              <div className="flex items-center gap-2 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800">
                <AlertTriangle className="size-4 shrink-0" />
                <span>{createState.error}</span>
              </div>
            )}

            {createState?.success && (
              <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                <CheckCircle className="size-4 shrink-0" />
                <span>{createState.message}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={confirmCreate !== "CREATE DEMO DATA" || isCreating || isRemoving}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-800 disabled:bg-slate-100 disabled:text-slate-400"
            >
              {isCreating ? (
                <>
                  <RefreshCw className="size-4 animate-spin" />
                  Generating Demo Data...
                </>
              ) : (
                <>
                  <Database className="size-4" />
                  Load Demo Data
                </>
              )}
            </button>
          </form>
        </div>

        {/* Remove Demo Data Form */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h4 className="text-md font-bold text-rose-950">Wipe Demo Records</h4>
          <p className="mt-1 text-xs text-slate-500">
            Deletes all category, supplier, product, customer, repair, closing, and invoice entries prefixed with [DEMO].
          </p>

          <form action={removeAction} className="mt-6 space-y-4">
            <div>
              <label htmlFor="remove-confirm" className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                To confirm, type <span className="text-rose-700">REMOVE DEMO DATA</span> below:
              </label>
              <input
                id="remove-confirm"
                name="confirmation"
                type="text"
                value={confirmRemove}
                onChange={(e) => setConfirmRemove(e.target.value)}
                placeholder="REMOVE DEMO DATA"
                disabled={isCreating || isRemoving}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-rose-700 focus:bg-white"
              />
            </div>

            {removeState?.error && (
              <div className="flex items-center gap-2 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800">
                <AlertTriangle className="size-4 shrink-0" />
                <span>{removeState.error}</span>
              </div>
            )}

            {removeState?.success && (
              <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                <CheckCircle className="size-4 shrink-0" />
                <span>{removeState.message}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={confirmRemove !== "REMOVE DEMO DATA" || isCreating || isRemoving}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-rose-700 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-rose-800 disabled:bg-slate-100 disabled:text-slate-400"
            >
              {isRemoving ? (
                <>
                  <RefreshCw className="size-4 animate-spin" />
                  Wiping Demo Data...
                </>
              ) : (
                <>
                  <Trash2 className="size-4" />
                  Remove Demo Data
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
