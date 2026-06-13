"use client";

import { useState, useEffect } from "react";
import { MessageCircle, Printer, Download, X } from "lucide-react";

type PrintButtonProps = {
  invoiceNo: string;
  customerPhone?: string | null;
};

function printWithMode(mode: "a4" | "thermal", invoiceNo: string) {
  const oldTitle = document.title;
  document.title = `SaleDock-Invoice-${invoiceNo}`;
  document.body.dataset.printMode = mode;
  const cleanup = () => {
    delete document.body.dataset.printMode;
    document.title = oldTitle;
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);
  window.print();
  window.setTimeout(cleanup, 1200);
}

export function PrintButton({ invoiceNo }: PrintButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", handleEscape);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  return (
    <>
      <div className="flex flex-wrap gap-2 print:hidden">
        <button
          type="button"
          onClick={() => printWithMode("a4", invoiceNo)}
          className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white hover:bg-blue-800"
        >
          <Printer className="size-4" />
          Print A4 / Save PDF
        </button>
        <button
          type="button"
          onClick={() => printWithMode("thermal", invoiceNo)}
          className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <Printer className="size-4" />
          Print 80mm
        </button>
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700"
        >
          <MessageCircle className="size-4" />
          Share WhatsApp
        </button>
      </div>

      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
            onClick={() => setIsOpen(false)}
          />

          {/* Modal content */}
          <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-[#fff] p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900 z-10">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X className="size-5" />
            </button>

            <div className="flex flex-col items-center text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
                <MessageCircle className="size-6" />
              </div>
              <h3 className="mt-4 text-lg font-black text-slate-900 dark:text-white">
                Share Invoice PDF
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-650 dark:text-slate-400">
                This browser cannot attach the PDF directly to WhatsApp. Download the invoice PDF, then attach it in WhatsApp.
              </p>
            </div>

            <div className="mt-6 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  printWithMode("a4", invoiceNo);
                  setIsOpen(false);
                }}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-700 font-bold text-white hover:bg-blue-800"
              >
                <Download className="size-4" />
                Download PDF
              </button>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="flex h-11 w-full items-center justify-center rounded-lg border border-slate-200 font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
