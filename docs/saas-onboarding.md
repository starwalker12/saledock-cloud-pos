# SaaS Multi-Shop Onboarding

This document describes the self-service multi-tenant SaaS architecture and the
shop onboarding wizard added in Stage 2 of the project.

## Architecture

### Shared database, isolated by `organization_id`

All shops share one Supabase project. Data isolation is enforced by:

- **`organization_id`** column on every business table.
- **RLS policies** that filter rows to the current user's organization
  via `public.current_organization_id()`.
- **`complete_self_signup` RPC** (security definer) to bootstrap a new
  organization without exposing the service role.

We chose **not** to create one database per shop because:

- Supabase free/Pro tier has a project limit.
- Schema migrations must be applied everywhere.
- Cross-shop analytics and admin tooling require UNION queries.
- Backup/restore is simpler with one database.

### Tenant onboarding flow

```
[Login/Signup] → [Auth Callback] → [Onboarding Wizard] → [Dashboard]
                                      ↓
                              Creates org + branch + profile + settings
                                      ↓
                              Sets onboarding_completed = true
```

## Onboarding Wizard

Located at `/onboarding`. 5-step wizard:

1. **Owner Profile** — full name, phone, avatar URL
2. **Shop Profile** — shop name, owner name, contact info, currency, timezone
3. **Branch Setup** — first branch details
4. **Branding** — logo URL, primary color, accent color, default theme
5. **Confirm & Create** — review and submit

### Backend

The wizard calls `complete_self_signup` RPC via `supabase.rpc()`. This RPC:

1. Validates the user is authenticated via `auth.uid()`.
2. Rejects if user already belongs to a shop.
3. Creates: `organizations`, `branches`, `profiles`, `app_settings`, `audit_logs`
4. Returns `organization_id` and `branch_id`

The RPC is `SECURITY DEFINER` and runs with the privileges of the function owner
(which has bypass-RLS access via service role), not the calling user.

## Existing user compatibility

Production orgs created before this PR have `onboarding_completed = true`
set by migration 0018 back-fill. Existing owners/admins log in and go
straight to `/dashboard` — they never see the onboarding wizard.

## Route protection

- `/login` — public
- `/auth/callback` — public (exchanges OAuth/email code for session)
- `/onboarding` — requires authentication, but does NOT require organization
- All other routes require authentication + organization + onboarding_complete
- The proxy middleware redirects unauthenticated users from protected routes
  to `/login`

## User states

| State | Redirect |
|-------|----------|
| Not signed in | `/login` |
| Signed in, no org | `/onboarding` |
| Signed in, org exists, onboarding not done | `/onboarding` |
| Signed in, org exists, onboarding done | `/dashboard` |
