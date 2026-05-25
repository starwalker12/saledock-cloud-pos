"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentContext } from "@/lib/auth/session";
import {
  canCreateRepairs,
  canEditRepairs,
  canUpdateRepairStatus,
} from "@/lib/permissions";
import { repairSchema, type RepairStatus } from "@/lib/validation/repairs";

export type ActionState = { error: string | null; success: string | null; id?: string };
const ok = (msg: string, id?: string): ActionState => ({ error: null, success: msg, id });
const err = (msg: string): ActionState => ({ error: msg, success: null });

function fd(formData: FormData) {
  return Object.fromEntries(formData.entries());
}

export async function saveRepairAction(
  _prev: ActionState,
  formData: FormData
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

  // Quick Customer Creation
  const shouldCreateCustomer = formData.get("create_customer_account") === "true";
  let finalCustomerId = parsed.data.customer_id || null;

  if (shouldCreateCustomer && !finalCustomerId) {
    const customerPayload = {
      organization_id: orgId,
      name: parsed.data.customer_name,
      phone: parsed.data.customer_phone || null,
      outstanding_balance: 0,
      credit_limit: 0,
      is_archived: false,
    };
    const { data: newCust, error: custErr } = await supabase
      .from("customers")
      .insert(customerPayload)
      .select("id")
      .single();

    if (custErr) {
      return err(`Failed to create customer: ${custErr.message}`);
    }
    finalCustomerId = newCust.id;
  }

  const payload = {
    organization_id: orgId,
    branch_id: branchId,
    customer_id: finalCustomerId,
    customer_name: parsed.data.customer_name,
    customer_phone: parsed.data.customer_phone || null,
    device_type: parsed.data.device_type,
    device_model: parsed.data.device_model || null,
    serial_imei: parsed.data.serial_imei || null,
    problem_description: parsed.data.problem_description,
    accessories_received: parsed.data.accessories_received || null,
    estimated_cost: parsed.data.estimated_cost,
    advance_paid: parsed.data.advance_paid,
    status: parsed.data.status,
    notes: parsed.data.notes || null,
    expected_delivery_at: parsed.data.expected_delivery_at
      ? new Date(parsed.data.expected_delivery_at).toISOString()
      : null,
  };

  let savedId = id;

  if (id) {
    // Edit Mode
    const { error: updateErr } = await supabase
      .from("repairs")
      .update({
        ...payload,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("organization_id", orgId);

    if (updateErr) return err(updateErr.message);
  } else {
    // Intake Mode: Unique sequence generation RJ-XXXXXX with retry on conflict
    let attempts = 0;
    let success = false;
    let jobNo = "";

    while (attempts < 5 && !success) {
      attempts++;
      // Fetch all repairs to find max sequence code safely
      const { data: currentRepairs, error: listErr } = await supabase
        .from("repairs")
        .select("job_no")
        .eq("organization_id", orgId);

      if (listErr) return err(listErr.message);

      const maxSeq = (currentRepairs ?? [])
        .map((r) => {
          const num = r.job_no.replace(/\D/g, "");
          return num ? parseInt(num, 10) : 0;
        })
        .reduce((max, val) => Math.max(max, val), 0);

      const seq = maxSeq + 1;
      jobNo = `RJ-${String(seq).padStart(6, "0")}`;

      const { data: newRepair, error: insertErr } = await supabase
        .from("repairs")
        .insert({
          ...payload,
          job_no: jobNo,
          created_by: profile.id,
          final_cost: parsed.data.estimated_cost, // Default final cost to estimated cost at intake
        })
        .select("id")
        .maybeSingle();

      if (!insertErr && newRepair) {
        savedId = newRepair.id;
        success = true;

        // Log initial received status history
        await supabase.from("repair_status_history").insert({
          organization_id: orgId,
          repair_id: newRepair.id,
          old_status: null,
          new_status: parsed.data.status,
          note: parsed.data.notes || "Device received for repair intake.",
          changed_by: profile.id,
        });
      } else if (insertErr && insertErr.code === "23505") {
        // Unique index violation (race condition on job_no). Loop will retry.
        continue;
      } else {
        return err(insertErr?.message ?? "Failed to save repair job.");
      }
    }

    if (!success) {
      return err("Failed to generate unique job number. Please try again.");
    }
  }

  revalidatePath("/repairs");
  if (finalCustomerId) {
    revalidatePath(`/customers/${finalCustomerId}`);
  }
  revalidatePath("/dashboard");

  return ok(id ? "Repair job updated." : "Repair job created.", savedId || undefined);
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

  if (updateErr) return err(updateErr.message);

  // Insert status history entry
  const { error: histErr } = await supabase.from("repair_status_history").insert({
    organization_id: orgId,
    repair_id: id,
    old_status: oldStatus || null,
    new_status: newStatus,
    note: note || `Status updated to ${newStatus}.`,
    changed_by: profile.id,
  });

  if (histErr) return err(`Status updated, but failed to log history: ${histErr.message}`);

  revalidatePath("/repairs");
  revalidatePath(`/repairs/${id}`);
  revalidatePath("/dashboard");

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

  if (error) return err(error.message);

  revalidatePath(`/repairs/${id}`);
  return ok("Repair job details updated.");
}
