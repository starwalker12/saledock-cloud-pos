# 02 — Current State (LIVING — keep this updated)
*Last updated: 26 July 2026 by the canonical finishing-acceptance synchronization.*

## Current Repository And Production

- Repository: `https://github.com/starwalker12/saledock-cloud-pos.git`
- Canonical synchronization base: `0b94dcb072a204539aa4608d53e0237a77c058fe`
- Latest application-behavior commit: `8f8202a428a88bd8d72d178facbafb775eb1abf8`
- Latest behavior change: `fix: reconcile dashboard net cash by payment method`
- Production deployment: `dpl_5zVLpG4mTcvgxr3Xd76voXxY6CNA`
- Deployment state: Ready and current for the synchronization base
- Production identity verified: Fardan Aatir, Owner, Star Shop, Main Branch, PKR, Asia/Karachi

This documentation PR completes the canonical synchronization for the authenticated
July 26 finishing acceptance. It changes documentation only.

## Current Classification

**FINISHING ACCEPTED WITH LIMITED COVERAGE**

- P0 active: **0**
- P1 active: **0**
- P2 active findings or coverage limits: **9**
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

1. `LIVE-CUSTOMER-LEDGER-001`
   - Source balances and transactions reconcile.
   - Return/refund presentation is absent.
   - The `INV-100361` reference targets a ledger-entry UUID instead of the invoice ID.
   - No accounting or tenant-isolation error was found.
2. `LIVE-CUSTOMER-AUDIT-001`
   - The Credit Payment audit exists with the correct actor and organization.
   - Customer create, update, and archive lifecycle audits are absent.
3. `LIVE-REPAIR-OPTIONAL-001`
   - Fields presented as optional can reject blank input with `Invalid UUID`.
   - The rejected attempts created zero repair rows and zero audits.
   - A valid explicitly filled repair workflow completed safely.
4. `LIVE-EXPENSE-RESTORE-AUDIT-001`
   - Restore committed once and exact expense truth recovered after one reload.
   - No duplicate occurred.
   - No Restore audit was produced.
5. `LIVE-INVOICE-FILTER-001`
   - Invoice search, date, payment-method, status, and Reset controls are absent or materially incomplete.
   - Invoice detail and retained financial truth are correct.
6. `LIVE-INVOICE-THERMAL-BLANK-PAGE-001`
   - The 80mm invoice preview contains correct content on page one and one blank trailing page.
   - The A4 preview is complete and unclipped.
7. `KNOWN RESIDUAL CUSTOMER-SETTLEMENT CLIENT-COMPLETION RISK — P2`
   - Server and accounting truth can commit exactly once while the original connected page remains on `Processing...`.
   - An independent page and one reload recover the correct truth.
   - The exact intermittent trigger remains unproven; the issue is not fixed.
8. `KNOWN RESIDUAL SUPPLIER-PAYMENT CLIENT-SETTLEMENT RISK — P2`
   - Server and accounting truth can commit exactly once while the original page remains on `Recording...`.
   - An independent page and one reload recover the correct truth.
   - The issue is not fixed.
9. `ACCEPTED WITH LIMITED CASHIER COVERAGE — P2`
   - Permission contracts were reviewed.
   - No authenticated cashier session or approved credentials were available.
   - No cashier financial mutation was performed.

## Active P3 Observations

1. Historical/intermittent Expenses original-page settlement delay when server truth is correct.
2. Expense Restore original-page settlement recovered after reload.
3. Expense Reset date-field synchronization/presentation issue.
4. Daily Closing hydration and print-footer noise while cash truth remains correct.
5. Narrow mobile invoice-title ellipsis and summary-label wrapping.

## Authenticated Finishing Result

Primary evidence:

- Path: `/Users/sw12/Projects/saledock-local-evidence/live-finishing-continuation-2026-07-26`
- Marker: `FINISHING-CONT-20260726-2022-2B42`
- Manifest SHA-256: `90f9cd57b810a29eb554a283b43a11281e0e1f6c5c7fab3f60bdb949eca34429`
- Manifested files: 58
- Screenshots: 42
- Secret scan: passed

Production phases:

- Customer balance truth reconciled; the ledger and audit P2 gaps remain.
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

| Area | Source merge | Documentation merge | Authenticated production result |
| --- | --- | --- | --- |
| Opening stock and FIFO atomicity | `da40ad2b846f69736231dfba9f8e46f013f6d247` | `2f71c5c0db0e2e799032087cd3077ab8c204e058` | Opening stock, movement, FIFO lot, and atomic consistency passed. |
| Supplier purchase number generation | `857556f173383efd66cbbf3f96448d0562cc8bc6` | `afaef696aa7df08cd1e18965e5770f7e00189bb9` | Purchase number, stock/FIFO, supplier due, and Card settlement passed. Supplier-payment client settlement remains P2. |
| Expense timestamp preservation | `03eeda4a014852d294bc790b81c308d716802221` | `191c1a83229c0ad4aaeab97922b07be499e60f54` | Karachi conversion, timestamp preservation, intentional conversion, and report date passed. |
| Return-profit reconciliation | `68a86398f91cbfd240f8d3818c6bb866a4da2266` | `6542ab0577a02feaca26df9ac9dcb528f0caa564` | Full restocked return, exact restored FIFO cost, Dashboard profit, and Reports profit reconciled. |
| Dashboard net-cash reconciliation | `8f8202a428a88bd8d72d178facbafb775eb1abf8` | `0b94dcb072a204539aa4608d53e0237a77c058fe` | Card sale/refund net cash stayed zero; Cash sale/refund moved +150/-150; starting float stayed excluded; shift reconciled 1,000/1,000/0. |

## Protection And Archive Reality

- Required historical protection: 21 worktrees and 26 dirty/untracked files.
- Broader opening inventory: 33 worktrees and 28 dirty/untracked files.
- Expenses diagnostic SHA-256: `0ce14eaefb061454eb2fc0c1d3ad39dc0c3a9e6f3a79d2eb761185a88cf45715`
- Customer-settlement diagnostic SHA-256: `a1e81833205e4916d8683a91fa3b85a922d2b4013e9e8e7cb3269241425257af`
- Twenty-nine historical archives were previously verified; their ephemeral `/tmp` copies expired.
- Forty-three historical archives remain unavailable.
- No missing archive was restored, reconstructed, or represented as physically available.

Always enumerate and fingerprint current worktrees before new work. Never reset,
clean, stash, switch, overwrite, or delete a protected worktree.

## Immediate Next Task

Perform one focused review-first investigation and correction of:

`LIVE-EXPENSE-RESTORE-AUDIT-001`

Reason:

- It is a bounded missing audit for a money-bearing expense state transition.
- Expense amount, timestamp, report, and Cash Drawer truth were correct.
- The source correction must remain separate from client settlement and Reset presentation work.

Do not combine another P2 finding or settlement/reset presentation correction into
that task.

## Evidence Boundaries

- The July 26 finishing result used authenticated production browser evidence and read-only database verification where recorded.
- Supporting evidence confirms chronology; it does not mean every historical workflow was rerun on July 26.
- Public HTTP availability does not prove an authenticated workflow.
- The canonical synchronization itself performs no production mutation and changes no application source, test, migration, package, workflow, configuration, or schema.
- SaleDock is not audit-ready and not MVP-live.
