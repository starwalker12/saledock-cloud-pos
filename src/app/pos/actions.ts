"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentContext } from "@/lib/auth/session";
import { canUsePos, canWriteCatalog } from "@/lib/permissions";
import { canSellNew, canDiscountNew, canSellAtLossNew } from "@/lib/staff-permissions";
import { logAudit } from "@/lib/audit";
import { getSafeActionError } from "@/lib/errors/safe-action-error";
import {
  checkoutSchema,
  quickCustomerSchema,
  type CheckoutInput,
  type QuickCustomerInput,
} from "@/lib/validation/pos";

export type CheckoutResult = {
  ok: boolean;
  error: string | null;
  invoice_id?: string;
  invoice_no?: string;
};

export type QuickCustomerResult = {
  ok: boolean;
  error: string | null;
  customer?: { id: string; name: string; phone: string | null };
};

export async function checkoutAction(input: CheckoutInput): Promise<CheckoutResult> {
  const ctx = await getCurrentContext();
  if (!ctx.user) redirect("/login");
  if (!ctx.profile?.organization_id) redirect("/setup");
  if (!(await canSellNew(ctx.profile))) {
    logAudit({ module: "pos", action: "permission.denied", details: "Attempted checkout without sell permission" });
    return { ok: false, error: "You do not have permission to sell." };
  }

  const parsed = checkoutSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const profile = ctx.profile;

  // ── can_discount check ──
  const hasDiscount = parsed.data.discount_total > 0 || parsed.data.cart.some((item) => item.discount > 0);
  if (hasDiscount && !(await canDiscountNew(profile))) {
    logAudit({ module: "pos", action: "permission.denied", details: "Attempted discount without discount permission" });
    return { ok: false, error: "You do not have permission to apply discounts." };
  }

  const supabase = await createClient();

  // ── unit_price guard: reject below-list-price sales without discount permission ──
  if (!(await canDiscountNew(profile))) {
    const priceIds = [...new Set(parsed.data.cart.map((i) => i.product_id))];
    const { data: products } = await supabase
      .from("products")
      .select("id, sale_price, type")
      .eq("organization_id", profile.organization_id)
      .in("id", priceIds);
    const priceMap = new Map(
      (products ?? []).map((p) => [p.id, { price: Number(p.sale_price ?? 0), type: p.type }]),
    );
    for (const item of parsed.data.cart) {
      const p = priceMap.get(item.product_id);
      if (!p) continue;
      if (p.type === "service") continue;
      if (item.unit_price < p.price - 0.001) {
        return { ok: false, error: "You don't have permission to sell below the listed price." };
      }
    }
  }

  // ── can_sell_at_loss: pass override flag as an explicit RPC parameter ──
  const allowLossOverride = await canSellAtLossNew(profile);
  const { data, error } = await supabase.rpc("pos_checkout", {
    p_branch_id: profile.branch_id,
    p_customer_id: parsed.data.customer_id ?? null,
    p_cart: parsed.data.cart,
    p_discount_total: parsed.data.discount_total,
    p_payment_method: parsed.data.payment_method,
    p_amount_paid: parsed.data.amount_paid,
    p_payment_ref: parsed.data.payment_reference ?? null,
    p_note: parsed.data.note ?? null,
    p_allow_loss_override: allowLossOverride,
    p_idempotency_key: parsed.data.idempotency_key,
  });

  if (error) {
    return {
      ok: false,
      error: getSafeActionError(error, "This sale could not be completed. Please refresh and try again."),
    };
  }

  const row = Array.isArray(data)
    ? data[0]
    : (data as {
        invoice_id: string;
        invoice_no: string;
        idempotent_replay?: boolean;
      } | null);
  if (!row?.invoice_id) {
    return { ok: false, error: "Checkout returned no invoice." };
  }

  revalidatePath("/pos");
  revalidatePath("/invoices");
  revalidatePath("/dashboard");
  revalidatePath("/products");

  // The database reports same-key replays so retries do not create duplicate
  // action-level "checkout completed" audit entries. Money/stock mutations are
  // already skipped inside the RPC before this point.
  if (row.idempotent_replay !== true) {
    logAudit({
      module: "pos",
      action: "pos.checkout_completed",
      details: `Checkout completed: Invoice ${row.invoice_no}`,
      metadata: { invoice_id: row.invoice_id, invoice_no: row.invoice_no, payment_method: parsed.data.payment_method, amount_tendered: parsed.data.amount_paid },
    });
  }

  return { ok: true, error: null, invoice_id: row.invoice_id, invoice_no: row.invoice_no };
}

export async function quickCreateCustomerAction(
  input: QuickCustomerInput,
): Promise<QuickCustomerResult> {
  const ctx = await getCurrentContext();
  if (!ctx.user) redirect("/login");
  if (!ctx.profile?.organization_id) redirect("/setup");
  // Anyone who can run POS can create a walk-in customer; otherwise restrict to catalog writers.
  if (!canUsePos(ctx.profile.role) && !canWriteCatalog(ctx.profile.role)) {
    return { ok: false, error: "You do not have permission to create customers." };
  }

  const parsed = quickCustomerSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .insert({
      organization_id: ctx.profile.organization_id,
      branch_id: ctx.profile.branch_id,
      name: parsed.data.name,
      phone: parsed.data.phone ?? null,
    })
    .select("id, name, phone")
    .single();

  if (error) return { ok: false, error: getSafeActionError(error, "We couldn't save this customer. Please try again.") };
  revalidatePath("/customers");
  return { ok: true, error: null, customer: data as { id: string; name: string; phone: string | null } };
}
