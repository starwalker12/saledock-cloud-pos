"use client";

import { useActionState, useState, useRef, useCallback, useEffect } from "react";
import {
  signInAction,
  signUpAction,
  signInWithGoogleAction,
  resetPasswordAction,
  type AuthState,
} from "@/app/(auth)/actions";
import { Recaptcha, type RecaptchaStatus } from "@/components/auth/recaptcha";
import { useLanguage } from "@/lib/i18n/language-provider";
import { Eye, EyeOff } from "lucide-react";

const initialState: AuthState = { error: null };

type Props = {
  callbackError?: string | null;
  publicSignupEnabled?: boolean;
  initialMode?: "sign-in" | "sign-up";
};

function friendlyCallbackError(errorCode: string | null | undefined): string | null {
  if (!errorCode) return null;
  switch (errorCode) {
    case "auth_callback_failed":
      return "Sign-in link was invalid or expired. Please try again.";
    default:
      return null;
  }
}

export function LoginForm({ callbackError, publicSignupEnabled = true, initialMode = "sign-in" }: Props) {
  const [mode, setMode] = useState<"sign-in" | "sign-up" | "forgot">(initialMode);
  const { dict } = useLanguage();
  const authDict = dict.auth as Record<string, string> | undefined;
  const t = (key: string, fallback: string) => authDict?.[key] || fallback;
  const [signInState, signInFormAction, signInPending] = useActionState(signInAction, initialState);
  const [signUpState, signUpFormAction, signUpPending] = useActionState(signUpAction, initialState);
  const [forgotState, forgotFormAction, forgotPending] = useActionState(resetPasswordAction, initialState);
  const state = mode === "sign-in" ? signInState : mode === "sign-up" ? signUpState : forgotState;
  const formAction = mode === "sign-in" ? signInFormAction : mode === "sign-up" ? signUpFormAction : forgotFormAction;
  const pending = mode === "sign-in" ? signInPending : mode === "sign-up" ? signUpPending : forgotPending;
  const [recaptchaToken, setRecaptchaToken] = useState<string | null>(null);
  const [recaptchaStatus, setRecaptchaStatus] = useState<RecaptchaStatus>("unconfigured");
  const recaptchaResetRef = useRef<(() => void) | null>(null);
  const recaptchaGetTokenRef = useRef<(() => string | null) | null>(null);
  const captchaHiddenRef = useRef<HTMLInputElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);

  const [emailVal, setEmailVal] = useState("");
  const [fullNameVal, setFullNameVal] = useState("");
  const [passwordVal, setPasswordVal] = useState("");
  const [confirmPasswordVal, setConfirmPasswordVal] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Only reset the captcha widget when the server explicitly requires a fresh tick.
  // The server-side captcha-pass cookie (captcha_ok) normally skips Google verify
  // on subsequent submits, so resetting on every state change is unnecessary.
  useEffect(() => {
    if (state?.error === "Please complete the security check.") {
      recaptchaResetRef.current?.();
    }
  }, [state?.error]);

  const passwordChecks = {
    minChars: passwordVal.length >= 8,
    uppercase: /[A-Z]/.test(passwordVal),
    lowercase: /[a-z]/.test(passwordVal),
    number: /[0-9]/.test(passwordVal),
    special: /[^a-zA-Z0-9]/.test(passwordVal),
  };
  const allPasswordChecksPass = Object.values(passwordChecks).every(Boolean);
  const passwordsMatch = confirmPasswordVal.length > 0 && passwordVal === confirmPasswordVal;
  const passwordsMismatch = confirmPasswordVal.length > 0 && passwordVal !== confirmPasswordVal;

  const switchMode = useCallback((newMode: "sign-in" | "sign-up" | "forgot") => {
    setMode(newMode);
    setRecaptchaToken(null);
    setEmailVal("");
    setFullNameVal("");
    setPasswordVal("");
    setConfirmPasswordVal("");
    recaptchaResetRef.current?.();
  }, []);

  // On form submit, read the CURRENT captcha token from the widget
  // (not stale stored state) and inject it into the hidden input.
  const handleFormSubmit = useCallback(() => {
    const token = recaptchaGetTokenRef.current?.();
    if (captchaHiddenRef.current) {
      captchaHiddenRef.current.value = token ?? "";
    }
    // Let the native form submission proceed with the updated hidden input value.
  }, []);

  // Suppress "Please complete the security check" when no visible widget was shown
  const isRecaptchaMissing = recaptchaStatus === "unconfigured" || recaptchaStatus === "failed";
  const suppressedError =
    state.error === "Please complete the security check." && isRecaptchaMissing
      ? (process.env.NODE_ENV === "development"
          ? "Security check not configured for this preview. Set NEXT_PUBLIC_RECAPTCHA_SITE_KEY and RECAPTCHA_SECRET_KEY."
          : null)
      : state.error;

  const genericCallbackError = friendlyCallbackError(callbackError);
  const displayError = suppressedError ?? genericCallbackError;
  const isDuplicateSignup = !state.error && state.info?.includes("already exist");

  if (mode === "forgot") {
    return (
      <div className="space-y-5">
        <button type="button" onClick={() => switchMode("sign-in")} className="text-sm font-semibold text-blue-700 hover:underline">
          &larr; {t("backToSignIn", "Back to sign in")}
        </button>
        <form ref={formRef} action={formAction} onSubmit={handleFormSubmit} className="space-y-4">
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">{t("email", "Email")}</span>
            <input
              required
              name="email"
              type="email"
              autoComplete="email"
              placeholder={t("emailPlaceholder", "you@example.com")}
              value={emailVal}
              onChange={(e) => setEmailVal(e.target.value)}
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
          <Recaptcha onChange={setRecaptchaToken} onStatus={setRecaptchaStatus} resetRef={recaptchaResetRef} getTokenRef={recaptchaGetTokenRef} />
          <input ref={captchaHiddenRef} type="hidden" name="recaptchaToken" value={recaptchaToken ?? ""} />
          <button
            type="submit"
            disabled={pending}
          className="h-12 w-full rounded-xl bg-blue-700 text-sm font-bold text-white transition hover:bg-blue-800 active:bg-blue-900 active:scale-[0.98] disabled:opacity-60"
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

      <form ref={formRef} action={formAction} onSubmit={handleFormSubmit} className="space-y-4">
        {mode === "sign-up" && (
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">{t("fullName", "Full name")}</span>
            <input
              required
              name="fullName"
              type="text"
              placeholder={t("ownerName", "Owner full name")}
              value={fullNameVal}
              onChange={(e) => setFullNameVal(e.target.value)}
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
            value={emailVal}
            onChange={(e) => setEmailVal(e.target.value)}
            className="mt-2 h-12 w-full rounded-xl border border-slate-200 px-4 outline-none transition focus:border-blue-600"
          />
        </label>
        <label className="block">
          <span className="text-sm font-semibold text-slate-700">{t("password", "Password")}</span>
          <div className="relative mt-2">
            <input
              required
              name="password"
              type={showPassword ? "text" : "password"}
              minLength={8}
              autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
              placeholder={t("passwordPlaceholder", "At least 8 characters")}
              value={passwordVal}
              onChange={(e) => setPasswordVal(e.target.value)}
              className="h-12 w-full rounded-xl border border-slate-200 px-4 pr-12 outline-none transition focus:border-blue-600"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
              aria-label={showPassword ? "Hide password" : "Show password"}
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
            </button>
          </div>
          {mode === "sign-up" && passwordVal.length > 0 && (
            <div className="mt-2 space-y-1 text-xs">
              <p className="font-medium text-slate-500">
                <span>{t("passwordRequirements", "Password must include:")}</span>
              </p>
              {[
                { key: "minChars", label: t("passwordMinChars", "At least 8 characters") },
                { key: "uppercase", label: t("passwordUppercase", "One uppercase letter") },
                { key: "lowercase", label: t("passwordLowercase", "One lowercase letter") },
                { key: "number", label: t("passwordNumber", "One number") },
                { key: "special", label: t("passwordSpecial", "One special character") },
              ].map(({ key, label }) => {
                const passed = passwordChecks[key as keyof typeof passwordChecks];
                return (
                  <p
                    key={key}
                    className={`flex items-center gap-1.5 ${
                      passed ? "text-emerald-600" : passwordVal.length > 0 ? "text-slate-400" : "text-slate-400"
                    }`}
                  >
                    <span className="shrink-0">{passed ? "\u2713" : "\u2022"}</span>
                    <span>{label}</span>
                  </p>
                );
              })}
            </div>
          )}
        </label>
        {mode === "sign-up" && (
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">{t("confirmPassword", "Confirm password")}</span>
            <div className="relative mt-2">
              <input
                required
                name="confirmPassword"
                type={showConfirmPassword ? "text" : "password"}
                minLength={8}
                autoComplete="new-password"
                placeholder={t("confirmPassword", "Confirm password")}
                value={confirmPasswordVal}
                onChange={(e) => setConfirmPasswordVal(e.target.value)}
                className="h-12 w-full rounded-xl border border-slate-200 px-4 pr-12 outline-none transition focus:border-blue-600"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                tabIndex={-1}
              >
                {showConfirmPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
              </button>
            </div>
            {confirmPasswordVal.length > 0 && (
              <p
                className={`mt-1.5 text-xs font-medium ${
                  passwordsMatch ? "text-emerald-600" : "text-red-600"
                }`}
              >
                {passwordsMatch
                  ? t("passwordsMatch", "Passwords match.")
                  : t("passwordsDoNotMatch", "Passwords do not match.")}
              </p>
            )}
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

        {displayError && !isDuplicateSignup && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
            {displayError}
          </p>
        )}

        <Recaptcha onChange={setRecaptchaToken} onStatus={setRecaptchaStatus} resetRef={recaptchaResetRef} getTokenRef={recaptchaGetTokenRef} />
        <input ref={captchaHiddenRef} type="hidden" name="recaptchaToken" value={recaptchaToken ?? ""} />

        <button
          type="submit"
          disabled={pending || (mode === "sign-up" && (!allPasswordChecksPass || passwordsMismatch))}
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
              <button type="submit" disabled={pending} className="h-12 w-full rounded-xl border border-slate-200 bg-[#fff] text-sm font-bold text-slate-700 transition hover:bg-slate-300 hover:border-slate-400 active:bg-slate-400 active:border-slate-500 active:scale-[0.97] disabled:opacity-60 flex items-center justify-center gap-2 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-500 dark:hover:border-slate-400 dark:active:bg-slate-400 dark:active:border-slate-300">
                <svg className="size-5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                {t("continueWithGoogle", "Continue with Google")}
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
