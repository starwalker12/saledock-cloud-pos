import { z } from "zod";

const dateString = z
  .preprocess((v) => (typeof v === "string" ? v.trim() : v), z.string())
  .refine((s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(s + "T00:00:00").getTime()), {
    message: "Invalid date.",
  });

export const closeDaySchema = z.object({
  closing_date: dateString,
  counted_cash: z.coerce
    .number({ message: "Enter a valid cash count." })
    .min(0, "Cash count must be 0 or more."),
  notes: z
    .preprocess((v) => (typeof v === "string" ? v.trim() : v), z.string().max(500))
    .optional()
    .nullable(),
});

export type CloseDayInput = z.infer<typeof closeDaySchema>;

export const reopenDaySchema = z.object({
  closing_date: dateString,
});

export type ReopenDayInput = z.infer<typeof reopenDaySchema>;

// ── Shift schemas ──────────────────────────────────────────────────────────────

export const openShiftSchema = z.object({
  starting_cash: z.coerce
    .number({ message: "Enter a valid starting cash amount." })
    .min(0, "Starting cash must be 0 or more."),
  notes: z
    .preprocess((v) => (typeof v === "string" ? v.trim() : v), z.string().max(500))
    .optional()
    .nullable(),
});
export type OpenShiftInput = z.infer<typeof openShiftSchema>;

export const closeShiftSchema = z.object({
  shift_id: z.string().uuid({ message: "Invalid shift." }),
  counted_cash: z.coerce
    .number({ message: "Enter a valid cash count." })
    .min(0, "Cash count must be 0 or more."),
  notes: z
    .preprocess((v) => (typeof v === "string" ? v.trim() : v), z.string().max(500))
    .optional()
    .nullable(),
});
export type CloseShiftInput = z.infer<typeof closeShiftSchema>;
