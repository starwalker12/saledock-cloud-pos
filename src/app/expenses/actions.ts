"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentContext } from "@/lib/auth/session";
import { canManageExpenses } from "@/lib/permissions";
import { expenseSchema } from "@/lib/validation/expenses";
import { operationRequestKey } from "@/lib/validation/operation-request-key";
import { getCashShiftActionError } from "@/lib/errors/cash-shift-action-error";
import { formatKarachiDateTimeLocal } from "@/lib/datetime";

export type ActionState = {
  error: string | null;
  success: string | null;
  revision?: number;
};
const ok = (msg: string, revision?: number): ActionState => ({
  error: null,
  success: msg,
  revision,
});
const err = (msg: string): ActionState => ({ error: msg, success: null });

async function requireManager() {
  const ctx = await getCurrentContext();
  if (!ctx.user) redirect("/login");
  if (!ctx.profile?.organization_id) redirect("/setup");
  return { ctx, denied: !canManageExpenses(ctx.profile.role) };
}

export async function saveExpenseAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const w = await requireManager();
  if (w.denied) return err("You do not have permission to manage expenses.");
  const input = Object.fromEntries(formData.entries());
  input.vendor_name = String(input.vendor_name ?? "").trim() || "";
  const parsed = expenseSchema.safeParse({
    ...input,
    vendor_name: input.vendor_name || null,
    notes: String(input.notes ?? "").trim() || null,
  });
  if (!parsed.success)
    return err(parsed.error.issues[0]?.message ?? "Invalid input.");
  const id = String(formData.get("id") ?? "") || null;
  const key = operationRequestKey(formData);
  if (!id && !key) return err("Please refresh the form and try again.");
  const supabase = await createClient();
  let spentAt: string | null = parsed.data.spent_at ?? null;
  if (id) {
    const { data: existing, error } = await supabase
      .from("expenses")
      .select("spent_at")
      .eq("id", id)
      .eq("organization_id", w.ctx.profile!.organization_id!)
      .maybeSingle();
    if (error || !existing) return err("This expense could not be found.");
    if (
      !spentAt ||
      formatKarachiDateTimeLocal(existing.spent_at) ===
        formatKarachiDateTimeLocal(spentAt)
    ) {
      spentAt = existing.spent_at;
    }
  }
  const { data, error } = await supabase.rpc("save_cash_shift_expense", {
    p_id: id,
    p_request_key: key,
    p_revision: id ? String(formData.get("revision") ?? "") : null,
    p_category: parsed.data.category,
    p_amount: String(formData.get("amount") ?? "").trim(),
    p_method: parsed.data.payment_method,
    p_vendor: parsed.data.vendor_name ?? null,
    p_notes: parsed.data.notes ?? null,
    p_spent_at: spentAt,
    p_operation: "save",
  });
  if (error)
    return err(
      getCashShiftActionError(
        error,
        "We couldn't save this expense. Please try again.",
      ),
    );
  return ok(
    id ? "Expense updated." : "Expense recorded.",
    Number(data?.revision ?? 0),
  );
}

async function changeExpenseStatus(
  formData: FormData,
  operation: "void" | "restore",
): Promise<ActionState> {
  const w = await requireManager();
  if (w.denied) return err("You do not have permission to manage expenses.");
  const id = String(formData.get("id") ?? "");
  if (!id) return err("Expense ID is missing.");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_cash_shift_expense", {
    p_id: id,
    p_request_key: null,
    p_revision: String(formData.get("revision") ?? ""),
    p_category: null,
    p_amount: null,
    p_method: null,
    p_vendor: null,
    p_notes: null,
    p_spent_at: null,
    p_operation: operation,
  });
  if (error)
    return err(
      getCashShiftActionError(
        error,
        "We couldn't update this expense. Please try again.",
      ),
    );
  return ok(
    operation === "void" ? "Expense voided." : "Expense restored.",
    Number(data?.revision ?? 0),
  );
}

export async function voidExpenseAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return changeExpenseStatus(formData, "void");
}

export async function restoreExpenseAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return changeExpenseStatus(formData, "restore");
}
