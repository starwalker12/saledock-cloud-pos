"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type PendingSubmitButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "type" | "children"
> & {
  children: ReactNode;
  pendingLabel: string;
};

export function PendingSubmitButton({
  children,
  pendingLabel,
  disabled,
  className = "",
  ...props
}: PendingSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      {...props}
      type="submit"
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      className={`${className} disabled:cursor-not-allowed disabled:opacity-60`}
    >
      <span className="grid place-items-center">
        <span
          className={`col-start-1 row-start-1 inline-flex items-center justify-center gap-1.5 ${pending ? "invisible" : "visible"}`}
        >
          {children}
        </span>
        <span
          className={`col-start-1 row-start-1 inline-flex items-center justify-center gap-1.5 ${pending ? "visible" : "invisible"}`}
        >
          <Loader2
            className="size-3.5 animate-spin motion-reduce:animate-none"
            aria-hidden="true"
          />
          {pendingLabel}
        </span>
      </span>
    </button>
  );
}
