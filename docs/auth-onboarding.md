# Authentication & Owner Onboarding

This document describes how login, signup, first-owner setup, and route protection work in SaleDock Cloud POS.

## Pages

- `/login` — public. Email/password sign in and sign up (tab-switchable).
- `/setup` — requires authentication. Creates the first organization, the first branch, and the owner profile.
- `/dashboard`, `/pos`, `/products`, `/customers`, `/invoices`, `/repairs`, `/reports`, `/settings`, `/users` — require authentication and a profile linked to an organization.

## Flow

1. Visitor opens the app.
2. `proxy.ts` checks the session cookie.
3. If unauthenticated and the path is protected → redirect to `/login`.
4. On `/login`:
   - **Sign in** signs an existing user in with email/password.
   - **Sign up** creates a new auth user (and stores `full_name` in user metadata).
5. After login or signup, server pages call `getCurrentContext()`:
   - If the user has no `profile.organization_id` → redirect to `/setup`.
   - Otherwise → continue to the requested page (or `/dashboard`).
6. `/setup` shows the "create organization" form **only if no organization exists yet**.
   - If at least one organization already exists, setup is locked and the page tells the user to ask the owner for an invite.
7. Submitting the setup form runs `completeSetupAction`, which (using the service role server-side) creates:
   - `organizations` row
   - `branches` row
   - `profiles` row with `role = 'owner'` linked to the auth user
   - Initial `app_settings` row
8. The user is redirected to `/dashboard`.

## Sign out

The top bar shows the signed-in user's name, role, and email, plus a **Sign out** button. Sign out is a server action that calls `supabase.auth.signOut()` and redirects to `/login`.

## Route protection

`src/proxy.ts` (Next.js 16 renamed `middleware.ts` → `proxy.ts`) calls `updateSession()` which:

1. Refreshes the Supabase auth cookie on each request.
2. Redirects unauthenticated requests on protected prefixes to `/login`.
3. Lets authenticated requests through; server components do the finer-grained "has profile / organization" check.

## Service role usage

`SUPABASE_SERVICE_ROLE_KEY` is used **only** in `src/lib/supabase/admin.ts`, which is `import "server-only"` and never bundled to the client. It is used only in trusted server-side bootstrap and admin workflows:

- `src/app/setup/actions.ts` — to create the first owner's organization, branch, and profile (bypasses RLS for the one-time bootstrap).
- `src/app/setup/page.tsx` — to count organizations and decide whether to lock the setup screen.
- `src/app/users/actions.ts` and `src/lib/data/users.ts` — to invite staff through Supabase Auth Admin and combine auth metadata with organization-scoped profiles for owners/admins.

Everything else uses the anon-key SSR client and is bound by RLS.

## RLS assumptions

The existing policies in `supabase/migrations/0001_initial_schema.sql` rely on the helper `public.current_organization_id()`, which reads the calling user's `profiles.organization_id`. Therefore:

- A user with no profile sees no data — and cannot insert into `organizations` directly (there is no INSERT policy on `organizations`).
- The first owner is created via service role, which bypasses RLS.
- After bootstrap, all reads/writes are scoped to the owner's organization automatically.

## Security assumptions

- `.env.local` is git-ignored and must never be committed.
- `SUPABASE_SERVICE_ROLE_KEY` is server-only. It is never imported from a `"use client"` file and never sent to the browser.
- First-owner setup is allowed only when **zero** organizations exist. Once the first organization exists, the setup page is locked and additional users must be invited through `/users` by an owner/admin.
- Password sign-up is open by default. Once the first owner exists, consider disabling self-signup in the Supabase Auth dashboard so random users cannot create dead accounts.

## Auth callback (email confirmation)

The route `src/app/auth/callback/route.ts` handles Supabase email-confirmation links. It:

1. Reads the `code` (and optional `next`) query params.
2. Calls `supabase.auth.exchangeCodeForSession(code)` to set the session cookie.
3. Redirects to `next` if it's a safe relative path, otherwise to `/dashboard`.
4. On failure, redirects to `/login?error=auth_callback_failed`.

The callback always rebuilds the origin from `x-forwarded-host` / `x-forwarded-proto` (Vercel injects these), so a confirmation email opened on a different machine still lands on the public site — not localhost.

For sign-up, `signUpAction` passes `emailRedirectTo: ${origin}/auth/callback?next=/setup` so the first owner lands in `/setup` after confirming. Staff invites use `/auth/callback?next=/dashboard`.

### Supabase dashboard settings (one-time)

In the Supabase dashboard → **Authentication → URL Configuration**, set:

- **Site URL:** `https://saledock-cloud-pos.vercel.app`
- **Redirect URLs (allow list):**
  - `https://saledock-cloud-pos.vercel.app/auth/callback`
  - `http://localhost:3000/auth/callback`

Without those, Supabase rejects the email link's redirect and falls back to its Site URL.

## Registration lock (after first owner)

Once at least one organization exists, public registration is locked:

- The `/login` page hides the **Sign up** tab and shows "Registration is closed. Please contact the owner for access.".
- `signUpAction` server-side rejects any new sign-up attempt with the same message (using the service-role count as the source of truth, so the lock can't be bypassed by manipulating the client).
- `/setup` is also locked when any organization exists (`completeSetupAction` enforces this server-side too).

Existing users (the first owner) sign in normally.

## Staff invites and roles

Owners/admins can open `/users` to invite staff by email, assign a role, choose a branch, update names/roles/branches, deactivate users, reactivate users, and resend pending invites when Supabase Auth reports the account as unconfirmed.

The server protects management changes:

- manager/cashier/technician cannot manage users
- an owner cannot deactivate their own active owner account
- the last active owner/admin cannot be demoted or deactivated

Public signup remains closed; new staff should use the invite email.

## Duplicate Signup Handling

### Email/password duplicate

If a user tries to sign up with an email that already exists, the `signUpAction` catches the error and returns a friendly message instead of the raw Supabase error:

> "An account may already exist for this email. Sign in to continue setup, or use password reset if you forgot your password."

The login form displays the message with "Go to sign in" and "Reset password" action buttons.

**Account enumeration protection:** The server does **not** expose whether an email exists before authentication. The `signInAction` returns a neutral *"Invalid email or password"* regardless of which field caused the error.

### OAuth conflict

If Google/Facebook OAuth returns an identity conflict (email already in use), the callback route redirects to `/settings?tab=accounts&link=conflict` with the message:

> "This email is already used by another sign-in method. Sign in with your original method first, then link this provider from Profile Settings."

See `docs/oauth-account-linking.md` for full details.

## Incomplete Signup Recovery

### Detection

When a signed-in user visits `/login`:
- `getCurrentContext()` checks `profile.organization_id` and `profile.onboarding_completed`
- If either is missing/false, the user is marked as `needsOnboarding`

### Recovery card

Instead of showing the login form, the user sees:

> **Your shop setup is not complete**
> You started setting up SaleDock but did not finish. You can continue where you left off or restart setup.

**Buttons:**
- **Continue setup** → `/onboarding` (preserves existing form data if any)
- **Restart setup** → calls `restartSetupAction`, which:
  1. Verifies the user is authenticated
  2. Checks if the user has no completed org (rejects if already complete)
  3. If a partial org exists (organization_id set but onboarding_completed = false), deletes it safely
  4. Resets the profile to pre-onboarding state (org_id = null, onboarding_completed = false)
  5. Redirects to `/onboarding`
- **Sign out** → switches to another account

### Safety rules for restart

| Scenario | Behavior |
|----------|----------|
| User has no org yet | Redirect to `/onboarding` (no cleanup needed) |
| User has partial org (incomplete) | Delete partial org, reset profile, redirect to `/onboarding` |
| User has completed org | Returns error: *"Your shop setup is already complete. You cannot restart setup."* |
| Unauthenticated user | Returns error: *"You must be signed in."* |

No destructive cleanup runs unless the current user is authenticated and incomplete. The server uses `auth.uid()` exclusively — no arbitrary user_id from the client.

### Auth callback routing

The callback route (`/auth/callback`) handles both login and linking:
- Normal login → checks onboarding status → redirects to `/onboarding` or `/dashboard`
- Account linking (`?linking=1`) → redirects to `/settings?tab=accounts&link=success`

### OAuth incomplete user

If a user signs in with Google/Facebook using an email that already has an incomplete profile:
- Supabase may automatically link the identity by verified email
- The callback routes to `/onboarding` (same as first-time onboarding)
- No duplicate org/profile rows are created

## Status

- SaaS self-service signup: **live** (Stage 2).
- Google OAuth: **configured in code, requires Supabase Dashboard Google provider setup**.
- Facebook OAuth: **configured in code, requires Supabase Dashboard Facebook provider setup + Meta App email permission**.
- Multi-step onboarding wizard: **live** (`/onboarding`).
- Theme customization (primary/accent color, default theme): **live**.
- Staff invite + role assignment flow: **live**.
- Password reset / forgot password: **live**.
- Public sign-up: **open** (self-service).
- Account linking (Google/Facebook): **live** via Settings → Connected Accounts.
- Duplicate signup handling + incomplete signup recovery: **live**.

## Remaining tasks

- Dedicated invitation status columns and granular permission editor.
- Branch switcher for multi-branch organizations.
- Per-role RLS refinements (cashier-only insert on invoices, technician-only writes on repairs, etc.).
- CAPTCHA / rate limiting on public endpoints.
