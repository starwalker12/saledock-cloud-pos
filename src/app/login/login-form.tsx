"use client";

import { useActionState, useState } from "react";
import { signInAction, signUpAction, type AuthState } from "@/app/(auth)/actions";

const initialState: AuthState = { error: null };

type Props = {
  registrationOpen: boolean;
  callbackError?: string | null;
};

export function LoginForm({ registrationOpen, callbackError }: Props) {
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const action = mode === "sign-in" ? signInAction : signUpAction;
  const [state, formAction, pending] = useActionState(action, initialState);

  const displayError = state.error ?? (callbackError ? "Sign-in link was invalid or expired. Please try again." : null);

  return (
    <div className="space-y-5">
      {registrationOpen ? (
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1 text-sm font-semibold">
          <button
            type="button"
            onClick={() => setMode("sign-in")}
            className={`h-10 rounded-lg transition ${
              mode === "sign-in" ? "bg-white text-blue-700 shadow" : "text-slate-500"
            }`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => setMode("sign-up")}
            className={`h-10 rounded-lg transition ${
              mode === "sign-up" ? "bg-white text-blue-700 shadow" : "text-slate-500"
            }`}
          >
            Sign up
          </button>
        </div>
      ) : (
        <p className="rounded-lg bg-slate-100 px-3 py-2 text-center text-xs font-semibold text-slate-600">
          Registration is closed. Please contact the owner for access.
        </p>
      )}

      <form action={formAction} className="space-y-4">
        {mode === "sign-up" && registrationOpen && (
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Full name</span>
            <input
              required
              name="fullName"
              type="text"
              placeholder="Owner full name"
              className="mt-2 h-12 w-full rounded-xl border border-slate-200 px-4 outline-none transition focus:border-blue-600"
            />
          </label>
        )}
        <label className="block">
          <span className="text-sm font-semibold text-slate-700">Email</span>
          <input
            required
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            className="mt-2 h-12 w-full rounded-xl border border-slate-200 px-4 outline-none transition focus:border-blue-600"
          />
        </label>
        <label className="block">
          <span className="text-sm font-semibold text-slate-700">Password</span>
          <input
            required
            name="password"
            type="password"
            minLength={8}
            autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
            placeholder="At least 8 characters"
            className="mt-2 h-12 w-full rounded-xl border border-slate-200 px-4 outline-none transition focus:border-blue-600"
          />
        </label>

        {displayError && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
            {displayError}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="h-12 w-full rounded-xl bg-blue-700 text-sm font-bold text-white transition hover:bg-blue-800 disabled:opacity-60"
        >
          {pending
            ? "Please wait…"
            : mode === "sign-in"
              ? "Sign in"
              : "Create account"}
        </button>
      </form>
    </div>
  );
}
