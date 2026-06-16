"use client";

import { useCallback, useEffect, useState } from "react";

type DraftValue = string | number | boolean | undefined | null;

function readFormDraft(key: string): Record<string, DraftValue> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, DraftValue>;
    }
    return null;
  } catch {
    return null;
  }
}

function writeFormDraft(key: string, values: Record<string, DraftValue>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(values));
  } catch {
    // Storage may be full or unavailable; silently fail.
  }
}

function clearFormDraft(key: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore.
  }
}

/**
 * Preserve low-risk form draft values in localStorage.
 * Intended for settings/configuration forms only — NOT for checkout,
 * invoices, payments, stock, or any money/ledger data.
 *
 * Returns the stored draft (read once on mount) and persists `values`
 * whenever they change. The caller is responsible for applying the draft
 * to its own initial state.
 */
export function useFormDraft(options: {
  storageKey: string;
  enabled: boolean;
  values: Record<string, DraftValue>;
}) {
  const { storageKey, enabled, values } = options;

  const [draft] = useState<Record<string, DraftValue> | null>(() =>
    enabled ? readFormDraft(storageKey) : null,
  );

  useEffect(() => {
    if (!enabled) return;
    writeFormDraft(storageKey, values);
  }, [enabled, storageKey, values]);

  const discardDraft = useCallback(() => {
    clearFormDraft(storageKey);
  }, [storageKey]);

  return { draft, discardDraft };
}
