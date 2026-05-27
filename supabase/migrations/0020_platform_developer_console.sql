-- Migration 0020: Platform Developer Console
--
-- Adds platform-level admin tables and settings, completely separate from
-- tenant owner/admin roles. Normal shop users cannot access or see these.
--
-- Tables:
--   platform_admins    — developer/support users who can access /platform
--   platform_settings  — global feature flags and defaults

----------------------------------------------------------------------
-- 1. platform_admins
----------------------------------------------------------------------
create table if not exists public.platform_admins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete cascade,
  email text,
  display_name text,
  role text not null default 'developer',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Unique email when non-empty
create unique index if not exists idx_platform_admins_email_unique
  on public.platform_admins (lower(email))
  where email is not null and email <> '';

-- Role constraint
alter table public.platform_admins
  drop constraint if exists platform_admins_role_check;
alter table public.platform_admins
  add constraint platform_admins_role_check
  check (role in ('developer', 'support', 'read_only'));

alter table public.platform_admins enable row level security;

-- Platform admin rows: a user can see their own row; service_role can see all.
create policy "platform_admins_select_own"
  on public.platform_admins for select
  using (auth.uid() = user_id or auth.role() = 'service_role');

-- Only platform_admins can insert/update/delete themselves or other admins
create policy "platform_admins_insert"
  on public.platform_admins for insert
  with check (auth.role() = 'service_role');

create policy "platform_admins_update"
  on public.platform_admins for update
  using (auth.role() = 'service_role');

create policy "platform_admins_delete"
  on public.platform_admins for delete
  using (auth.role() = 'service_role');

----------------------------------------------------------------------
-- 2. platform_settings
----------------------------------------------------------------------
create table if not exists public.platform_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  description text,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

alter table public.platform_settings enable row level security;

-- Platform admins can read/settings (service_role can write)
create policy "platform_settings_select"
  on public.platform_settings for select
  using (
    auth.role() = 'service_role'
    or exists (
      select 1 from public.platform_admins pa
      where pa.user_id = auth.uid()
        and pa.is_active = true
    )
  );

create policy "platform_settings_insert"
  on public.platform_settings for insert
  with check (auth.role() = 'service_role');

create policy "platform_settings_update"
  on public.platform_settings for update
  using (auth.role() = 'service_role');

create policy "platform_settings_delete"
  on public.platform_settings for delete
  using (auth.role() = 'service_role');

----------------------------------------------------------------------
-- 3. Initial platform settings
----------------------------------------------------------------------
insert into public.platform_settings (key, value, description) values
  ('public_signup_enabled', 'true', 'Allow new users to sign up via email or OAuth'),
  ('maintenance_mode_enabled', 'false', 'When true, non-admin users see a maintenance page'),
  ('maintenance_message', 'null', 'Custom message shown during maintenance mode'),
  ('backup_import_enabled', 'true', 'Allow tenant owners/admins to import backup files'),
  ('demo_data_enabled', 'true', 'Allow tenant owners to load demo/sample data'),
  ('factory_reset_enabled', 'true', 'Allow tenant owners to factory-reset their shop'),
  ('default_currency', '"PKR"', 'Default currency for newly onboarded shops'),
  ('default_timezone', '"Asia/Karachi"', 'Default timezone for newly onboarded shops'),
  ('app_name', '"SaleDock"', 'Platform application name')
on conflict (key) do nothing;

----------------------------------------------------------------------
-- 4. Grant access to authenticated role for platform_admins (select)
----------------------------------------------------------------------
-- Note: authenticated users can read their own row due to the RLS policy.
-- No extra grants needed beyond RLS.

grant usage on schema public to authenticated;
grant select on public.platform_admins to authenticated;
grant select on public.platform_settings to authenticated;
