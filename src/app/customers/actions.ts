"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentContext } from "@/lib/auth/session";
import { canWriteCatalog } from "@/lib/permissions";
import {
  customerSchema,
  creditPaymentSchema,
  writeOffSchema,
  type CreditPaymentMethod,
} from "@/lib/validation/customers";
import { logAudit } from "@/lib/audit";
import { getSafeActionError } from "@/lib/errors/safe-action-error";

export type ActionState = { error: string | null; success: string | null };
const ok = (msg: string): ActionState => ({ error: null, success: msg });
const err = (msg: string): ActionState => ({ error: msg, success: null });

async function requireAuthorizedUser() {
  const ctx = await getCurrentContext();
  if (!ctx.user) redirect("/login");
  if (!ctx.profile?.organization_id) redirect("/setup");
  // General management requires admin/owner/manager roles, which match catalog write permissions.
  if (!canWriteCatalog(ctx.profile.role)) {
    logAudit({
      module: "customers",
      action: "permission.denied",
      details:
        "Attempted customer management action without catalog write permission",
    });
    return { ctx, denied: true as const };
  }
  return { ctx, denied: false as const };
}

function flatten(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Invalid input.";
}

function fd(formData: FormData) {
  return Object.fromEntries(formData.entries());
}

export async function saveCustomerAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const w = await requireAuthorizedUser();
  if (w.denied) return err("You do not have permission to manage customers.");

  // Convert checkbox value to boolean
  const raw = fd(formData);
  const dataToValidate = {
    ...raw,
    is_archived: raw.is_archived === "true" || raw.is_archived === "on",
  };

  const parsed = customerSchema.safeParse(dataToValidate);
  if (!parsed.success) return err(flatten(parsed.error));

  const id = (formData.get("id") as string | null) || null;
  const supabase = await createClient();
  const basePayload = {
    organization_id: w.ctx.profile!.organization_id!,
    branch_id: w.ctx.profile!.branch_id ?? null,
    name: parsed.data.name,
    phone: parsed.data.phone ?? null,
    email: parsed.data.email ?? null,
    address: parsed.data.address ?? null,
    notes: parsed.data.notes ?? null,
    credit_limit: parsed.data.credit_limit,
    is_archived: parsed.data.is_archived,
  };

  if (id) {
    const { data: existingCustomer, error: fetchErr } = await supabase
      .from("customers")
      .select(
        "id, branch_id, name, phone, email, address, notes, credit_limit, is_archived, archived_at",
      )
      .eq("id", id)
      .eq("organization_id", w.ctx.profile!.organization_id!)
      .maybeSingle();

    if (fetchErr || !existingCustomer) {
      return err(
        "We could not find this record for your shop. It may have been removed or you may not have access.",
      );
    }

    const changedFields = [
      existingCustomer.branch_id !== basePayload.branch_id ? "branch_id" : null,
      existingCustomer.name !== basePayload.name ? "name" : null,
      existingCustomer.phone !== basePayload.phone ? "phone" : null,
      existingCustomer.email !== basePayload.email ? "email" : null,
      existingCustomer.address !== basePayload.address ? "address" : null,
      existingCustomer.notes !== basePayload.notes ? "notes" : null,
      Number(existingCustomer.credit_limit) !== basePayload.credit_limit
        ? "credit_limit"
        : null,
      existingCustomer.is_archived !== basePayload.is_archived
        ? "is_archived"
        : null,
    ].filter((field): field is string => field !== null);

    if (changedFields.length === 0) {
      return ok("Customer details updated.");
    }

    const previousStatus = existingCustomer.is_archived ? "archived" : "active";
    const newStatus = basePayload.is_archived ? "archived" : "active";
    const archivedAt = basePayload.is_archived
      ? existingCustomer.is_archived
        ? existingCustomer.archived_at
        : new Date().toISOString()
      : null;
    const { data: updatedCustomer, error } = await supabase
      .from("customers")
      .update({ ...basePayload, archived_at: archivedAt })
      .eq("id", id)
      .eq("organization_id", w.ctx.profile!.organization_id!)
      .select("id")
      .maybeSingle();
    if (error || !updatedCustomer) {
      return err(
        error
          ? getSafeActionError(
              error,
              "We couldn't save this customer. Please try again.",
            )
          : "We couldn't save this customer. Please try again.",
      );
    }

    await logAudit({
      module: "customers",
      action: "customers.updated",
      details: `Updated customer ${updatedCustomer.id}`,
      metadata: {
        customer_id: updatedCustomer.id,
        changed_fields: changedFields,
        ...(previousStatus !== newStatus
          ? { previous_status: previousStatus, new_status: newStatus }
          : {}),
      },
    });
  } else {
    const { data: createdCustomer, error } = await supabase
      .from("customers")
      .insert({
        ...basePayload,
        archived_at: basePayload.is_archived ? new Date().toISOString() : null,
      })
      .select("id")
      .single();
    if (error || !createdCustomer) {
      return err(
        error
          ? getSafeActionError(
              error,
              "We couldn't save this customer. Please try again.",
            )
          : "We couldn't save this customer. Please try again.",
      );
    }

    await logAudit({
      module: "customers",
      action: "customers.created",
      details: `Created customer ${createdCustomer.id}`,
      metadata: {
        customer_id: createdCustomer.id,
        new_status: basePayload.is_archived ? "archived" : "active",
      },
    });
  }

  revalidatePath("/customers");
  if (id) {
    revalidatePath(`/customers/${id}`);
  }
  revalidatePath("/dashboard");
  return ok(id ? "Customer details updated." : "Customer profile created.");
}

export async function archiveCustomerAction(formData: FormData) {
  const w = await requireAuthorizedUser();
  if (w.denied) return;
  const id = formData.get("id") as string;
  if (!id) return;
  const supabase = await createClient();

  const { data: archivedCustomer, error } = await supabase
    .from("customers")
    .update({ is_archived: true, archived_at: new Date().toISOString() })
    .eq("id", id)
    .eq("organization_id", w.ctx.profile!.organization_id!)
    .eq("is_archived", false)
    .select("id")
    .maybeSingle();

  if (error || !archivedCustomer) return;

  await logAudit({
    module: "customers",
    action: "customers.archived",
    details: `Archived customer ${archivedCustomer.id}`,
    metadata: {
      customer_id: archivedCustomer.id,
      previous_status: "active",
      new_status: "archived",
    },
  });
  revalidatePath("/customers");
  revalidatePath(`/customers/${id}`);
  revalidatePath("/dashboard");
}

export async function restoreCustomerAction(formData: FormData) {
  const w = await requireAuthorizedUser();
  if (w.denied) return;
  const id = formData.get("id") as string;
  if (!id) return;
  const supabase = await createClient();

  const { data: restoredCustomer, error } = await supabase
    .from("customers")
    .update({ is_archived: false, archived_at: null })
    .eq("id", id)
    .eq("organization_id", w.ctx.profile!.organization_id!)
    .eq("is_archived", true)
    .select("id")
    .maybeSingle();

  if (error || !restoredCustomer) return;

  await logAudit({
    module: "customers",
    action: "customers.restored",
    details: `Restored customer ${restoredCustomer.id}`,
    metadata: {
      customer_id: restoredCustomer.id,
      previous_status: "archived",
      new_status: "active",
    },
  });
  revalidatePath("/customers");
  revalidatePath(`/customers/${id}`);
  revalidatePath("/dashboard");
}

export async function recordCreditPaymentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await getCurrentContext();
  if (!ctx.user) redirect("/login");
  if (!ctx.profile?.organization_id) redirect("/setup");

  // Owner, admin, manager, and cashier can record credit payments. Only technician is blocked.
  // This uses the same positive-role-set pattern as other permission checks in permissions.ts.
  if (
    ctx.profile.role !== "owner" &&
    ctx.profile.role !== "admin" &&
    ctx.profile.role !== "manager" &&
    ctx.profile.role !== "cashier"
  ) {
    logAudit({
      module: "customers",
      action: "permission.denied",
      details: "Attempted credit payment without permission",
    });
    return err("You do not have permission to log payments.");
  }

  const customerId = formData.get("customer_id") as string;
  if (!customerId) return err("Customer ID is missing.");

  const parsed = creditPaymentSchema.safeParse(fd(formData));
  if (!parsed.success) return err(flatten(parsed.error));

  const supabase = await createClient();

  const { data: existingCustomer, error: fetchErr } = await supabase
    .from("customers")
    .select("id")
    .eq("id", customerId)
    .eq("organization_id", ctx.profile!.organization_id!)
    .maybeSingle();

  if (fetchErr || !existingCustomer) {
    return err(
      "We could not find this record for your shop. It may have been removed or you may not have access.",
    );
  }

  const { error } = await supabase.rpc("record_credit_payment", {
    p_customer_id: customerId,
    p_amount: parsed.data.amount,
    p_method: parsed.data.method as CreditPaymentMethod,
    p_reference_number: parsed.data.reference_number ?? null,
    p_notes: parsed.data.notes ?? null,
  });

  if (error) {
    return err(
      getSafeActionError(
        error,
        "We couldn't record this payment. Please try again.",
      ),
    );
  }

  logAudit({
    module: "customers",
    action: "customer.credit_payment",
    details: `Credit payment of ${parsed.data.amount} recorded for customer ${customerId} via ${parsed.data.method}`,
    metadata: {
      customer_id: customerId,
      amount: parsed.data.amount,
      method: parsed.data.method,
    },
  });

  revalidatePath("/customers");
  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/dashboard");
  revalidatePath("/daily-closing");
  return ok("Credit payment recorded successfully.");
}

export async function recordWriteOffAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await getCurrentContext();
  if (!ctx.user) redirect("/login");
  if (!ctx.profile?.organization_id) redirect("/setup");

  if (ctx.profile.role !== "owner" && ctx.profile.role !== "admin") {
    logAudit({
      module: "customers",
      action: "permission.denied",
      details: "Attempted customer write-off without owner/admin role",
    });
    return err("Only owner or admin can write off customer credit.");
  }

  const customerId = formData.get("customer_id") as string;
  if (!customerId) return err("Customer ID is missing.");

  const parsed = writeOffSchema.safeParse(fd(formData));
  if (!parsed.success) return err(flatten(parsed.error));

  const supabase = await createClient();

  const { data: existingCustomer, error: fetchErr } = await supabase
    .from("customers")
    .select("id")
    .eq("id", customerId)
    .eq("organization_id", ctx.profile!.organization_id!)
    .maybeSingle();

  if (fetchErr || !existingCustomer) {
    return err(
      "We could not find this record for your shop. It may have been removed or you may not have access.",
    );
  }

  const { error } = await supabase.rpc("record_customer_write_off", {
    p_customer_id: customerId,
    p_amount: parsed.data.amount,
    p_reason: parsed.data.reason,
  });

  if (error) {
    return err(
      getSafeActionError(
        error,
        "We couldn't record this write-off. Please try again.",
      ),
    );
  }

  logAudit({
    module: "customers",
    action: "customer.write_off",
    details: `Credit write-off of ${parsed.data.amount} for customer ${customerId}: ${parsed.data.reason}`,
    metadata: {
      customer_id: customerId,
      amount: parsed.data.amount,
      reason: parsed.data.reason,
    },
  });

  revalidatePath("/customers");
  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/dashboard");
  revalidatePath("/daily-closing");
  revalidatePath("/reports");
  return ok("Credit write-off recorded successfully.");
}
