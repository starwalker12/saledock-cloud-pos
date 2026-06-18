"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { useLanguage } from "@/lib/i18n/language-provider";

export function NotificationPopover({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const popoverId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const { dict } = useLanguage();
  const shellDict = dict.shell as Record<string, string> | undefined;
  const title = shellDict?.notifications || "Notifications";
  const emptyMessage = shellDict?.noNewNotifications || "No new notifications";

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={
          compact
            ? "flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-600 transition hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
            : "flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 px-4 text-slate-600 transition hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
        }
        aria-label={title}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={popoverId}
      >
        <Bell className="size-4" aria-hidden="true" />
      </button>

      {open && (
        <div
          id={popoverId}
          role="dialog"
          aria-label={title}
          className="animate-dropdown-in absolute right-0 top-full z-[90] mt-2 w-[min(calc(100vw-1.5rem),20rem)] overflow-hidden rounded-2xl border border-slate-200 bg-[#fff] text-slate-900 shadow-2xl shadow-slate-900/15 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        >
          <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
            <p className="text-sm font-black">{title}</p>
          </div>
          <div className="flex min-h-28 flex-col items-center justify-center px-5 py-6 text-center">
            <span className="flex size-10 items-center justify-center rounded-2xl bg-[var(--primary-accent-soft)] text-[var(--primary-accent-bg)]">
              <Bell className="size-5" aria-hidden="true" />
            </span>
            <p className="mt-3 text-sm font-bold text-slate-700 dark:text-slate-200">
              {emptyMessage}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
