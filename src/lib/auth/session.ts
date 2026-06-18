import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type ProfileRow = {
  id: string;
  organization_id: string | null;
  branch_id: string | null;
  full_name: string;
  role: "owner" | "admin" | "manager" | "cashier" | "technician";
  is_active: boolean;
  avatar_url?: string | null;
  profile_picture_url?: string | null;
  phone?: string | null;
  onboarding_completed?: boolean | null;
};

export type OrganizationRow = {
  id: string;
  name: string;
  currency_code: string;
  timezone: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  logo_url?: string | null;
  owner_name?: string | null;
  whatsapp?: string | null;
  primary_color?: string | null;
  accent_color?: string | null;
  default_theme?: "light" | "dark" | "system" | null;
  onboarding_completed?: boolean | null;
};

export type BranchRow = {
  id: string;
  name: string;
  organization_id: string;
  phone?: string | null;
  address?: string | null;
};

export async function getCurrentSession() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

// Wrapped in React's `cache()` so the auth + profile + organization + branch
// reads are de-duplicated WITHIN a single server request. A page render calls
// this from the page itself plus the layout chrome (topbar, sidebar, mobile
// drawer), which previously each repeated the same Supabase round-trips.
//
// Safety: `cache()` is scoped to one server request only — it never persists
// across requests or users, so it cannot serve stale or cross-user data. The
// auth check (`auth.getUser()`) still runs once per request and permission
// decisions are computed from that same fresh read; behavior is unchanged.
// Verified that no server action re-reads context after mutating its own
// profile/org within the same call, so there is no staleness risk.
export const getCurrentContext = cache(async function getCurrentContext() {
  const { supabase, user } = await getCurrentSession();
  if (!user) {
    return { user: null, profile: null, organization: null, branch: null };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, organization_id, branch_id, full_name, role, is_active, avatar_url, profile_picture_url, phone, onboarding_completed")
    .eq("id", user.id)
    .maybeSingle<ProfileRow>();

  let organization: OrganizationRow | null = null;
  let branch: BranchRow | null = null;

  if (profile?.organization_id) {
    const { data: org } = await supabase
      .from("organizations")
      .select(
        "id, name, currency_code, timezone, phone, email, address, logo_url, owner_name, whatsapp, primary_color, accent_color, default_theme, onboarding_completed",
      )
      .eq("id", profile.organization_id)
      .maybeSingle<OrganizationRow>();
    organization = org ?? null;
  }
  if (profile?.branch_id) {
    const { data: br } = await supabase
      .from("branches")
      .select("id, name, organization_id, phone, address")
      .eq("id", profile.branch_id)
      .maybeSingle<BranchRow>();
    branch = br ?? null;
  }

  if (profile) {
    if (profile.profile_picture_url) {
      profile.profile_picture_url = await signProfilePictureUrl(profile.profile_picture_url);
    }
    if (profile.avatar_url) {
      profile.avatar_url = await signProfilePictureUrl(profile.avatar_url);
    }
  }

  return { user, profile, organization, branch };
});

type CacheEntry = {
  url: string;
  expiresAt: number;
};

const profilePictureCache = new Map<string, CacheEntry>();

export async function signProfilePictureUrl(
  storedUrl: string | null | undefined,
): Promise<string | null> {
  if (!storedUrl) return null;

  try {
    const marker = "/storage/v1/object/public/profile-pictures/";
    const index = storedUrl.indexOf(marker);
    if (index === -1) {
      return storedUrl;
    }

    const path = storedUrl.substring(index + marker.length);
    if (!path) {
      return storedUrl;
    }

    const now = Date.now();
    const cached = profilePictureCache.get(path);
    if (cached && cached.expiresAt > now) {
      return cached.url;
    }

    const supabase = await createClient();
    const { data, error } = await supabase.storage
      .from("profile-pictures")
      .createSignedUrl(path, 86400);

    if (error || !data?.signedUrl) {
      console.error("[signProfilePictureUrl] Error generating signed URL:", error);
      return storedUrl;
    }

    // Cache the URL for 12 hours (43,200,000 ms), which is safely less than the 24h signing expiry.
    profilePictureCache.set(path, {
      url: data.signedUrl,
      expiresAt: now + 12 * 60 * 60 * 1000,
    });

    return data.signedUrl;
  } catch (err) {
    console.error("[signProfilePictureUrl] Catch block error:", err);
    return storedUrl;
  }
}


