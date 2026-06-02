"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentContext } from "@/lib/auth/session";
import { canReturnNew } from "@/lib/staff-permissions";
import { createClient } from "@/lib/supabase/server";
import { createReturnSchema, type RefundMethod } from "@/lib/validation/returns";
import { logAudit } from "@/lib/audit";

export type ReturnActionState = { error: string | null; success: string | null };

const ok = (msg: string): ReturnActionState => ({ error: null, success: msg });
const err = (msg: string): ReturnActionState => ({ error: msg, success: null });

function flatten(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Invalid return input.";
}

export async function createInvoiceReturnAction(
  _prev: ReturnActionState,
  formData: FormData,
): Promise<ReturnActionState> {
  const ctx = await getCurrentContext();
  if (!ctx.user) redirect("/login");
  if (!ctx.profile?.organization_id) redirect("/setup");
  if (!(await canReturnNew(ctx.profile))) {
    return err("You do not have permission to process returns.");
  }

  const invoiceId = String(formData.get("invoice_id") ?? "");
  const itemIds = formData.getAll("invoice_item_id").map(String);
  const quantities = formData.getAll("quantity").map(String);
  const restockIds = new Set(formData.getAll("restock_item_id").map(String));

  const items = itemIds.map((invoiceItemId, index) => ({
    invoice_item_id: invoiceItemId,
    quantity: quantities[index] ?? "0",
    restock: restockIds.has(invoiceItemId),
  }));

  const parsed = createReturnSchema.safeParse({
    invoice_id: invoiceId,
    refund_amount: formData.get("refund_amount") ?? "0",
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
    p_refund_amount: parsed.data.refund_amount,
    p_refund_method: parsed.data.refund_method ?? null,
    p_reference_number: parsed.data.reference_number ?? null,
    p_notes: parsed.data.notes ?? null,
  });

  if (error) return err(error.message);

  const row = Array.isArray(data) ? data[0] : data;
  revalidatePath(`/invoices/${parsed.data.invoice_id}`);
  revalidatePath("/invoices");
  revalidatePath("/returns");
  revalidatePath("/products");
  revalidatePath("/customers");
  revalidatePath("/dashboard");

  logAudit({
    module: "returns",
    action: "returns.created",
    details: `Return processed for Invoice ${parsed.data.invoice_id}. Refund Amount: Rs. ${parsed.data.refund_amount} (${parsed.data.refund_method ?? "Cash"})`,
    metadata: {
      invoice_id: parsed.data.invoice_id,
      refund_amount: parsed.data.refund_amount,
      refund_method: parsed.data.refund_method,
      return_no: row?.return_no ?? null,
    },
  });

  return ok(row?.return_no ? `Return ${row.return_no} processed.` : "Return processed.");
}
