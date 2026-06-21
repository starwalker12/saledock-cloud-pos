"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentContext } from "@/lib/auth/session";
import { canOpenShift, canCloseShift } from "@/lib/permissions";
import { openShiftSchema, closeShiftSchema } from "@/lib/validation/daily-closing";
import { getShiftActivity } from "@/lib/data/shifts";
import { logAudit } from "@/lib/audit";
import { getSafeActionError } from "@/lib/errors/safe-action-error";

export type ShiftActionState = { error: string | null; success: string | null };
const ok = (msg: string): ShiftActionState => ({ error: null, success: msg });
const err = (msg: string): ShiftActionState => ({ error: msg, success: null });

function fd(formData: FormData) {
  return Object.fromEntries(formData.entries());
}

export async function openShiftAction(
  _prev: ShiftActionState,
  formData: FormData,
): Promise<ShiftActionState> {
  const ctx = await getCurrentContext();
  if (!ctx.user) redirect("/login");
  if (!ctx.profile?.organization_id) redirect("/setup");
  if (!canOpenShift(ctx.profile.role)) {
    return err("You do not have permission to open a shift.");
  }
  if (!ctx.profile.branch_id) return err("No branch assigned for your profile.");

  const parsed = openShiftSchema.safeParse(fd(formData));
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? "Invalid input.");

  const supabase = await createClient();

  const { error: insertErr } = await supabase.from("cash_shifts").insert({
    organization_id: ctx.profile.organization_id,
    branch_id: ctx.profile.branch_id,
    opened_by: ctx.profile.id,
    starting_cash: parsed.data.starting_cash,
    notes: parsed.data.notes ?? null,
    status: "open",
  });

  if (insertErr) {
    if (insertErr.message?.includes("idx_cash_shifts_one_open_per_branch")) {
      return err("A shift is already open for this branch. Close it first.");
    }
    return err(getSafeActionError(insertErr, "We couldn't open the shift. Please try again."));
  }

  logAudit({
    module: "cash_shift",
    action: "cash_shift.opened",
    details: "Cash drawer shift opened",
    metadata: { starting_cash: parsed.data.starting_cash },
  });

  revalidatePath("/daily-closing");
  revalidatePath("/dashboard");
  return ok("Shift opened.");
}

export async function closeShiftAction(
  _prev: ShiftActionState,
  formData: FormData,
): Promise<ShiftActionState> {
  const ctx = await getCurrentContext();
  if (!ctx.user) redirect("/login");
  if (!ctx.profile?.organization_id) redirect("/setup");
  if (!canCloseShift(ctx.profile.role)) {
    return err("You do not have permission to close a shift.");
  }
  if (!ctx.profile.branch_id) return err("No branch assigned for your profile.");

  const parsed = closeShiftSchema.safeParse(fd(formData));
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? "Invalid input.");

  const orgId = ctx.profile.organization_id;
  const branchId = ctx.profile.branch_id;

  const supabase = await createClient();

  // Fetch the shift (RLS + explicit filter ensures org/branch scoping)
  const { data: shift, error: fetchErr } = await supabase
    .from("cash_shifts")
    .select("id, opened_at, status, starting_cash")
    .eq("id", parsed.data.shift_id)
    .eq("organization_id", orgId)
    .eq("branch_id", branchId)
    .single();

  if (fetchErr || !shift) return err("Shift not found.");
  if (shift.status !== "open") return err("This shift is already closed.");

  // Recompute totals server-side for the shift's time range
  const activity = await getShiftActivity(orgId, branchId, shift.opened_at);

  // Expected cash in drawer = starting cash + net cash flow
  const expected = shift.starting_cash + activity.expectedCash;
  const counted = parsed.data.counted_cash;
  const difference = counted - expected;

  const { error: updateErr } = await supabase
    .from("cash_shifts")
    .update({
      closed_at: new Date().toISOString(),
      closed_by: ctx.profile.id,
      expected_cash: expected,
      counted_cash: counted,
      cash_difference: difference,
      notes: parsed.data.notes ?? null,
      status: "closed",
    })
    .eq("id", parsed.data.shift_id);

  if (updateErr) return err(getSafeActionError(updateErr, "We couldn't update the shift. Please try again."));

  logAudit({
    module: "cash_shift",
    action: "cash_shift.closed",
    details: "Cash drawer shift closed",
    metadata: { shift_id: parsed.data.shift_id, counted_cash: counted, expected_cash: expected, difference },
  });

  revalidatePath("/daily-closing");
  revalidatePath("/dashboard");
  return ok("Shift closed.");
}
