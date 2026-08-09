# 02 — Current State (LIVING — keep this updated)
*Last updated: 10 August 2026 after authenticated repair status-audit durability closure.*

## Current Repository And Production

- Repository: `https://github.com/starwalker12/saledock-cloud-pos.git`
- Canonical synchronization base: `ba342c8c5316a878dc3e6709e134b5fc6c43823e`
- Latest application-behavior commit: `c913d4fcc41db3a1f30d6b6e774a7c2c8ff244c1`
- Latest behavior change: `fix: make repair status audit durable`
- Previous optional-field behavior commit: `62ee3a9ea985fc7b9016bddfb1161b51f80d1efa`
- Latest focused documentation commit: `ba342c8c5316a878dc3e6709e134b5fc6c43823e`
- Production deployment: `CkrQUJtbYKKQQsab6qK8Phi2qHVo`
- Deployment state: Ready and current for the synchronization base
- Production identity verified: Fardan Aatir, Owner, Star Shop, Main Branch, PKR, Asia/Karachi

This documentation synchronization records the production-verified closure of
`REPAIR-STATUS-AUDIT-DURABILITY-001`. Repair optional-field validation, Repair
Intake create-audit durability, and repair/customer tenant integrity remain
closed. It changes documentation only.

## Current Classification

**FINISHING ACCEPTED WITH LIMITED COVERAGE**

- P0 active: **0**
- P1 active: **0**
- P2 active findings or coverage limits: **5**
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

1. `LIVE-INVOICE-FILTER-001`
   - Invoice search, date, payment-method, status, and Reset controls are absent or materially incomplete.
   - Invoice detail and retained financial truth are correct.
2. `LIVE-INVOICE-THERMAL-BLANK-PAGE-001`
   - The 80mm invoice preview contains correct content on page one and one blank trailing page.
   - The A4 preview is complete and unclipped.
3. `KNOWN RESIDUAL CUSTOMER-SETTLEMENT CLIENT-COMPLETION RISK — P2`
   - Server and accounting truth can commit exactly once while the original connected page remains on `Processing...`.
   - An independent page and one reload recover the correct truth.
   - The exact intermittent trigger remains unproven; the issue is not fixed.
4. `KNOWN RESIDUAL SUPPLIER-PAYMENT CLIENT-SETTLEMENT RISK — P2`
   - Server and accounting truth can commit exactly once while the original page remains on `Recording...`.
   - An independent page and one reload recover the correct truth.
   - The issue is not fixed.
5. `ACCEPTED WITH LIMITED CASHIER COVERAGE — P2`
   - Permission contracts were reviewed.
   - No authenticated cashier session or approved credentials were available.
   - No cashier financial mutation was performed.

## Active P3 Observations

1. Historical/intermittent Expenses original-page settlement delay.
2. Expense Restore original-page settlement recovery.
3. Expense Reset date-field presentation.
4. Daily Closing hydration and print-footer noise.
5. Narrow mobile invoice-title/summary-label wrapping.

## Closed P2 History

### `REPAIR-STATUS-AUDIT-DURABILITY-001` — CLOSED

- Former active finding: `KNOWN RESIDUAL REPAIR-STATUS AUDIT DURABILITY RISK — P2`.
- Source PR: #333.
- Reviewed source head: `609d99d9402ffeb966e35c83665255a7f89ac901`.
- Source squash: `c913d4fcc41db3a1f30d6b6e774a7c2c8ff244c1`.
- Source merge: `2026-08-09T19:46:19Z`.
- Source deployment: `4G8GipaievscE6XJm6mmf5hRoy8b`.
- Deterministic proof: delayed completion allowed the old status action to
  return before audit completion, while returned and thrown audit failures were
  caller-invisible.
- Correction: after the organization-scoped repair update and required status
  history, one caller-local `audit_logs` insert is checked and awaited before
  success. A failure reports truthful partial-save/no-resubmit guidance with the
  exact repair ID. The global audit helper remains unchanged.
- Authenticated marker: `LIVE-REPAIR-STATUS-AUDIT-20260810-0051-7919`.
- Repair: `RJ-000006`, ID
  `cdfeaecf-4e47-41d9-9cbb-fad4f21c2470`.
- Live result: one ordinary `received` to `cancelled` submission produced one
  exact history and one `repairs.status_changed` audit with the correct actor,
  organization, branch, repair ID, old status, and new status.
- Safety: duplicates and tenant mismatches were zero; no customer, ledger,
  invoice, payment, settlement, stock/FIFO, Cash Drawer, Net Cash, or dues
  effect occurred. The status audit contained no private or financial values.
- Live evidence:
  `/Users/sw12/Projects/saledock-local-evidence/repair-status-audit-durability-live-verification`.
- Live manifest SHA-256:
  `f882b0a95d20b7c1ab6be6248cbae26b354e147dc79f6189322320edc1500c71`.
- Focused documentation PR: #334.
- Focused documentation head: `9a5708b31806fd7c4e5b35bd4ac705b32b766c60`.
- Focused documentation squash: `ba342c8c5316a878dc3e6709e134b5fc6c43823e`.
- Final production deployment: `CkrQUJtbYKKQQsab6qK8Phi2qHVo`.

Repair-status audit durability is fixed. Repair create-audit durability,
optional repair fields, and repair/customer tenant integrity remain fixed.
Repair permissions and status workflow semantics are unchanged. Customer and
supplier settlement risks and limited cashier coverage remain open.

Decision: `PASS — REPAIR-STATUS-AUDIT-DURABILITY-001 FIXED`.

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

### `LIVE-REPAIR-OPTIONAL-001` — CLOSED

- Original July 26 evidence: blank fields presented as optional produced
  `Invalid UUID` before mutation.
- Optional-field source PR: #329
- Reviewed source head: `1da2887aabcf2736a258d089b8120b386d1011dc`
- Source squash: `62ee3a9ea985fc7b9016bddfb1161b51f80d1efa`
- Merge timestamp: `2026-08-02T10:48:51Z`
- Correction: blank customer UUID, optional text, and blank Expected Delivery
  normalize to the established empty representation; nonblank dates require an
  exact real Gregorian `YYYY-MM-DD` value.
- Retained root-cause matrix: 28 cases.
- No migration or Repair form source change was required.
- First production acceptance: marker
  `LIVE-REPAIR-OPTIONAL-20260802-1553-6860`, repair `RJ-000004`, ID
  `ee8365bc-e341-450e-b1aa-ee18c47ada8e`. Optional fields passed, customer and
  Expected Delivery were null, one repair and one initial `received` history
  committed, no customer was created, and financial, tenant, and duplicate
  effects were zero. The create audit count was zero, so the acceptance stopped.
  The repair remains cancelled and untouched.
- First live evidence:
  `/Users/sw12/Projects/saledock-local-evidence/repair-optional-fields-live-verification`
- First live manifest SHA-256:
  `a506e5d8ebc99b42689bb140ad10bda6d0c03b0058a2ec825a9f1c791e5c9e65`
- Successful rerun: marker
  `LIVE-REPAIR-OPTIONAL-RERUN-20260803-0504-91FB`, repair `RJ-000005`, ID
  `0d979a61-9d6a-41bd-91f8-d1e14a83e41b`. One repair, one initial `received`
  history, and one durable `repairs.created` audit committed; optional blanks,
  customer null, Expected Delivery null, no customer creation, duplicate checks,
  and safety checks passed. The repair remains truthfully cancelled.
- Successful rerun evidence:
  `/Users/sw12/Projects/saledock-local-evidence/repair-optional-fields-live-verification-rerun`
- Successful rerun manifest SHA-256:
  `64e1bf6d9619df9230854c02e44654d115ea58ebfb1e9131e537212e6703d8df`

Optional repair-field validation is fixed. Tenant integrity remains fixed.
Repair-status audit durability was subsequently closed by PRs #333 and #334;
see the newer closed-history entry above.

Decision: `PASS — LIVE-REPAIR-OPTIONAL-001 FIXED`.

### `REPAIR-CREATE-AUDIT-DURABILITY-001` — CLOSED

- Source PR: #330
- Reviewed source head: `14e920925bb5586b1923b6c9d2d8eb59615267c7`
- Source squash: `de94a0e59de20c51e7c77cdbfa2fe496d30019e9`
- Merge timestamp: `2026-08-02T23:59:44Z`
- Main CI: run `30773416186`, successful
- Source deployment used for the accepted rerun:
  `DDtDXWcufFyhYHFStkKDSahE3uUD`
- Root cause: initial history was awaited without checking its returned error,
  while `repairs.created` used a fire-and-forget global helper whose
  `Promise<void>` contract hid returned insert errors.
- Correction: the save path checks initial-history completion, performs a
  caller-local checked and awaited audit insert, and returns success only after
  the audit completes. Returned or thrown audit failures produce a safe
  partial-save warning with the exact repair ID, no automatic retry, no
  duplicate, no delete, and no compensating mutation.
- Privacy: the audit retains only the existing customer display name and device
  type boundary; phone, serial/IMEI, problem description, Notes, and accessories
  are excluded.
- Boundaries: the global audit helper and `updateRepairStatusAction` are
  unchanged; no migration, schema, accounting, stock/FIFO, Dashboard, Reports,
  Cash Drawer, tenant, permission, optional-validation, or settlement behavior
  changed.
- Source evidence:
  `/Users/sw12/Projects/saledock-local-evidence/repair-create-audit-durability-fix`
- Source manifest SHA-256:
  `c6fd90f8791ef32fa916e1de784ad1bec0358fcbacce45c8138c603f4e8bc08b`
- Focused documentation PR: #331
- Focused documentation head: `28e4fea5fd70109583987a797deaf250e8b9eab7`
- Focused documentation squash: `85031fe8bf32a02f7bcf93b63a2e65752dd354df`
- Focused documentation merge: `2026-08-03T00:25:33Z`
- Focused PR/main CI: runs `30774353255` / `30774455143`, successful
- Final focused deployment: `3g68nELcKAKV1hjz6rwbTFHycTNC`

Repair Intake create auditing is durable and production-verified. At this
historical point repair-status audit durability remained open; it was later
closed by PRs #333 and #334.

Decision: `PASS — REPAIR-CREATE-AUDIT-DURABILITY-001 FIXED`.

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

Repair/customer tenant integrity is fixed. Optional repair-field validation and
Repair Intake create-audit durability were later fixed without changing the
tenant source or migration. At this historical tenant-closure checkpoint,
repair-status auditing and permissions were unchanged; status-audit durability
was later fixed by PR #333. Settlement findings remain open; accounting,
stock/FIFO, and Cash Drawer behavior are unchanged.

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
| Repair optional fields | `62ee3a9ea985fc7b9016bddfb1161b51f80d1efa` | `85031fe8bf32a02f7bcf93b63a2e65752dd354df` | Blank optional values and Expected Delivery passed with customer null; malformed nonblank dates remained rejected. |
| Repair create-audit durability | `de94a0e59de20c51e7c77cdbfa2fe496d30019e9` | `85031fe8bf32a02f7bcf93b63a2e65752dd354df` | One Repair Intake, one initial history, and one exact durable create audit passed; the then-open status-audit durability risk was later closed by PRs #333 and #334. |
| Repair status-audit durability | `c913d4fcc41db3a1f30d6b6e774a7c2c8ff244c1` | `ba342c8c5316a878dc3e6709e134b5fc6c43823e` | One authenticated `received` to `cancelled` transition produced one exact history and one durable status audit with no duplicate, tenant, privacy, or financial effect. |

## Protection And Archive Reality

- Required historical protection: 21 worktrees and 26 dirty/untracked files.
- Expanded current protection baseline: 22 worktrees and 27 dirty/untracked
  files, all verified before this synchronization.
- Broader chronology: 53 worktrees and 28 dirty/untracked entries before this
  task. The separately authorized clean
  `docs/canonical-repair-status-audit-sync` worktree raises the in-task total
  to 54 while dirty/untracked entries remain 28.
- Expenses diagnostic SHA-256: `0ce14eaefb061454eb2fc0c1d3ad39dc0c3a9e6f3a79d2eb761185a88cf45715`
- Customer-settlement diagnostic SHA-256: `a1e81833205e4916d8683a91fa3b85a922d2b4013e9e8e7cb3269241425257af`
- Twenty-nine historical archives were previously verified; their ephemeral `/tmp` copies expired.
- Forty-three historical archives remain unavailable.
- No missing archive was restored, reconstructed, or represented as physically available.

Always enumerate and fingerprint current worktrees before new work. Never reset,
clean, stash, switch, overwrite, or delete a protected worktree.

## Immediate Next Task

Perform one focused review-first investigation of `LIVE-INVOICE-FILTER-001`.

Reason:

- Investigate invoice list filtering and Reset behavior only.
- Preserve invoice financial truth and existing payment, return, accounting,
  tenant, and permission behavior.
- Do not combine the 80mm thermal blank-page finding, customer or supplier
  settlement, cashier coverage, or a P3 observation.
- Do not create a financial production mutation during the initial source
  investigation.

Do not combine another P2 or P3 finding into that task.

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
- First optional-field live acceptance:
  `/Users/sw12/Projects/saledock-local-evidence/repair-optional-fields-live-verification`
- First optional-field live manifest SHA-256:
  `a506e5d8ebc99b42689bb140ad10bda6d0c03b0058a2ec825a9f1c791e5c9e65`
- Repair create-audit source evidence:
  `/Users/sw12/Projects/saledock-local-evidence/repair-create-audit-durability-fix`
- Repair create-audit source manifest SHA-256:
  `c6fd90f8791ef32fa916e1de784ad1bec0358fcbacce45c8138c603f4e8bc08b`
- Successful repair optional-field rerun:
  `/Users/sw12/Projects/saledock-local-evidence/repair-optional-fields-live-verification-rerun`
- Successful rerun manifest SHA-256:
  `64e1bf6d9619df9230854c02e44654d115ea58ebfb1e9131e537212e6703d8df`
- Focused QA records: `docs/qa/expense-restore-audit-fix.md` and
  `docs/qa/customer-lifecycle-audit-fix.md`, plus
  `docs/qa/customer-ledger-presentation-fix.md`,
  `docs/qa/repair-optional-fields-fix.md`, and
  `docs/qa/repair-create-audit-durability-fix.md`, plus
  `docs/qa/repair-status-audit-durability-fix.md`
- Supporting evidence confirms chronology; it does not mean every historical workflow was rerun on July 26.
- Public HTTP availability does not prove an authenticated workflow.
- The canonical synchronization itself performs no production mutation and changes no application source, test, migration, package, workflow, configuration, or schema.
- SaleDock is not audit-ready and not MVP-live.
