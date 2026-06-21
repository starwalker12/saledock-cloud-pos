"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { AppSelect } from "@/components/ui/app-select";
import type { CategoryRow, ProductRow, SupplierRow } from "@/lib/data/catalog";
import { saveProductAction, type ActionState } from "./actions";
import { BarcodeScanner } from "./barcode-scanner";
import { ProductImageField } from "./product-image-field";

const initial: ActionState = { error: null, success: null };

type ProductFormProps = {
  initialValues?: Partial<ProductRow>;
  categories: CategoryRow[];
  suppliers: SupplierRow[];
  onSaved?: () => void;
  onCancel?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  canWrite: boolean;
  canManageOverride: boolean;
};

const inputClass =
  "mt-1 h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-[#fff] px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:disabled:bg-slate-900/60";

const labelClass = "text-sm font-semibold text-slate-700 dark:text-slate-300";

export function ProductForm({
  initialValues,
  categories,
  suppliers,
  onSaved,
  onCancel,
  onDirtyChange,
  canWrite,
  canManageOverride,
}: ProductFormProps) {
  const [state, action, pending] = useActionState(saveProductAction, initial);
  const formRef = useRef<HTMLFormElement>(null);
  const [isService, setIsService] = useState(initialValues?.type === "service");
  const [allowSellAtLoss, setAllowSellAtLoss] = useState(
    initialValues?.allow_sell_at_loss ?? false,
  );
  const [barcode, setBarcode] = useState(initialValues?.barcode ?? "");
  const barcodeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.success && !initialValues?.id) formRef.current?.reset();
    if (state.success) onSaved?.();
  }, [state.success, initialValues?.id, onSaved]);

  const activeCategories = categories.filter(
    (category) =>
      category.is_active || category.id === initialValues?.category_id,
  );
  const activeSuppliers = suppliers.filter(
    (supplier) =>
      supplier.is_active || supplier.id === initialValues?.supplier_id,
  );
  const categoryOptions = [
    { value: "", label: "No category" },
    ...activeCategories.map((category) => ({
      value: category.id,
      label: `${category.name}${category.is_active ? "" : " (archived)"}`,
    })),
  ];
  const supplierOptions = [
    { value: "", label: "No supplier" },
    ...activeSuppliers.map((supplier) => ({
      value: supplier.id,
      label: `${supplier.name}${supplier.is_active ? "" : " (archived)"}`,
    })),
  ];

  return (
    <form
      ref={formRef}
      action={action}
      className="flex min-h-0 flex-1 flex-col"
      onChangeCapture={() => onDirtyChange?.(true)}
    >
      {initialValues?.id && (
        <input type="hidden" name="id" value={initialValues.id} />
      )}

      <div className="min-h-0 flex-1 space-y-7 overflow-y-auto px-4 py-5 pb-8 sm:px-6">
        <section aria-labelledby="basic-product-heading">
          <div className="mb-4">
            <h3
              id="basic-product-heading"
              className="text-sm font-black text-slate-950 dark:text-slate-100"
            >
              Basic product info
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Name the item and connect it to the right catalog records.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <ProductImageField
                currentUrl={initialValues?.image_url}
                disabled={!canWrite || pending}
                onDirty={() => onDirtyChange?.(true)}
              />
            </div>
            <label className="block md:col-span-2">
              <span className={labelClass}>
                Name <span className="text-red-600">*</span>
              </span>
              <input
                required
                autoFocus
                name="name"
                defaultValue={initialValues?.name ?? ""}
                disabled={!canWrite}
                className={inputClass}
              />
            </label>

            <label className="block">
              <span className={labelClass}>SKU</span>
              <input
                name="sku"
                defaultValue={initialValues?.sku ?? ""}
                disabled={!canWrite}
                placeholder="Optional internal code"
                className={inputClass}
              />
            </label>

            <div className="block min-w-0">
              <span className={labelClass}>Barcode</span>
              <div className="mt-1 flex min-w-0 gap-2">
                <input
                  ref={barcodeRef}
                  name="barcode"
                  value={barcode}
                  onChange={(event) => setBarcode(event.target.value)}
                  disabled={!canWrite}
                  placeholder="Optional barcode"
                  className={`${inputClass} mt-0 flex-1`}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.preventDefault();
                  }}
                />
                {canWrite && (
                  <BarcodeScanner
                    onDetected={(code) => {
                      setBarcode(code);
                      barcodeRef.current?.focus();
                      onDirtyChange?.(true);
                    }}
                    disabled={pending}
                  />
                )}
              </div>
            </div>

            <label className="block min-w-0">
              <span className={labelClass}>Category</span>
              <AppSelect
                name="category_id"
                defaultValue={initialValues?.category_id ?? ""}
                disabled={!canWrite}
                options={categoryOptions}
                ariaLabel="Product category"
                searchable={activeCategories.length > 8}
                className="mt-1"
                buttonClassName="h-11"
              />
            </label>

            <label className="block min-w-0">
              <span className={labelClass}>Supplier</span>
              <AppSelect
                name="supplier_id"
                defaultValue={initialValues?.supplier_id ?? ""}
                disabled={!canWrite}
                options={supplierOptions}
                ariaLabel="Product supplier"
                searchable={activeSuppliers.length > 8}
                className="mt-1"
                buttonClassName="h-11"
              />
            </label>
          </div>
        </section>

        <section
          aria-labelledby="pricing-heading"
          className="border-t border-slate-200 pt-6 dark:border-slate-800"
        >
          <div className="mb-4">
            <h3
              id="pricing-heading"
              className="text-sm font-black text-slate-950 dark:text-slate-100"
            >
              Pricing
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Prices use the shop currency and existing below-cost safeguards.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className={isService ? "block opacity-60" : "block"}>
              <span className={labelClass}>
                Cost price (PKR){isService ? " - not used for services" : ""}
              </span>
              <input
                type="number"
                min={0}
                step="0.01"
                name="purchase_price"
                defaultValue={
                  isService ? 0 : (initialValues?.purchase_price ?? 0)
                }
                disabled={!canWrite || isService}
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className={labelClass}>
                {isService ? "Commission (PKR)" : "Sale price (PKR)"}
              </span>
              <input
                type="number"
                min={0}
                step="0.01"
                name="sale_price"
                defaultValue={initialValues?.sale_price ?? 0}
                disabled={!canWrite}
                className={inputClass}
              />
            </label>
          </div>

          {!isService && (
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/70">
              <label className="flex min-h-11 items-start gap-3">
                <input
                  type="checkbox"
                  name="allow_sell_at_loss"
                  checked={allowSellAtLoss}
                  onChange={(event) =>
                    setAllowSellAtLoss(event.currentTarget.checked)
                  }
                  disabled={!canWrite || !canManageOverride}
                  className="mt-1 size-4"
                />
                <span>
                  <span className="block text-sm font-bold text-slate-800 dark:text-slate-200">
                    Allow selling below cost price
                  </span>
                  <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                    Use only for clearance, damaged stock, promotions, or
                    special approval.
                  </span>
                  {!canManageOverride && (
                    <span className="mt-1 block text-xs font-semibold text-red-600 dark:text-red-400">
                      Only owners or admins can change this setting.
                    </span>
                  )}
                </span>
              </label>

              {allowSellAtLoss && (
                <label className="mt-3 block">
                  <span className={labelClass}>
                    Approval reason <span className="text-red-600">*</span>
                  </span>
                  <input
                    required
                    name="sell_at_loss_reason"
                    defaultValue={initialValues?.sell_at_loss_reason ?? ""}
                    disabled={!canWrite || !canManageOverride}
                    placeholder="Clearance, damaged packaging, approved promotion..."
                    className={inputClass}
                  />
                </label>
              )}
            </div>
          )}
        </section>

        <section
          aria-labelledby="stock-heading"
          className="border-t border-slate-200 pt-6 dark:border-slate-800"
        >
          <div className="mb-4">
            <h3
              id="stock-heading"
              className="text-sm font-black text-slate-950 dark:text-slate-100"
            >
              Stock and availability
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Services do not track stock. Product stock and FIFO tools remain
              separate.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-200 px-3 dark:border-slate-800">
              <input
                type="checkbox"
                name="is_service"
                checked={isService}
                onChange={(event) => setIsService(event.currentTarget.checked)}
                disabled={!canWrite}
                className="size-4"
              />
              <span className={labelClass}>This is a service (no stock)</span>
            </label>
            <label className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-200 px-3 dark:border-slate-800">
              <input
                type="checkbox"
                name="is_active"
                defaultChecked={initialValues?.is_active ?? true}
                disabled={!canWrite}
                className="size-4"
              />
              <span className={labelClass}>Active and available for sale</span>
            </label>
            <label className={isService ? "block opacity-60" : "block"}>
              <span className={labelClass}>Stock quantity</span>
              <input
                type="number"
                min={0}
                step="1"
                name="stock_quantity"
                defaultValue={initialValues?.stock_quantity ?? 0}
                disabled={!canWrite || isService}
                className={inputClass}
              />
            </label>
            <label className={isService ? "block opacity-60" : "block"}>
              <span className={labelClass}>Reorder level</span>
              <input
                type="number"
                min={0}
                step="1"
                name="minimum_stock"
                defaultValue={initialValues?.minimum_stock ?? 0}
                disabled={!canWrite || isService}
                className={inputClass}
              />
            </label>
          </div>
        </section>

        <section
          aria-labelledby="notes-heading"
          className="border-t border-slate-200 pt-6 dark:border-slate-800"
        >
          <h3
            id="notes-heading"
            className="text-sm font-black text-slate-950 dark:text-slate-100"
          >
            Notes
          </h3>
          <label className="mt-3 block">
            <span className="sr-only">Product notes</span>
            <textarea
              name="notes"
              rows={3}
              defaultValue={initialValues?.notes ?? ""}
              disabled={!canWrite}
              placeholder="Optional internal product notes"
              className="w-full resize-y rounded-lg border border-slate-300 bg-[#fff] px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </label>
        </section>

        {state.error && (
          <p
            role="alert"
            className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300"
          >
            {state.error}
          </p>
        )}
        {state.success && (
          <p
            role="status"
            className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
          >
            {state.success}
          </p>
        )}
      </div>

      <footer className="sticky bottom-0 z-10 flex shrink-0 flex-col-reverse gap-2 border-t border-slate-200 bg-[#fff] px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:flex-row sm:justify-end sm:px-6 dark:border-slate-800 dark:bg-slate-950">
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending || !canWrite}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-blue-700 px-5 text-sm font-bold text-white transition hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-400 dark:focus-visible:ring-offset-slate-950"
        >
          {pending && (
            <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
          )}
          {pending
            ? "Saving..."
            : initialValues?.id
              ? "Save changes"
              : "Add product"}
        </button>
      </footer>
    </form>
  );
}
