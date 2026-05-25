"use client";

import { useActionState } from "react";
import { completeSetupAction, type SetupState } from "./actions";

const initial: SetupState = { error: null };

export function SetupForm({ defaultFullName }: { defaultFullName?: string }) {
  const [state, action, pending] = useActionState(completeSetupAction, initial);

  return (
    <form action={action} className="space-y-4">
      <label className="block">
        <span className="text-sm font-semibold text-slate-700">Your full name</span>
        <input
          required
          name="fullName"
          defaultValue={defaultFullName ?? ""}
          className="mt-2 h-12 w-full rounded-xl border border-slate-200 px-4 outline-none focus:border-blue-600"
        />
      </label>
      <label className="block">
        <span className="text-sm font-semibold text-slate-700">Organization name</span>
        <input
          required
          name="organizationName"
          defaultValue="Gadget Zone"
          className="mt-2 h-12 w-full rounded-xl border border-slate-200 px-4 outline-none focus:border-blue-600"
        />
      </label>
      <label className="block">
        <span className="text-sm font-semibold text-slate-700">First branch name</span>
        <input
          required
          name="branchName"
          defaultValue="Main Branch"
          className="mt-2 h-12 w-full rounded-xl border border-slate-200 px-4 outline-none focus:border-blue-600"
        />
      </label>
      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="h-12 w-full rounded-xl bg-blue-700 text-sm font-bold text-white transition hover:bg-blue-800 disabled:opacity-60"
      >
        {pending ? "Setting up…" : "Create my organization"}
      </button>
    </form>
  );
}
