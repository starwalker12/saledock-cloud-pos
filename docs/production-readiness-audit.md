# SaleDock Cloud POS - Production Readiness Status

**Updated:** 2026-06-21

**Baseline reviewed:** `1384f0d` (`main`, through PR #270)

**Scope:** Source-level status of money, stock, permissions, privileged server access,
backup/import safety, destructive actions, error handling, and deployment checks.

## Executive status

The high-priority source hardening identified in the 2026-06-20 audit is now
implemented. Asia/Karachi date grouping, database checkout idempotency, safe
user-facing database errors, RPC wording, the unused legacy checkout overload,
and factory-reset role/UI alignment are live.

This is not a claim that every production workflow has been manually exercised.
The remaining release gate is focused manual QA with a controlled shop account,
plus deterministic database integration coverage for the money and stock RPCs.
The application must remain in a pilot/readiness posture until those checks are
recorded.

## Completed hardening

| Area | Status | Evidence | Result |
|---|---|---|---|
| Asia/Karachi business-day boundaries | Complete | PR #261, commit `bd930db`; PR #262, commit `f3dd23e` | App day ranges and `get_sales_by_day` group by the Karachi business date rather than UTC. |
| POS checkout idempotency | Complete in code and production DB | PR #263, merge `31aa090` | Same-key replays return the original invoice; the unique index is the database backstop; duplicate audit events are skipped. |
| Safe user-facing mutation errors | Complete for audited money/business paths | PR #264, commit `806347a` | Raw Postgres/Supabase mutation errors are mapped to safe messages; intentional business-rule errors remain useful. |
| RPC/FIFO/cost wording | Complete | PR #265, commit `10dedcf` | User-facing database rules use shop-owner wording instead of internal jargon. |
| Legacy 8-argument `pos_checkout` overload | Complete | PR #266, commit `090fac0` | The unused non-idempotent checkout path was removed. |
| Factory-reset role alignment | Complete | PR #267, commit `afe05f7` | App action and database RPC both require the shop Owner. |
| Destructive-action UI polish | Complete | PR #268, commit `a16d554` | Non-owners no longer see reset controls; import/reset wording is clearer. |
| Privileged server-action safeguards | Complete | PR #269, commit `4d7556c` | Permission targets are verified inside the current organization, Owner/Admin overrides are blocked, and the remaining Admin API error is masked. |
| Backup import safety feedback | Complete | PR #270, commit `1384f0d` | Job status updates repeat the Owner/Admin guard, invalid ZIPs are rejected before parsing, and row warnings no longer expose raw DB text. |

## Audit follow-ups completed in this pass

Both follow-ups were independently reviewed, squash-merged, and deployed to
production on 2026-06-21:

| PR | Scope | Production result |
|---|---|---|
| PR #269 | Privileged server-action safeguards | Live in `4d7556c`; no auth-flow or permission-model change. |
| PR #270 | Backup import safety feedback | Live in `1384f0d`; no import mapping or business-formula change. |

## Current risk register

| ID | Status | Area | Remaining work |
|---|---|---|---|
| R1 | Resolved in code | Timezone/date grouping | Manually verify an after-midnight PKT transaction in dashboard, reports, and daily closing. |
| R2 | Resolved in code/DB | POS duplicate checkout | Run a controlled normal checkout and double-submit/retry test; verify one invoice, payment, stock movement, and audit event. |
| R3 | Resolved for audited paths | Raw database errors | Continue using `getSafeActionError` for new actions and keep raw detail in server logs only. |
| R4 | Audited; minor hardening live | Service-role Supabase usage | Longer-term, reduce broad `auth.admin.listUsers()` reads when a narrower lookup is practical. |
| R5 | Open | Money/stock RPC proof | Add deterministic integration tests described in `docs/money-stock-test-coverage.md`. |
| R6 | Code safeguards complete; operational check pending | Backup/reset recovery | Confirm backup retention and manually check Owner/Admin permission-denied copy. Never test reset against production data. |
| R7 | Ongoing process rule | Auth/staff permissions | Keep every mutation guarded in the server action, even when the UI hides it. |
| R8 | Open operational checklist | Deployment configuration | Record production env ownership, backup retention, and manual smoke-test evidence. |

## Privileged server and backup audit

The detailed 2026-06-21 audit is in
`docs/privileged-server-backup-audit.md`. Summary:

- `src/lib/supabase/admin.ts` imports `server-only`; no client component imports it.
- There is no `NEXT_PUBLIC` service-role variable.
- Tenant-facing privileged reads are reduced to the authenticated user's
  organization before data is returned to UI components.
- Platform-wide reads require the platform-admin guard.
- Import/export start and chunk actions are Owner/Admin gated and organization
  scoped; factory reset is Owner-only.
- Backup import is additive and has no automatic rollback. It does not truncate,
  wipe, or delete existing business records.
- PRs #269 and #270 closed the small hardening gaps found by the audit.

## Automated test status

Current automated coverage is useful but not a full accounting proof:

- Playwright covers authenticated page smoke tests and a guarded sale/return flow.
- `tests/pos-checkout-idempotency.test.sql` proves the partial unique index in a
  temporary table and documents the full staging RPC plan.
- `tests/karachi-business-day.test.mjs` covers critical Karachi boundary examples.
- Missing deterministic assertions include exact checkout totals/paid/due,
  oversell and below-cost branches, FIFO lot quantities, customer ledger effects,
  supplier dues, and daily-closing arithmetic.

See `docs/money-stock-test-coverage.md` for the coverage matrix and recommended
test-only PR sequence. No money formula was changed during this audit.

## Manual checks still required

Use a controlled QA shop and clearly marked QA records. Do not use production
customer, supplier, or inventory records for destructive or mutation tests.

- [ ] Normal POS checkout: verify invoice total, paid, due, payment row, stock,
      FIFO allocation, customer ledger, and audit event.
- [ ] Double-submit/retry the exact checkout: verify only one invoice, one
      payment, one stock deduction, and one `pos.checkout_completed` audit event.
- [ ] Change the checkout intention after a timeout: verify a new idempotency key
      creates the intended separate sale.
- [ ] Oversell and below-cost checks: verify blocked without permission and
      allowed only with the approved override.
- [ ] Full and partial return: verify refund, returned quantity, stock/FIFO
      restoration, and customer/cash effect.
- [ ] After-midnight PKT sale: verify dashboard, reports, and daily closing use
      the same Karachi date.
- [ ] Supplier purchase plus partial payment: verify purchase total, allocations,
      ledger entries, and remaining due.
- [ ] Daily closing: verify expected cash, counted cash, variance, reopen guard,
      and duplicate-close prevention.
- [ ] Factory-reset UI role check: Owner sees the guarded flow; Admin and lower
      roles do not. Do not execute reset.
- [ ] Import permission-denied copy: a lower role receives a friendly refusal;
      do not start a real import.
- [ ] Backup import preview: verify non-ZIP, empty, and over-50-MB files are
      rejected; confirm no data is written during preview.

## Rollback guidance

Each change remains independently revertible using its merge commit. For a
normal merge commit use `git revert -m 1 <merge_commit_sha>`; for a squash commit
use `git revert <merge_commit_sha>`. Database rollback is separate from app-code
rollback and must be reviewed against live rows before dropping a column, index,
or function signature.

PRs #269 and #270 were squash merges and can be reverted independently with
`git revert 4d7556c` or `git revert 1384f0d`. Neither added a database migration.

## Safety statement

This status update and its companion audit documents do not change application
logic, database objects, RLS, RPCs, money formulas, stock/FIFO behavior, payment
allocation, reports, or production data. No destructive operation was run.
