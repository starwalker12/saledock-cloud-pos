import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

test.describe.configure({ retries: 0 });

type Profile = {
  id: string;
  organization_id: string | null;
  branch_id: string | null;
  full_name: string;
  role: string;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
  avatar_url: string | null;
  phone: string | null;
  onboarding_completed: boolean;
  username: string | null;
  profile_picture_url: string | null;
};

const WORKTREE = process.cwd();
const ARTIFACT = "/tmp/profile-self-update-authorization-fixed.json";
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

function localStatus() {
  const raw = execFileSync("supabase", ["status", "--output", "json"], {
    cwd: WORKTREE,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return JSON.parse(raw.slice(raw.indexOf("{"))) as {
    API_URL: string;
    ANON_KEY: string;
    SERVICE_ROLE_KEY: string;
  };
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

test("authenticated profile writes are column-contained while privileged assignment flows remain intact", async () => {
  test.setTimeout(120_000);
  const status = localStatus();
  expect(status.API_URL).toMatch(/^http:\/\/(?:127\.0\.0\.1|localhost):/);

  const service = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
  const anon = createClient(status.API_URL, status.ANON_KEY, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
  const opening = await safetySnapshot(service);
  const marker = `PROFILE-CONTAINMENT-${Date.now()}-${randomUUID().slice(0, 6)}`;
  const password = `Local-${randomUUID()}-Aa1!`;
  const userIds: string[] = [];
  const organizationIds: string[] = [];
  const branchIds: string[] = [];
  const clients: SupabaseClient[] = [];
  const proof: Record<string, unknown> = { marker, environment: "loopback" };

  const createOrg = async (label: string) => {
    const { data: org, error: orgError } = await service
      .from("organizations")
      .insert({ name: `${marker} ${label}` })
      .select("id")
      .single();
    if (orgError) throw new Error(`organization fixture failed: ${orgError.code}`);
    organizationIds.push(org.id);
    const { data: branch, error: branchError } = await service
      .from("branches")
      .insert({ organization_id: org.id, name: `${marker} ${label} Branch` })
      .select("id")
      .single();
    if (branchError) throw new Error(`branch fixture failed: ${branchError.code}`);
    branchIds.push(branch.id);
    return { organizationId: org.id as string, branchId: branch.id as string };
  };

  const createStaff = async (
    label: string,
    role: "owner" | "admin" | "manager" | "cashier" | "technician",
    organizationId: string,
    branchId: string,
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
    const client = await authenticatedClient(status.API_URL, status.ANON_KEY, email, password);
    clients.push(client);
    return { id: authData.user.id, email, client };
  };

  const readProfile = async (id: string): Promise<Profile> => {
    const { data, error } = await service.from("profiles").select("*").eq("id", id).single();
    if (error) throw new Error(`profile read failed: ${error.code}`);
    return data as Profile;
  };

  const directPatch = async (client: SupabaseClient, id: string, payload: Record<string, unknown>) => {
    const { data, error } = await client.from("profiles").update(payload).eq("id", id).select("id");
    return {
      ok: !error,
      rows: data?.length ?? 0,
      code: error?.code ?? null,
      message: error?.message ?? null,
    };
  };

  try {
    const orgA = await createOrg("Org A");
    const orgB = await createOrg("Org B");
    const { data: secondaryBranch, error: secondaryBranchError } = await service
      .from("branches")
      .insert({
        organization_id: orgA.organizationId,
        name: `${marker} Org A Secondary Branch`,
      })
      .select("id")
      .single();
    if (secondaryBranchError) {
      throw new Error(`secondary branch fixture failed: ${secondaryBranchError.code}`);
    }
    branchIds.push(secondaryBranch.id);
    const cashier = await createStaff("Cashier", "cashier", orgA.organizationId, orgA.branchId);
    const manager = await createStaff("Manager", "manager", orgA.organizationId, orgA.branchId);
    const technician = await createStaff("Technician", "technician", orgA.organizationId, orgA.branchId);
    const target = await createStaff("Target", "cashier", orgA.organizationId, orgA.branchId);

    const { error: permissionError } = await service.from("staff_permissions").insert({
      organization_id: orgA.organizationId,
      profile_id: cashier.id,
      can_sell: true,
      can_discount: false,
    });
    if (permissionError) throw new Error(`permissions fixture failed: ${permissionError.code}`);
    const { data: permissionsBefore } = await service
      .from("staff_permissions")
      .select("*")
      .eq("profile_id", cashier.id)
      .single();

    const cashierOpening = await readProfile(cashier.id);
    const protectedCases = [
      { field: "id", value: randomUUID() },
      { field: "organization_id", value: orgB.organizationId },
      { field: "branch_id", value: orgB.branchId },
      { field: "full_name", value: `${marker} Escalated` },
      { field: "role", value: "owner" },
      { field: "is_active", value: false },
      { field: "last_login_at", value: "2030-01-01T00:00:00.000Z" },
      { field: "created_at", value: "2030-01-01T00:00:00.000Z" },
      { field: "updated_at", value: "2030-01-01T00:00:00.000Z" },
      { field: "avatar_url", value: `/${marker}/avatar.png` },
      { field: "phone", value: `+923${String(Date.now()).slice(-9)}` },
      { field: "onboarding_completed", value: false },
      { field: "username", value: `${marker.toLowerCase()}-username` },
    ] as const;

    const protectedResults = [];
    for (const entry of protectedCases) {
      const result = await directPatch(cashier.client, cashier.id, { [entry.field]: entry.value });
      expect(result.ok, entry.field).toBe(false);
      expect(result.code, entry.field).toBe("42501");
      protectedResults.push({ field: entry.field, code: result.code, persisted: false });
    }
    expect(await readProfile(cashier.id)).toEqual(cashierOpening);

    const roleAttempts = [];
    for (const staff of [manager, technician, cashier]) {
      const result = await directPatch(staff.client, staff.id, { role: "owner" });
      expect(result.ok).toBe(false);
      expect(result.code).toBe("42501");
      roleAttempts.push({ id: staff.id, code: result.code });
    }

    await service.from("profiles").update({ is_active: false }).eq("id", cashier.id);
    const reactivation = await directPatch(cashier.client, cashier.id, { is_active: true });
    expect(reactivation.code).toBe("42501");
    expect((await readProfile(cashier.id)).is_active).toBe(false);
    await service.from("profiles").update({ is_active: true }).eq("id", cashier.id);

    const mixedPicture = `/${marker}/mixed.png`;
    const mixed = await directPatch(cashier.client, cashier.id, {
      profile_picture_url: mixedPicture,
      role: "owner",
    });
    expect(mixed.code).toBe("42501");
    const afterMixed = await readProfile(cashier.id);
    expect(afterMixed.role).toBe("cashier");
    expect(afterMixed.profile_picture_url).toBeNull();

    const picture = `/${marker}/profile.png`;
    const pictureUpdate = await directPatch(cashier.client, cashier.id, {
      profile_picture_url: picture,
    });
    expect(pictureUpdate).toMatchObject({ ok: true, rows: 1, code: null });
    const afterPicture = await readProfile(cashier.id);
    expect(afterPicture.profile_picture_url).toBe(picture);
    expect(new Date(afterPicture.updated_at).getTime()).toBeGreaterThanOrEqual(
      new Date(cashierOpening.updated_at).getTime(),
    );

    const otherPicture = await directPatch(cashier.client, target.id, {
      profile_picture_url: `/${marker}/other.png`,
    });
    expect(otherPicture).toMatchObject({ ok: true, rows: 0, code: null });
    expect((await readProfile(target.id)).profile_picture_url).toBeNull();

    const anonymousPicture = await directPatch(anon, cashier.id, {
      profile_picture_url: `/${marker}/anonymous.png`,
    });
    expect(anonymousPicture).toMatchObject({ ok: true, rows: 0, code: null });
    expect((await readProfile(cashier.id)).profile_picture_url).toBe(picture);

    const { data: currentRole, error: roleReadError } = await cashier.client.rpc("current_user_role");
    const { data: currentOrg, error: orgReadError } = await cashier.client.rpc("current_organization_id");
    expect(roleReadError).toBeNull();
    expect(orgReadError).toBeNull();
    expect(currentRole).toBe("cashier");
    expect(currentOrg).toBe(orgA.organizationId);
    const { data: ownSessionProfile, error: sessionProfileError } = await cashier.client
      .from("profiles")
      .select("role, organization_id, branch_id")
      .eq("id", cashier.id)
      .single();
    expect(sessionProfileError).toBeNull();
    expect(ownSessionProfile).toEqual({
      role: "cashier",
      organization_id: orgA.organizationId,
      branch_id: orgA.branchId,
    });

    const { data: permissionsAfter } = await service
      .from("staff_permissions")
      .select("*")
      .eq("profile_id", cashier.id)
      .single();
    expect(permissionsAfter).toEqual(permissionsBefore);

    const { error: privilegedUpdateError } = await service
      .from("profiles")
      .update({ role: "manager", branch_id: secondaryBranch.id, is_active: false })
      .eq("id", target.id);
    expect(privilegedUpdateError).toBeNull();
    expect(await readProfile(target.id)).toMatchObject({
      role: "manager",
      branch_id: secondaryBranch.id,
      is_active: false,
    });
    const { error: privilegedRestoreError } = await service
      .from("profiles")
      .update({ role: "cashier", branch_id: orgA.branchId, is_active: true })
      .eq("id", target.id);
    expect(privilegedRestoreError).toBeNull();

    const invitee = await service.auth.admin.createUser({
      email: `${marker.toLowerCase()}-invitee@example.invalid`,
      password,
      email_confirm: true,
    });
    if (invitee.error || !invitee.data.user) throw new Error(`invitee auth failed: ${invitee.error?.message}`);
    userIds.push(invitee.data.user.id);
    const invitePayload = {
      id: invitee.data.user.id,
      organization_id: orgA.organizationId,
      branch_id: orgA.branchId,
      full_name: `${marker} Invitee`,
      role: "technician",
      is_active: true,
      onboarding_completed: true,
    };
    const { error: inviteProfileError } = await service.from("profiles").insert(invitePayload);
    expect(inviteProfileError).toBeNull();
    const { error: invitePermissionError } = await service.from("staff_permissions").insert({
      organization_id: orgA.organizationId,
      profile_id: invitee.data.user.id,
      can_sell: false,
      can_manage_stock: false,
    });
    expect(invitePermissionError).toBeNull();
    expect(await readProfile(invitee.data.user.id)).toMatchObject(invitePayload);

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
      status.ANON_KEY,
      onboardingAuth.data.user.email!,
      password,
    );
    clients.push(onboarding);
    const { error: onboardingError } = await onboarding.rpc("complete_self_signup", {
      p_organization_name: `${marker} Onboarding Org`,
      p_branch_name: `${marker} Onboarding Branch`,
      p_full_name: `${marker} Owner`,
      p_owner_name: `${marker} Owner`,
      p_phone: null,
      p_avatar_url: null,
      p_org_phone: "+923001234567",
      p_org_whatsapp: null,
      p_org_email: `${marker.toLowerCase()}-org@example.invalid`,
      p_org_address: null,
      p_logo_url: null,
      p_primary_color: null,
      p_accent_color: null,
      p_default_theme: "system",
      p_currency_code: "PKR",
      p_timezone: "Asia/Karachi",
      p_branch_phone: null,
      p_branch_address: null,
    });
    expect(onboardingError).toBeNull();
    const onboardedProfile = await readProfile(onboardingAuth.data.user.id);
    expect(onboardedProfile).toMatchObject({
      role: "owner",
      is_active: true,
      onboarding_completed: true,
    });
    expect(onboardedProfile.organization_id).not.toBeNull();
    expect(onboardedProfile.branch_id).not.toBeNull();
    organizationIds.push(onboardedProfile.organization_id!);
    branchIds.push(onboardedProfile.branch_id!);

    const { error: attachedSignupError } = await cashier.client.rpc("complete_self_signup", {
      p_organization_name: `${marker} Escalated Org`,
      p_branch_name: `${marker} Escalated Branch`,
      p_full_name: `${marker} Escalated Owner`,
    });
    expect(attachedSignupError).not.toBeNull();
    expect((await readProfile(cashier.id)).organization_id).toBe(orgA.organizationId);

    const { error: anonOnboardingError } = await anon.rpc("complete_self_signup", {
      p_organization_name: `${marker} Anonymous Org`,
      p_branch_name: `${marker} Anonymous Branch`,
      p_full_name: `${marker} Anonymous`,
    });
    expect(anonOnboardingError).not.toBeNull();

    proof.matrix = {
      protected: protectedResults,
      equivalent_roles: roleAttempts,
      self_reactivation: { code: reactivation.code, persisted: false },
      mixed: { code: mixed.code, protected_persisted: false, allowed_persisted: false },
      profile_picture_url: { field: "profile_picture_url", ok: true, own_row_only: true },
      other_user: { rows: otherPicture.rows, persisted: false },
      anonymous: { rows: anonymousPicture.rows, persisted: false },
    };
    proof.privileged = {
      service_role_profile_management: "pass",
      invite_profile_assignment: "pass",
      onboarding_security_definer: "pass",
      attached_user_onboarding: "denied",
      anonymous_onboarding: "denied",
      session_role_organization_branch: "pass",
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
  proof.cleanup = {
    signatures_equal: digest(opening) === digest(closing),
    opening,
    closing,
  };
  expect(closing).toEqual(opening);
  writeFileSync(ARTIFACT, JSON.stringify(proof, null, 2));
});
