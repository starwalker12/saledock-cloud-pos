"use client";

import { useEffect, useRef, useState } from "react";
import { FormModal } from "@/components/ui/form-modal";

type HoldBillModalProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: (label: string, note: string) => void;
  defaultLabel?: string;
  pending?: boolean;
};

export function HoldBillModal({ open, onClose, onConfirm, defaultLabel = "", pending = false }: HoldBillModalProps) {
  const [label, setLabel] = useState(defaultLabel);
  const [note, setNote] = useState("");
  const labelRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      const timer = window.setTimeout(() => labelRef.current?.focus(), 50);
      return () => window.clearTimeout(timer);
    }
  }, [open]);

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title="Hold bill"
      description="Save this cart to resume later."
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="h-11 rounded-lg border border-slate-200 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(label, note)}
            disabled={pending}
            className="h-11 rounded-lg bg-blue-700 px-4 text-sm font-bold text-white transition hover:bg-blue-800 disabled:opacity-60"
          >
            {pending ? "Holding…" : "Hold bill"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <label className="block">
          <span className="text-sm font-semibold text-slate-700">Label (optional)</span>
          <input
            ref={labelRef}
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Counter 2 / Umar"
            maxLength={120}
            className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-[#fff] px-3 text-sm outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-900"
          />
        </label>
        <label className="block">
          <span className="text-sm font-semibold text-slate-700">Note (optional)</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="Any details about this held bill"
            className="mt-1 w-full rounded-lg border border-slate-200 bg-[#fff] px-3 py-2 text-sm outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-900"
          />
        </label>
      </div>
    </FormModal>
  );
}
