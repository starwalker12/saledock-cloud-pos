-- Migration 0019: SaaS onboarding polish — RPC disambiguation, new fields,
-- partial unique indexes, and SaleDock defaults.
--
-- 1. Fix column-reference ambiguity in complete_self_signup by using
--    v_ prefix for local variables and properly qualifying column refs.
-- 2. Add missing fields to profiles, organizations, branches.
-- 3. Partial unique indexes for username, phone, org slug.

----------------------------------------------------------------------
-- 1. profiles: username, profile_picture_url (replacing avatar_url),
--    phone uniqueness
----------------------------------------------------------------------
alter table public.profiles
  add column if not exists username text,
  add column if not exists profile_picture_url text;

-- avatar_url is kept for backward compat; new code uses profile_picture_url.
-- The RPC stores into profile_picture_url, and avatar_url is set from it.

-- Partial unique index on username (case-insensitive, non-empty)
create unique index if not exists idx_profiles_username_unique
  on public.profiles (lower(username))
  where username is not null and username <> '';

-- Partial unique index on phone (normalised, non-empty)
create unique index if not exists idx_profiles_phone_unique
  on public.profiles (phone)
  where phone is not null and phone <> '';

----------------------------------------------------------------------
-- 2. organizations: additional fields + social_links
----------------------------------------------------------------------
alter table public.organizations
  add column if not exists google_maps_url text,
  add column if not exists latitude numeric,
  add column if not exists longitude numeric,
  add column if not exists show_map boolean not null default false,
  add column if not exists social_links jsonb not null default '[]'::jsonb,
  add column if not exists profile_picture_url text;

-- Partial unique index on organisation phone
create unique index if not exists idx_organizations_phone_unique
  on public.organizations (phone)
  where phone is not null and phone <> '';

-- Partial unique index on organisation email
create unique index if not exists idx_organizations_email_unique
  on public.organizations (lower(email))
  where email is not null and email <> '';

----------------------------------------------------------------------
-- 3. branches: phone, address, maps fields
----------------------------------------------------------------------
alter table public.branches
  add column if not exists phone text,
  add column if not exists address text,
  add column if not exists google_maps_url text,
  add column if not exists latitude numeric,
  add column if not exists longitude numeric;

----------------------------------------------------------------------
-- 4. Replace complete_self_signup with disambiguated variable names
----------------------------------------------------------------------
drop function if exists public.complete_self_signup(text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text);

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
returns table(out_org_id uuid, out_branch_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_org_id uuid := gen_random_uuid();
  v_branch_id uuid := gen_random_uuid();
  v_existing_org_id uuid;
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
  select pr.organization_id into v_existing_org_id
    from public.profiles pr
    where pr.id = v_user_id;
  if v_existing_org_id is not null then
    raise exception 'You already belong to a shop' using errcode = 'P0001';
  end if;

  -- Back-fill profile_picture_url from avatar_url if set
  p_avatar_url := coalesce(nullif(trim(coalesce(p_avatar_url, '')), ''), null);

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
    avatar_url, profile_picture_url, phone, onboarding_completed
  ) values (
    v_user_id, v_org_id, v_branch_id, trim(p_full_name), 'owner', true,
    p_avatar_url,
    p_avatar_url,
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

  return query select v_org_id as out_org_id, v_branch_id as out_branch_id;
end;
$$;

grant execute on function public.complete_self_signup(
  text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text
) to authenticated;
