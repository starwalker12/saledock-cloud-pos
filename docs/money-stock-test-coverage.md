# Money, Stock, and FIFO Test Coverage Audit

**Date:** 2026-06-21

**Rule:** This document proposes tests only. It does not change business logic.

## Existing automated assets

- `tests/e2e/pos-invoice-return-reports.spec.ts` provides authenticated navigation
  smoke coverage and an opt-in mutation flow for sale, invoice, and return.
- `tests/pos-checkout-idempotency.test.sql` contains a safe temporary-table proof
  for the partial unique index and a documented disposable-database RPC plan.
- `tests/karachi-business-day.test.mjs` covers key Asia/Karachi boundary examples.
- Other Playwright suites smoke-test customers, products, expenses, suppliers,
  replenishment, cash drawer, settings, users, and permissions.

## Coverage matrix

| Business invariant | Current coverage | Gap | Recommended next test |
|---|---|---|---|
| POS totals, paid, due, change | UI flow reaches an invoice | No exact database assertions for subtotal, discounts, paid, due, or change | Disposable-DB RPC test with fixed products/prices and exact numeric assertions. |
| Idempotent replay | Temporary unique-index proof; manual RPC plan | Full replay invoice/payment/stock/audit assertions are not automated | Execute same key twice and assert one invoice, one payment, one stock effect, one checkout audit. |
| Oversell blocked | RPC source contains guard | No deterministic test | Seed one unit, request two, assert failure and unchanged rows/stock. |
| Below-cost blocked without override | Permission/RPC source reviewed | No deterministic test | Fixed FIFO cost and sale price below cost; assert rejection and no writes. |
| Below-cost allowed with authorized override | Permission/RPC source reviewed | No deterministic test | Authenticated owner/admin fixture; assert one sale and loss-prevention audit. |
| FIFO stock deduction | Sale smoke flow | No lot-by-lot quantity assertion | Seed two dated lots and verify oldest lot is consumed first. |
| Return restores stock | E2E creates a return when mutation testing is enabled | No before/after stock or allocation assertion | Full/partial return tests asserting exact lot restoration and max-return guard. |
| Customer balance/ledger | Source reviewed | No automated debit/credit balance proof | Credit sale, partial settlement, return, and write-off scenarios with exact ledger balance. |
| Supplier purchase/payment dues | Read-only UI smoke | No mutation or FIFO payment-allocation assertions | Purchase plus partial/multiple payments; assert due and oldest payable allocation. |
| Cash drawer/daily closing | Page smoke only | No expected-cash/variance or duplicate-close assertions | Fixed-day fixture for cash/card sales, expenses, credit payment, close, reopen, duplicate close. |
| Karachi date grouping | Unit test duplicates helper algorithm; DB RPC fixed in PR #262 | Test does not import TypeScript helper or query DB RPC | Add source-level helper test and staging DB test around 00:00/05:00 PKT boundaries. |

## Why no broad tests were added in this pass

The repository does not currently provide an isolated Supabase integration-test
runner with deterministic tenant/auth fixtures and transaction cleanup. Adding
money tests directly to Playwright would either depend on production-like data
or mutate a shared environment. That is not safe for a source-audit pass.

The safest next step is to build a disposable/local Supabase test harness first,
then add test-only PRs. No production data should ever be a test fixture.

## Recommended test-only PR sequence

1. **Harness and checkout invariants**
   - Start/reset a disposable local Supabase project only.
   - Create one organization, branch, owner, customer, product, and two FIFO lots.
   - Test totals, paid/due/change, oversell, below-cost branches, FIFO, and
     idempotent replay including audit count.
2. **Returns and customer ledger**
   - Reuse fixed checkout fixtures.
   - Test partial/full return, over-return rejection, stock restoration, refund,
     settlement, write-off, and ledger balance.
3. **Supplier ledger and FIFO allocation**
   - Test purchase totals, partial payments, oldest-due allocation, write-off,
     and remaining due.
4. **Cash drawer and Karachi business dates**
   - Test expected cash, variance, duplicate close, reopen permission, and
     transactions around Karachi midnight.

Each PR should change tests/fixtures only unless a failing test reveals a bug.
Any resulting money/stock code or migration fix must be separated into its own
review-first PR.

## Manual staging checklist until automation exists

- [ ] Capture before/after invoice, payment, product stock, FIFO lot, ledger, and
      audit counts for a normal checkout.
- [ ] Repeat the exact checkout key and prove all counts remain unchanged.
- [ ] Verify a different key creates a distinct sale.
- [ ] Verify oversell and below-cost failures leave no partial rows.
- [ ] Verify full and partial returns restore the expected lot quantities once.
- [ ] Verify customer and supplier balances against their ledger entries.
- [ ] Verify daily closing arithmetic and Karachi date assignment.

Do these only in a disposable/staging shop with clearly marked QA records.
