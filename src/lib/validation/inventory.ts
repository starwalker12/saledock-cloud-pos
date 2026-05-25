import { z } from "zod";

const optionalString = z
  .preprocess((v) => (typeof v === "string" ? v.trim() : v), z.string().min(1))
  .optional()
  .nullable();

const positiveInteger = z.coerce
  .number({ message: "Must be a valid integer." })
  .int("Must be an integer.")
  .positive("Must be greater than 0.");

const nonNegativeNumber = z.coerce
  .number({ message: "Must be a valid number." })
  .min(0, "Must be 0 or more.");

export const stockLotSchema = z.object({
  lot_number: optionalString,
  purchase_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD).").optional().nullable(),
  quantity_received: positiveInteger,
  unit_cost: nonNegativeNumber,
  supplier_id: optionalString,
  notes: optionalString,
});
export type StockLotInput = z.infer<typeof stockLotSchema>;

export const stockAdjustmentSchema = z.object({
  adjustment_type: z.enum(["in", "out"], { message: "Invalid adjustment type." }),
  quantity: positiveInteger,
  notes: z.string().trim().min(3, "Please provide a detailed audit reason (at least 3 characters)."),
});
export type StockAdjustmentInput = z.infer<typeof stockAdjustmentSchema>;
