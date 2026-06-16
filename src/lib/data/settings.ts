import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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
  google_maps_url?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  show_map?: boolean | null;
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
  appLogoUrl: string;
  invoiceFooter: string;
  receiptTerms: string;
  printFormat: "a4" | "80mm_planned";
  lowStockDefaultThreshold: number;
  businessSubtitle: string;
  primaryColor: string | null;
  accentColor: string | null;
  defaultTheme: "light" | "dark" | "system" | null;
  googleMapsUrl: string;
  latitude: string;
  longitude: string;
  showMap: boolean;
  invoiceShowLocationQr: boolean;
};

const FALLBACK_BRANDING: BrandingSettings = {
  appSettingsId: null,
  organizationId: "",
  branchId: null,
  shopName: "Gadget Zone",
  ownerName: "",
  phone: "",
  whatsappSupport: "",
  email: "",
  address: "",
  branchName: "Main Branch",
  branchPhone: "",
  branchAddress: "",
  currencyCode: "PKR",
  timezone: "Asia/Karachi",
  logoUrl: "/saledock-logo-full.png",
  appLogoUrl: "",
  invoiceFooter: "",
  receiptTerms: "",
  printFormat: "a4",
  lowStockDefaultThreshold: 5,
  businessSubtitle: "Mobile & Accessories Hub",
  primaryColor: null,
  accentColor: null,
  defaultTheme: null,
  googleMapsUrl: "",
  latitude: "",
  longitude: "",
  showMap: false,
  invoiceShowLocationQr: false,
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

async function getDb() {
  try {
    return createAdminClient();
  } catch {
    return await createClient();
  }
}

export async function getBrandingSettings(
  organizationId: string,
  branchId?: string | null,
): Promise<BrandingSettings> {
  try {
    const db = await getDb();

    const [{ data: org, error: orgError }, { data: branch, error: branchError }, { data: settings, error: settingsError }] =
      await Promise.all([
        db
          .from("organizations")
          .select("id, name, legal_name, phone, email, address, currency_code, timezone, logo_url, owner_name, primary_color, accent_color, default_theme, google_maps_url, latitude, longitude, show_map")
          .eq("id", organizationId)
          .maybeSingle<OrganizationSettingsRow>(),
        branchId
          ? db
              .from("branches")
              .select("id, organization_id, name, phone, address")
              .eq("organization_id", organizationId)
              .eq("id", branchId)
              .maybeSingle<BranchSettingsRow>()
          : Promise.resolve({ data: null, error: null }),
        db
          .from("app_settings")
          .select(
            "id, organization_id, branch_id, shop_name, business_subtitle, phone, email, address, invoice_template, theme_accent, receipt_footer, settings",
          )
          .eq("organization_id", organizationId)
          .order("created_at", { ascending: true })
          .returns<AppSettingsRow[]>(),
      ]);

    if (orgError || !org) {
      console.error("[getBrandingSettings] org query failed:", orgError?.message ?? "org not found");
      return { ...FALLBACK_BRANDING, organizationId };
    }
    if (branchError) {
      console.error("[getBrandingSettings] branch query failed:", branchError.message);
    }
    if (settingsError) {
      console.error("[getBrandingSettings] app_settings query failed:", settingsError.message);
    }

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
      logoUrl: stringSetting(json, "logo_url") || org.logo_url || "/saledock-logo-full.png",
      appLogoUrl: stringSetting(json, "app_logo_url"),
      invoiceFooter: appSettings?.receipt_footer || "",
      receiptTerms: stringSetting(json, "receipt_terms"),
      printFormat: printFormat(json.print_format ?? appSettings?.invoice_template),
      lowStockDefaultThreshold: numberSetting(json, "low_stock_default_threshold", 5),
      businessSubtitle: appSettings?.business_subtitle || "Mobile & Accessories Hub",
      primaryColor: org.primary_color ?? null,
      accentColor: org.accent_color ?? null,
      defaultTheme: org.default_theme ?? null,
      googleMapsUrl: org.google_maps_url || "",
      latitude: org.latitude != null ? String(org.latitude) : "",
      longitude: org.longitude != null ? String(org.longitude) : "",
      showMap: org.show_map === true,
      invoiceShowLocationQr: json.invoice_show_location_qr === true,
    };
  } catch (err) {
    console.error("[getBrandingSettings] unexpected error:", err);
    return { ...FALLBACK_BRANDING, organizationId };
  }
}
