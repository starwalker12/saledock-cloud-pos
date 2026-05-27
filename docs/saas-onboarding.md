# SaaS Onboarding (SaleDock)

## Overview

SaleDock is a multi-tenant cloud POS. Each tenant (shop) gets an organization,
a first branch, an owner profile, and default app_settings. All tenants share
one Supabase project, isolated by `organization_id`.

## Onboarding Flow

1. User signs up via email/password or Google/Facebook OAuth.
2. After signup, redirect to `/onboarding` if no org exists.
3. 5-step wizard: Profile → Shop → Branch → Branding → Confirm.
4. Final step calls `complete_self_signup` RPC (migration 0019) to atomically
   create org, branch, profile, app_settings, and audit log.
5. On success, redirect to `/dashboard`.

## RPC: `complete_self_signup`

- Security definer function, `set search_path = public`.
- Validates `auth.uid()` is not null and doesn't already have an org.
- Uses `v_` prefix local variables to avoid ambiguous column references.
- Outputs `table(out_org_id uuid, out_branch_id uuid)` — disambiguated from
  table column names.
- Grants execute to `authenticated` role.

## Schema Fields (migration 0019)

### profiles additions
- `username text` — globally unique when non-empty (partial unique index)
- `profile_picture_url text` — replaces `avatar_url`
- `phone` — partially unique (non-null/non-empty only)

### organizations additions
- `slug`, `owner_name`, `phone`, `whatsapp`, `email`, `address`, `logo_url`
- `primary_color`, `accent_color`, `default_theme` (check light/dark/system)
- `google_maps_url`, `latitude`, `longitude`, `show_map boolean`
- `social_links jsonb default '[]'`
- `onboarding_completed boolean`

### branches additions
- `phone`, `address`, `google_maps_url`, `latitude`, `longitude`

## Uniqueness Rules

- Username: globally unique, case-insensitive, only when non-empty.
- Profile phone: globally unique, only when non-empty.
- Organization slug: globally unique, only when non-empty.
- Organization email: globally unique, only when non-empty.
- Organization phone: globally unique, only when non-empty.
- Shop name: NOT unique — multiple tenants may share a name.

## Onboarding Fields

| Step | Fields |
|---|---|
| Profile | Full name, Username, Phone, Email (read-only), Profile picture URL |
| Shop | Shop name, Owner name, Phone, WhatsApp, Email, Address, Currency, Timezone, Google Maps link, Lat/Lng, Show map toggle |
| Branch | Branch name, Phone, Address, Google Maps link, Lat/Lng |
| Branding | Logo URL, Primary color, Accent color, Theme, Social links (add/remove rows) |
| Confirm | Review all data, then submit |

## Geolocation

- "Use my current location" button requests browser geolocation.
- Saves latitude/longitude if user allows.
- Does NOT require a Google Maps API key.
- Google Maps link is a user-provided URL (e.g. `https://maps.app.goo.gl/...`).
- "Show map on receipts" toggle — no paid API needed for link-only display.

## Social Links

- Stored as `social_links jsonb` on the organizations table.
- Format: `[{ "platform": "Instagram", "url": "..." }, ...]`
- Platforms: Instagram, Facebook, TikTok, X / Twitter, Snapchat, YouTube,
  LinkedIn, Website, WhatsApp Channel, Other.
- Add/remove rows in onboarding and settings.

## Currency / Timezone

- Default currency is inferred from browser Intl timezone (PKR for Asia/Karachi,
  AED for Asia/Dubai, USD for America/New_York, etc.).
- User can override.
- Timezone defaults from `Intl.DateTimeFormat().resolvedOptions().timeZone`.
- Fallback: PKR / Asia/Karachi.

## Theme Preview

- Primary/accent colors and theme apply live to onboarding buttons, progress
  bar, and step indicators.
- Branding step includes a "Live Preview" card showing the colors applied.
- Hex colors validated with regex.
- Colors only affect UI chrome — body text stays readable (black/white).

## Image Upload

Supabase Storage is **not yet configured**. Current behavior:
- URL input only (logo URL, profile picture URL).
- Upload UI placeholder exists but stores no files.
- See `setup/settings/settings-form.tsx` for the current "deferred" storage note.
- Buckets needed: `organization-logos`, `user-avatars` (or `profile-pictures`).
- Path convention: `orgs/{organization_id}/logo.*`, `orgs/{organization_id}/profile-pictures/{user_id}.*`
- Allowed types: image/png, image/jpeg, image/webp. Max 2 MB.
