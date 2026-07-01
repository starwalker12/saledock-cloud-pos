import { z } from "zod";

const optionalString = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}, z.string({ message: "Enter text or leave this field blank." }).optional().nullable());

const optionalEmail = z
  .preprocess(
    (v) => (v === "" || v === null ? undefined : typeof v === "string" ? v.trim() : v),
    z.string().email("Invalid email.").optional()
  )
  .optional()
  .nullable();

const positiveNumber = z.coerce
  .number({ message: "Enter a valid amount." })
  .positive("Must be greater than 0.");

const nonNegativeNumber = z.coerce
  .number({ message: "Enter a valid number." })
  .min(0, "Must be 0 or more.");

const boolish = z.preprocess((v) => {
  if (v === "true" || v === "on" || v === true) return true;
  if (v === "false" || v === "off" || v === false || v === undefined || v === null || v === "")
    return false;
  return Boolean(v);
}, z.boolean());

export const CREDIT_PAYMENT_METHODS = [
  "cash",
  "card",
  "easypaisa",
  "jazzcash",
  "bank_transfer",
] as const;

export type CreditPaymentMethod = (typeof CREDIT_PAYMENT_METHODS)[number];

export const customerSchema = z.object({
  name: z.string().trim().min(1, "Customer name is required.").max(160),
  phone: optionalString,
  email: optionalEmail,
  address: optionalString,
  notes: optionalString,
  credit_limit: nonNegativeNumber.default(0),
  is_archived: boolish.default(false),
});
export type CustomerInput = z.infer<typeof customerSchema>;

export const creditPaymentSchema = z.object({
  amount: positiveNumber,
  method: z.enum(CREDIT_PAYMENT_METHODS, { message: "Invalid payment method." }),
  reference_number: optionalString,
  notes: optionalString,
});
export type CreditPaymentInput = z.infer<typeof creditPaymentSchema>;

export const writeOffSchema = z.object({
  amount: positiveNumber,
  reason: z.string().trim().min(1, "Reason is required.").max(500),
});
export type WriteOffInput = z.infer<typeof writeOffSchema>;
