# Security Hardening

This document outlines the security posture of SaleDock Cloud POS.

## In Code

- RLS enabled on every business table
- RPC EXECUTE grants restricted to authenticated + service_role (migration 0012)
- Function search_path hardened on `set_updated_at`, `current_organization_id`, `current_user_role` (0010)
- Service role key is server-only — never bundled to the browser (`"server-only"` import guard)
- POS checkout is atomic, security invoker, server-side total recompute
- Strict service required-field enforcement at database layer (0013)
- Loss-prevention events populated via `audit_logs` trigger (0013)
- New SaaS RPC `complete_self_signup` is SECURITY DEFINER with set search_path (0018)
- All OAuth secrets (Google, Facebook, Apple) only in Supabase Dashboard, never in code
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

 ## Platform Admin Console Security

- `requirePlatformAdmin()` is called in every platform data function — redirects non-admins to `/login`
- Platform console shows aggregate metrics only — no tenant secrets, auth tokens, or passwords exposed
- `isPlatformAdmin()` is a lightweight server-side boolean check for conditional UI rendering
- `PLATFORM_ADMIN_EMAILS` env var provides fallback access when the `platform_admins` table is empty
- Sidebar Platform link is conditionally rendered based on `isPlatformAdmin()` — never shown to regular users
- `/platform` route is protected by middleware (in `protectedPrefixes`)

 ## CAPTCHA Protection

Google reCAPTCHA v2 Checkbox protects public auth forms from spam and abuse:

- **Sign in** — email/password sign-in requires CAPTCHA
- **Sign up** — new account registration requires CAPTCHA
- **Forgot password** — password reset email requires CAPTCHA
- **OAuth** — Google and Facebook sign-in buttons do NOT require CAPTCHA
- **Authenticated actions** — settings, dashboard, and server-to-server callbacks do NOT require CAPTCHA

### How it works

1. `Recaptcha` client component (`src/components/auth/recaptcha.tsx`) renders the widget on login forms
2. On form submit, the reCAPTCHA token is included as a hidden field `recaptchaToken`
3. Server actions (`signInAction`, `signUpAction`, `resetPasswordAction`) call `verifyRecaptchaToken()` before proceeding
4. `verifyRecaptchaToken()` POSTs the token + secret to `https://www.google.com/recaptcha/api/siteverify`

### Env vars

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` | Yes (production) | reCAPTCHA site key (public, safe in client bundle) |
| `RECAPTCHA_SECRET_KEY` | Yes (production) | reCAPTCHA secret key (server-only, never in client bundle) |

### Local / development behavior

- If both env vars are missing in development, CAPTCHA is bypassed with a console warning
- If `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` is missing, the widget is hidden and a dev warning badge is shown
- If `RECAPTCHA_SECRET_KEY` is missing, `verifyRecaptchaToken()` bypasses in dev with `console.warn`, but **fails closed** in production

### OAuth exclusion

OAuth actions (`signInWithGoogleAction`, `signInWithFacebookAction`, `linkGoogleAccountAction`, `linkFacebookAccountAction`) do NOT call `verifyRecaptchaToken()`. OAuth redirects go through the provider's own security verification.

### Security

- The secret key (`RECAPTCHA_SECRET_KEY`) is never logged, never exposed to the client, and never returned in error messages
- Google's raw error details are never forwarded to the user — only generic "Security check failed" messages
- The verification helper has no access to user data or session tokens
- If the secret is exposed, rotate it immediately in the Google reCAPTCHA admin console

### Google reCAPTCHA admin

- Admin URL: https://www.google.com/recaptcha/admin
- Domain: `saledock-cloud-pos.vercel.app`
- Type: v2 Checkbox ("I'm not a robot")
- Add `localhost` for local development

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
