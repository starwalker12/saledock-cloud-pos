# Decimal-Safe Accounting Money Boundary

Task 35806. Reviewed starting main: `7711b5e2c48ed35f973a0906fd59af256bfa69d0`.
Local implementation only; production has not been accessed. This is a prerequisite,
not ledger forward trust or a service UI redesign.

## Policy

Financial debt movements and authoritative current outstanding balances are two-decimal
PKR currency values. Caller inputs carrying meaningful precision beyond PKR 0.01 are
rejected, not rounded. Numerically equivalent trailing zeroes are accepted: `1.230`
represents `1.23`. SaleDock-derived currency from valid components is calculated in
integer paisa before crossing the existing numeric transport boundary.

This is not a claim that every product cost, report ratio or cash-only database pricing
input is restricted by a new global currency policy.

## Baseline And Cause

Two rollback-isolated baseline runs on the unchanged financial definitions reproduced
all four `0.015` counterexamples. The payment/write-off row and ledger amount stored
`0.02`, while outstanding and `balance_after` changed from `100.00` to `99.99`.
The stored signed movement instead implies `99.98`. The ordinary `0.02` control
already produced the correct `99.98` chain.

The prior Task 85724 seal independently established why guards alone were insufficient:
ordinary JavaScript addition of service principal `500.10` and commission `50.20`
generated `550.3000000000001`, rejecting a legitimate sale. This change calculates
the mathematical result `550.30` without accepting or rounding arbitrary `0.015` input.

## Seven-Writer Audit

| Writer | Debt precision boundary | Change |
| --- | --- | --- |
| `record_credit_payment` | External `p_amount` | Positive, finite, exact-2dp guard before account locking/allocation/writes |
| `record_customer_write_off` | External `p_amount` | Same guard before balance/write-off/ledger writes |
| `record_supplier_payment` | External `p_amount` | Same guard before purchase allocation/account writes |
| `record_supplier_write_off` | External `p_amount` | Same guard before balance/write-off/ledger writes |
| `pos_checkout` | Authoritative customer debt increment `v_balance` | Exact-2dp/finite guard before invoice/payment/stock/customer writes |
| `create_supplier_purchase` | Authoritative `v_grand` and initial `p_amount_paid` | Exact-2dp/finite guards before purchase/stock/ledger writes |
| `create_invoice_return` | Credit derived from stored invoice amounts, existing SQL rounding and stored balance cap | Unchanged |

The migration replaces six existing definitions. Removal of only the new guards
reproduces each prior business body. Public signatures, owners, SECURITY INVOKER,
search paths and actual ACLs are unchanged for all seven writers. No privilege
hardening is claimed here. The return function remains byte-identical.

PostgreSQL guards compare numeric value with `round(value, 2)`; they do not test
textual scale or normalize the input. Precision validation precedes financial writes
and overpayment allocation. POS keeps #364's cash-only physical `0.001` pricing
tolerance, loss rules, tenant/branch checks, permissions, FIFO and replay semantics.

## Application Boundary

`src/lib/money.ts` is a bounded decimal parser plus BigInt paisa arithmetic, not a new
currency framework. It rejects invalid precision and NUMERIC(12,2) overflow. Addition,
subtraction, integer quantities and line discounts use exact minor units. Existing
number-shaped payloads are retained only after fixed-decimal formatting; JSON `550.3`
is numerically the same currency amount as `550.30`.

POS service totals, cart totals, balances, change, held totals and restored service
money use that utility. Supplier-purchase subtotal, discount, initial payment balance
and audit estimate use the same arithmetic with existing formulas. Proportional
loss-preview ratios remain non-authoritative; SQL loss/FIFO allocation rounding is
unchanged.

Customer/supplier payment and write-off Actions validate submitted decimal values
before numeric conversion/mutation. Inputs retain `step="0.01"`. Friendly denial:
`Amount must have no more than 2 decimal places.` Database checks remain authoritative.

## Importer And History

No importer source is changed. Its existing normalization compares supplied NUMERIC
outstanding with the target two-decimal value before staging/business insertion.
Local proofs cover zero, negative exact-2dp values, ordinary native restore and
sub-paisa staging rejection. The existing application's stricter lexical handling of
trailing zeroes in import payloads is not broadened by this task.

No historical rows, existing balances or stored payments are rewritten. There is no
backfill, trust column, sequence, anchor, new role, table, RLS policy or RPC signature.
Demo maintenance remains retired. Supplier Statement and Service V1 remain deferred.

## Local Acceptance

Evidence directory:
`/Users/sw12/Projects/saledock-local-evidence/accounting-derived-money-precision-prerequisite`.
An independently sealed `SHA256SUMS` accompanies the final report and draft PR.

- Utility controls: `500.10 + 50.20 = 550.30`, `0.10 + 0.20 = 0.30`,
  `999.99 + 0.01 = 1000.00`, `0.01 + 0.01 = 0.02`.
- Four direct authenticated RPCs: 68 boundary cases, rollback-isolated snapshots;
  rejected calls leave protected public relations and auth users unchanged.
- Every `0.02` payment/write-off control records `0.02` and changes balance/ledger
  `100.00 -> 99.98`. Customer and supplier FIFO allocations split `0.01 + 0.01`.
- Service cash and customer-credit checkout: add, hold, browser reload, resume,
  switch bills, checkout; stored total/unit/line/credit or payment `550.30`, no stock
  allocation, no float residue, one checkout mutation. The existing separate held-bill
  completion Action is observed and is not counted as a duplicate sale.
- Supplier purchase: subtotal/grand `0.30`, paid `0.10`, due `0.20`, outstanding
  `100.20`, matching credit/debit ledger, two intended lots/movements. Invalid grand
  and initial-payment precision are separately rejected without mutation.
- Return control: credit sale `0.30`, return credit `0.10`, outstanding `100.20`,
  one restored unit with matching FIFO remaining quantity.

The final evidence records complete Node, production-mode browser regressions
(automatic retries zero), lint, typecheck, production build, DB lint, error-level
security advisors, migration comparison, cleanup and worktree/evidence preservation.
Final build uses system TLS certificates for Google Fonts; there is no font mock,
dependency change or application/configuration workaround.

Final gates: complete Node `648 total / 641 passed / 0 failed / 7 skipped`;
36 focused utility/Action tests and seven enabled money DB tests are included.
The separate #364 role/RPC matrix passes `96/96` with 40 denials. Fourteen selected
production-mode browser tests pass with retries zero, including 390px POS editing.
Lint has zero errors and two pre-existing privacy-center warnings. Typecheck, build,
DB lint, error-level security advisors and `git diff --check` pass.

Seven Node skips are six unrelated opt-in importer stress/race suites and the #364
matrix, which was executed separately. No skipped suite is claimed as exercised.
Older browser harnesses received only local-port discovery, current Product submit
selectors and read-settled navigation; their financial/error/cleanup assertions are
unchanged. Failed setup/development logs are retained in evidence with explanations.
