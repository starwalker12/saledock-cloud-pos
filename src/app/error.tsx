"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function AppError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled SaleDock route error", error);
  }, [error]);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-50 px-4 py-10 dark:bg-slate-950">
      <section
        role="alert"
        className="w-full max-w-md rounded-lg border border-rose-200 bg-[#fff] p-6 text-center shadow-sm dark:border-rose-900/70 dark:bg-slate-900"
      >
        <span className="mx-auto flex size-11 items-center justify-center rounded-full bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
          <AlertTriangle className="size-5" aria-hidden="true" />
        </span>
        <h1 className="mt-4 text-lg font-black text-slate-950 dark:text-slate-50">
          This page could not load
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
          The view hit an unexpected error. Try loading it again, or return to
          the dashboard.
        </p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={() => unstable_retry()}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 text-sm font-bold text-white hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            Try again
          </button>
          <Link
            href="/dashboard"
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 px-4 text-sm font-bold text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Return to dashboard
          </Link>
        </div>
      </section>
    </main>
  );
}
