import { z } from "zod";

const optionalString = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}, z.string().min(1).optional().nullable());

const optionalEmail = z
  .preprocess((v) => (typeof v === "string" ? v.trim() : v), z.string().email("Invalid email."))
  .optional()
  .nullable();

const nonNegativeNumber = z.coerce
  .number({ message: "Enter a valid number." })
  .min(0, "Must be 0 or more.");

const nonNegativeInt = z.coerce
  .number({ message: "Enter a valid number." })
  .int("Must be a whole number.")
  .min(0, "Must be 0 or more.");

const boolish = z.preprocess((v) => {
  if (v === "true" || v === "on" || v === true) return true;
  if (v === "false" || v === "off" || v === false || v === undefined || v === null || v === "")
    return false;
  return Boolean(v);
}, z.boolean());

export const categorySchema = z.object({
  name: z.string().trim().min(1, "Category name is required.").max(120),
  description: optionalString,
  is_active: boolish.default(true),
});
export type CategoryInput = z.infer<typeof categorySchema>;

export const supplierSchema = z.object({
  name: z.string().trim().min(1, "Supplier name is required.").max(160),
  company: optionalString,
  phone: optionalString,
  email: optionalEmail,
  address: optionalString,
  notes: optionalString,
  is_active: boolish.default(true),
});
export type SupplierInput = z.infer<typeof supplierSchema>;

export const productSchema = z.object({
  name: z.string().trim().min(1, "Product name is required.").max(200),
  sku: optionalString,
  barcode: optionalString,
  category_id: z
    .preprocess((v) => (v === "" || v === null ? undefined : v), z.string().uuid().optional()),
  supplier_id: z
    .preprocess((v) => (v === "" || v === null ? undefined : v), z.string().uuid().optional()),
  purchase_price: nonNegativeNumber.default(0),
  sale_price: nonNegativeNumber.default(0),
  stock_quantity: nonNegativeInt.default(0),
  minimum_stock: nonNegativeInt.default(0),
  is_service: boolish.default(false),
  allow_sell_at_loss: boolish.default(false),
  sell_at_loss_reason: optionalString,
  notes: optionalString,
  is_active: boolish.default(true),
}).superRefine((data, ctx) => {
  if (!data.is_service) {
    if (!data.allow_sell_at_loss) {
      if (data.purchase_price >= data.sale_price) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["sale_price"],
          message: "Physical product sale price must be strictly higher than cost price.",
        });
      }
    } else {
      if (!data.sell_at_loss_reason || data.sell_at_loss_reason.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["sell_at_loss_reason"],
          message: "A loss sale override reason is required.",
        });
      }
    }
  }
});
export type ProductInput = z.infer<typeof productSchema>;
