"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentContext } from "@/lib/auth/session";
import { canChangeSettingsNew } from "@/lib/staff-permissions";
import { logAudit } from "@/lib/audit";
import { sanitizePlainText, sanitizeNullableText, normalizePhone, validateImageUrl } from "@/lib/security/sanitize";
import { z } from "zod";

export type SettingsActionState = {
  error: string | null;
  success: string | null;
};

type AppSettingsRow = {
  id: string;
  branch_id: string | null;
  settings: Record<string, unknown> | null;
};

export type SettingsIntent =
  | "business_profile"
  | "app_logo"
  | "branch_profile"
  | "invoice_branding"
  | "theme"
  | "regional";

const optionalText = (max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined),
    z.string().max(max).optional(),
  );

const optionalEmail = z.preprocess(
  (v) => (typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined),
  z.string().email("Enter a valid email address.").max(160).optional(),
);

const optionalUrlPath = z.preprocess(
  (v) => (typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined),
  z.string().max(500).refine(
    (v) => v.startsWith("/") || v.startsWith("https://") || v.startsWith("http://"),
    "Use a site path or a full URL.",
  ).optional(),
);

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a hex color like #3B82F6").nullable().optional();

const businessProfileSchema = z.object({
  shopName: z.string().trim().min(2, "Shop name is required.").max(120),
  ownerName: optionalText(120),
  phone: optionalText(50),
  whatsappSupport: optionalText(50).transform((v) => v ? v.replace(/[^\d+]/g, "") : undefined),
  email: optionalEmail,
  address: optionalText(300),
});

const appLogoSchema = z.object({
  appLogoUrl: optionalUrlPath,
});

const branchProfileSchema = z.object({
  branchName: z.string().trim().min(2, "Branch name is required.").max(120),
  branchPhone: optionalText(50),
  branchAddress: optionalText(300),
});

const invoiceBrandingSchema = z.object({
  logoUrl: optionalUrlPath,
  invoiceFooter: optionalText(500),
  receiptTerms: optionalText(1200),
  printFormat: z.enum(["a4", "80mm_planned"]).default("a4"),
});

const themeSchema = z.object({
  primaryColor: hexColor,
  accentColor: hexColor,
  defaultTheme: z.enum(["light", "dark", "system"]).nullable().optional(),
});

const regionalSchema = z.object({
  currencyCode: z.string().trim().toUpperCase().min(3).max(3).default("PKR"),
  timezone: z.string().trim().min(2).max(80).default("Asia/Karachi"),
  lowStockDefaultThreshold: z.coerce.number().int().min(0).max(9999).default(5),
});

async function getDb() {
  try {
    const admin = createAdminClient();
    return { db: admin, isAdmin: true };
  } catch {
    const client = await createClient();
    return { db: client, isAdmin: false };
  }
}

export async function updateSettingsAction(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  try {
    const { user, profile } = await getCurrentContext();
    if (!user || !profile?.organization_id) {
      return { error: "You must be signed in to update settings.", success: null };
    }
    if (!(await canChangeSettingsNew(profile))) {
      return { error: "Only owners and admins can update shop settings.", success: null };
    }

    const organizationId = profile.organization_id;
    const branchId = profile.branch_id;
    const intent = formData.get("intent") as SettingsIntent | null;
    if (!intent) return { error: "Missing save intent.", success: null };

    const readRaw = (keys: string[]): Record<string, unknown> => {
      const r: Record<string, unknown> = {};
      for (const k of keys) r[k] = formData.get(k);
      return r;
    };

    switch (intent) {
      case "business_profile": {
        const parsed = businessProfileSchema.safeParse(readRaw(["shopName", "ownerName", "phone", "whatsappSupport", "email", "address"]));
        if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Validation failed.", success: null };
        const v = parsed.data;

        const safe = {
          shopName: sanitizePlainText(v.shopName, 120),
          ownerName: sanitizeNullableText(v.ownerName ?? "", 120),
          phone: normalizePhone(v.phone),
          email: v.email ?? null,
          address: sanitizeNullableText(v.address ?? "", 300),
          whatsappSupport: normalizePhone(v.whatsappSupport),
        };

        const { db } = await getDb();
        const { error: orgErr } = await db
          .from("organizations")
          .update({ name: safe.shopName, owner_name: safe.ownerName, phone: safe.phone, email: safe.email, address: safe.address })
          .eq("id", organizationId);
        if (orgErr) return { error: orgErr.message, success: null };

        const { data: rows } = await db
          .from("app_settings")
          .select("id, branch_id, settings")
          .eq("organization_id", organizationId)
          .returns<AppSettingsRow[]>();
        if (rows) {
          const existing = rows.find((r) => r.branch_id === branchId) ?? rows.find((r) => r.branch_id === null) ?? rows[0];
          if (existing) {
            const settingsJson = { ...(existing.settings ?? {}), owner_name: safe.ownerName ?? "", whatsapp_support: safe.whatsappSupport ?? "" };
            await db.from("app_settings").update({ shop_name: safe.shopName, phone: safe.phone, email: safe.email, address: safe.address, settings: settingsJson }).eq("id", existing.id);
          }
        }

        logAudit({ module: "settings", action: "settings.updated", details: `Business profile updated: ${safe.shopName}` });
        return { error: null, success: "Business profile saved." };
      }

      case "app_logo": {
        const parsed = appLogoSchema.safeParse(readRaw(["appLogoUrl"]));
        if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Validation failed.", success: null };
        const v = parsed.data;
        const appLogoUrl = v.appLogoUrl ? validateImageUrl(v.appLogoUrl) : "";

        const { db } = await getDb();
        const { data: rows } = await db
          .from("app_settings")
          .select("id, branch_id, settings")
          .eq("organization_id", organizationId)
          .returns<AppSettingsRow[]>();
        if (!rows || rows.length === 0) {
          await db.from("app_settings").insert({
            organization_id: organizationId,
            branch_id: branchId,
            shop_name: "Shop",
            settings: { app_logo_url: appLogoUrl },
          });
        } else {
          const existing = rows.find((r) => r.branch_id === branchId) ?? rows.find((r) => r.branch_id === null) ?? rows[0];
          const settingsJson = { ...(existing.settings ?? {}), app_logo_url: appLogoUrl };
          await db.from("app_settings").update({ settings: settingsJson }).eq("id", existing.id);
        }

        revalidatePath("/", "layout");
        logAudit({ module: "settings", action: "settings.updated", details: "App / Shop logo updated" });
        return { error: null, success: appLogoUrl ? "App / Shop logo saved." : "App / Shop logo removed." };
      }

      case "branch_profile": {
        if (!branchId) return { error: "No branch associated with your profile.", success: null };
        const parsed = branchProfileSchema.safeParse(readRaw(["branchName", "branchPhone", "branchAddress"]));
        if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Validation failed.", success: null };
        const v = parsed.data;

        const safe = {
          branchName: sanitizePlainText(v.branchName, 120),
          branchPhone: normalizePhone(v.branchPhone),
          branchAddress: sanitizeNullableText(v.branchAddress ?? "", 300),
        };

        const { db } = await getDb();
        const { error: brErr } = await db
          .from("branches")
          .update({ name: safe.branchName, phone: safe.branchPhone, address: safe.branchAddress })
          .eq("organization_id", organizationId)
          .eq("id", branchId);
        if (brErr) return { error: brErr.message, success: null };

        const { data: rows } = await db
          .from("app_settings")
          .select("id, branch_id, settings")
          .eq("organization_id", organizationId)
          .returns<AppSettingsRow[]>();
        if (rows) {
          const existing = rows.find((r) => r.branch_id === branchId) ?? rows.find((r) => r.branch_id === null) ?? rows[0];
          if (existing) {
            await db.from("app_settings").update({ shop_name: safe.branchName, phone: safe.branchPhone, address: safe.branchAddress }).eq("id", existing.id);
          }
        }

        logAudit({ module: "settings", action: "settings.updated", details: `Branch profile updated: ${safe.branchName}` });
        return { error: null, success: "Branch profile saved." };
      }

      case "invoice_branding": {
        const parsed = invoiceBrandingSchema.safeParse(readRaw(["logoUrl", "invoiceFooter", "receiptTerms", "printFormat"]));
        if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Validation failed.", success: null };
        const v = parsed.data;

        const safe = {
          logoUrl: v.logoUrl ? validateImageUrl(v.logoUrl) : "",
          invoiceFooter: sanitizeNullableText(v.invoiceFooter ?? "", 500),
          receiptTerms: sanitizeNullableText(v.receiptTerms ?? "", 1200),
          printFormat: v.printFormat,
        };

        const { db } = await getDb();
        const { error: orgErr } = await db
          .from("organizations")
          .update({ logo_url: safe.logoUrl || null })
          .eq("id", organizationId);
        if (orgErr) return { error: orgErr.message, success: null };

        const { data: rows } = await db
          .from("app_settings")
          .select("id, branch_id, settings")
          .eq("organization_id", organizationId)
          .returns<AppSettingsRow[]>();
        if (!rows || rows.length === 0) {
          await db.from("app_settings").insert({
            organization_id: organizationId,
            branch_id: branchId,
            shop_name: "Shop",
            invoice_template: safe.printFormat,
            receipt_footer: safe.invoiceFooter,
            settings: { logo_url: safe.logoUrl, receipt_terms: safe.receiptTerms, print_format: safe.printFormat },
          });
        } else {
          const existing = rows.find((r) => r.branch_id === branchId) ?? rows.find((r) => r.branch_id === null) ?? rows[0];
          const settingsJson = { ...(existing.settings ?? {}), logo_url: safe.logoUrl, receipt_terms: safe.receiptTerms, print_format: safe.printFormat };
          await db.from("app_settings").update({
            invoice_template: safe.printFormat,
            receipt_footer: safe.invoiceFooter,
            settings: settingsJson,
          }).eq("id", existing.id);
        }

        logAudit({ module: "settings", action: "settings.updated", details: "Invoice branding updated" });
        return { error: null, success: "Invoice branding saved." };
      }

      case "theme": {
        const parsed = themeSchema.safeParse(readRaw(["primaryColor", "accentColor", "defaultTheme"]));
        if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Validation failed.", success: null };
        const v = parsed.data;

        const { db } = await getDb();
        const { error: orgErr } = await db
          .from("organizations")
          .update({ primary_color: v.primaryColor ?? null, accent_color: v.accentColor ?? null, default_theme: v.defaultTheme ?? null })
          .eq("id", organizationId);
        if (orgErr) return { error: orgErr.message, success: null };
        logAudit({ module: "settings", action: "settings.updated", details: "Theme updated" });
        return { error: null, success: "Theme saved." };
      }

      case "regional": {
        const parsed = regionalSchema.safeParse(readRaw(["currencyCode", "timezone", "lowStockDefaultThreshold"]));
        if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Validation failed.", success: null };
        const v = parsed.data;

        const { db } = await getDb();
        const { error: orgErr } = await db
          .from("organizations")
          .update({ currency_code: v.currencyCode, timezone: v.timezone })
          .eq("id", organizationId);
        if (orgErr) return { error: orgErr.message, success: null };

        const { data: rows } = await db
          .from("app_settings")
          .select("id, branch_id, settings")
          .eq("organization_id", organizationId)
          .returns<AppSettingsRow[]>();
        if (rows && rows.length > 0) {
          const existing = rows.find((r) => r.branch_id === branchId) ?? rows.find((r) => r.branch_id === null) ?? rows[0];
          const settingsJson = { ...(existing.settings ?? {}), low_stock_default_threshold: v.lowStockDefaultThreshold };
          await db.from("app_settings").update({ settings: settingsJson }).eq("id", existing.id);
        }

        logAudit({ module: "settings", action: "settings.updated", details: "Regional settings updated" });
        return { error: null, success: "Regional settings saved." };
      }

      default:
        return { error: "Unknown save intent.", success: null };
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred.", success: null };
  }
}

export async function updateProfilePictureAction(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  try {
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
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred.", success: null };
  }
}
