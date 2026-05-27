import { z } from "zod";
import { PAYMENT_METHODS } from "@/lib/validation/pos";

export const SUPPLIER_PAYMENT_METHODS = PAYMENT_METHODS.filter(
  (m) => m !== "customer_credit",
);
export type SupplierPaymentMethod = (typeof SUPPLIER_PAYMENT_METHODS)[number];

const trimmedString = z.preprocess(
  (v) => (typeof v === "string" ? v.trim() : v),
  z.string().min(1),
);

const optionalText = z
  .preprocess((v) => {
    if (typeof v !== "string") return v;
    const t = v.trim();
    return t === "" ? undefined : t;
  }, z.string().optional())
  .nullable()
  .optional();

export const purchaseItemSchema = z.object({
  product_id: z.string().uuid("Pick a product."),
  quantity: z.coerce.number().int().gt(0, "Quantity must be greater than 0."),
  unit_cost: z.coerce.number().gte(0, "Unit cost cannot be negative."),
  notes: optionalText,
});
export type PurchaseItemInput = z.infer<typeof purchaseItemSchema>;

export const createPurchaseSchema = z
  .object({
    supplier_id: z.string().uuid("Pick a supplier."),
    purchase_date: z
      .preprocess(
        (v) => (typeof v === "string" && v.trim() ? v.trim() : undefined),
        z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.")
          .optional(),
      )
      .optional(),
    items: z.array(purchaseItemSchema).min(1, "Add at least one item."),
    discount_total: z.coerce.number().gte(0, "Discount cannot be negative.").default(0),
    reference_no: optionalText,
    notes: optionalText,
    payment_method: z.enum(SUPPLIER_PAYMENT_METHODS).optional(),
    amount_paid: z.coerce.number().gte(0, "Amount paid cannot be negative.").default(0),
    payment_ref: optionalText,
  })
  .refine(
    (v) => {
      const subtotal = v.items.reduce((s, i) => s + i.quantity * i.unit_cost, 0);
      const grand = Math.max(subtotal - (v.discount_total ?? 0), 0);
      return (v.amount_paid ?? 0) <= grand + 0.0001;
    },
    { message: "Amount paid cannot exceed grand total.", path: ["amount_paid"] },
  );

export type CreatePurchaseInput = z.infer<typeof createPurchaseSchema>;

export const recordPaymentSchema = z.object({
  supplier_id: z.string().uuid("Pick a supplier."),
  purchase_id: z
    .preprocess(
      (v) => (typeof v === "string" && v.trim() ? v.trim() : undefined),
      z.string().uuid().optional(),
    )
    .optional(),
  method: z.enum(SUPPLIER_PAYMENT_METHODS),
  amount: z.coerce.number().gt(0, "Amount must be greater than 0."),
  reference_no: optionalText,
  note: optionalText,
});
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;

// Helper used by the new-purchase form when parsing JSON-serialized items.
export function parseItemsJson(raw: string | null): PurchaseItemInput[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .map((it) => purchaseItemSchema.safeParse(it))
      .filter((r): r is { success: true; data: PurchaseItemInput } => r.success)
      .map((r) => r.data);
  } catch {
    return [];
  }
}

// Convenience helper to expose the trimmed-string parser to callers.
export { trimmedString as _trimmedString };
