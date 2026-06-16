"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { saveProductAction, type ActionState } from "./actions";
import type { CategoryRow, ProductRow, SupplierRow } from "@/lib/data/catalog";
import { BarcodeScanner } from "./barcode-scanner";
import { Loader2 } from "lucide-react";
import { AppSelect } from "@/components/ui/app-select";

const initial: ActionState = { error: null, success: null };

export function ProductForm({
  initialValues,
  categories,
  suppliers,
  onSaved,
  canWrite,
  canManageOverride,
}: {
  initialValues?: Partial<ProductRow>;
  categories: CategoryRow[];
  suppliers: SupplierRow[];
  onSaved?: () => void;
  canWrite: boolean;
  canManageOverride: boolean;
}) {
  const [state, action, pending] = useActionState(saveProductAction, initial);
  const formRef = useRef<HTMLFormElement>(null);
  const [isService, setIsService] = useState(initialValues?.type === "service");
  const [allowSellAtLoss, setAllowSellAtLoss] = useState(initialValues?.allow_sell_at_loss ?? false);
  const [barcode, setBarcode] = useState(initialValues?.barcode ?? "");
  const barcodeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.success && !initialValues?.id) {
      formRef.current?.reset();
    }
    if (state.success) onSaved?.();
  }, [state.success, initialValues?.id, onSaved]);

  const input = "mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 outline-none focus:border-blue-600";
  const activeCategories = categories.filter((c) => c.is_active || c.id === initialValues?.category_id);
  const activeSuppliers = suppliers.filter((s) => s.is_active || s.id === initialValues?.supplier_id);
  const categoryOptions = [
    { value: "", label: "—" },
    ...activeCategories.map((c) => ({
      value: c.id,
      label: `${c.name}${c.is_active ? "" : " (archived)"}`,
    })),
  ];
  const supplierOptions = [
    { value: "", label: "—" },
    ...activeSuppliers.map((s) => ({
      value: s.id,
      label: `${s.name}${s.is_active ? "" : " (archived)"}`,
    })),
  ];

  return (
    <form ref={formRef} action={action} className="grid gap-3 md:grid-cols-2">
      {initialValues?.id && <input type="hidden" name="id" value={initialValues.id} />}

      <label className="block md:col-span-2">
        <span className="text-sm font-semibold text-slate-700">Name <span className="text-red-500">*</span></span>
        <input required name="name" defaultValue={initialValues?.name ?? ""} disabled={!canWrite} className={input} />
      </label>

      <label className="block">
        <span className="text-sm font-semibold text-slate-700">SKU (optional)</span>
        <input name="sku" defaultValue={initialValues?.sku ?? ""} disabled={!canWrite} className={input} />
      </label>
      <div className="block">
        <span className="text-sm font-semibold text-slate-700">Barcode (optional)</span>
        <div className="mt-1 flex min-w-0 gap-2">
          <input
            ref={barcodeRef}
            name="barcode"
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            disabled={!canWrite}
            className={`${input} flex-1`}
            onKeyDown={(e) => {
              // USB scanners emulate a keyboard press of Enter after the value.
              // Prevent Enter from submitting the whole form.
              if (e.key === "Enter") {
                e.preventDefault();
              }
            }}
          />
          {canWrite && (
            <BarcodeScanner
              onDetected={(code) => {
                setBarcode(code);
                barcodeRef.current?.focus();
              }}
              disabled={pending}
            />
          )}
        </div>
      </div>

      <label className="block">
        <span className="text-sm font-semibold text-slate-700">Category</span>
        <AppSelect
          name="category_id"
          defaultValue={initialValues?.category_id ?? ""}
          disabled={!canWrite}
          options={categoryOptions}
          ariaLabel="Category"
          searchable={activeCategories.length > 8}
          className="mt-1"
          buttonClassName="h-11"
        />
      </label>
      <label className="block">
        <span className="text-sm font-semibold text-slate-700">Supplier</span>
        <AppSelect
          name="supplier_id"
          defaultValue={initialValues?.supplier_id ?? ""}
          disabled={!canWrite}
          options={supplierOptions}
          ariaLabel="Supplier"
          searchable={activeSuppliers.length > 8}
          className="mt-1"
          buttonClassName="h-11"
        />
      </label>

      <label className={`block ${isService ? "opacity-50" : ""}`}>
        <span className="text-sm font-semibold text-slate-700">
          Cost price (PKR){isService ? " — kept at 0 for services" : ""}
        </span>
        <input
          type="number"
          min={0}
          step="0.01"
          name="purchase_price"
          defaultValue={isService ? 0 : initialValues?.purchase_price ?? 0}
          disabled={!canWrite || isService}
          className={input}
        />
      </label>
      <label className="block">
        <span className="text-sm font-semibold text-slate-700">
          {isService ? "Commission (PKR)" : "Sale price (PKR)"}
        </span>
        <input
          type="number"
          min={0}
          step="0.01"
          name="sale_price"
          defaultValue={initialValues?.sale_price ?? 0}
          disabled={!canWrite}
          className={input}
        />
      </label>

      <label className={`block ${isService ? "opacity-50" : ""}`}>
        <span className="text-sm font-semibold text-slate-700">Stock quantity</span>
        <input
          type="number"
          min={0}
          step="1"
          name="stock_quantity"
          defaultValue={initialValues?.stock_quantity ?? 0}
          disabled={!canWrite || isService}
          className={input}
        />
      </label>
      <label className={`block ${isService ? "opacity-50" : ""}`}>
        <span className="text-sm font-semibold text-slate-700">Reorder level</span>
        <input
          type="number"
          min={0}
          step="1"
          name="minimum_stock"
          defaultValue={initialValues?.minimum_stock ?? 0}
          disabled={!canWrite || isService}
          className={input}
        />
      </label>

      <label className="block md:col-span-2">
        <span className="text-sm font-semibold text-slate-700">Notes (optional)</span>
        <textarea
          name="notes"
          rows={2}
          defaultValue={initialValues?.notes ?? ""}
          disabled={!canWrite}
          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-blue-600"
        />
      </label>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          name="is_service"
          checked={isService}
          onChange={(e) => setIsService(e.currentTarget.checked)}
          disabled={!canWrite}
          className="size-4"
        />
        <span className="text-sm font-semibold text-slate-700">This is a service (no stock)</span>
      </label>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          name="is_active"
          defaultChecked={initialValues?.is_active ?? true}
          disabled={!canWrite}
          className="size-4"
        />
        <span className="text-sm font-semibold text-slate-700">Active</span>
      </label>

      {!isService && (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3 md:col-span-2 md:p-4">
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              name="allow_sell_at_loss"
              checked={allowSellAtLoss}
              onChange={(e) => setAllowSellAtLoss(e.currentTarget.checked)}
              disabled={!canWrite || !canManageOverride}
              className="size-4 mt-0.5"
            />
            <div>
              <span className="text-sm font-bold text-slate-800 block">Allow selling below cost price</span>
              <span className="text-[10px] text-slate-500 block mt-0.5">
                Admin-only. Use only for clearance, damaged stock, promotions, or special approval.
              </span>
              {!canManageOverride && (
                <span className="text-[10px] text-red-600 font-semibold block mt-1">
                  ⚠️ Disabled: Only owners or admins can toggle below-cost settings.
                </span>
              )}
            </div>
          </label>

          {allowSellAtLoss && (
            <label className="block mt-2">
              <span className="text-xs font-bold text-slate-700">Loss Sale Override Reason <span className="text-red-500">*</span></span>
              <input
                required={allowSellAtLoss}
                name="sell_at_loss_reason"
                defaultValue={initialValues?.sell_at_loss_reason ?? ""}
                disabled={!canWrite || !canManageOverride}
                placeholder="e.g. Clearance sale, promotional bundle, damaged packaging..."
                className="mt-1 h-9 w-full rounded-md border border-slate-200 px-3 text-xs outline-none focus:border-blue-600"
              />
            </label>
          )}
        </div>
      )}

      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700 md:col-span-2">{state.error}</p>
      )}
      {state.success && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 md:col-span-2">{state.success}</p>
      )}
      <div className="md:col-span-2">
        <button
          type="submit"
          disabled={pending || !canWrite}
          className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-lg bg-blue-700 px-4 text-sm font-bold text-white transition hover:bg-blue-800 disabled:opacity-60 md:h-10 md:w-auto cursor-pointer"
        >
          {pending ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Saving…
            </>
          ) : initialValues?.id ? (
            "Update product"
          ) : (
            "Add product"
          )}
        </button>
      </div>
    </form>
  );
}
