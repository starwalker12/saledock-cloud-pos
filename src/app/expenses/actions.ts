"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentContext } from "@/lib/auth/session";
import { canManageExpenses } from "@/lib/permissions";
import { expenseSchema } from "@/lib/validation/expenses";
import { logAudit } from "@/lib/audit";
import { getSafeActionError } from "@/lib/errors/safe-action-error";

export type ActionState = { error: string | null; success: string | null };
const ok = (msg: string): ActionState => ({ error: null, success: msg });
const err = (msg: string): ActionState => ({ error: msg, success: null });

async function requireManager() {
  const ctx = await getCurrentContext();
  if (!ctx.user) redirect("/login");
  if (!ctx.profile?.organization_id) redirect("/setup");
  if (!canManageExpenses(ctx.profile.role)) {
    return { ctx, denied: true as const };
  }
  return { ctx, denied: false as const };
}

function fd(formData: FormData) {
  return Object.fromEntries(formData.entries());
}

export async function saveExpenseAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const w = await requireManager();
  if (w.denied) return err("You do not have permission to manage expenses.");

  const parsed = expenseSchema.safeParse(fd(formData));
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? "Invalid input.");

  const id = (formData.get("id") as string | null) || null;
  const supabase = await createClient();

  const branchId = w.ctx.profile!.branch_id;
  if (!branchId) return err("No branch assigned for your profile.");

  const payload = {
    organization_id: w.ctx.profile!.organization_id!,
    branch_id: branchId,
    category: parsed.data.category,
    amount: parsed.data.amount,
    payment_method: parsed.data.payment_method,
    vendor_name: parsed.data.vendor_name ?? null,
    notes: parsed.data.notes ?? null,
    spent_at: parsed.data.spent_at ?? new Date().toISOString(),
  };

  if (id) {
    const { error } = await supabase
      .from("expenses")
      .update(payload)
      .eq("id", id)
      .eq("organization_id", w.ctx.profile!.organization_id!);
    if (error) return err(getSafeActionError(error, "We couldn't save this expense. Please try again."));
  } else {
    const { error } = await supabase
      .from("expenses")
      .insert({ ...payload, created_by: w.ctx.profile!.id, status: "active" });
    if (error) return err(getSafeActionError(error, "We couldn't save this expense. Please try again."));
  }

  logAudit({
    module: "expenses",
    action: id ? "expenses.updated" : "expenses.created",
    details: `${id ? "Updated" : "Recorded"} expense: ${parsed.data.category} - ${parsed.data.amount}`,
    metadata: { category: parsed.data.category, amount: parsed.data.amount, payment_method: parsed.data.payment_method },
  });

  revalidatePath("/expenses");
  revalidatePath("/dashboard");
  return ok(id ? "Expense updated." : "Expense recorded.");
}

export async function voidExpenseAction(formData: FormData) {
  const w = await requireManager();
  if (w.denied) return;
  const id = formData.get("id") as string;
  if (!id) return;
  const supabase = await createClient();
  await supabase
    .from("expenses")
    .update({
      status: "archived",
      archived_at: new Date().toISOString(),
      archived_by: w.ctx.profile!.id,
    })
    .eq("id", id)
    .eq("organization_id", w.ctx.profile!.organization_id!);
  revalidatePath("/expenses");
  revalidatePath("/dashboard");
  logAudit({
    module: "expenses",
    action: "expenses.voided",
    details: `Voided expense ${id}`,
    metadata: { expense_id: id },
  });
}

export async function restoreExpenseAction(formData: FormData) {
  const w = await requireManager();
  if (w.denied) return;
  const id = formData.get("id") as string;
  if (!id) return;
  const supabase = await createClient();
  await supabase
    .from("expenses")
    .update({ status: "active", archived_at: null, archived_by: null })
    .eq("id", id)
    .eq("organization_id", w.ctx.profile!.organization_id!);
  revalidatePath("/expenses");
  revalidatePath("/dashboard");
}
