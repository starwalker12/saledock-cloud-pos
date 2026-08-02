import { z } from "zod";

const blankStringToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalUuid = z.preprocess(
  blankStringToUndefined,
  z.string().uuid().optional().nullable(),
);

const optionalString = z.preprocess(
  (value) => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    return trimmed === "" ? undefined : trimmed;
  },
  z.string().min(1).optional().nullable(),
);

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

function isValidDateOnly(value: string): boolean {
  const match = DATE_ONLY.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;

  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= daysInMonth[month - 1];
}

const optionalDateOnly = z.preprocess(
  blankStringToUndefined,
  z
    .string()
    .regex(DATE_ONLY, "Use YYYY-MM-DD.")
    .refine(isValidDateOnly, "Enter a real calendar date.")
    .optional()
    .nullable(),
);

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
  customer_id: optionalUuid,
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
  expected_delivery_at: optionalDateOnly,
  notes: optionalString,
});

export type RepairInput = z.infer<typeof repairSchema>;
