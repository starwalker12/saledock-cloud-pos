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
  heldBillPayloadSchema,
  quickCustomerSchema,
  type CheckoutInput,
  type HeldBillPayload,
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

export type HeldBillResult = {
  ok: boolean;
  error: string | null;
  held_bill_id?: string;
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

// ── Held bills / suspended sales ─────────────────────────────────────────────
// These actions intentionally NEVER create invoices, invoice numbers, stock
// reservations, payments, or customer ledger entries. Real invoice numbers are
// generated only by checkoutAction above via the pos_checkout RPC.

export async function holdBillAction(payload: HeldBillPayload): Promise<HeldBillResult> {
  const ctx = await getCurrentContext();
  if (!ctx.user) redirect("/login");
  if (!ctx.profile?.organization_id) redirect("/setup");
  if (!(await canSellNew(ctx.profile))) {
    logAudit({ module: "pos", action: "permission.denied", details: "Attempted hold bill without sell permission" });
    return { ok: false, error: "You do not have permission to hold bills." };
  }

  const parsed = heldBillPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("pos_held_bills").insert({
    organization_id: ctx.profile.organization_id,
    branch_id: ctx.profile.branch_id,
    created_by: ctx.profile.id,
    status: "held",
    label: parsed.data.label ?? null,
    customer_id: parsed.data.customer_id ?? null,
    customer_name: parsed.data.customer_name ?? null,
    note: parsed.data.note ?? null,
    cart: parsed.data.cart,
    totals_snapshot: parsed.data.totals_snapshot ?? null,
  });

  if (error) {
    return { ok: false, error: getSafeActionError(error, "We couldn't hold this bill. Please try again.") };
  }

  logAudit({
    module: "pos",
    action: "pos.held_bill_created",
    details: `Held bill created${parsed.data.label ? `: ${parsed.data.label}` : ""}`,
    metadata: { customer_id: parsed.data.customer_id ?? null },
  });

  return { ok: true, error: null };
}

export async function listHeldBillsAction(): Promise<{
  ok: boolean;
  error: string | null;
  bills?: {
    id: string;
    status: string;
    label: string | null;
    customer_name: string | null;
    note: string | null;
    item_count: number;
    grand_total: number;
    created_at: string;
    updated_at: string;
  }[];
}> {
  const ctx = await getCurrentContext();
  if (!ctx.user) redirect("/login");
  if (!ctx.profile?.organization_id) redirect("/setup");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pos_held_bills")
    .select("id, status, label, customer_name, note, totals_snapshot, created_at, updated_at")
    .eq("organization_id", ctx.profile.organization_id)
    .in("status", ["held", "resumed"])
    .order("updated_at", { ascending: false });

  if (error) {
    return { ok: false, error: getSafeActionError(error, "We couldn't load held bills."), bills: [] };
  }

  const bills = (data ?? []).map((row) => {
    const snap = (row.totals_snapshot ?? {}) as Record<string, number>;
    return {
      id: row.id,
      status: row.status,
      label: row.label,
      customer_name: row.customer_name,
      note: row.note,
      item_count: Number.isFinite(Number(snap.item_count)) ? Number(snap.item_count) : 0,
      grand_total: Number.isFinite(Number(snap.grand_total)) ? Number(snap.grand_total) : 0,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  });

  return { ok: true, error: null, bills };
}

export async function getHeldBillAction(id: string): Promise<{
  ok: boolean;
  error: string | null;
  bill?: HeldBillPayload & { id: string; status: string };
}> {
  const ctx = await getCurrentContext();
  if (!ctx.user) redirect("/login");
  if (!ctx.profile?.organization_id) redirect("/setup");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pos_held_bills")
    .select("id, status, label, customer_id, customer_name, note, cart, totals_snapshot")
    .eq("id", id)
    .eq("organization_id", ctx.profile.organization_id)
    .single();

  if (error || !data) {
    return { ok: false, error: "Held bill not found." };
  }

  return {
    ok: true,
    error: null,
    bill: {
      id: data.id,
      status: data.status,
      label: data.label,
      customer_id: data.customer_id,
      customer_name: data.customer_name,
      note: data.note,
      cart: data.cart as HeldBillPayload["cart"],
      totals_snapshot: data.totals_snapshot as HeldBillPayload["totals_snapshot"],
    },
  };
}

export async function resumeHeldBillAction(id: string): Promise<{
  ok: boolean;
  error: string | null;
}> {
  const ctx = await getCurrentContext();
  if (!ctx.user) redirect("/login");
  if (!ctx.profile?.organization_id) redirect("/setup");
  if (!(await canSellNew(ctx.profile))) {
    return { ok: false, error: "You do not have permission to resume held bills." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("pos_held_bills")
    .update({ status: "resumed", updated_by: ctx.profile.id, resumed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("organization_id", ctx.profile.organization_id);

  if (error) {
    return { ok: false, error: getSafeActionError(error, "We couldn't resume this bill.") };
  }

  logAudit({
    module: "pos",
    action: "pos.held_bill_resumed",
    details: `Held bill resumed`,
    metadata: { held_bill_id: id },
  });

  return { ok: true, error: null };
}

export async function completeHeldBillAction(id: string, invoiceId: string): Promise<{
  ok: boolean;
  error: string | null;
}> {
  const ctx = await getCurrentContext();
  if (!ctx.user) redirect("/login");
  if (!ctx.profile?.organization_id) redirect("/setup");

  const supabase = await createClient();
  const { error } = await supabase
    .from("pos_held_bills")
    .update({ status: "completed", updated_by: ctx.profile.id, completed_invoice_id: invoiceId })
    .eq("id", id)
    .eq("organization_id", ctx.profile.organization_id);

  if (error) {
    return { ok: false, error: getSafeActionError(error, "We couldn't finalize the held bill record.") };
  }

  return { ok: true, error: null };
}

export async function cancelHeldBillAction(id: string): Promise<{
  ok: boolean;
  error: string | null;
}> {
  const ctx = await getCurrentContext();
  if (!ctx.user) redirect("/login");
  if (!ctx.profile?.organization_id) redirect("/setup");
  if (!(await canSellNew(ctx.profile))) {
    return { ok: false, error: "You do not have permission to cancel held bills." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("pos_held_bills")
    .update({ status: "cancelled", updated_by: ctx.profile.id })
    .eq("id", id)
    .eq("organization_id", ctx.profile.organization_id);

  if (error) {
    return { ok: false, error: getSafeActionError(error, "We couldn't cancel this held bill.") };
  }

  logAudit({
    module: "pos",
    action: "pos.held_bill_cancelled",
    details: `Held bill cancelled`,
    metadata: { held_bill_id: id },
  });

  return { ok: true, error: null };
}
