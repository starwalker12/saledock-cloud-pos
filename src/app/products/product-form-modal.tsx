"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { CategoryRow, ProductRow, SupplierRow } from "@/lib/data/catalog";
import { ProductForm } from "./product-form";

type ProductFormModalProps = {
  initialValues?: Partial<ProductRow>;
  categories: CategoryRow[];
  suppliers: SupplierRow[];
  canWrite: boolean;
  canManageOverride: boolean;
  onClose: () => void;
  onSaved?: () => void;
  onCategoryCreated?: (category: CategoryRow) => void;
};

export function ProductFormModal({
  initialValues,
  categories,
  suppliers,
  canWrite,
  canManageOverride,
  onClose,
  onSaved,
  onCategoryCreated,
}: ProductFormModalProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [dirty, setDirty] = useState(false);
  const isEdit = Boolean(initialValues?.id);

  const close = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    headingRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !dirty) close();
      if (event.key !== "Tab") return;

      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [close, dirty]);

  const handleSaved = useCallback(() => {
    onSaved?.();
    onClose();
  }, [onClose, onSaved]);

  return (
    <div
      className="fixed inset-0 z-[90] flex h-dvh min-h-dvh items-end justify-center bg-slate-950/70 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !dirty) close();
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-form-title"
        className="flex h-dvh w-full min-w-0 flex-col bg-[#fff] shadow-2xl dark:bg-slate-950 sm:h-auto sm:max-h-[92dvh] sm:max-w-4xl sm:rounded-xl sm:border sm:border-slate-200 sm:dark:border-slate-800"
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-4 py-4 sm:px-6 dark:border-slate-800">
          <div className="min-w-0">
            <h2
              id="product-form-title"
              ref={headingRef}
              tabIndex={-1}
              className="text-lg font-black text-slate-950 outline-none sm:text-xl dark:text-slate-100"
            >
              {isEdit ? "Edit product" : "Add product"}
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {isEdit
                ? `Update ${initialValues?.name ?? "this product"} without changing its inventory history.`
                : "Add the product details now. Stock lots can still be managed separately."}
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label={`Close ${isEdit ? "edit" : "add"} product`}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <X className="size-5" />
          </button>
        </header>

        <ProductForm
          key={initialValues?.id ?? `new-${initialValues?.barcode ?? "blank"}`}
          initialValues={initialValues}
          categories={categories}
          suppliers={suppliers}
          canWrite={canWrite}
          canManageOverride={canManageOverride}
          onSaved={handleSaved}
          onCancel={close}
          onDirtyChange={setDirty}
          onCategoryCreated={onCategoryCreated}
        />
      </section>
    </div>
  );
}
