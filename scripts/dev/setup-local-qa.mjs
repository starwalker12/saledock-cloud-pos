#!/usr/bin/env node
// LOCAL/DEV ONLY — Creates fake QA users for local Supabase end-to-end testing.
//
// Usage:
//   1. Start local Supabase: supabase start
//   2. Reset + seed: supabase db reset
//   3. Run this script: node scripts/dev/setup-local-qa.mjs
//   4. Copy the printed .env.local snippet into .env.local (gitignored, never commit)
//   5. Start app: npm run dev (or build + start)
//   6. Log in with one of the fake accounts below.
//
// Safety guard: this script refuses to run unless the Supabase URL is localhost
// or 127.0.0.1. It reads the local service-role key from `supabase status`.
// Do NOT run this against production.

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

const QA_USERS = [
  {
    email: "owner@saledock.local",
    password: "Password123!",
    fullName: "Demo Owner",
    username: "demo-owner",
    role: "owner",
  },
  {
    email: "admin@saledock.local",
    password: "Password123!",
    fullName: "Demo Admin",
    username: "demo-admin",
    role: "admin",
  },
  {
    email: "manager@saledock.local",
    password: "Password123!",
    fullName: "Demo Manager",
    username: "demo-manager",
    role: "manager",
  },
  {
    email: "cashier@saledock.local",
    password: "Password123!",
    fullName: "Demo Cashier",
    username: "demo-cashier",
    role: "cashier",
  },
  {
    email: "technician@saledock.local",
    password: "Password123!",
    fullName: "Demo Technician",
    username: "demo-technician",
    role: "technician",
  },
];

const ORG_ID = "00000000-0000-4000-8000-000000000001";
const BRANCH_ID = "00000000-0000-4000-8000-000000000101";

function isLocalUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" && LOCAL_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

async function getLocalSupabaseStatus() {
  const { execFileSync } = await import("node:child_process");
  try {
    const output = execFileSync("supabase", ["status", "--output", "json"], { encoding: "utf-8" });
    // The CLI may print non-JSON log lines before the JSON; find the first '{'.
    const jsonStart = output.indexOf("{");
    if (jsonStart === -1) return null;
    return JSON.parse(output.slice(jsonStart));
  } catch {
    return null;
  }
}

async function ensureUser({ url, serviceKey, email, password, fullName, username, role }) {
  // Create or update user via Auth Admin API.
  const createRes = await fetch(`${url}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
      app_metadata: { provider: "email", providers: ["email"] },
    }),
  });

  let userId;
  if (createRes.ok) {
    const data = await createRes.json();
    userId = data.id;
    console.log(`  Created ${role}: ${email}`);
  } else {
    const err = await createRes.json().catch(() => ({}));
    if (err.error_code === "email_exists" || err.message?.toLowerCase().includes("already")) {
      const listRes = await fetch(`${url}/auth/v1/admin/users?email=${encodeURIComponent(email)}`, {
        method: "GET",
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
      });
      if (listRes.ok) {
        const data = await listRes.json();
        const user = data.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
        if (user) {
          userId = user.id;
          const updateRes = await fetch(`${url}/auth/v1/admin/users/${userId}`, {
            method: "PUT",
            headers: {
              apikey: serviceKey,
              Authorization: `Bearer ${serviceKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ password, email_confirm: true }),
          });
          if (!updateRes.ok) {
            const updateErr = await updateRes.json().catch(() => ({}));
            console.warn(`  Could not update password for ${email}:`, updateErr.message || updateRes.statusText);
          }
          console.log(`  Updated ${role}: ${email}`);
        }
      }
    }
  }

  if (!userId) {
    throw new Error(`Failed to create or find auth user for ${email}`);
  }

  // Mark the seeded organization as onboarding-completed so QA users skip onboarding.
  const orgSql = `
    update public.organizations
    set onboarding_completed = true,
        updated_at = now()
    where id = '${ORG_ID}';
  `;

  const profileSql = `
    insert into public.profiles (id, full_name, username, role, organization_id, branch_id, onboarding_completed)
    values ('${userId}', '${fullName}', '${username}', '${role}', '${ORG_ID}', '${BRANCH_ID}', true)
    on conflict (id) do update set
      full_name = excluded.full_name,
      username = excluded.username,
      role = excluded.role,
      organization_id = excluded.organization_id,
      branch_id = excluded.branch_id,
      onboarding_completed = excluded.onboarding_completed,
      updated_at = now();
  `;

  const { execFileSync } = await import("node:child_process");
  const orgResult = execFileSync("supabase", ["db", "query", "--local", orgSql], { encoding: "utf-8" });
  if (orgResult.includes("ERROR") || orgResult.includes("failed")) {
    throw new Error(`Organization onboarding update failed: ${orgResult}`);
  }
  const result = execFileSync("supabase", ["db", "query", "--local", profileSql], { encoding: "utf-8" });
  if (result.includes("ERROR") || result.includes("failed")) {
    throw new Error(`Profile upsert failed for ${email}: ${result}`);
  }
  console.log(`  Linked ${role} profile to the local Gadget Zone shop`);

  return userId;
}

async function main() {
  console.log("\n== SaleDock local QA setup ==");
  console.log("This script only works against a local Supabase instance.\n");

  const status = await getLocalSupabaseStatus();
  if (!status) {
    console.error("Could not read local Supabase status. Is 'supabase start' running?");
    process.exit(1);
  }

  const url = status.API_URL || status.apiUrl || "http://127.0.0.1:54321";
  const serviceKey = status.SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = status.PUBLISHABLE_KEY || status.ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!isLocalUrl(url)) {
    console.error(`Refusing to run against non-local Supabase URL: ${url}`);
    process.exit(1);
  }

  if (!serviceKey) {
    console.error("Could not determine local service-role key. Set SUPABASE_SERVICE_ROLE_KEY or ensure 'supabase status' exposes it.");
    process.exit(1);
  }

  const health = await fetch(`${url}/auth/v1/health`).catch(() => null);
  if (!health?.ok) {
    console.warn("Could not reach local Auth API. Continuing anyway...");
  }

  console.log(`Target: ${url}`);
  console.log("Ensuring QA users...\n");

  for (const user of QA_USERS) {
    await ensureUser({ url, serviceKey, ...user });
  }

  console.log("\n== Done ==");
  console.log("Local QA accounts (fake, dev-only):");
  for (const user of QA_USERS) {
    console.log(`  ${user.role}: ${user.email} / ${user.password}`);
  }

  console.log("\nLocal keys were intentionally not printed.");
  console.log("Keep local Supabase values in the gitignored .env.local file only.");
  if (!anonKey) {
    console.log("Local publishable key was not detected; check `supabase status` before starting the app.");
  }
  console.log("Leave RECAPTCHA_SECRET_KEY unset so local dev mode skips Google verification.");
  console.log("Start the app with: npm run dev");
  console.log("\nStart the app and log in through the real browser login page.\n");
}

main().catch((err) => {
  console.error("\nSetup failed:", err.message);
  process.exit(1);
});
