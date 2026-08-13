import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260813225513_contain_profile_self_updates.sql",
    import.meta.url,
  ),
  "utf8",
);
const settingsActions = readFileSync(
  new URL("../src/app/settings/actions.ts", import.meta.url),
  "utf8",
);
const userActions = readFileSync(
  new URL("../src/app/users/actions.ts", import.meta.url),
  "utf8",
);
const inviteActions = readFileSync(
  new URL("../src/app/users/invite-actions.ts", import.meta.url),
  "utf8",
);
const onboardingActions = readFileSync(
  new URL("../src/app/onboarding/actions.ts", import.meta.url),
  "utf8",
);
const onboardingMigration = readFileSync(
  new URL(
    "../supabase/migrations/0023_fix_complete_self_signup_ambiguity.sql",
    import.meta.url,
  ),
  "utf8",
);
const initialSchema = readFileSync(
  new URL("../supabase/migrations/0001_initial_schema.sql", import.meta.url),
  "utf8",
);
const e2e = readFileSync(
  new URL("./e2e/profile-self-update-authorization.spec.ts", import.meta.url),
  "utf8",
);

function sourceFiles(path) {
  const files = [];
  for (const name of readdirSync(path)) {
    const child = join(path, name);
    if (statSync(child).isDirectory()) files.push(...sourceFiles(child));
    else if (/\.(?:ts|tsx)$/.test(name)) files.push(child);
  }
  return files;
}

test("migration removes table-wide authenticated UPDATE and grants only profile picture UPDATE", () => {
  assert.match(
    migration,
    /if not has_table_privilege\('authenticated', 'public\.profiles', 'update'\) then/,
  );
  assert.match(
    migration,
    /revoke update on table public\.profiles from authenticated;/,
  );
  assert.match(
    migration,
    /grant update \(profile_picture_url\) on table public\.profiles to authenticated;/,
  );
  assert.equal((migration.match(/grant update/gi) ?? []).length, 1);
  assert.doesNotMatch(
    migration,
    /grant update \([^)]*(?:role|organization_id|branch_id|is_active|full_name|phone|avatar_url|onboarding_completed|last_login_at|username|created_at|updated_at|id)[^)]*\)/i,
  );
  assert.match(
    migration,
    /if has_table_privilege\('authenticated', 'public\.profiles', 'update'\) then/,
  );
  assert.match(
    migration,
    /column_name <> 'profile_picture_url'[\s\S]*?has_column_privilege\([\s\S]*?'authenticated',[\s\S]*?'public\.profiles',[\s\S]*?column_name,[\s\S]*?'update'/,
  );
  assert.doesNotMatch(migration, /alter policy|create policy|drop policy|security definer/i);
});

test("the direct signed-in Settings writer remains profile-picture-only", () => {
  const start = settingsActions.indexOf("export async function updateProfilePictureAction");
  assert.notEqual(start, -1);
  const source = settingsActions.slice(start);
  assert.match(
    source,
    /\.from\("profiles"\)[\s\S]*?\.update\(\{ profile_picture_url: url \|\| null \}\)[\s\S]*?\.eq\("id", user\.id\)/,
  );
  assert.doesNotMatch(
    source,
    /\.update\(\{[^}]*\b(?:role|organization_id|branch_id|is_active|full_name|phone|avatar_url|onboarding_completed|last_login_at|username)\b/s,
  );
});

test("all application profile update callers retain their intended privilege boundary", () => {
  const src = new URL("../src", import.meta.url).pathname;
  const writers = sourceFiles(src)
    .filter((file) => /\.from\("profiles"\)[\s\S]{0,180}?\.update\(/.test(readFileSync(file, "utf8")))
    .map((file) => relative(src, file))
    .sort();
  assert.deepEqual(writers, [
    "app/settings/actions.ts",
    "app/users/actions.ts",
    "app/users/invite-actions.ts",
  ]);
  assert.match(userActions, /const admin = createAdminClient\(\);/);
  assert.match(inviteActions, /const admin = createAdminClient\(\);/);
});

test("owner/admin user management safety and service-role writes are preserved", () => {
  assert.match(userActions, /if \(!canManageUsers\(context\.profile\.role\)\)/);
  assert.match(
    userActions,
    /parsed\.data\.profileId === profile\.id && parsed\.data\.role !== profile\.role/,
  );
  assert.match(userActions, /users\.self_role_change_blocked/);
  assert.match(userActions, /users\.self_deactivate_blocked/);
  assert.match(userActions, /At least one active owner or admin must remain\./);
  assert.match(userActions, /users\.last_privilege_role_change_blocked/);
  assert.match(userActions, /users\.last_privilege_deactivate_blocked/);
  assert.match(
    userActions,
    /\.update\(\{[\s\S]*?full_name: parsed\.data\.fullName,[\s\S]*?role: parsed\.data\.role,[\s\S]*?branch_id: parsed\.data\.branchId,[\s\S]*?\}\)[\s\S]*?\.eq\("organization_id", organizationId\)[\s\S]*?\.eq\("id", parsed\.data\.profileId\)/,
  );
  assert.match(
    userActions,
    /\.update\(\{ is_active: false \}\)[\s\S]*?\.eq\("organization_id", organizationId\)/,
  );
  assert.match(
    userActions,
    /\.update\(\{ is_active: true \}\)[\s\S]*?\.eq\("organization_id", organizationId\)/,
  );
});

test("invite acceptance keeps profile assignment and permissions on the admin path", () => {
  assert.match(
    inviteActions,
    /const profilePayload = \{[\s\S]*?organization_id: invite\.organization_id,[\s\S]*?branch_id: invite\.branch_id,[\s\S]*?full_name: invite\.full_name,[\s\S]*?role: invite\.role,[\s\S]*?is_active: true,[\s\S]*?onboarding_completed: true/,
  );
  assert.match(
    inviteActions,
    /admin\.from\("profiles"\)\.update\(profilePayload\)\.eq\("id", authUserId\)/,
  );
  assert.match(
    inviteActions,
    /admin\.from\("staff_permissions"\)\.upsert\(/,
  );
});

test("self-signup remains an authenticated SECURITY DEFINER assignment with explicit guards", () => {
  assert.match(onboardingActions, /supabase\.rpc\("complete_self_signup"/);
  assert.match(onboardingMigration, /security definer/);
  assert.match(onboardingMigration, /v_user_id uuid := auth\.uid\(\);/);
  assert.match(onboardingMigration, /if v_user_id is null then/);
  assert.match(onboardingMigration, /if v_existing_org_id is not null then/);
  assert.match(
    onboardingMigration,
    /insert into public\.profiles \([\s\S]*?organization_id, branch_id, full_name, role, is_active,[\s\S]*?onboarding_completed, profile_picture_url/,
  );
  assert.match(onboardingMigration, /grant execute on function public\.complete_self_signup\([\s\S]*?\) to authenticated;/);
});

test("RLS ownership and the direct Data API matrix remain explicit", () => {
  assert.match(
    initialSchema,
    /create policy "Profiles can update themselves"[\s\S]*?to authenticated[\s\S]*?using \(id = auth\.uid\(\)\)[\s\S]*?with check \(id = auth\.uid\(\)\)/,
  );
  for (const field of [
    "id",
    "organization_id",
    "branch_id",
    "full_name",
    "role",
    "is_active",
    "last_login_at",
    "created_at",
    "updated_at",
    "avatar_url",
    "phone",
    "onboarding_completed",
    "username",
  ]) {
    assert.match(e2e, new RegExp(`field: "${field}"`));
  }
  assert.match(e2e, /field: "profile_picture_url"/);
  assert.match(e2e, /const WORKTREE = process\.cwd\(\);/);
  assert.match(e2e, /test\.describe\.configure\(\{ retries: 0 \}\)/);
  assert.doesNotMatch(e2e, /https:\/\/(?!127\.0\.0\.1|localhost)/);
});
