"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentContext } from "@/lib/auth/session";
import { canCloseDay, canReopenDay } from "@/lib/permissions";
import { closeDaySchema, reopenDaySchema } from "@/lib/validation/daily-closing";
import { getDayActivity } from "@/lib/data/daily-closing";
import { logAudit } from "@/lib/audit";

export type ActionState = { error: string | null; success: string | null };
const ok = (msg: string): ActionState => ({ error: null, success: msg });
const err = (msg: string): ActionState => ({ error: msg, success: null });

function fd(formData: FormData) {
  return Object.fromEntries(formData.entries());
}

export async function closeDayAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await getCurrentContext();
  if (!ctx.user) redirect("/login");
  if (!ctx.profile?.organization_id) redirect("/setup");
  if (!canCloseDay(ctx.profile.role)) {
    return err("You do not have permission to close the day.");
  }
  if (!ctx.profile.branch_id) return err("No branch assigned for your profile.");

  const parsed = closeDaySchema.safeParse(fd(formData));
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? "Invalid input.");

  const orgId = ctx.profile.organization_id;
  const branchId = ctx.profile.branch_id;

  // Always recompute totals server-side at the moment of closing.
  const activity = await getDayActivity(orgId, branchId, parsed.data.closing_date);

  const digitalPayments =
    activity.paymentsByMethod.card +
    activity.paymentsByMethod.easypaisa +
    activity.paymentsByMethod.jazzcash +
    activity.paymentsByMethod.bank_transfer;

  const expected = activity.expectedCash;
  const counted = parsed.data.counted_cash;
  const difference = counted - expected;

  const supabase = await createClient();
  const { error: upsertErr } = await supabase
    .from("daily_closings")
    .upsert(
      {
        organization_id: orgId,
        branch_id: branchId,
        closing_date: parsed.data.closing_date,
        bills_count: activity.invoicesCount,
        cash_sales: activity.paymentsByMethod.cash,
        digital_payments: digitalPayments,
        credit_pending: activity.creditPending,
        expenses_total: activity.expensesTotal,
        refunds_total: activity.refundsTotal,
        expected_closing_cash: expected,
        actual_closing_cash: counted,
        cash_difference: difference,
        notes: parsed.data.notes ?? null,
        finalized_by: ctx.profile.id,
        finalized_at: new Date().toISOString(),
      },
      { onConflict: "organization_id,branch_id,closing_date" },
    );
  if (upsertErr) return err(upsertErr.message);

  logAudit({
    module: "daily_closing",
    action: "daily_closing.closed",
    details: `Day closed: ${parsed.data.closing_date}`,
    metadata: { closing_date: parsed.data.closing_date, counted_cash: parsed.data.counted_cash, expected_cash: expected, difference },
  });

  revalidatePath("/daily-closing");
  revalidatePath("/dashboard");
  return ok("Day closed.");
}

export async function reopenDayAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await getCurrentContext();
  if (!ctx.user) redirect("/login");
  if (!ctx.profile?.organization_id) redirect("/setup");
  if (!canReopenDay(ctx.profile.role)) {
    return err("Only the owner or admin can reopen a closed day.");
  }
  if (!ctx.profile.branch_id) return err("No branch assigned for your profile.");

  const parsed = reopenDaySchema.safeParse(fd(formData));
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? "Invalid input.");

  const supabase = await createClient();
  const { error: updErr } = await supabase
    .from("daily_closings")
    .update({ finalized_by: null, finalized_at: null })
    .eq("organization_id", ctx.profile.organization_id)
    .eq("branch_id", ctx.profile.branch_id)
    .eq("closing_date", parsed.data.closing_date);
  if (updErr) return err(updErr.message);

  logAudit({
    module: "daily_closing",
    action: "daily_closing.reopened",
    details: `Day reopened: ${parsed.data.closing_date}`,
    metadata: { closing_date: parsed.data.closing_date },
  });

  revalidatePath("/daily-closing");
  revalidatePath("/dashboard");
  return ok("Day reopened.");
}
