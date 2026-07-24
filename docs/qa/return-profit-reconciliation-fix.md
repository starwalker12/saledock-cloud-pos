# Returned-Sale Profit Reconciliation

## Status

- Finding: `LIVE-REPORT-RETURN-PROFIT-001`
- Severity: P1
- Status: fixed only on draft branch `fix/return-profit-reconciliation`
- Production: unchanged
- Migration: none
- Production mutation during this task: none

Finishing remains blocked. `LIVE-DASHBOARD-NET-CASH-001` is a separate open P1 and is not changed here. The remaining P2/P3 findings and canonical project synchronization remain outside this focused draft.

## Production Evidence

The authenticated production audit recorded invoice `INV-100361` and return `RET-001006`. A product with PKR 100 original FIFO cost sold for PKR 150, then received a full PKR 150 Card refund and was restocked. Aggregate stock and FIFO quantity both returned to their opening value of four, there were no duplicate business records, and active expenses were zero. The sale and return should therefore have had a net profit effect of zero, but Dashboard displayed PKR -100.

The original arithmetic was:

```text
original margin 50 - refund 150 = -100
```

The correct restocked-return arithmetic is:

```text
original margin 50 - refund 150 + restored FIFO cost 100 = 0
```

The live evidence marker was `FINAL-QA-20260723-2346-P19S`. It was inspected read-only from the accepted evidence bundle; no production account or data was used by this correction task.

## Local Baseline

A production-mode browser run against loopback Supabase reproduced the defect with a fresh disposable product:

- Opening stock and FIFO quantity: 4
- Original FIFO unit cost: PKR 100
- Sale price and full Card refund: PKR 150
- Sale profit contribution: Dashboard +50, Reports +50
- Return allocation: quantity 1 at exact unit cost 100
- Stock and FIFO after restock: restored to 4
- Baseline after return: Dashboard -100, Reports -100
- Page, console, request, HTTP, and native-dialog errors: 0
- Generated rows after cleanup: 0
- Unrelated safety signatures: unchanged

Discarded harness launches occurred before any business mutation while the local safety-table inventory, local owner fixture, and an ambiguous Reports heading locator were corrected. They are not accepted product evidence.

## Root Cause

Outcome A, missing restocked COGS reversal, was established.

Dashboard and Reports already:

1. derive the original product margin from invoice-item revenue and cost;
2. select completed returns in the current organization, branch, and Karachi date range;
3. subtract the completed refund amount.

Neither path read the exact FIFO cost restored by the return. The return RPC already records that amount in `return_stock_allocations` using the original sale allocation's stock lot, quantity, and unit cost. The correction reads those allocations for the already-scoped completed return IDs and adds `quantity * unit_cost` to profit.

This is a reporting-only read. It does not change return creation, refund values, invoice cost, FIFO restoration, stock movements, payments, customer balances, permissions, or database state. Current product catalog cost is never used as a fallback.

## Accounting Semantics

- Full restocked return: `50 - 150 + 100 = 0`
- Full non-restocked return: `50 - 150 + 0 = -100`
- Two units sold, one restocked return: `100 - 150 + 100 = 50`
- Full restock with PKR 100 partial refund: `50 - 100 + 100 = 50`
- Multiple FIFO lots: sums each returned allocation's exact quantity and unit cost
- Service return: creates no product-cost restoration
- Cancelled return: excluded because only completed parent returns supply allocation IDs
- Prior-day sale and current-day restocked return: current-day effect is `-150 + 100 = -50`
- Sale inside range, return outside: retains the sale margin
- Sale outside range, return inside: includes only that return's refund and restored-cost adjustment

The calculation preserves existing JavaScript numeric behavior and performs no early monetary rounding.

## Scope And Isolation

The parent return query preserves:

- organization scope;
- optional branch scope;
- completed status;
- Karachi date/range boundaries.

The allocation query separately requires the same organization and only the selected completed return IDs. Reports return-item quantity reads are also explicitly organization-scoped.

Dashboard and Reports now use the same pure calculation:

```text
gross profit
- active expenses
- completed return refunds
+ exact restored FIFO cost
- applicable credit write-offs
```

The visible profit breakdowns disclose the positive restocked FIFO cost so the displayed total remains arithmetically explainable.

## Verification

Focused source/accounting contracts cover:

- full restocked and non-restocked returns;
- partial return and partial refund;
- multiple FIFO costs and allocation quantity;
- service returns and no-return behavior;
- expenses and write-offs exactly once;
- same-day, cross-day, and cross-range effects;
- completed-status, organization, branch, and date scoping;
- exact `return_stock_allocations.quantity * unit_cost` source;
- no catalog-cost fallback or reporting mutation;
- visible explanatory Dashboard and Reports breakdowns;
- no net-cash, return-mutation, package, lockfile, or migration change.

The accepted corrected production-mode browser run proved:

- sale contribution: Dashboard +50, Reports +50;
- completed restocked return result: Dashboard 0, Reports 0;
- allocation: quantity 1 at unit cost 100;
- stock/FIFO restoration, customer balance, non-cash behavior, and duplicate safeguards remained intact;
- cleanup removed every disposable row and matching audit;
- all unrelated signatures remained equal.

Three corrected browser runs reached the same correct financial result but each observed one transient local Supabase Auth `TypeError: Failed to fetch` console event. Each was discarded and manually rerun without Playwright retry. Three accepted runs, including the final corrected custom-date-range run, had zero page, console, request, HTTP, or dialog errors. This is reported as a local-auth flake, not a clean first-pass result.

A mixed legacy browser regression launch initially skipped six tests because credentials were intentionally absent; its four safe dedicated cases passed. A read-only credentialed follow-up exposed four unrelated strict-locator ambiguity failures in Cash Drawer, Settings, Users, and Reports plus one POS smoke locator ambiguity before checkout. The POS case performed no business write. Those stale legacy locators are not changed in this focused accounting PR; the dedicated product/FIFO, customer, Expenses, and return-profit workflows provide the accepted regression evidence.

Repository lint, typecheck, build, focused tests, relevant regressions, the complete Node suite, diff checks, secret scan, and protected-state comparison are recorded in the draft PR after completion. Browser and PDF evidence is local, not GitHub CI, Vercel, or production evidence.

## Preview And Delivery

Vercel Preview is used read-only unless its data environment is independently proven isolated from production. No preview mutation is authorized merely because a deployment is available.

Delivery remains:

1. owner review of the draft PR;
2. separate merge authorization;
3. post-merge deployment verification;
4. authenticated production verification only under a new explicit authorization;
5. later canonical documentation synchronization.

## Remaining Risk

- `LIVE-DASHBOARD-NET-CASH-001` remains open and unchanged.
- Supplier-payment and Expenses client-settlement findings remain open.
- Other accepted P2/P3 findings remain outside this correction.
- No physical or production verification is claimed by the local run.

## Rollback

Before merge, close the draft PR and delete the remote fix branch if the correction is rejected.

If a later authorized merge must be reverted:

```bash
git revert <merge_commit_sha> && git push origin main
```
