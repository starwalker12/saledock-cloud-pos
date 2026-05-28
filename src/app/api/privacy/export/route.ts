import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*, organization:organizations(*)")
    .eq("id", user.id)
    .maybeSingle();

  let organization = null;
  let branches: unknown[] = [];
  let settings: Record<string, unknown> = {};
  let privacyRequests: unknown[] = [];

  if (profile?.organization_id) {
    const { data: org } = await supabase
      .from("organizations")
      .select("*")
      .eq("id", profile.organization_id)
      .maybeSingle();
    organization = org;

    const { data: br } = await supabase
      .from("branches")
      .select("*")
      .eq("organization_id", profile.organization_id);
    branches = br ?? [];

    const { data: st } = await supabase
      .from("app_settings")
      .select("*")
      .eq("organization_id", profile.organization_id)
      .maybeSingle();
    if (st) {
      const safeSettings = { ...st } as Record<string, unknown>;
      delete safeSettings.id;
      delete safeSettings.organization_id;
      delete safeSettings.created_at;
      delete safeSettings.updated_at;
      settings = safeSettings;
    }

    const { data: pr } = await supabase
      .from("privacy_requests")
      .select("*")
      .eq("requester_user_id", user.id);
    privacyRequests = pr ?? [];
  }

  // Identity summary (safe — no tokens or secrets)
  const identities = (user.identities ?? []).map((id) => ({
    provider: id.provider,
    identity_id: id.id,
    created_at: id.created_at ?? null,
    last_sign_in_at: id.last_sign_in_at,
  }));

  const exportData = {
    app: "SaleDock Cloud POS",
    exported_at: new Date().toISOString(),
    user: {
      id: user.id,
      email: user.email,
      created_at: user.created_at,
      last_sign_in_at: user.last_sign_in_at,
      confirmed_at: user.confirmed_at,
      phone: user.phone ?? null,
      identities,
    },
    profile: profile
      ? {
          full_name: profile.full_name,
          email: profile.email,
          phone: profile.phone,
          avatar_url: profile.avatar_url,
          profile_picture_url: profile.profile_picture_url,
          role: profile.role,
          onboarding_completed: profile.onboarding_completed,
        }
      : null,
    organization: organization
      ? {
          id: (organization as Record<string, unknown>).id,
          name: (organization as Record<string, unknown>).name,
          slug: (organization as Record<string, unknown>).slug,
          owner_name: (organization as Record<string, unknown>).owner_name,
          address: (organization as Record<string, unknown>).address,
          phone: (organization as Record<string, unknown>).phone,
          email: (organization as Record<string, unknown>).email,
          branding: {
            subtitle: (organization as Record<string, unknown>).subtitle,
            description: (organization as Record<string, unknown>).description,
            logo_url: (organization as Record<string, unknown>).logo_url,
            social_media_links: (organization as Record<string, unknown>).social_media_links,
            location_link: (organization as Record<string, unknown>).location_link,
          },
          currency: (organization as Record<string, unknown>).currency,
          timezone: (organization as Record<string, unknown>).timezone,
          onboarding_completed: (organization as Record<string, unknown>).onboarding_completed,
        }
      : null,
    branches: branches.map((b) => ({
      id: (b as Record<string, unknown>).id,
      name: (b as Record<string, unknown>).name,
      address: (b as Record<string, unknown>).address,
      phone: (b as Record<string, unknown>).phone,
      email: (b as Record<string, unknown>).email,
      is_active: (b as Record<string, unknown>).is_active,
    })),
    settings,
    privacy_requests: privacyRequests.map((r) => ({
      id: (r as Record<string, unknown>).id,
      request_type: (r as Record<string, unknown>).request_type,
      status: (r as Record<string, unknown>).status,
      details: (r as Record<string, unknown>).details,
      requested_at: (r as Record<string, unknown>).requested_at,
      processed_at: (r as Record<string, unknown>).processed_at,
      admin_notes: (r as Record<string, unknown>).admin_notes,
    })),
    notes:
      "This export includes your account, profile, organization summary, branch list, shop settings, and privacy requests. " +
      "It excludes passwords, password hashes, auth tokens, provider tokens, service secrets, internal RLS/security fields, " +
      "and business records (products, customers, invoices, repairs, expenses, etc.). " +
      "To export full business data, use the Backup & Restore tab in Settings (owner/admin only).",
  };

  const json = JSON.stringify(exportData, null, 2);
  const filename = `saledock-data-export-${new Date().toISOString().split("T")[0]}.json`;

  return new NextResponse(json, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
