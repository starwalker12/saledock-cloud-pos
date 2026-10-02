import { z } from "zod";
import { isValidCalendarDate } from "@/lib/datetime";

function blankToUndefined(value: unknown) {
  if (typeof value !== "string") return value;
  return value.trim() || undefined;
}

const optionalString = z.preprocess(
  blankToUndefined,
  z.string({ message: "Enter valid optional text." }).optional().nullable(),
);

const positiveInteger = z.coerce
  .number({ message: "Must be a valid integer." })
  .int("Must be an integer.")
  .positive("Must be greater than 0.");

export const stockLotSchema = z.object({
  lot_number: optionalString,
  purchase_date: z.preprocess(blankToUndefined, z.string({ message: "Purchase date is invalid." })
    .refine(isValidCalendarDate, "Purchase date is invalid.").optional().nullable()),
  quantity_received: z.coerce.number({ message: "Enter a valid received quantity." })
    .int("Received quantity must be a whole number.")
    .positive("Received quantity must be greater than 0."),
  unit_cost: z.preprocess(
    (value) => value === null ? undefined : blankToUndefined(value),
    z.coerce.number({ message: "Enter a valid purchase cost." })
      .min(0, "Purchase cost must be 0 or more."),
  ),
  supplier_id: z.preprocess(blankToUndefined, z.string({ message: "Choose a valid supplier." })
    .uuid("Choose a valid supplier.").optional().nullable()),
  notes: optionalString,
});
export type StockLotInput = z.infer<typeof stockLotSchema>;

export const stockAdjustmentSchema = z.object({
  adjustment_type: z.enum(["in", "out"], { message: "Invalid adjustment type." }),
  quantity: positiveInteger,
  notes: z.string().trim().min(3, "Please provide a detailed audit reason (at least 3 characters)."),
});
export type StockAdjustmentInput = z.infer<typeof stockAdjustmentSchema>;
