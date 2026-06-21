# Privileged Server and Backup Safety Audit

**Date:** 2026-06-21

**Baseline:** `1384f0d`

**Scope:** Service-role Supabase use plus backup/import/export actions and UI.

## Service-role inventory

| Area | Why privileged access is used | Guard and scope | Browser exposure | Finding |
|---|---|---|---|---|
| `src/lib/supabase/admin.ts` | Creates the shared service-role client | `import "server-only"`; key is read from non-public env | No client import found | Safe foundation. |
| Auth password/session actions | First-time password provider update; current user's auth sessions | Authenticated user; `updateUserById(user.id)` and session query by `user.id` | Returns only safe state/session fields | Raw Admin error masking is live in PR #269. |
| Login rate limiting | Count/record attempts even without a user session | Email + client IP + attempt type | Returns only allowed/denied | Appropriate privileged use. |
| First-owner setup | Create initial org/branch/profile while no tenant RLS context exists | Authenticated user; global one-organization lock; rollback cleanup on partial failure | Returns safe setup state | Appropriate bootstrap exception. |
| Staff users and invitations | Read Auth email/sign-in metadata and manage invite lifecycle | Users page/actions require Owner/Admin; tenant records filter `organization_id`; public acceptance uses a hashed invite token | Auth users outside the current org are never returned to the UI | Broad `listUsers` stays server-only; narrower lookup is a future scale improvement. |
| Staff permission editor | Write permission overrides despite RLS | Owner/Admin action; organization ID from current profile; target must belong to the same organization and cannot be Owner/Admin | Returns editor-safe fields only | Crafted target protection is live in PR #269. |
| Shop settings and app logo | Reliable server rendering and settings writes | Current authenticated profile supplies organization/branch IDs | Only branding/settings fields are returned | Scoped; service role is convenient rather than essential in some reads. Prefer RLS client in future refactors. |
| Platform console/privacy requests | Cross-tenant support/admin views | `requirePlatformAdmin` or equivalent page guard | Only platform-admin pages receive the data | Appropriate privileged use. |
| Public platform feature flags | Login/public pages need selected flags before auth | Call sites use fixed keys such as signup, maintenance, demo, backup, and reset flags | Only the selected setting value is rendered | Safe today; an explicit key allowlist would reduce future misuse risk. |
| Backup/demo feature flags | Read platform enable/disable switches | Fixed key; mutation action separately requires Owner/Admin (reset Owner-only) | Boolean only | Appropriate. |

## Service-role conclusions

1. No service-role key is referenced by a `NEXT_PUBLIC_*` variable.
2. No `"use client"` module imports `createAdminClient` or the admin helper.
3. The shared helper is protected by `server-only`, so accidental client imports
   fail the build rather than bundling the key.
4. Platform-wide privileged data is guarded by a platform-admin check.
5. Tenant UI data is filtered/mapped to the authenticated user's organization.
6. No service-role client object, token, or raw auth-user list is returned to the
   browser.
7. One raw Admin error and one crafted permission-target gap were found and
   fixed in PR #269.

## Deferred privileged-access improvements

- Replace project-wide `auth.admin.listUsers({ perPage: 1000 })` joins with a
  narrower server-side lookup strategy before staff counts approach that limit.
- Consider a fixed-key type/allowlist for public platform settings.
- Prefer the RLS session client for branding/sidebar reads when reliability no
  longer requires the admin fallback.

These are defense-in-depth/scale improvements, not evidence of current browser
key exposure or a confirmed cross-tenant read.

## Backup/import/export audit

| Check | Result | Evidence / follow-up |
|---|---|---|
| Import start permission | Owner/Admin required | `startImportJobAction` checks current profile role. |
| Import chunk permission | Owner/Admin required | Desktop and online chunk actions repeat the server-side role guard. |
| Import status permission | Owner/Admin required | PR #270 adds the same server-side guard used by import start/chunk actions. |
| Export permission | Owner/Admin required | `fetchExportDataAction` checks role and organization. |
| Factory reset permission | Owner only | App action, RPC, and UI align after PRs #267/#268. |
| Organization scope | Present | Job/mapping reads and writes include current `organization_id`; RLS also scopes the tracking tables. |
| File type/size | Enforced before parsing | PR #270 enforces ZIP extension, non-empty file, and 50 MB maximum before parsing. |
| Dry run | Present | Browser preview checks shape/counts and identifies orphan rows before writes. |
| Orphan policy | Explicit and server-rechecked | User must stop or drop; server chunk action verifies the policy. |
| Import behavior | Additive/merge, irreversible | Confirmation explicitly says data is appended and there is no rollback. |
| Destructive behavior during import | None found | Import uses inserts/upserts; no truncate, wipe, or automatic delete path is used. |
| User-facing errors | Safe at top level and per-row | PR #270 replaces raw warning text with safe record-specific wording. |
| Failure cleanup | No automatic rollback | Partial imports remain visible in the report/job record. Cleanup requires reviewed, job-scoped operations. |

## Backup/import risks that remain

- Import is not transactional across the whole archive; a late failure can leave
  a partial additive import. The UI warning is therefore essential.
- The browser parses the full ZIP/SQLite payload in memory. The 50 MB cap from
  PR #270 limits, but does not eliminate, low-memory mobile risk.
- A deterministic staging restore test with a representative backup is still
  required before relying on restore for disaster recovery.
- Supabase backup/PITR retention is an operational setting and was not verified
  by this source audit.

## Safe manual checklist

- [ ] As Owner, export a ZIP and inspect its manifest/data files without sharing
      customer data.
- [ ] Upload a valid QA backup to preview and stop before confirmation.
- [ ] Verify non-ZIP, empty, and oversized files are rejected.
- [ ] As a lower role, verify import/export refusal copy without starting a job.
- [ ] Verify the confirmation says append/merge, irreversible, and no rollback.
- [ ] Verify Admin cannot see factory reset and Owner can see the guarded flow.
- [ ] Do not execute factory reset or a real production import as part of QA.

## Safety statement

The audit itself ran no import, restore, factory reset, SQL, migration, or
production mutation. PRs #269 and #270 changed no money, stock, FIFO, payment,
customer/supplier balance, report, checkout, or factory-reset behavior.
