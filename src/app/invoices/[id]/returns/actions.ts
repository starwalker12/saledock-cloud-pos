"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { getCurrentContext } from "@/lib/auth/session";
import { canReturnNew } from "@/lib/staff-permissions";
import { canProcessReturns } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { createReturnSchema, type RefundMethod } from "@/lib/validation/returns";
import { logAudit } from "@/lib/audit";
import { getSafeActionError } from "@/lib/errors/safe-action-error";

export type ReturnActionState = {
  error: string | null;
  success: string | null;
  authRedirect?: "/login" | "/setup" | null;
  returnId?: string | null;
  returnNo?: string | null;
  refundAmount?: number | null;
  returnCredit?: number | null;
  debtRelief?: number | null;
  idempotentReplay?: boolean;
  outcomeUncertain?: boolean;
};

const err = (msg: string): ReturnActionState => ({ error: msg, success: null });

function flatten(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Invalid return input.";
}

export async function createInvoiceReturnAction(
  _prev: ReturnActionState,
  formData: FormData,
): Promise<ReturnActionState> {
  const ctx = await getCurrentContext();
  if (!ctx.user) return { error: null, success: null, authRedirect: "/login" };
  if (!ctx.profile?.organization_id) {
    return { error: null, success: null, authRedirect: "/setup" };
  }
  if (!canProcessReturns(ctx.profile.role) || !(await canReturnNew(ctx.profile))) {
    logAudit({ module: "returns", action: "permission.denied", details: "Attempted return without return permission" });
    return err("You do not have permission to process returns.");
  }

  const invoiceId = String(formData.get("invoice_id") ?? "");
  const itemIds = formData.getAll("invoice_item_id").map(String);
  const quantities = formData.getAll("quantity").map(String);
  const restockQuantities = formData.getAll("restock_quantity").map(String);

  const items = itemIds.map((invoiceItemId, index) => ({
    invoice_item_id: invoiceItemId,
    quantity: quantities[index] ?? "0",
    restock_quantity: restockQuantities[index] ?? "0",
  }));

  const parsed = createReturnSchema.safeParse({
    invoice_id: invoiceId,
    idempotency_key: formData.get("idempotency_key"),
    refund_method: (formData.get("refund_method") as RefundMethod | null) || null,
    reference_number: formData.get("reference_number"),
    notes: formData.get("notes"),
    items,
  });

  if (!parsed.success) return err(flatten(parsed.error));

  const selectedItems = parsed.data.items.filter((item) => item.quantity > 0);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_invoice_return", {
    p_invoice_id: parsed.data.invoice_id,
    p_items: selectedItems,
    p_refund_amount: null,
    p_refund_method: parsed.data.refund_method ?? null,
    p_reference_number: parsed.data.reference_number ?? null,
    p_notes: parsed.data.notes ?? null,
    p_idempotency_key: parsed.data.idempotency_key,
  });

  if (error) return {
    ...err(getSafeActionError(error, "We couldn't confirm this return. Retry the same request to check its result.")),
    outcomeUncertain: !error.code,
  };

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.return_id) return {
    ...err("We couldn't confirm this return. Retry the same request to check its result."),
    outcomeUncertain: true,
  };
  after(async () => {
    revalidatePath(`/invoices/${parsed.data.invoice_id}`);
    revalidatePath("/invoices");
    revalidatePath("/returns");
    revalidatePath("/products");
    revalidatePath("/customers");
    revalidatePath("/dashboard");

    // The database commits the sole business audit with the return. Replays only
    // refresh projections; they do not create a second audit or mutation.
  });

  return {
    error: null,
    success: row?.return_no ? `Return ${row.return_no} processed.` : "Return processed.",
    returnId: row?.return_id ?? null,
    returnNo: row?.return_no ?? null,
    refundAmount: row?.refund_amount != null ? Number(row.refund_amount) : null,
    returnCredit: row?.subtotal != null ? Number(row.subtotal) : null,
    debtRelief: row?.debt_relief != null ? Number(row.debt_relief) : null,
    idempotentReplay: Boolean(row?.idempotent_replay),
  };
}
