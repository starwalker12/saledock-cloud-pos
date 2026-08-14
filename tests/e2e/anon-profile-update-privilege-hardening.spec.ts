import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

test.describe.configure({ retries: 0 });

type LocalStatus = {
  API_URL: string;
  ANON_KEY?: string;
  PUBLISHABLE_KEY?: string;
  SERVICE_ROLE_KEY?: string;
  SECRET_KEY?: string;
};

const WORKTREE = process.cwd();
const ARTIFACT = "/tmp/anon-profile-update-privilege-hardening-fixed.json";
const SAFETY_TABLES = [
  "organizations",
  "branches",
  "profiles",
  "staff_permissions",
  "invoices",
  "payments",
  "customers",
  "customer_ledger_entries",
  "credit_payments",
  "customer_write_offs",
  "products",
  "stock_movements",
  "product_stock_lots",
  "suppliers",
  "supplier_purchases",
  "supplier_payments",
  "expenses",
  "cash_shifts",
] as const;

function localStatus(): LocalStatus {
  const raw = execFileSync(
    "supabase",
    ["status", "--workdir", WORKTREE, "--output", "json"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  return JSON.parse(raw.slice(raw.indexOf("{"))) as LocalStatus;
}

function localProjectId(): string {
  const config = readFileSync(join(WORKTREE, "supabase/config.toml"), "utf8");
  const match = config.match(/^project_id\s*=\s*"([^"]+)"/m);
  if (!match) throw new Error("local Supabase project_id is missing");
  return match[1];
}

function queryRows<T>(sql: string): T[] {
  const wrapped = `select coalesce(json_agg(row_to_json(q)), '[]'::json)::text from (${sql}) q`;
  const output = execFileSync(
    "docker",
    [
      "exec",
      `supabase_db_${localProjectId()}`,
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-At",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      wrapped,
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  return JSON.parse(output.trim()) as T[];
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function tableSignature(service: SupabaseClient, table: string) {
  const { data, error } = await service.from(table).select("*").order("id");
  if (error) throw new Error(`${table} safety signature failed: ${error.code}`);
  return { count: data?.length ?? 0, sha256: digest(data ?? []) };
}

async function safetySnapshot(service: SupabaseClient) {
  const tables = Object.fromEntries(
    await Promise.all(
      SAFETY_TABLES.map(async (table) => [table, await tableSignature(service, table)]),
    ),
  );
  const { data, error } = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new Error(`auth safety signature failed: ${error.message}`);
  const users = data.users
    .map((user) => ({ id: user.id, email: user.email }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return { ...tables, auth_users: { count: users.length, sha256: digest(users) } };
}

async function authenticatedClient(url: string, key: string, email: string, password: string) {
  const client = createClient(url, key, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`local sign-in failed: ${error.message}`);
  return client;
}

test("anon profile UPDATE is absent while authenticated and privileged flows remain intact", async () => {
  test.setTimeout(120_000);
  const status = localStatus();
  const anonKey = status.PUBLISHABLE_KEY ?? status.ANON_KEY;
  const serviceKey = status.SECRET_KEY ?? status.SERVICE_ROLE_KEY;
  if (!anonKey || !serviceKey) throw new Error("local Supabase keys are unavailable");
  expect(status.API_URL).toMatch(/^http:\/\/(?:127\.0\.0\.1|localhost):/);

  const service = createClient(status.API_URL, serviceKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
  const anon = createClient(status.API_URL, anonKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
  const opening = await safetySnapshot(service);
  const marker = `ANON-PROFILE-HARDENING-${Date.now()}-${randomUUID().slice(0, 6)}`;
  const password = `Local-${randomUUID()}-Aa1!`;
  const userIds: string[] = [];
  const organizationIds: string[] = [];
  const branchIds: string[] = [];
  const clients: SupabaseClient[] = [];
  const proof: Record<string, unknown> = { marker, environment: "isolated-loopback" };

  const privileges = queryRows<{
    privilege: string;
    anon_allowed: boolean;
    authenticated_allowed: boolean;
    service_allowed: boolean;
  }>(`
    select privilege,
      has_table_privilege('anon', 'public.profiles', privilege) as anon_allowed,
      has_table_privilege('authenticated', 'public.profiles', privilege) as authenticated_allowed,
      has_table_privilege('service_role', 'public.profiles', privilege) as service_allowed
    from unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) privilege
    order by privilege
  `);
  expect(privileges.find((entry) => entry.privilege === "UPDATE")).toEqual({
    privilege: "UPDATE",
    anon_allowed: false,
    authenticated_allowed: false,
    service_allowed: true,
  });
  for (const privilege of ["SELECT", "INSERT", "DELETE"]) {
    expect(privileges.find((entry) => entry.privilege === privilege)?.anon_allowed).toBe(true);
  }

  const columns = queryRows<{
    column_name: string;
    anon_update: boolean;
    authenticated_update: boolean;
    service_update: boolean;
  }>(`
    select column_name,
      has_column_privilege('anon', 'public.profiles', column_name, 'UPDATE') as anon_update,
      has_column_privilege('authenticated', 'public.profiles', column_name, 'UPDATE') as authenticated_update,
      has_column_privilege('service_role', 'public.profiles', column_name, 'UPDATE') as service_update
    from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
    order by ordinal_position
  `);
  expect(columns).toHaveLength(14);
  expect(columns.every((column) => !column.anon_update)).toBe(true);
  expect(columns.every((column) => column.service_update)).toBe(true);
  expect(
    columns.filter((column) => column.authenticated_update).map((column) => column.column_name),
  ).toEqual(["profile_picture_url"]);

  const rls = queryRows<{
    policyname: string;
    roles: string[];
    cmd: string;
    qual: string | null;
    with_check: string | null;
  }>(`
    select policyname, roles, cmd, qual, with_check
    from pg_policies
    where schemaname = 'public' and tablename = 'profiles'
    order by policyname
  `);
  expect(rls).toEqual([
    {
      policyname: "Profiles can read their own profile",
      roles: ["authenticated"],
      cmd: "SELECT",
      qual: "((id = auth.uid()) OR (organization_id = current_organization_id()))",
      with_check: null,
    },
    {
      policyname: "Profiles can update themselves",
      roles: ["authenticated"],
      cmd: "UPDATE",
      qual: "(id = auth.uid())",
      with_check: "(id = auth.uid())",
    },
  ]);

  const createOrganization = async (label: string) => {
    const { data: organization, error: organizationError } = await service
      .from("organizations")
      .insert({ name: `${marker} ${label}` })
      .select("id")
      .single();
    if (organizationError) throw new Error(`organization fixture failed: ${organizationError.code}`);
    organizationIds.push(organization.id);
    const { data: branch, error: branchError } = await service
      .from("branches")
      .insert({ organization_id: organization.id, name: `${marker} ${label} Branch` })
      .select("id")
      .single();
    if (branchError) throw new Error(`branch fixture failed: ${branchError.code}`);
    branchIds.push(branch.id);
    return { organizationId: organization.id as string, branchId: branch.id as string };
  };

  const createStaff = async (
    label: string,
    organizationId: string,
    branchId: string,
    role = "cashier",
  ) => {
    const email = `${marker.toLowerCase()}-${label.toLowerCase()}@example.invalid`;
    const { data: authData, error: authError } = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (authError || !authData.user) throw new Error(`auth fixture failed: ${authError?.message}`);
    userIds.push(authData.user.id);
    const { error: profileError } = await service.from("profiles").insert({
      id: authData.user.id,
      organization_id: organizationId,
      branch_id: branchId,
      full_name: `${marker} ${label}`,
      role,
      is_active: true,
      onboarding_completed: true,
    });
    if (profileError) throw new Error(`profile fixture failed: ${profileError.code}`);
    const client = await authenticatedClient(status.API_URL, anonKey, email, password);
    clients.push(client);
    return { id: authData.user.id, client };
  };

  const readProfile = async (id: string) => {
    const { data, error } = await service.from("profiles").select("*").eq("id", id).single();
    if (error) throw new Error(`profile read failed: ${error.code}`);
    return data;
  };

  const anonPatch = async (id: string, payload: Record<string, unknown>) => {
    const response = await fetch(`${status.API_URL}/rest/v1/profiles?id=eq.${id}&select=id`, {
      method: "PATCH",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(payload),
    });
    return { status: response.status, body: await response.json() as { code?: string } };
  };

  const authenticatedPatch = async (
    client: SupabaseClient,
    id: string,
    payload: Record<string, unknown>,
  ) => {
    const { data, error } = await client.from("profiles").update(payload).eq("id", id).select("id");
    return { rows: data?.length ?? 0, code: error?.code ?? null };
  };

  try {
    const organization = await createOrganization("Primary");
    const cashier = await createStaff(
      "Cashier",
      organization.organizationId,
      organization.branchId,
    );
    const target = await createStaff(
      "Target",
      organization.organizationId,
      organization.branchId,
    );
    const openingProfile = await readProfile(cashier.id);

    const anonCases = [
      { field: "role", payload: { role: "owner" } },
      { field: "organization_id", payload: { organization_id: randomUUID() } },
      { field: "branch_id", payload: { branch_id: randomUUID() } },
      { field: "is_active", payload: { is_active: false } },
      {
        field: "profile_picture_url",
        payload: { profile_picture_url: `/${marker}/anonymous.png` },
      },
      {
        field: "mixed",
        payload: { role: "owner", profile_picture_url: `/${marker}/mixed.png` },
      },
    ];
    const anonResults = [];
    for (const entry of anonCases) {
      const result = await anonPatch(cashier.id, entry.payload);
      expect([401, 403]).toContain(result.status);
      expect(result.body.code).toBe("42501");
      anonResults.push({ field: entry.field, status: result.status, code: result.body.code });
    }
    expect(await readProfile(cashier.id)).toEqual(openingProfile);

    const roleEscalation = await authenticatedPatch(cashier.client, cashier.id, { role: "owner" });
    expect(roleEscalation).toEqual({ rows: 0, code: "42501" });
    const mixed = await authenticatedPatch(cashier.client, cashier.id, {
      role: "owner",
      profile_picture_url: `/${marker}/authenticated-mixed.png`,
    });
    expect(mixed).toEqual({ rows: 0, code: "42501" });

    const picture = `/${marker}/profile.png`;
    const ownPicture = await authenticatedPatch(cashier.client, cashier.id, {
      profile_picture_url: picture,
    });
    expect(ownPicture).toEqual({ rows: 1, code: null });
    expect((await readProfile(cashier.id)).profile_picture_url).toBe(picture);
    const otherPicture = await authenticatedPatch(cashier.client, target.id, {
      profile_picture_url: `/${marker}/other.png`,
    });
    expect(otherPicture).toEqual({ rows: 0, code: null });
    expect((await readProfile(target.id)).profile_picture_url).toBeNull();

    const { error: permissionError } = await service.from("staff_permissions").insert({
      organization_id: organization.organizationId,
      profile_id: cashier.id,
      can_sell: true,
      can_discount: false,
    });
    expect(permissionError).toBeNull();
    const { data: permissionsBefore } = await service
      .from("staff_permissions")
      .select("*")
      .eq("profile_id", cashier.id)
      .single();

    const { error: privilegedUpdateError } = await service
      .from("profiles")
      .update({ role: "manager", is_active: false })
      .eq("id", target.id);
    expect(privilegedUpdateError).toBeNull();
    expect(await readProfile(target.id)).toMatchObject({ role: "manager", is_active: false });
    const { error: privilegedRestoreError } = await service
      .from("profiles")
      .update({ role: "cashier", is_active: true })
      .eq("id", target.id);
    expect(privilegedRestoreError).toBeNull();

    const { data: permissionsAfter } = await service
      .from("staff_permissions")
      .select("*")
      .eq("profile_id", cashier.id)
      .single();
    expect(permissionsAfter).toEqual(permissionsBefore);

    const invitee = await service.auth.admin.createUser({
      email: `${marker.toLowerCase()}-invitee@example.invalid`,
      password,
      email_confirm: true,
    });
    if (invitee.error || !invitee.data.user) throw new Error(`invitee failed: ${invitee.error?.message}`);
    userIds.push(invitee.data.user.id);
    const { error: inviteProfileError } = await service.from("profiles").insert({
      id: invitee.data.user.id,
      organization_id: organization.organizationId,
      branch_id: organization.branchId,
      full_name: `${marker} Invitee`,
      role: "technician",
      is_active: true,
      onboarding_completed: true,
    });
    expect(inviteProfileError).toBeNull();

    const onboardingAuth = await service.auth.admin.createUser({
      email: `${marker.toLowerCase()}-onboarding@example.invalid`,
      password,
      email_confirm: true,
    });
    if (onboardingAuth.error || !onboardingAuth.data.user) {
      throw new Error(`onboarding auth failed: ${onboardingAuth.error?.message}`);
    }
    userIds.push(onboardingAuth.data.user.id);
    const onboarding = await authenticatedClient(
      status.API_URL,
      anonKey,
      onboardingAuth.data.user.email!,
      password,
    );
    clients.push(onboarding);
    const { error: onboardingError } = await onboarding.rpc("complete_self_signup", {
      p_organization_name: `${marker} Onboarding Org`,
      p_branch_name: `${marker} Onboarding Branch`,
      p_full_name: `${marker} Owner`,
    });
    expect(onboardingError).toBeNull();
    const onboardedProfile = await readProfile(onboardingAuth.data.user.id);
    expect(onboardedProfile).toMatchObject({
      role: "owner",
      is_active: true,
      onboarding_completed: true,
    });
    organizationIds.push(onboardedProfile.organization_id as string);
    branchIds.push(onboardedProfile.branch_id as string);

    const { error: attachedOnboardingError } = await cashier.client.rpc("complete_self_signup", {
      p_organization_name: `${marker} Escalated Org`,
      p_branch_name: `${marker} Escalated Branch`,
      p_full_name: `${marker} Escalated Owner`,
    });
    expect(attachedOnboardingError).not.toBeNull();
    const { error: anonymousOnboardingError } = await anon.rpc("complete_self_signup", {
      p_organization_name: `${marker} Anonymous Org`,
      p_branch_name: `${marker} Anonymous Branch`,
      p_full_name: `${marker} Anonymous`,
    });
    expect(anonymousOnboardingError).not.toBeNull();

    const { data: sessionProfile, error: sessionProfileError } = await cashier.client
      .from("profiles")
      .select("role, organization_id, branch_id")
      .eq("id", cashier.id)
      .single();
    expect(sessionProfileError).toBeNull();
    expect(sessionProfile).toEqual({
      role: "cashier",
      organization_id: organization.organizationId,
      branch_id: organization.branchId,
    });

    proof.catalog = { privileges, columns };
    proof.rls = rls;
    proof.anonymous = { attempts: anonResults, mutation: false };
    proof.authenticated = {
      sign_in: "pass",
      protected_update: roleEscalation,
      mixed,
      own_picture: ownPicture,
      other_picture: otherPicture,
      session_profile_read: "pass",
    };
    proof.privileged = {
      service_role_profile_management: "pass",
      invite_profile_assignment: "pass",
      onboarding: "pass",
      attached_user_onboarding: "denied",
      anonymous_onboarding: "denied",
      staff_permissions_unchanged: true,
    };
  } finally {
    for (const client of clients) await client.auth.signOut();
    for (const userId of userIds) await service.auth.admin.deleteUser(userId);
    if (branchIds.length) await service.from("branches").delete().in("id", [...new Set(branchIds)]);
    if (organizationIds.length) {
      await service.from("organizations").delete().in("id", [...new Set(organizationIds)]);
    }
  }

  const closing = await safetySnapshot(service);
  proof.cleanup = { signatures_equal: digest(opening) === digest(closing), opening, closing };
  expect(closing).toEqual(opening);
  writeFileSync(ARTIFACT, JSON.stringify(proof, null, 2));
});
