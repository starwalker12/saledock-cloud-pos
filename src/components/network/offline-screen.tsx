"use client";

import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
import { Logo } from "@/components/logo";

export function OfflineScreen() {
  const [isOffline, setIsOffline] = useState(() =>
    typeof navigator === "undefined" ? false : !navigator.onLine,
  );
  const [checkedWhileOffline, setCheckedWhileOffline] = useState(false);

  useEffect(() => {
    const updateOnline = () => {
      setIsOffline(false);
      setCheckedWhileOffline(false);
    };
    const updateOffline = () => setIsOffline(true);

    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOffline);

    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOffline);
    };
  }, []);

  if (!isOffline) return null;

  function checkAgain() {
    const offline = !navigator.onLine;
    setIsOffline(offline);
    setCheckedWhileOffline(offline);
  }

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="offline-title"
      aria-describedby="offline-description"
      className="fixed inset-0 z-[260] flex min-h-dvh items-center justify-center bg-[#fff] px-4 py-8 text-slate-950 dark:bg-slate-950 dark:text-white"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(37,99,235,0.12),_transparent_34%),radial-gradient(circle_at_bottom,_rgba(20,184,166,0.10),_transparent_34%)] dark:bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.12),_transparent_34%),radial-gradient(circle_at_bottom,_rgba(20,184,166,0.08),_transparent_34%)]" />
      <div className="relative flex w-full max-w-md flex-col items-center rounded-[2rem] border border-slate-200 bg-[#fff] p-7 text-center shadow-2xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/40 sm:p-9">
        <Logo className="h-24 w-auto max-w-[280px] object-contain sm:h-28" />
        <div className="mt-7 flex size-16 items-center justify-center rounded-2xl bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-300">
          <WifiOff className="size-8" aria-hidden="true" />
        </div>
        <h1 id="offline-title" className="mt-6 text-2xl font-black tracking-tight sm:text-3xl">
          No internet connection
        </h1>
        <p
          id="offline-description"
          className="mt-3 max-w-sm text-sm font-medium leading-6 text-slate-600 dark:text-slate-300"
        >
          Please check your connection. SaleDock will reconnect automatically.
        </p>
        <button
          type="button"
          onClick={checkAgain}
          className="mt-7 inline-flex h-12 min-w-36 items-center justify-center rounded-xl bg-[var(--primary-accent-bg)] px-5 text-sm font-black text-[var(--primary-accent-text)] shadow-lg shadow-blue-900/10 transition hover:bg-[var(--primary-accent-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-accent-bg)] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900"
        >
          Check again
        </button>
        <p className="mt-4 min-h-5 text-xs font-semibold text-slate-500 dark:text-slate-400">
          {checkedWhileOffline ? "Still offline. Waiting for the connection to return." : "Waiting for your device to reconnect..."}
        </p>
      </div>
    </div>
  );
}
