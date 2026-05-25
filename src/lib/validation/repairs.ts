import { z } from "zod";

const optionalString = z
  .preprocess((v) => (v === "" || v === null ? undefined : typeof v === "string" ? v.trim() : v), z.string().min(1))
  .optional()
  .nullable();

const nonNegativeNumber = z.coerce
  .number({ message: "Enter a valid number." })
  .min(0, "Must be 0 or more.");

export const REPAIR_STATUSES = [
  "received",
  "waiting_for_parts",
  "in_progress",
  "completed",
  "delivered",
  "cancelled",
] as const;

export type RepairStatus = (typeof REPAIR_STATUSES)[number];

export const REPAIR_PAYMENT_METHODS = [
  "cash",
  "card",
  "easypaisa",
  "jazzcash",
  "bank_transfer",
] as const;

export type RepairPaymentMethod = (typeof REPAIR_PAYMENT_METHODS)[number];

export const repairSchema = z.object({
  customer_id: z.string().uuid().optional().nullable(),
  customer_name: z.string().trim().min(1, "Customer name is required when no customer is selected.").max(160),
  customer_phone: optionalString,
  device_type: z.string().trim().min(1, "Device type is required.").max(100),
  device_model: optionalString,
  serial_imei: optionalString,
  problem_description: z.string().trim().min(1, "Problem description is required."),
  accessories_received: optionalString,
  estimated_cost: nonNegativeNumber.default(0),
  advance_paid: nonNegativeNumber.default(0),
  payment_method: z.enum(REPAIR_PAYMENT_METHODS, { message: "Invalid payment method." }).default("cash"),
  status: z.enum(REPAIR_STATUSES, { message: "Invalid status." }).default("received"),
  expected_delivery_at: z.string().optional().nullable(),
  notes: optionalString,
});

export type RepairInput = z.infer<typeof repairSchema>;
