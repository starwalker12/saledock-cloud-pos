-- One authoritative application workspace per authenticated SaleDock account.
-- Browser/device identifiers are opaque coordination values, never identity or
-- authorization inputs. Every privileged operation derives the account from
-- auth.uid() and requires an active supported profile.

do $$
begin
  if to_regclass('public.user_active_workspace_leases') is not null then
    raise exception 'user_active_workspace_leases already exists';
  end if;

  if exists (
    select 1
    from unnest(array['owner', 'admin', 'manager', 'cashier', 'technician']) as expected(role_name)
    where not exists (
      select 1
      from pg_enum e
      join pg_type t on t.oid = e.enumtypid
      join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = 'public'
        and t.typname = 'user_role'
        and e.enumlabel = expected.role_name
    )
  ) then
    raise exception 'Expected SaleDock user roles are missing';
  end if;
end;
$$;

create table public.user_active_workspace_leases (
  user_id uuid primary key references auth.users(id) on delete cascade,
  device_id uuid not null,
  tab_id uuid not null,
  generation bigint not null default 1 check (generation > 0),
  claimed_at timestamptz not null default now(),
  heartbeat_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_active_workspace_leases enable row level security;

revoke all on table public.user_active_workspace_leases from public;
revoke all on table public.user_active_workspace_leases from anon;
revoke all on table public.user_active_workspace_leases from authenticated;
grant select, insert, update, delete on table public.user_active_workspace_leases to service_role;

comment on table public.user_active_workspace_leases is
  'Opaque per-auth.uid() application workspace coordination state.';

-- Keep privileged implementations outside the exposed Data API schema. Public
-- RPC wrappers below are SECURITY INVOKER and are the only HTTP-facing surface.
create schema workspace_private authorization postgres;
revoke all on schema workspace_private from public;
grant usage on schema workspace_private to authenticated;

create function workspace_private.claim_active_workspace(
  p_device_id uuid,
  p_tab_id uuid
)
returns table (
  device_id uuid,
  tab_id uuid,
  generation bigint,
  claimed_at timestamptz,
  heartbeat_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := statement_timestamp();
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = v_user_id
      and p.is_active = true
      and p.role::text in ('owner', 'admin', 'manager', 'cashier', 'technician')
  ) then
    raise exception 'Active SaleDock profile required' using errcode = '42501';
  end if;

  return query
  insert into public.user_active_workspace_leases as current_lease (
    user_id,
    device_id,
    tab_id,
    generation,
    claimed_at,
    heartbeat_at,
    updated_at
  )
  values (
    v_user_id,
    p_device_id,
    p_tab_id,
    1,
    v_now,
    v_now,
    v_now
  )
  on conflict (user_id) do update
  set
    device_id = excluded.device_id,
    tab_id = excluded.tab_id,
    generation = case
      when current_lease.device_id = excluded.device_id
        and current_lease.tab_id = excluded.tab_id
        then current_lease.generation
      else current_lease.generation + 1
    end,
    claimed_at = case
      when current_lease.device_id = excluded.device_id
        and current_lease.tab_id = excluded.tab_id
        then current_lease.claimed_at
      else excluded.claimed_at
    end,
    heartbeat_at = excluded.heartbeat_at,
    updated_at = excluded.updated_at
  returning
    current_lease.device_id,
    current_lease.tab_id,
    current_lease.generation,
    current_lease.claimed_at,
    current_lease.heartbeat_at,
    current_lease.updated_at;
end;
$$;

create function workspace_private.get_active_workspace()
returns table (
  device_id uuid,
  tab_id uuid,
  generation bigint,
  claimed_at timestamptz,
  heartbeat_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = v_user_id
      and p.is_active = true
      and p.role::text in ('owner', 'admin', 'manager', 'cashier', 'technician')
  ) then
    raise exception 'Active SaleDock profile required' using errcode = '42501';
  end if;

  return query
  select
    lease.device_id,
    lease.tab_id,
    lease.generation,
    lease.claimed_at,
    lease.heartbeat_at,
    lease.updated_at
  from public.user_active_workspace_leases lease
  where lease.user_id = v_user_id;
end;
$$;

create function workspace_private.heartbeat_active_workspace(
  p_device_id uuid,
  p_tab_id uuid,
  p_generation bigint
)
returns table (
  device_id uuid,
  tab_id uuid,
  generation bigint,
  claimed_at timestamptz,
  heartbeat_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := statement_timestamp();
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = v_user_id
      and p.is_active = true
      and p.role::text in ('owner', 'admin', 'manager', 'cashier', 'technician')
  ) then
    raise exception 'Active SaleDock profile required' using errcode = '42501';
  end if;

  update public.user_active_workspace_leases lease
  set
    heartbeat_at = v_now,
    updated_at = v_now
  where lease.user_id = v_user_id
    and lease.device_id = p_device_id
    and lease.tab_id = p_tab_id
    and lease.generation = p_generation;

  return query
  select
    lease.device_id,
    lease.tab_id,
    lease.generation,
    lease.claimed_at,
    lease.heartbeat_at,
    lease.updated_at
  from public.user_active_workspace_leases lease
  where lease.user_id = v_user_id;
end;
$$;

create function workspace_private.release_active_workspace(
  p_device_id uuid,
  p_tab_id uuid,
  p_generation bigint
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = v_user_id
      and p.is_active = true
      and p.role::text in ('owner', 'admin', 'manager', 'cashier', 'technician')
  ) then
    raise exception 'Active SaleDock profile required' using errcode = '42501';
  end if;

  delete from public.user_active_workspace_leases lease
  where lease.user_id = v_user_id
    and lease.device_id = p_device_id
    and lease.tab_id = p_tab_id
    and lease.generation = p_generation;

  return found;
end;
$$;

alter function workspace_private.claim_active_workspace(uuid, uuid) owner to postgres;
alter function workspace_private.get_active_workspace() owner to postgres;
alter function workspace_private.heartbeat_active_workspace(uuid, uuid, bigint) owner to postgres;
alter function workspace_private.release_active_workspace(uuid, uuid, bigint) owner to postgres;

revoke all on function workspace_private.claim_active_workspace(uuid, uuid) from public;
revoke all on function workspace_private.get_active_workspace() from public;
revoke all on function workspace_private.heartbeat_active_workspace(uuid, uuid, bigint) from public;
revoke all on function workspace_private.release_active_workspace(uuid, uuid, bigint) from public;
revoke all on function workspace_private.claim_active_workspace(uuid, uuid) from anon;
revoke all on function workspace_private.get_active_workspace() from anon;
revoke all on function workspace_private.heartbeat_active_workspace(uuid, uuid, bigint) from anon;
revoke all on function workspace_private.release_active_workspace(uuid, uuid, bigint) from anon;
grant execute on function workspace_private.claim_active_workspace(uuid, uuid) to authenticated;
grant execute on function workspace_private.get_active_workspace() to authenticated;
grant execute on function workspace_private.heartbeat_active_workspace(uuid, uuid, bigint) to authenticated;
grant execute on function workspace_private.release_active_workspace(uuid, uuid, bigint) to authenticated;

create function public.claim_active_workspace(
  p_device_id uuid,
  p_tab_id uuid
)
returns table (
  device_id uuid,
  tab_id uuid,
  generation bigint,
  claimed_at timestamptz,
  heartbeat_at timestamptz,
  updated_at timestamptz
)
language sql
security invoker
set search_path = ''
as $$
  select * from workspace_private.claim_active_workspace(p_device_id, p_tab_id)
$$;

create function public.get_active_workspace()
returns table (
  device_id uuid,
  tab_id uuid,
  generation bigint,
  claimed_at timestamptz,
  heartbeat_at timestamptz,
  updated_at timestamptz
)
language sql
security invoker
set search_path = ''
as $$
  select * from workspace_private.get_active_workspace()
$$;

create function public.heartbeat_active_workspace(
  p_device_id uuid,
  p_tab_id uuid,
  p_generation bigint
)
returns table (
  device_id uuid,
  tab_id uuid,
  generation bigint,
  claimed_at timestamptz,
  heartbeat_at timestamptz,
  updated_at timestamptz
)
language sql
security invoker
set search_path = ''
as $$
  select * from workspace_private.heartbeat_active_workspace(
    p_device_id,
    p_tab_id,
    p_generation
  )
$$;

create function public.release_active_workspace(
  p_device_id uuid,
  p_tab_id uuid,
  p_generation bigint
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select workspace_private.release_active_workspace(
    p_device_id,
    p_tab_id,
    p_generation
  )
$$;

revoke all on function public.claim_active_workspace(uuid, uuid) from public;
revoke all on function public.get_active_workspace() from public;
revoke all on function public.heartbeat_active_workspace(uuid, uuid, bigint) from public;
revoke all on function public.release_active_workspace(uuid, uuid, bigint) from public;
revoke all on function public.claim_active_workspace(uuid, uuid) from anon;
revoke all on function public.get_active_workspace() from anon;
revoke all on function public.heartbeat_active_workspace(uuid, uuid, bigint) from anon;
revoke all on function public.release_active_workspace(uuid, uuid, bigint) from anon;
grant execute on function public.claim_active_workspace(uuid, uuid) to authenticated;
grant execute on function public.get_active_workspace() to authenticated;
grant execute on function public.heartbeat_active_workspace(uuid, uuid, bigint) to authenticated;
grant execute on function public.release_active_workspace(uuid, uuid, bigint) to authenticated;

do $$
begin
  if has_table_privilege('anon', 'public.user_active_workspace_leases', 'select')
    or has_table_privilege('anon', 'public.user_active_workspace_leases', 'insert')
    or has_table_privilege('anon', 'public.user_active_workspace_leases', 'update')
    or has_table_privilege('anon', 'public.user_active_workspace_leases', 'delete')
    or has_table_privilege('authenticated', 'public.user_active_workspace_leases', 'select')
    or has_table_privilege('authenticated', 'public.user_active_workspace_leases', 'insert')
    or has_table_privilege('authenticated', 'public.user_active_workspace_leases', 'update')
    or has_table_privilege('authenticated', 'public.user_active_workspace_leases', 'delete') then
    raise exception 'Direct lease-table access survived hardening';
  end if;

  if has_function_privilege('anon', 'public.claim_active_workspace(uuid, uuid)', 'execute')
    or has_function_privilege('anon', 'public.get_active_workspace()', 'execute')
    or has_function_privilege('anon', 'public.heartbeat_active_workspace(uuid, uuid, bigint)', 'execute')
    or has_function_privilege('anon', 'public.release_active_workspace(uuid, uuid, bigint)', 'execute') then
    raise exception 'Anonymous lease RPC execution survived hardening';
  end if;

  if not has_function_privilege('authenticated', 'public.claim_active_workspace(uuid, uuid)', 'execute')
    or not has_function_privilege('authenticated', 'public.get_active_workspace()', 'execute')
    or not has_function_privilege('authenticated', 'public.heartbeat_active_workspace(uuid, uuid, bigint)', 'execute')
    or not has_function_privilege('authenticated', 'public.release_active_workspace(uuid, uuid, bigint)', 'execute') then
    raise exception 'Authenticated lease RPC execution is missing';
  end if;
end;
$$;
