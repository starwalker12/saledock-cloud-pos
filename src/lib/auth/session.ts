import "server-only";
import { createClient } from "@/lib/supabase/server";

export type ProfileRow = {
  id: string;
  organization_id: string | null;
  branch_id: string | null;
  full_name: string;
  role: "owner" | "admin" | "manager" | "cashier" | "technician";
  is_active: boolean;
  avatar_url?: string | null;
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

export async function getCurrentContext() {
  const { supabase, user } = await getCurrentSession();
  if (!user) {
    return { user: null, profile: null, organization: null, branch: null };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, organization_id, branch_id, full_name, role, is_active, avatar_url, phone, onboarding_completed")
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

  return { user, profile, organization, branch };
}
