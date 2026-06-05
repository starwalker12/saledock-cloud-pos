"use client";

import { useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";

const STORAGE_KEY = "analytics-notice-dismissed";

function isDismissed(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(STORAGE_KEY) === "true";
}

export default function AnalyticsNotice() {
  const [dismissed, setDismissed] = useState(isDismissed);

  function handleDismiss() {
    setDismissed(true);
    localStorage.setItem(STORAGE_KEY, "true");
  }

  if (dismissed) return null;

  return (
    <div
      role="region"
      aria-label="Analytics notice"
      className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-100 px-4 py-3 text-xs text-slate-800 shadow-md dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
    >
      <p className="flex-1">
        This site uses Google Analytics and Microsoft Clarity to understand how it&apos;s used.{" "}
        <Link href="/privacy" className="underline hover:text-blue-700 dark:hover:text-blue-400">
          Privacy Policy
        </Link>
      </p>
      <button
        onClick={handleDismiss}
        aria-label="Dismiss analytics notice"
        className="flex shrink-0 items-center gap-1 rounded-lg bg-slate-200 px-3 py-1.5 font-semibold text-slate-800 hover:bg-slate-300 focus-visible:outline-2 focus-visible:outline-blue-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
      >
        <X className="size-3.5" />
        Got it
      </button>
    </div>
  );
}
