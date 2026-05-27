import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";

export type PlatformAdmin = {
  id: string;
  user_id: string | null;
  email: string | null;
  display_name: string | null;
  role: "developer" | "support" | "read_only";
  is_active: boolean;
};

/**
 * Returns the current user's platform admin record, or null if they are
 * not a registered admin (or not signed in).
 *
 * Also checks the PLATFORM_ADMIN_EMAILS env var as a fallback — any signed-in
 * user whose email appears in that comma-separated list is treated as an
 * admin without needing a DB row.
 */
export async function getPlatformAdmin(): Promise<PlatformAdmin | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;

  // 1. Check DB
  const { data: rows } = await supabase
    .from("platform_admins")
    .select("id, user_id, email, display_name, role, is_active")
    .or(`user_id.eq.${user.id},email.eq.${user.email}`)
    .limit(1);
  const dbAdmin = rows?.[0];
  if (dbAdmin && dbAdmin.is_active) {
    return dbAdmin as PlatformAdmin;
  }

  // 2. Fallback: PLATFORM_ADMIN_EMAILS env var
  const adminEmails = env.PLATFORM_ADMIN_EMAILS;
  if (adminEmails) {
    const emails = adminEmails
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    if (emails.includes(user.email.toLowerCase())) {
      return {
        id: "env-fallback",
        user_id: user.id,
        email: user.email,
        display_name: user.email.split("@")[0],
        role: "developer",
        is_active: true,
      };
    }
  }

  return null;
}

/**
 * Like getPlatformAdmin but raises a redirect if not an admin.
 * Use in server components / layouts.
 */
export async function requirePlatformAdmin(): Promise<PlatformAdmin> {
  const admin = await getPlatformAdmin();
  if (!admin) {
    const { redirect } = await import("next/navigation");
    redirect("/login?next=%2Fplatform");
  }
  return admin!;
}

/**
 * Simple boolean check — useful for sidebar visibility.
 */
export async function isPlatformAdmin(): Promise<boolean> {
  const admin = await getPlatformAdmin();
  return admin !== null;
}

/**
 * Read platform_settings by key. Uses admin client directly — no admin
 * session required. Safe for use in login pages & public contexts.
 */
export async function getPlatformSetting(key: string): Promise<unknown> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("platform_settings")
    .select("value")
    .eq("key", key)
    .single();
  return data?.value ?? null;
}

/**
 * Same as getPlatformSetting but uses the admin (service-role) client so it
 * works even when no user session exists. Use in server components rendered
 * before authentication (e.g. the login page).
 */
export async function getPublicPlatformSetting(key: string): Promise<unknown> {
  const supabase = await createAdminClient();
  const { data } = await supabase
    .from("platform_settings")
    .select("value")
    .eq("key", key)
    .single();
  return data?.value ?? null;
}

/**
 * Read multiple settings at once using the admin client. Returns a map.
 */
export async function getPublicPlatformSettings(
  keys: string[],
): Promise<Record<string, unknown>> {
  const supabase = await createAdminClient();
  const { data: rows } = await supabase
    .from("platform_settings")
    .select("key, value")
    .in("key", keys);
  const map: Record<string, unknown> = {};
  if (rows) {
    for (const row of rows) {
      map[row.key] = row.value;
    }
  }
  return map;
}

/**
 * Update a platform setting. Requires platform admin + uses admin client.
 */
export async function setPlatformSetting(
  key: string,
  value: unknown,
  description?: string,
): Promise<void> {
  const admin = await requirePlatformAdmin();
  const supabase = await createAdminClient();

  const { data: old } = await supabase
    .from("platform_settings")
    .select("value")
    .eq("key", key)
    .single();

  await supabase.from("platform_settings").upsert(
    {
      key,
      value: JSON.parse(JSON.stringify(value)),
      description: description ?? null,
      updated_by: admin.user_id ?? undefined,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );

  await supabase.from("audit_logs").insert({
    organization_id: null,
    actor_id: admin.user_id,
    action: "platform.settings.updated",
    metadata: {
      key,
      old_value: old?.value ?? null,
      new_value: value,
    },
  });
}
