"use client";

import { useEffect, useState } from "react";
import { WifiOff, RefreshCw } from "lucide-react";

export function OfflineScreen() {
  const [isOffline, setIsOffline] = useState(() =>
    typeof window === "undefined" ? false : !navigator.onLine,
  );
  const [checkedWhileOffline, setCheckedWhileOffline] = useState(false);

  useEffect(() => {
    const syncOnlineState = () => {
      const offline = !navigator.onLine;
      setIsOffline(offline);
      if (!offline) setCheckedWhileOffline(false);
    };

    const updateOnline = () => {
      setIsOffline(false);
      setCheckedWhileOffline(false);
    };
    const updateOffline = () => setIsOffline(true);

    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOffline);

    syncOnlineState();

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
      role="status"
      aria-live="polite"
      className="fixed left-0 right-0 top-0 z-[260] border-b border-amber-200 bg-amber-50 px-4 py-2.5 shadow-sm dark:border-amber-800/60 dark:bg-amber-950/80"
    >
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 text-sm">
        <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200">
          <WifiOff className="size-4 shrink-0" aria-hidden="true" />
          <span className="font-semibold">Internet connection lost</span>
          <span className="hidden text-amber-700 dark:text-amber-300 sm:inline">
            Your work is still on this device. Reconnect to save/sync safely.
          </span>
        </div>
        <div className="flex items-center gap-3">
          {checkedWhileOffline && (
            <span className="text-xs text-amber-700 dark:text-amber-300">
              Still offline. Waiting for connection...
            </span>
          )}
          <button
            type="button"
            onClick={checkAgain}
            className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900 transition hover:bg-amber-200 dark:bg-amber-900/50 dark:text-amber-100 dark:hover:bg-amber-900/70"
          >
            <RefreshCw className="size-3" aria-hidden="true" />
            Check again
          </button>
        </div>
      </div>
    </div>
  );
}
