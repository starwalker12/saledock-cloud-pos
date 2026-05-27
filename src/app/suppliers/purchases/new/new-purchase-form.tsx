"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/formatters";
import { SUPPLIER_PAYMENT_METHODS, type SupplierPaymentMethod } from "@/lib/validation/supplier-purchases";
import { createSupplierPurchaseAction } from "../actions";

type Supplier = { id: string; name: string; company: string | null };
type Product = {
  id: string;
  name: string;
  sku: string | null;
  purchase_price: number;
  stock_quantity: number;
};
type Line = {
  product_id: string;
  product_name: string;
  quantity: number;
  unit_cost: number;
  notes: string;
};

const PAYMENT_LABELS: Record<SupplierPaymentMethod, string> = {
  cash: "Cash",
  card: "Card",
  easypaisa: "EasyPaisa",
  jazzcash: "JazzCash",
  bank_transfer: "Bank transfer",
};

const todayLocal = () => {
  const d = new Date();
  const tz = d.getTimezoneOffset();
  return new Date(d.getTime() - tz * 60_000).toISOString().slice(0, 10);
};

export function NewPurchaseForm({
  suppliers,
  products,
  currency,
}: {
  suppliers: Supplier[];
  products: Product[];
  currency: string;
}) {
  const router = useRouter();
  const [supplierId, setSupplierId] = useState<string>(suppliers[0]?.id ?? "");
  const [purchaseDate, setPurchaseDate] = useState<string>(todayLocal());
  const [referenceNo, setReferenceNo] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [discount, setDiscount] = useState<number>(0);
  const [lines, setLines] = useState<Line[]>([]);
  const [productPicker, setProductPicker] = useState<string>("");
  const [amountPaid, setAmountPaid] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<SupplierPaymentMethod>("cash");
  const [paymentRef, setPaymentRef] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const productById = useMemo(
    () => new Map(products.map((p) => [p.id, p] as const)),
    [products],
  );

  const subtotal = lines.reduce((s, l) => s + l.quantity * l.unit_cost, 0);
  const grand = Math.max(subtotal - discount, 0);
  const balance = Math.max(grand - amountPaid, 0);

  const addLine = () => {
    if (!productPicker) return;
    if (lines.some((l) => l.product_id === productPicker)) return;
    const p = productById.get(productPicker);
    if (!p) return;
    setLines((curr) => [
      ...curr,
      {
        product_id: p.id,
        product_name: p.name,
        quantity: 1,
        unit_cost: Number(p.purchase_price ?? 0),
        notes: "",
      },
    ]);
    setProductPicker("");
  };

  const updateLine = (idx: number, patch: Partial<Line>) => {
    setLines((curr) => curr.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };

  const removeLine = (idx: number) => {
    setLines((curr) => curr.filter((_, i) => i !== idx));
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!supplierId) {
      setError("Pick a supplier.");
      return;
    }
    if (lines.length === 0) {
      setError("Add at least one line item.");
      return;
    }
    for (const l of lines) {
      if (l.quantity <= 0) {
        setError(`Quantity for ${l.product_name} must be greater than 0.`);
        return;
      }
      if (l.unit_cost < 0) {
        setError(`Unit cost for ${l.product_name} cannot be negative.`);
        return;
      }
    }
    if (amountPaid > grand + 0.0001) {
      setError("Amount paid cannot exceed grand total.");
      return;
    }

    startTransition(async () => {
      const res = await createSupplierPurchaseAction({
        supplier_id: supplierId,
        purchase_date: purchaseDate,
        items: lines.map((l) => ({
          product_id: l.product_id,
          quantity: l.quantity,
          unit_cost: l.unit_cost,
          notes: l.notes || null,
        })),
        discount_total: discount,
        reference_no: referenceNo || null,
        notes: notes || null,
        payment_method: amountPaid > 0 ? paymentMethod : undefined,
        amount_paid: amountPaid,
        payment_ref: paymentRef || null,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push(`/suppliers/purchases/${res.purchase_id}`);
      router.refresh();
    });
  };

  return (
    <form
      onSubmit={onSubmit}
      className="grid gap-6 lg:grid-cols-[1fr_360px]"
    >
      <div className="space-y-5">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-base font-black text-slate-950">Header</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Supplier *</span>
              <select
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3"
                required
              >
                <option value="">— Pick a supplier —</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.company ? ` · ${s.company}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Purchase date</span>
              <input
                type="date"
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Supplier invoice / ref #</span>
              <input
                value={referenceNo}
                onChange={(e) => setReferenceNo(e.target.value)}
                placeholder="optional"
                className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3"
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Notes</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
              />
            </label>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-base font-black text-slate-950">Items</h2>
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <label className="block min-w-[260px] flex-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Add product</span>
              <select
                value={productPicker}
                onChange={(e) => setProductPicker(e.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3"
              >
                <option value="">— Pick a product —</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id} disabled={lines.some((l) => l.product_id === p.id)}>
                    {p.name}
                    {p.sku ? ` (${p.sku})` : ""} · stock {p.stock_quantity}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={addLine}
              disabled={!productPicker}
              className="h-10 rounded-lg bg-blue-700 px-4 text-sm font-bold text-white disabled:opacity-40"
            >
              Add line
            </button>
          </div>

          {lines.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
              No items added. Pick a product above and click <strong>Add line</strong>.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-slate-200 text-xs font-bold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-2 py-2">Product</th>
                    <th className="px-2 py-2 w-24">Qty</th>
                    <th className="px-2 py-2 w-32">Unit cost</th>
                    <th className="px-2 py-2 text-right w-32">Line total</th>
                    <th className="px-2 py-2 w-12" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={l.product_id} className="border-b border-slate-100 align-top">
                      <td className="px-2 py-2">
                        <p className="font-bold text-slate-900">{l.product_name}</p>
                        <input
                          value={l.notes}
                          onChange={(e) => updateLine(i, { notes: e.target.value })}
                          placeholder="Per-line note (optional)"
                          className="mt-1 h-8 w-full rounded border border-slate-200 px-2 text-xs"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="number"
                          min={1}
                          step={1}
                          value={l.quantity}
                          onChange={(e) => updateLine(i, { quantity: Math.max(1, Number(e.target.value || 0)) })}
                          className="h-9 w-full rounded border border-slate-200 px-2"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={l.unit_cost}
                          onChange={(e) => updateLine(i, { unit_cost: Math.max(0, Number(e.target.value || 0)) })}
                          className="h-9 w-full rounded border border-slate-200 px-2"
                        />
                      </td>
                      <td className="px-2 py-2 text-right font-bold text-slate-900">
                        {formatCurrency(l.quantity * l.unit_cost, currency)}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => removeLine(i)}
                          className="rounded border border-rose-200 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <aside className="space-y-5">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-base font-black text-slate-950">Summary</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Subtotal</dt>
              <dd className="font-semibold text-slate-900">{formatCurrency(subtotal, currency)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-500">Discount</dt>
              <dd>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={discount}
                  onChange={(e) => setDiscount(Math.max(0, Number(e.target.value || 0)))}
                  className="h-8 w-28 rounded border border-slate-200 px-2 text-right"
                />
              </dd>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-2 text-base">
              <dt className="font-bold text-slate-700">Grand total</dt>
              <dd className="font-black text-slate-950">{formatCurrency(grand, currency)}</dd>
            </div>
          </dl>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-base font-black text-slate-950">Payment now (optional)</h2>
          <div className="space-y-3">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Amount paid</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={amountPaid}
                onChange={(e) => setAmountPaid(Math.max(0, Number(e.target.value || 0)))}
                className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3"
              />
            </label>
            {amountPaid > 0 && (
              <>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Method</span>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as SupplierPaymentMethod)}
                    className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3"
                  >
                    {SUPPLIER_PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {PAYMENT_LABELS[m]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Reference (optional)</span>
                  <input
                    value={paymentRef}
                    onChange={(e) => setPaymentRef(e.target.value)}
                    className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3"
                  />
                </label>
              </>
            )}
            <div className="flex justify-between border-t border-slate-200 pt-2 text-sm">
              <span className="text-slate-500">Remaining balance</span>
              <span className="font-bold text-rose-700">{formatCurrency(balance, currency)}</span>
            </div>
          </div>
        </section>

        {error && (
          <div className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm font-semibold text-rose-800">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={pending || lines.length === 0 || !supplierId}
          className="w-full rounded-xl bg-blue-700 px-4 py-3 text-sm font-bold text-white shadow-sm hover:bg-blue-800 disabled:opacity-50"
        >
          {pending ? "Recording…" : "Record purchase"}
        </button>
      </aside>
    </form>
  );
}
