"use client";

import { useActionState, useState, useRef, useCallback } from "react";
import {
  signInAction,
  signUpAction,
  signInWithGoogleAction,
  signInWithFacebookAction,
  resetPasswordAction,
  type AuthState,
} from "@/app/(auth)/actions";
import { Recaptcha, type RecaptchaStatus } from "@/components/auth/recaptcha";
import { useLanguage } from "@/lib/i18n/language-provider";

const initialState: AuthState = { error: null };

type Props = {
  callbackError?: string | null;
  publicSignupEnabled?: boolean;
  initialMode?: "sign-in" | "sign-up";
};

const FACEBOOK_SCOPE_HELP =
  "Facebook login is almost ready, but the email permission is not enabled in Meta yet. Please contact the platform owner.";

function friendlyCallbackError(errorCode: string | null | undefined): string | null {
  if (!errorCode) return null;
  switch (errorCode) {
    case "facebook_invalid_scopes":
      return FACEBOOK_SCOPE_HELP;
    case "auth_callback_failed":
      return "Sign-in link was invalid or expired. Please try again.";
    default:
      return null;
  }
}

export function LoginForm({ callbackError, publicSignupEnabled = true, initialMode = "sign-in" }: Props) {
  const [mode, setMode] = useState<"sign-in" | "sign-up" | "forgot">(initialMode);
  const action = mode === "sign-in" ? signInAction : mode === "sign-up" ? signUpAction : resetPasswordAction;
  const { dict } = useLanguage();
  const authDict = dict.auth as Record<string, string> | undefined;
  const t = (key: string, fallback: string) => authDict?.[key] || fallback;
  const [state, formAction, pending] = useActionState(action, initialState);
  const [recaptchaToken, setRecaptchaToken] = useState<string | null>(null);
  const [recaptchaStatus, setRecaptchaStatus] = useState<RecaptchaStatus>("unconfigured");
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const recaptchaResetRef = useRef<(() => void) | null>(null);

  const switchMode = useCallback((newMode: "sign-in" | "sign-up" | "forgot") => {
    setMode(newMode);
    setRecaptchaToken(null);
    setConfirmError(null);
    recaptchaResetRef.current?.();
  }, []);

  // Suppress "Please complete the security check" when no visible widget was shown
  const isRecaptchaMissing = recaptchaStatus === "unconfigured" || recaptchaStatus === "failed";
  const suppressedError =
    state.error === "Please complete the security check." && isRecaptchaMissing
      ? (process.env.NODE_ENV === "development"
          ? "Security check not configured for this preview. Set NEXT_PUBLIC_RECAPTCHA_SITE_KEY and RECAPTCHA_SECRET_KEY."
          : null)
      : state.error;

  const fbError = callbackError === "facebook_invalid_scopes" ? FACEBOOK_SCOPE_HELP : null;
  const genericCallbackError = friendlyCallbackError(callbackError);
  const displayError = fbError ?? suppressedError ?? genericCallbackError;
  const isDuplicateSignup = !state.error && state.info?.includes("already exist");

  if (mode === "forgot") {
    return (
      <div className="space-y-5">
        <button type="button" onClick={() => switchMode("sign-in")} className="text-sm font-semibold text-blue-700 hover:underline">
          &larr; {t("backToSignIn", "Back to sign in")}
        </button>
        <form action={formAction} className="space-y-4">
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">{t("email", "Email")}</span>
            <input
              required
              name="email"
              type="email"
              autoComplete="email"
              placeholder={t("emailPlaceholder", "you@example.com")}
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
          <Recaptcha onChange={setRecaptchaToken} onStatus={setRecaptchaStatus} resetRef={recaptchaResetRef} />
          <input type="hidden" name="recaptchaToken" value={recaptchaToken ?? ""} />
          <button
            type="submit"
            disabled={pending}
            className="h-12 w-full rounded-xl bg-blue-700 text-sm font-bold text-white transition hover:bg-blue-800 disabled:opacity-60"
          >
            {pending ? t("sending", "Sending\u2026") : t("sendResetLink", "Send reset link")}
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
          onClick={() => switchMode("sign-in")}
          className={`h-10 rounded-lg transition ${
            mode === "sign-in" ? "bg-white text-blue-700 shadow" : "text-slate-500"
          }`}
        >
          {t("signIn", "Sign in")}
        </button>
        {publicSignupEnabled && (
          <button
            type="button"
            onClick={() => switchMode("sign-up")}
            className={`h-10 rounded-lg transition ${
              mode === "sign-up" ? "bg-white text-blue-700 shadow" : "text-slate-500"
            }`}
          >
            {t("signUp", "Sign up")}
          </button>
        )}
      </div>

      <form
        action={formAction}
        onSubmit={(e) => {
          if (mode === "sign-up") {
            const form = e.currentTarget;
            const password = (form.elements.namedItem("password") as HTMLInputElement)?.value;
            const confirmPassword = (form.elements.namedItem("confirmPassword") as HTMLInputElement)?.value;
            if (password !== confirmPassword) {
              e.preventDefault();
              setConfirmError(t("passwordsDoNotMatch", "Passwords do not match."));
              return;
            }
            setConfirmError(null);
          }
        }}
        className="space-y-4"
      >
        {mode === "sign-up" && (
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">{t("fullName", "Full name")}</span>
            <input
              required
              name="fullName"
              type="text"
              placeholder={t("ownerName", "Owner full name")}
              className="mt-2 h-12 w-full rounded-xl border border-slate-200 px-4 outline-none transition focus:border-blue-600"
            />
          </label>
        )}
        <label className="block">
          <span className="text-sm font-semibold text-slate-700">{t("email", "Email")}</span>
          <input
            required
            name="email"
            type="email"
            autoComplete="email"
            placeholder={t("emailPlaceholder", "you@example.com")}
            className="mt-2 h-12 w-full rounded-xl border border-slate-200 px-4 outline-none transition focus:border-blue-600"
          />
        </label>
        <label className="block">
          <span className="text-sm font-semibold text-slate-700">{t("password", "Password")}</span>
          <input
            required
            name="password"
            type="password"
            minLength={8}
            autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
            placeholder={t("passwordPlaceholder", "At least 8 characters")}
            className="mt-2 h-12 w-full rounded-xl border border-slate-200 px-4 outline-none transition focus:border-blue-600"
          />
        </label>
        {mode === "sign-up" && (
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">{t("confirmPassword", "Confirm password")}</span>
            <input
              required
              name="confirmPassword"
              type="password"
              minLength={8}
              autoComplete="new-password"
              placeholder={t("confirmPassword", "Confirm password")}
              className="mt-2 h-12 w-full rounded-xl border border-slate-200 px-4 outline-none transition focus:border-blue-600"
            />
          </label>
        )}

        {isDuplicateSignup && (
          <div className="rounded-lg bg-amber-50 px-3 py-3 text-sm space-y-2">
            <p className="font-medium text-amber-800">{state.info}</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => switchMode("sign-in")}
                className="h-9 rounded-lg bg-amber-700 px-4 text-xs font-bold text-white hover:bg-amber-800"
              >
                {t("goToSignIn", "Go to sign in")}
              </button>
              <button
                type="button"
                onClick={() => switchMode("forgot")}
                className="h-9 rounded-lg border border-amber-300 px-4 text-xs font-bold text-amber-800 hover:bg-amber-100"
              >
                {t("resetPassword", "Reset password")}
              </button>
            </div>
          </div>
        )}

        {state.info && !isDuplicateSignup && (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
            {state.info}
          </p>
        )}

        {confirmError && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
            {confirmError}
          </p>
        )}
        {displayError && !isDuplicateSignup && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
            {displayError}
          </p>
        )}

        {fbError && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
            {fbError}
          </p>
        )}

        <Recaptcha onChange={setRecaptchaToken} onStatus={setRecaptchaStatus} resetRef={recaptchaResetRef} />
        <input type="hidden" name="recaptchaToken" value={recaptchaToken ?? ""} />

        <button
          type="submit"
          disabled={pending}
          className="h-12 w-full rounded-xl bg-blue-700 text-sm font-bold text-white transition hover:bg-blue-800 disabled:opacity-60"
        >
          {pending
            ? t("pleaseWait", "Please wait\u2026")
            : mode === "sign-in"
              ? t("signIn", "Sign in")
              : t("createAccount", "Create account")}
        </button>
      </form>

      <div className="relative flex items-center gap-2">
        <div className="flex-1 border-t border-slate-200" />
        <span className="text-xs font-semibold text-slate-400">{t("or", "or")}</span>
        <div className="flex-1 border-t border-slate-200" />
      </div>

      <div className="flex flex-col gap-2">
        {publicSignupEnabled ? (
          <>
            <form action={async () => { await signInWithGoogleAction(initialState, new FormData()); }}>
              <button type="submit" disabled={pending} className="h-12 w-full rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 flex items-center justify-center gap-2 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">
                <svg className="size-5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                {t("continueWithGoogle", "Continue with Google")}
              </button>
            </form>
            <form action={async () => { await signInWithFacebookAction(initialState, new FormData()); }}>
              <button type="submit" disabled={pending} className="h-12 w-full rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700 transition hover:bg-blue-50 disabled:opacity-60 flex items-center justify-center gap-2 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">
                <svg className="size-5" viewBox="0 0 24 24"><path fill="#1877F2" d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                {t("continueWithFacebook", "Continue with Facebook")}
              </button>
            </form>
          </>
        ) : (
          <p className="text-center text-xs text-slate-400">
            {t("signupDisabled", "New account registration is currently disabled. Contact the platform administrator.")}
          </p>
        )}
      </div>

      {mode === "sign-in" && (
        <button
          type="button"
          onClick={() => switchMode("forgot")}
          className="block w-full text-center text-sm font-semibold text-slate-500 hover:text-blue-700"
        >
          {t("forgotPassword", "Forgot password?")}
        </button>
      )}
    </div>
  );
}
