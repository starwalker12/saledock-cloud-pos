# Profile Self-Update Authorization Containment

## Scope

Task 74105 contains an authenticated self-profile privilege escalation at the database boundary. It does not resume Cashier production coverage and does not access or mutate production.

Vulnerable base: `bbcc74f46c1c65b499e7a75d9d2d9a3b27ea9020`.

## Root Cause

`public.profiles` had table-wide `UPDATE` for `authenticated`. The existing UPDATE policy correctly limited rows to `id = auth.uid()`, but it did not restrict columns. An ordinary authenticated user could therefore mutate authorization-bearing fields on their own row through the Data API.

The deterministic loopback baseline accepted and persisted self-updates to `role`, `organization_id`, `branch_id`, and `is_active`. It also accepted a mixed `profile_picture_url` plus `role` request atomically. The same own-row policy blocked updates to another profile.

## Column Classification

| Profile column | Direct authenticated behavior before | Legitimate use | Intended direct authenticated behavior |
| --- | --- | --- | --- |
| `id` | Writable on own row | Auth identity / primary key | Denied; server-managed |
| `organization_id` | Writable on own row | Onboarding, invite, privileged assignment | Denied; privileged/server-managed |
| `branch_id` | Writable on own row | Invite and owner/admin staff management | Denied; privileged/server-managed |
| `full_name` | Writable on own row | Onboarding, invite and owner/admin staff management | Denied; privileged/server-managed |
| `role` | Writable on own row | Invite and owner/admin staff management | Denied; privileged/server-managed |
| `is_active` | Writable on own row | Owner/admin deactivate/reactivate | Denied; privileged/server-managed |
| `last_login_at` | Writable on own row | Login metadata | Denied; server-managed |
| `created_at` | Writable on own row | Database lifecycle metadata | Denied; server-managed |
| `updated_at` | Writable on own row | `set_updated_at` trigger | Denied explicitly; trigger-managed |
| `avatar_url` | Writable on own row | Legacy onboarding compatibility | Denied; server-managed |
| `phone` | Writable on own row | Onboarding/invite identity | Denied; privileged/server-managed |
| `onboarding_completed` | Writable on own row | Authenticated onboarding RPC and invite acceptance | Denied; privileged/server-managed |
| `username` | Writable on own row | Reserved profile identity field | Denied; server-managed |
| `profile_picture_url` | Writable on own row | Settings profile-picture self-service | Allowed only on `auth.uid()`'s row |

## Containment

The forward-only migration fails closed unless `authenticated` still has the expected table-level UPDATE privilege, then:

1. revokes table-wide UPDATE on `public.profiles` from `authenticated`;
2. grants UPDATE only on `profile_picture_url` to `authenticated`;
3. leaves the existing own-row RLS policy unchanged.

`anon` receives no new capability. `service_role` remains able to perform existing owner/admin Users, invitation, and setup writes. `complete_self_signup` remains an authenticated, guarded SECURITY DEFINER RPC and is not broadened.

## Failure Semantics

A request containing any protected profile column receives PostgreSQL `42501`. A mixed allowed/protected payload fails as one statement; the allowed picture field does not partially persist. An allowed picture update against another profile matches zero rows under RLS.

## Local Proof

The fixed-state direct Data API test covers every profile column, manager/technician/cashier role escalation attempts, cross-organization and cross-branch reassignment, deactivation and self-reactivation, mixed-payload atomicity, another-user protection, and the legitimate own profile-picture update.

Privileged regression proof retains:

- service-role role, branch, deactivate, and reactivate writes;
- the Users action self-role and self-deactivate blocks;
- the last-active-owner/admin safety checks;
- service-role invitation profile and permission assignment;
- authenticated guarded onboarding through `complete_self_signup`;
- session role/organization/branch reads;
- unchanged `staff_permissions` truth.

No callable SECURITY DEFINER function was found that lets an already assigned staff user rewrite its authorization profile. `complete_self_signup` rejects unauthenticated callers and users already attached to an organization.

## Safety

All fixtures are loopback-only and task-owned. Accepted tests require exact opening/closing auth and business signatures. Production access and production mutations are zero. No application source, permission defaults, accounting, settlement, stock/FIFO, Cash Drawer, thermal, Reports, or canonical document changes are included.

## Evidence

Evidence is retained outside Git at:

`/Users/sw12/Projects/saledock-local-evidence/profile-self-update-authorization-containment`

The sealed bundle contains 11 verified entries. Manifest-file SHA-256:

`18749000a54d12f8baccd4633ec9f9933d673f6b7636df6e8b433264bc67faf6`

## Validation Results

- focused source/database contracts: 7/7;
- loopback direct Data API E2E: 1/1 with zero retries;
- relevant Node contracts: 37/37;
- complete Node suite: 371/371;
- existing authentication and role authorization smoke: 9/9;
- lint: zero errors and two pre-existing `privacy-center.tsx` hook warnings;
- typecheck: pass;
- production build: pass;
- database security advisor: zero errors and one unrelated existing `get_sales_by_day` search-path warning;
- baseline and fixed-state fixture cleanup: exact opening/closing signatures.

Discarded launches are retained truthfully. The first complete Node launch was 369/371 because the two seed-stock checks lacked their documented loopback environment; the corrected run passed 371/371. The first build launch hit Turbopack's external `node_modules` symlink guard; the corrected local dependency tree build passed. Authentication smoke launches with missing local CAPTCHA configuration or a mismatched 127.0.0.1 development origin were not treated as clean passes; the final matching `localhost` run passed 9/9.

## Delivery Boundary

The authorization defect remains open until independent owner review, authorized delivery, migration/deployment verification, and a later bounded production containment check. This task stops at a draft pull request and does not deploy the migration.

Rollback concept: restore the former authenticated table-wide UPDATE grant only after a security review of every profile column; do not remove the migration from applied history.
