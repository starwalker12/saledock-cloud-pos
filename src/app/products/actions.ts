"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentContext } from "@/lib/auth/session";
import { canWriteCatalog, canManageLossOverride } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import {
  categorySchema,
  productSchema,
  supplierSchema,
} from "@/lib/validation/catalog";
import { getSafeActionError } from "@/lib/errors/safe-action-error";
import {
  removeProductImage,
  uploadProductImage,
} from "@/lib/storage/product-images.server";

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
    const { data: existingCategory, error: fetchErr } = await supabase
      .from("product_categories")
      .select("id")
      .eq("id", id)
      .eq("organization_id", w.ctx.profile!.organization_id!)
      .maybeSingle();

    if (fetchErr || !existingCategory) {
      return err("We could not find this record for your shop. It may have been removed or you may not have access.");
    }

    const { error } = await supabase
      .from("product_categories")
      .update(payload)
      .eq("id", id)
      .eq("organization_id", w.ctx.profile!.organization_id!);
    if (error) return err(getSafeActionError(error, "We couldn't save these changes. Please try again."));
  } else {
    const { error } = await supabase.from("product_categories").insert(payload);
    if (error) return err(getSafeActionError(error, "We couldn't save these changes. Please try again."));
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

  const { data: existingCategory, error: fetchErr } = await supabase
    .from("product_categories")
    .select("id")
    .eq("id", id)
    .eq("organization_id", w.ctx.profile!.organization_id!)
    .maybeSingle();

  if (fetchErr || !existingCategory) {
    return;
  }

  const { error } = await supabase
    .from("product_categories")
    .update({ is_active: false })
    .eq("id", id)
    .eq("organization_id", w.ctx.profile!.organization_id!);

  if (error) return;

  revalidatePath("/products");
}

export async function unarchiveCategoryAction(formData: FormData) {
  const w = await requireWriter();
  if (w.denied) return;
  const id = formData.get("id") as string;
  if (!id) return;
  const supabase = await createClient();

  const { data: existingCategory, error: fetchErr } = await supabase
    .from("product_categories")
    .select("id")
    .eq("id", id)
    .eq("organization_id", w.ctx.profile!.organization_id!)
    .maybeSingle();

  if (fetchErr || !existingCategory) {
    return;
  }

  const { error } = await supabase
    .from("product_categories")
    .update({ is_active: true })
    .eq("id", id)
    .eq("organization_id", w.ctx.profile!.organization_id!);

  if (error) return;

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
    const { data: existingSupplier, error: fetchErr } = await supabase
      .from("suppliers")
      .select("id")
      .eq("id", id)
      .eq("organization_id", w.ctx.profile!.organization_id!)
      .maybeSingle();

    if (fetchErr || !existingSupplier) {
      return err("We could not find this record for your shop. It may have been removed or you may not have access.");
    }

    const { error } = await supabase
      .from("suppliers")
      .update(payload)
      .eq("id", id)
      .eq("organization_id", w.ctx.profile!.organization_id!);
    if (error) return err(getSafeActionError(error, "We couldn't save these changes. Please try again."));
  } else {
    const { error } = await supabase.from("suppliers").insert(payload);
    if (error) return err(getSafeActionError(error, "We couldn't save these changes. Please try again."));
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

  const { data: existingSupplier, error: fetchErr } = await supabase
    .from("suppliers")
    .select("id")
    .eq("id", id)
    .eq("organization_id", w.ctx.profile!.organization_id!)
    .maybeSingle();

  if (fetchErr || !existingSupplier) {
    return;
  }

  const { error } = await supabase
    .from("suppliers")
    .update({ is_active: false })
    .eq("id", id)
    .eq("organization_id", w.ctx.profile!.organization_id!);

  if (error) return;

  revalidatePath("/products");
}

export async function unarchiveSupplierAction(formData: FormData) {
  const w = await requireWriter();
  if (w.denied) return;
  const id = formData.get("id") as string;
  if (!id) return;
  const supabase = await createClient();

  const { data: existingSupplier, error: fetchErr } = await supabase
    .from("suppliers")
    .select("id")
    .eq("id", id)
    .eq("organization_id", w.ctx.profile!.organization_id!)
    .maybeSingle();

  if (fetchErr || !existingSupplier) {
    return;
  }

  const { error } = await supabase
    .from("suppliers")
    .update({ is_active: true })
    .eq("id", id)
    .eq("organization_id", w.ctx.profile!.organization_id!);

  if (error) return;

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
  const imageValue = formData.get("product_image");
  const imageFile = imageValue instanceof File && imageValue.size > 0 ? imageValue : null;
  const removeImage = formData.get("remove_image") === "1";
  const supabase = await createClient();
  const isService = parsed.data.is_service;
  const orgId = w.ctx.profile!.organization_id!;

  // Enforce role permission gating for below-cost overrides
  const attemptOverride = parsed.data.allow_sell_at_loss;
  if (attemptOverride && !canManageLossOverride(w.ctx.profile?.role)) {
    return err("Only owner or admin can authorize selling below cost.");
  }

  // Server-side barcode uniqueness check within the organization
  const rawBarcode = parsed.data.barcode?.trim();
  if (rawBarcode) {
    let query = supabase
      .from("products")
      .select("id")
      .eq("organization_id", orgId)
      .eq("barcode", rawBarcode);
    if (id) query = query.neq("id", id);
    const { data: dupes } = await query.maybeSingle();
    if (dupes) {
      return err("This barcode is already used by another product.");
    }
  }

  const payload = {
    organization_id: orgId,
    branch_id: w.ctx.profile!.branch_id ?? null,
    name: parsed.data.name,
    sku: parsed.data.sku ?? null,
    barcode: rawBarcode || null,
    category_id: parsed.data.category_id ?? null,
    supplier_id: parsed.data.supplier_id ?? null,
    type: isService ? ("service" as const) : ("product" as const),
    purchase_price: isService ? 0 : parsed.data.purchase_price,
    sale_price: parsed.data.sale_price,
    stock_quantity: isService ? 0 : parsed.data.stock_quantity,
    minimum_stock: isService ? 0 : parsed.data.minimum_stock,
    allow_sell_at_loss: isService ? false : parsed.data.allow_sell_at_loss,
    sell_at_loss_reason: isService ? "" : (parsed.data.sell_at_loss_reason ?? ""),
    sell_at_loss_updated_at: isService ? null : (parsed.data.allow_sell_at_loss ? new Date().toISOString() : null),
    sell_at_loss_updated_by: isService ? null : (parsed.data.allow_sell_at_loss ? w.ctx.profile!.id : null),
    notes: parsed.data.notes ?? null,
    is_active: parsed.data.is_active,
  };

  if (id) {
    // Query old state for comparative override audit logs
    const { data: oldProduct, error: fetchErr } = await supabase
      .from("products")
      .select("allow_sell_at_loss, sell_at_loss_reason, name, image_path")
      .eq("id", id)
      .eq("organization_id", orgId)
      .maybeSingle();

    if (fetchErr || !oldProduct) {
      return err("We could not find this record for your shop. It may have been removed or you may not have access.");
    }

    let nextImagePath = oldProduct.image_path;
    let uploadedImagePath: string | null = null;
    if (imageFile) {
      const upload = await uploadProductImage(supabase, orgId, id, imageFile);
      if (upload.error) return err(upload.error);
      nextImagePath = upload.path;
      uploadedImagePath = upload.path;
    } else if (removeImage) {
      nextImagePath = null;
    }

    const { error } = await supabase
      .from("products")
      .update({ ...payload, image_path: nextImagePath })
      .eq("id", id)
      .eq("organization_id", orgId);
    if (error) {
      await removeProductImage(supabase, uploadedImagePath);
      return err(getSafeActionError(error, "We couldn't save these changes. Please try again."));
    }

    if (oldProduct.image_path && oldProduct.image_path !== nextImagePath) {
      await removeProductImage(supabase, oldProduct.image_path);
    }

    if (oldProduct && !isService) {
      if (!oldProduct.allow_sell_at_loss && parsed.data.allow_sell_at_loss) {
        logAudit({
          module: "products",
          action: "product.loss_override_enabled",
          details: `Loss sale override enabled for product ${parsed.data.name} (Reason: "${parsed.data.sell_at_loss_reason}")`,
          metadata: { product_id: id, product_name: parsed.data.name, reason: parsed.data.sell_at_loss_reason },
        });
      } else if (oldProduct.allow_sell_at_loss && !parsed.data.allow_sell_at_loss) {
        logAudit({
          module: "products",
          action: "product.loss_override_disabled",
          details: `Loss sale override disabled for product ${parsed.data.name}`,
          metadata: { product_id: id, product_name: parsed.data.name },
        });
      } else if (
        oldProduct.allow_sell_at_loss &&
        parsed.data.allow_sell_at_loss &&
        oldProduct.sell_at_loss_reason !== parsed.data.sell_at_loss_reason
      ) {
        logAudit({
          module: "products",
          action: "product.loss_override_reason_changed",
          details: `Loss sale override reason changed for product ${parsed.data.name} (Old: "${oldProduct.sell_at_loss_reason}", New: "${parsed.data.sell_at_loss_reason}")`,
          metadata: { product_id: id, product_name: parsed.data.name, old_reason: oldProduct.sell_at_loss_reason, new_reason: parsed.data.sell_at_loss_reason },
        });
      }
    }
  } else {
    const productId = crypto.randomUUID();
    let imagePath: string | null = null;
    if (imageFile) {
      const upload = await uploadProductImage(supabase, orgId, productId, imageFile);
      if (upload.error) return err(upload.error);
      imagePath = upload.path;
    }

    const { error } = await supabase.from("products").insert({
      id: productId,
      ...payload,
      image_path: imagePath,
    });
    if (error) {
      await removeProductImage(supabase, imagePath);
      return err(getSafeActionError(error, "We couldn't save these changes. Please try again."));
    }

    if (parsed.data.allow_sell_at_loss && !isService) {
      logAudit({
        module: "products",
        action: "product.loss_override_enabled",
        details: `Created product ${parsed.data.name} with loss sale override enabled (Reason: "${parsed.data.sell_at_loss_reason}")`,
        metadata: { product_name: parsed.data.name, reason: parsed.data.sell_at_loss_reason },
      });
    }
  }

  revalidatePath("/products");
  revalidatePath("/pos");
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

  const { data: existingProduct, error: fetchErr } = await supabase
    .from("products")
    .select("id")
    .eq("id", id)
    .eq("organization_id", w.ctx.profile!.organization_id!)
    .maybeSingle();

  if (fetchErr || !existingProduct) {
    return;
  }

  const { error } = await supabase
    .from("products")
    .update({ is_active: false })
    .eq("id", id)
    .eq("organization_id", w.ctx.profile!.organization_id!);

  if (error) return;

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

  const { data: existingProduct, error: fetchErr } = await supabase
    .from("products")
    .select("id")
    .eq("id", id)
    .eq("organization_id", w.ctx.profile!.organization_id!)
    .maybeSingle();

  if (fetchErr || !existingProduct) {
    return;
  }

  const { error } = await supabase
    .from("products")
    .update({ is_active: true })
    .eq("id", id)
    .eq("organization_id", w.ctx.profile!.organization_id!);

  if (error) return;

  revalidatePath("/products");
  revalidatePath("/dashboard");
}
