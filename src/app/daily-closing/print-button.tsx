"use client";

import { Printer } from "lucide-react";

function printWithMode(mode: "a4" | "thermal") {
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
        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-blue-700 px-3 text-xs font-bold text-white hover:bg-blue-800"
      >
        <Printer className="size-4" />
        Print A4
      </button>
      <button
        type="button"
        onClick={() => printWithMode("thermal")}
        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 hover:bg-slate-50"
      >
        <Printer className="size-4" />
        Print 80mm
      </button>
    </div>
  );
}
