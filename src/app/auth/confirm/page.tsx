"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { verifyOtpAction } from "@/app/(auth)/actions";
import { CheckCircle, AlertTriangle, Loader2 } from "lucide-react";
import type { EmailOtpType } from "@supabase/supabase-js";

function ConfirmContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/settings?tab=accounts";

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!tokenHash || !type) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatus("error");
      setErrorMessage("The confirmation link is invalid or missing required parameters.");
      return;
    }

    let active = true;
    async function verify() {
      try {
        const result = await verifyOtpAction(tokenHash!, type!);
        if (!active) return;
        if (result.success) {
          if (type === "recovery") {
            // For password recovery, redirect to onboarding/settings to update password
            router.push(next || "/onboarding");
          } else {
            setStatus("success");
          }
        } else {
          setStatus("error");
          setErrorMessage(result.error || "The confirmation link is invalid or has expired.");
        }
      } catch (err) {
        if (!active) return;
        const msg = err instanceof Error ? err.message : "An unexpected error occurred during verification.";
        setStatus("error");
        setErrorMessage(msg);
      }
    }

    verify();

    return () => {
      active = false;
    };
  }, [tokenHash, type, next, router]);

  if (status === "loading") {
    return (
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-[#fff] p-6 text-center space-y-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400">
          <Loader2 className="size-6 animate-spin" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-black text-slate-950 dark:text-white">Confirming your email...</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
            Please wait while we verify your secure confirmation link with Supabase.
          </p>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-[#fff] p-6 text-center space-y-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-300">
          <AlertTriangle className="size-6" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-black text-slate-950 dark:text-white">Link Invalid or Expired</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
            {errorMessage}
          </p>
        </div>
        <button
          type="button"
          onClick={() => router.push("/settings?tab=accounts")}
          className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-blue-700 text-sm font-bold text-white shadow-sm transition hover:bg-blue-800"
        >
          Back to Settings
        </button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-[#fff] p-6 text-center space-y-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
      <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
        <CheckCircle className="size-6" />
      </div>
      <div className="space-y-2">
        <h2 className="text-xl font-black text-slate-950 dark:text-white">Email Confirmed</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
          Your email has been confirmed successfully. You can now return to the app.
        </p>
      </div>
      <button
        type="button"
        onClick={() => router.push("/settings?tab=accounts")}
        className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-blue-700 text-sm font-bold text-white shadow-sm transition hover:bg-blue-800"
      >
        Go to Settings
      </button>
    </div>
  );
}

function ConfirmLoadingView() {
  return (
    <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-[#fff] p-6 text-center space-y-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
      <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400">
        <Loader2 className="size-6 animate-spin" />
      </div>
      <div className="space-y-2">
        <h2 className="text-xl font-black text-slate-950 dark:text-white">Confirming your email...</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
          Please wait while we verify your secure confirmation link with Supabase.
        </p>
      </div>
    </div>
  );
}

export default function ConfirmPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4 dark:bg-slate-950">
      <Suspense fallback={<ConfirmLoadingView />}>
        <ConfirmContent />
      </Suspense>
    </main>
  );
}
