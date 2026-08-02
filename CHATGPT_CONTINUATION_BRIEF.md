# SaleDock Cloud POS — Continuation Brief
*Canonical handoff after the production-verified 2 August 2026 repair/customer tenant-integrity P1 closure.*

## Owner And Production

Fardan Aatir is the non-technical owner of SaleDock Cloud POS. The verified
production identity is Fardan Aatir, Owner, Star Shop, Main Branch, PKR,
Asia/Karachi. Use plain language, review-first pull requests, strict evidence
boundaries, and no credentials in chat.

## Current Repository And Production

- Repository: `https://github.com/starwalker12/saledock-cloud-pos.git`
- Canonical synchronization base: `8afbc37751a76edb93d52175146be6dbb619a0a3`
- Latest application-behavior commit: `12de0dd189d0c41895e4da5ca06bd880d17ee98b`
- Latest behavior change: `fix: enforce repair customer tenant integrity`
- Latest focused documentation commit: `8afbc37751a76edb93d52175146be6dbb619a0a3`
- Production deployment: `GooqVaWAfTVhunUU1eYFyBLguiDx`, Ready/current
- Migration: `20260729133000_enforce_repair_customer_tenant_integrity.sql`

## Current Classification

**FINISHING ACCEPTED WITH LIMITED COVERAGE**

- P0: **0**
- P1: **0**
- P2 findings or coverage limits: **6**
- P3 observations: **5**
- Audit-ready: **NO**
- MVP-live: **NO**

Limited coverage means no authenticated cashier production session or approved
cashier credentials were available. Permission contracts were reviewed. No
cashier account was created, reset, invited, or impersonated, and no cashier
financial mutation was performed.

## Exact Active P2 Register

1. `LIVE-REPAIR-OPTIONAL-001`
   - Root cause is substantially established, but no correction exists.
   - The form submits `customer_id=""` when no registered customer is selected;
     the schema does not normalize that HTML blank string to the empty relation.
   - Optional-string preprocessing runs at the wrong validation layer.
   - Blank expected-delivery date is not normalized and malformed nonblank date
     values can pass insufficient validation.
   - Rejected attempts wrote no repair, history, audit, customer, financial, or
     Cash Drawer row.
2. `LIVE-INVOICE-FILTER-001`
   - Search, date, payment-method, status, and Reset controls remain incomplete.
3. `LIVE-INVOICE-THERMAL-BLANK-PAGE-001`
   - 80mm content is correct on page one with one blank trailing page; A4 is complete.
4. `KNOWN RESIDUAL CUSTOMER-SETTLEMENT CLIENT-COMPLETION RISK — P2`
   - One exact server/accounting commit can leave the connected page on
     `Processing...`; independent truth and one reload recover it.
5. `KNOWN RESIDUAL SUPPLIER-PAYMENT CLIENT-SETTLEMENT RISK — P2`
   - One exact server/accounting commit can leave the page on `Recording...`;
     independent truth and one reload recover it.
6. `ACCEPTED WITH LIMITED CASHIER COVERAGE — P2`
   - Permission contracts passed, but authenticated cashier production
     acceptance was unavailable.

## Exact Active P3 Register

1. Historical/intermittent Expenses original-page settlement delay.
2. Expense Restore original-page settlement recovery.
3. Expense Reset date-field presentation.
4. Daily Closing hydration and print-footer noise.
5. Narrow mobile invoice-title and summary-label wrapping.

## Closed Tenant-Integrity P1

`REPAIR-CUSTOMER-TENANT-INTEGRITY-001` is fixed and production-verified.

- Discovery: the optional-field investigation created a synthetic repair in one
  organization linked to a customer from another. Optional source work stopped,
  P1 temporarily became 1, and finishing was blocked.
- Source PR #326: reviewed head
  `446d08e7c88f981e418391103abe03a2dc4b7eae`, squash
  `12de0dd189d0c41895e4da5ca06bd880d17ee98b`.
- Source behavior: `saveRepairAction` now checks customer ID plus authenticated
  organization ID before repair, history, or audit mutation and selects only ID.
- Database behavior: a validated composite FK enforces
  `(organization_id, customer_id) -> customers(organization_id, id)` with
  `ON UPDATE RESTRICT` and customer deletion clearing only `customer_id`.
- Production preflight: 3 repairs, 3 linked, 0 mismatches, 0 conflicts.
- Equivalent migration delivery preflight: passed. Supabase Preview was disabled
  and was not represented as passed.
- Migration delivery: automatic and exactly once between source merge
  `2026-08-02T08:06:23Z` and first retained verification
  `2026-08-02T08:11:18.427156Z`; no duplicate manual apply.
- Rollback-only probe: incompatible cross-organization reassignment failed with
  SQLSTATE `23503`, fully rolled back, and left no persistent fixture.
- Focused documentation PR #327: head
  `98375cb4e79cc364f6baf4da91d2c1b286645af6`, squash
  `8afbc37751a76edb93d52175146be6dbb619a0a3`.

Tenant integrity is fixed. Optional-field validation is not fixed. Repair
statuses and permissions are unchanged; customer/supplier settlement risks
remain open; accounting, stock/FIFO, and Cash Drawer behavior are unchanged.

## Retained Optional-Field Evidence

- Evidence path:
  `/Users/sw12/Projects/saledock-local-evidence/repair-optional-fields-fix`
- Manifest SHA-256:
  `bb3b253cf534e851ae8e595c3f97357d5c2c88d64af5232c49ce1edb53f3b047`
- Manifest entries: 15/15 verified.
- Schema matrix: 28 cases.
- Old protected worktree:
  `/Users/sw12/Projects/saledock-repair-optional-fields`
- Old branch: `fix/repair-optional-fields`
- Old HEAD: `22f444dacad4d6a0465a83ad5cd112fe8df7acee`
- Source commit/push/PR: none.

Do not switch, reset, rebase, clean, delete, or reuse that worktree. The next
source task must create a fresh worktree from current main and reuse this
evidence rather than repeating the complete investigation.

## Evidence Boundaries

- Tenant source evidence:
  `/Users/sw12/Projects/saledock-local-evidence/repair-customer-tenant-integrity-fix`
- Tenant source manifest:
  `64b29417ce8e3418474b3678bb377e7770a88eda5bd4562be3793ae2baf7b095`
- Tenant live evidence:
  `/Users/sw12/Projects/saledock-local-evidence/repair-customer-tenant-integrity-live-verification`
- Tenant live manifest:
  `934124226da08ebd09c410570188840571c50205d6e379f8ccddac1a854dae0e`
- Live marker: `LIVE-REPAIR-TENANT-20260802-1306-AE5C`, evidence metadata only.
- Focused QA record: `docs/qa/repair-customer-tenant-integrity-fix.md`.

Local evidence is not authenticated production proof. The production database
probe attempted one write inside an explicit transaction but fully rolled back;
the truthful boundary is zero persistent fixture and zero persistent business
mutation, not zero SQL write attempts.

## Settlement And Safety Boundaries

- Customer and supplier settlement client completion remain open.
- Never resubmit solely because the connected page remains pending.
- Keep organization and branch scope explicit.
- Preserve Cash/non-cash separation, FIFO allocations, retained history, and
  customer/supplier balance truth.
- Do not change repair statuses, permissions, settlement, accounting, stock,
  FIFO, Dashboard, Reports, Cash Drawer, RLS, or schema in the optional task.
- Public HTTP proves availability only.

## Protection And Archives

- Required historical protection: 21 worktrees and 26 dirty/untracked files.
- Broader opening inventory for this synchronization: 46 worktrees and 28
  dirty/untracked entries.
- The authorized new canonical worktree raises the in-task total to 47;
  dirty/untracked entries remain 28.
- Expenses diagnostic:
  `0ce14eaefb061454eb2fc0c1d3ad39dc0c3a9e6f3a79d2eb761185a88cf45715`.
- Customer-settlement diagnostic:
  `a1e81833205e4916d8683a91fa3b85a922d2b4013e9e8e7cb3269241425257af`.
- Twenty-nine previously verified temporary archives expired from `/tmp`.
- Forty-three historical archives remain unavailable.
- None was restored, reconstructed, or represented as physically available.

## Immediate Next Task

Resume `LIVE-REPAIR-OPTIONAL-001` only.

1. Create a fresh worktree from the then-current main.
2. Reverify current Repair form, schema, action, and tenant-invariant source.
3. Reuse the retained 28-case schema matrix and browser evidence.
4. Implement only the proven blank-optional normalization and malformed
   nonblank expected-delivery date-validation correction.
5. Rerun current-main repair, tenant, role, status, audit, accounting, cleanup,
   and duplicate protections.
6. Keep the task review-first and do not mutate production during source work.

Do not combine repair status redesign, customer/supplier settlement, invoice
work, cashier coverage, or another P2/P3 finding. Do not repeat the completed
tenant-integrity correction.

## Files A New Chat Should Read

1. `02_CURRENT_STATE.md`
2. `03_REMEMBER.md`
3. `CHATGPT_CONTINUATION_BRIEF.md`
4. `docs/qa/repair-customer-tenant-integrity-fix.md`
5. `docs/qa/live-finishing-continuation-acceptance-2026-07-26.md`
6. `/Users/sw12/Projects/saledock-local-evidence/repair-optional-fields-fix`
7. Relevant focused QA records only as needed

Do not require nonexistent attachments. SaleDock is not audit-ready and not
MVP-live.
