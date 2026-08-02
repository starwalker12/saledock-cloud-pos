# 02 — Current State (LIVING — keep this updated)
*Last updated: 2 August 2026 after repair/customer tenant-integrity P1 closure.*

## Current Repository And Production

- Repository: `https://github.com/starwalker12/saledock-cloud-pos.git`
- Canonical synchronization base: `8afbc37751a76edb93d52175146be6dbb619a0a3`
- Latest application-behavior commit: `12de0dd189d0c41895e4da5ca06bd880d17ee98b`
- Latest behavior change: `fix: enforce repair customer tenant integrity`
- Latest focused documentation commit: `8afbc37751a76edb93d52175146be6dbb619a0a3`
- Production deployment: `GooqVaWAfTVhunUU1eYFyBLguiDx`
- Deployment state: Ready and current for the synchronization base
- Production identity verified: Fardan Aatir, Owner, Star Shop, Main Branch, PKR, Asia/Karachi

This documentation synchronization records the discovery, temporary finishing
block, and production-verified closure of
`REPAIR-CUSTOMER-TENANT-INTEGRITY-001`. It changes documentation only.

## Current Classification

**FINISHING ACCEPTED WITH LIMITED COVERAGE**

- P0 active: **0**
- P1 active: **0**
- P2 active findings or coverage limits: **6**
- P3 active observations: **5**
- Audit-ready: **NO**
- MVP-live: **NO**

The exact limitation is authenticated cashier production acceptance. Permission
contracts were reviewed, but no approved cashier credentials or authenticated
cashier session existed. No cashier account was created, reset, invited, or
impersonated, and no cashier financial mutation was performed.

Accepted limited coverage is not a blanket pass. The P2 and P3 register below
remains active.

## Active P2 Register

1. `LIVE-REPAIR-OPTIONAL-001`
   - The form submits `customer_id=""` when no registered customer is selected,
     but the schema accepts a UUID/null/omission rather than the HTML blank string.
   - Optional-string preprocessing runs at the wrong validation layer, so blank
     Customer Phone, Device Model, Serial / IMEI, Accessories, and Notes can fail.
   - Blank expected-delivery date is not normalized, while malformed nonblank
     date values can pass insufficient validation.
   - The retained 28-case schema matrix established the root cause; no optional
     correction has been implemented and production remains affected.
   - Rejected attempts created zero repair/history/audit/customer rows and zero
     financial or Cash Drawer effect.
2. `LIVE-INVOICE-FILTER-001`
   - Invoice search, date, payment-method, status, and Reset controls are absent or materially incomplete.
   - Invoice detail and retained financial truth are correct.
3. `LIVE-INVOICE-THERMAL-BLANK-PAGE-001`
   - The 80mm invoice preview contains correct content on page one and one blank trailing page.
   - The A4 preview is complete and unclipped.
4. `KNOWN RESIDUAL CUSTOMER-SETTLEMENT CLIENT-COMPLETION RISK — P2`
   - Server and accounting truth can commit exactly once while the original connected page remains on `Processing...`.
   - An independent page and one reload recover the correct truth.
   - The exact intermittent trigger remains unproven; the issue is not fixed.
5. `KNOWN RESIDUAL SUPPLIER-PAYMENT CLIENT-SETTLEMENT RISK — P2`
   - Server and accounting truth can commit exactly once while the original page remains on `Recording...`.
   - An independent page and one reload recover the correct truth.
   - The issue is not fixed.
6. `ACCEPTED WITH LIMITED CASHIER COVERAGE — P2`
   - Permission contracts were reviewed.
   - No authenticated cashier session or approved credentials were available.
   - No cashier financial mutation was performed.

## Active P3 Observations

1. Historical/intermittent Expenses original-page settlement delay when server truth is correct.
2. Expense Restore original-page settlement recovered after reload.
3. Expense Reset date-field synchronization/presentation issue.
4. Daily Closing hydration and print-footer noise while cash truth remains correct.
5. Narrow mobile invoice-title ellipsis and summary-label wrapping.

## Closed P2 History

### `LIVE-EXPENSE-RESTORE-AUDIT-001` — CLOSED

- Source PR: #317
- Original source head: `afde45b53ddbe8c03956327dbaf7bd9427c8db2a`
- Owner-review correction head: `51137c4a749023ed3e2a5fa73d403a4590a1ad03`
- Source squash: `c823af4552b4841d776533bdabb770c6abb93a00`
- Authenticated source deployment: `2HoXqm32LeSRZh89axEc6CDcr69h`
- Live marker: `LIVE-EXP-RESTORE-AUDIT-20260729-0132-L8YQ`
- Result: one genuine archived-to-active transition and exactly one
  `expenses.restored` audit with the correct actor, organization, branch,
  expense ID, details, and transition metadata.
- Business truth: amount, category, Card method, vendor, notes, creator, and
  timestamp were preserved; Dashboard and Reports reconciled; Net Cash and
  Cash Drawer were unchanged; duplicates were zero; the expense ended archived.
- Focused live-verification PR: #318
- Focused documentation head: `98dff8d5b5f7847bf48adbbaf72f24e390ef91cb`
- Focused documentation squash: `2b55443e5fafd6a1f76181b6e42b4748e0b53f8d`
- Final focused deployment: `F2ukbJu7Q1TrSmc7pruom1YAQKyo`

The missing Restore audit is fixed. Expense Restore client settlement and
Expense Reset date-field presentation remain open P3 observations.

### `LIVE-CUSTOMER-AUDIT-001` — CLOSED

- Retained finding: the authenticated July 26 run showed one correct
  `customer.credit_payment` audit but no customer lifecycle audits.
- Source PR: #320
- Reviewed source head: `16f1fa9037ad998e4f8005eab17f4f44dcd9b8b8`
- Source squash: `31e20a58d36657d9bca00ed13aa09c5b07711059`
- Source deployment: `Dn4teeYnjpW2eKEYwFfuvSvgxzde`
- First production attempt:
  `LIVE-CUSTOMER-AUDIT-20260729-0421-911A`, customer
  `9fbf4b37-47ce-4dc0-be2f-9b7e653ea508`. Credit Limit PKR 500 was not
  visibly established before submission, PKR 0 persisted, one create and one
  archive audit committed, and no persistence defect was inferred.
- Successful rerun:
  `LIVE-CUSTOMER-AUDIT-RERUN-20260729-0447-17BE`, customer
  `b970bc25-0299-455e-b6b7-c0ffb6953bb2`. A visibly confirmed PKR 500
  persisted on create and PKR 600 persisted on the genuine update.
- Exact lifecycle totals: one `customers.created`, one `customers.updated`,
  two `customers.archived`, and one `customers.restored`; the identical no-op
  update created no row change or audit.
- Privacy and safety: lifecycle audits contained no raw phone, email, address,
  or Notes values; customer balance and all marker financial rows remained
  zero; Net Cash, Cash Drawer, stock/FIFO, supplier dues, and open shifts were
  unchanged.
- Final states: both marked production customers remain truthfully archived.
- Focused live-verification PR: #321
- Focused documentation head: `ade6527a9bca4e3ebdc7f3d10e87fa3238a01813`
- Focused documentation squash: `157c0181fbe8c4cf79d0904e3a39a5443df57288`
- Final focused deployment: `DzCZELXPyhHwRBfZaH2MLwTUe58w`

Customer lifecycle auditing is fixed. Customer-settlement client completion is
not fixed. The first attempt did not prove a Credit Limit defect; the successful
rerun proved persistence after the browser value was visibly confirmed.

### `LIVE-CUSTOMER-LEDGER-001` — CLOSED

- Original July 26 truth: customer debt already reconciled as one PKR 150
  invoice debit, one PKR 150 Credit Payment, and a PKR 0 final balance.
- Retained customer: `0dd1406a-ed51-4ff4-9f30-24a32b2d2ac4`
- Invoice: `INV-100361`, ID
  `d78ef3f5-7480-4e40-a330-38ec7791028b`
- Historical wrong route ID:
  `432d7aef-7214-41d7-ae05-0d04c228248e`
- Source PR: #323
- Reviewed source head: `c94390bfbb6286cdadb3f3a5d733c3ef95dd67e8`
- Source squash: `4b68e379ed5b4e60c9dbbef9e6fe53dd32c90266`
- Source deployment: `GuqL5ytTPBn93zHrXpxEsotPgX33`
- Read-only live marker: `LIVE-CUSTOMER-LEDGER-20260729-1615-C409`
- Corrected invoice href:
  `/invoices/d78ef3f5-7480-4e40-a330-38ec7791028b`
- Return: `RET-001006`, ID
  `a473366e-6617-468b-981c-668169b2282e`, linked through
  `/returns/a473366e-6617-468b-981c-668169b2282e`
- Presentation truth: the customer page now shows one truthful Returns &
  refunds row with PKR 150 subtotal, PKR 150 Card refund, and correct return
  and invoice navigation.
- Accounting truth: no synthetic fully-paid-return debt row was created; final
  balance stayed PKR 0; duplicate ledger and return rows were zero.
- Safety: production mutations were zero; desktop, 390×844, and 320×568
  presentations passed.
- Live evidence:
  `/Users/sw12/Projects/saledock-local-evidence/customer-ledger-presentation-live-verification`
- Live manifest SHA-256:
  `85e4dbacd4f9fd9f6b753c655d45d0035e7db22c6cee7c9747f7bdb4fd5084ec`
- Focused live-verification PR: #324
- Focused documentation head: `8d210692893d5010fcfafd12f44422ba451bc5dd`
- Focused documentation squash:
  `d15530cca701b597c81778e7b984627d959fe6fc`
- Final focused deployment: `Ayagpz9EfpCcYbX3fEYPR2jdpsyC`

Customer ledger presentation and reference routing are fixed. Customer debt
accounting was not changed, customer-settlement client completion is not fixed,
and no financial production mutation, migration, or schema change was required.

## Authenticated Finishing Result

Primary evidence:

- Path: `/Users/sw12/Projects/saledock-local-evidence/live-finishing-continuation-2026-07-26`
- Marker: `FINISHING-CONT-20260726-2022-2B42`
- Manifest SHA-256: `90f9cd57b810a29eb554a283b43a11281e0e1f6c5c7fab3f60bdb949eca34429`
- Manifested files: 58
- Screenshots: 42
- Secret scan: passed

Production phases:

- Customer balance truth reconciled; lifecycle auditing and ledger presentation
  are closed while customer-settlement client completion remains open.
- Repair `RJ-000003` moved received → in progress → completed → cancelled, with no duplicate.
- Expenses create and five update shapes completed once each. The final PKR 80 Marketing/Card expense was archived. Timestamp and Cash Drawer truth stayed correct.
- Invoice `INV-100364` detail, payment, return, reload, and A4 preview passed. Filter and 80mm trailing-blank-page P2 findings remain.
- The retained cash shift closed at PKR 1,000 starting, expected, and counted cash with PKR 0 difference.
- Reports returned from the active-expense state to their exact opening baseline.
- True authenticated 390×844 and 320×568 coverage had no page-level horizontal overflow. Repair status and Expense notes mobile mutations completed once each.
- Owner route coverage passed without cross-organization exposure.
- Authenticated cashier production coverage was unavailable.

Final Dashboard baseline:

| Metric | Final value |
| --- | ---: |
| Net Profit | PKR 0 |
| Gross Sales | PKR 300 |
| Expenses | PKR 0 |
| Returns | PKR 300 |
| Net Cash | PKR 0 |
| Pending Repairs | 1 |
| Supplier Dues | PKR 0 |
| Customer Dues | PKR 405 |
| Stock valuation | PKR 325,340 |
| FIFO valuation | PKR 308,965 |

These values matched the exact opening baseline. No unexplained financial delta
remained; retained historical totals were not assumed to be zero.

## Fixed P1 History

Do not reopen these findings without new contradictory evidence.

### `REPAIR-CUSTOMER-TENANT-INTEGRITY-001` — FIXED

- Discovery: the retained `LIVE-REPAIR-OPTIONAL-001` investigation created one
  synthetic cross-organization repair/customer link and stopped optional-field
  source work. Finishing temporarily became
  `FINISHING BLOCKED — ACTIVE P1 TENANT INTEGRITY` with P1 at 1.
- Source PR: #326
- Reviewed source head: `446d08e7c88f981e418391103abe03a2dc4b7eae`
- Source squash: `12de0dd189d0c41895e4da5ca06bd880d17ee98b`
- Migration: `20260729133000_enforce_repair_customer_tenant_integrity.sql`
- Production preflight: 3 repairs, 3 linked repairs, 0 mismatches, and 0
  incompatible object conflicts on PostgreSQL 17.6.1.121.
- Equivalent migration delivery preflight: passed. Supabase Preview was
  disabled and was not represented as passed.
- Production delivery: the migration appeared exactly once automatically in
  the window from source merge `2026-08-02T08:06:23Z` to first retained
  metadata verification `2026-08-02T08:11:18.427156Z`; no duplicate manual
  apply command was issued.
- Production invariant: `repairs_organization_customer_id_fkey` is validated
  for `(organization_id, customer_id) -> customers(organization_id, id)`, the
  legacy ID-only FK is absent, null customer links remain supported, and the
  post-migration mismatch count is 0.
- Rollback-only probe: one internal-ID cross-organization reassignment failed
  with SQLSTATE `23503`; the explicit transaction fully rolled back and left
  no persistent fixture or business mutation.
- Source deployment: `dpl_5VkXkjFCx1vwqdA2ukK639jrUVur`
- Live marker: `LIVE-REPAIR-TENANT-20260802-1306-AE5C`
- Live evidence:
  `/Users/sw12/Projects/saledock-local-evidence/repair-customer-tenant-integrity-live-verification`
- Live manifest SHA-256:
  `934124226da08ebd09c410570188840571c50205d6e379f8ccddac1a854dae0e`
- Focused documentation PR: #327
- Focused documentation head: `98375cb4e79cc364f6baf4da91d2c1b286645af6`
- Focused documentation squash: `8afbc37751a76edb93d52175146be6dbb619a0a3`
- Final deployment: `GooqVaWAfTVhunUU1eYFyBLguiDx`

Repair/customer tenant integrity is fixed. Optional repair-field validation is
not fixed. Repair statuses and permissions are unchanged; settlement findings
remain open; accounting, stock/FIFO, and Cash Drawer behavior are unchanged.

Chronology remains explicit: before discovery P0/P1/P2/P3 were 0/0/6/5;
during investigation P1 became 1 and finishing was blocked; after PRs #326 and
#327 P1 returned to 0, P2/P3 remained 6/5, and finishing returned to accepted
with limited coverage.

| Area | Source merge | Documentation merge | Authenticated production result |
| --- | --- | --- | --- |
| Opening stock and FIFO atomicity | `da40ad2b846f69736231dfba9f8e46f013f6d247` | `2f71c5c0db0e2e799032087cd3077ab8c204e058` | Opening stock, movement, FIFO lot, and atomic consistency passed. |
| Supplier purchase number generation | `857556f173383efd66cbbf3f96448d0562cc8bc6` | `afaef696aa7df08cd1e18965e5770f7e00189bb9` | Purchase number, stock/FIFO, supplier due, and Card settlement passed. Supplier-payment client settlement remains P2. |
| Expense timestamp preservation | `03eeda4a014852d294bc790b81c308d716802221` | `191c1a83229c0ad4aaeab97922b07be499e60f54` | Karachi conversion, timestamp preservation, intentional conversion, and report date passed. |
| Return-profit reconciliation | `68a86398f91cbfd240f8d3818c6bb866a4da2266` | `6542ab0577a02feaca26df9ac9dcb528f0caa564` | Full restocked return, exact restored FIFO cost, Dashboard profit, and Reports profit reconciled. |
| Dashboard net-cash reconciliation | `8f8202a428a88bd8d72d178facbafb775eb1abf8` | `0b94dcb072a204539aa4608d53e0237a77c058fe` | Card sale/refund net cash stayed zero; Cash sale/refund moved +150/-150; starting float stayed excluded; shift reconciled 1,000/1,000/0. |
| Repair/customer tenant integrity | `12de0dd189d0c41895e4da5ca06bd880d17ee98b` | `8afbc37751a76edb93d52175146be6dbb619a0a3` | Zero production mismatches, validated composite FK, rollback-only `23503` rejection, and read-only authenticated Repair UI passed. |

## Protection And Archive Reality

- Required historical protection: 21 worktrees and 26 dirty/untracked files.
- Broader chronology: 46 worktrees and 28 dirty/untracked entries before this
  synchronization; the separately authorized clean
  `docs/canonical-repair-tenant-integrity-sync` worktree raises the in-task
  total to 47 while dirty/untracked entries remain 28.
- The retained `/Users/sw12/Projects/saledock-repair-optional-fields` worktree
  remains protected at `22f444dacad4d6a0465a83ad5cd112fe8df7acee` and must not
  be switched, reset, rebased, cleaned, deleted, or reused.
- Expenses diagnostic SHA-256: `0ce14eaefb061454eb2fc0c1d3ad39dc0c3a9e6f3a79d2eb761185a88cf45715`
- Customer-settlement diagnostic SHA-256: `a1e81833205e4916d8683a91fa3b85a922d2b4013e9e8e7cb3269241425257af`
- Twenty-nine historical archives were previously verified; their ephemeral `/tmp` copies expired.
- Forty-three historical archives remain unavailable.
- No missing archive was restored, reconstructed, or represented as physically available.

Always enumerate and fingerprint current worktrees before new work. Never reset,
clean, stash, switch, overwrite, or delete a protected worktree.

## Immediate Next Task

Resume `LIVE-REPAIR-OPTIONAL-001` from retained root-cause evidence.

Reason:

- Do not redo the tenant investigation or rerun the complete discovery matrix.
- Do not reuse the protected stale optional-field worktree.
- Create a fresh worktree from the then-current main and reverify current
  repair form, schema, action, and tenant invariant source.
- Reuse the retained 28-case schema matrix and browser evidence.
- Implement only the proven blank-optional normalization and strict nonblank
  expected-delivery date validation correction.
- Rerun the required current-main repair, tenant, role, audit, status,
  accounting, cleanup, and duplicate safety matrix.

Do not combine repair status redesign, customer or supplier settlement, or
another P2/P3 finding into that task. Do not mutate production during the
review-first source investigation.

## Evidence Boundaries

- The July 26 finishing result used authenticated production browser evidence and read-only database verification where recorded.
- Expense Restore closure evidence: `/Users/sw12/Projects/saledock-local-evidence/expense-restore-audit-live-verification`
- Expense Restore closure manifest SHA-256: `94ed2ece32d3bf795a45aee61586b8909ade59dd635a545606c8da65dcc742c4`
- Customer lifecycle source evidence: `/Users/sw12/Projects/saledock-local-evidence/customer-lifecycle-audit-fix`
- Customer lifecycle source manifest SHA-256: `50d6b1079a70f4b9848dd2e79e1c85a52874b1425cd6ddbcadd3899f708d2342`
- First customer lifecycle production attempt: `/Users/sw12/Projects/saledock-local-evidence/customer-lifecycle-audit-live-verification`
- First production manifest SHA-256: `3f82d47d3926524c910eab1f601f77d82cb193b7fa71c8efbff651695483a1c0`
- Successful customer lifecycle rerun: `/Users/sw12/Projects/saledock-local-evidence/customer-lifecycle-audit-live-verification-rerun`
- Successful rerun manifest SHA-256: `d523c3a17c863e007df3d0c347cc8ec4d708b35e129fdfc990821de14008133e`
- Customer ledger source evidence:
  `/Users/sw12/Projects/saledock-local-evidence/customer-ledger-presentation-fix`
- Customer ledger source manifest SHA-256:
  `94285126c79f43809025beb761f664faa85cf6618a0bd4407c1bac5c1d1b7d11`
- Customer ledger live evidence:
  `/Users/sw12/Projects/saledock-local-evidence/customer-ledger-presentation-live-verification`
- Customer ledger live manifest SHA-256:
  `85e4dbacd4f9fd9f6b753c655d45d0035e7db22c6cee7c9747f7bdb4fd5084ec`
- Tenant-integrity source evidence:
  `/Users/sw12/Projects/saledock-local-evidence/repair-customer-tenant-integrity-fix`
- Tenant-integrity source manifest SHA-256:
  `64b29417ce8e3418474b3678bb377e7770a88eda5bd4562be3793ae2baf7b095`
- Tenant-integrity live evidence:
  `/Users/sw12/Projects/saledock-local-evidence/repair-customer-tenant-integrity-live-verification`
- Tenant-integrity live manifest SHA-256:
  `934124226da08ebd09c410570188840571c50205d6e379f8ccddac1a854dae0e`
- Retained optional-field evidence:
  `/Users/sw12/Projects/saledock-local-evidence/repair-optional-fields-fix`
- Retained optional-field manifest SHA-256:
  `bb3b253cf534e851ae8e595c3f97357d5c2c88d64af5232c49ce1edb53f3b047`
- Focused QA records: `docs/qa/expense-restore-audit-fix.md` and
  `docs/qa/customer-lifecycle-audit-fix.md`, plus
  `docs/qa/customer-ledger-presentation-fix.md`
- Supporting evidence confirms chronology; it does not mean every historical workflow was rerun on July 26.
- Public HTTP availability does not prove an authenticated workflow.
- The canonical synchronization itself performs no production mutation and changes no application source, test, migration, package, workflow, configuration, or schema.
- SaleDock is not audit-ready and not MVP-live.
