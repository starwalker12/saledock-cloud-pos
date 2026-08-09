# 03 — Remember For The Future — SaleDock Cloud POS
*Durable memory. Last updated: 3 August 2026 after repair optional-field and create-audit closures.*

## Who Fardan Is

- Fardan Aatir is the non-technical owner of SaleDock Cloud POS.
- Production identity: Owner, Star Shop, Main Branch, PKR, Asia/Karachi.
- Explain business and safety impact plainly.
- Use review-first branches and pull requests for source changes.
- Never ask for credentials in chat.

## Current Durable Status

- Canonical synchronization base: `85031fe8bf32a02f7bcf93b63a2e65752dd354df`.
- Latest application-behavior commit: `de94a0e59de20c51e7c77cdbfa2fe496d30019e9`.
- Latest behavior change: `fix: make repair create audit durable`.
- Previous optional-field behavior commit: `62ee3a9ea985fc7b9016bddfb1161b51f80d1efa`.
- Latest focused documentation commit: `85031fe8bf32a02f7bcf93b63a2e65752dd354df`.
- Production deployment: `3g68nELcKAKV1hjz6rwbTFHycTNC`, Ready/current for the synchronization base.
- Classification: **FINISHING ACCEPTED WITH LIMITED COVERAGE**.
- P0 active: **0**.
- P1 active: **0**.
- P2 findings or coverage limits: **6**.
- P3 observations: **5**.
- Audit-ready: **NO**.
- MVP-live: **NO**.

The limitation is authenticated cashier production acceptance. Permission
contracts were reviewed, but no approved cashier credentials or authenticated
cashier session existed. No cashier account was created, reset, invited, or
impersonated. Accepted limited coverage is never equivalent to audit-ready.

## Business Truths That Must Not Drift

- Every organization and branch query remains scoped.
- Money uses PKR and exact decimal-safe database values.
- Asia/Karachi controls business-day boundaries and explicit datetime conversion.
- Cash and non-cash payment methods must remain distinct in Dashboard, Cash Drawer, Daily Closing, refunds, expenses, customer settlements, and supplier settlements.
- Starting cash is a float, not sales revenue or Dashboard net cash.
- Card sale/refund and Card expense/payment activity must not move physical expected cash.
- FIFO uses exact lots and exact allocation costs. Never substitute catalog price, average cost, refund amount, or an invented fallback.
- Opening stock, stock movement, and opening FIFO lot must remain atomic.
- Completed restocked returns add back exact restored FIFO cost to profit.
- Non-restocked returns preserve their loss.
- Financial history is retained truthfully; archive operations are not hard deletes.
- Expense Void is reversible through Restore.
- Customer and supplier balances must reconcile to transaction truth.

## Cash Drawer And Net-Cash Truth

Authenticated production verification established:

- Card sale PKR 150: Dashboard net-cash delta PKR 0.
- Card refund PKR 150: Dashboard net-cash delta PKR 0.
- Cash sale PKR 150: Dashboard relative delta +PKR 150.
- Cash refund PKR 150: Dashboard relative delta -PKR 150.
- Starting float PKR 1,000 stayed excluded from Dashboard net cash.
- The task-owned shift closed at starting/expected/counted PKR 1,000 with difference PKR 0.
- The July 26 Card expense had PKR 0 Cash Drawer effect.

Do not change payment creation, refund creation, Cash Drawer mutation sources,
Daily Closing formulas, or shift formulas without a focused accounting review.

## Active P2 Register

Keep all six items independently visible:

1. `KNOWN RESIDUAL REPAIR-STATUS AUDIT DURABILITY RISK — P2`
   - `updateRepairStatusAction` remains unchanged and does not require a
     caller-visible confirmed audit insert before returning success.
   - The asynchronous global audit helper returns `Promise<void>` and keeps
     returned insert errors caller-invisible.
   - This is the same durability class proven on the former Repair Intake create
     path; PR #330 intentionally did not change status auditing.
   - Status audits happened to persist for the cancellations of `RJ-000004` and
     `RJ-000005`. This is not a production failure claim and does not prove
     status-audit durability.
2. `LIVE-INVOICE-FILTER-001`
   - Search/date/payment/status/Reset controls are absent or materially incomplete.
3. `LIVE-INVOICE-THERMAL-BLANK-PAGE-001`
   - 80mm content is correct on page one, with one blank trailing page; A4 is complete.
4. `KNOWN RESIDUAL CUSTOMER-SETTLEMENT CLIENT-COMPLETION RISK — P2`
   - Truth may commit once while the connected page stays on `Processing...`; independent read and reload recover it.
5. `KNOWN RESIDUAL SUPPLIER-PAYMENT CLIENT-SETTLEMENT RISK — P2`
   - Truth may commit once while the original page stays on `Recording...`; independent read and reload recover it.
6. `ACCEPTED WITH LIMITED CASHIER COVERAGE — P2`
   - Source permissions were reviewed, but authenticated cashier production acceptance was unavailable.

## Closed P2 Truth

`LIVE-EXPENSE-RESTORE-AUDIT-001` is fixed and production-verified.

- PR #317 delivered source squash `c823af4552b4841d776533bdabb770c6abb93a00`.
- The original reviewed source head was `afde45b53ddbe8c03956327dbaf7bd9427c8db2a`.
- The owner-review source head was `51137c4a749023ed3e2a5fa73d403a4590a1ad03`.
- Authenticated deployment `2HoXqm32LeSRZh89axEc6CDcr69h` processed
  marker `LIVE-EXP-RESTORE-AUDIT-20260729-0132-L8YQ`.
- One genuine Restore produced exactly one `expenses.restored` audit with the
  correct actor, organization, branch, expense ID, details, and metadata.
- Amount, category, payment method, vendor, notes, creator, and timestamp were
  preserved. Dashboard, Reports, Net Cash, and Cash Drawer reconciled.
- Duplicates were zero and the final expense remained archived.
- PR #318 recorded the live result from head
  `98dff8d5b5f7847bf48adbbaf72f24e390ef91cb` in focused documentation
  squash `2b55443e5fafd6a1f76181b6e42b4748e0b53f8d`.
- Final focused deployment `F2ukbJu7Q1TrSmc7pruom1YAQKyo` is Ready/current.
- Live evidence:
  `/Users/sw12/Projects/saledock-local-evidence/expense-restore-audit-live-verification`,
  manifest SHA-256
  `94ed2ece32d3bf795a45aee61586b8909ade59dd635a545606c8da65dcc742c4`.

Do not reopen the missing-audit finding without contradictory evidence.
Expense Restore settlement and Reset presentation remain separate open P3
observations.

`LIVE-CUSTOMER-AUDIT-001` is fixed and production-verified.

- PR #320 delivered reviewed source head
  `16f1fa9037ad998e4f8005eab17f4f44dcd9b8b8` as squash
  `31e20a58d36657d9bca00ed13aa09c5b07711059`.
- Production deployment `Dn4teeYnjpW2eKEYwFfuvSvgxzde` was Ready/current
  before both evidence sessions.
- The first marker `LIVE-CUSTOMER-AUDIT-20260729-0421-911A` is retained as an
  incomplete acceptance: PKR 500 was not visibly established, PKR 0
  persisted, and no Credit Limit defect was inferred.
- The fresh marker `LIVE-CUSTOMER-AUDIT-RERUN-20260729-0447-17BE` visibly
  established and persisted PKR 500 on create and PKR 600 on update.
- Exact successful lifecycle totals were one create audit, one update audit,
  two archive audits, and one Restore audit. An identical no-op update created
  no row change or audit.
- Audits contained safe field names and transition metadata without raw phone,
  email, address, or Notes values.
- Both marked customers remain archived with balance PKR 0. Marker financial
  rows were zero; Net Cash, Cash Drawer, stock/FIFO, supplier dues, and open
  shifts were unchanged.
- PR #321 recorded the live result from head
  `ade6527a9bca4e3ebdc7f3d10e87fa3238a01813` in focused documentation
  squash `157c0181fbe8c4cf79d0904e3a39a5443df57288`.
- Final focused deployment `DzCZELXPyhHwRBfZaH2MLwTUe58w` is Ready/current.

Do not reopen lifecycle auditing without contradictory evidence.
Customer-settlement client completion remains a separate open P2 finding.

`LIVE-CUSTOMER-LEDGER-001` is fixed and production-verified.

- PR #323 delivered reviewed source head
  `c94390bfbb6286cdadb3f3a5d733c3ef95dd67e8` as squash
  `4b68e379ed5b4e60c9dbbef9e6fe53dd32c90266`.
- Production deployment `GuqL5ytTPBn93zHrXpxEsotPgX33` was Ready/current
  for authenticated read-only verification.
- Retained customer `0dd1406a-ed51-4ff4-9f30-24a32b2d2ac4` kept one PKR 150
  invoice debit, one PKR 150 Credit Payment, and final balance PKR 0.
- `INV-100361` now routes through invoice ID
  `d78ef3f5-7480-4e40-a330-38ec7791028b`, not historical ledger-entry ID
  `432d7aef-7214-41d7-ae05-0d04c228248e`.
- The Returns & refunds history shows completed `RET-001006` with exact return
  and invoice links, PKR 150 subtotal, and PKR 150 Card refund.
- No synthetic fully-paid-return debt row was added. Duplicate ledger and return
  rows were zero, and production mutations were zero.
- Desktop, 390×844, and 320×568 presentation checks passed.
- Live evidence:
  `/Users/sw12/Projects/saledock-local-evidence/customer-ledger-presentation-live-verification`,
  manifest SHA-256
  `85e4dbacd4f9fd9f6b753c655d45d0035e7db22c6cee7c9747f7bdb4fd5084ec`.
- PR #324 recorded the live result from head
  `8d210692893d5010fcfafd12f44422ba451bc5dd` in focused documentation
  squash `d15530cca701b597c81778e7b984627d959fe6fc`.
- Final focused deployment `Ayagpz9EfpCcYbX3fEYPR2jdpsyC` is Ready/current.

Customer ledger presentation and reference routing are fixed without changing
customer debt accounting. Customer-settlement client completion remains open.

## Repair Customer Tenant Integrity Truth

`REPAIR-CUSTOMER-TENANT-INTEGRITY-001` is fixed and production-verified.

- It was discovered during the retained optional-field investigation, which
  created a synthetic cross-organization repair/customer link and stopped the
  optional correction under a temporary active P1 finishing block.
- PR #326 delivered reviewed head
  `446d08e7c88f981e418391103abe03a2dc4b7eae` as squash
  `12de0dd189d0c41895e4da5ca06bd880d17ee98b`.
- Migration `20260729133000_enforce_repair_customer_tenant_integrity.sql`
  (`20260729133000`) was delivered exactly once automatically after merge.
- The durable production invariant is a validated composite repair/customer FK:
  `(organization_id, customer_id) -> customers(organization_id, id)`.
- Production preflight and post-migration mismatch counts were 0. The
  rollback-only cross-tenant probe failed with `23503` and fully rolled back.
- No persistent production fixture or business mutation remained.
- PR #327 recorded the live result from head
  `98375cb4e79cc364f6baf4da91d2c1b286645af6` in documentation squash
  `8afbc37751a76edb93d52175146be6dbb619a0a3` and final deployment
  `GooqVaWAfTVhunUU1eYFyBLguiDx`.

Do not reopen tenant integrity without contradictory evidence. Optional repair
field validation was later fixed without changing the tenant application or
migration source. Repair-status auditing, permissions, settlement, accounting,
stock/FIFO, and Cash Drawer behavior were not changed.

## Repair Optional Fields And Create-Audit Truth

`LIVE-REPAIR-OPTIONAL-001` and `REPAIR-CREATE-AUDIT-DURABILITY-001` are fixed
and were verified in authenticated production.

- PR #329 delivered reviewed head
  `1da2887aabcf2736a258d089b8120b386d1011dc` as squash
  `62ee3a9ea985fc7b9016bddfb1161b51f80d1efa`.
- Blank optional customer UUID, text, and Expected Delivery values now normalize
  to the established empty representation. Nonblank Expected Delivery requires
  an exact real Gregorian `YYYY-MM-DD`; valid leap day remains accepted.
- The retained 28-case matrix established and guarded the correction. No Repair
  form source or migration changed.
- Optional-field source evidence:
  `/Users/sw12/Projects/saledock-local-evidence/repair-optional-fields-fix`,
  manifest SHA-256
  `bb3b253cf534e851ae8e595c3f97357d5c2c88d64af5232c49ce1edb53f3b047`.
- The first production run retained marker
  `LIVE-REPAIR-OPTIONAL-20260802-1553-6860`, repair `RJ-000004`, ID
  `ee8365bc-e341-450e-b1aa-ee18c47ada8e`. Optional values were correct, but the
  create audit was absent. The repair remains cancelled and must not be edited,
  deleted, restored, or backfilled.
- First live evidence:
  `/Users/sw12/Projects/saledock-local-evidence/repair-optional-fields-live-verification`,
  manifest SHA-256
  `a506e5d8ebc99b42689bb140ad10bda6d0c03b0058a2ec825a9f1c791e5c9e65`.
- PR #330 delivered reviewed head
  `14e920925bb5586b1923b6c9d2d8eb59615267c7` as squash
  `de94a0e59de20c51e7c77cdbfa2fe496d30019e9`.
- The save path now checks initial-history completion, awaits and checks a
  caller-local create/update audit insert, and returns success only after that
  audit completes. A post-save audit failure reports safe partial-save truth,
  the exact repair ID, and a no-resubmit instruction; it never retries,
  duplicates, deletes, or compensates the repair.
- Source evidence:
  `/Users/sw12/Projects/saledock-local-evidence/repair-create-audit-durability-fix`,
  manifest SHA-256
  `c6fd90f8791ef32fa916e1de784ad1bec0358fcbacce45c8138c603f4e8bc08b`.
- The global audit helper and `updateRepairStatusAction` remain unchanged.
- The successful rerun retained marker
  `LIVE-REPAIR-OPTIONAL-RERUN-20260803-0504-91FB`, repair `RJ-000005`, ID
  `0d979a61-9d6a-41bd-91f8-d1e14a83e41b`. One repair, one initial history, and
  one exact `repairs.created` audit completed before success. Optional blanks,
  customer null, Expected Delivery null, privacy, tenant, duplicate, and
  financial checks passed. The repair remains cancelled.
- Successful rerun evidence:
  `/Users/sw12/Projects/saledock-local-evidence/repair-optional-fields-live-verification-rerun`,
  manifest SHA-256
  `64e1bf6d9619df9230854c02e44654d115ea58ebfb1e9131e537212e6703d8df`.
- Create-audit privacy remains limited to the existing customer display name
  and device type. Phone, serial/IMEI, problem description, Notes, and
  accessories are excluded.
- Both cancellations happened to persist one status audit. Do not infer status
  audit durability from those observations.
- PR #331 recorded the focused closure from head
  `28e4fea5fd70109583987a797deaf250e8b9eab7` in documentation squash
  `85031fe8bf32a02f7bcf93b63a2e65752dd354df` at
  `2026-08-03T00:25:33Z`. PR/main CI runs `30774353255` and `30774455143`
  succeeded, and deployment `3g68nELcKAKV1hjz6rwbTFHycTNC` became current.

Tenant integrity remains fixed. No migration, schema, status, permission,
settlement, accounting, Dashboard, Reports, stock/FIFO, or Cash Drawer behavior
changed in the optional-field or create-audit deliveries.

The closure decisions are `PASS — LIVE-REPAIR-OPTIONAL-001 FIXED` and
`PASS — REPAIR-CREATE-AUDIT-DURABILITY-001 FIXED`.

## Settlement Waiver Boundaries

Customer settlement and supplier payment are not fixed.

A residual settlement is acceptable only when:

- exactly one server action succeeds;
- exact accounting truth commits once;
- exactly one expected audit/ledger entry exists;
- no duplicate write exists;
- an independent authenticated read shows the truth;
- one manual reload recovers the original page;
- no money, organization, permission, or tenant error exists.

Never resubmit a transaction merely because the original connected page remains
pending. A missing, duplicate, incorrect, or unrecoverable business state is not
covered by the waiver.

Historical/intermittent Expense client completion remains a P3 observation.
The missing Restore audit is fixed; that closure does not change the settlement
or Reset presentation boundaries.

Customer lifecycle auditing and customer ledger presentation are fixed. Pending
create/update and initially stale Restore presentation in the successful
customer run remain inside the existing customer-settlement client-completion
boundary; they do not create a new P3 or close the customer-settlement P2.

## Active P3 Observations

1. Historical/intermittent Expenses original-page settlement delay.
2. Expense Restore original-page settlement recovery.
3. Expense Reset date-field presentation.
4. Daily Closing hydration and print-footer noise.
5. Narrow mobile invoice-title/summary-label wrapping.

These are not P1 findings unless new evidence shows money, tenant, permission,
stock, or recovery harm.

## Durable Auth And Permission Rules

- Next.js 16 uses `src/proxy.ts`; do not create `middleware.ts`.
- Never infer production role coverage from source contracts alone.
- Owner routes passed authenticated production acceptance without cross-organization exposure.
- Cashier policy remains restrictive: POS and invoice viewing are allowed; catalog and customers are read-only; Repair creation is allowed while Repair editing/status is restricted; Expenses is restricted/read-only; Reports, Users, Settings, Audit Log, Returns, and Cash Drawer open/close remain unavailable as defined.
- No authenticated cashier production session was available on July 26.
- Never invite, reset, or impersonate an account merely to fill a coverage gap.

## Cache And Server-Action Rules

- A successful database commit does not prove client settlement.
- Retain evidence before classifying a stalled Server Action.
- Do not use open RSC stream completion, `requestfinished`, or `response.finished()` as business success gates.
- Verify one submission, one write, one audit, pending settlement, success/error state, rendered truth, independent truth, and duplicates separately.
- Do not force-clear pending with timers, fake success, or resubmit automatically.
- Revalidation and refresh changes require focused regression across the affected Dashboard and list/detail surfaces.

## UI, Mobile, And Print Rules

- Important mobile controls should provide a visible approximately 44px touch target.
- Preserve keyboard focus, Enter/Space activation, Escape behavior, focus restoration, disabled state, and pending state.
- Avoid page-level horizontal overflow and bottom-navigation obstruction.
- True authenticated 390×844 and 320×568 acceptance passed without page-level horizontal overflow.
- Soft-keyboard overlap was unavailable to measure and remains a coverage boundary.
- Invoice A4 preview is complete and unclipped.
- Invoice 80mm preview currently adds one blank trailing page.
- Reports, Returns, and Repairs retain their focused print contracts and historical evidence.
- Physical printer behavior must never be inferred from browser preview alone.

## Protected Worktrees And Archives

- Always enumerate worktrees and dirty/untracked files before work.
- Required historical protection: 21 worktrees and 26 dirty/untracked files.
- Expanded current protection baseline: 22 worktrees and 27 dirty/untracked
  files.
- Broader inventory before this synchronization: 50 worktrees and 28
  dirty/untracked entries. The authorized clean
  `docs/canonical-repair-optional-audit-sync` worktree raises the in-task total
  to 51 while dirty/untracked entries remain 28.
- Expenses diagnostic SHA-256: `0ce14eaefb061454eb2fc0c1d3ad39dc0c3a9e6f3a79d2eb761185a88cf45715`.
- Customer-settlement diagnostic SHA-256: `a1e81833205e4916d8683a91fa3b85a922d2b4013e9e8e7cb3269241425257af`.
- Twenty-nine historical archives were verified before their ephemeral `/tmp` copies expired.
- Forty-three historical archives remain unavailable.
- Do not restore, reconstruct, or claim physical availability for missing archives.
- Never reset, clean, stash, switch, delete, overwrite, or reuse a protected worktree.

## Primary Finishing Evidence

- Path: `/Users/sw12/Projects/saledock-local-evidence/live-finishing-continuation-2026-07-26`
- Marker: `FINISHING-CONT-20260726-2022-2B42`
- Manifest SHA-256: `90f9cd57b810a29eb554a283b43a11281e0e1f6c5c7fab3f60bdb949eca34429`
- Manifested files: 58
- Screenshots: 42
- Secret scan: passed

Supporting evidence confirms chronology. Do not rewrite earlier workflows as if
every one was rerun on July 26.

## Recent Fixed P1 Chronology

Do not reopen these results without contradictory evidence:

- Opening stock/FIFO atomicity: source `da40ad2b846f69736231dfba9f8e46f013f6d247`, docs `2f71c5c0db0e2e799032087cd3077ab8c204e058`.
- Supplier purchase number generation: source `857556f173383efd66cbbf3f96448d0562cc8bc6`, docs `afaef696aa7df08cd1e18965e5770f7e00189bb9`. Supplier-payment settlement remains P2.
- Expense timestamp preservation: source `03eeda4a014852d294bc790b81c308d716802221`, docs `191c1a83229c0ad4aaeab97922b07be499e60f54`.
- Return-profit reconciliation: source `68a86398f91cbfd240f8d3818c6bb866a4da2266`, docs `6542ab0577a02feaca26df9ac9dcb528f0caa564`.
- Dashboard net-cash reconciliation: source `8f8202a428a88bd8d72d178facbafb775eb1abf8`, docs `0b94dcb072a204539aa4608d53e0237a77c058fe`.
- Repair/customer tenant integrity: source `12de0dd189d0c41895e4da5ca06bd880d17ee98b`, docs `8afbc37751a76edb93d52175146be6dbb619a0a3`; migration version `20260729133000`, production mismatch 0, and rollback-only probe `23503`.

## Historical Facts Worth Keeping

- PR #303 fixed the Expenses mobile touch targets and Void guidance. It is historical, not the current production baseline or next task.
- PR #317 and source squash `c823af4552b4841d776533bdabb770c6abb93a00`
  fixed the missing Expense Restore audit; PR #318 and documentation squash
  `2b55443e5fafd6a1f76181b6e42b4748e0b53f8d` recorded the authenticated
  production pass.
- PR #320 and source squash `31e20a58d36657d9bca00ed13aa09c5b07711059`
  fixed customer lifecycle auditing; PR #321 and documentation squash
  `157c0181fbe8c4cf79d0904e3a39a5443df57288` recorded the authenticated
  production closure while leaving customer ledger and settlement open at
  that dated point.
- PR #323 and source squash `4b68e379ed5b4e60c9dbbef9e6fe53dd32c90266`
  fixed customer ledger references and return/refund presentation; PR #324 and
  documentation squash `d15530cca701b597c81778e7b984627d959fe6fc`
  recorded the read-only production closure while leaving settlement open.
- PR #326 and source squash `12de0dd189d0c41895e4da5ca06bd880d17ee98b`
  fixed repair/customer tenant integrity; PR #327 and documentation squash
  `8afbc37751a76edb93d52175146be6dbb619a0a3` recorded the production closure.
- PR #329 and source squash `62ee3a9ea985fc7b9016bddfb1161b51f80d1efa`
  fixed blank optional repair fields and strict Expected Delivery validation.
- PR #330 and source squash `de94a0e59de20c51e7c77cdbfa2fe496d30019e9`
  made Repair Intake create auditing durable. PR #331 and documentation squash
  `85031fe8bf32a02f7bcf93b63a2e65752dd354df` recorded the authenticated
  closure while leaving repair-status audit durability open.
- Reports, Returns, and Repairs print fixes retain their recorded local evidence.
- MN-007 remains a development-only CSP/hydration observation in the environments tested.
- Older mobile-native audit counts describe their dated finding set. They are not the current finishing P2/P3 register.

## Immediate Next Task

Investigate `KNOWN RESIDUAL REPAIR-STATUS AUDIT DURABILITY RISK — P2` only.

Keep it separate from:

- Repair Intake optional normalization or create auditing, which are closed;
- customer or supplier settlement;
- invoice filters or print;
- another P2 or P3 finding;
- cashier coverage.

Create a fresh worktree from the then-current main. Inspect
`updateRepairStatusAction` and `logAudit`, then deterministically prove whether
delayed completion, returned insert errors, and thrown errors can allow status
success before durable audit persistence. Preserve the existing business transition,
history, optional normalization, tenant integrity, role, accounting, stock/FIFO,
Cash Drawer, cleanup, and duplicate contracts. Do not create or mutate a
production repair during the review-first investigation.

## Standing Safety Rules

- Review first; change the smallest proven source surface.
- Never weaken accounting, permission, tenant, cleanup, or duplicate assertions.
- Never mutate production unless the owner explicitly authorizes the exact bounded workflow.
- Never print or store secrets, credentials, cookies, tokens, private contact details, or raw authorization metadata.
- Public HTTP proves availability only.
- Keep documentation-only, source, migration, and production-verification work in separate pull requests.
- Current classification remains **FINISHING ACCEPTED WITH LIMITED COVERAGE**, not audit-ready and not MVP-live.
