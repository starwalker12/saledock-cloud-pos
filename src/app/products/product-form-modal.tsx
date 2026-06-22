"use client";

import { useCallback, useState } from "react";
import { FormModal } from "@/components/ui/form-modal";
import { ProductForm } from "./product-form";
import type { CategoryRow, ProductRow, SupplierRow } from "@/lib/data/catalog";

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
  const isEdit = Boolean(initialValues?.id);
  const [dirty, setDirty] = useState(false);

  const handleSaved = useCallback(() => {
    onSaved?.();
    onClose();
  }, [onClose, onSaved]);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

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
    >
      <ProductForm
        key={initialValues?.id ?? `new-${initialValues?.barcode ?? "blank"}`}
        initialValues={initialValues}
        categories={categories}
        suppliers={suppliers}
        canWrite={canWrite}
        canManageOverride={canManageOverride}
        onSaved={handleSaved}
        onCancel={handleClose}
        onDirtyChange={setDirty}
        onCategoryCreated={onCategoryCreated}
      />
    </FormModal>
  );
}
