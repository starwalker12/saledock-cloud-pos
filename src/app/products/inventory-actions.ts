"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentContext } from "@/lib/auth/session";
import { canWriteCatalog } from "@/lib/permissions";
import { stockLotSchema, stockAdjustmentSchema } from "@/lib/validation/inventory";
import { listStockLots, listStockMovements, getProductStockSummary } from "@/lib/data/inventory";

export type ActionState = { error: string | null; success: string | null };
const ok = (msg: string): ActionState => ({ error: null, success: msg });
const err = (msg: string): ActionState => ({ error: msg, success: null });

async function requireWriter() {
  const ctx = await getCurrentContext();
  if (!ctx.user) redirect("/login");
  if (!ctx.profile?.organization_id) redirect("/setup");
  // Owner, Manager, or Admin role check
  if (!canWriteCatalog(ctx.profile.role)) {
    return { ctx, denied: true as const };
  }
  return { ctx, denied: false as const };
}

function flatten(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Invalid input.";
}

function fd(formData: FormData) {
  return Object.fromEntries(formData.entries());
}

export async function addStockLotAction(
  productId: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const w = await requireWriter();
  if (w.denied) return err("You do not have permission to manage inventory.");

  const raw = fd(formData);
  // Handle empty optional fields
  if (raw.supplier_id === "") delete raw.supplier_id;
  if (raw.purchase_date === "") delete raw.purchase_date;

  const parsed = stockLotSchema.safeParse(raw);
  if (!parsed.success) return err(flatten(parsed.error));

  const supabase = await createClient();
  const { error } = await supabase.rpc("add_stock_lot", {
    p_product_id: productId,
    p_lot_number: parsed.data.lot_number ?? null,
    p_purchase_date: parsed.data.purchase_date ?? null,
    p_qty_received: parsed.data.quantity_received,
    p_unit_cost: parsed.data.unit_cost,
    p_supplier_id: parsed.data.supplier_id ?? null,
    p_notes: parsed.data.notes ?? null,
  });

  if (error) {
    console.error("Error adding stock lot:", error);
    return err(error.message);
  }

  revalidatePath("/products");
  revalidatePath("/dashboard");
  revalidatePath("/pos");
  return ok("Stock lot successfully restocked.");
}

export async function recordStockAdjustmentAction(
  productId: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const w = await requireWriter();
  if (w.denied) return err("You do not have permission to adjust inventory.");

  const raw = fd(formData);
  const parsed = stockAdjustmentSchema.safeParse(raw);
  if (!parsed.success) return err(flatten(parsed.error));

  const supabase = await createClient();
  const { error } = await supabase.rpc("adjust_stock", {
    p_product_id: productId,
    p_adjustment_type: parsed.data.adjustment_type,
    p_qty: parsed.data.quantity,
    p_notes: parsed.data.notes,
  });

  if (error) {
    console.error("Error adjusting stock:", error);
    return err(error.message);
  }

  revalidatePath("/products");
  revalidatePath("/dashboard");
  revalidatePath("/pos");
  return ok(`Stock adjustment '${parsed.data.adjustment_type.toUpperCase()}' completed successfully.`);
}

export async function getProductInventoryDataAction(productId: string) {
  const ctx = await getCurrentContext();
  if (!ctx.user || !ctx.profile?.organization_id) {
    throw new Error("Unauthorized");
  }
  const orgId = ctx.profile.organization_id;
  const lots = await listStockLots(productId, orgId);
  const movements = await listStockMovements(productId, orgId);
  const summary = await getProductStockSummary(productId, orgId);
  return { lots, movements, summary };
}

