-- Migration 0018: SaaS signup + onboarding metadata
--
-- Opens the app to self-service signup. Adds the metadata needed to detect
-- whether a signed-in user has finished the shop-setup wizard, and lets shops
-- customise their brand colours + theme. Existing single-shop production
-- profile/org rows are preserved by back-filling onboarding_completed = true
-- for any profile that already has an organization_id at migration time.

------------------------------------------------------------------------------
-- 1. profiles: avatar + phone + onboarding flag
------------------------------------------------------------------------------
alter table public.profiles
  add column if not exists avatar_url text,
  add column if not exists phone text,
  add column if not exists onboarding_completed boolean not null default false;

-- Back-fill: any existing profile that already belongs to an organization
-- is treated as already onboarded.
update public.profiles
  set onboarding_completed = true
  where organization_id is not null and onboarding_completed = false;

------------------------------------------------------------------------------
-- 2. organizations: branding + onboarding flag
------------------------------------------------------------------------------
alter table public.organizations
  add column if not exists slug text,
  add column if not exists logo_url text,
  add column if not exists owner_name text,
  add column if not exists whatsapp text,
  add column if not exists primary_color text,
  add column if not exists accent_color text,
  add column if not exists default_theme text,
  add column if not exists onboarding_completed boolean not null default false;

-- Enforce theme enum without a hard pg type
alter table public.organizations
  drop constraint if exists organizations_default_theme_check;
alter table public.organizations
  add constraint organizations_default_theme_check
  check (default_theme is null or default_theme in ('light','dark','system'));

-- Slug uniqueness (when supplied)
create unique index if not exists idx_organizations_slug_unique
  on public.organizations (lower(slug)) where slug is not null;

-- Back-fill: any pre-existing organization is treated as already onboarded.
update public.organizations
  set onboarding_completed = true
  where onboarding_completed = false
    and created_at < now();

------------------------------------------------------------------------------
-- 3. Owner self-service: a user without an organization can create one.
--
--   Currently the only writes to organizations / branches / profiles during
--   first-owner setup happen through the service-role admin client because
--   the RLS policies are "Org members can update their org" (chicken-and-egg
--   for a brand-new user). We continue to use the admin client for the
--   onboarding finish action, but expose a security-definer RPC so a future
--   non-admin path can do it cleanly.
------------------------------------------------------------------------------
create or replace function public.complete_self_signup(
  p_organization_name text,
  p_branch_name text,
  p_full_name text,
  p_owner_name text default null,
  p_phone text default null,
  p_avatar_url text default null,
  p_org_phone text default null,
  p_org_whatsapp text default null,
  p_org_email text default null,
  p_org_address text default null,
  p_logo_url text default null,
  p_primary_color text default null,
  p_accent_color text default null,
  p_default_theme text default null,
  p_currency_code text default null,
  p_timezone text default null
)
returns table(organization_id uuid, branch_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_org_id uuid := gen_random_uuid();
  v_branch_id uuid := gen_random_uuid();
  v_existing_profile_org uuid;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if coalesce(trim(p_organization_name), '') = '' then
    raise exception 'Organization name is required' using errcode = 'P0001';
  end if;
  if coalesce(trim(p_branch_name), '') = '' then
    raise exception 'Branch name is required' using errcode = 'P0001';
  end if;
  if coalesce(trim(p_full_name), '') = '' then
    raise exception 'Full name is required' using errcode = 'P0001';
  end if;

  -- If profile already exists and already attached, just return it.
  select organization_id into v_existing_profile_org
    from public.profiles
    where id = v_user_id;
  if v_existing_profile_org is not null then
    raise exception 'You already belong to a shop' using errcode = 'P0001';
  end if;

  insert into public.organizations (
    id, name, owner_name, phone, whatsapp, email, address,
    logo_url, primary_color, accent_color, default_theme,
    currency_code, timezone, onboarding_completed
  ) values (
    v_org_id,
    trim(p_organization_name),
    nullif(coalesce(trim(p_owner_name), trim(p_full_name)), ''),
    nullif(trim(coalesce(p_org_phone, '')), ''),
    nullif(trim(coalesce(p_org_whatsapp, '')), ''),
    nullif(trim(coalesce(p_org_email, '')), ''),
    nullif(trim(coalesce(p_org_address, '')), ''),
    nullif(trim(coalesce(p_logo_url, '')), ''),
    nullif(trim(coalesce(p_primary_color, '')), ''),
    nullif(trim(coalesce(p_accent_color, '')), ''),
    nullif(trim(coalesce(p_default_theme, '')), ''),
    coalesce(nullif(trim(coalesce(p_currency_code, '')), ''), 'PKR'),
    coalesce(nullif(trim(coalesce(p_timezone, '')), ''), 'Asia/Karachi'),
    true
  );

  insert into public.branches (
    id, organization_id, name, phone, address
  ) values (
    v_branch_id, v_org_id, trim(p_branch_name),
    nullif(trim(coalesce(p_org_phone, '')), ''),
    nullif(trim(coalesce(p_org_address, '')), '')
  );

  insert into public.profiles (
    id, organization_id, branch_id, full_name, role, is_active,
    avatar_url, phone, onboarding_completed
  ) values (
    v_user_id, v_org_id, v_branch_id, trim(p_full_name), 'owner', true,
    nullif(trim(coalesce(p_avatar_url, '')), ''),
    nullif(trim(coalesce(p_phone, '')), ''),
    true
  );

  insert into public.app_settings (
    organization_id, branch_id, shop_name, phone, email, address
  ) values (
    v_org_id, v_branch_id, trim(p_organization_name),
    nullif(trim(coalesce(p_org_phone, '')), ''),
    nullif(trim(coalesce(p_org_email, '')), ''),
    nullif(trim(coalesce(p_org_address, '')), '')
  );

  insert into public.audit_logs (
    organization_id, actor_id, module, action, details, metadata
  ) values (
    v_org_id, v_user_id, 'onboarding', 'onboarding.completed',
    'Owner completed self-service shop setup.',
    jsonb_build_object('organization_name', p_organization_name)
  );

  return query select v_org_id, v_branch_id;
end;
$$;

grant execute on function public.complete_self_signup(
  text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text
) to authenticated;
