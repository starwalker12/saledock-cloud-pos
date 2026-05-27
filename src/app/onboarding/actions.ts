"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentContext } from "@/lib/auth/session";

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a hex color like #0b2f6f");

const onboardingSchema = z.object({
  fullName: z.string().min(2, "Full name is required."),
  username: z.string().optional().default(""),
  phone: z.string().optional().default(""),
  profilePictureUrl: z.string().optional().default(""),
  organizationName: z.string().min(2, "Shop name is required."),
  ownerName: z.string().optional().default(""),
  orgPhone: z.string().optional().default(""),
  orgWhatsapp: z.string().optional().default(""),
  orgEmail: z.string().email().optional().or(z.literal("")).default(""),
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

  const { error: rpcError } = await supabase.rpc("complete_self_signup", {
    p_organization_name: d.organizationName,
    p_branch_name: d.branchName || "Main Branch",
    p_full_name: d.fullName,
    p_owner_name: d.ownerName || null,
    p_phone: d.phone || null,
    p_avatar_url: d.profilePictureUrl || null,
    p_org_phone: d.orgPhone || null,
    p_org_whatsapp: d.orgWhatsapp || null,
    p_org_email: d.orgEmail || null,
    p_org_address: d.orgAddress || null,
    p_logo_url: d.logoUrl || null,
    p_primary_color: d.primaryColor || null,
    p_accent_color: d.accentColor || null,
    p_default_theme: d.defaultTheme || null,
    p_currency_code: d.currencyCode || null,
    p_timezone: d.timezone || null,
  });

  if (rpcError) {
    if (rpcError.message.includes("already belong to a shop")) {
      return { error: "You already have a shop. Redirecting to dashboard..." };
    }
    return { error: rpcError.message };
  }

  redirect("/dashboard");
}
