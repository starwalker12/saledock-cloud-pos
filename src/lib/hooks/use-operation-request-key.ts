"use client";

import { useEffect, useState } from "react";

// Retain unknown-commit attempts; only a confirmed result starts a new operation.
export function useOperationRequestKey(scope: string, confirmed: unknown) {
  const [key, setKey] = useState("");
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const storageKey = "cash-operation-v2:" + scope;
      let saved: string | null = null;
      try {
        saved = confirmed ? null : sessionStorage.getItem(storageKey);
      } catch {
        /* Optional persistence. */
      }
      const next =
        saved &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          saved,
        )
          ? saved
          : crypto.randomUUID();
      try {
        sessionStorage.setItem(storageKey, next);
      } catch {
        /* The mounted form retains its key. */
      }
      setKey(next);
    });
    return () => {
      cancelled = true;
    };
  }, [scope, confirmed]);
  return key;
}

// Complete this before ActionState settlement can unmount the form. Unknown
// outcomes retain their key, and an older response cannot clear a newer attempt.
export function confirmOperationRequestKey(scope: string, formData: FormData) {
  const storageKey = "cash-operation-v2:" + scope;
  try {
    if (sessionStorage.getItem(storageKey) === formData.get("request_key")) {
      sessionStorage.removeItem(storageKey);
    }
  } catch {
    /* Optional persistence. */
  }
}

export function confirmingOperationAction<S extends { success?: unknown }>(
  scope: string,
  action: (previous: S, formData: FormData) => Promise<S>,
) {
  return async (previous: S, formData: FormData): Promise<S> => {
    const result = await action(previous, formData);
    if (result.success) confirmOperationRequestKey(scope, formData);
    return result;
  };
}
