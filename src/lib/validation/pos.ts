import { z } from "zod";

export const PAYMENT_METHODS = [
  "cash",
  "card",
  "easypaisa",
  "jazzcash",
  "bank_transfer",
  "customer_credit",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

// Service direction options (free text in the database but a fixed set in the UI).
export const SERVICE_DIRECTIONS = [
  "cash_in",
  "cash_out",
  "send",
  "receive",
  "transfer",
  "bill_payment",
  "mobile_load",
  "other",
] as const;
export type ServiceDirection = (typeof SERVICE_DIRECTIONS)[number];

export const SERVICE_DIRECTION_LABELS: Record<ServiceDirection, string> = {
  cash_in: "Cash In",
  cash_out: "Cash Out",
  send: "Send",
  receive: "Receive",
  transfer: "Transfer",
  bill_payment: "Bill Payment",
  mobile_load: "Mobile Load",
  other: "Other",
};

const optionalString = z
  .preprocess((v) => {
    if (typeof v !== "string") return v;
    const trimmed = v.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }, z.string().max(120))
  .optional();

const optionalNonNegativeNumber = z
  .preprocess((v) => {
    if (v === "" || v === null || v === undefined) return undefined;
    return v;
  }, z.coerce.number().min(0, "Must be 0 or more."))
  .optional();

export const cartItemSchema = z
  .object({
    product_id: z.string().uuid(),
    quantity: z.coerce.number().int().min(1, "Quantity must be at least 1."),
    unit_price: z.coerce.number().min(0, "Unit price must be 0 or more."),
    discount: z.coerce.number().min(0, "Line discount must be 0 or more.").default(0),
    // Optional service transaction metadata — only relevant when the product
    // is a service. Validated again server-side inside pos_checkout.
    service_provider: optionalString,
    service_direction: optionalString,
    service_account_number: optionalString,
    service_receiver_account: optionalString,
    service_reference_no: optionalString,
    service_transaction_amount: optionalNonNegativeNumber,
    service_commission: optionalNonNegativeNumber,
    service_total_charged: optionalNonNegativeNumber,
    service_note: z
      .preprocess(
        (v) => (typeof v === "string" && v.trim().length === 0 ? undefined : v),
        z.string().max(500),
      )
      .optional(),
  })
  .superRefine((val, ctx) => {
    const principal = val.service_transaction_amount;
    const commission = val.service_commission;
    const totalCharged = val.service_total_charged;
    if (
      totalCharged !== undefined &&
      commission !== undefined &&
      totalCharged < commission
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Total charged cannot be less than commission.",
        path: ["service_total_charged"],
      });
    }
    if (principal !== undefined && principal < 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Principal must be 0 or more.",
        path: ["service_transaction_amount"],
      });
    }
  });
export type CartItemInput = z.infer<typeof cartItemSchema>;

export const checkoutSchema = z
  .object({
    cart: z.array(cartItemSchema).min(1, "Cart is empty."),
    customer_id: z.string().uuid().optional().nullable(),
    discount_total: z.coerce.number().min(0).default(0),
    payment_method: z.enum(PAYMENT_METHODS),
    amount_paid: z.coerce.number().min(0).default(0),
    payment_reference: z.string().trim().max(120).optional().nullable(),
    note: z.string().trim().max(500).optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.payment_method === "customer_credit") {
      if (!data.customer_id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["customer_id"],
          message: "Select a customer to put this sale on credit.",
        });
      }
      if (data.amount_paid !== 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["amount_paid"],
          message: "Customer credit cannot include a tendered amount.",
        });
      }
    }
  });
export type CheckoutInput = z.infer<typeof checkoutSchema>;

export const quickCustomerSchema = z.object({
  name: z.string().trim().min(1, "Customer name is required.").max(160),
  phone: z.string().trim().max(40).optional().nullable(),
});
export type QuickCustomerInput = z.infer<typeof quickCustomerSchema>;
