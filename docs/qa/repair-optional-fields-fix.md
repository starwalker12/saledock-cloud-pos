# Repair Optional Fields Fix

## Status

`LIVE-REPAIR-OPTIONAL-001` is corrected only on the draft branch `fix/repair-optional-fields-current`. Production remains unchanged and affected until a separately authorized delivery and authenticated production verification.

Current classification remains `FINISHING ACCEPTED WITH LIMITED COVERAGE`. P0 is 0, P1 is 0, P2 remains 6, and P3 remains 5. SaleDock is not audit-ready and is not MVP-live.

## Production Finding And Retained Evidence

The authenticated 26 July 2026 finishing run submitted ordinary Repair Intake forms with optional customer and repair fields blank. Both attempts returned `Invalid UUID` before mutation.

- Production marker: `FINISHING-CONT-20260726-2022-2B42`
- Production evidence: `/Users/sw12/Projects/saledock-local-evidence/live-finishing-continuation-2026-07-26`
- Production manifest SHA-256: `90f9cd57b810a29eb554a283b43a11281e0e1f6c5c7fab3f60bdb949eca34429`
- Production manifest entries: 58/58 verified
- Repair rows, histories, audits, customers, financial rows, and Cash Drawer effects from the rejected attempts: zero

The retained local investigation is under `/Users/sw12/Projects/saledock-local-evidence/repair-optional-fields-fix`.

- Manifest SHA-256: `bb3b253cf534e851ae8e595c3f97357d5c2c88d64af5232c49ce1edb53f3b047`
- Manifest entries: 15/15 verified
- Schema matrix: 28 cases
- Retained baseline: 8 accepted and 20 rejected

The current-main baseline at `edb1cc56c99b6aa6e7fee2f8f5502ab6ac2a5783` reproduced all 28 retained outcomes exactly before editing.

## Root Cause

The form legitimately submits an empty hidden `customer_id` when no registered customer is selected. The previous `z.string().uuid().optional().nullable()` contract applied UUID validation to `""`, so a walk-in repair failed with `Invalid UUID`.

The previous optional-text helper wrapped the preprocessing schema with `.optional().nullable()`. The outer optional check saw the original blank string, then the inner preprocessor returned `undefined` to a required `z.string().min(1)` target. Blank phone, model, serial/IMEI, accessories, and notes therefore failed after preprocessing.

Expected Delivery previously used an unrestricted optional string. A blank date remained `""`, while malformed nonblank values such as `2026-02-30` passed validation.

## Correction

The repair-specific validation module now normalizes blank or whitespace-only optional values before the type validator runs:

- optional customer IDs become `undefined`, while valid UUIDs are retained and malformed nonblank values still fail;
- optional text becomes `undefined` when blank, while nonblank text is trimmed only at its edges;
- Expected Delivery becomes `undefined` when blank;
- nonblank dates require exact `YYYY-MM-DD` syntax and a real Gregorian calendar date;
- valid leap day `2028-02-29` passes, while impossible dates, datetimes, text, and alternate formats fail.

Required fields, nonnegative numeric rules, payment/status enums, and defaults are unchanged. No timezone conversion was added to schema validation.

Only `src/lib/validation/repairs.ts` changes application behavior. `src/app/repairs/repair-form.tsx` and `src/app/repairs/actions.ts` are unchanged.

## Tenant-Integrity Boundary

The optional-field investigation previously exposed the independent P1 `REPAIR-CUSTOMER-TENANT-INTEGRITY-001`. That P1 was separately fixed by PR #326, source squash `12de0dd189d0c41895e4da5ca06bd880d17ee98b`, and migration `20260729133000_enforce_repair_customer_tenant_integrity.sql`.

The delivered boundary remains intact:

- selected customer lookup uses the exact ID and authenticated organization;
- it selects only `id`;
- foreign or missing customers return `The selected customer is unavailable.`;
- ownership is checked before repair, history, or audit mutation;
- quick-created customers remain organization-owned;
- null repair/customer links remain allowed;
- cross-organization inserts and updates remain rejected by the composite foreign key.

The tenant migration remains byte-for-byte unchanged at SHA-256 `7ff005a554c2ce966b600959dcd6ea8e8c0417bae659a679c4f7b1b183a2ce97`. Repair actions remain unchanged at SHA-256 `a08b6becafa9b4022a9734589b7142a229364889692e87b0e1045d2d87693934`.

## Authorized Fifth-File Amendment

The existing tenant test ended with `tenant correction does not normalize optional repair fields`. That assertion intentionally froze pre-fix optional validation while the tenant P1 was isolated. Retaining it would require this known P2 to remain unfixed.

The owner authorized `tests/repair-customer-tenant-integrity.test.mjs` as the fifth file, replacing the conditional authorization for `repair-form.tsx`. Only that obsolete boundary was replaced with a hermetic contract proving that optional normalization is validation-local and that the delivered action and migration tenant protections remain exact.

Tenant protection was not relaxed. The other five tenant contracts are unchanged, `src/app/repairs/actions.ts` is unchanged, and the tenant migration is unchanged.

## Workflow Proof

The focused production-mode Playwright test used loopback Supabase, a UTC production server, an Asia/Karachi browser, fresh marker-owned fixtures, and zero automatic retries.

- Walk-in: one repair, null customer relation, blank optional values persisted as the established null representation, one initial history, and one create audit.
- Quick customer: one same-organization customer at balance PKR 0, one linked repair, no ledger/payment/invoice/Cash Drawer effect, and no duplicate.
- Selected customer: one repair linked to the exact same-organization customer, no second customer, and no tenant mismatch.
- Unlinked edit: one nonfinancial description edit, customer relation remained null, no status transition or duplicate history, and one edit audit.
- Date probes: blank, whitespace, `2026-08-02`, and `2028-02-29` passed; `2027-02-29`, `2026-02-30`, month 13, non-padded date, datetime, and text failed before mutation.
- Totals: four submits, four mutation Action POSTs, three repairs, three initial histories, three create audits, and one update audit.

All generated repairs, histories, customers, and audits were removed. All 21 before/after safety signatures matched, tenant mismatch count remained zero, cleanup retries/failures were 0/0, and no financial row or Cash Drawer effect occurred.

Two submitting contexts displayed the established client-settlement behavior after exact server completion. No request was resubmitted, database and audit truth were exact, duplicates were zero, and cleanup passed. This task does not change or close any settlement finding and does not add a new P3.

## Mobile

Repair Intake passed at 390x844 and 320x568. Empty customer selection and blank optional/date values remained available; required fields remained visibly required; the permanent-customer checkbox and Record Intake button were reachable; and neither viewport had page-level horizontal overflow or duplicate controls.

## Regression Results

- retained current-main matrix: 28/28 matched the retained baseline;
- post-fix matrix: 28/28 matched the intended contract, with 13 accepted and 15 rejected;
- optional-field contracts: 6/6;
- tenant-integrity contracts: 6/6;
- combined focused contracts: 12/12;
- focused optional-field E2E: 1/1;
- tenant-integrity E2E: 1/1 on the bounded rerun;
- complete Node suite: 294/294;
- role matrix: Owner, Admin, Manager, Cashier, and Technician tenant protections passed;
- status/history: ordinary `received -> in_progress`, exact history, and audit passed;
- repair numbering, audit, customer-history, Dashboard, backup/import, financial, FIFO, and Cash Drawer contracts: passed in the complete Node and focused E2E gates;
- lint: 0 errors, with two pre-existing `privacy-center.tsx` hook warnings;
- typecheck: passed;
- production build: passed under `TZ=UTC`;
- Playwright automatic retries: 0;
- cleanup retries/failures: 0/0.

Discarded launches are reported rather than hidden:

- the first optional E2E classified an exact server commit as a failure when a selected-customer page remained pending; business truth and cleanup were exact;
- the second optional E2E overcounted expected aborted prefetch/navigation requests and local Vercel telemetry MIME noise; the diagnostic listener was narrowed without changing business assertions, and the final run passed;
- the first tenant E2E read status history immediately after the repair row became visible and observed the existing timing race; cleanup passed, and the bounded zero-retry rerun passed;
- the first complete Node launch omitted in-memory loopback keys and failed only the two seed-stock-lot environment preconditions; the corrected run passed 294/294.

Node emitted the existing module-type warnings for `src/lib/datetime.ts` and `src/lib/return-profit.ts`. Playwright emitted the existing `NO_COLOR`/`FORCE_COLOR` warning.

## Boundaries

- No action, form, tenant migration, RLS, permission, or repair-status source changed.
- No accounting, settlement, customer ledger, invoice, payment, Dashboard, Reports, stock/FIFO, or Cash Drawer source changed.
- No package, lockfile, workflow, configuration, or canonical document changed.
- No migration is required or authorized.
- Production was not accessed or mutated during this correction.
- Preview must remain read-only unless database isolation from production is independently established.
- Active P2 remains 6 pending later authenticated production delivery; P3 remains 5.

## Draft Delivery

The branch is intended for a draft pull request titled `fix: accept blank optional repair fields`. It is ready only for owner review after exact-head CI, Vercel Preview, and senior review pass. It must not be marked ready or merged in this task.

## Rollback

Before merge, rollback is deletion of the draft branch/worktree or reversal of its single focused commit. No production, schema, migration, tenant, accounting, or canonical rollback is required because none changed.
