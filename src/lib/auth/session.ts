import "server-only";
import { createClient } from "@/lib/supabase/server";

export type ProfileRow = {
  id: string;
  organization_id: string | null;
  branch_id: string | null;
  full_name: string;
  role: "owner" | "admin" | "manager" | "cashier" | "technician";
  is_active: boolean;
};

export type OrganizationRow = {
  id: string;
  name: string;
  currency_code: string;
  timezone: string;
};

export type BranchRow = {
  id: string;
  name: string;
  organization_id: string;
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
    .select("id, organization_id, branch_id, full_name, role, is_active")
    .eq("id", user.id)
    .maybeSingle<ProfileRow>();

  let organization: OrganizationRow | null = null;
  let branch: BranchRow | null = null;

  if (profile?.organization_id) {
    const { data: org } = await supabase
      .from("organizations")
      .select("id, name, currency_code, timezone")
      .eq("id", profile.organization_id)
      .maybeSingle<OrganizationRow>();
    organization = org ?? null;
  }
  if (profile?.branch_id) {
    const { data: br } = await supabase
      .from("branches")
      .select("id, name, organization_id")
      .eq("id", profile.branch_id)
      .maybeSingle<BranchRow>();
    branch = br ?? null;
  }

  return { user, profile, organization, branch };
}
