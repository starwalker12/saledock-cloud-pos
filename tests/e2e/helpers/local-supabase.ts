import { execFileSync } from "node:child_process";
import { PostgrestClient } from "@supabase/postgrest-js";

type LocalStatus = {
  API_URL?: string;
  apiUrl?: string;
  api_url?: string;
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
