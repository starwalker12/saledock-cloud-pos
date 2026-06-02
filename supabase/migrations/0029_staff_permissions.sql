-- Migration 0029: Staff Permission Overrides
--
-- Per-staff permission toggles that an owner/admin can flip to override role
-- defaults. NULL = inherit role default, true = explicitly allowed,
-- false = explicitly denied.
--
-- Owner and admin roles always have all permissions (enforced in application
-- code), so this table never needs a row for them.

-- ── Table ───────────────────────────────────────────────────────────────────────

create table public.staff_permissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  can_sell boolean,
  can_discount boolean,
  can_return boolean,
  can_void_invoice boolean,
  can_view_reports boolean,
  can_manage_stock boolean,
  can_sell_at_loss boolean,
  can_change_settings boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (organization_id, profile_id)
);

-- ── Indexes ─────────────────────────────────────────────────────────────────────

-- Fast lookup by org + profile (primary access pattern)
create index idx_staff_permissions_org_profile
  on public.staff_permissions(organization_id, profile_id);

-- ── Trigger for updated_at ──────────────────────────────────────────────────────

create trigger set_staff_permissions_updated_at
  before update on public.staff_permissions
  for each row execute function public.set_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────────────────

alter table public.staff_permissions enable row level security;

-- SELECT: A user may read a row IF it is their own row OR they are an owner/admin
-- in the same organization. Own-row read is required so the rule engine can read
-- a staff member's own permissions under their own session later.
create policy "Staff permissions own select"
  on public.staff_permissions for select
  to authenticated
  using (
    profile_id = auth.uid()
    or exists (
      select 1 from public.profiles
      where id = auth.uid()
        and organization_id = staff_permissions.organization_id
        and role in ('owner', 'admin')
    )
  );

-- INSERT: Only owner/admin in the same organization may create rows.
create policy "Staff permissions admin insert"
  on public.staff_permissions for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and organization_id = staff_permissions.organization_id
        and role in ('owner', 'admin')
    )
  );

-- UPDATE: Only owner/admin in the same organization may modify rows.
create policy "Staff permissions admin update"
  on public.staff_permissions for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and organization_id = staff_permissions.organization_id
        and role in ('owner', 'admin')
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and organization_id = staff_permissions.organization_id
        and role in ('owner', 'admin')
    )
  );

-- DELETE: Only owner/admin in the same organization may delete rows.
create policy "Staff permissions admin delete"
  on public.staff_permissions for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and organization_id = staff_permissions.organization_id
        and role in ('owner', 'admin')
    )
  );
