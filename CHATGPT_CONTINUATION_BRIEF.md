# SaleDock Cloud POS — Continuation Brief
*Canonical handoff after the authenticated read-only 29 July 2026 customer ledger presentation closure.*

## Owner And Production

Fardan Aatir is the non-technical owner of SaleDock Cloud POS. The verified
production identity is Fardan Aatir, Owner, Star Shop, Main Branch, PKR,
Asia/Karachi. Use plain language, review-first pull requests, strict evidence
boundaries, and no credentials in chat.

## Current Repository And Production

- Repository: `https://github.com/starwalker12/saledock-cloud-pos.git`
- Canonical synchronization base: `d15530cca701b597c81778e7b984627d959fe6fc`
- Latest application-behavior commit: `4b68e379ed5b4e60c9dbbef9e6fe53dd32c90266`
- Latest behavior change: `fix: correct customer ledger references`
- Latest focused documentation commit: `d15530cca701b597c81778e7b984627d959fe6fc`
- Production deployment: `Ayagpz9EfpCcYbX3fEYPR2jdpsyC`, Ready/current

This canonical synchronization changes documentation only. It performs no
production mutation and does not repeat the customer ledger inspection.

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

1. `LIVE-REPAIR-OPTIONAL-001` — blank fields presented as optional can reject
   with `Invalid UUID`; rejected attempts wrote nothing and a fully populated
   repair completed safely.
2. `LIVE-INVOICE-FILTER-001` — search, date, payment-method, status, and Reset
   controls are absent or materially incomplete.
3. `LIVE-INVOICE-THERMAL-BLANK-PAGE-001` — 80mm content is correct on page one
   with one blank trailing page; A4 is complete.
4. `KNOWN RESIDUAL CUSTOMER-SETTLEMENT CLIENT-COMPLETION RISK — P2` — one
   exact server/accounting commit can leave the connected page on
   `Processing...`; independent truth and one reload recover it.
5. `KNOWN RESIDUAL SUPPLIER-PAYMENT CLIENT-SETTLEMENT RISK — P2` — one exact
   server/accounting commit can leave the page on `Recording...`; independent
   truth and one reload recover it.
6. `ACCEPTED WITH LIMITED CASHIER COVERAGE — P2` — source permission contracts
   were reviewed, but authenticated cashier production acceptance was
   unavailable.

Customer and supplier settlement are not fixed. Never resubmit solely because
the original page remains pending. The waiver covers only one exact successful
commit with correct independent truth, no duplicate, and recovery after one
reload.

## Exact Active P3 Register

1. Historical/intermittent Expenses original-page settlement delay.
2. Expense Restore original-page settlement recovery.
3. Expense Reset date-field presentation.
4. Daily Closing hydration and print-footer noise.
5. Narrow mobile invoice-title and summary-label wrapping.

The customer lifecycle rerun's pending create/update pages and initially stale
Restore do not create a sixth P3. They remain within the existing
customer-settlement client-completion boundary.

## Customer Lifecycle Audit Closure

`LIVE-CUSTOMER-AUDIT-001` is closed.

- Source PR #320: reviewed head
  `16f1fa9037ad998e4f8005eab17f4f44dcd9b8b8`, squash
  `31e20a58d36657d9bca00ed13aa09c5b07711059`.
- Source deployment: `Dn4teeYnjpW2eKEYwFfuvSvgxzde`.
- The first attempt, marker `LIVE-CUSTOMER-AUDIT-20260729-0421-911A`,
  customer `9fbf4b37-47ce-4dc0-be2f-9b7e653ea508`, is retained as incomplete.
  Credit Limit PKR 500 was not visibly confirmed, PKR 0 persisted, and no
  persistence defect was inferred.
- The successful rerun, marker
  `LIVE-CUSTOMER-AUDIT-RERUN-20260729-0447-17BE`, customer
  `b970bc25-0299-455e-b6b7-c0ffb6953bb2`, visibly established and persisted
  PKR 500 on create and PKR 600 on the genuine update.
- Exact lifecycle totals: one `customers.created`, one `customers.updated`, two
  `customers.archived`, and one `customers.restored`.
- The identical no-op update created no row change or audit.
- Audits identified Fardan Aatir, Star Shop, Main Branch, and the exact customer
  ID without raw phone, email, address, or Notes values.
- Both marked customers remain archived with balance PKR 0. Marker financial
  rows were zero; Customer Dues, Net Cash, Cash Drawer, stock/FIFO, supplier
  dues, and open shifts were unchanged.
- Focused documentation PR #321: head
  `ade6527a9bca4e3ebdc7f3d10e87fa3238a01813`, squash
  `157c0181fbe8c4cf79d0904e3a39a5443df57288`, final deployment
  `DzCZELXPyhHwRBfZaH2MLwTUe58w`.

Customer lifecycle auditing is fixed. Customer-settlement client completion is
not fixed.

## Customer Ledger Presentation Closure

`LIVE-CUSTOMER-LEDGER-001` is closed.

- Source PR #323: reviewed head
  `c94390bfbb6286cdadb3f3a5d733c3ef95dd67e8`, squash
  `4b68e379ed5b4e60c9dbbef9e6fe53dd32c90266`.
- Source deployment: `GuqL5ytTPBn93zHrXpxEsotPgX33`.
- Read-only marker: `LIVE-CUSTOMER-LEDGER-20260729-1615-C409`.
- Retained customer: `0dd1406a-ed51-4ff4-9f30-24a32b2d2ac4`.
- `INV-100361` now links through invoice ID
  `d78ef3f5-7480-4e40-a330-38ec7791028b`, not historical ledger-entry ID
  `432d7aef-7214-41d7-ae05-0d04c228248e`.
- Returns & refunds now shows completed `RET-001006`, return ID
  `a473366e-6617-468b-981c-668169b2282e`, PKR 150 subtotal, and PKR 150 Card
  refund with correct return and invoice routes.
- Debt accounting remains one PKR 150 invoice debit, one PKR 150 Credit
  Payment, and final balance PKR 0. No synthetic fully-paid-return debt row
  was added.
- Duplicate ledger and return rows were zero. Production mutations were zero.
- Desktop, 390×844, and 320×568 presentation checks passed.
- Focused documentation PR #324: head
  `8d210692893d5010fcfafd12f44422ba451bc5dd`, squash
  `d15530cca701b597c81778e7b984627d959fe6fc`, final deployment
  `Ayagpz9EfpCcYbX3fEYPR2jdpsyC`.

Customer ledger presentation and reference routing are fixed. Customer debt
accounting did not change, and customer-settlement client completion remains
open.

## Evidence Boundaries

- Local source evidence:
  `/Users/sw12/Projects/saledock-local-evidence/customer-lifecycle-audit-fix`;
  manifest `50d6b1079a70f4b9848dd2e79e1c85a52874b1425cd6ddbcadd3899f708d2342`
  with 11 verified entries.
- First production evidence:
  `/Users/sw12/Projects/saledock-local-evidence/customer-lifecycle-audit-live-verification`;
  manifest `3f82d47d3926524c910eab1f601f77d82cb193b7fa71c8efbff651695483a1c0`
  with 12 verified entries.
- Successful rerun evidence:
  `/Users/sw12/Projects/saledock-local-evidence/customer-lifecycle-audit-live-verification-rerun`;
  manifest `d523c3a17c863e007df3d0c347cc8ec4d708b35e129fdfc990821de14008133e`
  with 22 verified entries and 12 screenshots.
- Focused QA record: `docs/qa/customer-lifecycle-audit-fix.md`.
- Customer ledger source evidence:
  `/Users/sw12/Projects/saledock-local-evidence/customer-ledger-presentation-fix`;
  manifest `94285126c79f43809025beb761f664faa85cf6618a0bd4407c1bac5c1d1b7d11`
  with 21 verified entries.
- Customer ledger read-only live evidence:
  `/Users/sw12/Projects/saledock-local-evidence/customer-ledger-presentation-live-verification`;
  manifest `85e4dbacd4f9fd9f6b753c655d45d0035e7db22c6cee7c9747f7bdb4fd5084ec`
  with 14 verified entries and seven screenshots.
- Customer ledger focused QA record:
  `docs/qa/customer-ledger-presentation-fix.md`.

Local evidence is not authenticated production proof. The incomplete first
attempt and successful rerun must always remain distinct.

## Durable Safety Boundaries

- Keep organization and branch scope explicit.
- Keep Cash and non-cash accounting separate.
- Preserve exact FIFO allocation costs and retained financial history.
- Customer balances and ledger entries must reconcile to transaction truth.
- Do not treat a server commit as client settlement.
- Do not resubmit while a page is pending when independent truth is available.
- Do not change payment, settlement, write-off, Cash Drawer, Dashboard,
  Reports, permissions, RLS, or schema without focused evidence.
- Public HTTP proves availability only.

## Protection And Archives

- Required historical protection: 21 worktrees and 26 dirty/untracked files.
- Broader pre-task inventory: 42 worktrees and 28 dirty/untracked files.
- The authorized canonical synchronization worktree raises the in-task total
  to 43 worktrees; dirty/untracked protected files remain 28.
- Expenses diagnostic:
  `0ce14eaefb061454eb2fc0c1d3ad39dc0c3a9e6f3a79d2eb761185a88cf45715`.
- Customer-settlement diagnostic:
  `a1e81833205e4916d8683a91fa3b85a922d2b4013e9e8e7cb3269241425257af`.
- Twenty-nine previously verified temporary archives expired from `/tmp`.
- Forty-three historical archives remain unavailable.
- None was restored, reconstructed, or represented as physically available.

Never reset, clean, stash, switch, delete, overwrite, or reuse a protected
worktree.

## Immediate Next Task

Perform one focused review-first investigation of:

`LIVE-REPAIR-OPTIONAL-001`

Blank fields presented as optional can reject with `Invalid UUID`; rejected
attempts wrote no repair row or audit, while a fully populated repair lifecycle
completed safely. Determine whether validation, form normalization, or
persistence causes the rejection. Do not combine repair status redesign,
customer or supplier settlement, or another P2/P3 finding. Do not mutate
production during the initial investigation.

## Files A New Chat Should Read

1. `02_CURRENT_STATE.md`
2. `03_REMEMBER.md`
3. `CHATGPT_CONTINUATION_BRIEF.md`
4. `docs/qa/live-finishing-continuation-acceptance-2026-07-26.md`
5. `docs/qa/customer-ledger-presentation-fix.md`
6. Relevant focused QA records only as needed

Do not require nonexistent attachments. Do not call SaleDock audit-ready or
MVP-live.
