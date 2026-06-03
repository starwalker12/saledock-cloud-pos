"use client";

import type { ReactNode } from "react";

export function ConfirmForm({
  action,
  message,
  children,
}: {
  action: (formData: FormData) => void;
  message: string;
  children: ReactNode;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(message)) {
          e.preventDefault();
        }
      }}
    >
      {children}
    </form>
  );
}
