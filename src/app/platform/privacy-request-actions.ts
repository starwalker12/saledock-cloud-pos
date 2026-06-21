"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePlatformAdmin } from "@/lib/platform/admin";
import { sanitizePlainText } from "@/lib/security/sanitize";
import { getSafeActionError } from "@/lib/errors/safe-action-error";
import { z } from "zod";

const VALID_STATUSES = ["pending", "in_review", "completed", "rejected", "cancelled"] as const;

const updateSchema = z.object({
  requestId: z.string().uuid(),
  status: z.enum(VALID_STATUSES),
  adminNotes: z.string().max(5000).optional().default(""),
});

export type PrivacyRequestUpdateState = {
  error: string | null;
  success: string | null;
};

export async function updatePrivacyRequestStatusAction(
  _prev: PrivacyRequestUpdateState,
  formData: FormData,
): Promise<PrivacyRequestUpdateState> {
  try {
    const admin = await requirePlatformAdmin();

    const parsed = updateSchema.safeParse({
      requestId: formData.get("requestId"),
      status: formData.get("status"),
      adminNotes: formData.get("adminNotes") ?? "",
    });

    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Invalid input.", success: null };
    }

    const { requestId, status, adminNotes } = parsed.data;
    const safeNotes = sanitizePlainText(adminNotes, 5000);

    const supabase = await createAdminClient();

    const updateData: Record<string, unknown> = {
      status,
      admin_notes: safeNotes || null,
      updated_at: new Date().toISOString(),
    };

    if (["completed", "rejected", "cancelled"].includes(status)) {
      updateData.processed_at = new Date().toISOString();
      updateData.processed_by = admin.user_id;
    }

    const { error } = await supabase
      .from("privacy_requests")
      .update(updateData)
      .eq("id", requestId);

    if (error) {
      return { error: getSafeActionError(error, "We couldn't update this request. Please try again."), success: null };
    }

    await supabase
      .from("audit_logs")
      .insert({
        organization_id: null,
        actor_id: admin.user_id,
        action: "privacy.request.status_updated",
        metadata: {
          request_id: requestId,
          new_status: status,
        },
      })
      .maybeSingle();

    revalidatePath("/platform/privacy-requests");
    revalidatePath("/platform");

    return { error: null, success: "Request updated successfully." };
  } catch (err) {
    return { error: getSafeActionError(err, "We couldn't update this request. Please try again."), success: null };
  }
}
