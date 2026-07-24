# Returned-Sale Profit Reconciliation

## Status

- Finding: `LIVE-REPORT-RETURN-PROFIT-001`
- Severity: P1
- Status: fixed on main and verified in authenticated production
- Source PR: `#312`
- Reviewed source head: `f675eb5eb9dbefb9234d30a545baca8c9fca8f0f`
- Squash commit: `68a86398f91cbfd240f8d3818c6bb866a4da2266`
- Production deployment: `6F9KNdDnLWK4wq1FMbtW1mPQXQdr` (`Ready`)
- Migration: none
- Production verification: one marked Card sale and one full restocked Card return

Finishing remains blocked. `LIVE-DASHBOARD-NET-CASH-001` is a separate open P1 and is not changed here. The customer-settlement client-completion behavior remains an accepted P2 risk under the owner's bounded production waiver. Other P2/P3 findings and canonical project synchronization remain outside this focused verification.

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

Repository lint, typecheck, build, focused tests, relevant regressions, the complete Node suite, diff checks, secret scan, and protected-state comparison are recorded in source PR `#312`. That pre-merge browser and PDF evidence is local and distinct from the authenticated production verification below.

## Authenticated Production Verification

PR `#312` was squash-merged after exact-head review and successful repository checks. The resulting production main was `68a86398f91cbfd240f8d3818c6bb866a4da2266`. Vercel deployment `6F9KNdDnLWK4wq1FMbtW1mPQXQdr` reached `Ready` for that exact commit before production mutation began.

The bounded verification used the authenticated Codex Chrome session for Fardan Aatir, Owner, Star Shop, Main Branch, in PKR. It did not infer workflow behavior from public HTTP availability. The marker was:

```text
LIVE-RETURN-PROFIT-20260724-2316-1Y8M
```

### Baseline

Dashboard:

- Net Profit: PKR 0
- Gross Sales: PKR 150
- Returns: PKR 150
- Expenses: PKR 0
- Today's Net Cash: PKR 150
- Stock Valuation: PKR 324,540

Reports:

- Sales Revenue: PKR 750
- Product Cost: PKR 500
- Gross Profit: PKR 250
- Refunds: PKR 300
- Restocked FIFO Cost: PKR 200
- Estimated Net Profit: PKR 150

The physical Cash Drawer signature was PKR 0 expected cash, PKR 0 counted cash, and PKR 0 difference. No QA shift was opened.

### Marked Sale

One physical product was created at PKR 100 purchase cost, PKR 150 sale price, and opening stock four. The opening FIFO lot contained four units at PKR 100. One marked customer was created with a zero balance.

Invoice `INV-100362` sold one unit for PKR 150 by Card:

- Revenue: PKR 150
- Exact FIFO cost: PKR 100
- Profit contribution: PKR 50
- Card payments: 1
- Sale allocations: 1 at quantity 1 and unit cost PKR 100
- Product, POS, and FIFO quantity: 4 to 3
- Customer balance: PKR 0
- Physical Cash Drawer effect: PKR 0
- Duplicate invoices, payments, allocations, or audits: 0

Dashboard Net Profit increased from PKR 0 to PKR 50. Reports Estimated Net Profit increased from PKR 150 to PKR 200.

### Marked Return

Return `RET-001007` returned the one sold unit with a full PKR 150 Card refund and restocking enabled:

- Completed returns: 1
- Return items: 1 at quantity 1
- Return stock allocations: 1 at quantity 1 and unit cost PKR 100
- Exact restored FIFO cost: PKR 100
- Return stock movements: 1
- Product, POS, and FIFO quantity: 3 to 4
- Customer balance: PKR 0
- Physical Cash Drawer effect: PKR 0
- Duplicate returns, refunds, allocations, movements, or audits: 0
- Excessive second return: unavailable

The marker's final profit effect was:

```text
PKR 50 original margin - PKR 150 refund + PKR 100 restored FIFO cost = PKR 0
```

Dashboard Net Profit returned from PKR 50 to its PKR 0 baseline. Reports Refunds increased by PKR 150, Restocked FIFO Cost increased by PKR 100, and Estimated Net Profit returned from PKR 200 to its PKR 150 baseline. Dashboard and Reports therefore agreed on a zero final marker contribution. Reload preserved the Reports result.

No expense or write-off was created. Supplier dues were unchanged. Stock valuation reflected restoration of the sold unit and its exact FIFO cost.

### Separate Net-Cash Observation

Dashboard Today's Net Cash was:

- Before sale: PKR 150
- After Card sale: PKR 300
- After Card refund: PKR 300

The physical Cash Drawer remained at a zero cash delta for both Card operations. This reproduces the separate `LIVE-DASHBOARD-NET-CASH-001` P1. It does not invalidate the returned-profit correction, and no net-cash source was changed.

### Cleanup And Evidence

The marked product and customer were archived through the authenticated UI. The product retained stock four and its opening FIFO lot. The customer retained a zero balance. The invoice, invoice item, Card payment, sale allocation, completed return, return item, return allocation, stock movements, and audits remain as truthful transaction history. No unrelated record change or open QA shift was observed.

Sanitized evidence is stored outside Git at:

```text
/Users/sw12/Projects/saledock-local-evidence/return-profit-live-verification
```

The evidence manifest contains 20 verified entries and has SHA-256:

```text
e8328211fe55e60d51a0caf20a818723024f5420fa676b923c5e2b44f63c2c69
```

The evidence secret scan found no credentials, cookies, tokens, keys, passwords, or authorization headers.

## Delivery Position

- `LIVE-REPORT-RETURN-PROFIT-001` is fixed on main and verified in authenticated production.
- `LIVE-DASHBOARD-NET-CASH-001` remains the open P1.
- Customer-settlement client completion remains an accepted P2 risk; it was not fixed here.
- Supplier-payment and historical Expenses client-settlement risks remain open.
- Canonical project synchronization is not authorized by this verification.
- SaleDock is not classified as audit-ready or MVP-live.

## Remaining Risk

- `LIVE-DASHBOARD-NET-CASH-001` remains open and unchanged.
- Customer-settlement client completion remains an accepted P2 risk.
- Supplier-payment and historical Expenses client-settlement findings remain open.
- Other accepted P2/P3 findings remain outside this correction.
- No cashier production coverage or full mobile certification is claimed.

## Rollback

If the source correction must be reverted:

```bash
git revert 68a86398f91cbfd240f8d3818c6bb866a4da2266 && git push origin main
```

If this documentation update must be reverted after merge, revert its documentation-only squash commit. The archived product and customer should remain archived so the retained invoice and return history stays truthful.
