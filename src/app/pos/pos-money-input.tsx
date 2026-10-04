"use client";

import { useState, type ComponentProps } from "react";

export function parseMoneyDraft(draft: string): number | null {
  if (!/^\d*(?:\.\d*)?$/.test(draft)) return null;
  const value = draft === "" || draft === "." ? 0 : Number(draft);
  return Number.isFinite(value) ? value : null;
}

type Props = Omit<ComponentProps<"input">, "type" | "value" | "onChange" | "onFocus" | "onBlur"> & {
  value: number;
  onValueChange: (value: number) => void;
};

export function PosMoneyInput({ value, onValueChange, ...props }: Props) {
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <input
      {...props}
      type="text"
      inputMode="decimal"
      value={draft ?? String(value)}
      onFocus={() => setDraft(value === 0 ? "" : String(value))}
      onChange={(event) => {
        const next = event.target.value;
        const numeric = parseMoneyDraft(next);
        if (numeric === null) return;
        // Only the focused editor keeps lexical text; cart/payload state stays numeric.
        setDraft(next);
        onValueChange(numeric);
      }}
      onBlur={() => setDraft(null)}
    />
  );
}
