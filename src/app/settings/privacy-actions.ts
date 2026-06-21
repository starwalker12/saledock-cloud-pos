"use server";

import { createClient } from "@/lib/supabase/server";
import { sanitizePlainText } from "@/lib/security/sanitize";
import { getSafeActionError } from "@/lib/errors/safe-action-error";
import { z } from "zod";

export type PrivacyRequestFormState = {
  error: string | null;
  success: string | null;
};

const REQUEST_TYPES = ["access", "export", "correction", "deletion", "restriction", "portability", "objection"] as const;

const createRequestSchema = z.object({
  requestType: z.enum(REQUEST_TYPES),
  details: z.string().max(2000, "Details must be under 2000 characters.").optional().default(""),
});

async function auditLog(organizationId: string | null, actorId: string, action: string, details: string) {
  if (!organizationId) return;
  try {
    const supabase = await createClient();
    await supabase.from("audit_logs").insert({
      organization_id: organizationId,
      actor_id: actorId,
      module: "privacy",
      action,
      details,
      metadata: {},
    });
  } catch {
    // non-blocking
  }
}

export async function createPrivacyRequestAction(
  _prev: PrivacyRequestFormState,
  formData: FormData,
): Promise<PrivacyRequestFormState> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be signed in.", success: null };
  }

  const requestType = formData.get("requestType");
  const detailsRaw = formData.get("details");

  const parsed = createRequestSchema.safeParse({
    requestType,
    details: typeof detailsRaw === "string" ? detailsRaw : "",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input.", success: null };
  }

  const { requestType: type, details: rawDetails } = parsed.data;
  const details = sanitizePlainText(rawDetails);

  // Rate limit: max 5 pending per user
  const { count } = await supabase
    .from("privacy_requests")
    .select("*", { count: "exact", head: true })
    .eq("requester_user_id", user.id)
    .in("status", ["pending", "in_review"]);

  if (count !== null && count >= 5) {
    return { error: "You already have 5 pending requests. Please wait for them to be reviewed.", success: null };
  }

  // Get profile info server-side (never trust client)
  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id, full_name, email")
    .eq("id", user.id)
    .maybeSingle<{ organization_id: string | null; full_name: string | null; email: string | null }>();

  const detailsJson: Record<string, string> = {};
  if (details) {
    detailsJson.description = details;
  }

  const { error } = await supabase.from("privacy_requests").insert({
    requester_user_id: user.id,
    organization_id: profile?.organization_id ?? null,
    requester_email: profile?.email ?? user.email ?? null,
    requester_name: profile?.full_name ?? null,
    request_type: type,
    details: detailsJson,
  });

  if (error) {
    return { error: getSafeActionError(error, "We couldn't submit your request. Please try again."), success: null };
  }

  await auditLog(profile?.organization_id ?? null, user.id, "privacy.request.created", `Privacy ${type} request submitted`);

  return { error: null, success: "Privacy request submitted successfully." };
}

export async function cancelPrivacyRequestAction(
  _prev: PrivacyRequestFormState,
  formData: FormData,
): Promise<PrivacyRequestFormState> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be signed in.", success: null };
  }

  const requestId = formData.get("requestId");
  if (typeof requestId !== "string" || !requestId) {
    return { error: "Request ID is required.", success: null };
  }

  // Fetch the request and verify ownership + status
  const { data: req, error: fetchError } = await supabase
    .from("privacy_requests")
    .select("id, status, requester_user_id")
    .eq("id", requestId)
    .maybeSingle<{ id: string; status: string; requester_user_id: string }>();

  if (fetchError || !req) {
    return { error: "Request not found.", success: null };
  }

  if (req.requester_user_id !== user.id) {
    return { error: "You can only cancel your own requests.", success: null };
  }

  if (req.status !== "pending" && req.status !== "in_review") {
    return { error: "Only pending or in-review requests can be cancelled.", success: null };
  }

  const { error: updateError } = await supabase
    .from("privacy_requests")
    .update({ status: "cancelled" })
    .eq("id", requestId)
    .eq("requester_user_id", user.id);

  if (updateError) {
    return { error: getSafeActionError(updateError, "We couldn't update your request. Please try again."), success: null };
  }

  // Get org for audit log
  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle<{ organization_id: string | null }>();

  await auditLog(profile?.organization_id ?? null, user.id, "privacy.request.cancelled", `Privacy ${req.status} request cancelled`);

  return { error: null, success: "Privacy request cancelled." };
}
