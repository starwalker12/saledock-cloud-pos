"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentContext } from "@/lib/auth/session";
import { canManageSettings } from "@/lib/permissions";
import { settingsSchema } from "@/lib/validation/settings";
import { logAudit } from "@/lib/audit";
import { sanitizePlainText, sanitizeNullableText, normalizePhone, validateImageUrl } from "@/lib/security/sanitize";

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
      logoUrl: formData.get("logoUrl") || "/saledock-logo-full.png",
      appLogoUrl: formData.get("appLogoUrl"),
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

  // Sanitize all values before DB write
  const safe = {
    shopName: sanitizePlainText(values.shopName, 120),
    ownerName: sanitizeNullableText(values.ownerName ?? "", 120),
    phone: normalizePhone(values.phone),
    email: values.email ?? null,
    address: sanitizeNullableText(values.address ?? "", 300),
    whatsappSupport: normalizePhone(values.whatsappSupport),
    branchName: sanitizePlainText(values.branchName, 120),
    branchPhone: normalizePhone(values.branchPhone),
    branchAddress: sanitizeNullableText(values.branchAddress ?? "", 300),
    logoUrl: validateImageUrl(values.logoUrl),
    appLogoUrl: values.appLogoUrl ? validateImageUrl(values.appLogoUrl) : "",
    invoiceFooter: sanitizeNullableText(values.invoiceFooter ?? "", 500),
    receiptTerms: sanitizeNullableText(values.receiptTerms ?? "", 1200),
    primaryColor: values.primaryColor ?? null,
    accentColor: values.accentColor ?? null,
    defaultTheme: values.defaultTheme ?? null,
    currencyCode: values.currencyCode,
    timezone: values.timezone,
    printFormat: values.printFormat,
    lowStockDefaultThreshold: values.lowStockDefaultThreshold,
  };

  const { error: orgError } = await supabase
    .from("organizations")
    .update({
      name: safe.shopName,
      owner_name: safe.ownerName,
      phone: safe.phone,
      email: safe.email,
      address: safe.address,
      logo_url: safe.logoUrl,
      primary_color: safe.primaryColor,
      accent_color: safe.accentColor,
      default_theme: safe.defaultTheme,
      currency_code: safe.currencyCode,
      timezone: safe.timezone,
    })
    .eq("id", organizationId);
  if (orgError) return { error: orgError.message, success: null };

  if (branchId) {
    const { error: branchError } = await supabase
      .from("branches")
      .update({
        name: safe.branchName,
        phone: safe.branchPhone,
        address: safe.branchAddress,
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
    owner_name: safe.ownerName ?? "",
    whatsapp_support: safe.whatsappSupport ?? "",
    logo_url: safe.logoUrl ?? "/saledock-logo-full.png",
    app_logo_url: safe.appLogoUrl,
    receipt_terms: safe.receiptTerms ?? "",
    print_format: safe.printFormat,
    low_stock_default_threshold: safe.lowStockDefaultThreshold,
    upload_storage_status: "deferred",
  };

  const appSettingsPayload = {
    organization_id: organizationId,
    branch_id: branchId,
    shop_name: safe.shopName,
    phone: safe.phone,
    email: safe.email,
    address: safe.address,
    invoice_template: safe.printFormat,
    receipt_footer: safe.invoiceFooter,
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
  revalidatePath("/", "layout");

  logAudit({
    module: "settings",
    action: "settings.updated",
    details: `Shop settings updated: ${safe.shopName}`,
    metadata: { shop_name: safe.shopName, currency: safe.currencyCode, timezone: safe.timezone },
  });

  return { error: null, success: "Shop settings saved." };
}

export async function updateProfilePictureAction(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const { user } = await getCurrentContext();
  if (!user) {
    return { error: "You must be signed in.", success: null };
  }

  const profilePictureUrl = formData.get("profilePictureUrl");
  const url = typeof profilePictureUrl === "string" ? profilePictureUrl.trim() : "";

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ profile_picture_url: url || null })
    .eq("id", user.id);

  if (error) {
    return { error: error.message, success: null };
  }

  revalidatePath("/settings");
  return {
    error: null,
    success: url ? "Profile picture updated." : "Profile picture removed.",
  };
}
