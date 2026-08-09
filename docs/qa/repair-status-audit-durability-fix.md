# Repair Status Audit Durability Fix

## Status

- Finding: `REPAIR-STATUS-AUDIT-DURABILITY-001`.
- Canonical risk: `KNOWN RESIDUAL REPAIR-STATUS AUDIT DURABILITY RISK - P2`.
- Delivery state: corrected and locally proven only on the draft branch `fix/repair-status-audit-durability`.
- Production is unchanged. The P2 remains active until separately authorized merge, deployment, and authenticated production verification.
- Classification remains `FINISHING ACCEPTED WITH LIMITED COVERAGE` with P0 0, P1 0, P2 6, and P3 5.
- SaleDock remains below audit-ready and is not MVP-live.

## Retained Production Truth

Two retained production status audits happened to persist, but neither occurrence proved durability:

- `RJ-000004`, marker `LIVE-REPAIR-OPTIONAL-20260802-1553-6860`, repair `ee8365bc-e341-450e-b1aa-ee18c47ada8e`: one cancellation and one `repairs.status_changed` audit happened to persist after the create audit was absent. The repair remains cancelled and no audit was backfilled.
- `RJ-000005`, marker `LIVE-REPAIR-OPTIONAL-RERUN-20260803-0504-91FB`, repair `0d979a61-9d6a-41bd-91f8-d1e14a83e41b`: one cancellation and one `repairs.status_changed` audit happened to persist after the durable create audit. The repair remains cancelled.

Both repairs and their evidence remain untouched. This task does not claim that a repair status audit failed in production.

## Previous Closures

- `LIVE-REPAIR-OPTIONAL-001` remains fixed by squash `62ee3a9ea985fc7b9016bddfb1161b51f80d1efa`.
- `REPAIR-CREATE-AUDIT-DURABILITY-001` remains fixed by squash `de94a0e59de20c51e7c77cdbfa2fe496d30019e9`.
- `REPAIR-CUSTOMER-TENANT-INTEGRITY-001` remains fixed by squash `12de0dd189d0c41895e4da5ca06bd880d17ee98b` and migration `20260729133000_enforce_repair_customer_tenant_integrity.sql`.

## Current Source Lifecycle

Before this correction, `updateRepairStatusAction`:

1. authenticated the current user and organization;
2. enforced `canUpdateRepairStatus`;
3. updated the repair by exact ID and organization;
4. awaited one `repair_status_history` insert and checked its returned error;
5. revalidated Repairs, the repair detail, and Dashboard;
6. invoked `logAudit(...)` without awaiting it;
7. immediately returned `Status updated successfully.`.

The global `logAudit(...): Promise<void>` helper catches thrown failures but does not inspect a returned Supabase insert error and exposes no result to its caller. The status action used that helper as a fire-and-forget call. Therefore, changing the old call to `await logAudit(...)` would wait for completion but still could not confirm a successful insert.

## Deterministic Baseline

The hermetic pre-fix harness proved:

- Normal timing: one organization-scoped update and one history insert completed; the helper was invoked once and could later create one audit.
- Delayed audit: repair update and history completed, the audit Promise remained blocked, and the action still resolved `Status updated successfully.` before the audit completed.
- Returned insert error: `audit_logs.insert(...)` returned an error, while the global helper resolved `undefined` without a caller-visible failure.
- Thrown insert failure: the global helper caught the failure, logged a sanitized error, and resolved `undefined`; the action had no durability result.
- History returned error: the status update was already committed, the existing history error was returned, and no audit was attempted.
- Input and permission rejection: no update, history, or audit occurred.

Outcome A is established with high confidence: the status action combined an unawaited audit with caller-invisible returned and thrown audit failures.

## Correction

Only the status-audit boundary in `src/app/repairs/actions.ts` changed:

- After the organization-scoped repair update and required history insert, the existing Supabase client performs one caller-local `audit_logs` insert.
- The insert is awaited.
- A returned insert error and a thrown failure are both recognized.
- Success is returned only after the exact audit succeeds.
- Audit failure returns the exact repair ID and:

  `The status was updated, but its audit record could not be confirmed. Do not submit it again. Refresh the page and contact an administrator.`

- There is no automatic retry, resubmission, duplicate history, duplicate audit, rollback, deletion, or compensating mutation.

The partial-save response is truthful because the repair update and status history may already be committed when audit insertion fails.

## Audit Contract

The durable status audit preserves the existing payload:

- organization: authenticated organization;
- branch: current profile branch;
- actor: current profile ID;
- module: `repairs`;
- action: `repairs.status_changed`;
- details: exact repair ID and old/new status;
- metadata: `repair_id`, `old_status`, and `new_status`.

No customer phone, serial/IMEI, problem description, Notes, accessories, or financial values were added. The global audit helper is byte-for-byte unchanged.

## Preserved Boundaries

- Status values, client-provided `old_status`, diagnosis, final cost, `delivered_at`, and revalidation behavior are unchanged.
- The status form and permission list are unchanged. Owner, Admin, Manager, and Technician remain status updaters; Cashier behavior is unchanged.
- Optional validation, Repair Intake create/edit auditing, customer tenant ownership, the tenant migration, RLS, and schema are unchanged.
- Settlement, accounting, Dashboard, Reports, stock/FIFO, Cash Drawer, Net Cash, dues, and Daily Closing are unchanged.
- No migration, package, lockfile, workflow, or canonical document changed.

## Local Workflows

Production-mode loopback E2E used two marker-owned zero-financial repairs and ordinary status forms:

- Successful `received -> in_progress`: one POST, one repair update, one exact history, one exact audit, truthful success, no duplicate, and readable 390x844 mobile layout.
- Forced audit failure `received -> in_progress`: one POST, one committed repair update, one committed history, zero audit, exact partial-save error, no retry or duplicate, and readable 320x568 mobile layout.

The temporary loopback-only trigger rejected only the second repair's `repairs.status_changed` audit. It was removed in `finally`; remaining trigger/function count was zero.

## Validation

- New status durability contracts: 7/7.
- Initial pre-fix harness launch: 4/6 because two assertions expected the wrong unchanged success-state `id`; the harness expectations were corrected, then the unmodified baseline passed 6/6 and produced the deterministic delayed/error evidence above.
- Combined status/create durability contracts: 16/16.
- Complete Node suite: 314/314 on the clean environment-complete run.
- Initial Node launch: 312/314 because local Supabase keys were omitted from the process; discarded and rerun with the complete loopback runtime in memory.
- Status durability E2E: 1/1.
- Create-audit, optional-field, and tenant-integrity E2Es: 3/3.
- Playwright automatic retries: zero.
- Lint: zero errors; two pre-existing `privacy-center.tsx` hook warnings.
- Typecheck: passed.
- Production build: passed with Next 16.2.6.
- Cleanup retries/failures: 0/0.
- Generated repairs, histories, audits, customers, financial rows, and temporary trigger/function objects remaining: zero.
- All 21 before/after database signatures matched; tenant mismatches remained zero.

## Evidence

Sanitized evidence is retained outside Git at:

`/Users/sw12/Projects/saledock-local-evidence/repair-status-audit-durability-fix`

It contains the source map, baseline lifecycle evidence, post-fix results, browser screenshots, cleanup proof, regression summaries, and SHA-256 manifest. It contains no credentials, cookies, tokens, keys, authorization headers, or private production customer data.

## Remaining Risk

The correction is not merged or production verified. `REPAIR-STATUS-AUDIT-DURABILITY-001` therefore remains one of six active P2 findings. Customer-settlement and supplier-payment settlement findings remain open. Limited cashier coverage remains open.

## Rollback

- Before merge: close the draft PR and delete only this isolated branch/worktree when separately authorized.
- After a future merge: revert the eventual status-audit squash commit.
- Do not change or backfill `RJ-000004` or `RJ-000005`.
