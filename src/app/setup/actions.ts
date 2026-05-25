"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";

const schema = z.object({
  organizationName: z.string().min(2, "Organization name is required."),
  branchName: z.string().min(2, "Branch name is required."),
  fullName: z.string().min(2, "Your full name is required."),
});

export type SetupState = { error: string | null };

export async function completeSetupAction(
  _prev: SetupState,
  formData: FormData,
): Promise<SetupState> {
  if (!env.isSupabaseConfigured) {
    return { error: "Supabase is not configured. Add credentials to .env.local." };
  }
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    return {
      error:
        "SUPABASE_SERVICE_ROLE_KEY is missing on the server. First-owner setup needs it (server-only).",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const parsed = schema.safeParse({
    organizationName: formData.get("organizationName"),
    branchName: formData.get("branchName"),
    fullName: formData.get("fullName"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const admin = createAdminClient();

  // If this user already has a profile, send them to the dashboard.
  const { data: existingProfile } = await admin
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();
  if (existingProfile) redirect("/dashboard");

  // Lock setup if any organization exists (require invite for additional users).
  const { count: orgCount, error: countError } = await admin
    .from("organizations")
    .select("id", { count: "exact", head: true });
  if (countError) return { error: countError.message };
  if ((orgCount ?? 0) > 0) {
    return {
      error:
        "Setup is locked. An organization already exists. Ask the owner to invite you before logging in.",
    };
  }

  const { data: org, error: orgErr } = await admin
    .from("organizations")
    .insert({ name: parsed.data.organizationName })
    .select("id")
    .single();
  if (orgErr || !org) return { error: orgErr?.message ?? "Failed to create organization." };

  const { data: branch, error: branchErr } = await admin
    .from("branches")
    .insert({ organization_id: org.id, name: parsed.data.branchName })
    .select("id")
    .single();
  if (branchErr || !branch) {
    await admin.from("organizations").delete().eq("id", org.id);
    return { error: branchErr?.message ?? "Failed to create branch." };
  }

  const { error: profileErr } = await admin.from("profiles").insert({
    id: user.id,
    organization_id: org.id,
    branch_id: branch.id,
    full_name: parsed.data.fullName,
    role: "owner",
    is_active: true,
  });
  if (profileErr) {
    await admin.from("branches").delete().eq("id", branch.id);
    await admin.from("organizations").delete().eq("id", org.id);
    return { error: profileErr.message };
  }

  // Seed minimal app_settings for the new org/branch.
  await admin.from("app_settings").insert({
    organization_id: org.id,
    branch_id: branch.id,
    shop_name: parsed.data.organizationName,
  });

  redirect("/dashboard");
}
