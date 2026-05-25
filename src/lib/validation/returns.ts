import { z } from "zod";

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
    (v) => (v === "" || v === null ? undefined : typeof v === "string" ? v.trim() : v),
    z.string().min(1).optional(),
  )
  .optional()
  .nullable();

const boolish = z.preprocess((v) => {
  if (v === "true" || v === "on" || v === true) return true;
  if (v === "false" || v === "off" || v === false || v === undefined || v === null || v === "")
    return false;
  return Boolean(v);
}, z.boolean());

export const returnItemInputSchema = z.object({
  invoice_item_id: z.string().uuid("Invalid invoice item."),
  quantity: z.coerce.number().int().min(0, "Return quantity cannot be negative."),
  restock: boolish.default(true),
});

export const createReturnSchema = z
  .object({
    invoice_id: z.string().uuid("Invalid invoice."),
    refund_amount: z.coerce.number().min(0, "Refund amount cannot be negative.").default(0),
    refund_method: z.enum(REFUND_METHODS).optional().nullable(),
    reference_number: optionalString,
    notes: optionalString,
    items: z.array(returnItemInputSchema).min(1, "Select at least one item."),
  })
  .superRefine((data, ctx) => {
    const selected = data.items.filter((item) => item.quantity > 0);
    if (selected.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter a return quantity for at least one item.",
        path: ["items"],
      });
    }
    if (data.refund_amount > 0 && !data.refund_method) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Choose a refund method when refund amount is greater than zero.",
        path: ["refund_method"],
      });
    }
  });

export type ReturnItemInput = z.infer<typeof returnItemInputSchema>;
export type CreateReturnInput = z.infer<typeof createReturnSchema>;
