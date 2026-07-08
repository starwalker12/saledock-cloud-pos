"use client";

import { MessageCircle, Printer } from "lucide-react";

type PrintButtonProps = {
  whatsappHref: string;
};

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

export function PrintButton({ whatsappHref }: PrintButtonProps) {
  return (
    <>
      <button
        type="button"
        onClick={() => printWithMode("a4")}
        className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-blue-700 px-4 text-sm font-bold text-white transition hover:bg-blue-800"
      >
        <Printer className="size-4" /> Print A4
      </button>
      <button
        type="button"
        onClick={() => printWithMode("thermal")}
        className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-800 transition hover:bg-slate-50"
      >
        <Printer className="size-4" /> Print 80mm
      </button>
      <a
        href={whatsappHref}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white transition hover:bg-emerald-700"
      >
        <MessageCircle className="size-4" /> Share WhatsApp
      </a>
    </>
  );
}
