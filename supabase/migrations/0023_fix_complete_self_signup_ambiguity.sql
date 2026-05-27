-- Migration 0023: Fix complete_self_signup column-reference ambiguity
-- and add branch-specific phone/address parameters.
--
-- Must drop the old 16-param overload first (PostgreSQL function overloading
-- means CREATE OR REPLACE with a different signature creates a new overload).
drop function if exists public.complete_self_signup(
  text, text, text, text, text, text, text, text, text, text, text, text,
  text, text, text, text
);
--
-- Root cause: RETURNS TABLE(organization_id uuid, branch_id uuid) creates
-- output-parameter variables that shadow table columns. The bare reference
-- `select organization_id from public.profiles` becomes ambiguous.
--
-- Fixes:
-- 1. Rename output params to out_org_id / out_branch_id (app never reads them).
-- 2. Fully qualify all column references with table aliases.
-- 3. Add p_branch_phone, p_branch_address so onboarding can pass
--    branch-specific contact info (falls back to org values).
-- 4. Insert into profile_picture_url (column added by 0022).
-- 5. Keep set search_path = public, pg_temp.
-- 6. Keep auth.uid() validation.

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
  p_timezone text default null,
  p_branch_phone text default null,
  p_branch_address text default null
)
returns table(out_org_id uuid, out_branch_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_org_id uuid := gen_random_uuid();
  v_branch_id uuid := gen_random_uuid();
  v_existing_org_id uuid;
  v_branch_phone text;
  v_branch_address text;
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

  -- If profile already exists and already attached, reject early.
  select pr.organization_id into v_existing_org_id
    from public.profiles pr
    where pr.id = v_user_id;
  if v_existing_org_id is not null then
    raise exception 'You already belong to a shop' using errcode = 'P0001';
  end if;

  -- Prefer branch-specific values; fall back to org values.
  v_branch_phone := coalesce(
    nullif(trim(coalesce(p_branch_phone, '')), ''),
    nullif(trim(coalesce(p_org_phone, '')), '')
  );
  v_branch_address := coalesce(
    nullif(trim(coalesce(p_branch_address, '')), ''),
    nullif(trim(coalesce(p_org_address, '')), '')
  );

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
    v_branch_phone,
    v_branch_address
  );

  insert into public.profiles (
    id, organization_id, branch_id, full_name, role, is_active,
    avatar_url, phone, onboarding_completed, profile_picture_url
  ) values (
    v_user_id, v_org_id, v_branch_id, trim(p_full_name), 'owner', true,
    nullif(trim(coalesce(p_avatar_url, '')), ''),
    nullif(trim(coalesce(p_phone, '')), ''),
    true,
    nullif(trim(coalesce(p_avatar_url, '')), '')
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
  text, text, text, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text
) to authenticated;
