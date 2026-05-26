"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentContext } from "@/lib/auth/session";
import { canWriteCatalog } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import {
  categorySchema,
  productSchema,
  supplierSchema,
} from "@/lib/validation/catalog";

export type ActionState = { error: string | null; success: string | null };
const ok = (msg: string): ActionState => ({ error: null, success: msg });
const err = (msg: string): ActionState => ({ error: msg, success: null });

async function requireWriter() {
  const ctx = await getCurrentContext();
  if (!ctx.user) redirect("/login");
  if (!ctx.profile?.organization_id) redirect("/setup");
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

// ─────────────────────────── Categories ───────────────────────────

export async function saveCategoryAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const w = await requireWriter();
  if (w.denied) return err("You do not have permission to manage catalog.");

  const parsed = categorySchema.safeParse(fd(formData));
  if (!parsed.success) return err(flatten(parsed.error));

  const id = (formData.get("id") as string | null) || null;
  const supabase = await createClient();
  const payload = {
    organization_id: w.ctx.profile!.organization_id!,
    name: parsed.data.name,
    description: parsed.data.description ?? null,
    is_active: parsed.data.is_active,
  };

  if (id) {
    const { error } = await supabase.from("product_categories").update(payload).eq("id", id);
    if (error) return err(error.message);
  } else {
    const { error } = await supabase.from("product_categories").insert(payload);
    if (error) return err(error.message);
  }
  revalidatePath("/products");
  revalidatePath("/dashboard");
  return ok(id ? "Category updated." : "Category created.");
}

export async function archiveCategoryAction(formData: FormData) {
  const w = await requireWriter();
  if (w.denied) return;
  const id = formData.get("id") as string;
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("product_categories").update({ is_active: false }).eq("id", id);
  revalidatePath("/products");
}

export async function unarchiveCategoryAction(formData: FormData) {
  const w = await requireWriter();
  if (w.denied) return;
  const id = formData.get("id") as string;
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("product_categories").update({ is_active: true }).eq("id", id);
  revalidatePath("/products");
}

// ─────────────────────────── Suppliers ───────────────────────────

export async function saveSupplierAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const w = await requireWriter();
  if (w.denied) return err("You do not have permission to manage catalog.");

  const parsed = supplierSchema.safeParse(fd(formData));
  if (!parsed.success) return err(flatten(parsed.error));

  const id = (formData.get("id") as string | null) || null;
  const supabase = await createClient();
  const payload = {
    organization_id: w.ctx.profile!.organization_id!,
    name: parsed.data.name,
    company: parsed.data.company ?? null,
    phone: parsed.data.phone ?? null,
    email: parsed.data.email ?? null,
    address: parsed.data.address ?? null,
    notes: parsed.data.notes ?? null,
    is_active: parsed.data.is_active,
  };

  if (id) {
    const { error } = await supabase.from("suppliers").update(payload).eq("id", id);
    if (error) return err(error.message);
  } else {
    const { error } = await supabase.from("suppliers").insert(payload);
    if (error) return err(error.message);
  }
  revalidatePath("/products");
  revalidatePath("/dashboard");
  return ok(id ? "Supplier updated." : "Supplier created.");
}

export async function archiveSupplierAction(formData: FormData) {
  const w = await requireWriter();
  if (w.denied) return;
  const id = formData.get("id") as string;
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("suppliers").update({ is_active: false }).eq("id", id);
  revalidatePath("/products");
}

export async function unarchiveSupplierAction(formData: FormData) {
  const w = await requireWriter();
  if (w.denied) return;
  const id = formData.get("id") as string;
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("suppliers").update({ is_active: true }).eq("id", id);
  revalidatePath("/products");
}

// ─────────────────────────── Products ───────────────────────────

export async function saveProductAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const w = await requireWriter();
  if (w.denied) return err("You do not have permission to manage catalog.");

  const parsed = productSchema.safeParse(fd(formData));
  if (!parsed.success) return err(flatten(parsed.error));

  const id = (formData.get("id") as string | null) || null;
  const supabase = await createClient();
  const isService = parsed.data.is_service;
  const payload = {
    organization_id: w.ctx.profile!.organization_id!,
    branch_id: w.ctx.profile!.branch_id ?? null,
    name: parsed.data.name,
    sku: parsed.data.sku ?? null,
    barcode: parsed.data.barcode ?? null,
    category_id: parsed.data.category_id ?? null,
    supplier_id: parsed.data.supplier_id ?? null,
    type: isService ? ("service" as const) : ("product" as const),
    // Services must keep purchase_price = 0 so reports compute profit as
    // (line_total - 0) = commission only. See docs/pos.md "Service profit rule".
    purchase_price: isService ? 0 : parsed.data.purchase_price,
    sale_price: parsed.data.sale_price,
    stock_quantity: isService ? 0 : parsed.data.stock_quantity,
    minimum_stock: isService ? 0 : parsed.data.minimum_stock,
    notes: parsed.data.notes ?? null,
    is_active: parsed.data.is_active,
  };

  if (id) {
    const { error } = await supabase.from("products").update(payload).eq("id", id);
    if (error) return err(error.message);
  } else {
    const { error } = await supabase.from("products").insert(payload);
    if (error) return err(error.message);
  }
  revalidatePath("/products");
  revalidatePath("/dashboard");
  logAudit({
    module: "products",
    action: id ? "product.updated" : "product.created",
    details: `${id ? "Updated" : "Created"} product: ${parsed.data.name}`,
    metadata: { product_name: parsed.data.name, sku: parsed.data.sku ?? null, type: isService ? "service" : "product" },
  });
  return ok(id ? "Product updated." : "Product created.");
}

export async function archiveProductAction(formData: FormData) {
  const w = await requireWriter();
  if (w.denied) return;
  const id = formData.get("id") as string;
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("products").update({ is_active: false }).eq("id", id);
  revalidatePath("/products");
  revalidatePath("/dashboard");
  logAudit({
    module: "products",
    action: "product.archived",
    details: `Archived product ${id}`,
    metadata: { product_id: id },
  });
}

export async function unarchiveProductAction(formData: FormData) {
  const w = await requireWriter();
  if (w.denied) return;
  const id = formData.get("id") as string;
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("products").update({ is_active: true }).eq("id", id);
  revalidatePath("/products");
  revalidatePath("/dashboard");
}
