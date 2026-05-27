import "server-only";
import { createClient } from "@/lib/supabase/server";

type JsonObject = Record<string, unknown>;

type AppSettingsRow = {
  id: string;
  organization_id: string;
  branch_id: string | null;
  shop_name: string;
  business_subtitle: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  invoice_template: string;
  theme_accent: string;
  receipt_footer: string | null;
  settings: JsonObject | null;
};

type OrganizationSettingsRow = {
  id: string;
  name: string;
  legal_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  currency_code: string;
  timezone: string;
  logo_url?: string | null;
  owner_name?: string | null;
  primary_color?: string | null;
  accent_color?: string | null;
  default_theme?: "light" | "dark" | "system" | null;
};

type BranchSettingsRow = {
  id: string;
  organization_id: string;
  name: string;
  phone: string | null;
  address: string | null;
};

export type BrandingSettings = {
  appSettingsId: string | null;
  organizationId: string;
  branchId: string | null;
  shopName: string;
  ownerName: string;
  phone: string;
  whatsappSupport: string;
  email: string;
  address: string;
  branchName: string;
  branchPhone: string;
  branchAddress: string;
  currencyCode: string;
  timezone: string;
  logoUrl: string;
  invoiceFooter: string;
  receiptTerms: string;
  printFormat: "a4" | "80mm_planned";
  lowStockDefaultThreshold: number;
  businessSubtitle: string;
  primaryColor: string | null;
  accentColor: string | null;
  defaultTheme: "light" | "dark" | "system" | null;
};

function stringSetting(settings: JsonObject | null | undefined, key: string, fallback = "") {
  const value = settings?.[key];
  return typeof value === "string" ? value : fallback;
}

function numberSetting(settings: JsonObject | null | undefined, key: string, fallback: number) {
  const value = settings?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function printFormat(value: unknown): BrandingSettings["printFormat"] {
  return value === "80mm_planned" ? "80mm_planned" : "a4";
}

export async function getBrandingSettings(
  organizationId: string,
  branchId?: string | null,
): Promise<BrandingSettings> {
  const supabase = await createClient();

  const [{ data: org, error: orgError }, { data: branch, error: branchError }, { data: settings, error: settingsError }] =
    await Promise.all([
      supabase
        .from("organizations")
        .select("id, name, legal_name, phone, email, address, currency_code, timezone, logo_url, owner_name, primary_color, accent_color, default_theme")
        .eq("id", organizationId)
        .maybeSingle<OrganizationSettingsRow>(),
      branchId
        ? supabase
            .from("branches")
            .select("id, organization_id, name, phone, address")
            .eq("organization_id", organizationId)
            .eq("id", branchId)
            .maybeSingle<BranchSettingsRow>()
        : Promise.resolve({ data: null, error: null }),
      supabase
        .from("app_settings")
        .select(
          "id, organization_id, branch_id, shop_name, business_subtitle, phone, email, address, invoice_template, theme_accent, receipt_footer, settings",
        )
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: true })
        .returns<AppSettingsRow[]>(),
    ]);

  if (orgError) throw new Error(orgError.message);
  if (branchError) throw new Error(branchError.message);
  if (settingsError) throw new Error(settingsError.message);
  if (!org) throw new Error("Organization settings were not found.");

  const rows = settings ?? [];
  const appSettings =
    rows.find((row) => row.branch_id === (branch?.id ?? branchId ?? null)) ??
    rows.find((row) => row.branch_id === null) ??
    rows[0] ??
    null;
  const json = appSettings?.settings ?? {};

  return {
    appSettingsId: appSettings?.id ?? null,
    organizationId: org.id,
    branchId: branch?.id ?? branchId ?? appSettings?.branch_id ?? null,
    shopName: appSettings?.shop_name || org.name || "Gadget Zone",
    ownerName: stringSetting(json, "owner_name") || org.owner_name || "",
    phone: appSettings?.phone || org.phone || "",
    whatsappSupport: stringSetting(json, "whatsapp_support", appSettings?.phone || org.phone || ""),
    email: appSettings?.email || org.email || "",
    address: appSettings?.address || org.address || "",
    branchName: branch?.name || "Main Branch",
    branchPhone: branch?.phone || "",
    branchAddress: branch?.address || "",
    currencyCode: org.currency_code || "PKR",
    timezone: org.timezone || "Asia/Karachi",
    logoUrl: stringSetting(json, "logo_url") || org.logo_url || "/gadget-zone-logo.png",
    invoiceFooter: appSettings?.receipt_footer || "",
    receiptTerms: stringSetting(json, "receipt_terms"),
    printFormat: printFormat(json.print_format ?? appSettings?.invoice_template),
    lowStockDefaultThreshold: numberSetting(json, "low_stock_default_threshold", 5),
    businessSubtitle: appSettings?.business_subtitle || "Mobile & Accessories Hub",
    primaryColor: org.primary_color ?? null,
    accentColor: org.accent_color ?? null,
    defaultTheme: org.default_theme ?? null,
  };
}
