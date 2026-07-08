"use client";

import { Printer } from "lucide-react";

function printWithMode(mode: "a4" | "thermal" | "shift-thermal") {
  document.body.dataset.printMode = mode;
  const cleanup = () => {
    delete document.body.dataset.printMode;
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);
  window.print();
  window.setTimeout(cleanup, 1200);
}

export function ClosingPrintButtons() {
  return (
    <div className="flex flex-wrap gap-2 print-hidden">
      <button
        type="button"
        onClick={() => printWithMode("a4")}
        className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg bg-blue-700 px-3 text-xs font-bold text-white hover:bg-blue-800"
      >
        <Printer className="size-4" />
        Print A4
      </button>
      <button
        type="button"
        onClick={() => printWithMode("thermal")}
        className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 hover:bg-slate-50"
      >
        <Printer className="size-4" />
        Print 80mm
      </button>
    </div>
  );
}

export function ShiftPrintButton({ hasShift }: { hasShift: boolean }) {
  if (!hasShift) return null;
  return (
    <button
      type="button"
      onClick={() => printWithMode("shift-thermal")}
      className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 text-xs font-bold text-blue-800 hover:bg-blue-100"
    >
      <Printer className="size-4" />
      Print shift report
    </button>
  );
}
