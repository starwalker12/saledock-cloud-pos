import { z } from "zod";

export const STAFF_ROLES = ["owner", "admin", "manager", "cashier", "technician"] as const;

const optionalUuid = z.preprocess(
  (value) => {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  },
  z.string().uuid().nullable(),
);

export const inviteUserSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(180),
  fullName: z.string().trim().min(2, "Full name is required.").max(120),
  role: z.enum(STAFF_ROLES),
  branchId: optionalUuid,
});

export const updateUserProfileSchema = z.object({
  profileId: z.string().uuid(),
  fullName: z.string().trim().min(2, "Full name is required.").max(120),
  role: z.enum(STAFF_ROLES),
  branchId: optionalUuid,
});

export const profileIdSchema = z.object({
  profileId: z.string().uuid(),
});

export type StaffRole = (typeof STAFF_ROLES)[number];
