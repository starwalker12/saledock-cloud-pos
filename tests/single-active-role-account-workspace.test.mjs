import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260830052210_single_active_role_account_workspace.sql",
    import.meta.url,
  ),
  "utf8",
);
const guard = readFileSync(
  new URL("../src/components/auth/active-workspace-guard.tsx", import.meta.url),
  "utf8",
);
const dialog = readFileSync(
  new URL(
    "../src/components/auth/active-workspace-paused-dialog.tsx",
    import.meta.url,
  ),
  "utf8",
);
const identity = readFileSync(
  new URL("../src/lib/active-workspace.ts", import.meta.url),
  "utf8",
);
const frame = readFileSync(
  new URL(
    "../src/components/layout/persistent-authenticated-frame.tsx",
    import.meta.url,
  ),
  "utf8",
);

function localConfig() {
  const output = execFileSync("supabase", ["status", "--output", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const status = JSON.parse(output.slice(output.indexOf("{")));
  const url = status.API_URL ?? status.api_url ?? status.apiUrl;
  const anon =
    status.PUBLISHABLE_KEY ??
    status.ANON_KEY ??
    status.anon_key ??
    status.anonKey;
  const service =
    status.SERVICE_ROLE_KEY ??
    status.service_role_key ??
    status.serviceRoleKey;
  assert.match(url, /^http:\/\/(127\.0\.0\.1|localhost|\[::1\])(?::|\/)/);
  assert.ok(anon && service, "complete local Supabase status is required");
  return { url, anon, service };
}

function supabaseClient(url, key) {
  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

function psql(sql) {
  const container = execFileSync(
    "sh",
    [
      "-c",
      "docker ps --format '{{.Names}}' | grep '^supabase_db_' | head -1",
    ],
    { encoding: "utf8" },
  ).trim();
  assert.ok(container, "running local Supabase Postgres is required");
  return execFileSync(
    "docker",
    [
      "exec",
      container,
      "psql",
      "-X",
      "-qAt",
      "-F",
      "|",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-c",
      sql,
    ],
    { encoding: "utf8" },
  ).trim();
}

test("the lease schema is per auth.uid with no business identity inputs", () => {
  assert.match(
    migration,
    /create table public\.user_active_workspace_leases \([\s\S]*?user_id uuid primary key references auth\.users\(id\) on delete cascade/,
  );
  for (const column of [
    "device_id uuid not null",
    "tab_id uuid not null",
    "generation bigint not null",
    "claimed_at timestamptz not null",
    "heartbeat_at timestamptz not null",
    "updated_at timestamptz not null",
  ]) {
    assert.match(migration, new RegExp(column.replace(/[()]/g, "\\$&")));
  }
  assert.doesNotMatch(
    migration,
    /email|username|organization_id|branch_id|ip_address|user_agent|access_token|refresh_token/,
  );
  assert.equal((migration.match(/v_user_id uuid := auth\.uid\(\);/g) ?? []).length, 4);
  assert.doesNotMatch(
    migration,
    /p_user_id|p_role|p_organization|p_branch|dynamic sql|execute format/i,
  );
  for (const role of ["owner", "admin", "manager", "cashier", "technician"]) {
    assert.match(migration, new RegExp(`'${role}'`));
  }
});

test("privileged implementations stay private behind invoker RPC wrappers", () => {
  assert.equal((migration.match(/security definer/g) ?? []).length, 4);
  assert.equal((migration.match(/security invoker/g) ?? []).length, 4);
  assert.equal((migration.match(/set search_path = ''/g) ?? []).length, 8);
  assert.match(migration, /create schema workspace_private authorization postgres/);
  assert.match(migration, /revoke all on schema workspace_private from public/);
  assert.match(migration, /grant usage on schema workspace_private to authenticated/);
  assert.match(migration, /revoke all on table public\.user_active_workspace_leases from authenticated/);
  assert.match(migration, /revoke all on table public\.user_active_workspace_leases from anon/);
  assert.doesNotMatch(migration, /create policy/i);
  for (const rpc of [
    "claim_active_workspace",
    "get_active_workspace",
    "heartbeat_active_workspace",
    "release_active_workspace",
  ]) {
    assert.match(migration, new RegExp(`create function public\\.${rpc}`));
    assert.match(
      migration,
      new RegExp(`revoke all on function public\\.${rpc}\\([\\s\\S]*?from anon`),
    );
    assert.match(
      migration,
      new RegExp(`grant execute on function public\\.${rpc}\\([\\s\\S]*?to authenticated`),
    );
  }
});

test("claim, heartbeat, and release preserve generation ownership", () => {
  assert.match(migration, /insert into public\.user_active_workspace_leases as current_lease/);
  assert.match(migration, /on conflict \(user_id\) do update/);
  assert.match(
    migration,
    /when current_lease\.device_id = excluded\.device_id[\s\S]*?and current_lease\.tab_id = excluded\.tab_id[\s\S]*?then current_lease\.generation[\s\S]*?else current_lease\.generation \+ 1/,
  );
  for (const functionName of [
    "heartbeat_active_workspace",
    "release_active_workspace",
  ]) {
    const start = migration.indexOf(
      `create function workspace_private.${functionName}`,
    );
    assert.notEqual(start, -1);
    const section = migration.slice(start, migration.indexOf("$$;", start) + 3);
    assert.match(section, /lease\.user_id = v_user_id/);
    assert.match(section, /lease\.device_id = p_device_id/);
    assert.match(section, /lease\.tab_id = p_tab_id/);
    assert.match(section, /lease\.generation = p_generation/);
  }
});

test("the persistent frame mounts exactly one accessible coordination guard", () => {
  assert.equal((frame.match(/<ActiveWorkspaceGuard>/g) ?? []).length, 1);
  assert.match(
    frame,
    /<ActiveWorkspaceGuard>[\s\S]*?\{authenticatedShell\}[\s\S]*?\{children\}[\s\S]*?<\/ActiveWorkspaceGuard>/,
  );
  assert.match(guard, /ACTIVE_WORKSPACE_POLL_INTERVAL_MS/);
  assert.match(guard, /createWorkspaceMessageChannel\([\s\S]*?workspaceChannelName\(user\.id\)/);
  assert.match(guard, /inert=\{isBlocked \? true : undefined\}/);
  assert.match(guard, /aria-hidden=\{isBlocked \? true : undefined\}/);
  assert.match(
    guard,
    /Session coordination is temporarily unavailable\. Check your connection and try again\./,
  );
  assert.match(dialog, /role="dialog"/);
  assert.match(dialog, /aria-modal="true"/);
  assert.match(dialog, /event\.key === "Escape"/);
  assert.match(dialog, /event\.preventDefault\(\)/);
  assert.doesNotMatch(dialog, /aria-label="Close"|<X\b/);
  assert.match(dialog, /"Taking control\.\.\."\s*:\s*"Use Here"/);
  assert.match(dialog, /"Signing out\.\.\."\s*:\s*"Sign out"/);
});

test("browser identities are random, storage-scoped, and duplicate-tab aware", () => {
  assert.match(identity, /crypto\.randomUUID\(\)/);
  assert.match(identity, /crypto\.getRandomValues/);
  assert.match(identity, /typeof BroadcastChannelConstructor === "function"/);
  assert.match(identity, /window\.addEventListener\("storage", handleStorage\)/);
  assert.match(identity, /localStorage\.getItem\(\s*ACTIVE_WORKSPACE_DEVICE_STORAGE_KEY,?\s*\)/);
  assert.match(identity, /sessionStorage\.getItem\(ACTIVE_WORKSPACE_TAB_STORAGE_KEY\)/);
  assert.match(identity, /replaceDuplicatedTabIdentity/);
  assert.match(guard, /type: "tab-probe"/);
  assert.match(guard, /type: "tab-present"/);
  assert.match(guard, /replaceDuplicatedTabIdentity\(user\.id, identity\)/);
  assert.doesNotMatch(identity, /navigator\.userAgent|screen\.|ip|fingerprint/i);
});

test("local RPC matrix enforces roles, account isolation, and atomic winners", async () => {
  const { url, anon, service } = localConfig();
  const admin = supabaseClient(url, service);
  const anonymous = supabaseClient(url, anon);
  const password = "Password123!";
  const marker = `${process.pid}-${Date.now()}`;
  const organizationId = crypto.randomUUID();
  const branchId = crypto.randomUUID();
  const fixtures = [
    ["owner", "owner-a"],
    ["admin", "admin-b"],
    ["cashier", "cashier-c"],
    ["cashier", "cashier-d"],
    ["manager", "manager-e"],
    ["technician", "technician-f"],
  ];
  const users = [];
  const clients = new Map();
  const openingLeaseCount = Number(
    psql("select count(*) from public.user_active_workspace_leases;"),
  );

  try {
    assert.ifError(
      (await admin.from("organizations").insert({
        id: organizationId,
        name: `Workspace QA ${marker}`,
      })).error,
    );
    assert.ifError(
      (await admin.from("branches").insert({
        id: branchId,
        organization_id: organizationId,
        name: "Workspace QA branch",
        is_active: true,
      })).error,
    );

    for (const [role, label] of fixtures) {
      const email = `workspace-${label}-${marker}@saledock.local`;
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      assert.ifError(error);
      assert.ok(data.user);
      users.push(data.user);
      assert.ifError(
        (await admin.from("profiles").insert({
          id: data.user.id,
          organization_id: organizationId,
          branch_id: branchId,
          full_name: `Workspace ${label}`,
          role,
          is_active: true,
          onboarding_completed: true,
        })).error,
      );

      const client = supabaseClient(url, anon);
      const signIn = await client.auth.signInWithPassword({ email, password });
      assert.ifError(signIn.error);
      clients.set(label, client);
    }

    for (const rpc of [
      ["get_active_workspace", undefined],
      ["claim_active_workspace", {
        p_device_id: crypto.randomUUID(),
        p_tab_id: crypto.randomUUID(),
      }],
      ["heartbeat_active_workspace", {
        p_device_id: crypto.randomUUID(),
        p_tab_id: crypto.randomUUID(),
        p_generation: 1,
      }],
      ["release_active_workspace", {
        p_device_id: crypto.randomUUID(),
        p_tab_id: crypto.randomUUID(),
        p_generation: 1,
      }],
    ]) {
      const { error } = await anonymous.rpc(rpc[0], rpc[1]);
      assert.ok(error, `${rpc[0]} rejects anon`);
    }

    const technicianUser = users[5];
    const technician = clients.get("technician-f");
    assert.ifError(
      (
        await admin
          .from("profiles")
          .update({ is_active: false })
          .eq("id", technicianUser.id)
      ).error,
    );
    const inactiveClaim = await technician.rpc("claim_active_workspace", {
      p_device_id: crypto.randomUUID(),
      p_tab_id: crypto.randomUUID(),
    });
    assert.equal(inactiveClaim.error?.code, "42501");
    assert.ifError(
      (
        await admin
          .from("profiles")
          .update({ is_active: true })
          .eq("id", technicianUser.id)
      ).error,
    );

    const distinctWinners = [];
    for (const [role, label] of fixtures) {
      const client = clients.get(label);
      const deviceId = crypto.randomUUID();
      const tabId = crypto.randomUUID();
      const { data, error } = await client.rpc("claim_active_workspace", {
        p_device_id: deviceId,
        p_tab_id: tabId,
      });
      assert.ifError(error);
      assert.equal(data?.[0]?.device_id, deviceId, `${role}/${label} claims independently`);
      distinctWinners.push({ label, deviceId, tabId, generation: data[0].generation });
    }

    const { count: independentCount, error: countError } = await admin
      .from("user_active_workspace_leases")
      .select("user_id", { count: "exact", head: true })
      .in("user_id", users.map((user) => user.id));
    assert.ifError(countError);
    assert.equal(independentCount, 6);

    const owner = clients.get("owner-a");
    const directRead = await owner.from("user_active_workspace_leases").select("user_id");
    assert.equal(directRead.error?.code, "42501");
    const directInsert = await owner.from("user_active_workspace_leases").insert({
      user_id: users[0].id,
      device_id: crypto.randomUUID(),
      tab_id: crypto.randomUUID(),
    });
    assert.equal(directInsert.error?.code, "42501");

    const ownerInitial = distinctWinners.find((winner) => winner.label === "owner-a");
    const sameClaim = await owner.rpc("claim_active_workspace", {
      p_device_id: ownerInitial.deviceId,
      p_tab_id: ownerInitial.tabId,
    });
    assert.ifError(sameClaim.error);
    assert.equal(sameClaim.data[0].generation, ownerInitial.generation);

    const nextDevice = crypto.randomUUID();
    const nextTab = crypto.randomUUID();
    const moved = await owner.rpc("claim_active_workspace", {
      p_device_id: nextDevice,
      p_tab_id: nextTab,
    });
    assert.ifError(moved.error);
    assert.equal(moved.data[0].generation, ownerInitial.generation + 1);

    const staleHeartbeat = await owner.rpc("heartbeat_active_workspace", {
      p_device_id: ownerInitial.deviceId,
      p_tab_id: ownerInitial.tabId,
      p_generation: ownerInitial.generation,
    });
    assert.ifError(staleHeartbeat.error);
    assert.equal(staleHeartbeat.data[0].device_id, nextDevice);
    const staleRelease = await owner.rpc("release_active_workspace", {
      p_device_id: ownerInitial.deviceId,
      p_tab_id: ownerInitial.tabId,
      p_generation: ownerInitial.generation,
    });
    assert.ifError(staleRelease.error);
    assert.equal(staleRelease.data, false);

    const simultaneousTabs = [crypto.randomUUID(), crypto.randomUUID()];
    const simultaneousDevice = crypto.randomUUID();
    const concurrent = await Promise.all(
      simultaneousTabs.map((tabId) =>
        owner.rpc("claim_active_workspace", {
          p_device_id: simultaneousDevice,
          p_tab_id: tabId,
        }),
      ),
    );
    concurrent.forEach(({ error }) => assert.ifError(error));
    const authoritative = await owner.rpc("get_active_workspace");
    assert.ifError(authoritative.error);
    assert.ok(simultaneousTabs.includes(authoritative.data[0].tab_id));
    assert.equal(
      authoritative.data[0].generation,
      moved.data[0].generation + 2,
    );

    const winnerRelease = await owner.rpc("release_active_workspace", {
      p_device_id: authoritative.data[0].device_id,
      p_tab_id: authoritative.data[0].tab_id,
      p_generation: authoritative.data[0].generation,
    });
    assert.ifError(winnerRelease.error);
    assert.equal(winnerRelease.data, true);
  } finally {
    if (users.length > 0) {
      await admin
        .from("user_active_workspace_leases")
        .delete()
        .in("user_id", users.map((user) => user.id));
      await admin.from("profiles").delete().in("id", users.map((user) => user.id));
    }
    for (const user of users) await admin.auth.admin.deleteUser(user.id);
    await admin.from("branches").delete().eq("id", branchId);
    await admin.from("organizations").delete().eq("id", organizationId);
  }

  assert.equal(
    Number(psql("select count(*) from public.user_active_workspace_leases;")),
    openingLeaseCount,
  );
});

test("deployed local catalog shows trusted owners, safe paths, and minimal grants", () => {
  const functions = psql(`
    select n.nspname, p.proname, p.prosecdef, r.rolname,
      coalesce(array_to_string(p.proconfig, ','), ''),
      has_function_privilege('anon', p.oid, 'execute'),
      has_function_privilege('authenticated', p.oid, 'execute')
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join pg_roles r on r.oid = p.proowner
    where p.proname in (
      'claim_active_workspace',
      'get_active_workspace',
      'heartbeat_active_workspace',
      'release_active_workspace'
    )
      and n.nspname in ('public', 'workspace_private')
    order by n.nspname, p.proname;
  `)
    .split("\n")
    .filter(Boolean);
  assert.equal(functions.length, 8);
  for (const row of functions) {
    const [schema, , securityDefiner, owner, config, anonExecute, authExecute] =
      row.split("|");
    assert.equal(owner, "postgres");
    assert.equal(config, "search_path=\"\"");
    assert.equal(anonExecute, "f");
    assert.equal(authExecute, "t");
    assert.equal(securityDefiner, schema === "workspace_private" ? "t" : "f");
  }

  assert.equal(
    psql(`
      select c.relrowsecurity, c.relforcerowsecurity, r.rolname,
        has_table_privilege('anon', c.oid, 'select'),
        has_table_privilege('authenticated', c.oid, 'select'),
        has_table_privilege('authenticated', c.oid, 'insert'),
        has_table_privilege('authenticated', c.oid, 'update'),
        has_table_privilege('authenticated', c.oid, 'delete'),
        has_table_privilege('service_role', c.oid, 'select')
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_roles r on r.oid = c.relowner
      where n.nspname = 'public'
        and c.relname = 'user_active_workspace_leases';
    `),
    "t|f|postgres|f|f|f|f|f|t",
  );
  assert.equal(
    psql("select count(*) from pg_policies where schemaname='public' and tablename='user_active_workspace_leases';"),
    "0",
  );
});
