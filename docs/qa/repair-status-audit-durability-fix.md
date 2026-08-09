# Repair Status Audit Durability Fix

## Status

- Finding: `REPAIR-STATUS-AUDIT-DURABILITY-001`.
- Result: `PASS - REPAIR-STATUS-AUDIT-DURABILITY-001 FIXED`.
- Delivery state: source merged, deployed, and authenticated production verification passed.
- The former canonical risk `KNOWN RESIDUAL REPAIR-STATUS AUDIT DURABILITY RISK - P2` is closed operationally. Canonical synchronization is deferred to a separate owner-authorized task.
- Classification remains `FINISHING ACCEPTED WITH LIMITED COVERAGE` with P0 0, P1 0, P2 5, and P3 5.
- SaleDock remains below audit-ready and is not MVP-live.

## Retained Production Truth

Two retained production status audits happened to persist, but neither occurrence proved durability:

- `RJ-000004`, marker `LIVE-REPAIR-OPTIONAL-20260802-1553-6860`, repair `ee8365bc-e341-450e-b1aa-ee18c47ada8e`: one cancellation and one `repairs.status_changed` audit happened to persist after the create audit was absent. The repair remains cancelled and no audit was backfilled.
- `RJ-000005`, marker `LIVE-REPAIR-OPTIONAL-RERUN-20260803-0504-91FB`, repair `0d979a61-9d6a-41bd-91f8-d1e14a83e41b`: one cancellation and one `repairs.status_changed` audit happened to persist after the durable create audit. The repair remains cancelled.

Both repairs and their evidence remain untouched. This task does not claim that a repair status audit failed in production.

## Previous Closures

- `LIVE-REPAIR-OPTIONAL-001` is closed and remains fixed by squash `62ee3a9ea985fc7b9016bddfb1161b51f80d1efa`.
- `REPAIR-CREATE-AUDIT-DURABILITY-001` remains fixed by squash `de94a0e59de20c51e7c77cdbfa2fe496d30019e9`.
- `REPAIR-CUSTOMER-TENANT-INTEGRITY-001` remains fixed by squash `12de0dd189d0c41895e4da5ca06bd880d17ee98b` and migration `20260729133000_enforce_repair_customer_tenant_integrity.sql`.

## Source Delivery

- Source PR: [#333](https://github.com/starwalker12/saledock-cloud-pos/pull/333).
- Final reviewed head: `609d99d9402ffeb966e35c83665255a7f89ac901`.
- Squash commit: `c913d4fcc41db3a1f30d6b6e774a7c2c8ff244c1`.
- Merge timestamp: `2026-08-09T19:46:19Z`.
- Main CI: run `31332523613`, successful.
- Production deployment: `4G8GipaievscE6XJm6mmf5hRoy8b`, Ready and Current for the exact squash commit.
- No migration or schema change occurred.

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
- The first final E2E cohort disclosed a create-audit failure-path page that remained on `Saving` after exact committed server truth. No retry or duplicate occurred. A fresh cold cohort then passed all four required cases 4/4.
- Playwright automatic retries: zero.
- Lint: zero errors; two pre-existing `privacy-center.tsx` hook warnings.
- Typecheck: passed.
- Production build: passed with Next 16.2.6.
- Cleanup retries/failures: 0/0.
- Generated repairs, histories, audits, customers, financial rows, and temporary trigger/function objects remaining: zero.
- All 21 before/after database signatures matched; tenant mismatches remained zero.

## Authenticated Production Verification

The exact production deployment was verified with the authenticated identity Fardan Aatir, Owner, Star Shop, Main Branch, PKR, and Asia/Karachi.

One new zero-financial marker was created through ordinary Repair Intake:

- marker: `LIVE-REPAIR-STATUS-AUDIT-20260810-0051-7919`;
- repair: `RJ-000006`;
- repair ID: `cdfeaecf-4e47-41d9-9cbb-fad4f21c2470`;
- customer ID: `null`; marker customer rows: zero;
- estimated cost, advance, and final cost: PKR 0;
- payment method: Cash;
- initial status: `received`;
- create preflight: one repair, one initial history row, one durable `repairs.created` audit, and zero duplicates or tenant mismatches.

The normal Repair Status UI then submitted exactly one `received -> cancelled` transition with the marker-owned note `LIVE-REPAIR-STATUS-AUDIT-20260810-0051-7919 received to cancelled`. The result was:

- final status: `cancelled`;
- exactly one new `repair_status_history` row with the exact old status, new status, note, actor, organization, and repair ID;
- exactly one `repairs.status_changed` audit;
- audit actor: Fardan Aatir;
- audit organization and branch: Star Shop / Main Branch;
- audit metadata: exact `repair_id`, `old_status: received`, and `new_status: cancelled`;
- duplicate repair, history, create audit, and status audit rows: zero.

The original page was briefly pending and then settled naturally with `Status updated successfully.` without a reload or resubmission. An independent authenticated page showed the cancelled repair and both history rows, and the filtered Audit Log showed the exact status audit.

The status audit contained no customer name, phone, serial/IMEI, problem description, status note, accessories, or financial values. Its only metadata keys were `repair_id`, `old_status`, and `new_status`.

Financial and tenant safety remained exact:

- marker customer, invoice, payment, settlement, ledger, credit, and write-off rows: zero;
- Customer Dues: PKR 405 before and after;
- Supplier Dues: PKR 0 before and after;
- Dashboard Net Cash: PKR 0 before and after;
- Cash Drawer and open database shifts: unchanged;
- stock/FIFO quantity and valuation: unchanged; FIFO valuation remained PKR 845,322;
- Pending Repairs returned to its opening value of 1 after cancellation;
- tenant mismatches: zero.

`RJ-000004` and `RJ-000005` remain cancelled and were not modified. The new `RJ-000006` marker remains truthfully cancelled with its histories and audits retained.

## Evidence

Sanitized evidence is retained outside Git at:

`/Users/sw12/Projects/saledock-local-evidence/repair-status-audit-durability-fix`

It contains the source map, baseline lifecycle evidence, post-fix results, browser screenshots, cleanup proof, regression summaries, and SHA-256 manifest. It contains no credentials, cookies, tokens, keys, authorization headers, or private production customer data.

Authenticated production evidence is retained outside Git at:

`/Users/sw12/Projects/saledock-local-evidence/repair-status-audit-durability-live-verification`

Its SHA-256 manifest is:

`f882b0a95d20b7c1ab6be6248cbae26b354e147dc79f6189322320edc1500c71`

The manifest verifies 19 evidence entries plus the manifest itself, including nine screenshots. The evidence secret scan passed.

## Remaining Risk

`REPAIR-STATUS-AUDIT-DURABILITY-001` is closed. P2 reduced from 6 to 5; P3 remains 5. The five remaining P2 findings are `LIVE-INVOICE-FILTER-001`, `LIVE-INVOICE-THERMAL-BLANK-PAGE-001`, customer-settlement client completion, supplier-payment client settlement, and limited cashier coverage. Optional-field acceptance, create-audit durability, and repair-customer tenant integrity remain closed. Canonical documents still temporarily report the pre-closure register until separately synchronized.

## Rollback

- Source: `git revert c913d4fcc41db3a1f30d6b6e774a7c2c8ff244c1 && git push origin main`.
- Reverting source does not remove the retained production repair or its truthful histories/audits.
- Do not change or backfill `RJ-000004` or `RJ-000005`.
