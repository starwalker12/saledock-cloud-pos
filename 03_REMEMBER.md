# 03 — Remember For The Future — SaleDock Cloud POS
*Durable memory. Last updated: 29 July 2026 after authenticated Expense Restore audit closure.*

## Who Fardan Is

- Fardan Aatir is the non-technical owner of SaleDock Cloud POS.
- Production identity: Owner, Star Shop, Main Branch, PKR, Asia/Karachi.
- Explain business and safety impact plainly.
- Use review-first branches and pull requests for source changes.
- Never ask for credentials in chat.

## Current Durable Status

- Canonical synchronization base: `2b55443e5fafd6a1f76181b6e42b4748e0b53f8d`.
- Latest application-behavior commit: `c823af4552b4841d776533bdabb770c6abb93a00`.
- Latest focused documentation commit: `2b55443e5fafd6a1f76181b6e42b4748e0b53f8d`.
- Production deployment: `F2ukbJu7Q1TrSmc7pruom1YAQKyo`, Ready/current for the synchronization base.
- Classification: **FINISHING ACCEPTED WITH LIMITED COVERAGE**.
- P0 active: **0**.
- P1 active: **0**.
- P2 findings or coverage limits: **8**.
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

Keep all eight items independently visible:

1. `LIVE-CUSTOMER-LEDGER-001`
   - Balances reconcile, but return/refund presentation is absent.
   - `INV-100361` targets a ledger-entry UUID instead of the invoice ID.
2. `LIVE-CUSTOMER-AUDIT-001`
   - Credit Payment audit exists; customer create, update, and archive audits are absent.
3. `LIVE-REPAIR-OPTIONAL-001`
   - Blank fields presented as optional can fail with `Invalid UUID`; rejected attempts wrote nothing.
4. `LIVE-INVOICE-FILTER-001`
   - Search/date/payment/status/Reset controls are absent or materially incomplete.
5. `LIVE-INVOICE-THERMAL-BLANK-PAGE-001`
   - 80mm content is correct on page one, with one blank trailing page; A4 is complete.
6. `KNOWN RESIDUAL CUSTOMER-SETTLEMENT CLIENT-COMPLETION RISK — P2`
   - Truth may commit once while the connected page stays on `Processing...`; independent read and reload recover it.
7. `KNOWN RESIDUAL SUPPLIER-PAYMENT CLIENT-SETTLEMENT RISK — P2`
   - Truth may commit once while the original page stays on `Recording...`; independent read and reload recover it.
8. `ACCEPTED WITH LIMITED CASHIER COVERAGE — P2`
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

## Active P3 Observations

1. Historical/intermittent Expenses original-page settlement delay with correct server truth.
2. Expense Restore original-page settlement recovered after reload.
3. Expense Reset visible date fields can retain stale presentation after route reset.
4. Daily Closing hydration and print-footer noise can appear while cash truth remains correct.
5. Narrow mobile invoice-title ellipsis and summary-label wrapping.

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
- Broader pre-task inventory for the 29 July synchronization: 36 worktrees and
  28 dirty/untracked files.
- The new clean canonical synchronization worktree is authorized separately,
  bringing the in-task worktree total to 37.
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

## Historical Facts Worth Keeping

- PR #303 fixed the Expenses mobile touch targets and Void guidance. It is historical, not the current production baseline or next task.
- PR #317 and source squash `c823af4552b4841d776533bdabb770c6abb93a00`
  fixed the missing Expense Restore audit; PR #318 and documentation squash
  `2b55443e5fafd6a1f76181b6e42b4748e0b53f8d` recorded the authenticated
  production pass.
- Reports, Returns, and Repairs print fixes retain their recorded local evidence.
- MN-007 remains a development-only CSP/hydration observation in the environments tested.
- Older mobile-native audit counts describe their dated finding set. They are not the current finishing P2/P3 register.

## Immediate Next Task

Perform one focused review-first investigation of
`LIVE-CUSTOMER-AUDIT-001`.

Keep it separate from:

- `LIVE-CUSTOMER-LEDGER-001`;
- customer-settlement client completion;
- Expense Restore settlement and Reset presentation;
- customer settlement;
- supplier payment;
- invoice filters or print;
- Repairs optional-field behavior;
- cashier coverage.

Customer create, update, and archive lifecycle audits are absent. The existing
Credit Payment audit shows that actor and organization attribution can work,
while customer balances and transactions remain correct. Keep the investigation
limited to truthful lifecycle audit coverage.

## Standing Safety Rules

- Review first; change the smallest proven source surface.
- Never weaken accounting, permission, tenant, cleanup, or duplicate assertions.
- Never mutate production unless the owner explicitly authorizes the exact bounded workflow.
- Never print or store secrets, credentials, cookies, tokens, private contact details, or raw authorization metadata.
- Public HTTP proves availability only.
- Keep documentation-only, source, migration, and production-verification work in separate pull requests.
- Current classification remains **FINISHING ACCEPTED WITH LIMITED COVERAGE**, not audit-ready and not MVP-live.
