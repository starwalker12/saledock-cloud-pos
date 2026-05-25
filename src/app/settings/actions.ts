"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentContext } from "@/lib/auth/session";
import { canManageSettings } from "@/lib/permissions";
import { settingsSchema } from "@/lib/validation/settings";

export type SettingsActionState = {
  error: string | null;
  success: string | null;
};

type AppSettingsRow = {
  id: string;
  branch_id: string | null;
  settings: Record<string, unknown> | null;
};

export async function updateSettingsAction(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const { user, profile } = await getCurrentContext();
  if (!user || !profile?.organization_id) {
    return { error: "You must be signed in to update settings.", success: null };
  }
  if (!canManageSettings(profile.role)) {
    return { error: "Only owners and admins can update shop settings.", success: null };
  }

  const parsed = settingsSchema.safeParse({
    shopName: formData.get("shopName"),
    ownerName: formData.get("ownerName"),
    phone: formData.get("phone"),
    whatsappSupport: formData.get("whatsappSupport"),
    email: formData.get("email"),
    address: formData.get("address"),
    branchName: formData.get("branchName"),
    branchPhone: formData.get("branchPhone"),
    branchAddress: formData.get("branchAddress"),
    currencyCode: formData.get("currencyCode") || "PKR",
    timezone: formData.get("timezone") || "Asia/Karachi",
    logoUrl: formData.get("logoUrl") || "/gadget-zone-logo.png",
    invoiceFooter: formData.get("invoiceFooter"),
    receiptTerms: formData.get("receiptTerms"),
    printFormat: formData.get("printFormat") || "a4",
    lowStockDefaultThreshold: formData.get("lowStockDefaultThreshold") || "5",
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Please check the settings form.",
      success: null,
    };
  }

  const values = parsed.data;
  const supabase = await createClient();
  const organizationId = profile.organization_id;
  const branchId = profile.branch_id;

  const { error: orgError } = await supabase
    .from("organizations")
    .update({
      name: values.shopName,
      phone: values.phone ?? null,
      email: values.email ?? null,
      address: values.address ?? null,
      currency_code: values.currencyCode,
      timezone: values.timezone,
    })
    .eq("id", organizationId);
  if (orgError) return { error: orgError.message, success: null };

  if (branchId) {
    const { error: branchError } = await supabase
      .from("branches")
      .update({
        name: values.branchName,
        phone: values.branchPhone ?? null,
        address: values.branchAddress ?? null,
      })
      .eq("organization_id", organizationId)
      .eq("id", branchId);
    if (branchError) return { error: branchError.message, success: null };
  }

  const { data: settingsRows, error: settingsReadError } = await supabase
    .from("app_settings")
    .select("id, branch_id, settings")
    .eq("organization_id", organizationId)
    .returns<AppSettingsRow[]>();
  if (settingsReadError) return { error: settingsReadError.message, success: null };

  const existing =
    settingsRows?.find((row) => row.branch_id === branchId) ??
    settingsRows?.find((row) => row.branch_id === null) ??
    settingsRows?.[0] ??
    null;

  const settingsJson = {
    ...(existing?.settings ?? {}),
    owner_name: values.ownerName ?? "",
    whatsapp_support: values.whatsappSupport ?? "",
    logo_url: values.logoUrl ?? "/gadget-zone-logo.png",
    receipt_terms: values.receiptTerms ?? "",
    print_format: values.printFormat,
    low_stock_default_threshold: values.lowStockDefaultThreshold,
    upload_storage_status: "deferred",
  };

  const appSettingsPayload = {
    organization_id: organizationId,
    branch_id: branchId,
    shop_name: values.shopName,
    phone: values.phone ?? null,
    email: values.email ?? null,
    address: values.address ?? null,
    invoice_template: values.printFormat,
    receipt_footer: values.invoiceFooter ?? null,
    settings: settingsJson,
  };

  const appSettingsResult = existing
    ? await supabase.from("app_settings").update(appSettingsPayload).eq("id", existing.id)
    : await supabase.from("app_settings").insert(appSettingsPayload);

  if (appSettingsResult.error) {
    return { error: appSettingsResult.error.message, success: null };
  }

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  revalidatePath("/invoices");
  revalidatePath("/repairs");
  revalidatePath("/reports");

  return { error: null, success: "Shop settings saved." };
}
