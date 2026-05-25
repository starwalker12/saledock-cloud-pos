"use client";

import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="inline-flex items-center justify-center gap-1.5 h-10 rounded-xl bg-blue-700 px-4 text-sm font-bold text-white hover:bg-blue-800 transition"
    >
      <Printer className="size-4" /> Print Receipt
    </button>
  );
}
