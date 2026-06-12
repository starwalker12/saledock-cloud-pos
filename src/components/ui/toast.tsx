"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import { X } from "lucide-react";

type ToastType = "success" | "info" | "warning" | "error";

export type ToastOptions = {
  message: string;
  type?: ToastType;
  duration?: number;
  onClick?: () => void;
};

type ToastContextType = {
  show: (options: ToastOptions) => void;
  hide: () => void;
};

const ToastContext = createContext<ToastContextType | null>(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<(ToastOptions & { id: number }) | null>(null);

  const hide = useCallback(() => {
    setToast(null);
  }, []);

  const show = useCallback(({ message, type = "success", duration = 3000, onClick }: ToastOptions) => {
    const id = Date.now();
    setToast({ message, type, duration, onClick, id });

    if (duration > 0) {
      setTimeout(() => {
        setToast((current) => (current?.id === id ? null : current));
      }, duration);
    }
  }, []);

  return (
    <ToastContext.Provider value={{ show, hide }}>
      {children}
      {toast && (
        <div
          onClick={() => {
            if (toast.onClick) {
              toast.onClick();
            }
            hide();
          }}
          className={`fixed bottom-20 left-1/2 z-50 flex w-[90%] max-w-sm -translate-x-1/2 transform items-center justify-between gap-3 rounded-2xl border px-4 py-3.5 shadow-lg backdrop-blur transition-all duration-300 ease-out animate-fade-in-up motion-reduce:transition-none cursor-pointer select-none md:bottom-6 md:right-6 md:left-auto md:translate-x-0
            ${toast.onClick ? "hover:scale-[1.01] active:scale-[0.99]" : ""}
            ${
              toast.type === "success"
                ? "border-emerald-200 bg-emerald-50/95 text-emerald-800 dark:border-emerald-800/30 dark:bg-emerald-950/95 dark:text-emerald-200"
                : toast.type === "error"
                ? "border-rose-200 bg-rose-50/95 text-rose-800 dark:border-rose-800/30 dark:bg-rose-950/95 dark:text-rose-200"
                : toast.type === "warning"
                ? "border-amber-200 bg-amber-50/95 text-amber-800 dark:border-amber-800/30 dark:bg-amber-950/95 dark:text-amber-200"
                : "border-blue-200 bg-blue-50/95 text-blue-800 dark:border-blue-800/30 dark:bg-blue-950/95 dark:text-blue-250"
            }
          `}
          role="alert"
        >
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-sm font-bold leading-tight">{toast.message}</span>
            {toast.onClick && (
              <span className="mt-1 text-[10px] font-black uppercase tracking-wider text-blue-700 dark:text-teal-400">
                Tap to view
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              hide();
            }}
            className="flex size-7 items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/5"
            aria-label="Close notification"
          >
            <X className="size-4 shrink-0" />
          </button>
        </div>
      )}
    </ToastContext.Provider>
  );
}
