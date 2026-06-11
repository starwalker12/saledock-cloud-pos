"use client";

import { useState, useActionState } from "react";
import { useRouter } from "next/navigation";
import { resetPasswordConfirmAction, type AuthState } from "@/app/(auth)/actions";
import { Shield, Eye, EyeOff, Loader2, CheckCircle, AlertTriangle } from "lucide-react";

const initialState: AuthState = { error: null };

export default function ResetPasswordPage() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(resetPasswordConfirmAction, initialState);

  const [passwordVal, setPasswordVal] = useState("");
  const [confirmPasswordVal, setConfirmPasswordVal] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const passwordChecks = {
    minChars: passwordVal.length >= 8,
    uppercase: /[A-Z]/.test(passwordVal),
    lowercase: /[a-z]/.test(passwordVal),
    number: /[0-9]/.test(passwordVal),
    special: /[^a-zA-Z0-9]/.test(passwordVal),
  };
  const allPasswordChecksPass = Object.values(passwordChecks).every(Boolean);
  const passwordsMatch = confirmPasswordVal.length > 0 && passwordVal === confirmPasswordVal;

  if (state.success) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4 dark:bg-slate-950">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-[#fff] p-6 text-center space-y-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
            <CheckCircle className="size-6" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-black text-slate-950 dark:text-white">Password Updated</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
              Your password has been reset successfully. You can now access your dashboard.
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-blue-700 text-sm font-bold text-white shadow-sm transition hover:bg-blue-800"
          >
            Go to Dashboard
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4 dark:bg-slate-950">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-[#fff] p-6 space-y-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400">
            <Shield className="size-6" />
          </div>
          <h1 className="text-xl font-black text-slate-950 dark:text-white">Set New Password</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Please choose a secure new password for your SaleDock account.
          </p>
        </div>

        {/* Form */}
        <form action={formAction} className="space-y-4">
          {state.error && (
            <div className="flex items-start gap-2.5 rounded-lg bg-red-50 p-3 text-xs text-red-800 dark:bg-red-950/20 dark:text-red-300 border border-red-200 dark:border-red-900">
              <AlertTriangle className="size-4 shrink-0 text-red-600 dark:text-red-400" />
              <span>{state.error}</span>
            </div>
          )}

          <div>
            <label className="text-xs font-bold text-slate-600 dark:text-slate-400">New Password</label>
            <div className="relative mt-1">
              <input
                type={showPassword ? "text" : "password"}
                name="password"
                placeholder="Enter secure new password"
                required
                minLength={8}
                value={passwordVal}
                onChange={(e) => setPasswordVal(e.target.value)}
                className="h-11 w-full rounded-xl border border-slate-200 px-4 pr-11 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 focus:outline-none"
                aria-label={showPassword ? "Hide password" : "Show password"}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>

            {/* Password requirements live helper text */}
            {passwordVal.length > 0 && (
              <div className="mt-2.5 space-y-1.5 rounded-xl border border-slate-100 bg-slate-50/50 p-3 text-xs dark:border-slate-800 dark:bg-slate-800/30">
                <p className="font-semibold text-slate-500 dark:text-slate-400">Password must include:</p>
                {[
                  { key: "minChars", label: "At least 8 characters" },
                  { key: "uppercase", label: "One uppercase letter" },
                  { key: "lowercase", label: "One lowercase letter" },
                  { key: "number", label: "One number" },
                  { key: "special", label: "One special character" },
                ].map(({ key, label }) => {
                  const passed = passwordChecks[key as keyof typeof passwordChecks];
                  return (
                    <p
                      key={key}
                      className={`flex items-center gap-1.5 ${
                        passed ? "text-emerald-600 dark:text-emerald-400 font-semibold" : "text-slate-400 dark:text-slate-500"
                      }`}
                    >
                      <span className="shrink-0 text-[10px]">{passed ? "✓" : "•"}</span>
                      <span>{label}</span>
                    </p>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-bold text-slate-600 dark:text-slate-400">Confirm Password</label>
            <div className="relative mt-1">
              <input
                type={showConfirmPassword ? "text" : "password"}
                name="confirmPassword"
                placeholder="Confirm secure new password"
                required
                minLength={8}
                value={confirmPasswordVal}
                onChange={(e) => setConfirmPasswordVal(e.target.value)}
                className="h-11 w-full rounded-xl border border-slate-200 px-4 pr-11 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((v) => !v)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 focus:outline-none"
                aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                tabIndex={-1}
              >
                {showConfirmPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>

            {confirmPasswordVal.length > 0 && (
              <p
                className={`mt-1.5 text-xs font-semibold ${
                  passwordsMatch ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
                }`}
              >
                {passwordsMatch ? "Passwords match." : "Passwords do not match."}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={pending || !allPasswordChecksPass || !passwordsMatch}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-700 text-sm font-bold text-white shadow-sm transition hover:bg-blue-800 disabled:opacity-60 cursor-pointer"
          >
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Updating Password...
              </>
            ) : (
              "Reset Password"
            )}
          </button>
        </form>
      </div>
    </main>
  );
}
