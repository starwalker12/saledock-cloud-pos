# Repair Create Audit Durability Fix

## Status

- Finding: `REPAIR-CREATE-AUDIT-DURABILITY-001`
- Source result: merged and authenticated production verified
- Live result: `PASS - REPAIR-CREATE-AUDIT-DURABILITY-001 FIXED`
- `LIVE-REPAIR-OPTIONAL-001`: closed by the same bounded production rerun
- P0/P1: `0 / 0`
- Active P2: `6`
- Active P3: `5`
- Finishing classification: `FINISHING ACCEPTED WITH LIMITED COVERAGE`
- Audit-ready: no
- MVP-live: no

The source correction changed no migration, schema, package, workflow, canonical document, repair validation rule, tenant rule, permission, status flow, settlement behavior, accounting, stock/FIFO, Dashboard formula, Reports formula, or Cash Drawer behavior. The bounded production verification created one zero-financial repair and then cancelled it, retaining its truthful repair, history, and audit records.

## Source Delivery

- Pull request: #330, `fix: make repair create audit durable`
- Reviewed source head: `14e920925bb5586b1923b6c9d2d8eb59615267c7`
- Squash commit: `de94a0e59de20c51e7c77cdbfa2fe496d30019e9`
- Merge timestamp: `2026-08-02T23:59:44Z`
- Main CI: run `30773416186`, successful
- Production deployment: `DDtDXWcufFyhYHFStkKDSahE3uUD`, Ready and current for the exact squash
- Local source evidence: `/Users/sw12/Projects/saledock-local-evidence/repair-create-audit-durability-fix`
- Local evidence manifest SHA-256: `c6fd90f8791ef32fa916e1de784ad1bec0358fcbacce45c8138c603f4e8bc08b`

Owner review authorized the exact five-file head. The final local confirmation passed 21/21 focused source contracts, 307/307 Node tests, all three production-mode repair E2Es with zero automatic retries, lint with zero errors, typecheck, and the production build. GitHub CI, Vercel Preview, exact-head senior review, comments, threads, requested changes, and mergeability were clean before squash merge.

## Production Acceptance Blocker

The optional-field correction delivered by PR #329 and squash `62ee3a9ea985fc7b9016bddfb1161b51f80d1efa` is production-proven. The ordinary authenticated form accepted every authorized blank optional value without `Invalid UUID`, persisted the established empty representation, created no customer, produced no financial effect, and preserved tenant integrity.

The same acceptance run exposed a separate audit durability blocker:

- Evidence: `/Users/sw12/Projects/saledock-local-evidence/repair-optional-fields-live-verification`
- Manifest SHA-256: `a506e5d8ebc99b42689bb140ad10bda6d0c03b0058a2ec825a9f1c791e5c9e65`
- Marker: `LIVE-REPAIR-OPTIONAL-20260802-1553-6860`
- Repair: `RJ-000004`
- Repair ID: `ee8365bc-e341-450e-b1aa-ee18c47ada8e`
- Repair insert: exactly one
- Initial `received` history: exactly one
- `repairs.created` audit: zero
- Financial effect: zero
- Tenant mismatch: zero
- Duplicate repair: zero

The later authorized cancellation created exactly one `received` to `cancelled` history and one truthful `repairs.status_changed` audit. `RJ-000004` remains cancelled and was not edited, deleted, restored, or otherwise mutated during this source task. No second production repair was created.

## Authenticated Production Verification - 2026-08-03

After deployment `DDtDXWcufFyhYHFStkKDSahE3uUD` became Ready and current for squash `de94a0e59de20c51e7c77cdbfa2fe496d30019e9`, the bounded rerun used the authenticated Owner session for Fardan Aatir, Star Shop, Main Branch, PKR, and Asia/Karachi.

- Evidence: `/Users/sw12/Projects/saledock-local-evidence/repair-optional-fields-live-verification-rerun`
- Manifest SHA-256: `64e1bf6d9619df9230854c02e44654d115ea58ebfb1e9131e537212e6703d8df`
- Manifest entries: 18/18 verified
- Screenshots: 7
- Marker: `LIVE-REPAIR-OPTIONAL-RERUN-20260803-0504-91FB`
- Repair: `RJ-000005`
- Repair ID: `0d979a61-9d6a-41bd-91f8-d1e14a83e41b`
- Initial history: exactly one `received` row
- Create audit: exactly one `repairs.created` row
- Duplicate repair/history/create audit: zero
- Final state: `cancelled`

The create audit committed before the successful intake response and identified the exact repair, actor, organization, and branch. It retained the established customer display name and device type only; phone, serial/IMEI, problem description, Notes, and accessories were absent. The walk-in customer relation remained null, no customer was created, tenant mismatches were zero, and every optional blank persisted in the established null representation.

The authorized cancellation created one `received` to `cancelled` history and one `repairs.status_changed` audit. That status audit happened to persist, but `updateRepairStatusAction` remains fire-and-forget and its durability is not established. `KNOWN RESIDUAL REPAIR-STATUS AUDIT DURABILITY RISK - P2` remains open and is one of the six active P2 findings.

Pending Repairs returned to its baseline of one. Customer and supplier dues, Net Cash, Cash Drawer, invoice/payment/write-off/return counts, stock quantity, FIFO quantity and valuation, and open shifts were unchanged. The historical `RJ-000004` remained cancelled with no retroactive create audit. No migration, schema change, backfill, retry, duplicate, or unrelated production mutation occurred.

## Baseline Source Ordering

The baseline `saveRepairAction` performed:

1. authentication, profile, permission, and schema validation;
2. organization-scoped selected-customer ownership validation when applicable;
3. one repair insert and exact returned repair ID;
4. one awaited initial status-history insert;
5. Repairs, customer-detail when applicable, and Dashboard revalidation;
6. an unawaited `logAudit(...)` call;
7. immediate ActionState success.

The global `logAudit` helper is asynchronous. It obtains context, creates a Supabase client, awaits an `audit_logs` insert, catches thrown exceptions, and resolves `Promise<void>`. It does not inspect the Supabase insert result's `error` property, so a returned database error also resolves without a caller-visible failure.

The status action uses the same fire-and-forget helper pattern. The production cancellation audit happened to persist, but that does not establish durability. Status auditing is unchanged in this task and requires separate authorization if later reviewed.

## Deterministic Baseline Proof

The baseline harness executed the actual pre-correction action and helper sources with injected local persistence boundaries.

### Normal timing

- repair: one
- initial history: one
- create audit: one after the asynchronous boundary completed
- action result: success

This proves the create path normally attempted the audit.

### Delayed audit

- repair committed;
- history committed;
- audit was invoked but deliberately held pending;
- the action returned `Repair job created.` while the audit count was still zero;
- releasing the audit boundary later produced the audit.

### Returned audit error

- repair committed;
- history committed;
- the simulated audit insert returned an error;
- `logAudit` resolved `undefined` and reported no failure to the caller;
- the action returned success;
- the audit count remained zero.

This is Outcome A: the create audit promise was not durably awaited. It also proves that merely changing the existing call to `await logAudit(...)` would be incomplete because the helper cannot expose a returned Supabase error.

## Root Cause

`saveRepairAction` treated an asynchronous, fire-and-forget logger as though invoking it were sufficient for a successful audited mutation. The action could settle before the logger completed. Independently, the helper's void and swallowed-error contract prevented the action from distinguishing a successful audit insert from a returned database error.

The production result is the exact allowed consequence of that ordering: repair and initial history committed, the response succeeded, and the create audit was absent.

## Correction

The final exact-head review also found that the awaited initial-history insert did not inspect its returned error. That narrow pre-audit boundary is now checked so a repair cannot be reported as a fully successful intake without its required initial history.

`saveRepairAction` now performs one awaited, caller-local `audit_logs` insert using the already authenticated and validated context:

- organization: authenticated organization ID;
- branch: authenticated branch ID;
- actor: authenticated profile ID;
- module: `repairs`;
- action: `repairs.created` or the existing shared `repairs.updated` action;
- details: the established action, customer display name, and device type;
- metadata: the exact repair ID plus the established customer display name and device type.

The action returns success only after the initial history and audit inserts resolve with no error. The audit boundary handles both returned insert errors and thrown failures. One object is inserted once, so no automatic retry or duplicate audit path was added.

The global audit helper is unchanged. A global helper API change is not required for this caller-local correction.

## Failure Semantics

The repair insert, initial history, and audit insert are separate committed operations; this task does not pretend they are atomic.

When the initial history insert fails after the repair committed, the action returns:

`The repair was saved, but its initial status history could not be confirmed. Do not submit it again. Refresh the page and contact an administrator.`

The action includes the exact saved repair ID and does not attempt the create audit, because an audit must not falsely represent an incomplete intake as complete.

When the audit insert fails after the repair and history committed, the action returns:

`The repair was saved, but its audit record could not be confirmed. Do not submit it again. Refresh the page and contact an administrator.`

The returned ActionState also includes the exact saved repair ID for reconciliation. It does not retry the repair, resubmit the form, delete the committed repair, create a compensating mutation, or report success.

## Edit Boundary

Create and edit previously shared the same fire-and-forget audit location. The checked insert remains at that shared location, so the existing `repairs.updated` audit now also waits for completion and returns the same truthful partial-success error if its audit cannot be confirmed.

Edit payloads, permissions, tenant scope, update behavior, response wording on success, revalidation, and all business semantics remain unchanged.

## Status Boundary

`updateRepairStatusAction` is byte-for-byte unchanged. Its existing fire-and-forget `repairs.status_changed` pattern is documented but is not changed by this focused correction.

## Privacy Review

The existing repair save audit copied `customer_name` into details and metadata. This correction retains that established payload and does not expand it. Phone, serial/IMEI, problem description, Notes, and accessories remain excluded. Redesigning the established display-name content is outside this durability blocker.

## Local Proof

The behavioral source contracts cover:

- exact repair ID before audit;
- history completion before audit;
- history insert failure returns safe partial-success truth and prevents the create audit;
- delayed audit keeps the action pending;
- one exact successful create audit;
- returned or thrown audit failures produce safe partial-success truth;
- no automatic retry or duplicate;
- no audit after validation rejection;
- no audit after tenant ownership rejection;
- no audit after repair insert failure;
- shared edit audit completion;
- global helper returned-error behavior;
- no expansion beyond the established customer display-name and device-type payload;
- unchanged optional validation, form, tenant migration, status action, and global helper.

The production-mode Playwright test uses loopback Supabase and two ordinary UI submissions:

1. successful blank-optional intake: one repair, one initial history, one exact `repairs.created` audit;
2. deterministic local audit rejection: one committed repair, one history, zero audit, explicit safe ActionState error, and no retry.

Both Server Action responses returned HTTP 200. The successful response was observed only after the exact create audit existed. The forced-failure ActionState rendered the exact safe partial-success error. The successful connected form did not settle during that clean run, while the failure error did apply; this is retained as the existing client-settlement boundary and is not changed or used to weaken server audit acceptance.

The failure boundary is a temporary loopback-only PostgreSQL trigger that rejects `repairs.created`. It is not a migration or production branch. The trigger, both repairs, both histories, the successful audit, and any marker customer are removed in `finally`.

Focused E2E result:

- cases: 1 combined serial case;
- UI submissions: 2;
- Action POSTs: 2;
- automatic retries: 0;
- success-path repairs/history/audits: `1 / 1 / 1`;
- failure-path repairs/history/audits: `1 / 1 / 0`;
- tenant mismatches: 0;
- cleanup retries/failures: `0 / 0`;
- safety signatures: equal.

Direct and regression results:

- new audit durability contracts: `9 / 9`;
- optional-field contracts: `6 / 6`;
- tenant-integrity contracts: `6 / 6`;
- complete Node suite: `307 / 307`;
- focused durability E2E: `1 / 1`;
- tenant-integrity E2E: `1 / 1`;
- optional-field E2E: `1 / 1`;
- Playwright automatic retries: `0`;
- lint: 0 errors and two pre-existing Privacy Center hook warnings;
- typecheck: pass;
- production build: pass.

Discarded harness launches are recorded rather than represented as clean passes. Two early launches stopped before business mutation because the host had no standalone `psql` binary and the first owner-identity preflight selected an unavailable client API. One interrupted output-capture launch cleaned its marker rows and trigger. A stale-build launch, a connection-refused launch, and local Auth/page-error launches also cleaned their fixtures. One final-head launch reached both HTTP 200 responses but Playwright could not retrieve the second protocol response body; cleanup and signatures passed, and the test now uses the exact rendered ActionState error rather than raw response-body retrieval. Parallel Supabase CLI status calls corrupted only the local telemetry JSON and invalidated two Node-suite launches; the malformed file was archived, repaired without touching repository or database state, and the suite then passed serially with one loopback environment snapshot.

## Scope And Safety

Changed files are limited to:

1. `src/app/repairs/actions.ts`
2. `tests/repair-create-audit-durability.test.mjs`
3. `tests/e2e/repair-create-audit-durability.spec.ts`
4. `tests/repair-customer-tenant-integrity.test.mjs`
5. `docs/qa/repair-create-audit-durability-fix.md`

Two existing tenant source contracts previously identified the audit boundary
by the literal `logAudit({` call. They now identify the exact checked
`audit_logs` insert. The organization-owned customer lookup must still precede
repair, history, and audit writes; no tenant assertion, application ownership
check, migration contract, or cleanup boundary was relaxed.

Unchanged boundaries include:

- `src/lib/audit.ts`;
- `src/lib/validation/repairs.ts`;
- `src/app/repairs/repair-form.tsx`;
- `updateRepairStatusAction`;
- repair/customer tenant migration and ownership check;
- RLS and permissions;
- repair status values;
- customer settlement;
- accounting, Dashboard, Reports, stock/FIFO, and Cash Drawer;
- packages, lockfile, workflows, and canonical documents.

No migration is included. Tenant integrity remains fixed. The authenticated rerun proved the delivered optional-field behavior and durable create audit together, so `LIVE-REPAIR-OPTIONAL-001` and `REPAIR-CREATE-AUDIT-DURABILITY-001` are closed. P2 remains six because the separately scoped repair-status audit durability risk remains open; P3 remains five. Canonical synchronization is deferred to a separate owner-authorized task.

## Rollback

Revert the source delivery with `git revert de94a0e59de20c51e7c77cdbfa2fe496d30019e9 && git push origin main`. Do not delete `RJ-000005`, its histories, or its truthful audits. No migration or schema rollback applies.
