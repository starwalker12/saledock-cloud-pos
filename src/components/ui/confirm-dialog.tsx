"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { useLanguage } from "@/lib/i18n/language-provider";
import { createPortal } from "react-dom";

type ConfirmDialogVariant = "default" | "destructive";

export type ConfirmDialogOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmDialogVariant;
};

type ConfirmDialogLabels = {
  confirm: string;
  cancel: string;
};

type PendingConfirm = ConfirmDialogOptions;

type ConfirmDialogContextValue = {
  confirm: (options: ConfirmDialogOptions) => Promise<boolean>;
};

const DEFAULT_LABELS: ConfirmDialogLabels = {
  confirm: "Confirm",
  cancel: "Cancel",
};

const ConfirmDialogContext = createContext<ConfirmDialogContextValue | null>(null);

export function ConfirmDialogProvider({
  children,
  labels,
  onOpenChange,
}: {
  children: ReactNode;
  labels?: Partial<ConfirmDialogLabels>;
  onOpenChange?: (open: boolean) => void;
}) {
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
  const resolverRef = useRef<((confirmed: boolean) => void) | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const confirmButtonRef = useRef<HTMLButtonElement | null>(null);
  const { dict } = useLanguage();
  const shellDict = dict.shell as Record<string, string> | undefined;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setMounted(true);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const mergedLabels = useMemo(
    () => ({
      confirm: shellDict?.confirm ?? DEFAULT_LABELS.confirm,
      cancel: shellDict?.cancel ?? DEFAULT_LABELS.cancel,
      ...labels,
    }),
    [labels, shellDict],
  );

  const closeDialog = useCallback((confirmed: boolean) => {
    resolverRef.current?.(confirmed);
    resolverRef.current = null;
    setPendingConfirm(null);
  }, []);

  const confirm = useCallback((options: ConfirmDialogOptions) => {
    resolverRef.current?.(false);

    if (document.activeElement instanceof HTMLElement) {
      previousFocusRef.current = document.activeElement;
    } else {
      previousFocusRef.current = null;
    }

    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setPendingConfirm(options);
    });
  }, []);

  useEffect(() => {
    return () => {
      resolverRef.current?.(false);
      resolverRef.current = null;
    };
  }, []);

  useEffect(() => {
    onOpenChange?.(Boolean(pendingConfirm));

    return () => {
      onOpenChange?.(false);
    };
  }, [pendingConfirm, onOpenChange]);

  useEffect(() => {
    if (!pendingConfirm) return;

    const previousOverflow = document.body.style.overflow;
    const focusTimer = window.setTimeout(() => {
      confirmButtonRef.current?.focus();
    }, 0);

    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDialog(false);
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        closeDialog(true);
        return;
      }

      if (event.key !== "Tab") return;

      const focusableElements = [
        cancelButtonRef.current,
        confirmButtonRef.current,
      ].filter((element): element is HTMLButtonElement => Boolean(element));

      if (focusableElements.length === 0) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [pendingConfirm, closeDialog]);

  const contextValue = useMemo<ConfirmDialogContextValue>(
    () => ({ confirm }),
    [confirm],
  );

  const isDestructive = pendingConfirm?.variant === "destructive";
  const Icon = isDestructive ? AlertTriangle : CheckCircle2;

  return (
    <ConfirmDialogContext.Provider value={contextValue}>
      {children}

      {pendingConfirm && mounted && createPortal(
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#020617]/75 p-4 backdrop-blur-sm animate-fade-in">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            aria-describedby="confirm-dialog-message"
            className="animate-scale-in w-full max-w-md rounded-2xl border border-[#cbd5e1] bg-[#f8fafc] p-5 text-[#0f172a] shadow-2xl dark:border-[#334155] dark:bg-[#0f172a] dark:text-[#e2e8f0] sm:p-6"
          >
            <div className="flex items-start gap-4">
              <span
                className={`flex size-11 shrink-0 items-center justify-center rounded-full ${
                  isDestructive
                    ? "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
                    : "bg-[var(--primary-accent-soft)] text-[var(--primary-accent-bg)]"
                }`}
                aria-hidden="true"
              >
                <Icon className="size-5" />
              </span>

              <div className="min-w-0 flex-1 space-y-3">
                <div>
                  <h2
                    id="confirm-dialog-title"
                    className="text-lg font-black text-[#0f172a] dark:text-[#f8fafc]"
                  >
                    {pendingConfirm.title}
                  </h2>
                  <p
                    id="confirm-dialog-message"
                    className="mt-2 text-sm leading-6 text-[#334155] dark:text-[#cbd5e1]"
                  >
                    {pendingConfirm.message}
                  </p>
                </div>

                <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
                  <button
                    ref={cancelButtonRef}
                    type="button"
                    onClick={() => closeDialog(false)}
                    className="motion-press rounded-xl border border-[#cbd5e1] bg-[#e2e8f0] px-4 py-2 text-sm font-bold text-[#0f172a] transition hover:bg-[#cbd5e1] focus:outline-none focus:ring-2 focus:ring-[var(--primary-accent-bg)] focus:ring-offset-2 focus:ring-offset-[#f8fafc] dark:border-[#334155] dark:bg-[#1e293b] dark:text-[#e2e8f0] dark:hover:bg-[#334155] dark:focus:ring-offset-[#0f172a]"
                  >
                    {pendingConfirm.cancelLabel ?? mergedLabels.cancel}
                  </button>
                  <button
                    ref={confirmButtonRef}
                    type="button"
                    onClick={() => closeDialog(true)}
                    className={`motion-press rounded-xl px-4 py-2 text-sm font-black transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#f8fafc] dark:focus:ring-offset-[#0f172a] ${
                      isDestructive
                        ? "bg-[#dc2626] text-white hover:bg-[#b91c1c] focus:ring-[#fca5a5]"
                        : "bg-[var(--primary-accent-bg)] text-[var(--primary-accent-text)] hover:bg-[var(--primary-accent-hover)] focus:ring-[var(--primary-accent-bg)]"
                    }`}
                  >
                    {pendingConfirm.confirmLabel ?? mergedLabels.confirm}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </ConfirmDialogContext.Provider>
  );
}

export function useConfirmDialog() {
  const context = useContext(ConfirmDialogContext);

  if (!context) {
    throw new Error("useConfirmDialog must be used inside ConfirmDialogProvider");
  }

  return context.confirm;
}
