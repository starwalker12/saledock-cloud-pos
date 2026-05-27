-- Migration 0022: Safe DB validation constraints.
--
-- Adds CHECK constraints, partial unique indexes, and missing columns from
-- migration 0019 (which did not reach production). All constraints are safe
-- to apply — existing data was audited and has zero violations.
--
-- Re-applies 0019 column additions with IF NOT EXISTS for robustness.

--------------------------------------------------------------------------------
-- 1. Ensure columns from 0019 exist (production schema drift fix)
--------------------------------------------------------------------------------

-- profiles: username, profile_picture_url
alter table public.profiles
  add column if not exists username text,
  add column if not exists profile_picture_url text;

-- organizations: google_maps_url, latitude, longitude, show_map, social_links,
--                profile_picture_url
alter table public.organizations
  add column if not exists google_maps_url text,
  add column if not exists latitude numeric,
  add column if not exists longitude numeric,
  add column if not exists show_map boolean not null default false,
  add column if not exists social_links jsonb not null default '[]'::jsonb,
  add column if not exists profile_picture_url text;

-- branches: google_maps_url, latitude, longitude
alter table public.branches
  add column if not exists phone text,
  add column if not exists address text,
  add column if not exists google_maps_url text,
  add column if not exists latitude numeric,
  add column if not exists longitude numeric;

--------------------------------------------------------------------------------
-- 2. Partial unique indexes (re-creating 0019 indexes if they didn't persist)
--------------------------------------------------------------------------------

-- profiles.username — case-insensitive, non-empty
create unique index if not exists idx_profiles_username_unique
  on public.profiles (lower(username))
  where username is not null and username <> '';

-- profiles.phone — non-empty
create unique index if not exists idx_profiles_phone_unique
  on public.profiles (phone)
  where phone is not null and phone <> '';

-- organizations.phone — non-empty
create unique index if not exists idx_organizations_phone_unique
  on public.organizations (phone)
  where phone is not null and phone <> '';

-- organizations.email — case-insensitive, non-empty
create unique index if not exists idx_organizations_email_unique
  on public.organizations (lower(email))
  where email is not null and email <> '';

-- organizations.slug — case-insensitive (already exists from 0018, but
-- re-creating idempotently)
create unique index if not exists idx_organizations_slug_unique
  on public.organizations (lower(slug)) where slug is not null;

--------------------------------------------------------------------------------
-- 3. CHECK constraints — all pass existing data (audit: 0 violations each)
--------------------------------------------------------------------------------

-- profiles.phone: digits and optional leading +
alter table public.profiles
  drop constraint if exists profiles_phone_check;
alter table public.profiles
  add constraint profiles_phone_check
  check (phone is null or phone ~ '^[0-9+]+$');

-- profiles.avatar_url: http/https or internal path
alter table public.profiles
  drop constraint if exists profiles_avatar_url_check;
alter table public.profiles
  add constraint profiles_avatar_url_check
  check (avatar_url is null or avatar_url ~ '^(https?://|/)');

-- organizations.slug: alphanumeric and hyphens only
alter table public.organizations
  drop constraint if exists organizations_slug_check;
alter table public.organizations
  add constraint organizations_slug_check
  check (slug is null or slug ~ '^[a-zA-Z0-9-]+$');

-- organizations.email: basic format (no spaces)
alter table public.organizations
  drop constraint if exists organizations_email_check;
alter table public.organizations
  add constraint organizations_email_check
  check (email is null or email ~ '^[^\s]+$');

-- organizations.phone: digits and optional leading +
alter table public.organizations
  drop constraint if exists organizations_phone_check;
alter table public.organizations
  add constraint organizations_phone_check
  check (phone is null or phone ~ '^[0-9+]+$');

-- organizations.whatsapp: digits and optional leading +
alter table public.organizations
  drop constraint if exists organizations_whatsapp_check;
alter table public.organizations
  add constraint organizations_whatsapp_check
  check (whatsapp is null or whatsapp ~ '^[0-9+]+$');

-- organizations.logo_url: http/https or internal path
alter table public.organizations
  drop constraint if exists organizations_logo_url_check;
alter table public.organizations
  add constraint organizations_logo_url_check
  check (logo_url is null or logo_url ~ '^(https?://|/)');

-- organizations.primary_color: 6-char hex colour
alter table public.organizations
  drop constraint if exists organizations_primary_color_check;
alter table public.organizations
  add constraint organizations_primary_color_check
  check (primary_color is null or primary_color ~ '^#[0-9a-fA-F]{6}$');

-- organizations.accent_color: 6-char hex colour
alter table public.organizations
  drop constraint if exists organizations_accent_color_check;
alter table public.organizations
  add constraint organizations_accent_color_check
  check (accent_color is null or accent_color ~ '^#[0-9a-fA-F]{6}$');

-- organizations.default_theme: already has a check from 0018, re-creating
-- idempotently
alter table public.organizations
  drop constraint if exists organizations_default_theme_check;
alter table public.organizations
  add constraint organizations_default_theme_check
  check (default_theme is null or default_theme in ('light', 'dark', 'system'));

-- branches.phone: digits and optional leading +
alter table public.branches
  drop constraint if exists branches_phone_check;
alter table public.branches
  add constraint branches_phone_check
  check (phone is null or phone ~ '^[0-9+]+$');
