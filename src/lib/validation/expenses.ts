import { z } from "zod";
import { PAYMENT_METHODS, type PaymentMethod } from "@/lib/validation/pos";

export const EXPENSE_PAYMENT_METHODS = PAYMENT_METHODS.filter(
  (m) => m !== "customer_credit",
) as Exclude<PaymentMethod, "customer_credit">[];
export type ExpensePaymentMethod = (typeof EXPENSE_PAYMENT_METHODS)[number];

const optionalText = z
  .preprocess(
    (v) => (typeof v === "string" ? v.trim() : v),
    z.string().min(1),
  )
  .optional()
  .nullable();

export const expenseSchema = z.object({
  category: z.string().trim().min(1, "Category is required.").max(80),
  amount: z.coerce.number({ message: "Enter a valid amount." }).gt(0, "Amount must be greater than 0."),
  payment_method: z.enum(EXPENSE_PAYMENT_METHODS),
  vendor_name: optionalText,
  notes: optionalText,
  spent_at: z
    .preprocess((v) => {
      if (typeof v !== "string" || !v.trim()) return undefined;
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? v : d.toISOString();
    }, z.string().datetime({ offset: true, message: "Invalid date." }).optional()),
});

export type ExpenseInput = z.infer<typeof expenseSchema>;

// Convenient list of suggested categories — free text in DB but UI offers presets.
export const SUGGESTED_CATEGORIES = [
  "Rent",
  "Utilities",
  "Salaries",
  "Inventory purchase",
  "Marketing",
  "Travel",
  "Maintenance",
  "Supplies",
  "Bank charges",
  "Tax",
  "Miscellaneous",
] as const;
