"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentContext } from "@/lib/auth/session";
import { canOpenShift, canCloseShift } from "@/lib/permissions";
import {
  openShiftSchema,
  closeShiftSchema,
} from "@/lib/validation/daily-closing";
import { operationRequestKey } from "@/lib/validation/operation-request-key";
import { getCashShiftActionError } from "@/lib/errors/cash-shift-action-error";

export type ShiftActionState = {
  error: string | null;
  success: string | null;
  refresh?: boolean;
};
const ok = (msg: string): ShiftActionState => ({ error: null, success: msg });
const err = (msg: string): ShiftActionState => ({ error: msg, success: null });

export async function openShiftAction(
  _prev: ShiftActionState,
  formData: FormData,
): Promise<ShiftActionState> {
  const ctx = await getCurrentContext();
  if (!ctx.user) redirect("/login");
  if (!ctx.profile?.organization_id) redirect("/setup");
  if (!canOpenShift(ctx.profile.role))
    return err("You do not have permission to open a shift.");
  if (!ctx.profile.branch_id)
    return err("No branch assigned for your profile.");
  const parsed = openShiftSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success)
    return err(parsed.error.issues[0]?.message ?? "Invalid input.");
  const key = operationRequestKey(formData);
  if (!key) return err("Please refresh the form and try again.");
  const supabase = await createClient();
  const { data: receipt, error } = await supabase.rpc("open_cash_shift", {
    p_request_key: key,
    p_starting_cash: String(formData.get("starting_cash") ?? "").trim(),
    p_notes: parsed.data.notes ?? null,
  });
  if (error)
    return {
      ...err(
        getCashShiftActionError(
          error,
          "We couldn't open the shift. Please try again.",
        ),
      ),
      refresh: error.code === "PT409",
    };
  // Durable DB replay may intentionally return an earlier, now closed opening.
  // A stale page/request must not turn that receipt into a new-open success.
  const { data: current, error: currentError } = await supabase
    .from("cash_shifts")
    .select("id")
    .eq("organization_id", ctx.profile.organization_id)
    .eq("branch_id", ctx.profile.branch_id)
    .eq("accounting_version", 2)
    .eq("status", "open")
    .maybeSingle();
  if (currentError)
    return err("We couldn't confirm the open shift. Refresh and try again.");
  if (!receipt?.id || current?.id !== receipt.id)
    return {
      error:
        "That opening is no longer the active shift. Review the refreshed drawer before opening another shift.",
      success: null,
      refresh: true,
    };
  return ok("Shift opened.");
}

export async function closeShiftAction(
  _prev: ShiftActionState,
  formData: FormData,
): Promise<ShiftActionState> {
  const ctx = await getCurrentContext();
  if (!ctx.user) redirect("/login");
  if (!ctx.profile?.organization_id) redirect("/setup");
  if (!canCloseShift(ctx.profile.role))
    return err("You do not have permission to close a shift.");
  if (!ctx.profile.branch_id)
    return err("No branch assigned for your profile.");
  const parsed = closeShiftSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success)
    return err(parsed.error.issues[0]?.message ?? "Invalid input.");
  const key = operationRequestKey(formData);
  if (!key) return err("Please refresh the form and try again.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("close_cash_shift", {
    p_shift_id: parsed.data.shift_id,
    p_request_key: key,
    p_counted_cash: String(formData.get("counted_cash") ?? "").trim(),
    p_notes: parsed.data.notes ?? null,
  });
  if (error)
    return err(
      getCashShiftActionError(
        error,
        "We couldn't close the shift. Please try again.",
      ),
    );
  return ok("Shift closed.");
}
