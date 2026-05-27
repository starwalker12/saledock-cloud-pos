"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentContext } from "@/lib/auth/session";
import { canManageSupplierPurchases } from "@/lib/permissions";
import {
  createPurchaseSchema,
  recordPaymentSchema,
  type CreatePurchaseInput,
  type RecordPaymentInput,
} from "@/lib/validation/supplier-purchases";
import { logAudit } from "@/lib/audit";

export type CreatePurchaseResult =
  | { ok: true; purchase_id: string; purchase_no: string }
  | { ok: false; error: string };

async function requireManager() {
  const ctx = await getCurrentContext();
  if (!ctx.user) redirect("/login");
  if (!ctx.profile?.organization_id) redirect("/setup");
  if (!canManageSupplierPurchases(ctx.profile.role)) {
    return { ctx, denied: true as const };
  }
  return { ctx, denied: false as const };
}

export async function createSupplierPurchaseAction(
  input: CreatePurchaseInput,
): Promise<CreatePurchaseResult> {
  const w = await requireManager();
  if (w.denied) return { ok: false, error: "You do not have permission to record purchases." };

  const parsed = createPurchaseSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const data = parsed.data;

  const supabase = await createClient();
  const { data: rpcData, error } = await supabase.rpc("create_supplier_purchase", {
    p_supplier_id: data.supplier_id,
    p_branch_id: w.ctx.profile!.branch_id,
    p_purchase_date: data.purchase_date ?? null,
    p_items: data.items.map((i) => ({
      product_id: i.product_id,
      quantity: i.quantity,
      unit_cost: i.unit_cost,
      notes: i.notes ?? null,
    })),
    p_discount_total: data.discount_total,
    p_reference_no: data.reference_no ?? null,
    p_notes: data.notes ?? null,
    p_payment_method: data.amount_paid > 0 ? (data.payment_method ?? "cash") : null,
    p_amount_paid: data.amount_paid,
    p_payment_ref: data.payment_ref ?? null,
  });

  if (error) return { ok: false, error: error.message };

  const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
  if (!row?.purchase_id) return { ok: false, error: "Purchase RPC returned no row." };

  logAudit({
    module: "purchases",
    action: "supplier_purchase.created",
    details: `Recorded purchase ${row.purchase_no} from supplier ${data.supplier_id} (${data.items.length} items)`,
    metadata: {
      purchase_id: row.purchase_id,
      purchase_no: row.purchase_no,
      supplier_id: data.supplier_id,
      item_count: data.items.length,
      grand_total_estimate: data.items.reduce((s, i) => s + i.quantity * i.unit_cost, 0) - data.discount_total,
      amount_paid: data.amount_paid,
    },
  });

  revalidatePath("/suppliers/purchases");
  revalidatePath(`/suppliers/purchases/${row.purchase_id}`);
  revalidatePath("/products");
  revalidatePath("/dashboard");
  revalidatePath("/reports");
  return { ok: true, purchase_id: row.purchase_id, purchase_no: row.purchase_no };
}

export type RecordPaymentResult =
  | { ok: true; payment_id: string }
  | { ok: false; error: string };

export async function recordSupplierPaymentAction(
  input: RecordPaymentInput,
): Promise<RecordPaymentResult> {
  const w = await requireManager();
  if (w.denied) return { ok: false, error: "You do not have permission to record supplier payments." };

  const parsed = recordPaymentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const data = parsed.data;

  const supabase = await createClient();
  const { data: rpcData, error } = await supabase.rpc("record_supplier_payment", {
    p_supplier_id: data.supplier_id,
    p_purchase_id: data.purchase_id ?? null,
    p_branch_id: w.ctx.profile!.branch_id,
    p_method: data.method,
    p_amount: data.amount,
    p_reference_no: data.reference_no ?? null,
    p_note: data.note ?? null,
  });

  if (error) return { ok: false, error: error.message };

  const paymentId = typeof rpcData === "string" ? rpcData : null;
  if (!paymentId) return { ok: false, error: "Payment RPC returned no id." };

  logAudit({
    module: "purchases",
    action: "supplier_payment.recorded",
    details: `Recorded supplier payment Rs ${data.amount} via ${data.method}`,
    metadata: {
      payment_id: paymentId,
      supplier_id: data.supplier_id,
      purchase_id: data.purchase_id ?? null,
      method: data.method,
      amount: data.amount,
    },
  });

  revalidatePath("/suppliers/purchases");
  if (data.purchase_id) revalidatePath(`/suppliers/purchases/${data.purchase_id}`);
  revalidatePath(`/suppliers/${data.supplier_id}/ledger`);
  revalidatePath("/dashboard");
  revalidatePath("/reports");
  return { ok: true, payment_id: paymentId };
}
