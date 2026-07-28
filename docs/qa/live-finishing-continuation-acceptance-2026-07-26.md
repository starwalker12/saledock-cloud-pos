# SaleDock Authenticated Production Finishing Acceptance — 2026-07-26

## Scope

This record canonically captures the bounded authenticated production finishing
acceptance completed on 26 July 2026.

Classification:

**FINISHING ACCEPTED WITH LIMITED COVERAGE**

The exact limitation is unavailable authenticated cashier production coverage.
Permission contracts were reviewed, but no approved cashier credentials or
authenticated cashier session existed. No cashier account was created, reset,
invited, or impersonated.

This record does not claim:

- all defects are fixed;
- all coverage is complete;
- cashier acceptance passed;
- customer or supplier settlement is fixed;
- Expenses settlement is fixed;
- SaleDock is audit-ready;
- SaleDock is MVP-live.

## Production Identity

| Item | Verified value |
| --- | --- |
| Repository | `https://github.com/starwalker12/saledock-cloud-pos.git` |
| Production main / synchronization base | `0b94dcb072a204539aa4608d53e0237a77c058fe` |
| Latest application-behavior commit | `8f8202a428a88bd8d72d178facbafb775eb1abf8` |
| Latest behavior change | `fix: reconcile dashboard net cash by payment method` |
| Vercel deployment | `dpl_5zVLpG4mTcvgxr3Xd76voXxY6CNA` |
| Deployment status | Ready and current |
| User | Fardan Aatir |
| Role | Owner |
| Organization | Star Shop |
| Branch | Main Branch |
| Currency | PKR |
| Time zone | Asia/Karachi |

Authenticated workflow evidence came from Codex Chrome computer use. The
authenticated in-app browser supplied true 390×844 and 320×568 viewport
coverage. Public HTTP availability was not treated as workflow proof.

## Protection And Archive Truth

At the opening and closing gates:

- all 21 required historical worktrees matched;
- all 26 required protected dirty/untracked files matched;
- the broader inventory contained 33 worktrees and 28 dirty/untracked files;
- the Expenses diagnostic matched SHA-256 `0ce14eaefb061454eb2fc0c1d3ad39dc0c3a9e6f3a79d2eb761185a88cf45715`;
- the customer-settlement diagnostic matched SHA-256 `a1e81833205e4916d8683a91fa3b85a922d2b4013e9e8e7cb3269241425257af`.

Archive reality:

- 29 historical archives were previously verified;
- their ephemeral `/tmp` copies expired;
- 43 historical archives remain unavailable;
- none was restored, reconstructed, or represented as physically available.

## Primary Evidence

- Path: `/Users/sw12/Projects/saledock-local-evidence/live-finishing-continuation-2026-07-26`
- Marker: `FINISHING-CONT-20260726-2022-2B42`
- Manifest SHA-256: `90f9cd57b810a29eb554a283b43a11281e0e1f6c5c7fab3f60bdb949eca34429`
- Manifested files: 58
- Screenshots: 42
- Manifest verification: passed
- Secret scan: passed

The supporting evidence directories for Dashboard net cash, return profit,
expense datetime, customer settlement, supplier purchase, and the July 23
finishing run were read only to confirm chronology and durable status. Their
existence does not mean every historical workflow was rerun on July 26.

## Retained Financial History

The finishing run preserved required transaction history.

- `INV-100364` remained paid at PKR 150 with PKR 0 due.
- `RET-001009` remained completed with a PKR 150 refund.
- The retained product remained inactive with stock 4 and FIFO remaining 4.
- The retained customer remained archived with PKR 0 balance.
- The retained supplier remained inactive with PKR 0 balance.
- Supplier purchase `PUR-000001` remained paid at PKR 300 with PKR 0 due.
- The retained supplier payment remained one PKR 300 Card payment.
- The retained cash shift remained closed at PKR 1,000 starting, expected, and counted cash with PKR 0 difference.
- Required invoices, items, payments, sale/return allocations, stock movements, and audits were retained.
- No duplicate retained transaction was found.

## Customer Ledger

Final customer balance truth reconciled:

- invoice credit debit: PKR 150;
- credit payment: PKR 150;
- final balance: PKR 0.

Finding `LIVE-CUSTOMER-LEDGER-001` remains P2 because:

- return/refund presentation is absent;
- the visible `INV-100361` reference targets a ledger-entry UUID rather than the invoice ID;
- no accounting or tenant-isolation error was found.

## Customer Audit

The available Credit Payment audit exists with actor Fardan Aatir and correct
organization context.

Finding `LIVE-CUSTOMER-AUDIT-001` remains P2 because customer create, update,
and archive lifecycle audits are absent.

## Repairs

Two optional-field attempts failed safely:

- blank optional customer values returned `Invalid UUID`;
- explicitly supplied permanent-customer fields with an empty hidden customer ID also returned `Invalid UUID`;
- both attempts created zero repair rows and zero audits.

This is `LIVE-REPAIR-OPTIONAL-001 — P2`.

The valid explicitly filled workflow passed:

- repair: `RJ-000003`;
- amount fields: estimate PKR 200, advance PKR 0, final cost PKR 200;
- received → in progress on desktop;
- in progress → completed on true 390×844 mobile;
- completed → cancelled during cleanup;
- final state: cancelled;
- history rows: 4;
- audits: one create and three status-change;
- repair payments: 0;
- duplicate repairs: 0.

## Expenses

The workflow performed one create and five distinct updates:

1. create;
2. notes-only;
3. amount-only;
4. payment-only;
5. category-plus-payment;
6. mobile notes-only.

Each accepted operation submitted once. Final expense truth:

- amount: PKR 80;
- category: Marketing;
- payment method: Card;
- timestamp: preserved;
- final state: archived/voided;
- Cash Drawer effect: PKR 0;
- duplicates: 0.

Audit totals:

- `expenses.created`: 1;
- `expenses.updated`: 5;
- `expenses.voided`: 2;
- Restore audit: 0.

Restore committed once and exact expense truth recovered after one reload. The
original page stayed stale and no duplicate occurred.

`LIVE-EXPENSE-RESTORE-AUDIT-001 — P2` remains open because no Restore audit was
produced.

The following P3 observations remain distinct:

- historical/intermittent Expenses original-page settlement delay;
- Restore original-page settlement recovered after reload;
- Reset can leave visible date fields stale after route reset.

Business amount, timestamp, Reports, and Cash Drawer truth were correct.

## Invoices And Print

Invoice `INV-100364` passed:

- customer and product truth;
- quantity 1;
- cost PKR 100;
- price and total PKR 150;
- paid PKR 150;
- due PKR 0;
- Cash payment;
- retained completed return `RET-001009`;
- reload persistence.

`LIVE-INVOICE-FILTER-001 — P2` remains open because search, date,
payment-method, status, and Reset controls are absent or materially incomplete.

Print evidence:

- A4: one complete page, no clipping;
- 80mm: correct content on page one, no clipping, one blank trailing page;
- physical printer: not tested.

The 80mm behavior is `LIVE-INVOICE-THERMAL-BLANK-PAGE-001 — P2`.

## Cash Drawer

Verified retained truth:

| Method | Paid | Refunded | Net physical-cash effect |
| --- | ---: | ---: | ---: |
| Cash | PKR 150 | PKR 150 | PKR 0 |
| Card | PKR 150 | PKR 150 | PKR 0 |

The retained task-owned shift remained:

- status: closed;
- starting cash: PKR 1,000;
- expected cash: PKR 1,000;
- counted cash: PKR 1,000;
- difference: PKR 0.

No task-owned shift remained open. The active Card expense had no Cash Drawer
effect.

## Daily Closing

The closed shift, method totals, count, and difference reconciled without a
duplicate. Daily Closing hydration and print-footer noise remain one combined P3
observation because cash truth remained correct.

## Reports

Opening July range:

- gross/net sales: PKR 1,200;
- gross profit: PKR 400;
- expenses: PKR 0;
- refunds: PKR 750;
- restored FIFO cost: PKR 500;
- estimated net profit: PKR 150.

With the active PKR 80 expense:

- expenses: PKR 80;
- estimated net profit: PKR 70.

After final archive:

- gross profit: PKR 400;
- expenses: PKR 0;
- refunds: PKR 750;
- restored FIFO cost: PKR 500;
- estimated net profit: PKR 150.

No unexplained financial delta remained.

## Owner Permissions

Authenticated Owner access passed for:

- Dashboard;
- POS;
- Invoices;
- Products;
- Customers;
- Supplier Purchases;
- Supplier Dues;
- Repairs;
- Returns;
- Expenses;
- Daily Closing;
- Reports;
- Users;
- Audit Log;
- Settings.

No login redirect, authorization error, or cross-organization exposure occurred.

## Cashier Limitation

`ACCEPTED WITH LIMITED CASHIER COVERAGE — P2` remains open.

- Source permission contracts were reviewed.
- No authenticated cashier session or approved credentials were available.
- No account was created, reset, invited, or impersonated.
- No cashier financial mutation was performed.
- Cashier production acceptance did not pass because it did not run.

## Mobile

True authenticated viewports:

- 390×844;
- 320×568.

Verified:

- Dashboard, POS, invoice detail, Repairs, Expenses, Daily Closing, and Reports;
- additional 390×844 coverage for Invoices, Products, and Customers;
- no page-level horizontal overflow;
- mobile drawer and bottom navigation;
- one Repair status mutation;
- one Expense notes-only mutation;
- one submission and no duplicate for each mobile mutation.

Coverage boundaries:

- soft-keyboard overlap was unavailable to measure;
- narrow invoice-title ellipsis remains;
- narrow summary-label/value wrapping remains.

The narrow presentation observations remain P3.

## Cleanup

- QA repair ended cancelled.
- QA expense ended archived.
- No task-owned customer or product was created during this continuation.
- No task-owned shift remained open.
- Retained financial history stayed intact.
- Retained product, customer, and supplier final states remained correct.
- Customer and supplier balances remained PKR 0 where expected.
- Retained stock and FIFO remained 4.
- No migration or schema change occurred.
- No application source, test, package, lockfile, workflow, or configuration changed during acceptance.

## Final Dashboard

| Metric | Opening | Final |
| --- | ---: | ---: |
| Net Profit | PKR 0 | PKR 0 |
| Gross Sales | PKR 300 | PKR 300 |
| Expenses | PKR 0 | PKR 0 |
| Returns | PKR 300 | PKR 300 |
| Net Cash | PKR 0 | PKR 0 |
| Pending Repairs | 1 | 1 |
| Supplier Dues | PKR 0 | PKR 0 |
| Customer Dues | PKR 405 | PKR 405 |
| Stock valuation | PKR 325,340 | PKR 325,340 |
| FIFO valuation | PKR 308,965 | PKR 308,965 |

The final values matched the exact opening baseline. This does not claim all
retained historical totals were zero.

## Original Severity Register — 2026-07-26

### P0

0 active.

### P1

0 active.

Former P1 findings fixed, merged, deployed, and authenticated-production
verified:

| Area | Source merge | Documentation merge |
| --- | --- | --- |
| Opening stock/FIFO atomicity | `da40ad2b846f69736231dfba9f8e46f013f6d247` | `2f71c5c0db0e2e799032087cd3077ab8c204e058` |
| Supplier purchase number generation | `857556f173383efd66cbbf3f96448d0562cc8bc6` | `afaef696aa7df08cd1e18965e5770f7e00189bb9` |
| Expense timestamp preservation | `03eeda4a014852d294bc790b81c308d716802221` | `191c1a83229c0ad4aaeab97922b07be499e60f54` |
| Return-profit reconciliation | `68a86398f91cbfd240f8d3818c6bb866a4da2266` | `6542ab0577a02feaca26df9ac9dcb528f0caa564` |
| Dashboard net-cash reconciliation | `8f8202a428a88bd8d72d178facbafb775eb1abf8` | `0b94dcb072a204539aa4608d53e0237a77c058fe` |

### P2

Exactly nine active findings or coverage limits:

1. `LIVE-CUSTOMER-LEDGER-001`
2. `LIVE-CUSTOMER-AUDIT-001`
3. `LIVE-REPAIR-OPTIONAL-001`
4. `LIVE-EXPENSE-RESTORE-AUDIT-001`
5. `LIVE-INVOICE-FILTER-001`
6. `LIVE-INVOICE-THERMAL-BLANK-PAGE-001`
7. `KNOWN RESIDUAL CUSTOMER-SETTLEMENT CLIENT-COMPLETION RISK — P2`
8. `KNOWN RESIDUAL SUPPLIER-PAYMENT CLIENT-SETTLEMENT RISK — P2`
9. `ACCEPTED WITH LIMITED CASHIER COVERAGE — P2`

### P3

Exactly five active observations:

1. Historical/intermittent Expenses original-page settlement delay with correct server truth.
2. Expense Restore original-page settlement recovered after reload.
3. Expense Reset date-field synchronization/presentation.
4. Daily Closing hydration and print-footer noise with correct cash truth.
5. Narrow mobile invoice-title ellipsis and summary-label wrapping.

## Original Classification And Decision — 2026-07-26

**FINISHING ACCEPTED WITH LIMITED COVERAGE**

- No active P0 or P1 was found.
- Nine P2 findings or coverage limits remain.
- Five P3 observations remain.
- Authenticated cashier production acceptance was unavailable.
- SaleDock is not audit-ready.
- SaleDock is not MVP-live.
- Canonical synchronization is completed by the documentation PR containing this record.

## Original Risk Waivers — 2026-07-26

Customer-settlement and supplier-payment client settlement remain open P2 risks.
The waiver applies only when exact server/accounting truth commits once, no
duplicate exists, independent truth is correct, and one reload recovers the
original page. It never covers missing, duplicate, incorrect, cross-tenant, or
unrecoverable business state.

The historical Expenses settlement observation remains P3. The missing Expense
Restore audit is a separate P2 and must receive its own source investigation.

## Original Next Task — 2026-07-26

Perform one focused review-first investigation and correction of:

`LIVE-EXPENSE-RESTORE-AUDIT-001`

Do not combine it with settlement/reset presentation work or another P2 finding.

## 2026-07-29 Post-Acceptance Closure — Expense Restore Audit

The original July 26 finding `LIVE-EXPENSE-RESTORE-AUDIT-001` is closed.

Source review established that `restoreExpenseAction` performed the
organization-scoped archived-to-active update but discarded its update result
and emitted no Restore audit. PR #317 retained authorization and organization
scope, required an archived row, confirmed the exact transitioned row, awaited
one truthful Restore audit, and returned without an audit for errors, missing
rows, active rows, unmatched rows, denied access, or other no-op outcomes.

Source delivery:

- Source PR: #317
- Original source head: `afde45b53ddbe8c03956327dbaf7bd9427c8db2a`
- Owner-review test-correction head: `51137c4a749023ed3e2a5fa73d403a4590a1ad03`
- Source squash: `c823af4552b4841d776533bdabb770c6abb93a00`
- Source deployment used for authenticated verification:
  `2HoXqm32LeSRZh89axEc6CDcr69h`
- No migration, schema, settlement, Reset, Dashboard/Reports formula, or Cash
  Drawer change

Authenticated production verification:

- Identity: Fardan Aatir, Owner, Star Shop, Main Branch, PKR, Asia/Karachi
- Marker: `LIVE-EXP-RESTORE-AUDIT-20260729-0132-L8YQ`
- Expense ID: `5238e320-869f-4b6f-b9a0-cd567647cc3e`
- Timestamp: `2026-07-29T01:34` Asia/Karachi, stored as
  `2026-07-28T20:34:00Z`
- Restore: one genuine archived-to-active transition
- Audit: exactly one `expenses.restored`
- Actor/organization/branch: Fardan Aatir / Star Shop / Main Branch
- Details: exact restored expense ID
- Metadata: exact expense ID, `previous_status: archived`, and
  `new_status: active`
- Business values: amount, category, Card method, vendor, notes, creator, and
  timestamp preserved
- Dashboard and Reports: baseline + PKR 75 while active, exact baseline after
  final archival
- Net Cash and physical Cash Drawer: unchanged
- No-op/duplicates: Restore control disappeared; no second transition or
  Restore audit
- Final state: archived
- Final audit totals: one create, two Void, one Restore
- Cleanup retries/failures: 0/0

Evidence:

- Path: `/Users/sw12/Projects/saledock-local-evidence/expense-restore-audit-live-verification`
- Manifest SHA-256: `94ed2ece32d3bf795a45aee61586b8909ade59dd635a545606c8da65dcc742c4`
- Manifest entries: 24
- Focused QA record: `docs/qa/expense-restore-audit-fix.md`

Focused documentation delivery:

- PR: #318
- Branch head: `98dff8d5b5f7847bf48adbbaf72f24e390ef91cb`
- Documentation squash: `2b55443e5fafd6a1f76181b6e42b4748e0b53f8d`
- Current production deployment: `F2ukbJu7Q1TrSmc7pruom1YAQKyo`
- Deployment state: Ready/current for
  `2b55443e5fafd6a1f76181b6e42b4748e0b53f8d`

Current severity register:

- P0: 0
- P1: 0
- P2: 8
- P3: 5

The eight active P2 findings or coverage limits are:

1. `LIVE-CUSTOMER-LEDGER-001`
2. `LIVE-CUSTOMER-AUDIT-001`
3. `LIVE-REPAIR-OPTIONAL-001`
4. `LIVE-INVOICE-FILTER-001`
5. `LIVE-INVOICE-THERMAL-BLANK-PAGE-001`
6. `KNOWN RESIDUAL CUSTOMER-SETTLEMENT CLIENT-COMPLETION RISK — P2`
7. `KNOWN RESIDUAL SUPPLIER-PAYMENT CLIENT-SETTLEMENT RISK — P2`
8. `ACCEPTED WITH LIMITED CASHIER COVERAGE — P2`

The five active P3 observations remain:

1. Historical/intermittent Expenses original-page settlement delay with correct server truth.
2. Expense Restore original-page settlement recovery.
3. Expense Reset date-field synchronization/presentation.
4. Daily Closing hydration and print-footer noise with correct cash truth.
5. Narrow mobile invoice-title ellipsis and summary-label wrapping.

The latest production Restore settled normally. That does not close the
intermittent Restore settlement P3 observation. Expense Reset presentation is
also not fixed.

Current classification:

**FINISHING ACCEPTED WITH LIMITED COVERAGE**

The cashier limitation is unchanged: no authenticated cashier production
session or approved cashier credentials were available. SaleDock is not
audit-ready and not MVP-live.

Current next task:

`LIVE-CUSTOMER-AUDIT-001`

Keep that task limited to truthful customer create, update, and archive
lifecycle audit coverage. Do not combine it with
`LIVE-CUSTOMER-LEDGER-001`, customer-settlement client completion, or another
P2/P3 finding.

## Rollback And Finalization

This acceptance run changed no repository file or application behavior. QA
records were safely finalized while truthful transaction history was retained.

If the canonical documentation synchronization must later be reverted:

`git revert <documentation_squash_sha> && git push origin main`

Risk remains open because eight P2 findings or coverage limits and five P3
observations remain, including missing customer lifecycle-audit and ledger
coverage and unavailable authenticated cashier acceptance. No active P0 or P1
was found.
