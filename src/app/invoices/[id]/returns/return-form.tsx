"use client";

import { startTransition, useActionState, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, RotateCcw } from "lucide-react";
import { createInvoiceReturnAction, type ReturnActionState } from "./actions";
import type { ReturnableInvoiceItem } from "@/lib/data/returns";
import { formatCurrency } from "@/lib/formatters";
import { cumulativeReturnCredit, parseReturnQuantity, previewReturnSettlement } from "@/lib/return-math";
import { formatMinorUnits } from "@/lib/money";
import { REFUND_METHODS } from "@/lib/validation/returns";
import { AppSelect } from "@/components/ui/app-select";
import { createClient } from "@/lib/supabase/client";

const initial: ReturnActionState = { error: null, success: null };
const UNCERTAIN_RESULT_MESSAGE = "We couldn't confirm the result. Retry the saved return to check it safely.";
const METHOD_LABELS: Record<string, string> = {
  cash: "Cash", card: "Card", easypaisa: "EasyPaisa", jazzcash: "JazzCash", bank_transfer: "Bank transfer",
};
const REFUND_OPTIONS = [{ value: "", label: "Choose refund method" },
  ...REFUND_METHODS.map(method => ({ value: method, label: METHOD_LABELS[method] }))];
type SavedRequest = { key: string; entries: [string, string][] };
type RestockMode = "all" | "none" | "custom";
const inputClass = "h-10 w-full min-w-0 rounded-lg border border-slate-200 bg-[#fff] px-3 text-slate-900 outline-none focus:border-blue-600 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";

export function ReturnForm({ invoiceId, items, currency, canProcess, initialKey }: {
  invoiceId: string; items: ReturnableInvoiceItem[]; currency: string; canProcess: boolean; initialKey: string;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const storageKey = `saledock:return-request:${invoiceId}`;
  const [requestKey, setRequestKey] = useState(initialKey);
  const [recovery, setRecovery] = useState<SavedRequest | null>(null);
  const [ready, setReady] = useState(false);
  const [outcomeUncertain, setOutcomeUncertain] = useState(false);
  const [localSuccess, setLocalSuccess] = useState<ReturnActionState | null>(null);
  const outcomeUncertainRef = useRef(false);
  const submissionLocked = useRef(false);
  const reconciledReturn = useRef<string | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [restockModes, setRestockModes] = useState<Record<string, RestockMode>>({});
  const [customRestock, setCustomRestock] = useState<Record<string, number>>({});

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (!active) return;
      try {
        const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? "null") as SavedRequest | null;
        if (saved && /^[0-9a-f-]{36}$/i.test(saved.key) && Array.isArray(saved.entries)
          && saved.entries.every(entry => Array.isArray(entry) && entry.length === 2 && entry.every(value => typeof value === "string"))) {
          setRequestKey(saved.key); setRecovery(saved);
        }
      } catch { /* Storage is optional; the current request still has a database key. */ }
      setReady(true);
    });
    return () => { active = false; };
  }, [storageKey]);

  const returnAction = useCallback(async (previous: ReturnActionState, formData: FormData) => {
    const saved: SavedRequest = { key: String(formData.get("idempotency_key")),
      entries: [...formData.entries()].map(([key, value]) => [key, String(value)]) };
    try { sessionStorage.setItem(storageKey, JSON.stringify(saved)); } catch {
      return { error: "Your browser could not save this return request. Enable browser storage before trying again. No return was made.", success: null };
    }
    try {
      const result = await createInvoiceReturnAction(previous, formData);
      if (result.authRedirect) { router.replace(result.authRedirect); return result; }
      if (result.outcomeUncertain) {
        outcomeUncertainRef.current = true; setOutcomeUncertain(true); setRecovery(saved);
      } else {
        try { sessionStorage.removeItem(storageKey); } catch { /* Nothing else to clean. */ }
        setRecovery(null);
      }
      if (result.success) setLocalSuccess(result);
      return result;
    } catch {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { router.replace("/login"); return { ...initial, authRedirect: "/login" as const }; }
      } catch { /* Preserve recovery when authentication cannot be confirmed. */ }
      outcomeUncertainRef.current = true; setOutcomeUncertain(true); setRecovery(saved);
      return { error: UNCERTAIN_RESULT_MESSAGE, success: null, outcomeUncertain: true };
    }
  }, [router, storageKey, supabase]);
  const [state, action, pending] = useActionState(returnAction, initial);

  useEffect(() => {
    if (!state.success) return;
    const resultKey = state.returnId ?? state.success;
    if (reconciledReturn.current === resultKey) return;
    reconciledReturn.current = resultKey;
    const url = new URL(window.location.href);
    url.searchParams.set("returnstate", crypto.randomUUID());
    router.replace(`${url.pathname}${url.search}`, { scroll: false });
  }, [router, state]);
  useEffect(() => {
    if (!pending && !outcomeUncertainRef.current) submissionLocked.current = false;
  }, [pending]);

  const credits = items.map(item => item.eligibility_error ? BigInt(0) : cumulativeReturnCredit(
    BigInt(item.original_net_minor), item.quantity_sold, item.quantity_returned,
    Math.min(quantities[item.id] ?? 0, item.quantity_returnable)));
  const settlement = previewReturnSettlement(credits.reduce((sum, credit) => sum + credit, BigInt(0)), items[0]?.remaining_due ?? "0");
  const hasSelection = items.some(item => (quantities[item.id] ?? 0) > 0);
  const eligibilityError = items.find(item => item.eligibility_error)?.eligibility_error;
  const successData = state.success ? state : localSuccess;

  function retrySaved() {
    if (!recovery || pending || submissionLocked.current && !outcomeUncertainRef.current) return;
    const formData = new FormData();
    for (const [key, value] of recovery.entries) formData.append(key, value);
    outcomeUncertainRef.current = false; setOutcomeUncertain(false); submissionLocked.current = true;
    startTransition(() => action(formData));
  }

  if (!canProcess) return <section className="print-hidden mt-6 border-t border-slate-200 pt-5 dark:border-slate-800">
    <h2 className="text-sm font-bold">Returns restricted</h2>
    <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">You do not have permission to process returns.</p>
  </section>;

  if (successData?.success) return <section role="status" aria-live="polite" className="print-hidden mt-6 border-t border-emerald-200 pt-5 dark:border-emerald-800">
    <h2 className="flex items-center gap-2 text-lg font-bold"><Check className="size-5 text-emerald-600" />Return processed</h2>
    <p className="mt-1 text-sm">{successData.success}</p>
    <dl className="mt-4 grid gap-3 sm:grid-cols-3">
      {[["Return credit", successData.returnCredit], ["Debt relieved", successData.debtRelief], ["Refund to customer", successData.refundAmount]].map(([label, value]) => <div key={String(label)}>
        <dt className="text-xs text-slate-500">{label}</dt><dd className="font-bold">{formatCurrency(Number(value ?? 0), currency)}</dd>
      </div>)}
    </dl>
    {successData.returnId && <a href={`/returns/${successData.returnId}`} className="mt-4 inline-flex h-11 items-center rounded-lg bg-blue-700 px-5 text-sm font-bold text-white">View return</a>}
    <button type="button" onClick={() => window.location.reload()} className="ml-2 mt-4 h-11 rounded-lg border px-4 text-sm font-semibold">Refresh invoice</button>
  </section>;

  return <section className="print-hidden mt-6 min-w-0 border-t border-slate-200 pt-5 dark:border-slate-800">
    <h2 className="text-lg font-bold text-slate-950 dark:text-slate-50">Process return</h2>
    {recovery && <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
      <p>A saved return request is waiting for confirmation.</p>
      <button type="button" onClick={retrySaved} disabled={pending} className="inline-flex h-10 items-center gap-2 rounded-lg border border-amber-300 px-3 font-semibold disabled:opacity-60"><RotateCcw className="size-4" />Retry saved return</button>
    </div>}
    {eligibilityError ? <p role="alert" className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">{eligibilityError}</p>
      : !items.some(item => item.quantity_returnable > 0) ? <p className="mt-4 text-sm text-slate-500">All items on this invoice have already been returned.</p>
      : <form action={action} onSubmit={event => {
        if (submissionLocked.current || outcomeUncertainRef.current || recovery) { event.preventDefault(); return; }
        submissionLocked.current = true;
      }} aria-busy={pending} className="mt-4 space-y-4">
        <input type="hidden" name="invoice_id" value={invoiceId} />
        <input type="hidden" name="idempotency_key" value={requestKey} />
        <div className="divide-y divide-slate-200 dark:divide-slate-800">
          {items.map((item, index) => {
            const quantity = quantities[item.id] ?? 0;
            const mode = restockModes[item.id] ?? "all";
            const restock = item.item_type === "service" || mode === "none" ? 0 : mode === "all" ? quantity : Math.min(customRestock[item.id] ?? 0, quantity);
            const blocked = item.service_principal > 0 || item.quantity_returnable === 0;
            return <div key={item.id} className="grid min-w-0 gap-3 py-4 md:grid-cols-[minmax(150px,1fr)_110px_210px_120px]">
              <div className="min-w-0">
                <input type="hidden" name="invoice_item_id" value={item.id} />
                <input type="hidden" name="quantity" value={quantity} />
                <input type="hidden" name="restock_quantity" value={restock} />
                <p className="break-words font-semibold text-slate-900 dark:text-slate-100">{item.item_name}</p>
                <p className="mt-1 text-xs text-slate-500">Originally sold: {item.quantity_sold} · Already returned: {item.quantity_returned}</p>
                {item.service_principal > 0 && <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">This service includes money passed to another provider and cannot be returned here.</p>}
              </div>
              <label className="min-w-0 text-xs font-semibold">
                <span>Return quantity</span>
                <input aria-label={`Return quantity for ${item.item_name}`} type="number" min={0} max={item.quantity_returnable} step={1} value={quantity}
                  disabled={pending || !!recovery || outcomeUncertain || blocked}
                  onChange={event => {
                    const parsed = parseReturnQuantity(event.target.value);
                    event.target.setCustomValidity(parsed === null ? "Enter a whole-number quantity." : "");
                    if (parsed !== null) setQuantities(current => ({ ...current, [item.id]: Math.min(parsed, item.quantity_returnable) }));
                  }}
                  className={`${inputClass} mt-1 text-right`} />
              </label>
              {item.item_type === "product" ? <div className="min-w-0">
                <p className="text-xs font-semibold">Qty to return to sellable stock</p>
                <div role="group" aria-label={`Restock for ${item.item_name}`} className="mt-1 grid h-10 grid-cols-3 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
                  {(["all", "none", "custom"] as const).map(value => <button type="button" key={value} aria-pressed={mode === value}
                    onClick={() => setRestockModes(current => ({ ...current, [item.id]: value }))} disabled={pending || !!recovery || outcomeUncertain || blocked}
                    className={`min-w-0 text-xs font-semibold disabled:opacity-60 ${mode === value ? "bg-blue-700 text-white" : "bg-[#fff] text-slate-700 dark:bg-slate-900 dark:text-slate-300"}`}>
                    {value === "all" ? "All" : value === "none" ? "None" : "Custom"}</button>)}
                </div>
                {mode === "custom" && <input aria-label={`Sellable stock quantity for ${item.item_name}`} type="number" min={0} max={quantity} step={1} value={restock}
                  disabled={pending || !!recovery || outcomeUncertain}
                  onChange={event => {
                    const parsed = parseReturnQuantity(event.target.value);
                    event.target.setCustomValidity(parsed === null ? "Enter a whole-number quantity." : "");
                    if (parsed !== null) setCustomRestock(current => ({ ...current, [item.id]: Math.min(parsed, quantity) }));
                  }}
                  className={`${inputClass} mt-2 text-right`} />}
              </div> : <p className="self-center text-xs text-slate-500">Service · No stock</p>}
              <div className="md:text-right"><p className="text-xs text-slate-500">Return credit</p><p className="mt-1 font-bold tabular-nums">{formatCurrency(Number(formatMinorUnits(credits[index])), currency)}</p></div>
            </div>;
          })}
        </div>
        <dl aria-label="Return settlement" className="grid gap-3 border-y border-slate-200 py-4 dark:border-slate-800 sm:grid-cols-3">
          {[["Return credit", settlement.credit], ["Debt relieved", settlement.debt], ["Refund to customer", settlement.refund]].map(([label, value]) => <div key={label}>
            <dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 font-bold tabular-nums">{formatCurrency(Number(value), currency)}</dd>
          </div>)}
        </dl>
        <div className="grid gap-3 sm:grid-cols-2">
          {Number(settlement.refund) > 0 && <label className="min-w-0 text-xs font-semibold">Refund method
            <AppSelect name="refund_method" options={REFUND_OPTIONS} ariaLabel="Refund method" disabled={pending || !!recovery || outcomeUncertain} className="mt-1" />
          </label>}
          <label className="min-w-0 text-xs font-semibold">Reference (optional)
            <input name="reference_number" maxLength={200} disabled={pending || !!recovery || outcomeUncertain} className={`${inputClass} mt-1`} />
          </label>
        </div>
        <label className="block text-xs font-semibold">Notes (optional)
          <textarea name="notes" maxLength={2000} rows={3} disabled={pending || !!recovery || outcomeUncertain} className={`${inputClass} mt-1 h-auto py-2`} />
        </label>
        {state.error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">{state.error}</p>}
        <button type="submit" disabled={!ready || pending || !hasSelection || !!recovery || outcomeUncertain}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-5 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-60 sm:w-auto">
          {pending ? <><Loader2 className="size-4 animate-spin" />Processing return...</> : "Process return"}
        </button>
      </form>}
  </section>;
}
