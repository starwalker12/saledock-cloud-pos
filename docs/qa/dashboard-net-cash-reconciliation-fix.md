# Dashboard Net Cash Reconciliation Fix

Date: 2026-07-25

Finding: `LIVE-DASHBOARD-NET-CASH-001`

Severity: P1

Status: Fixed only on draft branch `fix/dashboard-net-cash-reconciliation`

Base main: `6542ab0577a02feaca26df9ac9dcb528f0caa564`

Production remains unchanged. This report does not authorize a merge, a production
mutation, canonical synchronization, finishing, or an audit-ready/MVP-live
classification.

## Production Evidence

Authenticated production verification for the completed return-profit work recorded:

- Dashboard Today's Net Cash before the marked sale: PKR 150
- after one PKR 150 Card sale: PKR 300
- after one complete PKR 150 Card refund: PKR 300
- physical Cash Drawer delta: PKR 0
- invoice: `INV-100362`
- return: `RET-001007`
- marker: `LIVE-RETURN-PROFIT-20260724-2316-1Y8M`
- duplicate count: 0
- product and customer cleanup/finalization: complete

The Card sale was presented as physical cash. The Card refund did not reverse that
incorrect increase, although the physical Cash Drawer correctly remained unchanged.

Evidence was read from:

`/Users/sw12/Projects/saledock-local-evidence/return-profit-live-verification`

Evidence manifest SHA-256:

`e8328211fe55e60d51a0caf20a818723024f5420fa676b923c5e2b44f63c2c69`

## Root Cause

The Dashboard widget derived cash from:

`state.invoices.todaySalesTotal - state.expenses.todayTotal`

That is revenue minus all-method expenses, not physical cash movement. It:

- included Card, bank, wallet, and customer-credit invoice value;
- did not distinguish payment methods;
- did not subtract completed cash refunds;
- subtracted non-cash expenses;
- did not include cash customer settlements;
- used organization-wide invoice counts rather than the branch-scoped cash contract;
- did not itself express both Karachi start and end boundaries.

The existing Daily Closing data layer already computes the correct, branch-scoped,
full-Karachi-day physical cash result:

`cash payments - cash refunds - cash expenses + cash customer settlements`

`getDayActivity` and `getShiftActivity` use the same cash components. Shift closing
adds starting cash only when calculating expected drawer cash.

Classification: Outcome A - widget formula/data-source defect.

Daily Closing and Cash Drawer arithmetic were correct. No Cash Drawer source or
mutation required a change.

## Business Contract

Metric name: Today's Net Cash

Definition: physical cash received minus cash refunds and cash expenses for the
assigned branch during the current Asia/Karachi business day.

Included:

- Cash invoice payments;
- Cash customer-credit settlements;
- completed Cash refunds;
- active Cash expenses.

Excluded:

- Card, bank, EasyPaisa, JazzCash, and other non-cash receipts;
- customer-credit invoice value before payment;
- non-cash refunds;
- non-cash expenses;
- starting drawer float;
- counted cash;
- reconciliation difference;
- profit and stock valuation.

Starting cash is part of expected drawer cash, not net cash flow. Counted cash and
cash difference are reconciliation values, not transaction flow.

The Dashboard uses the full current Karachi day. An open shift uses its own opening
time through the current time. Both use the same component semantics.

The metric is organization- and branch-scoped. A profile without a branch receives
an explicit unavailable state; the widget does not fall back to organization-wide
invoice revenue.

The live Dashboard recomputes current activity. It does not substitute a finalized
daily-closing snapshot.

Manual cash adjustments are not currently a supported source in this contract.
Supplier payments and repair payments are not included in the existing Cash Drawer
activity formula; they were not silently added by this focused Dashboard correction.

## Local Baseline

The production-mode local browser flow reproduced the formula defect:

| Checkpoint | Dashboard | Shift net | Expected drawer |
| --- | ---: | ---: | ---: |
| Start | PKR 0 | - | - |
| Card sale PKR 150 | PKR 150 | - | unchanged |
| Card refund PKR 150 | PKR 150 | - | unchanged |
| Cash sale PKR 150 | PKR 300 | PKR 150 | PKR 1,150 |
| Cash refund PKR 150 | PKR 300 | PKR 0 | PKR 1,000 |

The task-owned shift opened with PKR 1,000 and closed with counted cash PKR 1,000.
Expected cash was PKR 1,000 and difference was PKR 0. This independently proved that
the Dashboard was wrong while Cash Drawer arithmetic was right.

The accepted baseline run had:

- one Card sale and one Card refund;
- one Cash sale and one Cash refund;
- one payment and one completed return per transaction;
- exact FIFO and stock restoration;
- no duplicate operation;
- zero page errors;
- zero request failures;
- zero HTTP errors;
- zero native dialogs;
- five exact local Supabase Auth navigation-teardown observations;
- exact cleanup and equal before/after safety signatures.

Discarded runs before the accepted baseline:

1. Customer Name locator ambiguity stopped before a sale.
2. Daily Closing notes locator ambiguity stopped after cleaned Card activity.
3. A return committed before its ID entered the cleanup ledger; the exact local
   marker was manually removed, zero marker rows were verified, and cleanup was
   corrected to remove returns by all tracked invoice IDs.
4. The complete financial baseline initially treated local Auth navigation teardown
   fetch aborts as unexpected console errors. The harness now records only the exact
   paired local navigation observations separately and does not broadly suppress
   browser errors.

Every discarded run was local, was not retried as a clean pass, and restored its
business-data signatures.

## Correction

Only the Dashboard widget registry source changed.

The widget now:

- uses `state.todayActivity.expectedCash`;
- presents Cash payments, Cash settlements, Cash refunds, and Cash expenses;
- uses the trusted branch/day data already loaded by Dashboard;
- shows an explicit unavailable state when no branch is assigned;
- keeps the compact title `Today's Net Cash`;
- describes the value as physical cash flow;
- uses short S-size supporting text that remains readable at 320 px.

No formula was duplicated in the client. No Dashboard page or data helper changed.

No payment, invoice, return, expense, settlement, shift, closing, FIFO, balance,
audit, permission, RLS, or database mutation changed.

No migration, package, lockfile, workflow, configuration, return-profit, or Reports
profit file changed.

## Accounting Matrix

Focused contracts recorded these outcomes:

| Case | Net cash |
| --- | ---: |
| No activity | 0 |
| Cash sale 150 | +150 |
| Card/bank/wallet sale 150 | 0 |
| Customer-credit invoice 150 | 0 |
| Mixed Cash 60 and Card 90 | +60 |
| Cash refund 150 | -150 |
| Card refund 150 | 0 |
| Cash sale and equal Cash refund | 0 |
| Card sale and equal Card refund | 0 |
| Cash expense 75 | -75 |
| Card/bank expense 75 | 0 |
| Cash customer settlement 400 | +400 |
| Digital customer settlement 400 | 0 |
| Prior-day invoice paid in Cash today | counts today |
| Future payment | excluded from today |
| Prior-day sale refunded in Cash today | negative refund today |
| Prior-day sale refunded by Card today | 0 |
| Draft/void invoice without payment | 0 |
| Cancelled return | 0 |
| Voided expense | 0 |
| Foreign branch or organization | excluded |
| Karachi midnight boundary | explicit start and end |
| Starting/counting/difference values | excluded |

The UI does not invent unsupported mixed-payment behavior; mixed-method arithmetic is
covered as a data contract.

## Corrected Browser Evidence

The same production-mode local browser workflow passed:

| Checkpoint | Dashboard | Shift net | Expected drawer |
| --- | ---: | ---: | ---: |
| Start | PKR 0 | - | - |
| Card sale PKR 150 | PKR 0 | - | unchanged |
| Card refund PKR 150 | PKR 0 | - | unchanged |
| Cash sale PKR 150 | PKR 150 | PKR 150 | PKR 1,150 |
| Cash refund PKR 150 | PKR 0 | PKR 0 | PKR 1,000 |

Reload retained PKR 0. The shift closed at expected/counted PKR 1,000 with difference
PKR 0.

The final run used a dedicated disposable organization and branch, zero Playwright
retries, and produced:

- zero unexpected page errors;
- one exact known Daily Closing print-footer hydration mismatch;
- zero unexpected console errors;
- twelve exact local Auth navigation-teardown observations;
- 199 typed Next.js RSC/action navigation aborts;
- two exact cancelled UI-preference reads during navigation;
- zero unexpected request failures;
- zero HTTP errors;
- zero native dialogs;
- cleanup retries: 0;
- cleanup failures: 0;
- generated customers/products/invoices/payments/returns/shifts/audits remaining: 0;
- all 20 before/after table signatures equal, including UI preferences.

Two isolated-harness runs were retained as discarded failures:

1. The new UI-preference safety signature initially ordered the table by `id`,
   while its primary key is `user_id`. Both tests stopped before fixture creation.
2. The next run completed the exact financial sequence and cleanup, but retained
   one pre-existing Daily Closing React hydration error caused by its print footer
   rendering the current time during hydration. This focused task did not change
   Daily Closing source. The harness now classifies only that exact route/error
   signature separately and continues to fail on every other page error.

The final rerun retained one exact Daily Closing hydration event and was not
represented as an error-free first-pass result. The event does not change cash,
shift, payment, return, or cleanup state and remains outside this focused source
correction.

## Delivery Gate Test Correction

The first owner-authorized delivery confirmation stopped at 265/266 Node tests.
No application, accounting, Cash Drawer, or net-cash behavior failed. The failure
was an older return-profit scope guard that ran `git diff --name-only origin/main`
and rejected any current branch path containing `cash`. That made a historical
return-profit contract depend on whichever unrelated feature branch happened to
be under development.

The owner rejected a waiver and authorized one fifth PR file:

`tests/return-profit-reconciliation.test.mjs`

The branch-dependent guard was replaced with a hermetic semantic contract over
`src/lib/return-profit.ts`, `src/lib/data/return-profit.ts`, and their narrowly
relevant Dashboard and Reports consumers. The replacement verifies exact
allocation quantity and unit-cost use, organization and completed-return scope,
read-only helper behavior, independence from cash-flow sources, absence of a
catalog-cost fallback, and continued shared Dashboard/Reports calculation calls.
It uses no Git command, branch, remote ref, commit hash, or repository-history
assumption.

All existing returned-profit accounting cases remain unchanged, including full
restocked and non-restocked returns, partial returns and refunds, multiple FIFO
costs, service returns, date/range behavior, organization and branch scope, and
Dashboard/Reports restored-cost presentation.

The corrected return-profit file passed 19/19 directly. The complete Node suite
then passed 266/266 with zero failures or skips. Focused net-cash contracts passed
29/29. The focused production-mode browser gate passed 2/2 with zero retries,
cleanup retries, or cleanup failures. The new exact PR head is recorded in the
updated PR delivery metadata because a commit cannot truthfully contain its own
hash.

No business mutation, schema, migration, package, production, Cash Drawer, Daily
Closing, payment, refund, settlement, or return-profit source changed during this
test-only delivery correction.

Visual checks covered:

- S at 320x568, light mode;
- M at 390x844, dark mode;
- L at 430x932, light mode;
- XL at 1440x900, dark mode.

The first visual run found the longer `Today's Net Cash Flow` title clipped by 19 px
in the S card. The second found `Physical cash flow` clipped by 5 px. The final,
measured presentation retains `Today's Net Cash` and uses `Cash flow today` at S
size. A later exact-build run with the existing PKR 1,200 local cash baseline found
the S value clipped by 14 px, so S uses the existing 20 px type step while M/L/XL
retain 24 px. The final matrix passed title, value, supporting-label, card, and page
overflow checks.

Positive, negative, and zero arithmetic remains formatted through the existing PKR
currency formatter. Larger sizes show the truthful component breakdown. Digital
payment value remains available through payment-method, Daily Closing, and Reports
surfaces; it is not mislabeled as physical cash.

## Scope And Safety

Changed files are limited to:

- `src/app/dashboard/widgets/widget-registry.tsx`
- `tests/dashboard-net-cash-reconciliation.test.mjs`
- `tests/e2e/dashboard-net-cash-reconciliation.spec.ts`
- `docs/qa/dashboard-net-cash-reconciliation-fix.md`

The local workflow used one disposable organization, branch, owner, product,
customer, two invoices, two returns, and one shift. Cleanup removed the exact
generated rows, UI preferences, and matching audit history. Seed stock/FIFO and
unrelated table signatures remained equal.

No production login or production mutation occurred in this source-fix task.

## Remaining Risk

This focused correction does not classify the whole product as accepted.

Still open:

- customer-settlement client completion: P2;
- supplier-payment client settlement: P2;
- historical Expenses settlement: P3;
- customer ledger presentation;
- customer lifecycle audit coverage;
- repair optional-field validation;
- invoice filters and printing;
- cashier production coverage;
- unfinished mobile coverage;
- Daily Closing print-footer hydration mismatch.

Preview rendering may be checked read-only after Vercel is Ready. Preview mutation
is prohibited unless its database is independently proven isolated from production.
Complete production delivery and authenticated verification require a separate owner
authorization after draft review.

## Delivery Plan

1. Keep the pull request in draft.
2. Complete exact-head senior review, GitHub CI, and read-only Vercel Preview review.
3. Obtain owner review and explicit delivery authorization.
4. Merge and deploy only in a separate delivery task.
5. Perform bounded authenticated production verification only after exact-main
   deployment is Ready.
6. Synchronize canonical documents only after successful production delivery.

Cash Drawer mutation behavior was not changed. Canonical synchronization and
finishing remain blocked pending owner review and production delivery.

## Rollback

Before merge:

`git branch -D fix/dashboard-net-cash-reconciliation`

After a later squash merge:

`git revert <merge_commit_sha> && git push origin main`
