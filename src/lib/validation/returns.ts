import { z } from "zod";
import { parseReturnQuantity } from "@/lib/return-math";

export const REFUND_METHODS = [
  "cash",
  "card",
  "easypaisa",
  "jazzcash",
  "bank_transfer",
] as const;

export type RefundMethod = (typeof REFUND_METHODS)[number];

const optionalString = z
  .preprocess(
    (v) => (typeof v === "string" ? v.trim() || undefined : v === null ? undefined : v),
    z.string().max(2000, "Keep return notes brief.").optional(),
  )
  .optional()
  .nullable();

const quantityInput = z.string().transform((value, ctx) => {
  const quantity = parseReturnQuantity(value);
  if (quantity === null) {
    ctx.addIssue({ code: "custom", message: "Quantity must be a whole number from 0 to 2147483647." });
    return z.NEVER;
  }
  return quantity;
});

export const returnItemInputSchema = z.object({
  invoice_item_id: z.string().uuid("Invalid invoice item."),
  quantity: quantityInput,
  restock_quantity: quantityInput,
}).superRefine((item, ctx) => {
  if (item.restock_quantity > item.quantity) ctx.addIssue({code: "custom",
    message: "Qty to return to sellable stock cannot exceed the returned quantity.", path: ["restock_quantity"]});
});

export const createReturnSchema = z
  .object({
    invoice_id: z.string().uuid("Invalid invoice."),
    idempotency_key: z.string().uuid("Reopen the return form and try again."),
    refund_method: z.enum(REFUND_METHODS).optional().nullable(),
    reference_number: optionalString,
    notes: optionalString,
    items: z.array(returnItemInputSchema).min(1, "Select at least one item."),
  })
  .superRefine((data, ctx) => {
    if (new Set(data.items.map(item => item.invoice_item_id)).size !== data.items.length) {
      ctx.addIssue({ code: "custom", message: "Choose return quantities once per invoice item.", path: ["items"] });
    }
    const selected = data.items.filter((item) => item.quantity > 0);
    if (selected.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter a return quantity for at least one item.",
        path: ["items"],
      });
    }
    if (data.reference_number && data.reference_number.length > 200) ctx.addIssue({
      code: "custom", message: "Keep the refund reference under 200 characters.", path: ["reference_number"],
    });
  });

export type ReturnItemInput = z.infer<typeof returnItemInputSchema>;
export type CreateReturnInput = z.infer<typeof createReturnSchema>;
