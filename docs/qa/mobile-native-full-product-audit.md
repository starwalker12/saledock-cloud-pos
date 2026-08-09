# SaleDock Mobile-Native Full Product Audit

Current synchronization date: 2026-08-03

Branch: `docs/canonical-repair-optional-audit-sync`

Base main SHA: `85031fe8bf32a02f7bcf93b63a2e65752dd354df`

Latest application-behavior SHA: `de94a0e59de20c51e7c77cdbfa2fe496d30019e9`

Latest focused documentation SHA: `85031fe8bf32a02f7bcf93b63a2e65752dd354df`

Production deployment: `3g68nELcKAKV1hjz6rwbTFHycTNC` (Ready/current)

Audit mode: review-first, audit-only. No production mutations, no app source changes, no migrations, and no business logic changes were made.

This document preserves the original mobile-native audit chronology and adds a separate current register from the authenticated July 26 production finishing acceptance. Historical counts below remain attached to their dated finding set; they are not silently rewritten as the current P2/P3 register. Supporting evidence confirms chronology and does not imply that every historical workflow was rerun on July 26.

Current recommendation: **FINISHING ACCEPTED WITH LIMITED COVERAGE**

## Current Executive Register — 2026-08-03

### Executive Status

| Item | Current result |
| --- | --- |
| Classification | **FINISHING ACCEPTED WITH LIMITED COVERAGE** |
| P0 active | 0 |
| P1 active | 0 |
| P2 findings or coverage limits | 6 |
| P3 observations | 5 |
| Exact limitation | No authenticated cashier production session or approved cashier credentials were available. |
| Audit-ready | No |
| MVP-live | No |
| Next task | Review-first investigation of `KNOWN RESIDUAL REPAIR-STATUS AUDIT DURABILITY RISK — P2` only. |

The authenticated production identity remains Fardan Aatir, Owner, Star Shop,
Main Branch, PKR, Asia/Karachi. Current production main is
`85031fe8bf32a02f7bcf93b63a2e65752dd354df`; the latest application-behavior
commit was `de94a0e59de20c51e7c77cdbfa2fe496d30019e9`; Vercel deployment
`3g68nELcKAKV1hjz6rwbTFHycTNC` was Ready/current.

Primary July 26 finishing evidence:

- path: `/Users/sw12/Projects/saledock-local-evidence/live-finishing-continuation-2026-07-26`;
- marker: `FINISHING-CONT-20260726-2022-2B42`;
- manifest SHA-256: `90f9cd57b810a29eb554a283b43a11281e0e1f6c5c7fab3f60bdb949eca34429`;
- 58 manifested files and 42 screenshots;
- manifest verification and secret scan passed.

### Active Finding Register

| Severity | Finding | Current truth |
| --- | --- | --- |
| P2 | `KNOWN RESIDUAL REPAIR-STATUS AUDIT DURABILITY RISK — P2` | `updateRepairStatusAction` and the global audit helper are unchanged; caller-visible confirmed audit persistence is not required, and two status audits that happened to persist do not prove durability. No production status-audit failure is claimed. |
| P2 | `LIVE-INVOICE-FILTER-001` | Search, date, payment-method, status, and Reset controls are absent or materially incomplete; invoice detail truth is correct. |
| P2 | `LIVE-INVOICE-THERMAL-BLANK-PAGE-001` | 80mm content is correct on page one with one blank trailing page; A4 is complete and unclipped. |
| P2 | `KNOWN RESIDUAL CUSTOMER-SETTLEMENT CLIENT-COMPLETION RISK — P2` | Accounting truth can commit once while the connected page stays on `Processing...`; independent read and reload recover the truth. |
| P2 | `KNOWN RESIDUAL SUPPLIER-PAYMENT CLIENT-SETTLEMENT RISK — P2` | Accounting truth can commit once while the original page stays on `Recording...`; independent read and reload recover the truth. |
| P2 | `ACCEPTED WITH LIMITED CASHIER COVERAGE — P2` | Permission contracts were reviewed, but no authenticated cashier session or approved credentials were available; no cashier financial mutation ran. |
| P3 | Historical/intermittent Expenses original-page settlement delay | Server truth can be correct while the original page remains delayed. |
| P3 | Expense Restore original-page settlement recovery | Original page was stale; one reload recovered exact truth. |
| P3 | Expense Reset date-field presentation | Visible date fields can remain stale after route reset. |
| P3 | Daily Closing hydration and print-footer noise | The observation remains while cash truth is correct. |
| P3 | Narrow mobile invoice-title/summary-label wrapping | The narrow presentation observation remains. |

### Current Area Status

| Area | Current status | July 26 evidence |
| --- | --- | --- |
| Customer | ACCEPTED WITH P2 CLIENT-SETTLEMENT RISK | Final balance reconciled, lifecycle auditing is fixed, and ledger references/return presentation are fixed. Customer-settlement client completion remains open. |
| Repairs | ACCEPTED WITH P2 AUDIT-DURABILITY RISK | Repair/customer tenant integrity, optional blank/date validation, and Repair Intake create-audit durability are fixed. `RJ-000004` and `RJ-000005` remain cancelled. Repair-status audit durability remains open because the status path and global helper were unchanged. |
| Expenses | ACCEPTED WITH P3 OBSERVATIONS | Create and five updates completed once each. Final PKR 80 Marketing/Card expense was archived; timestamp and Cash Drawer truth were correct. The missing Restore audit was closed by PR #317 and authenticated production verification. |
| Invoices | ACCEPTED WITH P2 GAPS | `INV-100364` detail/payment/return/reload and A4 passed. Filters are incomplete and 80mm adds one blank trailing page. |
| Cash Drawer / Daily Closing | ACCEPTED WITH P3 PRESENTATION NOISE | Closed shift reconciled starting/expected/counted PKR 1,000 with PKR 0 difference. Cash paid/refunded 150/150; Card physical-cash effect 0; no task-owned open shift. |
| Reports | ACCEPTED | Opening estimated profit 150; active expense produced expenses 80 and estimated profit 70; final estimated profit returned to 150 with zero unexplained delta. |
| Owner permissions | ACCEPTED | Tested owner routes passed with no cross-organization exposure or authorization error. |
| Cashier permissions | LIMITED P2 COVERAGE | Source permission contracts were reviewed; no authenticated cashier production session existed. |
| Mobile | ACCEPTED WITH P3 PRESENTATION LIMITS | True authenticated 390×844 and 320×568 passed without page-level horizontal overflow; one Repair and one Expense mobile mutation completed once. Soft-keyboard overlap was unavailable to measure. |

Final Dashboard values matched their exact opening baseline: Net Profit PKR 0,
Gross Sales PKR 300, Expenses PKR 0, Returns PKR 300, Net Cash PKR 0, Pending
Repairs 1, Supplier Dues PKR 0, Customer Dues PKR 405, stock valuation
PKR 325,340, and FIFO valuation PKR 308,965.

The current P2/P3 register is separate from the historical 17-finding
mobile-native register below. The historical register retains its original
dispositions and dated evidence.

## 2026-07-29 Expense Restore Audit Closure

The July 26 finishing acceptance originally identified
`LIVE-EXPENSE-RESTORE-AUDIT-001` after one genuine Restore committed with
correct business truth but no Restore audit.

- Source PR: #317
- Original source head: `afde45b53ddbe8c03956327dbaf7bd9427c8db2a`
- Owner-review source head: `51137c4a749023ed3e2a5fa73d403a4590a1ad03`
- Source squash: `c823af4552b4841d776533bdabb770c6abb93a00`
- Authenticated deployment: `2HoXqm32LeSRZh89axEc6CDcr69h`
- Live marker: `LIVE-EXP-RESTORE-AUDIT-20260729-0132-L8YQ`
- Result: one genuine Restore and exactly one `expenses.restored` audit with
  correct actor Fardan Aatir, organization Star Shop, branch Main Branch,
  expense ID, details, and archived-to-active metadata.
- Business safety: amount, category, Card method, vendor, notes, creator, and
  timestamp were preserved; Dashboard and Reports reconciled; Net Cash and
  Cash Drawer were unchanged; duplicates were zero; final state was archived.
- Focused documentation PR: #318
- Focused documentation head: `98dff8d5b5f7847bf48adbbaf72f24e390ef91cb`
- Focused documentation squash: `2b55443e5fafd6a1f76181b6e42b4748e0b53f8d`
- Final deployment: `F2ukbJu7Q1TrSmc7pruom1YAQKyo`
- Evidence: `/Users/sw12/Projects/saledock-local-evidence/expense-restore-audit-live-verification`
- Manifest SHA-256: `94ed2ece32d3bf795a45aee61586b8909ade59dd635a545606c8da65dcc742c4`

Result immediately after the Expense Restore closure:

- `LIVE-EXPENSE-RESTORE-AUDIT-001`: closed
- Active P2: 8
- Active P3: 5
- Classification: **FINISHING ACCEPTED WITH LIMITED COVERAGE**
- Cashier limitation: unchanged
- Audit-ready: no
- MVP-live: no
- Historical next task at that point: `LIVE-CUSTOMER-AUDIT-001`

Expense Restore client settlement and Expense Reset date-field presentation
remain open P3 observations. This closure does not rewrite the dated July 26
evidence below.

## 2026-07-29 Customer Lifecycle Audit Closure

The original July 26 finding `LIVE-CUSTOMER-AUDIT-001` is closed.

The retained production evidence showed a correct `customer.credit_payment`
audit but no lifecycle audits for observed customer create, update, and archive
mutations. Local source evidence then established that the lifecycle actions
mutated customer rows without `logAudit` calls, exact transition confirmation,
or identical-update suppression.

Source delivery:

- Source PR: #320
- Reviewed source head: `16f1fa9037ad998e4f8005eab17f4f44dcd9b8b8`
- Source squash: `31e20a58d36657d9bca00ed13aa09c5b07711059`
- Merge timestamp: `2026-07-28T23:17:41Z`
- Source deployment: `Dn4teeYnjpW2eKEYwFfuvSvgxzde`
- Main CI: run `30407520538`, successful
- Correction: create confirms the inserted ID; genuine updates and state
  transitions confirm one organization-owned row; identical updates create no
  write or audit; each genuine transition awaits one truthful lifecycle audit.
- Privacy: audit details and metadata contain safe field names and status
  transitions without raw customer profile values.
- Scope: no migration, schema, ledger, settlement, Dashboard, Reports, Cash
  Drawer, permission, or RLS change.
- Archive truth: 29 previously verified temporary `/tmp` archives expired, 43
  historical archives remain unavailable, and none were restored or recreated.

First authenticated production attempt:

- Classification:
  `INCOMPLETE PRODUCTION ACCEPTANCE - BROWSER INPUT PRECONDITION NOT ESTABLISHED`
- Marker: `LIVE-CUSTOMER-AUDIT-20260729-0421-911A`
- Customer: `9fbf4b37-47ce-4dc0-be2f-9b7e653ea508`
- Intended Credit Limit PKR 500 was not visibly confirmed before submission;
  PKR 0 persisted.
- One `customers.created` and one `customers.archived` audit committed.
- Balance and financial rows remained zero; the customer remains archived.
- No retry or compensating update occurred, and no Credit Limit persistence
  defect was inferred.
- Evidence:
  `/Users/sw12/Projects/saledock-local-evidence/customer-lifecycle-audit-live-verification`
- Manifest SHA-256:
  `3f82d47d3926524c910eab1f601f77d82cb193b7fa71c8efbff651695483a1c0`

Successful authenticated rerun:

- Identity: Fardan Aatir, Owner, Star Shop, Main Branch, PKR, Asia/Karachi
- Marker: `LIVE-CUSTOMER-AUDIT-RERUN-20260729-0447-17BE`
- Customer: `b970bc25-0299-455e-b6b7-c0ffb6953bb2`
- A visibly confirmed PKR 500 persisted on create; a visibly confirmed PKR 600
  persisted on the genuine update.
- Exact lifecycle totals: one `customers.created`, one `customers.updated`, two
  `customers.archived`, and one `customers.restored`.
- One identical no-op update created no row change or audit.
- Actor, organization, branch, customer ID, details, and metadata were correct.
- No audit contained raw phone, email, address, initial Notes, or updated Notes.
- Customer balance and marker financial rows remained zero. Customer Dues, Net
  Cash, Cash Drawer, stock/FIFO, supplier dues, and open shifts were unchanged.
- Both production marker customers remain truthfully archived; duplicates were
  zero; independent authenticated verification and reload persistence passed.
- Evidence:
  `/Users/sw12/Projects/saledock-local-evidence/customer-lifecycle-audit-live-verification-rerun`
- Manifest SHA-256:
  `d523c3a17c863e007df3d0c347cc8ec4d708b35e129fdfc990821de14008133e`
- Screenshots: 12

Focused documentation delivery:

- PR: #321
- Branch head: `ade6527a9bca4e3ebdc7f3d10e87fa3238a01813`
- Documentation squash: `157c0181fbe8c4cf79d0904e3a39a5443df57288`
- Final deployment: `DzCZELXPyhHwRBfZaH2MLwTUe58w`

Result at this dated checkpoint:

- `LIVE-CUSTOMER-AUDIT-001`: closed
- Active P0/P1: 0/0
- Active P2: 7
- Active P3: 5
- Customer ledger presentation: open P2
- Customer-settlement client completion: open P2
- Cashier limitation: unchanged
- Classification: **FINISHING ACCEPTED WITH LIMITED COVERAGE**
- Audit-ready: no
- MVP-live: no
- Next task: `LIVE-CUSTOMER-LEDGER-001`

Customer lifecycle auditing is fixed. The first attempt did not prove a Credit
Limit defect; the successful rerun proved persistence under a visibly
confirmed browser value. At that dated point, customer ledger presentation and
customer-settlement client completion remained open. This section does not
rewrite the dated July 26 or earlier mobile-native evidence below.

## 2026-07-29 Customer Ledger Presentation Closure

The original July 26 finding `LIVE-CUSTOMER-LEDGER-001` is closed.

The retained customer debt truth was already correct: one PKR 150 invoice
debit, one PKR 150 Credit Payment, and a final PKR 0 balance. The presentation
defects were the `INV-100361` href using ledger-entry ID
`432d7aef-7214-41d7-ae05-0d04c228248e` and the absence of customer return and
refund history.

Source delivery:

- Source PR: #323
- Reviewed source head: `c94390bfbb6286cdadb3f3a5d733c3ef95dd67e8`
- Source squash: `4b68e379ed5b4e60c9dbbef9e6fe53dd32c90266`
- Source deployment: `GuqL5ytTPBn93zHrXpxEsotPgX33`
- Correction: carry the actual nullable invoice ID through the read model,
  route invoice references by that ID, and add an organization- and
  customer-scoped read-only Returns & refunds presentation.
- Accounting boundary: no customer balance, settlement, Credit Payment,
  write-off, return mutation, Cash Drawer, stock, or FIFO behavior changed.
- Schema boundary: no migration or schema change.

Authenticated read-only production verification:

- Identity: Fardan Aatir, Owner, Star Shop, Main Branch, PKR, Asia/Karachi
- Marker: `LIVE-CUSTOMER-LEDGER-20260729-1615-C409` (evidence metadata only)
- Retained customer: `0dd1406a-ed51-4ff4-9f30-24a32b2d2ac4`
- Invoice: `INV-100361`, ID
  `d78ef3f5-7480-4e40-a330-38ec7791028b`
- Corrected invoice href:
  `/invoices/d78ef3f5-7480-4e40-a330-38ec7791028b`
- Return: `RET-001006`, ID
  `a473366e-6617-468b-981c-668169b2282e`
- Return href:
  `/returns/a473366e-6617-468b-981c-668169b2282e`
- Return truth: completed, PKR 150 subtotal, PKR 150 Card refund, and correct
  invoice navigation.
- Debt ledger: one PKR 150 debit, one PKR 150 Credit Payment, final balance
  PKR 0, and zero synthetic fully-paid-return debt rows.
- Duplicates and production mutations: zero.
- Mobile: 390×844 and 320×568 passed without page-level horizontal overflow,
  hidden desktop duplication, or inaccessible invoice/return links.
- Evidence:
  `/Users/sw12/Projects/saledock-local-evidence/customer-ledger-presentation-live-verification`
- Manifest SHA-256:
  `85e4dbacd4f9fd9f6b753c655d45d0035e7db22c6cee7c9747f7bdb4fd5084ec`

Focused documentation delivery:

- PR: #324
- Branch head: `8d210692893d5010fcfafd12f44422ba451bc5dd`
- Documentation squash: `d15530cca701b597c81778e7b984627d959fe6fc`
- Final deployment: `Ayagpz9EfpCcYbX3fEYPR2jdpsyC`

Result at this dated checkpoint:

- `LIVE-CUSTOMER-LEDGER-001`: closed
- Active P0/P1: 0/0
- Active P2: 6
- Active P3: 5
- Customer debt accounting: unchanged
- Customer-settlement client completion: open P2
- Cashier limitation: unchanged
- Classification: **FINISHING ACCEPTED WITH LIMITED COVERAGE**
- Audit-ready: no
- MVP-live: no
- Next task: `LIVE-REPAIR-OPTIONAL-001`

Customer ledger presentation and reference routing are fixed. The July 26
transaction history was not recreated, and no production mutation was
performed during closure. Customer settlement remains open.

## 2026-08-02 Repair Customer Tenant Integrity P1 Closure

`REPAIR-CUSTOMER-TENANT-INTEGRITY-001` was discovered while investigating
`LIVE-REPAIR-OPTIONAL-001`. The retained local reproducer created an
organization-A repair linked to an organization-B customer because the Repair
action accepted the submitted UUID without verifying customer ownership and
the database foreign key covered customer ID only. Optional-field source work
stopped, P1 temporarily became 1, and finishing became
`FINISHING BLOCKED — ACTIVE P1 TENANT INTEGRITY`.

Source and migration delivery:

- Source PR: #326
- Reviewed source head: `446d08e7c88f981e418391103abe03a2dc4b7eae`
- Source squash: `12de0dd189d0c41895e4da5ca06bd880d17ee98b`
- Source correction: selected customer ID is checked against the authenticated
  organization before repair, history, or audit mutation; only customer ID is
  selected and the error is generic.
- Migration: `20260729133000_enforce_repair_customer_tenant_integrity.sql`
- Migration version: `20260729133000`
- Equivalent migration delivery preflight: passed after a complete Supabase
  shadow replay; per-PR Supabase Preview was disabled and was not represented
  as passed.
- Production preflight: 3 repairs, 3 linked, 0 organization mismatches, and 0
  incompatible object conflicts on PostgreSQL 17.6.1.121.
- Migration delivery: automatic and exactly once between source merge
  `2026-08-02T08:06:23Z` and first retained metadata verification
  `2026-08-02T08:11:18.427156Z`; no duplicate manual apply occurred.
- Production invariant: validated
  `repairs_organization_customer_id_fkey` on
  `(organization_id, customer_id) -> customers(organization_id, id)`, with
  `ON UPDATE RESTRICT`, customer deletion clearing only `customer_id`, and
  null links preserved.
- Post-migration mismatches: 0.

Production verification:

- Rollback-only probe: the attempted incompatible cross-organization update
  failed with SQLSTATE `23503`; the explicit transaction fully rolled back.
- Persistent production fixture/business mutation: zero.
- Authenticated identity: Fardan Aatir, Owner, Star Shop, Main Branch, PKR,
  Asia/Karachi.
- Read-only Repairs, `/repairs?add=1`, tenant-visible customer search, existing
  same-organization link, detail, and status history checks passed.
- No foreign customer data was exposed and no Repair Intake form was submitted.
- A preliminary `/repairs/new` read resolved through the dynamic repair-ID route
  and showed the generic error page; no mutation occurred and it is not an
  application defect finding.
- Live marker: `LIVE-REPAIR-TENANT-20260802-1306-AE5C`, evidence metadata only.
- Evidence:
  `/Users/sw12/Projects/saledock-local-evidence/repair-customer-tenant-integrity-live-verification`
- Manifest SHA-256:
  `934124226da08ebd09c410570188840571c50205d6e379f8ccddac1a854dae0e`

Focused documentation delivery:

- PR: #327
- Head: `98375cb4e79cc364f6baf4da91d2c1b286645af6`
- Documentation squash: `8afbc37751a76edb93d52175146be6dbb619a0a3`
- Final deployment: `GooqVaWAfTVhunUU1eYFyBLguiDx`

Result at this dated checkpoint:

- P0/P1: 0/0
- P2: 6
- P3: 5
- Classification: **FINISHING ACCEPTED WITH LIMITED COVERAGE**
- `LIVE-REPAIR-OPTIONAL-001`: open; root cause established; correction absent
- Repair statuses and permissions: unchanged
- Settlement findings and cashier limitation: unchanged
- Accounting, stock/FIFO, and Cash Drawer: unchanged
- Audit-ready: no
- MVP-live: no
- Next task: resume `LIVE-REPAIR-OPTIONAL-001` from retained evidence on a
  fresh current-main worktree.

This dated closure preserves the chronology: finishing was accepted at 0/0/6/5
before discovery, blocked while the new P1 was active, and returned to accepted
at 0/0/6/5 only after source, migration, production, and focused documentation
delivery completed. Older evidence is not rewritten.

## 2026-08-03 Repair Optional-Field And Create-Audit Closures

The original authenticated July 26 finding `LIVE-REPAIR-OPTIONAL-001` showed
that blank fields presented as optional could fail with `Invalid UUID` before
mutation. The retained local matrix isolated blank customer UUID, optional-text
preprocessing, and optional-date validation. PR #329 delivered the correction:

- investigation evidence:
  `/Users/sw12/Projects/saledock-local-evidence/repair-optional-fields-fix`;
- investigation manifest SHA-256:
  `bb3b253cf534e851ae8e595c3f97357d5c2c88d64af5232c49ce1edb53f3b047`;
- retained schema matrix: 28 cases;
- reviewed head: `1da2887aabcf2736a258d089b8120b386d1011dc`;
- source squash: `62ee3a9ea985fc7b9016bddfb1161b51f80d1efa`;
- merge timestamp: `2026-08-02T10:48:51Z`;
- blank customer UUID, optional text, and Expected Delivery now normalize to the
  established empty representation;
- nonblank Expected Delivery requires an exact real Gregorian `YYYY-MM-DD`;
- no Repair form, tenant migration, permission, status, accounting, stock/FIFO,
  Dashboard, Reports, or Cash Drawer source changed.

The first authenticated acceptance retained marker
`LIVE-REPAIR-OPTIONAL-20260802-1553-6860`, repair `RJ-000004`, ID
`ee8365bc-e341-450e-b1aa-ee18c47ada8e`. All optional fields were accepted,
customer and Expected Delivery persisted null, and tenant, duplicate, and
financial checks passed. Acceptance stopped because the initial history existed
but `repairs.created` did not. A later authorized cancellation produced one
history and one status audit; `RJ-000004` remains cancelled and untouched.

- evidence:
  `/Users/sw12/Projects/saledock-local-evidence/repair-optional-fields-live-verification`;
- manifest SHA-256:
  `a506e5d8ebc99b42689bb140ad10bda6d0c03b0058a2ec825a9f1c791e5c9e65`.

The create-audit blocker was isolated as
`REPAIR-CREATE-AUDIT-DURABILITY-001`. The action awaited neither durable create
audit completion nor a caller-visible returned insert result, while the global
helper's `Promise<void>` contract hid returned errors. PR #330 delivered:

- reviewed head: `14e920925bb5586b1923b6c9d2d8eb59615267c7`;
- source squash: `de94a0e59de20c51e7c77cdbfa2fe496d30019e9`;
- merge timestamp: `2026-08-02T23:59:44Z`;
- main CI: run `30773416186`, successful;
- accepted rerun deployment: `DDtDXWcufFyhYHFStkKDSahE3uUD`;
- checked initial-history completion and a caller-local checked, awaited audit
  insert before a successful save response;
- safe partial-save truth, exact repair ID, and no-resubmit guidance when audit
  completion fails after the repair commits;
- no automatic retry, duplicate, delete, compensating mutation, migration, or
  schema change;
- global audit helper and `updateRepairStatusAction` unchanged.

Source evidence:

- path:
  `/Users/sw12/Projects/saledock-local-evidence/repair-create-audit-durability-fix`;
- manifest SHA-256:
  `c6fd90f8791ef32fa916e1de784ad1bec0358fcbacce45c8138c603f4e8bc08b`.

The successful fresh-marker rerun used Fardan Aatir, Owner, Star Shop, Main
Branch, PKR, and Asia/Karachi:

- evidence:
  `/Users/sw12/Projects/saledock-local-evidence/repair-optional-fields-live-verification-rerun`;
- manifest SHA-256:
  `64e1bf6d9619df9230854c02e44654d115ea58ebfb1e9131e537212e6703d8df`;
- marker: `LIVE-REPAIR-OPTIONAL-RERUN-20260803-0504-91FB`;
- repair: `RJ-000005`, ID
  `0d979a61-9d6a-41bd-91f8-d1e14a83e41b`;
- one repair, one initial `received` history, and one exact durable
  `repairs.created` audit completed before success;
- optional blanks, null customer, null Expected Delivery, privacy, tenant,
  duplicate, and financial non-regression checks passed;
- one authorized cancellation produced one `received` to `cancelled` history;
- the repair remains truthfully cancelled;
- the status audit happened to persist, but no status-audit durability inference
  was made.

Audit privacy retained the existing customer display-name and device-type
boundary and did not add phone, serial/IMEI, problem description, Notes, or
accessories. Pending Repairs returned to baseline. Customer and supplier dues,
Net Cash, Cash Drawer, stock/FIFO, payments, write-offs, returns, shifts, tenant
mismatches, and duplicate counts were unchanged or zero as applicable.

Focused documentation PR #331 used head
`28e4fea5fd70109583987a797deaf250e8b9eab7`, squash
`85031fe8bf32a02f7bcf93b63a2e65752dd354df`, merge timestamp
`2026-08-03T00:25:33Z`, successful PR/main CI runs `30774353255` and
`30774455143`, and final deployment `3g68nELcKAKV1hjz6rwbTFHycTNC`.

Current result:

- decision: `PASS — LIVE-REPAIR-OPTIONAL-001 FIXED`;
- decision: `PASS — REPAIR-CREATE-AUDIT-DURABILITY-001 FIXED`;
- `LIVE-REPAIR-OPTIONAL-001`: closed;
- `REPAIR-CREATE-AUDIT-DURABILITY-001`: closed;
- tenant-integrity P1: remains fixed;
- P0/P1: 0/0;
- P2: 6, with `KNOWN RESIDUAL REPAIR-STATUS AUDIT DURABILITY RISK — P2`
  replacing the closed optional-field item;
- P3: 5;
- classification: **FINISHING ACCEPTED WITH LIMITED COVERAGE**;
- audit-ready: no;
- MVP-live: no;
- next task: review-first repair-status audit durability investigation only.

This closure does not claim a production repair-status audit failure, and the
two status audits that happened to persist do not prove the unchanged path is
durable. Older dated evidence is not rewritten.

## Historical Executive Summary (through 2026-07-14)

This pass created a route and feature inventory, added a repeatable Playwright mobile-native smoke suite, performed code-level inspection of responsive/touch/drag/resize/print/export surfaces, then continued into authenticated local browser QA after Docker and local Supabase were restored.

The continuation found two P1 blockers, four P2 findings, and several P3 polish gaps that prevented calling the mobile/PDF audit passed. All nine original MN findings retain a recorded disposition: eight are fixed on main or in the audit suite, and MN-007 is verified as development-only in the tested environments. Both supplemental Reports findings remain fixed through PRs #295 and #297, both supplemental Returns findings remain fixed through PR #299, and REP-PRINT-001 remains fixed through PR #301. Focused local Expenses verification then reproduced three supplemental P3 findings. PR #303 fixed EXP-MOBILE-001 and EXP-MOBILE-002 by raising nine important controls to 44px at the tested phone widths and replacing misleading irreversible Void copy with accurate archive-and-Restore guidance. EXP-MOBILE-003 remains open for mobile payment-filter instability and truncated summary headings, so Expenses remains incomplete and Cash Drawer has not begun. Sixteen of seventeen tracked findings are dispositioned, while five broader blocked/not-tested areas remain. The audit does not claim full product, mobile, real-device, every-print-surface, production Expenses/Repairs, accounting, reports, balance, payment, stock/FIFO, or authenticated WebKit/Firefox certification.

| Metric | Result |
| --- | --- |
| Page routes discovered | 39 |
| App route/loading/error/route files discovered | 79 |
| Modules inspected | 35 |
| Required viewport sizes encoded in Playwright | 14 |
| Browsers executed | Chromium, WebKit public smoke, Firefox public smoke |
| Public/auth routes browser-smoked | 5 routes across 14 viewports in Chromium, WebKit, and Firefox |
| Authenticated browser routes encoded | 16 routes across 14 viewports |
| Authenticated browser route matrix executed | Chromium full audit file passed after splitting the owner matrix into 12 focused tests |
| PDF/print/export surfaces discovered | 10 |
| Drag/drop/resize/rearrange surfaces discovered | 5 |
| P0 active | 0 |
| P1 active | 0 |
| P2 active | 0 |
| P3 active | 1 |
| Active tracked findings | 1 |
| Active finding IDs | EXP-MOBILE-003 |
| Fixed P1 findings | 2 |
| Fixed findings | 15 |
| Fixed finding IDs | MN-001, MN-002, MN-003, MN-004, MN-005, MN-006, MN-008, MN-009, RPT-PRINT-001, RPT-MOBILE-001, RET-PRINT-001, RET-PRINT-001-LIFECYCLE, REP-PRINT-001, EXP-MOBILE-001, EXP-MOBILE-002 |
| Verified development-only findings | 1 |
| Verified development-only finding IDs | MN-007 |
| Total tracked findings | 17 |
| Total tracked findings dispositioned | 16 |
| Original MN finding set | 9/9 dispositioned |
| Supplemental Reports findings | RPT-PRINT-001 fixed; RPT-MOBILE-001 fixed |
| Supplemental Returns findings | RET-PRINT-001 fixed; RET-PRINT-001-LIFECYCLE fixed |
| Supplemental Repairs finding | REP-PRINT-001 fixed |
| Supplemental Expenses findings | EXP-MOBILE-001 fixed; EXP-MOBILE-002 fixed; EXP-MOBILE-003 open, P3 |
| Blocked or not-tested areas | 5 |

## Historical Environment Tested (through 2026-07-14)

| Item | Result |
| --- | --- |
| Git remote | `https://github.com/starwalker12/saledock-cloud-pos.git` |
| Previous merged audit base | `6ccca9b7f9e1127a848890fe2918ee54501f6507` |
| Current documentation refresh base | `1a71a12ab5e00570fb66830570e80b8175f4fef4` |
| Local app | `http://localhost:3000` |
| Local Supabase | Restored; local reset, seed, QA user setup, and local-only grants completed |
| Production | Read-only only; no production mutation testing performed |
| QA users | Local-only owner, admin, manager, cashier, and technician verified |
| Secrets | No secrets, tokens, connection strings, or customer data recorded |

## Route Inventory

Discovered page routes:

| Area | Routes |
| --- | --- |
| Public and auth | `/`, `/about`, `/contact`, `/privacy`, `/terms`, `/data-deletion`, `/login`, `/auth/confirm`, `/auth/invite`, `/auth/reset-password`, `/onboarding`, `/setup` |
| Core app | `/dashboard`, `/pos`, `/products`, `/customers`, `/customers/[id]`, `/invoices`, `/invoices/[id]`, `/returns`, `/returns/[id]`, `/repairs`, `/repairs/[id]`, `/expenses`, `/daily-closing`, `/reports`, `/users`, `/settings`, `/settings/permissions`, `/audit-log` |
| Supplier and stock | `/purchases/replenishment`, `/suppliers/dues`, `/suppliers/purchases`, `/suppliers/purchases/new`, `/suppliers/purchases/[id]`, `/suppliers/[id]/ledger`, `/suppliers/[id]/statement` |
| Platform/admin | `/platform`, `/platform/privacy-requests` |

## Feature Surface Inventory

| Feature group | Surfaces inspected |
| --- | --- |
| Navigation | App shell, mobile drawer, desktop sidebar, top bar, bottom mobile tabs, global search |
| Auth | Login, invite, reset password, expired invite state, onboarding/setup route inventory |
| Dashboard | Widget grid, edit mode, add/remove/restore, drag handles, resize controls, layout persistence code path |
| POS | Product browsing, search, cart, bill tabs, held bills, service fields, checkout controls, customer selection, payment controls |
| Products | Product list, images, add/edit modal, category and supplier tabs, search, stock/FIFO action |
| Suppliers | Purchases, dues, ledger, statement, replenishment export |
| Invoices/returns/repairs | Detail screens, print/share buttons, WhatsApp share, receipt formats |
| Cash drawer | Daily closing page and print button |
| Reports | Reports page, report print button |
| Backup/privacy | Backup export/import UI, privacy export |
| Settings/users | Settings panels, staff permissions, user management |

## Device and Viewport Matrix

The new Playwright suite encodes these viewports:

| Type | Viewports |
| --- | --- |
| Mobile | 320x568, 360x800, 375x667, 390x844, 412x915, 430x932 |
| Tablet | 768x1024 portrait, 1024x768 landscape, 820x1180 portrait |
| Desktop | 1024x768, 1280x720, 1366x768, 1440x900, 1920x1080 |

Executed in Chromium:

- Public/auth responsive smoke: PASS across all encoded viewports.
- Authenticated app responsive smoke: PASS in Chromium. The full audit file passed after the owner route/viewport matrix was split into 12 focused tests.
- WebKit and Firefox: PASS for public/auth route viewport smoke using a temporary uncommitted Playwright config after installing local browser binaries.
- Browser zoom 125 percent: NOT TESTED in this pass.
- Real mobile device hardware: NOT TESTED in this pass.

## Historical Status Table (through 2026-07-14)

| Area | Status | Evidence | Follow-up |
| --- | --- | --- | --- |
| Authentication/onboarding | PASS with caveat | Local owner/admin/manager/cashier/technician roles verified; auth-role smoke passed 9/9. | Verify again on Vercel preview before MVP-live. |
| Navigation/sidebar | PASS | Mobile drawer renders one accessible dialog; hamburger opens/closes; close button, backdrop, and Escape work; Customize tabs move up/down; body scroll locks/restores; tablet-to-desktop closes drawer. | Continue monitoring on Vercel preview. |
| Dashboard mobile layout | PASS with caveat | The current authenticated Chromium matrix completed in the required 16/16 full-audit run. Focused Dashboard mobile navigation/edit/POS touch-surface coverage passed. A separate supplemental timing run had an intermittent tablet operations `/daily-closing` timeout unrelated to Dashboard. | Real-device Dashboard layout and touch-resize confirmation remain pending. |
| Dashboard rearrange | FIXED ON MAIN — VERIFIED | Touch-friendly Move Earlier / Move Later controls added in PR #289. Button reorder preserves exact widget width/height, 4/8/12-column layouts remain valid, no overlap or duplicate IDs, persistence after reload verified. Existing drag behavior retained. | Continue monitoring on Vercel preview. |
| Dashboard resize | PASS with caveat | Size controls are visible in focused mobile dashboard smoke; drag resize still needs manual touch confirmation. | Manual touch-resize confirmation remains pending. |
| POS | PASS with caveat | Focused POS mobile controls visible; service-sale and settlement regressions passed; full manual POS matrix not complete. | Real-device and fuller manual checkout layout coverage remain pending. |
| Held bills | PASS | Focused physical-product held bill safety rerun passed 1/1 after clean local reset. | Keep manual real-device confirmation pending. |
| Products/catalog | PARTIAL | The Products route completed in the current authenticated owner matrix. Full product image upload, modal, and mobile keyboard interaction were not rerun. | Continue product image upload/mobile-keyboard workflow separately. MN-005 is the shared `ImageUpload` crop dialog used by branding/profile/onboarding, not the product image field. Product image upload remains a separate partially tested workflow. |
| Product images | PARTIAL | Prior QA history and code inventory inspected; no fresh upload mutation in this continuation. | Re-run image upload mobile matrix. |
| Shared branding/profile crop controls | FIXED ON MAIN — VERIFIED | PR #293 added explicit Move image up/left/right/down and Reset crop controls, 5-point nudge step, 0-100 clamp, reset to X 50 / Y 50 / zoom 1, visible/screen-reader crop status, keyboard activation, 44 px controls, and portal rendering to `document.body` above mobile tabs. Square Profile Picture crop at 390x844 and landscape Invoice Logo crop at 375x667 passed focused browser evidence with zero page errors, visible framework errors, native dialogs, and storage writes. | The no-write regression did not click Use crop. Persisted upload completion remains covered by unchanged source/callback contracts, not by this MN-005 closure. |
| Invoices | PASS with caveat | Local invoice screen and print-media artifacts captured; cookie banner no longer covers invoice print/PDF output. | Continue cash drawer print QA. |
| PDFs/printing | PASS with caveat | Invoice A4/80mm output remains verified. Reports full-document A4 pagination remains verified locally through PR #295, and PR #297 retained five-page A4 output with complete mobile and print labels. PR #299 verified Returns A4 plus standard and longer centered, single-page 80mm receipts using content-derived page heights. PR #301 verified Repairs A4 plus standard and longer centered, single-page 80mm receipts using content-derived page heights; Repairs A4 honestly paginates to two complete pages. | Daily Closing/Cash Drawer and Supplier Statement physical artifacts remain incomplete or blocked. Do not treat this row as verification of every print surface. |
| Print/share touch targets | FIXED ON MAIN — VERIFIED | PR #292 normalized reports, repairs, daily closing, and supplier statement print/share controls to an explicit `min-h-[44px]`. Returns already used `min-h-[44px]` and remained unchanged. Browser-rendered checks passed for Reports, Daily Closing, and Supplier Statement at 320x568, 390x844, and 430x932. Repair detail, return detail, and conditional daily shift-report controls were verified by source-contract test because deterministic local fixtures were unavailable during that focused finding. | Repairs visual print evidence is now recorded through PR #301, and Returns visual print evidence is recorded through PR #299. |
| Invoice PDF wording | FIXED ON MAIN — VERIFIED | PR #290 changed the Share Invoice modal wording from Download PDF to Print / Save as PDF, retained existing A4 browser print behavior, passed desktop 1440x900 and mobile 390x844 localhost review, passed focused invoice wording E2E, and passed cookie-print regression. | Do not claim direct PDF download was added; behavior remains browser print/save-to-PDF. |
| Returns | FIXED ON MAIN — A4 AND 80MM PRINT VERIFIED LOCALLY | PR #299, reviewed head `76cfd4f7c1fd834fe2a1fbfb72f0732e5406559f`, merged as `09e1df96ccb571872ba0c3f46bd457723bfdae53`. Local authenticated testing used a disposable service-only fixture with no production access. A4 produced one complete page. Standard and longer thermal receipts produced centered, unclipped, single-page artifacts at approximately 80mm by 132.3mm and 80mm by 164.4mm with 89.9% horizontal span. Wrapping, totals, notes, and footer were complete. Cancellation and client-navigation unmount tests passed; generated rows remaining and forbidden writes were 0. | Monitor Returns printing during future browser and layout changes. Financial, refund, stock-restoration, and FIFO correctness remain outside this presentation verification. |
| Customers | PARTIAL | Customer settlement flow passed locally; full customers list/detail mobile matrix not rerun. | Re-run customer mobile QA. |
| Settlement | PASS | Customer settlement optional-field E2E passed 1/1 locally. | Manual mobile keyboard check still useful. |
| Repairs | FIXED ON MAIN — A4 AND 80MM PRINT VERIFIED LOCALLY | PR #301, reviewed head `71f3dd393a97717f28d033d217c55092d64b2ae0`, merged as `a9ddb9bc1c905089604e559856c1aff9d392e62e`. Local authenticated testing used a disposable fixture limited to `repairs` and `repair_status_history`, with 0 RPCs and no production access. The baseline A4 artifact was one page with its footer missing; the fixed output produced two complete A4 pages with the footer on page two, no clipping, and no blank pages. Standard and longer thermal receipts produced centered, unclipped, single-page artifacts at approximately 80mm by 179.2mm and 80mm by 235.0mm with 89.9% horizontal span and bounds of approximately 11.25 to 215.34 points. Wrapping, terms, and footer were complete. Cancellation and client-navigation unmount tests passed; generated rows remaining and forbidden writes were 0. | Monitor Repairs printing during future browser and layout changes. Repair accounting, estimates, advances, balances, payments, stock, and FIFO correctness remain outside this presentation verification. |
| Expenses | PARTIAL — TOUCH TARGETS AND VOID GUIDANCE FIXED / FILTER AND LABEL P3 OPEN | PR #303 reviewed head `f8478a7daf1df16acdf5726e5b75be3ee469c196`, merged as `1a71a12ab5e00570fb66830570e80b8175f4fef4`. Local authenticated QA measured all nine targeted controls at 44px at 320x568, 390x844, and 430x932; ordinary center hit-testing passed; labels were not clipped; and no horizontal overflow or bottom-navigation obstruction appeared. Void guidance now accurately describes archive, normal-list/report visibility, and Restore through Show voided. Owner/cashier behavior passed locally with exactly four create/update/void/restore submissions, zero generated expense rows, zero matching audit rows, zero unexpected business writes, and equal unrelated signatures. The shared sign-out confirmation regression passed. Exact-head and main-commit CI passed; exact-merge Vercel deployment succeeded. No authenticated production Expenses workflow ran, and HTTP 200 proves availability only. | Fix `EXP-MOBILE-003` separately on `fix/expenses-mobile-filter-and-summary-labels`, then rerun the complete Expenses workflow and synchronize the audit before removing Expenses from blocked coverage or beginning Cash Drawer. |
| Cash Drawer | BLOCKED | Print surface inspected; cash drawer close/print workflow not rerun after invoice blocker was resolved. | Re-run cash drawer close/print QA. |
| Reports | FIXED ON MAIN — MOBILE LABELS AND PRINT PAGINATION VERIFIED LOCALLY | RPT-PRINT-001 was fixed through PR #295, merge commit `30400475202eeb2bbeb126abe3e5a281efebb95d`: the optional Reports-only AppShell print contract changed one truncated A4 page to five pages with later/final sections present, retained screen scrolling, and zero unexpected writes. RPT-MOBILE-001 was fixed through PR #297, merge commit `0e85a47561b073236c5297d629927c8684fcc889`: typed `wrapLabel?: boolean` defaults false, unrelated StatCard consumers retain truncation, and exactly five shared Reports StatCards opt into wrapping. Net Sales (Revenue), Gross Profit Margin, and Service Revenue / Profit remain unchanged and passed at 320x568, 390x844, 430x932, desktop 1440x900, and print media 390x844 with no tooltip/value overlap, clipping, horizontal overflow, or unexpected writes. The local PDF remained five A4 pages. Evidence is authenticated local QA only; GitHub CI did not independently rerun browser/screenshots/PDF, financial formulas were not tested, and no authenticated production Reports test occurred. | Continue the five blocked/not-tested coverage areas separately and monitor Reports during future design changes. |
| Users/permissions | PASS with caveat | Auth-role smoke passed for all five local roles; focused cashier mobile user-page restriction passed. | Full mobile direct URL matrix still pending. |
| Settings | PARTIAL | `/settings` and `/settings/permissions` completed in the authenticated owner route matrix. Full interactive settings-panel, form, modal, mobile keyboard, and role-specific mutation coverage remains incomplete. | Run focused settings interaction coverage in the authenticated remainder audit. |
| Responsive tables | PARTIAL | Route matrix and code inventory cover tables, but not every table was manually interacted with. | Re-run with local data. |
| Forms/mobile keyboard | BLOCKED | Code-level checks only. | Re-run on mobile emulation. |
| Modals/drawers | PASS with blocked app modals | Public drawer route smoke passed; authenticated modals blocked. | Re-run product/POS/settings modals. |
| Loading/success/errors | BLOCKED | Code-level inspection only for most app pages. | Re-run slow-network browser QA. |
| Dark mode | BLOCKED | Not fully browser-verified. | Re-run light/dark matrix. |
| Desktop sidebar reorder | FIXED ON MAIN — VERIFIED | PR #291 added visible Move Earlier and Move Later controls inside the existing desktop Rearrange mode. Controls work by mouse click and keyboard Enter/Space. First/last visible items disable the boundary controls. Existing pointer drag remains available. Reorder moves one visible item by one visible position, persists after reload, preserves archived items, stored collapsed state, and cookie-consent values. English, Urdu, and Roman Urdu labels verified. Dark mode and reduced motion verified. No href duplicates or missing links introduced. | Broader blocked/not-tested areas remain listed below. |
| Cross-browser behavior | PARTIAL | Public/auth viewport matrix passed in WebKit and Firefox; authenticated cross-browser not run. | Authenticated WebKit/Firefox coverage remains pending. |
| CSP / public pages | VERIFIED — DEVELOPMENT-ONLY | PR #294 merged; CSP nonce hydration warning reproduced 10/10 in `next dev` only; local production 0/10; production 0/10; no CSP violation reports observed in production; protected branch preview redirected to Vercel SSO. | No source change; treat dev-only warning as a documented development-only observation in the tested environments. |

## PDF, Print, Download, and Export Surfaces

| Surface | Implementation | Audit status |
| --- | --- | --- |
| Invoice detail | A4/80mm `window.print`, WhatsApp share, image capture/download, Share modal action labeled Print / Save as PDF | PASS: local invoice A4/80mm PDF generated; cookie banner hidden in print media; wording matches browser print/save-to-PDF behavior; totals visible |
| Returns detail | A4/80mm `window.print`, WhatsApp share | A4 and 80mm output verified locally through PR #299. A4 produced one complete page. Standard and longer 80mm receipts produced centered, unclipped, single-page artifacts with content-derived heights, complete summaries, notes, wrapping, and footer. No authenticated production print occurred. |
| Repair detail | A4/80mm `window.print`, WhatsApp share | A4 and 80mm output verified locally through PR #301. A4 produced two complete pages with the footer on the final page. Standard and longer 80mm receipts produced centered, unclipped, single-page artifacts with content-derived heights, complete structural rows, wrapping, terms, and footer. No authenticated production print occurred. |
| Daily closing | A4/80mm/shift thermal `window.print` | Code inspected; visual output blocked |
| Reports | `window.print` with Reports-only full-document AppShell print opt-in | Desktop A4 full-document pagination and mobile/print StatCard label readability are fixed and verified locally through PRs #295 and #297. Five A4 pages were generated after both fixes with later and final sections present. |
| Supplier statement | A4/80mm `window.print`, WhatsApp share | Code inspected; visual output blocked |
| Replenishment | CSV/XLSX export | Code inspected; browser download blocked |
| Purchase order planner | CSV/XLSX export | Code inspected; browser download blocked |
| Privacy center | JSON export | Code inspected; browser download blocked |
| Backup settings | Backup ZIP export, import upload | Code inspected; no destructive import run |

## Drag, Drop, Resize, and Rearrange Surfaces

| Surface | Desktop behavior | Mobile/touch readiness |
| --- | --- | --- |
| Dashboard widgets | `react-grid-layout` drag and resize handles plus Move Earlier / Move Later controls | FIXED: touch-friendly reorder controls verified; size controls still need broader mobile browser confirmation |
| Desktop sidebar nav order | Pointer drag reorder plus Move Earlier / Move Later buttons in Rearrange mode | FIXED: keyboard and button reorder controls added; existing drag retained |
| Mobile drawer nav order | Up/down buttons in customize mode | Better mobile alternative present |
| Shared branding/profile image crop | Pointer drag reposition plus zoom plus explicit direction and reset controls in the shared `ImageUpload` crop dialog | FIXED: PR #293 added non-drag controls, keyboard activation, reset, 44 px controls, and portal stacking above the mobile tab bar while retaining pointer drag and zoom |
| Shop map location | Draggable marker and location adjustment | Needs mobile verification |
| Backup import upload | Drag/drop copy plus file picker | Needs browser verification; do not run destructive import |

## Historical Findings (through 2026-07-14)

### MN-001 - Dashboard reorder is not mobile-native

| Field | Detail |
| --- | --- |
| Severity | P2 |
| Status | FIXED ON MAIN — VERIFIED |
| Module | Dashboard |
| Device/browser | Mobile/touch, Chromium code audit and E2E |
| Viewport | 390x844 target |
| User role | Owner/Admin |
| Steps | Log in, open Dashboard, tap Edit layout, attempt to rearrange widgets without precise dragging. |
| Expected | User can reorder widgets with clear touch-friendly controls such as Move Up/Move Down or a rearrange mode that does not fight page scroll. |
| Actual (original) | Widget order used drag handles; no non-drag reorder alternative was found for dashboard widgets. |
| Evidence (original) | `src/app/dashboard/widgets/widget-grid.tsx` used `react-grid-layout`, drag handles, and resize handles. |
| Console/network error | None observed. |
| Environment | Local/code audit and local E2E. |
| Risk to shop user (original) | Mobile owner may be unable to customize dashboard layout reliably. |
| Recommended fix scope | Add explicit Move Up/Move Down controls in dashboard edit mode, keep desktop drag behavior. |
| Suggested branch | `fix/dashboard-mobile-reorder-controls` |
| Suggested regression test | Mobile dashboard edit test reorders one widget with buttons, reloads, and verifies persistence. |
| Resolution | Fixed on main in merge commit `21857aa639a88c3d615e3d6abdc6e10f07060e6d` from PR #289. Touch-friendly Move Earlier and Move Later controls were added to the widget edit menu. Existing drag behavior is retained. Exact customized widget width and height are preserved during button reorder. Four-, eight-, and twelve-column layouts remain valid, with no overlap or duplicate widget IDs introduced. Local and preference-sync persistence are verified. |
| Regression evidence | `tests/dashboard-widget-reorder.test.mjs` passed 8/8 locally. `tests/e2e/dashboard-mobile-reorder-controls.spec.ts` passed 3/3 in Chromium against local Supabase: move earlier, move later, and reload persistence at mobile width. The mobile-native audit test that exercises Dashboard touch surfaces passed. |
| Remaining limitations | Only the dashboard reorder surface was regenerated. Full authenticated viewport matrix, real-device hardware, WebKit/Firefox authenticated runs, 125% zoom, and full dark-mode matrix were not re-run. |

### MN-002 - Invoice "Download PDF" action is actually browser print

| Field | Detail |
| --- | --- |
| Severity | P2 |
| Status | FIXED ON MAIN — VERIFIED |
| Module | Invoices, PDFs/printing |
| Device/browser | Mobile and desktop browsers |
| Viewport | Desktop 1440x900 and mobile 390x844 manual localhost review |
| User role | Owner/Admin/Cashier where invoice access is allowed |
| Steps | Open invoice detail, open share/export actions, select Download PDF. |
| Expected | Either a real downloadable PDF is generated with clear loading/success/error feedback, or the label says Print/Save as PDF. |
| Actual (original) | The action called `window.print()`, so the wording could mislead users, especially on mobile. |
| Evidence (original) | `src/app/invoices/[id]/print-button.tsx` label/action inspection. |
| Console/network error | None observed. |
| Environment | Local/code audit, localhost manual review, and focused Playwright regression. |
| Risk to shop user (original) | Owner may think PDF export is broken when the browser print dialog opens instead of downloading a file. |
| Recommended fix scope | Rename to "Print / Save as PDF" or add real PDF generation/download. |
| Suggested branch | `fix/invoice-pdf-download-ux` |
| Suggested regression test | Invoice action test confirms the button label matches the behavior and print/export feedback is visible. |
| Resolution | Fixed on main in merge commit `17551da8db6723d4b7d235c9b55b9d81ef92f190` from PR #290. The Share Invoice modal action changed from `Download PDF` to `Print / Save as PDF`, the misleading download icon was replaced by the printer icon, and the accessible name is `Print or save invoice as PDF`. This did not add direct PDF generation; the behavior remains browser print/save-to-PDF. |
| Regression evidence | Desktop 1440x900 localhost manual review passed. Mobile 390x844 localhost manual review passed. `tests/e2e/invoice-print-save-pdf-wording.spec.ts` passed in Chromium and confirmed `window.print` is called, A4 print mode is selected, the modal closes after starting print, old `Download PDF` wording is absent, and the main `Print A4 / Save PDF`, Print 80mm, WhatsApp, and Download Image actions remain unchanged. `tests/e2e/cookie-banner-print-output.spec.ts` passed and confirmed the cookie banner remains absent from print output. |
| Business safety | No invoice totals, payments, balances, stock/FIFO, cash drawer, reports, invoice numbering, or business logic changed. |

### MN-003 - Print/share touch targets are below the mobile target guideline

| Field | Detail |
| --- | --- |
| Severity | P3 |
| Status | FIXED ON MAIN — VERIFIED |
| Module | Reports, returns, repairs, daily closing, supplier statements |
| Device/browser | Mobile touch |
| Viewport | 320x568, 390x844, and 430x932 focused verification |
| User role | Owner/Admin/Cashier where allowed |
| Steps | Open print/export action groups on detail/report pages. |
| Expected | Important print/share buttons should be approximately 44x44 px or larger. |
| Actual (original) | Several print/share buttons were styled around `h-10` or `h-9`, which rendered below the 44 px mobile touch-target guideline. |
| Evidence (original) | `src/app/reports/print-button.tsx`, `src/app/repairs/[id]/print-button.tsx`, `src/app/daily-closing/print-button.tsx`, and `src/app/suppliers/[id]/statement/print-button.tsx`; returns controls were already compliant. |
| Console/network error | None observed. |
| Environment | Local/code audit, localhost browser regression, source-contract regression. |
| Risk to shop user (original) | Slightly harder tapping on small phones. |
| Recommended fix scope | Normalize print/share controls to mobile-sized app buttons. |
| Suggested branch | `fix/print-action-touch-targets` |
| Suggested regression test | Visual/touch target smoke checks print buttons at 320 px width. |
| Resolution | Fixed on main in merge commit `b240ae533351917f846fe240daf602f39ca4abe1` from PR #292. Reports Print Report; repairs Print A4, Print 80mm, and Share WhatsApp; daily closing Print A4, Print 80mm, and Print shift report; and supplier statement Print A4 / Save PDF, Print 80mm, and Share WhatsApp now carry an explicit `min-h-[44px]`. Returns Print A4, Print 80mm, and Share WhatsApp already used `min-h-[44px]`, remained unchanged, and remain covered by the source-contract test. |
| Behavior retained | Print labels, icons, A4/thermal/shift-thermal modes, `window.print()`, print cleanup behavior, WhatsApp URLs, `_blank` and safe `rel` behavior, and existing print-hidden behavior were unchanged. No report, repair, return, daily-closing, supplier, financial, or business calculation changed. |
| Browser-rendered evidence | `tests/e2e/print-action-touch-targets.spec.ts` passed 2/2 in Chromium. Reports, Daily Closing, and Supplier Statement controls rendered at least 44 px tall at 320x568, 390x844, and 430x932 without horizontal overflow, clipped labels, framework overlays, or print-mode regressions. |
| Source-contract evidence | `tests/print-action-touch-targets.test.mjs` passed 13/13 and covers Reports: Print Report; Repairs: Print A4, Print 80mm, Share WhatsApp; Returns: Print A4, Print 80mm, Share WhatsApp; Daily closing: Print A4, Print 80mm, Print shift report; Supplier statement: Print A4 / Save PDF, Print 80mm, Share WhatsApp. |
| Limitations | No local repair detail fixture was available, no local return detail fixture was available, and no open local shift existed for a visible Print shift report control. Those controls were verified through the precise source-contract test rather than rendered detail-page browser checks. |

### MN-004 - Desktop sidebar reorder lacks a clear non-drag alternative

| Field | Detail |
| --- | --- |
| Severity | P2 |
| Status | FIXED ON MAIN — VERIFIED |
| Module | Sidebar/navigation |
| Device/browser | Desktop/tablet pointer and keyboard |
| Viewport | 1024x768 and larger |
| User role | Authenticated app user |
| Steps | Open app shell, enter desktop Rearrange mode, try to reorder sidebar navigation without pointer drag. |
| Expected | Drag reorder should have a keyboard/button alternative, matching the mobile drawer's up/down approach. |
| Actual (original) | Sidebar reorder used pointer events and drag state; no obvious up/down buttons were found in desktop sidebar. |
| Evidence (original) | `src/components/layout/sidebar-nav.tsx` pointer drag inspection; mobile drawer has button alternative. |
| Console/network error | None observed. |
| Environment | Local/code audit and focused local E2E. |
| Risk to shop user (original) | Accessibility and precision-pointer issue for users who cannot drag reliably. |
| Recommended fix scope | Add optional up/down controls or reuse mobile drawer customization controls. |
| Suggested branch | `fix/sidebar-rearrange-accessible-controls` |
| Suggested regression test | Keyboard-accessible sidebar reorder test. |
| Resolution | Fixed on main in merge commit `4cd1c0745334ed12fb4fc4eefff0cb26af7e9a40` from PR #291. The desktop sidebar Rearrange mode now shows visible Move Earlier and Move Later controls for every visible nav item. The first visible item has Move Earlier disabled; the last visible item has Move Later disabled. The existing pointer drag handle remains visible and wired. Reorder still uses the existing sidebar preference object and `saveSidebarPreferences` path. Archived items stay archived and excluded from visible order. Dashboard and POS archive protection remains unchanged. Stored collapsed state is not overwritten when Rearrange mode temporarily expands the sidebar. Cookie-consent values in the shared sidebar preference object are preserved. English, Urdu, and Roman Urdu sidebar labels were added for the new controls. Dark mode and reduced-motion behavior verified. No duplicate or missing navigation hrefs introduced. |
| Regression evidence | `tests/e2e/sidebar-accessible-reorder-controls.spec.ts` verified Move Earlier, Move Later, disabled boundaries, persistence after reload, archived-item preservation, consent preservation, and localized labels in Chromium against local Supabase. The full-file run was 2/3; the mouse/keyboard reorder test passed on an isolated rerun. `tests/e2e/auth-role-smoke.spec.ts` passed 9/9 across all five local roles. `tests/e2e/mobile-drawer-single-dialog.spec.ts` passed 5/5 on rerun. `tests/e2e/mobile-native-audit.spec.ts` passed 4/4 in this run. |
| Business safety | No auth, permission, route visibility, tenant scope, business-data, database, financial, or stock logic changed. |
| Remaining limitations | Real-device hardware, WebKit/Firefox authenticated runs, 125% zoom, and full dark-mode matrix were not re-run. |

### MN-005 - Shared branding/profile image crop is drag-first

| Field | Detail |
| --- | --- |
| Severity | P3 |
| Status | FIXED ON MAIN — VERIFIED |
| Module | Shared image upload, branding, profile picture, and onboarding |
| Device/browser | Mobile touch and keyboard users |
| Viewport | 375x667 and 390x844 targets |
| User role | Owner/Admin/Manager |
| Steps | Upload an image through a current shared `ImageUpload` surface, open the crop dialog, and try to position the image without dragging. |
| Expected | The user can reposition the crop by touch drag and by clear button/keyboard controls, and can restore a known default position and zoom. |
| Actual (original) | The crop dialog supported pointer drag and a zoom range, but lacked explicit directional nudge and reset controls. |
| Evidence (original) | `src/components/shared/image-upload.tsx` |
| Console/network error | None observed in final focused verification. |
| Environment | Local/code audit, localhost focused browser E2E, and source-contract regression. |
| Risk to shop user (original) | Users who cannot drag precisely may struggle to position shop logos, invoice logos, or profile images on small screens. |
| Recommended fix scope | Add non-drag directional nudge controls and a reset action inside the shared crop dialog without changing upload, storage, URL, bucket, image-processing, or form-save behavior. |
| Suggested branch | `fix/shared-image-crop-accessible-controls` |
| Suggested regression test | `tests/e2e/shared-image-crop-accessible-controls.spec.ts` |
| Call sites verified | `ImageUpload` is used in `src/app/settings/settings-form.tsx` for app/shop logo, invoice logo, and profile picture; and in `src/app/onboarding/onboarding-wizard.tsx` for profile picture and shop logo. `src/app/products/product-image-field.tsx` does **not** use `ImageUpload` and is not the affected surface. |
| Resolution | Fixed on main in merge commit `12cddabc28bf49d58af5e30fbb8d4f7f04a42af1` from PR #293, reviewed head `5395bef310abc950e5275b27e6bdc465371840da`. The shared crop dialog now has Move image up, Move image left, Reset crop, Move image right, and Move image down controls. The nudge step is 5, clamping remains 0 through 100, and reset restores X 50 / Y 50 / zoom 1. Crop status is visible and screen-reader-accessible. Controls are keyboard operable and at least 44 px. The overlay renders through `createPortal(..., document.body)` above the mobile tab bar. |
| Direction contract | Move image right decreases X, Move image left increases X, Move image down decreases Y, and Move image up increases Y. This intentionally matches the retained pointer-drag behavior, where CSS `object-position` moves the alignment point inversely to the visible image. |
| Retained behavior | Pointer drag, zoom range 1-3, zoom step 0.05, selected file preservation, Cancel, Escape, backdrop close, and the Use crop production path remain available. |
| Square crop evidence | Settings Profile Picture crop at 390x844 passed. Enter and Space keyboard operation worked, reset returned to 50 / 50 / 1, the square mask remained active, the focus ring was visible, and all five controls were at least 44 px with no clipping or horizontal overflow. |
| Landscape crop evidence | Settings Invoice Logo crop at 375x667 passed. Drag and button directions agreed, the landscape mask remained active, and all five controls were at least 44 px with no clipping or horizontal overflow. |
| Portal evidence | Browser verification confirmed the overlay is a direct child of `document.body`, overlay z-index 80 is above mobile-tab z-index 40, the bottom-tab hit area resolves inside the crop overlay while open, and normal tab interaction returns after close. |
| Safety evidence | No framework error portal was removed or hidden. Page errors: 0. Visible framework errors: 0. Native browser dialogs: 0. Storage monitoring began before Settings navigation and file selection. Supabase Storage object writes: 0. No saved-settings success state and no uploaded-success state appeared. |
| Use crop limitation | The automated no-write crop regression did not click Use crop. It intentionally verified positioning, accessibility, portal behavior, reset, close paths, and absence of unintended storage writes. Existing upload, canvas, storage, callback, bucket, folder, and save behavior was unchanged by source review and regression contracts. Actual persisted upload completion was not required to close MN-005 because MN-005 concerned the absence of non-drag positioning controls. Product image upload remains a separate partially tested workflow. |

### MN-006 - Full authenticated viewport matrix is too heavy as one dev-server test

| Field | Detail |
| --- | --- |
| Severity | P2 |
| Status | FIXED IN AUDIT SUITE — VERIFIED |
| Module | Whole authenticated app |
| Device/browser | Local Chromium |
| Viewport | 14 required viewport entries preserved |
| User role | Owner/Cashier intended; owner matrix split and verified |
| Steps | Start local app and local Supabase, run authenticated Playwright route/viewport matrix. |
| Expected | The route matrix completes across all required authenticated routes and viewports without one slow route blocking later coverage. |
| Actual (original) | Local Supabase was restored and login worked, but the full owner route matrix timed out after several minutes on the local dev server. Focused owner/cashier mobile smoke passed. |
| Evidence (original) | `PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/mobile-native-audit.spec.ts --project=chromium` timed out in the owner app-shell matrix; focused `-g "mobile navigation"` run passed 2/2. |
| Console/network error | Original test timeout while navigating repeated route/viewport matrix. |
| Environment | Local only. |
| Risk to shop user (original) | No direct production risk by itself, but the audit suite needed splitting before it could be a reliable CI/manual tool. |
| Recommended fix scope | Split authenticated viewport matrix into smaller focused tests by area or viewport group. |
| Suggested branch | `test/split-mobile-native-authenticated-matrix` |
| Suggested regression test | Smaller mobile-native audit tests that complete independently for Dashboard, POS, Products, Invoices, and Settings. |
| Resolution | The single 224-navigation owner test was replaced with 12 independently reported owner matrix tests: three viewport families multiplied by four route groups. The viewport families are mobile (6), tablet (3), and desktop (5). The route groups are core sales (5), operations (4), reports and administration (4), and supply (3). A dedicated `matrix partition preserves all required owner route coverage` test proves every existing `REQUIRED_VIEWPORTS` entry appears exactly once, every existing `APP_ROUTES` path appears exactly once, there are no duplicate viewport names or route paths, and the total remains 14 x 16 = 224 combinations. |
| Regression evidence | Two consecutive focused runs passed 13/13 each, including the partition test and all 12 owner matrix tests. Focused run 1 longest owner slice was 34s (`mobile viewports / reports and administration routes`). Focused run 2 longest owner slice was 44s (`desktop viewports / reports and administration routes`). The complete `tests/e2e/mobile-native-audit.spec.ts` file passed 16/16 with no skips; longest owner slice was 54s (`mobile viewports / core sales routes`). `tests/e2e/auth-role-smoke.spec.ts` passed 9/9. |
| Business safety | No application source, auth, permission, route visibility, tenant scope, business-data, database, financial, stock, or report logic changed. |
| Remaining limitations | Real-device hardware, WebKit/Firefox authenticated runs, 125% zoom, slow network, and full dark-mode matrix were not re-run. |

### MN-007 - Local dev console shows CSP nonce hydration warning on public pages (development-only)

| Field | Detail |
| --- | --- |
| Severity | P3 |
| Status | VERIFIED — DEVELOPMENT-ONLY / NO PRODUCTION IMPACT OBSERVED |
| Module | Public/auth pages, app root layout |
| Device/browser | Chromium local dev, Chromium local production build, Chromium production |
| Viewport | Multiple viewport matrix entries |
| User role | Logged-out |
| Steps | Run public/auth Playwright viewport smoke against local Next dev server; run local production build; run live production curl; inspect Vercel preview authentication barrier. |
| Expected | Hydration warning should be absent in production and local production builds; dev-only console noise is acceptable if documented. |
| Actual | Warning reproduced 10/10 against local dev server; not reproduced in local production build (0/10); not observed in production Playwright classification (0/10). The protected branch preview (`https://saledock-cloud-pos-git-qa-csp-non-e4e51f-fardan-aatirs-projects.vercel.app`) redirected to `https://vercel.com/sso-api`, so SaleDock application tests could not be exercised. |
| Evidence | Local dev logs during `tests/e2e/mobile-native-audit.spec.ts`; PR #294 (`docs/qa/csp-nonce-hydration-verification.md` and `tests/e2e/csp-nonce-hydration-verification.spec.ts`) browser classification evidence on `https://saledock.site/`; `tests/csp-nonce-flow.test.mjs` source-contract check; no CSP violation reports collected from production. HTTP 200 curl checks against `https://saledock.site/` and `https://saledock-cloud-pos.vercel.app/login` verify public availability only, not browser hydration or CSP behavior. |
| Console/network error | React hydration warning, local dev only. |
| Environment | Local dev, local production build, live production, SSO-protected preview. |
| Risk to shop user | No observed production risk. The warning was observed only under the tested `next dev` environment. It was not reproduced under `next build` plus `next start` or production. No source cause was proven. |
| Recommended fix scope | None. No source change justified. |
| Suggested branch | N/A |
| Suggested regression test | N/A |
| Resolution | Classified as a documented development-only observation in the tested environments. PR #294 provides a reproducible verification record and the test file `tests/csp-nonce-flow.test.mjs` enforces the CSP nonce propagation source contract. |
| Regression evidence | `tests/csp-nonce-flow.test.mjs` source-contract check passed; `tests/e2e/csp-nonce-hydration-verification.spec.ts` public route smoke passed; `tests/e2e/mobile-native-audit.spec.ts` public route smoke passed. PR #294 production E2E on `https://saledock.site/` installed the CSP-report interceptor and observed 0 hydration warnings, 0 nonce mismatches, 0 framework overlays, 0 page errors, 0 native dialogs, 0 CSP report attempts, 0 CSP report requests blocked, and 0 CSP reports stored across 10/10 public routes. Subsequent curl checks confirmed endpoint availability only: `https://saledock.site/` returned HTTP 200, `https://saledock.site/login` returned HTTP 200, and `https://saledock-cloud-pos.vercel.app/login` returned HTTP 200. The HTTP 200 checks do not independently inspect browser hydration, console warnings, nonce equality, or CSP reports. |
| Remaining limitations | Vercel preview application tests were blocked by SSO protection. The protected branch preview URL was `https://saledock-cloud-pos-git-qa-csp-non-e4e51f-fardan-aatirs-projects.vercel.app`; unauthenticated requests redirected to `https://vercel.com/sso-api`. The SSO preflight test passed by confirming the HTTP 302 redirect; 10 SaleDock application tests were skipped. No SaleDock application response was inspected on the protected preview. The public Vercel alias `https://saledock-cloud-pos.vercel.app/login` was used only for an HTTP availability check, not as a preview or as browser classification evidence. External `_next` scripts without an explicit nonce were observed in dev/local production HTML but were not proven safe under an enforced CSP. |

### MN-008 - Mobile navigation drawer close button is blocked by overlay

| Field | Detail |
| --- | --- |
| Severity | P1 |
| Status | FIXED ON MAIN — VERIFIED |
| Module | Mobile navigation/sidebar |
| Device/browser | Chromium, mobile emulation |
| Viewport | 390x844 |
| User role | Owner |
| Steps | Log in locally as owner, open Dashboard, tap the hamburger menu, tap the close button. |
| Expected | One navigation dialog opens, the close button is tappable, and the drawer closes immediately. |
| Actual (original) | The DOM exposed duplicate `Navigation menu` dialogs and duplicate close buttons. A Playwright click on the visible close button was intercepted by the drawer overlay and did not complete. |
| Evidence (original) | `/Users/sw12/Projects/gadget-zone-online-pos/test-results/mobile-native-audit-Mobile-c55ea-s-expose-reachable-controls-chromium/test-failed-1.png` from the failed focused run; trace retained under the same test-results folder. |
| Console/network error | Playwright reported pointer-event interception by the drawer overlay. |
| Environment | Local disposable Supabase, authenticated owner. |
| Risk to shop user (original) | A mobile owner was unable to close the menu using the visible close control, making the app feel broken and trapping part of the screen. Screen readers also saw duplicate dialogs. |
| Recommended fix scope | Render a single mobile drawer instance, ensure only the active drawer is accessible, and fix overlay/close-button stacking. |
| Suggested branch | `fix/mobile-drawer-close-and-duplicate-dialog` |
| Suggested regression test | Mobile navigation test opens the drawer, asserts exactly one dialog, taps close, and verifies it disappears. |
| Resolution | Fixed on main in commit `faf1dddfacaced9e3a91ce2e70b8d5c4c9d4b2dd`. The drawer was split into a single `mobile-drawer-panel` portal and a `mobile-drawer-trigger` hamburger. The trigger is rendered in the topbar for mobile and tablet, and the panel mounts once inside `DrawerProvider`. A `matchMedia` listener closes the drawer and restores body scroll when the viewport crosses into desktop width. Original PR #288 was closed by the commit keyword; the code is present on main. |
| Regression evidence | `tests/e2e/mobile-drawer-single-dialog.spec.ts` passed 5/5 in Chromium against local Supabase: mobile open/close/backdrop/Escape/navigate/customize, tablet hamburger and single drawer, desktop trigger hidden, rotation to desktop closes drawer and restores scroll, repeated open/close creates no duplicate portal. `tests/e2e/auth-role-smoke.spec.ts` passed 9/9 across all five local roles. |
| Remaining limitations | Real-device hardware, WebKit/Firefox authenticated runs, 125% zoom, and full dark-mode matrix were not retested. |

### MN-009 - Cookie banner appears in invoice print/PDF output

| Field | Detail |
| --- | --- |
| Severity | P1 |
| Status | FIXED ON MAIN — VERIFIED |
| Module | Invoices, PDF/printing, cookie/privacy banner |
| Device/browser | Chromium, mobile emulation and print media |
| Viewport | 390x844, A4 print output |
| User role | Owner |
| Steps | Log in locally, open invoice `INV-000001`, generate print-media screenshot and A4 PDF while the cookie banner is present. |
| Expected | Printable invoice uses a clean white print background with no web overlays; totals, paid, due, and item rows remain visible. |
| Actual (original) | The cookie banner appeared inside the printable invoice output and covered the item/totals area. The A4 PDF was generated but included this overlay state. |
| Evidence (original) | `/tmp/saledock-mobile-audit-artifacts/invoice-mobile-print-media.png`, `/tmp/saledock-mobile-audit-artifacts/invoice-a4-print.pdf`, and the repeated dismissed-banner attempt at `/tmp/saledock-mobile-audit-artifacts/invoice-mobile-print-media-cookie-dismissed.png`. |
| Console/network error | None. |
| Environment | Local disposable Supabase, local invoice generated through QA flow. |
| Risk to shop user (original) | Printed/PDF invoices could be unusable for a first-time browser/session because the privacy banner covered financial totals. |
| Recommended fix scope | Hide cookie/privacy banner under print media and confirm it does not overlay invoice/receipt/report print views. |
| Suggested branch | `fix/cookie-banner-print-output` |
| Suggested regression test | Invoice print-media test asserts cookie banner is not visible with `media: print` and generated PDF contains no overlay. |
| Resolution | Fixed on main in commit `2c98657293449629f30be4ee08e34cc4cafca3ab`. PR #287 added a print-media CSS rule that hides the cookie/privacy banner when printing. The fix applies to the invoice A4 and 80mm/thermal print paths. |
| Regression evidence | `tests/e2e/cookie-banner-print-output.spec.ts` passed 1/1 in Chromium: banner visible on screen, hidden in `media: print`, A4 and 80mm thermal print PDFs generated with visible totals. `tests/e2e/cookie-banner-sidebar.test.ts` passed 1/2 (one skipped because no dashboard credentials, one accept-all sidebar test passed). `tests/unit/analytics-notice-consent.test.mjs` passed 4/4, including the print-media visibility assertion. |
| Remaining limitations | The MN-009 focused run generated invoice artifacts only. Reports was later generated and verified separately through PR #295, Returns through PR #299, and Repairs through PR #301. Daily Closing/Cash Drawer and Supplier Statement print surfaces were not visually regenerated under this finding. |

### RPT-PRINT-001 - Reports A4 output was clipped after one physical page

| Field | Detail |
| --- | --- |
| Severity | P2 presentation/print completeness defect |
| Status | FIXED ON MAIN — VERIFIED LOCALLY |
| Route | `/reports?range=this_month` |
| Device/browser | Chromium against a local production-mode Next server |
| Viewport | 1440x900, A4 print output |
| User role | Local disposable QA owner |
| Original issue | Reports A4 PDF was limited to one physical page and ended partway through Profitability Summary. |
| Impact | Later report sections were missing from saved and printed output. |
| Source cause | AppShell retained fixed viewport-height and internal-scroll constraints in print media. |
| Fix | Optional `printFullDocument` AppShell contract. It defaults off and is enabled only for Reports, allowing the print root, content column, main element, and content wrapper to grow and paginate. |
| PR | #295 - `fix: print the complete reports document` |
| Merge commit | `30400475202eeb2bbeb126abe3e5a281efebb95d` |
| Before | 1 A4 page, truncated. |
| After | 5 A4 pages, with later sections and the final Supplier Dues & Purchases Snapshot section present. |
| Validation | Source contract passed 8/8; focused Reports pagination E2E passed 1/1; existing print-control E2E passed 1/1; all five locally rendered PDF pages were inspected; unexpected business-data writes were 0. |
| Regression after PR #297 | The existing pagination regression was rerun locally. The Reports PDF remained five A4 pages with later and final sections present and no truncation. |
| Behavior retained | Normal Reports screen scrolling remained active. Screen and print value signatures matched in memory. No report formula, value, query, auth, permission, database, or business-data behavior changed. |
| Limitations | Evidence was authenticated locally only. GitHub CI verified lint, typecheck, and build but did not render or visually inspect the five PDF pages. Financial formula correctness was not tested. No authenticated production Reports login or PDF generation occurred. |

### RPT-MOBILE-001 - Reports metric labels were ellipsized on mobile

| Field | Detail |
| --- | --- |
| Severity | P3 |
| Status | FIXED ON MAIN — VERIFIED LOCALLY |
| Route | `/reports?range=this_month` |
| Device/browser | Chromium against a local production-mode Next server |
| Original viewport | 390x844 |
| Original issue | Three shared Reports StatCard labels were visually truncated with ellipses. |
| Affected labels | Net Sales (Revenue); Gross Profit Margin; Service Revenue / Profit |
| Original source condition | Shared StatCard placed `truncate` directly on every label. |
| Fix | Typed opt-in `wrapLabel?: boolean`, default false. Reports opts all five shared StatCards into wrapping while unrelated consumers retain truncation. |
| PR | #297 - `fix: show complete reports card labels on mobile` |
| Reviewed head | `e37303e04c2fefaa7b83b5a1b0b9662f4147cad7` |
| Merge commit | `0e85a47561b073236c5297d629927c8684fcc889` |
| Regression evidence | Source contract passed 8/8; focused label E2E passed 5/5; mobile 320x568, 390x844, and 430x932 passed; desktop 1440x900 passed; print media 390x844 passed; pagination E2E passed 1/1; local PDF remained five A4 pages; tooltip overlap, value overlap, horizontal overflow, and unexpected writes were all 0. |
| Business safety | Labels, values, formulas, queries, authentication, permissions, and database behavior were unchanged. |
| Limitations | Evidence was authenticated locally only. No production Reports login or PDF was performed. Unrelated StatCard consumers were source-contract protected but were not all visually revisited. Financial formula correctness was not tested. |

### RET-PRINT-001 - Returns 80mm output was miniature or clipped

| Field | Detail |
| --- | --- |
| Severity | P2 |
| Status | FIXED ON MAIN — VERIFIED LOCALLY |
| Module | Returns, PDFs/printing |
| Route | `/returns/[id]` |
| Device/browser | Chromium against a local production-mode Next server |
| User role | Local disposable QA owner |
| Original issue | The generated 80mm Returns PDF used only 34.3% of the physical page width and appeared as a miniature left-side receipt. A valid fixed-height page restored readable scale but exposed right-edge clipping until the printable context was corrected to 72mm. |
| Original evidence | Physical page approximately 80mm wide; original content span 34.3%; original bounds approximately 8.82 to 86.65 points. A valid-page-only proof reached 86.4% span but clipped at the right edge. |
| Cause | Invalid mixed `size: 80mm auto` page syntax; explicit-width PDF scaling from a wider print context; and an 80mm body/main combined with a centered 72mm receipt plus 4mm physical margins, which created an additional internal horizontal offset. |
| Fix | Returns-specific named page `returnsThermalReceipt`; valid 80mm by 297mm fallback; 4mm physical margins; 72mm printable context; pre-print receipt measurement; CSS pixel conversion using `25.4 / 96`; 8mm physical-margin addition plus 1mm upward allowance; page height rounded upward to 0.1mm; and a Returns-only body marker. The shared thermal page remains unchanged. No AppShell, transform, scale, or zoom workaround was used. |
| PR | #299 - `fix: center and size returns thermal receipts` |
| Reviewed head | `76cfd4f7c1fd834fe2a1fbfb72f0732e5406559f` |
| Merge commit | `09e1df96ccb571872ba0c3f46bd457723bfdae53` |
| Standard receipt evidence | Approximately 80mm by 132.3mm; 1 page; 89.9% horizontal span; bounds 11.25 to 215.34 points; no clipping. |
| Long receipt evidence | Approximately 80mm by 164.4mm; 1 page; 89.9% horizontal span; no clipping; footer present. |
| Additional regression evidence | A4 produced one complete page. Mobile 390x844 and desktop 1440x900 passed. Reports pagination passed 3/3 with five A4 pages, final section present, and screen scrolling retained. Fixture cleanup left 0 generated rows. Browser business writes and forbidden stock, payment, balance, and closing writes were 0. |
| Business safety | Return and refund values, queries, stock/FIFO, payments, balances, authentication, permissions, and database behavior were unchanged. |
| Limitations | Local authenticated evidence only. No production Returns login or PDF, return-accounting verification, refund-correctness verification, stock/FIFO restoration verification, or physical thermal-printer hardware test was performed. |

### RET-PRINT-001-LIFECYCLE - Returns thermal preparation could resume after cleanup

| Field | Detail |
| --- | --- |
| Severity | P3 |
| Status | FIXED ON MAIN — VERIFIED LOCALLY |
| Module | Returns print controls |
| Route | `/returns/[id]` |
| Original issue | Asynchronous thermal preparation could continue after cleanup or component unmount. The deterministic previous-head test produced no stale print or markers in the held-readiness path, but the stale continuation entered the error path and displayed one false preparation alert. |
| Previous-head evidence | Head `e160dc10ec53c124855a5fd690e2f92e0a569829`; afterprint dispatched during held image readiness; print calls 0; stale styles/markers 0; false role-alert 1. |
| Fix | Unique component-local attempt identity; exact-attempt cancellation; cleanup ownership protection; mounted-state guard; cancellation checks after readiness and animation frames and before measurement, style insertion, markers, and print; silent cancellation with no fallback timer; and unmount cancellation plus cleanup. |
| PR | #299 - `fix: center and size returns thermal receipts` |
| Reviewed head | `76cfd4f7c1fd834fe2a1fbfb72f0732e5406559f` |
| Merge commit | `09e1df96ccb571872ba0c3f46bd457723bfdae53` |
| Cleanup-during-readiness evidence | PASS. Print calls 0; dynamic styles 0; body markers 0; measurement markers 0; fallback timers 0; role-alert absent. |
| Client-navigation unmount evidence | PASS. Print calls 0; stale state 0; false alert absent. |
| Errors and writes | Page errors 0; console errors 0; native dialogs 0; browser business writes 0. |
| Limitations | Local browser evidence only. No production cancellation test and no financial-correctness claim. |

### REP-PRINT-001 - Repairs A4 footer was omitted and 80mm output was miniature

| Field | Detail |
| --- | --- |
| Severity | P2 |
| Status | FIXED ON MAIN — VERIFIED LOCALLY |
| Module | Repairs, PDFs/printing |
| Route | `/repairs/[id]` |
| Device/browser | Chromium against a local production-mode Next server |
| User role | Local disposable QA owner |
| Original A4 issue | The 595.92 by 842.88 point A4 artifact produced one physical page and omitted the final footer. |
| Original thermal issue | The 227.04 by 841.92 point artifact, approximately 80mm by 297mm, produced one page but used only 34.3% of the physical width. Bounds were approximately 8.82 to 86.65 points, leaving a miniature left-side receipt and excessive right whitespace. |
| A4 cause | Repairs did not opt into the existing AppShell `printFullDocument` contract, so viewport height, hidden overflow, and internal scrolling prevented the physical PDF from including the footer. |
| Thermal cause | Repairs used the wider shared thermal context, so a physically 80mm PDF scaled a wider layout and left the receipt at 34.3% of the page width. |
| Fix | Repairs opts into the existing `printFullDocument` behavior while AppShell source remains unchanged. A Repairs-specific `repairsThermalReceipt` page uses a valid 80mm by 297mm fallback, 4mm margins, a 72mm printable context, and content-derived height. CSS pixels convert using `25.4 / 96`; page height includes 8mm of physical margins plus a 1mm allowance and rounds upward to 0.1mm. Repairs-only body and measurement markers are used. The shared thermal page, Returns, and Reports remain unchanged, and no transform, scale, or zoom workaround is present. |
| PR | #301 - `fix: complete repairs A4 and thermal output` |
| Reviewed head | `71f3dd393a97717f28d033d217c55092d64b2ae0` |
| Merge commit | `a9ddb9bc1c905089604e559856c1aff9d392e62e` |
| Fixed A4 evidence | 595.92 by 842.88 points; 2 complete pages; all required sections present; footer present on the final page; no clipping or blank pages. |
| Standard thermal evidence | Approximately 80mm by 179.2mm; 1 page; 89.9% horizontal span; bounds 11.25 to 215.34 points; no clipping. |
| Long thermal evidence | Approximately 80mm by 235.0mm; 1 page; 89.9% horizontal span; bounds 11.25 to 215.34 points; no clipping. |
| Structural-row evidence | Repair job, Status, Estimate, Advance, Balance, and Payment remained complete. Wrapping, terms, and footer were present. |
| Lifecycle evidence | A4 print calls 1; accepted thermal print calls 1; duplicate thermal activation ignored; cancellation print calls 0; false alerts 0; stale styles, markers, and timers 0; client-navigation unmount, afterprint cleanup, and timeout cleanup passed. |
| Fixture and write safety | Direct local fixture inserts were limited to `repairs` and `repair_status_history`; RPCs and browser business writes were 0; cleanup succeeded after every variant; generated rows remaining were 0; safety signatures remained equal; forbidden writes were 0. |
| Regression evidence | Mobile 390x844 and desktop 1440x900 passed. Combined source contracts passed 91/91; Repairs E2E 4/4; deterministic print controls 1/1; Returns standard 3/3; Returns long 3/3; Reports 3/3 consecutive isolated passes with five A4 pages, final section present, and screen scrolling retained. Retries, skips, timeouts, and flakes were 0. |
| Business safety | Repair values, estimates, advances, balances, payments, customer-data behavior, repair queries, stock/FIFO, authentication, permissions, and database behavior were unchanged. |
| Limitations | Local authenticated evidence only. No production Repairs login or PDF, physical printer-hardware test, repair-accounting verification, estimate verification, advance verification, balance verification, payment verification, customer correctness verification, or stock/FIFO verification was performed. |

### EXP-MOBILE-001 - Important Expenses controls were below the mobile touch-target guideline

| Field | Detail |
| --- | --- |
| Severity | P3 |
| Status | FIXED ON MAIN — VERIFIED LOCALLY |
| Module | Expenses responsive workflow and shared confirmation actions |
| Route | `/expenses` |
| Device/browser | Chromium against a local production-mode Next server |
| Viewports | 320x568, 390x844, 430x932, and desktop sanity at 1440x900 |
| User roles | Local disposable QA owner and cashier |
| Original issue | Nine important controls rendered below the project's approximately 44px mobile guideline: the disclosure at 20px, Add/Update/mobile Apply at 40px, Edit/Void/Restore at 36px, and shared dialog actions without a 44px minimum. |
| Impact | Common create, update, filter, edit, void, confirmation, restore, and disclosure actions were harder to operate reliably by touch. |
| Root cause | Expenses controls used smaller fixed/minimum heights, while shared ConfirmDialog buttons relied on vertical padding without an explicit 44px minimum. |
| Resolution | Expenses actions use `h-11` or `min-h-11`; shared confirmation Cancel/Confirm actions use `min-h-11`. The visible controls themselves are tappable; no invisible hit-area workaround was used. |
| PR | #303 - `fix: improve Expenses mobile actions and void guidance` |
| Reviewed head | `f8478a7daf1df16acdf5726e5b75be3ee469c196` |
| Merge commit | `1a71a12ab5e00570fb66830570e80b8175f4fef4` |
| Regression evidence | All nine controls measured 44px at 320x568, 390x844, and 430x932. Ordinary center-point hit tests resolved to the intended control or child; labels remained visible and unclipped; no page-level horizontal overflow or mobile-bottom-navigation obstruction appeared; desktop remained usable. |
| Shared-component evidence | ConfirmDialog consumers were inventoried before the shared minimum changed. Escape, Enter, Tab trapping, Shift+Tab, focus restoration, light/dark presentation, and the shared sign-out confirmation regression passed. Callbacks, labels, ordering, variants, and focus behavior were unchanged. |
| Workflow and cleanup | Owner/cashier behavior passed locally. Exactly four expected create/update/void/restore submissions occurred. Cleanup left 0 generated expense rows and 0 matching audit rows; unexpected business writes were 0; unrelated signatures remained equal. |
| Business safety | Expense actions, amounts, accounting, queries, filters, audit behavior, reports, balances, payments, stock/FIFO, authentication, permissions, RLS, and database behavior were unchanged. |
| Limitations | Authenticated browser evidence is local only. GitHub CI covered lint, typecheck, and build, not the browser workflow. No authenticated production Expenses workflow ran. Expense accounting, reports, balances, payment correctness, stock, and FIFO were not certified. |

### EXP-MOBILE-002 - Expenses Void guidance incorrectly described a reversible archive as irreversible

| Field | Detail |
| --- | --- |
| Severity | P3 |
| Status | FIXED ON MAIN — VERIFIED LOCALLY |
| Module | Expenses Void/Restore guidance |
| Route | `/expenses` |
| Original issue | The Void dialog said the action could not be undone even though Void archives rather than deletes, Show voided exposes the row, and Restore returned it to active state. |
| Impact | Shop users received misleading irreversible-action guidance for a reversible archive operation. |
| Root cause | Stale confirmation copy contradicted the existing archive-and-Restore product behavior. |
| Resolution | The dialog explains that the expense is marked void, hidden from normal expense lists and reports, and restorable later through Show voided. It does not claim permanent deletion. |
| PR | #303 - `fix: improve Expenses mobile actions and void guidance` |
| Reviewed head | `f8478a7daf1df16acdf5726e5b75be3ee469c196` |
| Merge commit | `1a71a12ab5e00570fb66830570e80b8175f4fef4` |
| Regression evidence | Void Cancel submitted 0 actions and changed no row. Void Confirm submitted exactly once. Show voided exposed Restore, Restore submitted exactly once, and the row returned to active state without duplication. No native dialog appeared. |
| Business safety | Archive/Restore action contracts, server actions, data queries, values, audit side effects, permissions, authentication, RLS, and database behavior were unchanged. |
| Limitations | Local authenticated evidence only. No authenticated production Expenses workflow or financial-correctness verification occurred. |

### EXP-MOBILE-003 - Expenses mobile payment filtering and summary-label readability remain incomplete

| Field | Detail |
| --- | --- |
| Severity | P3 |
| Status | OPEN |
| Module | Expenses mobile filters and summary cards |
| Route | `/expenses` |
| Original viewport evidence | Payment-filter instability at 390x844; summary-label truncation at 320x568 and for Top category (month) at 390x844. |
| Issue | The mobile payment-method filter option became unstable/non-visible during an ordinary tap. Expenses summary headings were also truncated at narrow widths. |
| Impact | Mobile users cannot reliably complete payment-method filtering through the rendered control and cannot read every summary heading in full. |
| PR #303 boundary | PR #303 did not change AppSelect, payment-filter behavior, StatCard, filter meanings, or summary-label layout. |
| Next branch | `fix/expenses-mobile-filter-and-summary-labels` |
| Required review | Deterministically reproduce the ordinary tap failure, record menu/option geometry and hit testing, compare Expenses and shared AppSelect consumers, and review existing StatCard `wrapLabel` consumers before any shared change. |
| Completion boundary | After the focused source fix merges, rerun the complete owner/cashier Expenses workflow with exactly four expected action submissions, cleanup, and unrelated signatures. Perform another documentation-only audit synchronization before removing Expenses from blocked coverage. |
| Cash Drawer boundary | Cash Drawer remains blocked until EXP-MOBILE-003 is fixed, the full Expenses workflow passes, and the audit/handoff files are synchronized. |
| Business safety | No expense accounting, report formula, balance, payment, stock/FIFO, authentication, permission, RLS, or database correctness claim is made. |

## Historical Automated Audit Coverage Added

New file:

- `tests/e2e/mobile-native-audit.spec.ts`

The suite currently covers:

- Public/auth route viewport smoke across all required mobile, tablet, and desktop sizes.
- Page-level horizontal overflow detection.
- Native browser dialog failure detection.
- Framework error overlay detection.
- Authenticated app-shell route matrix for 16 app routes when local seeded owner login is available.
- Mobile navigation/dashboard/POS touch-surface smoke when local seeded owner login is available.
- Cashier restricted-users-page smoke when local seeded cashier login is available.

The authenticated tests deliberately skip instead of guessing when local login is unavailable. In this continuation run, local login was available after Docker/Supabase restoration.

## Commands Run During Audit

| Command | Result |
| --- | --- |
| `git remote -v` | SaleDock GitHub remote confirmed |
| `git rev-parse HEAD` | `cad3b8ce70a20a58c2f3919703b7cfa5edf861ba` |
| `docker info` | PASS during continuation |
| `npx supabase status --output json` | PASS during continuation; API URL confirmed local `http://127.0.0.1:54321` |
| `npx supabase db reset --local --yes` | PASS against local Supabase only |
| `node scripts/dev/setup-local-qa.mjs` | PASS; fake local owner/admin/manager/cashier/technician created/linked |
| Local role verification query | PASS; all five fake users active, same local org/branch, profile/org onboarding complete |
| Local test grants for disposable DB | PASS; used only to allow local service-role test reads after reset |
| `git diff --check` | PASS |
| `npm run lint` | PASS - 0 errors, 2 existing Privacy Center hook warnings |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `node --test tests/pos-held-bills.test.mjs tests/catalog-validation.test.mjs tests/karachi-business-day.test.mjs tests/pos-service-checkout.test.mjs tests/customer-settlement-validation.test.mjs` | PASS - 35 tests passed |
| `node --env-file=.env.local --test tests/seed-stock-lots.test.mjs tests/pos-held-bills.test.mjs tests/catalog-validation.test.mjs tests/karachi-business-day.test.mjs tests/pos-service-checkout.test.mjs tests/customer-settlement-validation.test.mjs` | PASS - 37 tests passed after local Supabase restoration and local-only grants |
| `npx supabase db query --local --file tests/pos-qa-checklist-part2.sql` | BLOCKED - file is not present on this branch after repository search |
| `npx supabase db query --local --file tests/pos-service-checkout-zero-unit.sql` | PASS |
| `PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/mobile-native-audit.spec.ts --project=chromium` | FAIL/PARTIAL - public matrix passed, focused smoke later passed, full owner matrix timed out and drawer close bug was found |
| `PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/mobile-native-audit.spec.ts --project=chromium -g "mobile navigation"` | PASS - 2 focused authenticated tests passed after preserving drawer finding in report |
| Temporary WebKit/Firefox public smoke | PASS - public/auth viewport matrix passed in WebKit and Firefox after local browser binary install |
| `PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/auth-role-smoke.spec.ts --project=chromium` | PASS - 9 tests passed |
| `PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/customer-settlement-optional-fields.spec.ts --project=chromium` | PASS - 1 test passed |
| `PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/pos-held-bills-qa.spec.ts --project=chromium -g "physical-product"` | PASS - 1 test passed after clean local reset; earlier parallel run was contaminated by reset and discarded |
| Local invoice print artifact capture | FAIL/PARTIAL - A4 PDF generated; cookie banner appeared in print media and covered totals |

## Commands Run During Rerun (post-fix)

| Command | Result |
| --- | --- |
| `git fetch origin main` | PASS - origin/main at `faf1dddfacaced9e3a91ce2e70b8d5c4c9d4b2dd` |
| `git checkout qa/mobile-native-full-product-audit` | PASS |
| `git rebase origin/main` | PASS - no conflicts |
| `git push --force-with-lease origin qa/mobile-native-full-product-audit` | PASS - new head `a6c546b6fb5703f7ed9a8ee0a5dbcf8303a894cb` |
| `npx supabase db reset --local --yes` | PASS against local Supabase only |
| `node scripts/dev/setup-local-qa.mjs` | PASS; fake local QA users created/linked |
| `npm run lint` | PASS - 0 errors, 2 existing Privacy Center hook warnings |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `node --test tests/pos-held-bills.test.mjs tests/catalog-validation.test.mjs tests/karachi-business-day.test.mjs tests/pos-service-checkout.test.mjs tests/customer-settlement-validation.test.mjs` | PASS - 35 tests passed |
| `PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/mobile-drawer-single-dialog.spec.ts --project=chromium` | PASS - 5/5 tests passed |
| `PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/auth-role-smoke.spec.ts --project=chromium` | PASS - 9/9 tests passed |
| `PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/cookie-banner-print-output.spec.ts --project=chromium` | PASS - 1/1 test passed |
| `PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/cookie-banner-sidebar.test.ts --project=chromium` | PASS - 1/2 passed, 1 skipped (no dashboard credentials for reject-all test) |
| `node --test tests/unit/analytics-notice-consent.test.mjs` | PASS - 4/4 tests passed |
| `PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/mobile-native-audit.spec.ts --project=chromium` | PARTIAL - 3/4 passed; owner touch-surface test failed in full matrix run but passed when run in isolation (MN-006 flakiness) |
| `gh pr comment 288 --body "..."` | PASS - traceability comment added to PR #288 |
| `curl -sS -o /dev/null -w '%{http_code}' https://saledock.site/` | 200 |
| `curl -sS -o /dev/null -w '%{http_code}' https://saledock.site/login` | 200 |
| `curl -sS -o /dev/null -w '%{http_code}' https://saledock-cloud-pos.vercel.app/login` | 200 (public Vercel production alias; availability only) |

## Commands Run During MN-002 Rebase Update

| Command | Result |
| --- | --- |
| `git fetch origin main qa/mobile-native-full-product-audit` | PASS - origin/main at `17551da8db6723d4b7d235c9b55b9d81ef92f190`; audit branch pre-rebase head at `1f04956744a3f41b4b58e9d2a27099251f4350f4` |
| `git rebase origin/main` | PASS - no conflicts |
| `git diff --check` | PASS |
| `npm run lint` | PASS - 0 errors, 2 existing Privacy Center hook warnings |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `node --test tests/pos-held-bills.test.mjs tests/catalog-validation.test.mjs tests/karachi-business-day.test.mjs tests/pos-service-checkout.test.mjs tests/customer-settlement-validation.test.mjs tests/dashboard-widget-reorder.test.mjs` | PASS - 47 tests passed |
| `PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/invoice-print-save-pdf-wording.spec.ts --project=chromium` | PASS - 1/1 test passed after the test accepted cookie consent before clicking the modal print action |
| `PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/cookie-banner-print-output.spec.ts --project=chromium` | PASS - 1/1 test passed |
| `PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/mobile-native-audit.spec.ts --project=chromium` | PARTIAL - public matrix passed, owner route matrix timed out at `/returns` after 420 seconds, and the remaining two tests did not run (MN-006 remains open) |
| `PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/mobile-native-audit.spec.ts --project=chromium -g "mobile navigation, dashboard editing, and POS touch surfaces"` | PASS - 1/1 focused owner touch-surface test passed after updating the audit smoke to wait for the drawer portal and verify the new dashboard Move Earlier / Move Later controls |
| `PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/mobile-drawer-single-dialog.spec.ts --project=chromium` | PASS - 5/5 tests passed; confirms the MN-008 drawer fix still works |

## Commands Run During MN-004 Rebase Update

| Command | Result |
| --- | --- |
| `git fetch origin main qa/mobile-native-full-product-audit` | PASS - origin/main at `4cd1c0745334ed12fb4fc4eefff0cb26af7e9a40`; audit branch pre-rebase head at `f2c0dfdf9bc5668a183e22294c2582c81b731eda` |
| `git rebase origin/main` | PASS - no conflicts |
| `git diff --check` | PASS |
| `npm run lint` | PASS - 0 errors, 2 existing Privacy Center hook warnings |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `node --test tests/pos-held-bills.test.mjs tests/catalog-validation.test.mjs tests/karachi-business-day.test.mjs tests/pos-service-checkout.test.mjs tests/customer-settlement-validation.test.mjs tests/dashboard-widget-reorder.test.mjs` | PASS - 47 tests passed |
| `PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/sidebar-accessible-reorder-controls.spec.ts --project=chromium` | 2/3 passed in full-file run; the mouse/keyboard reorder test showed timing sensitivity around preference sync. When rerun in isolation, that test passed. |
| `PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/sidebar-accessible-reorder-controls.spec.ts --project=chromium -g "mouse and keyboard reorder one visible item"` | PASS - 1/1 isolated rerun passed |
| `PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/auth-role-smoke.spec.ts --project=chromium` | PASS - 9/9 tests passed |
| `PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/mobile-drawer-single-dialog.spec.ts --project=chromium` | 4/5 passed in first full run; the mobile navigation test failed to carry the authenticated session to the POS link. Rerun passed 5/5. |
| `PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/mobile-native-audit.spec.ts --project=chromium` | PASS - 4/4 tests passed; the full owner route/viewport matrix completed in this run, but the suite has historically timed out (MN-006 remains open as a test-infrastructure finding). |
| `curl -sS -o /dev/null -w '%{http_code}' https://saledock.site/` | 200 |
| `curl -sS -o /dev/null -w '%{http_code}' https://saledock.site/login` | 200 |
| `curl -sS -o /dev/null -w '%{http_code}' https://saledock-cloud-pos.vercel.app/login` | 200 (public Vercel production alias; availability only) |

## Commands Run During MN-006 Audit Suite Split

| Command | Result |
| --- | --- |
| `git fetch origin main qa/mobile-native-full-product-audit` | PASS - origin/main at `4cd1c0745334ed12fb4fc4eefff0cb26af7e9a40`; audit branch starting head at `165e9ea38c1de6438976675d8fdaec4ba72c9bf4` |
| `git diff --check` | PASS |
| `npm run lint` | PASS - 0 errors, 2 existing Privacy Center hook warnings |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `node --test tests/pos-held-bills.test.mjs tests/catalog-validation.test.mjs tests/karachi-business-day.test.mjs tests/pos-service-checkout.test.mjs tests/customer-settlement-validation.test.mjs tests/dashboard-widget-reorder.test.mjs` | PASS - 47 tests passed |
| `PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/mobile-native-audit.spec.ts --project=chromium --workers=1 -g "owner matrix\|matrix partition"` | PASS - focused run 1 completed 13/13 with no skips. Longest owner matrix test: 34s, `mobile viewports / reports and administration routes`. |
| `PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/mobile-native-audit.spec.ts --project=chromium --workers=1 -g "owner matrix\|matrix partition"` | PASS - focused run 2 completed 13/13 with no skips. Longest owner matrix test: 44s, `desktop viewports / reports and administration routes`. |
| `PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/mobile-native-audit.spec.ts --project=chromium --workers=1` | PASS - full audit file completed 16/16 with no skips. Longest owner matrix test: 54s, `mobile viewports / core sales routes`. |
| `PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/auth-role-smoke.spec.ts --project=chromium --workers=1` | PASS - 9/9 tests passed |

## Commands Run During MN-003 Main Sync

| Command | Result |
| --- | --- |
| `git fetch origin main qa/mobile-native-full-product-audit` | PASS - origin/main at `b240ae533351917f846fe240daf602f39ca4abe1`; audit branch pre-rebase head at `b4d9528329a3a6ecadaa0de07e00c1164302eb34` |
| `git rebase origin/main` | PASS - no conflicts |
| `git diff --check` | PASS |
| `npm run lint` | PASS - 0 errors, 2 existing Privacy Center hook warnings |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `node --test tests/pos-held-bills.test.mjs tests/catalog-validation.test.mjs tests/karachi-business-day.test.mjs tests/pos-service-checkout.test.mjs tests/customer-settlement-validation.test.mjs tests/dashboard-widget-reorder.test.mjs tests/print-action-touch-targets.test.mjs` | PASS - 60/60 tests passed, including 13/13 print/share touch-target source-contract checks |
| `PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/print-action-touch-targets.spec.ts --project=chromium --workers=1` | PASS - 2/2 tests passed; deterministic Reports, Daily Closing, and Supplier Statement controls rendered at least 44 px at 320x568, 390x844, and 430x932 |
| `PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/cookie-banner-print-output.spec.ts --project=chromium --workers=1` | PASS - 1/1 test passed |
| `PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/auth-role-smoke.spec.ts --project=chromium --workers=1` | PASS - 9/9 tests passed |
| `PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/mobile-native-audit.spec.ts --project=chromium --workers=1` | PASS - 16/16 tests passed in 4.2m; no skips, retries, or timeouts |
| Extra timing extraction run: `PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/mobile-native-audit.spec.ts --project=chromium --workers=1 --reporter=json > /tmp/saledock-mobile-audit-final.json` | FAIL - 15 expected, 1 unexpected, no skips/flakes reported by Playwright JSON. The tablet operations owner matrix timed out after 180s while navigating to `/daily-closing`. This was an additional timing run after the required full audit pass. |
| Focused rerun of failed group: `PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/mobile-native-audit.spec.ts --project=chromium --workers=1 -g "owner matrix: tablet viewports / operations routes"` | PASS - 1/1 in 41.5s. The `/daily-closing` timeout did not reproduce in the focused group. |
| Local visual spot-check at 320x568 and 390x844 | PASS for `/reports`, `/daily-closing`, and `/suppliers/00000000-0000-4000-8000-000000002001/statement`; measured controls at 44 px, no horizontal overflow, no clipped labels, and print/share controls hidden in print media |

## Commands Run During MN-005 Main Sync

| Command | Result |
| --- | --- |
| `git fetch origin --prune` | PASS - origin/main at `12cddabc28bf49d58af5e30fbb8d4f7f04a42af1`; audit branch pre-rebase head at `259c1e4d71dfb0975cba23a32fc7fbc459d823ec` |
| `git switch qa/mobile-native-full-product-audit` | PASS - switched from `fix/shared-image-crop-accessible-controls` to the verified audit branch |
| `git rebase origin/main` | PASS - no conflicts; rebased audit head before this documentation update was `30aa691357f0372f0a535d169ecdf84b4988b49f` |
| `git diff --check` | PASS |
| `npm run lint` | PASS - 0 errors, 2 existing Privacy Center hook warnings |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `node --test tests/pos-held-bills.test.mjs tests/catalog-validation.test.mjs tests/karachi-business-day.test.mjs tests/pos-service-checkout.test.mjs tests/customer-settlement-validation.test.mjs tests/dashboard-widget-reorder.test.mjs tests/print-action-touch-targets.test.mjs tests/shared-image-crop-accessible-controls.test.mjs` | PASS - 77/77 tests passed, including 17/17 shared crop source-contract checks |
| `PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/shared-image-crop-accessible-controls.spec.ts --project=chromium --workers=1` | PASS - 6/6 tests passed in 50.7s; page errors 0, visible framework errors 0, native dialogs 0, Supabase Storage object writes 0 |
| `PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/auth-role-smoke.spec.ts --project=chromium --workers=1` | PASS - 9/9 tests passed in 47.3s |
| `PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/mobile-native-audit.spec.ts --project=chromium --workers=1` | PASS - 16/16 tests passed in 3.8m; no skips, retries, failures, or timeouts |
| Historical supplemental JSON timing experiment | NOT RERUN - the previous intermittent tablet `/daily-closing` timeout remains recorded above as audit history |

## Commands Run During MN-007 Final Refresh

| Command | Result |
| --- | --- |
| `git fetch origin main qa/mobile-native-full-product-audit` | PASS - origin/main at `6ccca9b7f9e1127a848890fe2918ee54501f6507`; PR #294 merge commit reachable on main |
| `git switch qa/mobile-native-full-product-audit` | PASS - working tree clean except for intended audit doc edits |
| `git rebase origin/main` | PASS - no conflicts; rebased audit head before this documentation update was `4c8bba535a2512ac1b27e07477c8e042ecb947e5` |
| `git diff --check` | PASS |
| `git diff origin/main...HEAD --name-only` | PASS - exactly the six established PR #286 files |
| `npm run lint` | PASS - 0 errors, 2 existing Privacy Center hook warnings |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `node --test tests/pos-held-bills.test.mjs tests/catalog-validation.test.mjs tests/karachi-business-day.test.mjs tests/pos-service-checkout.test.mjs tests/customer-settlement-validation.test.mjs tests/dashboard-widget-reorder.test.mjs tests/print-action-touch-targets.test.mjs tests/shared-image-crop-accessible-controls.test.mjs tests/csp-nonce-flow.test.mjs` | PASS - 96/96 tests passed, including 26/26 CSP nonce source-contract checks |
| `PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/auth-role-smoke.spec.ts --project=chromium --workers=1` | PASS - 9/9 tests passed |
| `PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/mobile-native-audit.spec.ts --project=chromium --workers=1` | PASS - 16/16 tests passed in 3.4m; no skips, retries, failures, or timeouts |
| `CSP_TEST_ENV=dev PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/csp-nonce-hydration-verification.spec.ts --project=chromium --workers=1` | PASS - 10/10 dev application tests passed; 1 preview SSO preflight test skipped because `CSP_TEST_ENV=dev` |
| `npx next start -p 3001` + `CSP_TEST_ENV=local-production PLAYWRIGHT_BASE_URL=http://localhost:3001 npx playwright test tests/e2e/csp-nonce-hydration-verification.spec.ts --project=chromium --workers=1` | PASS - 10/10 local-production application tests passed; 1 preview SSO preflight test skipped because `CSP_TEST_ENV=local-production` |
| `curl -sS -o /dev/null -w '%{http_code}' https://saledock.site/` | 200 (production custom domain; availability only, no browser test) |
| `curl -sS -o /dev/null -w '%{http_code}' https://saledock.site/login` | 200 (production custom domain; availability only, no browser test) |
| `curl -sS -o /dev/null -w '%{http_code}' https://saledock-cloud-pos.vercel.app/login` | 200 (public Vercel production alias; availability only, no browser test) |

## Commands Run During Reports Audit Refresh

| Command | Result |
| --- | --- |
| Evidence worktree `git branch --show-current`, `git rev-parse HEAD`, `git status --porcelain=v1 --untracked-files=all`, and SHA-256 checks | PASS - branch remained `qa/reports-print-pdf-verification` at `82db6ecca5f13439cf6bb624556dd921c1dcd5d3`; only the two expected untracked evidence files were present and their hashes were recorded. |
| `git fetch origin --prune` and GitHub PR state checks | PASS - origin/main was `30400475202eeb2bbeb126abe3e5a281efebb95d`; PR #295, PR #286, and PR #294 were closed and merged. |
| `git worktree add /Users/sw12/Projects/saledock-reports-audit-refresh -b qa/reports-audit-refresh origin/main` | PASS - clean documentation worktree created from exact main. |
| `git status --short`, `git diff --check`, `git diff --stat`, and `git diff --name-only` | PASS - only `docs/qa/mobile-native-full-product-audit.md` changed. |
| `npm ci` | PASS - worktree dependencies installed; package and lockfiles remained unchanged. |
| `npm run lint` | PASS - 0 errors and 2 existing Privacy Center hook warnings. |
| `npm run typecheck` | PASS. |
| `npm run build` | PASS - production build completed. |
| `node --test tests/reports-print-full-document-pagination.test.mjs tests/print-action-touch-targets.test.mjs` | PASS - 21/21 source-contract tests passed: Reports pagination 8/8 and print touch targets 13/13. |

No authenticated browser or PDF suite was rerun for this documentation-only refresh. The local five-page Chromium PDF generation and visual inspection are inherited from the reviewed and merged PR #295 evidence. GitHub CI independently passed lint, typecheck, and build for exact reviewed head `95b23ace6281611d4821bc55cb63ce7f8b07e29a`. Vercel reported the Production deployment Ready for merge commit `30400475202eeb2bbeb126abe3e5a281efebb95d`. Previously reported public HTTP 200 checks prove availability only; they were not rerun here and do not certify authenticated Reports or PDF behavior.

## Commands Run During Reports Mobile Audit Refresh

| Command | Result |
| --- | --- |
| Evidence worktree `git status --short`, `git branch --show-current`, `git rev-parse HEAD`, and SHA-256 checks | PASS - branch remained `qa/reports-print-pdf-verification` at `82db6ecca5f13439cf6bb624556dd921c1dcd5d3`; only the two expected untracked evidence files were present and both hashes were unchanged. |
| `git fetch origin --prune` and GitHub PR/branch state checks | PASS - origin/main was `0e85a47561b073236c5297d629927c8684fcc889`; PRs #295, #296, and #297 were merged; no audit-refresh branch or PR already existed. |
| `git worktree add /Users/sw12/Projects/saledock-reports-mobile-audit-refresh -b qa/reports-mobile-audit-refresh origin/main` | PASS - clean documentation worktree created from exact main. |
| `git status --short`, `git diff --check`, `git diff --stat`, and `git diff --name-only` | PASS - only `docs/qa/mobile-native-full-product-audit.md` changed. |
| `npm ci` | PASS - dependencies installed; package and lockfiles remained unchanged. |
| `npm run lint` | PASS - 0 errors and 2 existing Privacy Center hook warnings. |
| `npm run typecheck` | PASS. |
| `npm run build` | PASS - production build completed. |
| `node --test tests/reports-mobile-card-label-wrapping.test.mjs tests/reports-print-full-document-pagination.test.mjs tests/print-action-touch-targets.test.mjs` | PASS - 29/29 source-contract tests passed: mobile labels 8/8, Reports pagination 8/8, and print touch targets 13/13. |
| GitHub check/deployment API reads for PR #297 | PASS - exact reviewed head `e37303e04c2fefaa7b83b5a1b0b9662f4147cad7` had successful CI and Vercel status; Production deployment for merge commit `0e85a47561b073236c5297d629927c8684fcc889` was successful. |

No authenticated browser, screenshot, print-media, or PDF suite was rerun for this documentation-only refresh. That evidence is inherited from the reviewed and merged PR #297. GitHub CI independently covered lint, typecheck, and build; the local browser and five-page PDF results remain reported local evidence rather than CI or production evidence. Previously reported public HTTP 200 checks prove availability only and were not rerun here. No production authentication occurred.

## Commands Run During Returns Print Audit Refresh

| Command | Result |
| --- | --- |
| Seven protected worktree `git status --short`, `git branch --show-current`, `git rev-parse HEAD`, and SHA-256 checks | PASS - all expected branches, HEADs, dirty/untracked scopes, and recorded hashes matched before editing; the merged source worktree remained clean. |
| `git fetch origin --prune`, GitHub PR state checks, merge-scope inspection, and branch/PR-name checks | PASS - origin/main was `09e1df96ccb571872ba0c3f46bd457723bfdae53`; PR #299 was merged with the exact five-file scope; PRs #297 and #298 remained merged; no `qa/returns-print-audit-refresh` branch or PR existed. |
| `git worktree add /Users/sw12/Projects/saledock-returns-print-audit-refresh -b qa/returns-print-audit-refresh origin/main` | PASS - clean documentation worktree created from exact main. |
| `npm ci` | PASS - locked dependencies installed; package and lockfiles remained unchanged. The npm audit summary reported 1 low and 3 moderate dependency advisories; no package remediation was attempted in this documentation-only task. |
| `git status --short`, `git diff --check`, `git diff --stat`, and `git diff --name-only` | PASS - only `docs/qa/mobile-native-full-product-audit.md` changed. |
| `npm run lint` | PASS - 0 errors and 2 existing Privacy Center hook warnings. |
| `npm run typecheck` | PASS. |
| `npm run build` | PASS - production build completed. |
| `node --test tests/returns-thermal-centered-dynamic-page.test.mjs tests/print-action-touch-targets.test.mjs tests/reports-print-full-document-pagination.test.mjs tests/reports-mobile-card-label-wrapping.test.mjs` | PASS - 50/50 source-contract tests passed: Returns lifecycle/geometry 21/21 and existing shared contracts 29/29. |
| GitHub check and deployment API reads for PR #299 and merge commit | PASS - exact reviewed head `76cfd4f7c1fd834fe2a1fbfb72f0732e5406559f` had successful CI and Vercel status. The user reported, and the GitHub run API confirmed, successful main-commit push CI for `09e1df96ccb571872ba0c3f46bd457723bfdae53`; no separate pull-request-triggered run is claimed for the squash SHA. Vercel reported the merge-SHA deployment Ready. |

PR #299 browser, print-media, PDF, visual, lifecycle, cleanup, and fixture-safety evidence is inherited from the reviewed and merged PR. No authenticated browser, Returns PDF, cancellation browser, unmount browser, Reports browser, screenshot, or production-authentication suite was rerun for this documentation-only refresh. GitHub CI independently covered repository checks on the reviewed head; local authenticated tests remain reported local evidence rather than CI or production evidence. Previously reported public HTTP 200 checks prove availability only and were not rerun here. No production authentication occurred.

## Commands Run During Repairs Print Audit Refresh

| Command | Result |
| --- | --- |
| Ten protected worktree `git status --porcelain=v1 --untracked-files=all`, `git branch --show-current`, `git rev-parse HEAD`, and SHA-256 checks | PASS - all expected branches, HEADs, dirty/untracked scopes, and recorded hashes matched before editing; the merged Repairs source worktree remained clean. |
| `git fetch origin --prune`, GitHub PR state checks, merge-scope inspection, and branch/PR-name checks | PASS - origin/main was `a9ddb9bc1c905089604e559856c1aff9d392e62e`; PR #301 was merged with the exact six-file scope; PRs #299 and #300 remained merged; no `qa/repairs-print-audit-refresh` branch or PR existed. |
| `git worktree add /Users/sw12/Projects/saledock-repairs-print-audit-refresh -b qa/repairs-print-audit-refresh origin/main` | PASS - clean documentation worktree created from exact main. |
| Initial `npm run lint` and `npm run typecheck` prerequisite check | STOPPED before analysis because the fresh worktree had no installed `eslint` or `tsc` executable; no code or repository validation failure occurred. |
| `npm ci` | PASS - locked dependencies installed; package and lockfiles remained unchanged. The npm audit summary reported 1 low and 3 moderate dependency advisories; no package remediation was attempted in this documentation-only task. |
| `git status --short`, `git diff --check`, `git diff --stat`, and `git diff --name-only` | PASS - only `docs/qa/mobile-native-full-product-audit.md` changed. |
| `npm run lint` | PASS - 0 errors and 2 existing Privacy Center hook warnings. |
| `npm run typecheck` | PASS. |
| `npm run build` | PASS - production build completed. |
| `node --test tests/repairs-print-artifact-output.test.mjs tests/returns-thermal-centered-dynamic-page.test.mjs tests/print-action-touch-targets.test.mjs tests/reports-print-full-document-pagination.test.mjs tests/reports-mobile-card-label-wrapping.test.mjs` | PASS - 91/91 source-contract tests passed: Repairs lifecycle/geometry 41/41 and existing shared contracts 50/50. |
| GitHub check and deployment API reads for PR #301 and merge commit | PASS - exact reviewed head `71f3dd393a97717f28d033d217c55092d64b2ae0` had successful CI and Vercel status. The user reported, and the GitHub run API confirmed, successful main-commit push CI for `a9ddb9bc1c905089604e559856c1aff9d392e62e`; no separate pull-request-triggered run is claimed for the squash SHA. Vercel reported the merge-SHA deployment Ready. |
| Read-only `curl` checks for `https://saledock.site`, `https://saledock.site/login`, and `https://saledock-cloud-pos.vercel.app` | PASS - all returned HTTP 200. These checks prove public availability only. |

PR #301 browser, print-media, PDF, coordinate, visual, lifecycle, cleanup, fixture, and write-guard evidence is inherited from the reviewed and merged PR. No authenticated browser, Repairs PDF, screenshot, cancellation browser, unmount browser, Returns browser/PDF, Reports browser, or production-authentication suite was rerun for this documentation-only refresh. GitHub CI independently covered repository checks on the reviewed head; local authenticated browser and PDF evidence remains reported local evidence rather than CI or production evidence. Public HTTP 200 checks prove availability only. No production authentication occurred.

## Commands Run During Expenses PR #303 Handoff Audit Synchronization

| Command | Result |
| --- | --- |
| Exact-path `test`, `shasum -a 256`, and `unzip -l` for `/Users/sw12/Downloads/SaleDock_Handoff_Bundle_2026-07-12.zip` | PASS - SHA-256 matched `0dd1ce8015cb139490c8d622d293cbfa346aa876b1ca8f0fe866f35e7b004977`; required files and headers were verified; extraction used a temporary directory outside every worktree; the original ZIP remained unchanged. |
| Eighteen protected-worktree branch, HEAD, status, and SHA-256 inventories before and after editing | PASS - all 18 protected worktrees, 22 dirty/untracked files, and all 22 full fingerprints matched exactly. The protected Expenses document/test hashes remained `7dc4dafc10c834aee01e71ea36b42b67c73b308270016c5e999bc2309f78c8b7` and `760f480c4794488146c80183f1f30e2128272c7c1376c55f895c02c40a8bc469`. |
| `git fetch origin --prune`, PR #303 state reads, merge-scope inspection, and branch/worktree-name checks | PASS - origin/main was `1a71a12ab5e00570fb66830570e80b8175f4fef4`; PR #303 was merged from reviewed head `f8478a7daf1df16acdf5726e5b75be3ee469c196` with the exact seven-file scope; the documentation branch/worktree did not already exist. |
| `git worktree add /Users/sw12/Projects/saledock-expenses-pr303-handoff-audit-sync -b docs/expenses-pr303-handoff-audit-sync origin/main` | PASS - clean documentation worktree created from exact main. |
| `git status --short`, `git diff --check`, `git diff --stat`, `git diff --name-only`, per-file diffs, and focused documentation assertions | PASS - exactly `02_CURRENT_STATE.md`, `03_REMEMBER.md`, `CHATGPT_CONTINUATION_BRIEF.md`, and this audit document changed; target counts and evidence boundaries passed focused assertions. |
| `node --test tests/expenses-mobile-touch-and-void-copy.test.mjs` | PASS - 5/5 source-contract tests passed. |
| `npm ci` | PASS - locked dependencies installed; package and lockfiles remained unchanged. npm reported 1 low and 3 moderate dependency advisories; no remediation was attempted in this documentation-only task. |
| `npm run lint` | PASS - 0 errors and 2 pre-existing Privacy Center hook warnings. |
| `npm run typecheck` | PASS. |
| `npm run build` | PASS - Next.js 16.2.6 production build completed. |
| GitHub checks for PR #303 reviewed head and squash merge | PASS - pull-request CI succeeded on `f8478a7daf1df16acdf5726e5b75be3ee469c196`; push/main CI succeeded on `1a71a12ab5e00570fb66830570e80b8175f4fef4`; Vercel succeeded for both exact commits. |

PR #303 local authenticated responsive-browser, touch-geometry, keyboard, owner/cashier, workflow, cleanup, and signature evidence is inherited from the reviewed and merged PR. No browser, Expenses workflow, screenshot, Supabase mutation, or production-authentication suite was rerun for this documentation-only synchronization. GitHub CI independently covered lint, typecheck, and build; Vercel status proves deployment only. Previously reported public HTTP 200 checks prove availability only and were not rerun here. No authenticated production Expenses workflow occurred.

## Historical 2026-07-14 Limitation Snapshot

The July 14 refresh recorded sixteen of seventeen findings dispositioned, one
active `EXP-MOBILE-003` P3, and five blocked/not-tested areas. That statement is
retained as dated history only. Later work completed the old Expenses and Cash
Drawer sequence and produced the separate July 26 register above. The old count
must not be used as current status.

The original nine MN findings and supplemental Reports, Returns, Repairs, and
Expenses findings retain their historical IDs and dispositions in this document.
They are not renumbered into the current finishing register.

## Current Coverage Limits

- Authenticated cashier production acceptance was unavailable.
- Soft-keyboard overlap could not be measured in the authenticated mobile runtime.
- Physical printer hardware was not tested.
- Authenticated WebKit/Firefox, real-device hardware, and 125% browser zoom were not part of the July 26 acceptance.
- Customer and supplier settlement client completion remain open P2 risks.
- Expense Restore audit coverage is closed; Expense Restore settlement remains
  open P3.
- Invoice filters and the 80mm trailing blank page remain open P2.
- Repair optional-field behavior and Repair Intake create auditing are closed.
  Repair-status audit durability remains open P2. Customer ledger presentation
  and reference routing are closed.
- Five P3 client-settlement, hydration, reset, and narrow-mobile presentation observations remain.

These limits do not reopen fixed P1 results without new contradictory evidence.

## Fixed P1 History

| Area | Source merge | Documentation merge | Production result |
| --- | --- | --- | --- |
| Opening stock and FIFO atomicity | `da40ad2b846f69736231dfba9f8e46f013f6d247` | `2f71c5c0db0e2e799032087cd3077ab8c204e058` | Opening stock, stock movement, FIFO lot, and atomic consistency passed. |
| Supplier purchase number generation | `857556f173383efd66cbbf3f96448d0562cc8bc6` | `afaef696aa7df08cd1e18965e5770f7e00189bb9` | Purchase number, stock/FIFO, supplier due, and Card settlement passed. Supplier-payment client settlement remains P2. |
| Expense timestamp preservation | `03eeda4a014852d294bc790b81c308d716802221` | `191c1a83229c0ad4aaeab97922b07be499e60f54` | Karachi conversion, unrelated-edit preservation, intentional conversion, and report date passed. |
| Return-profit reconciliation | `68a86398f91cbfd240f8d3818c6bb866a4da2266` | `6542ab0577a02feaca26df9ac9dcb528f0caa564` | Full restocked return, exact restored FIFO cost, Dashboard profit, and Reports profit reconciled. |
| Dashboard net-cash reconciliation | `8f8202a428a88bd8d72d178facbafb775eb1abf8` | `0b94dcb072a204539aa4608d53e0237a77c058fe` | Card sale/refund delta zero, Cash sale/refund +150/-150, starting-float exclusion, and shift 1,000/1,000/0 passed. |
| Repair/customer tenant integrity | `12de0dd189d0c41895e4da5ca06bd880d17ee98b` | `8afbc37751a76edb93d52175146be6dbb619a0a3` | Zero production mismatches, validated composite FK, rollback-only `23503` rejection, and read-only authenticated Repair UI passed. |

## Current Recommendation And Next Task

Current recommendation:

**FINISHING ACCEPTED WITH LIMITED COVERAGE**

Immediate next task:

1. Investigate `KNOWN RESIDUAL REPAIR-STATUS AUDIT DURABILITY RISK — P2` on a
   fresh current-main worktree.
2. Inspect `updateRepairStatusAction` and `logAudit`, then prove whether delayed
   completion, returned insert errors, and thrown errors can allow status
   success before durable audit persistence.
3. Do not begin another P2 source investigation from this documentation synchronization.

Do not repeat optional-field, create-audit, or tenant work. Preserve status
business transitions, history, permissions, optional normalization, tenant
integrity, accounting, stock/FIFO, and Cash Drawer. Do not mutate production
during the review-first status-audit investigation.

## Current Safety Confirmation

- This canonical synchronization changes documentation only.
- No production login or production mutation is performed by the synchronization.
- The July 26 authenticated evidence is inherited from the verified evidence package; the finishing browser matrix is not rerun.
- No source, test, migration, package, lockfile, workflow, configuration, schema, RLS, query, permission, Cash Drawer, payment, refund, stock, FIFO, customer, supplier, or report formula changes.
- No secrets, credentials, cookies, tokens, authorization headers, private customer contacts, or unrelated customer information are recorded.
- Historical and current finding registers remain distinct.
- SaleDock is not audit-ready and not MVP-live.

## Current Risk Position

P0 and P1 are zero. Six P2 findings or coverage limits and five P3 observations
remain. Authenticated owner production acceptance passed across the recorded
routes and bounded workflows, but authenticated cashier acceptance was
unavailable. Customer/supplier settlement risks, repair-status audit durability,
invoice filters, and invoice thermal pagination remain explicit. Customer
lifecycle auditing, customer ledger presentation, repair/customer tenant
integrity, repair optional-field validation, and Repair Intake create-audit
durability are closed.

The current recommendation is **FINISHING ACCEPTED WITH LIMITED COVERAGE**, not
a claim that the full product audit is complete without caveat.
