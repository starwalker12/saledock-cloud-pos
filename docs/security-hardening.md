# Security Hardening

This document outlines the security posture of Gadget Zone Online POS.

## In Code

- RLS enabled on every business table
- RPC EXECUTE grants restricted to authenticated + service_role (migration 0012)
- Function search_path hardened on `set_updated_at`, `current_organization_id`, `current_user_role` (0010)
- Service role key is server-only — never bundled to the browser (`"server-only"` import guard)
- POS checkout is atomic, security invoker, server-side total recompute
- Strict service required-field enforcement at database layer (0013)
- Loss-prevention events populated via `audit_logs` trigger (0013)
- New SaaS RPC `complete_self_signup` is SECURITY DEFINER with set search_path (0018)
- Google OAuth secrets only in Supabase Dashboard, never in code
- Auth callback blocks open redirects (only relative `next` paths accepted)
- Password has minimum 8-character validation on client and server

## SaaS-Specific Security (Stage 2)

- `complete_self_signup` RPC verifies `auth.uid() is not null`
- RPC rejects if user already has `organization_id` (cannot create second shop)
- No user can pass arbitrary `organization_id` — the RPC generates it server-side
- Staff invited through `/users` are assigned the existing org, not a new one
- Public signup creates auth user + RPC-validated org (no service role in browser)
- Onboarding completion is recorded both in `profiles.onboarding_completed` and
  `organizations.onboarding_completed` for defense-in-depth

## Supabase Dashboard (Manual)

- Enable leaked password protection: Authentication → Providers → Email → Password security
- (Optional) Disable open email signups after sufficient adoption
- Configure email templates for staff invites
- Set Site URL and Redirect URLs in Authentication → URL Configuration
- Configure Google OAuth provider in Authentication → Providers → Google

## CAPTCHA & Rate Limiting (Recommended)

- Supabase supports CAPTCHA protection for auth endpoints:
  Authentication → Settings → CAPTCHA protection (turn on, requires hCaptcha key)
- Consider rate limiting on `signInAction`, `signUpAction`, and `resetPasswordAction`
- Future: add Cloudflare Turnstile or Google reCAPTCHA to login form

## Testing Checklist

- Exising owner login → dashboard (not onboarding)
- New email signup → onboarding wizard
- New Google signup → onboarding wizard (once provider configured)
- Onboarding creates org/branch/profile/settings
- Dashboard loads empty fresh shop
- New shop cannot see old shop data
- Staff invite still works
- Invited staff does not create new shop
- Logo/avatar/theme save correctly
- Dark/light mode still readable
- Print receipts light/white
- Backup import remains owner/admin only
