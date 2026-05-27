"use client";

import { useActionState, useState } from "react";
import { signInAction, signUpAction, signInWithGoogleAction, signInWithFacebookAction, resetPasswordAction, type AuthState } from "@/app/(auth)/actions";

const initialState: AuthState = { error: null };

type Props = {
  callbackError?: string | null;
  publicSignupEnabled?: boolean;
  initialMode?: "sign-in" | "sign-up";
};

export function LoginForm({ callbackError, publicSignupEnabled = true, initialMode = "sign-in" }: Props) {
  const [mode, setMode] = useState<"sign-in" | "sign-up" | "forgot">(initialMode);
  const action = mode === "sign-in" ? signInAction : mode === "sign-up" ? signUpAction : resetPasswordAction;
  const [state, formAction, pending] = useActionState(action, initialState);

  const displayError = state.error ?? (callbackError ? "Sign-in link was invalid or expired. Please try again." : null);

  if (mode === "forgot") {
    return (
      <div className="space-y-5">
        <button type="button" onClick={() => setMode("sign-in")} className="text-sm font-semibold text-blue-700 hover:underline">
          &larr; Back to sign in
        </button>
        <form action={formAction} className="space-y-4">
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
          {state.info && (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
              {state.info}
            </p>
          )}
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
            {pending ? "Sending…" : "Send reset link"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className={`grid gap-2 rounded-xl bg-slate-100 p-1 text-sm font-semibold ${publicSignupEnabled ? "grid-cols-2" : "grid-cols-1"}`}>
        <button
          type="button"
          onClick={() => setMode("sign-in")}
          className={`h-10 rounded-lg transition ${
            mode === "sign-in" ? "bg-white text-blue-700 shadow" : "text-slate-500"
          }`}
        >
          Sign in
        </button>
        {publicSignupEnabled && (
          <button
            type="button"
            onClick={() => setMode("sign-up")}
            className={`h-10 rounded-lg transition ${
              mode === "sign-up" ? "bg-white text-blue-700 shadow" : "text-slate-500"
            }`}
          >
            Sign up
          </button>
        )}
      </div>

      <form action={formAction} className="space-y-4">
        {mode === "sign-up" && (
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

        {state.info && (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
            {state.info}
          </p>
        )}

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

      <div className="relative flex items-center gap-2">
        <div className="flex-1 border-t border-slate-200" />
        <span className="text-xs font-semibold text-slate-400">or</span>
        <div className="flex-1 border-t border-slate-200" />
      </div>

      <div className="flex flex-col gap-2">
        {publicSignupEnabled ? (
          <>
            <form action={async () => { await signInWithGoogleAction(initialState, new FormData()); }}>
              <button type="submit" disabled={pending} className="h-12 w-full rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 flex items-center justify-center gap-2 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">
                <svg className="size-5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                Continue with Google
              </button>
            </form>
            <form action={async () => { await signInWithFacebookAction(initialState, new FormData()); }}>
              <button type="submit" disabled={pending} className="h-12 w-full rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700 transition hover:bg-blue-50 disabled:opacity-60 flex items-center justify-center gap-2 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">
                <svg className="size-5" viewBox="0 0 24 24"><path fill="#1877F2" d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                Continue with Facebook
              </button>
            </form>
          </>
        ) : (
          <p className="text-center text-xs text-slate-400">
            New account registration is currently disabled. Contact the platform administrator.
          </p>
        )}
      </div>

      {mode === "sign-in" && (
        <button
          type="button"
          onClick={() => setMode("forgot")}
          className="block w-full text-center text-sm font-semibold text-slate-500 hover:text-blue-700"
        >
          Forgot password?
        </button>
      )}
    </div>
  );
}
