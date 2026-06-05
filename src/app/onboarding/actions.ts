"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentContext } from "@/lib/auth/session";
import { sanitizePlainText, sanitizeNullableText, normalizePhone, validateImageUrl } from "@/lib/security/sanitize";

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a hex color like #0b2f6f");

const onboardingSchema = z.object({
  fullName: z.string().min(2, "Full name is required."),
  username: z.string().optional().default(""),
  phone: z.string().optional().default(""),
  profilePictureUrl: z.string().optional().default(""),
  organizationName: z.string().min(2, "Shop name is required."),
  ownerName: z.string().optional().default(""),
  orgPhone: z.string().min(1, "Please enter your shop phone number."),
  orgWhatsapp: z.string().optional().default(""),
  orgEmail: z.string().email("Please enter a valid shop email address."),
  orgAddress: z.string().optional().default(""),
  currencyCode: z.string().optional().default("PKR"),
  timezone: z.string().optional().default("Asia/Karachi"),
  googleMapsUrl: z.string().optional().default(""),
  latitude: z.string().optional().default(""),
  longitude: z.string().optional().default(""),
  showMap: z.string().optional().default("false"),
  socialLinks: z.string().optional().default("[]"),
  branchName: z.string().optional().default("Main Branch"),
  branchPhone: z.string().optional().default(""),
  branchAddress: z.string().optional().default(""),
  branchGoogleMapsUrl: z.string().optional().default(""),
  branchLatitude: z.string().optional().default(""),
  branchLongitude: z.string().optional().default(""),
  logoUrl: z.string().optional().default(""),
  primaryColor: hexColor.optional().default("#0b2f6f"),
  accentColor: hexColor.optional().default("#00b8b0"),
  defaultTheme: z.enum(["light", "dark", "system"]).optional().default("system"),
});

export type OnboardingState = {
  error: string | null;
};

export async function completeOnboardingAction(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const { user } = await getCurrentContext();
  if (!user) redirect("/login");

  const raw: Record<string, string> = {};
  for (const key of Object.keys(onboardingSchema.shape)) {
    const val = formData.get(key);
    raw[key] = typeof val === "string" ? val : "";
  }

  const parsed = onboardingSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const supabase = await createClient();
  const d = parsed.data;

  // Sanitize all user-supplied values before passing to RPC
  const sanitized = {
    organizationName: sanitizePlainText(d.organizationName, 200),
    branchName: sanitizePlainText(d.branchName || "Main Branch", 200),
    fullName: sanitizePlainText(d.fullName, 200),
    ownerName: sanitizeNullableText(d.ownerName, 200),
    phone: normalizePhone(d.phone),
    avatarUrl: validateImageUrl(d.profilePictureUrl),
    orgPhone: normalizePhone(d.orgPhone),
    orgWhatsapp: normalizePhone(d.orgWhatsapp),
    orgEmail: d.orgEmail || null,
    orgAddress: sanitizeNullableText(d.orgAddress, 500),
    logoUrl: validateImageUrl(d.logoUrl),
    primaryColor: d.primaryColor || null,
    accentColor: d.accentColor || null,
    defaultTheme: d.defaultTheme || null,
    currencyCode: d.currencyCode || null,
    timezone: d.timezone || null,
    branchPhone: normalizePhone(d.branchPhone),
    branchAddress: sanitizeNullableText(d.branchAddress, 500),
  };

  const { error: rpcError } = await supabase.rpc("complete_self_signup", {
    p_organization_name: sanitized.organizationName,
    p_branch_name: sanitized.branchName,
    p_full_name: sanitized.fullName,
    p_owner_name: sanitized.ownerName,
    p_phone: sanitized.phone,
    p_avatar_url: sanitized.avatarUrl,
    p_org_phone: sanitized.orgPhone,
    p_org_whatsapp: sanitized.orgWhatsapp,
    p_org_email: sanitized.orgEmail,
    p_org_address: sanitized.orgAddress,
    p_logo_url: sanitized.logoUrl,
    p_primary_color: sanitized.primaryColor,
    p_accent_color: sanitized.accentColor,
    p_default_theme: sanitized.defaultTheme,
    p_currency_code: sanitized.currencyCode,
    p_timezone: sanitized.timezone,
    p_branch_phone: sanitized.branchPhone,
    p_branch_address: sanitized.branchAddress,
  });

  if (rpcError) {
    if (rpcError.message.includes("already belong to a shop")) {
      return { error: "You already have a shop. Redirecting to dashboard..." };
    }
    console.error("[security] Onboarding RPC failed:", rpcError.message);
    return { error: "Something went wrong while setting up your shop. Please try again." };
  }

  redirect("/dashboard");
}
