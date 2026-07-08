import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { PostgrestClient } from "@supabase/postgrest-js";
import { expect, type Page } from "@playwright/test";

type LocalStatus = {
  API_URL?: string;
  apiUrl?: string;
  api_url?: string;
  ANON_KEY?: string;
  anonKey?: string;
  anon_key?: string;
  SERVICE_ROLE_KEY?: string;
  serviceRoleKey?: string;
  service_role_key?: string;
};

let localAdmin: PostgrestClient | null = null;

function isLocalUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "::1"].includes(url.hostname)
    );
  } catch {
    return false;
  }
}

export function isLocalPlaywrightRun(): boolean {
  return isLocalUrl(process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000");
}

function readLocalStatus(): LocalStatus {
  const output = execFileSync("supabase", ["status", "--output", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const jsonStart = output.indexOf("{");
  if (jsonStart < 0) throw new Error("Local Supabase status did not return JSON.");
  return JSON.parse(output.slice(jsonStart)) as LocalStatus;
}

export function getLocalAdminClient(): PostgrestClient {
  if (localAdmin) return localAdmin;
  if (!isLocalPlaywrightRun()) {
    throw new Error("Local QA database access is blocked for non-local app URLs.");
  }

  const status = readLocalStatus();
  const url = status.API_URL ?? status.apiUrl ?? status.api_url ?? "";
  const serviceKey =
    status.SERVICE_ROLE_KEY ??
    status.serviceRoleKey ??
    status.service_role_key ??
    "";

  if (!isLocalUrl(url) || !serviceKey) {
    throw new Error("A running local Supabase instance is required for this QA test.");
  }

  localAdmin = new PostgrestClient(`${url}/rest/v1`, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
  });
  return localAdmin;
}

export const LOCAL_QA_ORG_ID = "00000000-0000-4000-8000-000000000001";
export const SEEDED_PHYSICAL_PRODUCT_ID = "00000000-0000-4000-8000-000000003001";

const SUPABASE_COOKIE_CHUNK_SIZE = 3180;

function chunkCookieValue(key: string, value: string) {
  if (value.length <= SUPABASE_COOKIE_CHUNK_SIZE) {
    return [{ name: key, value }];
  }
  const chunks: Array<{ name: string; value: string }> = [];
  for (let i = 0; i < value.length; i += SUPABASE_COOKIE_CHUNK_SIZE) {
    chunks.push({
      name: `${key}.${chunks.length}`,
      value: value.slice(i, i + SUPABASE_COOKIE_CHUNK_SIZE),
    });
  }
  return chunks;
}

/**
 * Bypass the UI login and cookie callback for local QA by creating a session
 * against the local Supabase auth server and injecting the auth-token cookie.
 * This is necessary because the browser UI login sometimes redirects to
 * /onboarding in this local environment even when onboarding is marked complete.
 */
export async function loginLocalOwnerDirectly(
  page: Page,
  email = "owner@saledock.local",
  password = "Password123!",
): Promise<void> {
  if (!isLocalPlaywrightRun()) {
    throw new Error("Direct local login is only allowed for local Playwright runs.");
  }

  const status = readLocalStatus();
  const supabaseUrl = status.API_URL ?? status.apiUrl ?? status.api_url ?? "";
  const anonKey = status.ANON_KEY ?? status.anonKey ?? status.anon_key ?? "";
  const appUrl = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";

  if (!isLocalUrl(supabaseUrl) || !isLocalUrl(appUrl) || !anonKey) {
    throw new Error("A running local Supabase instance is required for direct local login.");
  }

  const supabase = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    throw new Error(`Direct local login failed: ${error?.message ?? "no session"}`);
  }

  const storageKey = `sb-${new URL(supabaseUrl).hostname.split(".")[0]}-auth-token`;
  const cookieValue = "base64-" + Buffer.from(JSON.stringify(data.session), "utf8").toString("base64url");

  await page.context().clearCookies();
  await page.context().addCookies(
    chunkCookieValue(storageKey, cookieValue).map((cookie) => ({
      ...cookie,
      url: appUrl,
      sameSite: "Lax" as const,
      httpOnly: false,
      secure: false,
    })),
  );

  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard(?:\?|$)/, { timeout: 20_000 });
}
