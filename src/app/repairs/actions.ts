"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentContext } from "@/lib/auth/session";
import {
  canCreateRepairs,
  canEditRepairs,
  canUpdateRepairStatus,
} from "@/lib/permissions";
import { repairSchema, type RepairStatus } from "@/lib/validation/repairs";
import { getCashShiftActionError } from "@/lib/errors/cash-shift-action-error";
import { operationRequestKey } from "@/lib/validation/operation-request-key";
import { getSafeActionError } from "@/lib/errors/safe-action-error";

export type ActionState = {
  error: string | null;
  success: string | null;
  id?: string;
};
const ok = (msg: string, id?: string): ActionState => ({
  error: null,
  success: msg,
  id,
});
const err = (msg: string): ActionState => ({ error: msg, success: null });

function fd(formData: FormData) {
  return Object.fromEntries(formData.entries());
}

export async function saveRepairAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await getCurrentContext();
  if (!ctx.user) redirect("/login");
  const profile = ctx.profile;
  if (!profile?.organization_id) redirect("/setup");

  const orgId = profile.organization_id;
  const branchId = profile.branch_id;
  if (!branchId) return err("Your profile does not have an assigned branch.");

  // Permissions check
  const id = (formData.get("id") as string | null) || null;
  if (id) {
    if (!canEditRepairs(profile.role)) {
      return err("You do not have permission to edit repair details.");
    }
  } else {
    if (!canCreateRepairs(profile.role)) {
      return err("You do not have permission to create repair jobs.");
    }
  }

  // Parse validation schema
  const rawObj = fd(formData);
  const parsed = repairSchema.safeParse(rawObj);
  if (!parsed.success) {
    return err(parsed.error.issues[0]?.message ?? "Invalid input parameters.");
  }

  const supabase = await createClient();

  const requestKey = operationRequestKey(formData);
  if (!requestKey) return err("Refresh and try again.");

  // The protected transaction resolves quick creation after durable replay.
  const shouldCreateCustomer =
    formData.get("create_customer_account") === "true";
  const finalCustomerId = parsed.data.customer_id || null;
  if (shouldCreateCustomer && (id || finalCustomerId))
    return err(
      "Create a new customer only for a new repair without a selected customer.",
    );

  if (finalCustomerId) {
    const { data: selectedCustomer, error: customerLookupError } =
      await supabase
        .from("customers")
        .select("id")
        .eq("id", finalCustomerId)
        .eq("organization_id", orgId)
        .maybeSingle();

    if (customerLookupError || !selectedCustomer) {
      return err("The selected customer is unavailable.");
    }
  }

  const revisionText = String(formData.get("revision") ?? "0");
  if (
    !/^[0-9]+$/.test(revisionText) ||
    !Number.isSafeInteger(Number(revisionText))
  )
    return err("Refresh before editing this repair.");
  const { data: receipt, error: saveError } = await supabase.rpc(
    "save_cash_shift_repair",
    {
      p_id: id,
      p_request_key: requestKey,
      p_revision: Number(revisionText),
      p_create_customer_account: shouldCreateCustomer,
      p_data: {
        ...parsed.data,
        customer_id: finalCustomerId,
        // Preserve the exact submitted money lexeme until DB validation.
        advance_paid: String(formData.get("advance_paid") ?? "0"),
        estimated_cost: String(formData.get("estimated_cost") ?? "0"),
        payment_method: parsed.data.payment_method,
        expected_delivery_at: parsed.data.expected_delivery_at
          ? new Date(parsed.data.expected_delivery_at).toISOString()
          : null,
      },
    },
  );
  if (saveError || !receipt?.id)
    return err(
      getCashShiftActionError(
        saveError,
        "We couldn't save this repair. Please try again.",
      ),
    );
  // The DB commits optional customer, repair, advance, history and audit together.
  return ok(
    id ? "Repair job updated." : "Repair job created.",
    String(receipt.id),
  );
}

export async function updateRepairStatusAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const ctx = await getCurrentContext();
  if (!ctx.user) redirect("/login");
  const profile = ctx.profile;
  if (!profile?.organization_id) redirect("/setup");

  const orgId = profile.organization_id;
  if (!canUpdateRepairStatus(profile.role)) {
    return err("You do not have permission to update repair statuses.");
  }

  const id = formData.get("id") as string;
  const newStatus = formData.get("status") as RepairStatus;
  const oldStatus = formData.get("old_status") as RepairStatus | null;
  const note = formData.get("status_note") as string || null;
  const diagnosis = formData.get("diagnosis") as string || null;
  const finalCostInput = formData.get("final_cost") as string | null;

  if (!id || !newStatus) {
    return err("Repair ID and status parameters are required.");
  }

  const supabase = await createClient();

  const finalCost = finalCostInput ? parseFloat(finalCostInput) : null;
  const isDelivered = newStatus === "delivered";

  const payload: Record<string, unknown> = {
    status: newStatus,
    updated_at: new Date().toISOString(),
  };

  if (diagnosis !== null) payload.diagnosis = diagnosis;
  if (finalCost !== null && !isNaN(finalCost)) payload.final_cost = finalCost;

  if (isDelivered) {
    payload.delivered_at = new Date().toISOString();
  }

  const { error: updateErr } = await supabase
    .from("repairs")
    .update(payload)
    .eq("id", id)
    .eq("organization_id", orgId);

  if (updateErr) return err(getSafeActionError(updateErr, "We couldn't update the repair status. Please try again."));

  // Insert status history entry
  const { error: histErr } = await supabase.from("repair_status_history").insert({
    organization_id: orgId,
    repair_id: id,
    old_status: oldStatus || null,
    new_status: newStatus,
    note: note || `Status updated to ${newStatus}.`,
    changed_by: profile.id,
  });

  if (histErr) return err("The status was updated, but we couldn't save the history note.");

  let auditFailed = false;
  try {
    const { error: auditError } = await supabase.from("audit_logs").insert({
      organization_id: orgId,
      branch_id: profile.branch_id,
      actor_id: profile.id,
      module: "repairs",
      action: "repairs.status_changed",
      details: `Repair ${id} status: ${oldStatus ?? "none"} → ${newStatus}`,
      metadata: { repair_id: id, old_status: oldStatus, new_status: newStatus },
    });
    auditFailed = Boolean(auditError);
  } catch {
    auditFailed = true;
  }

  // Return the confirmed audit outcome before reconciling the connected route.
  after(() => {
    revalidatePath("/repairs");
    revalidatePath(`/repairs/${id}`);
    revalidatePath("/dashboard");
  });

  if (auditFailed) {
    return {
      error:
        "The status was updated, but its audit record could not be confirmed. Do not submit it again. Refresh the page and contact an administrator.",
      success: null,
      id,
    };
  }

  return ok("Status updated successfully.");
}

export async function saveDiagnosisAndNotesAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const ctx = await getCurrentContext();
  if (!ctx.user) redirect("/login");
  const profile = ctx.profile;
  if (!profile?.organization_id) redirect("/setup");

  const orgId = profile.organization_id;
  if (!canUpdateRepairStatus(profile.role)) {
    return err("You do not have permission to update notes.");
  }

  const id = formData.get("id") as string;
  const diagnosis = formData.get("diagnosis") as string || null;
  const notes = formData.get("notes") as string || null;

  if (!id) return err("Repair ID is required.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("repairs")
    .update({
      diagnosis,
      notes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("organization_id", orgId);

  if (error) return err(getSafeActionError(error, "We couldn't save this repair. Please try again."));

  revalidatePath(`/repairs/${id}`);
  return ok("Repair job details updated.");
}
