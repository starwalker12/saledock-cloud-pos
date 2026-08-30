"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { createPortal } from "react-dom";
import { LogOut, MonitorSmartphone } from "lucide-react";
import { signOutAction } from "@/app/(auth)/actions";

export function ActiveWorkspacePausedDialog({
  claimError,
  isClaiming,
  onUseHere,
  onBeforeSignOut,
}: {
  claimError: string | null;
  isClaiming: boolean;
  onUseHere: () => Promise<void>;
  onBeforeSignOut: () => Promise<void>;
}) {
  const [mounted, setMounted] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const submitAfterReleaseRef = useRef(false);
  const useHereRef = useRef<HTMLButtonElement>(null);
  const signOutRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setMounted(true), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    useHereRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (event.key !== "Tab") return;

      const first = useHereRef.current;
      const last = signOutRef.current;
      if (!first || !last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [mounted]);

  async function handleSignOut(event: FormEvent<HTMLFormElement>) {
    if (submitAfterReleaseRef.current) {
      submitAfterReleaseRef.current = false;
      return;
    }

    event.preventDefault();
    if (isSigningOut || isClaiming) return;

    const form = event.currentTarget;
    setIsSigningOut(true);
    try {
      await onBeforeSignOut();
    } finally {
      submitAfterReleaseRef.current = true;
      form.requestSubmit();
    }
  }

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex min-h-dvh items-center justify-center bg-[#020617]/80 p-4 backdrop-blur-sm motion-reduce:transition-none">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="active-workspace-dialog-title"
        aria-describedby="active-workspace-dialog-description active-workspace-dialog-support"
        data-active-workspace-paused-dialog
        className="w-full max-w-md rounded-lg border border-slate-200 bg-[#fff] p-5 text-slate-950 shadow-2xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 sm:p-6"
      >
        <span
          aria-hidden="true"
          className="flex size-11 items-center justify-center rounded-full bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-200"
        >
          <MonitorSmartphone className="size-5" />
        </span>

        <h2
          id="active-workspace-dialog-title"
          className="mt-4 text-xl font-black"
        >
          This account is active somewhere else
        </h2>
        <p
          id="active-workspace-dialog-description"
          className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300"
        >
          Another tab or device is currently controlling this account. To
          continue working here, take control of the session.
        </p>
        <p
          id="active-workspace-dialog-support"
          className="mt-3 text-xs leading-5 text-slate-500 dark:text-slate-400"
        >
          Taking control here will pause the other tab or device.
        </p>

        {claimError && (
          <p
            role="alert"
            className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-200"
          >
            {claimError}
          </p>
        )}

        <div className="mt-6 flex flex-col gap-2 sm:flex-row-reverse">
          <button
            ref={useHereRef}
            type="button"
            disabled={isClaiming || isSigningOut}
            aria-busy={isClaiming || undefined}
            onClick={() => void onUseHere()}
            className="motion-press min-h-11 flex-1 rounded-lg bg-[var(--primary-accent-bg)] px-4 py-2.5 text-sm font-black text-[var(--primary-accent-text)] transition hover:bg-[var(--primary-accent-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70 dark:focus-visible:ring-offset-slate-900"
          >
            {isClaiming ? "Taking control..." : "Use Here"}
          </button>

          <form action={signOutAction} onSubmit={handleSignOut} className="flex-1">
            <button
              ref={signOutRef}
              type="submit"
              disabled={isClaiming || isSigningOut}
              className="motion-press flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-[#fff] px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700 dark:focus-visible:ring-offset-slate-900"
            >
              <LogOut className="size-4" aria-hidden="true" />
              {isSigningOut ? "Signing out..." : "Sign out"}
            </button>
          </form>
        </div>
      </div>
    </div>,
    document.body,
  );
}
