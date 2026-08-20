# Anonymous Profile UPDATE Privilege Hardening

## Scope

The original Task 38062 source stage removes an unnecessary PostgreSQL `UPDATE` grant on `public.profiles` from `anon`. This is defense-in-depth least-privilege hardening. No anonymous row-write exploit was proven, that source stage did not access production, and Cashier production coverage remains separate.

Base: `98f8e6b48bd588a39e2ff9ae235bf8ce8e281112`.

## Origin Analysis

Classification: **B - Supabase/default database privilege behavior**.

Repository migration history contains no explicit `GRANT UPDATE` or `GRANT ALL` on `public.profiles` to `anon`, and it contains no repository-authored `ALTER DEFAULT PRIVILEGES`. The isolated Supabase database showed public-schema default table ACLs from both `postgres` and `supabase_admin` granting CRUD to `anon`, `authenticated`, and `service_role`. The original `public.profiles` table ACL therefore included table-wide anonymous `UPDATE` even though no anonymous UPDATE RLS policy existed.

The current `anon` table grants for `SELECT`, `INSERT`, and `DELETE` were inventoried but are not changed by this task.

## Legitimate Flow Review

No legitimate application flow requires anonymous callers to update `public.profiles`:

- signup calls Supabase Auth `signUp` without a profile-table write;
- OAuth callback exchanges an authenticated session and reads profile state;
- onboarding calls authenticated, guarded `complete_self_signup`, which requires `auth.uid()`;
- invitation, setup, and owner/admin user management use the service-role client;
- profile-picture self-service runs under the authenticated user's session;
- password and reset flows do not update the profile table anonymously.

An isolated signup/authentication smoke confirmed public signup, confirmation, and sign-in without an anonymous profile UPDATE. The profile row remained absent until the authenticated onboarding boundary.

## Local Baseline

Before the new migration, isolated PostgreSQL truth was:

- anonymous table UPDATE: `true`;
- anonymous UPDATE on all 14 current profile columns: `true`;
- RLS: enabled and not forced;
- UPDATE policies for anonymous callers: none;
- authenticated table UPDATE: `false`;
- authenticated `profile_picture_url` UPDATE: `true`;
- authenticated UPDATE on every other current profile column: `false`;
- service-role table and column UPDATE: `true`.

A task-owned anonymous Data API baseline attempted `role`, `organization_id`, `branch_id`, `is_active`, `profile_picture_url`, and a mixed payload. Each request returned HTTP 200 with zero returned rows, and the profile remained byte-for-byte unchanged. RLS therefore blocked the available grant from reaching a writable row. This was not an anonymous exploit.

## Correction

The forward-only migration is:

`supabase/migrations/20260814002317_revoke_anon_profile_update.sql`

Its only privilege mutation is:

```sql
revoke update on table public.profiles from anon;
```

The migration fails closed unless the expected pre-migration anonymous table/column UPDATE privilege exists. It then verifies dynamically that all current profile columns have lost anonymous UPDATE while authenticated containment and service-role management remain intact.

The migration does not grant a replacement privilege, modify RLS, modify profile data, add triggers, or alter application source.

## Privilege Differential

| Capability | Before | After |
| --- | --- | --- |
| `anon` table UPDATE | `true` | `false` |
| `anon` column UPDATE, all 14 columns | `true` | `false` |
| `authenticated` table UPDATE | `false` | `false` |
| `authenticated` `profile_picture_url` UPDATE | `true` | `true` |
| `authenticated` protected-column UPDATE | `false` | `false` |
| `service_role` table/column UPDATE | retained | retained |
| profile RLS policies | existing authenticated policies | unchanged |

The 14 dynamically verified columns are `id`, `organization_id`, `branch_id`, `full_name`, `role`, `is_active`, `last_login_at`, `created_at`, `updated_at`, `avatar_url`, `phone`, `onboarding_completed`, `username`, and `profile_picture_url`.

After hardening, direct anonymous role, organization, branch, active-state, picture, and mixed PATCH requests each returned HTTP 401 / PostgreSQL `42501`; no row changed.

## Authenticated And Privileged Regression

PR #345 containment remains exact:

- authenticated table UPDATE remains false;
- authenticated own `profile_picture_url` update succeeds;
- another-user picture update matches zero rows under RLS;
- role, organization, branch, self-reactivation, and mixed protected payloads remain denied atomically with `42501`;
- service-role profile management remains available;
- invitation profile assignment, owner/admin management, deactivate/reactivate, authenticated onboarding, session profile reads, and `staff_permissions` behavior pass.

The profile RLS policy definitions are unchanged:

- SELECT: authenticated, own profile or current organization;
- UPDATE: authenticated, `USING (id = auth.uid())`, `WITH CHECK (id = auth.uid())`.

The existing profile authorization E2E was updated only at its anonymous-picture assertion. The prior expected RLS zero-row response is now correctly a grant-layer `42501` denial. Its authenticated and privileged assertions are unchanged.

## Validation

- focused hardening contracts: 5/5;
- combined focused/existing profile contracts: 12/12;
- direct database/Data API hardening E2E: 1/1, zero retries;
- existing profile authorization E2E: 1/1, zero retries;
- complete Node suite: 372/372;
- authentication/role browser smoke: 9/9;
- lint: zero errors, two unrelated existing `privacy-center.tsx` hook warnings;
- typecheck: pass;
- production build: pass;
- database lint: zero errors and one unrelated existing unused `v_branch_id` warning in `create_invoice_return`;
- accepted fixture cleanup: exact opening/closing business and auth signatures.

Discarded setup runs are retained truthfully. The first direct-contract launch found only a comment-text false positive in the new source contract and was corrected without weakening the SQL assertions. The first existing profile E2E launch exposed its obsolete anonymous RLS-response expectation; the final run passed after the narrow expected `42501` update. The first application-server launch did not run tests because Next 16 rejected the task-owned external `node_modules` symlink; the local cloned dependency tree launch passed. Development browser smoke retained the repository's existing CSP nonce hydration warning.

## Safety And Delivery Boundary

All database and browser proof used an isolated loopback Supabase project. Production login, SQL, Data API, Vercel, and mutations were zero. No application source, profile data, RLS, accounting, settlement, stock/FIFO, Cash Drawer, canonical document, package, lockfile, workflow, or configuration file changed.

The local evidence bundle is retained outside Git at:

`/Users/sw12/Projects/saledock-local-evidence/anon-profile-update-privilege-hardening`

The sealed manifest verifies 14 entries. Manifest-file SHA-256:

`8abdcbbdd47f01441936642d6be4d97686d8a7791d1ac17de87c381ee9e5cf8f`

The statements above describe the original source task boundary before owner-authorized delivery. Production delivery and verification are recorded separately below. Cashier coverage was not resumed.

Rollback concept: a future reviewed forward migration could restore only `UPDATE ON public.profiles TO anon`. It must never restore authenticated table-wide UPDATE, and it must not modify RLS or profile data.

## Production Delivery And Verification

Owner-reviewed PR #346 delivered reviewed head
`4e08185333521acc328e65714d581ff70497a88c` by squash merge as
`1dcb5a46652cc8c7daf5fb94d76fd24974fbeee6` at
`2026-08-20T22:34:09Z`. Main CI run `32424848023` succeeded. Vercel
Production deployment `dpl_7Actsb9NpBm8Kjj56ER8TweUd8Lw` reached Ready
for that exact main; the canonical root and login routes returned HTTP 200.

The trusted production project was `bvxyxrdskjryepwjmsvc`. A genuine catalog
snapshot was captured before the PR was marked ready or merged. Production then
contained 51 migrations, `20260813225513` exactly once, and no
`20260814002317` entry. Anonymous table UPDATE was true, and anonymous UPDATE
was true on all 14 current profile columns. Authenticated table UPDATE was
false, authenticated column UPDATE was true only for
`profile_picture_url`, and service-role table UPDATE was true.

Delivery pathway: **B - post-merge appearance before task-owned application**.
The target migration remained absent on the first post-merge history check.
Before any task-owned push or SQL execution, the linked migration-list safety
check showed version `20260814002317` present exactly once; an independent
production history read confirmed the same result. No duplicate application or
history repair was attempted. The applying actor or mechanism is not proven and
is not claimed.

The actual post-migration catalog proves:

- `anon` table UPDATE: `false`;
- `anon` UPDATE on every current profile column: `false`;
- `anon` SELECT, INSERT, and DELETE: unchanged at `true`;
- `authenticated` table UPDATE: unchanged at `false`;
- `authenticated` UPDATE on `profile_picture_url`: unchanged at `true`;
- `authenticated` UPDATE on every other profile column: unchanged at `false`;
- `service_role` table and all-column UPDATE: retained;
- RLS enabled state, policy set, `USING`, and `WITH CHECK`: unchanged.

No anonymous production PATCH, authenticated protected-field PATCH, same-value
write probe, or profile-picture write probe was sent. Counts and
order-independent digests matched before and after across 20 protected public
relations plus `auth.users`; profile, audit, auth-account, and business-row
mutations were zero.

Production evidence is retained outside Git at:

`/Users/sw12/Projects/saledock-local-evidence/anon-profile-update-privilege-production-verification`

The sealed bundle contains 18 verified entries. Manifest-file SHA-256:

`3ae1864be6b7313b26c9e623457507373958126c64e07e32c6569d779e557769`

Anonymous profile UPDATE grant hardening is closed and production verified. No
anonymous exploit was proven or attempted. The profile authorization blocker is
closed. Authenticated Cashier production coverage remains open and was not
resumed.
