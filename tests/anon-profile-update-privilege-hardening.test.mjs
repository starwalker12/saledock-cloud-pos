import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const migration = read(
  "../supabase/migrations/20260814002317_revoke_anon_profile_update.sql",
);
const authenticatedContainment = read(
  "../supabase/migrations/20260813225513_contain_profile_self_updates.sql",
);
const initialSchema = read("../supabase/migrations/0001_initial_schema.sql");
const authActions = read("../src/app/(auth)/actions.ts");
const authCallback = read("../src/app/auth/callback/route.ts");
const onboardingActions = read("../src/app/onboarding/actions.ts");
const onboardingMigration = read(
  "../supabase/migrations/0023_fix_complete_self_signup_ambiguity.sql",
);
const inviteActions = read("../src/app/users/invite-actions.ts");
const userActions = read("../src/app/users/actions.ts");
const setupActions = read("../src/app/setup/actions.ts");
const settingsActions = read("../src/app/settings/actions.ts");
const e2e = read("./e2e/anon-profile-update-privilege-hardening.spec.ts");
const migrationSql = migration.replace(/^--.*$/gm, "");

test("migration fails closed around the expected anon UPDATE grant", () => {
  assert.match(
    migration,
    /if not has_table_privilege\('anon', 'public\.profiles', 'update'\) then/,
  );
  assert.match(
    migration,
    /not has_column_privilege\([\s\S]*?'anon',[\s\S]*?'public\.profiles',[\s\S]*?column_name,[\s\S]*?'update'/,
  );
  assert.match(
    migration,
    /revoke update on table public\.profiles from anon;/,
  );
  assert.equal(
    (migration.match(/revoke update on table public\.profiles from anon;/gi) ?? []).length,
    1,
  );
  assert.match(
    migration,
    /if has_table_privilege\('anon', 'public\.profiles', 'update'\) then/,
  );
  assert.match(
    migration,
    /and has_column_privilege\([\s\S]*?'anon',[\s\S]*?'public\.profiles',[\s\S]*?column_name,[\s\S]*?'update'/,
  );
});

test("migration preserves authenticated containment and service-role management", () => {
  assert.match(
    migration,
    /if has_table_privilege\('authenticated', 'public\.profiles', 'update'\) then/,
  );
  assert.match(
    migration,
    /not has_column_privilege\([\s\S]*?'authenticated',[\s\S]*?'profile_picture_url',[\s\S]*?'update'/,
  );
  assert.match(
    migration,
    /column_name <> 'profile_picture_url'[\s\S]*?has_column_privilege\([\s\S]*?'authenticated'/,
  );
  assert.match(
    migration,
    /not has_table_privilege\('service_role', 'public\.profiles', 'update'\)/,
  );
  assert.doesNotMatch(migrationSql, /\bgrant\s+/i);
  assert.doesNotMatch(
    migration,
    /alter policy|create policy|drop policy|alter default privileges|enable row level security|disable row level security/i,
  );
  assert.match(
    authenticatedContainment,
    /grant update \(profile_picture_url\) on table public\.profiles to authenticated;/,
  );
});

test("repository history contains no explicit anon profiles UPDATE grant", () => {
  const migrationDirectory = new URL("../supabase/migrations/", import.meta.url);
  const historicalSql = readdirSync(migrationDirectory)
    .filter((name) => name.endsWith(".sql") && !name.includes("revoke_anon_profile_update"))
    .map((name) => read(`../supabase/migrations/${name}`))
    .join("\n");

  assert.match(initialSchema, /create table public\.profiles \(/);
  assert.doesNotMatch(
    historicalSql,
    /grant\s+update(?:\s*\([^)]*\))?\s+on(?:\s+table)?\s+public\.profiles\s+to\s+anon/i,
  );
  assert.doesNotMatch(
    historicalSql,
    /grant\s+all(?:\s+privileges)?\s+on(?:\s+table)?\s+public\.profiles\s+to\s+anon/i,
  );
  assert.doesNotMatch(historicalSql, /alter default privileges/i);
});

test("legitimate profile writers remain authenticated or privileged", () => {
  const signupStart = authActions.indexOf("export async function signUpAction");
  const signupEnd = authActions.indexOf("export async function requestLoginOtpAction");
  assert.notEqual(signupStart, -1);
  assert.ok(signupEnd > signupStart);
  const signup = authActions.slice(signupStart, signupEnd);
  assert.match(signup, /supabase\.auth\.signUp\(/);
  assert.doesNotMatch(signup, /\.from\("profiles"\)[\s\S]*?\.(?:insert|update|upsert)\(/);

  assert.match(authCallback, /supabase\.auth\.exchangeCodeForSession\(code\)/);
  assert.doesNotMatch(
    authCallback,
    /\.from\("profiles"\)[\s\S]{0,200}?\.(?:insert|update|upsert)\(/,
  );
  assert.match(onboardingActions, /const \{ user \} = await getCurrentContext\(\);/);
  assert.match(onboardingActions, /supabase\.rpc\("complete_self_signup"/);
  assert.match(onboardingMigration, /v_user_id uuid := auth\.uid\(\);/);
  assert.match(onboardingMigration, /if v_user_id is null then/);
  assert.match(
    onboardingMigration,
    /grant execute on function public\.complete_self_signup\([\s\S]*?\) to authenticated;/,
  );

  assert.match(inviteActions, /const admin = createAdminClient\(\);/);
  assert.match(
    inviteActions,
    /admin\.from\("profiles"\)\.update\(profilePayload\)\.eq\("id", authUserId\)/,
  );
  assert.match(userActions, /const admin = createAdminClient\(\);/);
  assert.match(setupActions, /const admin = createAdminClient\(\);/);
  assert.match(
    settingsActions,
    /\.from\("profiles"\)[\s\S]*?\.update\(\{ profile_picture_url: url \|\| null \}\)[\s\S]*?\.eq\("id", user\.id\)/,
  );
});

test("focused E2E proves real catalog, Data API, RLS, and cleanup behavior", () => {
  assert.match(e2e, /test\.describe\.configure\(\{ retries: 0 \}\)/);
  assert.match(e2e, /has_table_privilege/);
  assert.match(e2e, /has_column_privilege/);
  assert.match(e2e, /information_schema\.columns/);
  assert.match(e2e, /pg_policies/);
  assert.match(e2e, /method: "PATCH"/);
  assert.match(e2e, /field: "profile_picture_url"/);
  assert.match(e2e, /field: "mixed"/);
  assert.match(e2e, /expect\(closing\)\.toEqual\(opening\)/);
  assert.doesNotMatch(e2e, /https:\/\/(?!127\.0\.0\.1|localhost)/);
});
