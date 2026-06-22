"use client";

import { useEffect, useId, useRef, type ReactNode, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

function ClientPortal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setMounted(true), 0);
    return () => window.clearTimeout(timer);
  }, []);
  return mounted ? createPortal(children, document.body) : null;
}

type DrawerProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  widthClass?: string;
  zIndexClass?: string;
};

export function Drawer({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  widthClass = "sm:max-w-md",
  zIndexClass = "z-[200]",
}: DrawerProps) {
  const panelRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => headingRef.current?.focus(), 0);

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (panelRef.current?.querySelector('[aria-expanded="true"]')) return;
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <ClientPortal>
      <div
        className={`fixed inset-0 ${zIndexClass}`}
        aria-modal="true"
        role="dialog"
        aria-labelledby={titleId}
      >
        <div
          className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
        />
        <section
          ref={panelRef}
          className={`absolute inset-y-0 right-0 flex w-full flex-col bg-[#fff] shadow-2xl dark:bg-slate-950 ${widthClass}`}
        >
          <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-4 py-4 dark:border-slate-800 sm:px-6">
            <div className="min-w-0">
              <h2
                id={titleId}
                ref={headingRef}
                tabIndex={-1}
                className="text-lg font-black text-slate-950 outline-none dark:text-slate-100"
              >
                {title}
              </h2>
              {description && (
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <X className="size-5" />
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">{children}</div>

          {footer && (
            <footer className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-200 bg-[#fff] px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:flex-row sm:justify-end sm:px-6 dark:border-slate-800 dark:bg-slate-950">
              {footer}
            </footer>
          )}
        </section>
      </div>
    </ClientPortal>
  );
}
