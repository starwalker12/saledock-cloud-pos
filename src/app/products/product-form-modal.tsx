"use client";

import { useCallback, useState } from "react";
import { FormModal } from "@/components/ui/form-modal";
import { ProductForm } from "./product-form";
import type { CategoryRow, ProductRow, SupplierRow } from "@/lib/data/catalog";
import type { SavedProduct } from "./actions";

type ProductFormModalProps = {
  initialValues?: Partial<ProductRow>;
  categories: CategoryRow[];
  suppliers: SupplierRow[];
  canWrite: boolean;
  canManageOverride: boolean;
  onClose: () => void;
  onSaved?: (product: SavedProduct, manageStock: boolean) => void;
  onManageStock?: (product: SavedProduct) => void;
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
  onManageStock,
  onCategoryCreated,
}: ProductFormModalProps) {
  const isEdit = Boolean(initialValues?.id);
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState(false);

  const handleSaved = useCallback((product: SavedProduct, manageStock: boolean) => {
    if (onSaved) onSaved(product, manageStock);
    else onClose();
  }, [onClose, onSaved]);

  const handleClose = useCallback(() => {
    if (!pending) onClose();
  }, [onClose, pending]);

  return (
    <FormModal
      open
      onClose={handleClose}
      title={isEdit ? "Edit product" : "Add product"}
      description={
        isEdit
          ? `Update ${initialValues?.name ?? "this product"} without changing its inventory history.`
          : "Add the product details now. Stock lots can still be managed separately."
      }
      maxWidthClass="sm:max-w-4xl"
      bodyClassName="flex overflow-hidden p-0"
      preventDismiss={dirty}
      closeDisabled={pending}
    >
      <ProductForm
        key={initialValues?.id ?? `new-${initialValues?.barcode ?? "blank"}`}
        initialValues={initialValues}
        categories={categories}
        suppliers={suppliers}
        canWrite={canWrite}
        canManageOverride={canManageOverride}
        onSaved={handleSaved}
        onManageStock={onManageStock}
        onCancel={handleClose}
        onDirtyChange={setDirty}
        onPendingChange={setPending}
        onCategoryCreated={onCategoryCreated}
      />
    </FormModal>
  );
}
