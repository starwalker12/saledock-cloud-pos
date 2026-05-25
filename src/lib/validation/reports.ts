import { z } from "zod";

export const reportsFilterSchema = z.object({
  range: z.enum(["today", "yesterday", "this_week", "this_month", "last_month", "custom"]).default("this_month"),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)").optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)").optional(),
});

export type ReportsFilterInput = z.infer<typeof reportsFilterSchema>;
