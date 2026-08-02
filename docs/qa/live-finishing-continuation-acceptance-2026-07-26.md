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

Severity register immediately after the Expense Restore closure:

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

Classification immediately after the Expense Restore closure:

**FINISHING ACCEPTED WITH LIMITED COVERAGE**

The cashier limitation is unchanged: no authenticated cashier production
session or approved cashier credentials were available. SaleDock is not
audit-ready and not MVP-live.

Next task immediately after the Expense Restore closure:

`LIVE-CUSTOMER-AUDIT-001`

Keep that task limited to truthful customer create, update, and archive
lifecycle audit coverage. Do not combine it with
`LIVE-CUSTOMER-LEDGER-001`, customer-settlement client completion, or another
P2/P3 finding.

## 2026-07-29 Post-Acceptance Closure — Customer Lifecycle Audit

The original July 26 finding `LIVE-CUSTOMER-AUDIT-001` is closed.

The retained July 26 evidence showed one truthful `customer.credit_payment`
audit but no lifecycle audits for the observed create, update, and archive
mutations. Local investigation proved that the customer lifecycle actions
mutated customer rows without lifecycle `logAudit` calls. Update also lacked
identical-submission suppression, and Archive/Restore lacked confirmed exact
state transitions.

Source delivery:

- Source PR: #320
- Reviewed source head: `16f1fa9037ad998e4f8005eab17f4f44dcd9b8b8`
- Source squash: `31e20a58d36657d9bca00ed13aa09c5b07711059`
- Merge timestamp: `2026-07-28T23:17:41Z`
- Source deployment: `Dn4teeYnjpW2eKEYwFfuvSvgxzde`
- Main CI: run `30407520538`, successful
- Create confirms the inserted customer ID.
- Genuine update confirms one organization-owned row and audits safe changed
  field names only.
- Identical update creates no write or audit.
- Archive requires active status; Restore requires archived status.
- Each genuine transition emits one awaited truthful lifecycle audit.
- No raw private customer values are copied into audit details or metadata.
- No migration, schema, ledger, settlement, Dashboard, Reports, Cash Drawer,
  permission, or RLS behavior changed.

Local source evidence:

- Path:
  `/Users/sw12/Projects/saledock-local-evidence/customer-lifecycle-audit-fix`
- Manifest SHA-256:
  `50d6b1079a70f4b9848dd2e79e1c85a52874b1425cd6ddbcadd3899f708d2342`
- Manifest entries: 11
- Baseline lifecycle audit totals were zero for create, update, Archive, and
  Restore despite successful mutations.
- Post-fix source contracts, complete Node suite, focused production-mode E2E,
  permission checks, lint, typecheck, build, and cleanup passed as recorded in
  the focused QA document.

First authenticated production attempt:

- Classification:
  `INCOMPLETE PRODUCTION ACCEPTANCE - BROWSER INPUT PRECONDITION NOT ESTABLISHED`
- Marker: `LIVE-CUSTOMER-AUDIT-20260729-0421-911A`
- Customer: `9fbf4b37-47ce-4dc0-be2f-9b7e653ea508`
- Intended Credit Limit PKR 500 was not visibly confirmed before submission.
- Persisted Credit Limit: PKR 0
- Lifecycle audits: one `customers.created`, one `customers.archived`
- Balance and financial rows: zero
- Retry or compensating update: none
- Final state: archived
- Result: no Credit Limit persistence defect was inferred and this attempt did
  not close the finding.
- Evidence:
  `/Users/sw12/Projects/saledock-local-evidence/customer-lifecycle-audit-live-verification`
- Manifest SHA-256:
  `3f82d47d3926524c910eab1f601f77d82cb193b7fa71c8efbff651695483a1c0`
- Manifest entries: 12

Successful authenticated production rerun:

- Identity: Fardan Aatir, Owner, Star Shop, Main Branch, PKR, Asia/Karachi
- Marker: `LIVE-CUSTOMER-AUDIT-RERUN-20260729-0447-17BE`
- Customer: `b970bc25-0299-455e-b6b7-c0ffb6953bb2`
- Opening totals: 9 customers, 2 active, 7 archived; Customer Dues PKR 405;
  Net Cash PKR 0; 38 invoices; 25 payments; 6 ledger entries; 1 credit entry;
  0 write-offs; branch stock quantity 59; active FIFO quantity 2,005;
  valuation PKR 325,340; supplier dues PKR 0; open database shifts 0.
- Create gate: ordinary browser entry visibly established Credit Limit 500;
  read-only, post-blur, and final pre-submit values were 500.
- Create result: one submission persisted Credit Limit PKR 500.
- Genuine update: visible Credit Limit 600 persisted as PKR 600; Notes changed
  once; safe changed fields were `notes` and `credit_limit`.
- Identical no-op: one submission, unchanged timestamp, no profile write, and
  no second update audit.
- Exact lifecycle totals: one `customers.created`, one `customers.updated`, two
  `customers.archived`, and one `customers.restored`.
- Audit truth: correct actor, organization, branch, customer ID, action,
  details, and metadata.
- Privacy: no audit contained raw phone, email, address, initial Notes, or
  updated Notes.
- Financial effect: balance PKR 0; marker invoices, payments, ledger entries,
  credit payments, and write-offs zero; Customer Dues, Net Cash, Cash Drawer,
  stock/FIFO, supplier dues, and open shifts unchanged; duplicates zero.
- Final state: archived with Credit Limit PKR 600.
- Persistence: independent authenticated verification, Customers reload,
  archived-customer view, and Audit Log reload passed.
- Client settlement: create and update remained pending and Restore initially
  appeared stale; no resubmission occurred; independent truth and one recovery
  reload passed. This remains inside the existing customer-settlement P2 and
  is not a customer-settlement fix.
- Evidence:
  `/Users/sw12/Projects/saledock-local-evidence/customer-lifecycle-audit-live-verification-rerun`
- Manifest SHA-256:
  `d523c3a17c863e007df3d0c347cc8ec4d708b35e129fdfc990821de14008133e`
- Manifest entries: 22
- Screenshots: 12

Focused documentation delivery:

- PR: #321
- Branch head: `ade6527a9bca4e3ebdc7f3d10e87fa3238a01813`
- Documentation squash: `157c0181fbe8c4cf79d0904e3a39a5443df57288`
- Merge timestamp: `2026-07-29T07:27:08Z`
- Final production deployment: `DzCZELXPyhHwRBfZaH2MLwTUe58w`
- Focused QA record: `docs/qa/customer-lifecycle-audit-fix.md`

Current severity register:

- P0: 0
- P1: 0
- P2: 7
- P3: 5

The seven active P2 findings or coverage limits are:

1. `LIVE-CUSTOMER-LEDGER-001`
2. `LIVE-REPAIR-OPTIONAL-001`
3. `LIVE-INVOICE-FILTER-001`
4. `LIVE-INVOICE-THERMAL-BLANK-PAGE-001`
5. `KNOWN RESIDUAL CUSTOMER-SETTLEMENT CLIENT-COMPLETION RISK — P2`
6. `KNOWN RESIDUAL SUPPLIER-PAYMENT CLIENT-SETTLEMENT RISK — P2`
7. `ACCEPTED WITH LIMITED CASHIER COVERAGE — P2`

The five active P3 observations remain:

1. Historical/intermittent Expenses original-page settlement delay.
2. Expense Restore original-page settlement recovery.
3. Expense Reset date-field presentation.
4. Daily Closing hydration and print-footer noise.
5. Narrow mobile invoice-title and summary-label wrapping.

Current classification:

**FINISHING ACCEPTED WITH LIMITED COVERAGE**

Customer lifecycle auditing was fixed at that dated point. Customer ledger
presentation and customer-settlement client completion remained open then. The
cashier limitation was unchanged. SaleDock was not audit-ready and not
MVP-live.

Next task immediately after the customer lifecycle closure:

`LIVE-CUSTOMER-LEDGER-001`

Keep the next task review-first and limited to missing return/refund
presentation and the `INV-100361` ledger-entry UUID link. Do not combine it
with customer-settlement client completion, lifecycle auditing, or another
P2/P3 finding. Do not create a financial production mutation merely to
investigate presentation and reference-link behavior.

## 2026-07-29 Post-Acceptance Closure — Customer Ledger Presentation

The original July 26 finding `LIVE-CUSTOMER-LEDGER-001` is closed.

The retained customer debt ledger was financially correct: one PKR 150 invoice
debit, one PKR 150 Credit Payment, and a final PKR 0 balance. The presentation
used ledger-entry ID `432d7aef-7214-41d7-ae05-0d04c228248e` for the
`INV-100361` route and did not expose the retained completed return/refund on
the customer page.

Source delivery:

- Source PR: #323
- Reviewed source head: `c94390bfbb6286cdadb3f3a5d733c3ef95dd67e8`
- Source squash: `4b68e379ed5b4e60c9dbbef9e6fe53dd32c90266`
- Merge timestamp: `2026-07-29T11:10:44Z`
- Source deployment: `GuqL5ytTPBn93zHrXpxEsotPgX33`
- Main CI: run `30446554461`, successful
- Root cause: the ledger read model did not carry its nullable invoice ID, and
  the customer page had no organization- and customer-scoped returns read.
- Correction: route invoice references by their actual invoice IDs and add one
  read-only Returns & refunds presentation using actual return and invoice IDs.
- Accounting boundary: the Double-entry Ledger remains balance-affecting
  history only; no synthetic customer debt row is created for a fully paid
  return.
- Scope: no customer mutation, settlement, Credit Payment, write-off, return
  mutation, Cash Drawer, Dashboard, Reports, stock, FIFO, migration, or schema
  change.

Supporting source evidence:

- Path:
  `/Users/sw12/Projects/saledock-local-evidence/customer-ledger-presentation-fix`
- Manifest SHA-256:
  `94285126c79f43809025beb761f664faa85cf6618a0bd4407c1bac5c1d1b7d11`
- Manifest entries: 21

Authenticated read-only production verification:

- Identity: Fardan Aatir, Owner, Star Shop, Main Branch, PKR, Asia/Karachi
- Marker: `LIVE-CUSTOMER-LEDGER-20260729-1615-C409` (evidence metadata only)
- Retained customer: `0dd1406a-ed51-4ff4-9f30-24a32b2d2ac4`
- Invoice: `INV-100361`
- Invoice ID: `d78ef3f5-7480-4e40-a330-38ec7791028b`
- Corrected invoice href:
  `/invoices/d78ef3f5-7480-4e40-a330-38ec7791028b`
- Return: `RET-001006`
- Return ID: `a473366e-6617-468b-981c-668169b2282e`
- Return href:
  `/returns/a473366e-6617-468b-981c-668169b2282e`
- Return truth: completed, PKR 150 subtotal, PKR 150 refund, Card method, and
  correct invoice navigation.
- Debt reconciliation: one PKR 150 invoice debit, one PKR 150 Credit Payment,
  final PKR 0 balance.
- Synthetic fully-paid-return debt rows: zero
- Duplicate ledger rows: zero
- Duplicate return rows: zero
- Production mutations: zero
- Safety: Customer Dues PKR 405, Net Cash PKR 0, Cash Drawer PKR 0/0/0,
  stock 59, active FIFO quantity 2,005, valuation PKR 325,340, supplier dues
  PKR 0, and open shifts zero were unchanged.
- Mobile: desktop, 390×844, and 320×568 presentations passed; exact invoice
  and return links remained visible without page-level horizontal overflow.
- Evidence:
  `/Users/sw12/Projects/saledock-local-evidence/customer-ledger-presentation-live-verification`
- Manifest SHA-256:
  `85e4dbacd4f9fd9f6b753c655d45d0035e7db22c6cee7c9747f7bdb4fd5084ec`
- Manifest entries: 14
- Screenshots: 7

Focused documentation delivery:

- PR: #324
- Branch head: `8d210692893d5010fcfafd12f44422ba451bc5dd`
- Documentation squash: `d15530cca701b597c81778e7b984627d959fe6fc`
- Merge timestamp: `2026-07-29T11:43:54Z`
- Final production deployment: `Ayagpz9EfpCcYbX3fEYPR2jdpsyC`
- Current main and canonical synchronization base:
  `d15530cca701b597c81778e7b984627d959fe6fc`
- Focused QA record: `docs/qa/customer-ledger-presentation-fix.md`

Current severity register:

- P0: 0
- P1: 0
- P2: 6
- P3: 5

The six active P2 findings or coverage limits are:

1. `LIVE-REPAIR-OPTIONAL-001`
2. `LIVE-INVOICE-FILTER-001`
3. `LIVE-INVOICE-THERMAL-BLANK-PAGE-001`
4. `KNOWN RESIDUAL CUSTOMER-SETTLEMENT CLIENT-COMPLETION RISK — P2`
5. `KNOWN RESIDUAL SUPPLIER-PAYMENT CLIENT-SETTLEMENT RISK — P2`
6. `ACCEPTED WITH LIMITED CASHIER COVERAGE — P2`

The five active P3 observations remain:

1. Historical/intermittent Expenses original-page settlement delay.
2. Expense Restore original-page settlement recovery.
3. Expense Reset date-field presentation.
4. Daily Closing hydration and print-footer noise.
5. Narrow mobile invoice-title and summary-label wrapping.

Current classification:

**FINISHING ACCEPTED WITH LIMITED COVERAGE**

Customer ledger presentation and reference routing are fixed. Customer debt
accounting was not changed, and customer-settlement client completion remains
open. The cashier limitation is unchanged. SaleDock is not audit-ready and not
MVP-live.

Historical next task at the 2026-07-29 checkpoint:

`LIVE-REPAIR-OPTIONAL-001`

At that dated checkpoint, the required work was a review-first determination
of whether validation, form normalization, or persistence caused blank fields
presented as optional to reject with `Invalid UUID`. The 2026-08-02 closure
section below supersedes that instruction with the established root cause and
the bounded implementation task.

## 2026-08-02 Post-Acceptance P1 Closure — Repair Customer Tenant Integrity

The `LIVE-REPAIR-OPTIONAL-001` investigation discovered the independent P1
`REPAIR-CUSTOMER-TENANT-INTEGRITY-001`:
one retained synthetic local repair in the authenticated organization could be
linked to a customer from another organization. The Repair action trusted the
well-formed customer UUID without checking organization ownership, and the
database foreign key covered customer ID only. Optional-field source work
stopped; P1 temporarily became 1; operational state became
`FINISHING BLOCKED — ACTIVE P1 TENANT INTEGRITY`.

Source and database correction:

- Source PR: #326
- Reviewed source head: `446d08e7c88f981e418391103abe03a2dc4b7eae`
- Source squash: `12de0dd189d0c41895e4da5ca06bd880d17ee98b`
- Migration: `20260729133000_enforce_repair_customer_tenant_integrity.sql`
- Migration version: `20260729133000`
- Action behavior: selected customer ID is checked against the authenticated
  organization before repair, history, or audit mutation; quick-created
  customers remain organization-owned.
- Database invariant: validated composite
  `(organization_id, customer_id) -> customers(organization_id, id)` FK with
  `ON UPDATE RESTRICT`, null links retained, and customer deletion clearing
  only `customer_id`.

Delivery and production proof:

- Privileged pre-migration production count: 3 repairs, 3 linked, 0 mismatches,
  and 0 incompatible object conflicts on PostgreSQL 17.6.1.121.
- Equivalent migration delivery preflight: passed through the final complete
  Supabase shadow replay, database lint, history consistency, mismatch
  rollback proof, and zero public-schema diff. Per-PR Supabase Preview was
  disabled and was not represented as passed.
- Earlier disposable reset chronology: it stopped at historical Storage
  migration `0024`; the later complete shadow replay passed `0024` and reached
  the tenant migration, superseding that limitation.
- Production migration delivery: automatic and exactly once in the bounded
  window from source merge `2026-08-02T08:06:23Z` to first retained metadata
  verification `2026-08-02T08:11:18.427156Z`; no exact application timestamp
  was exposed and no duplicate manual apply was issued.
- Post-migration mismatch count: 0.
- Rollback-only probe: one incompatible cross-organization reassignment failed
  with SQLSTATE `23503`; the explicit transaction fully rolled back.
- Persistent production fixture/business mutation: zero.
- Authenticated read-only Repair UI, intake, tenant-visible customer search,
  existing relationship, detail, and status-history checks passed without
  foreign customer exposure or form submission.
- Live marker: `LIVE-REPAIR-TENANT-20260802-1306-AE5C`, evidence metadata only.
- Live evidence:
  `/Users/sw12/Projects/saledock-local-evidence/repair-customer-tenant-integrity-live-verification`
- Live manifest SHA-256:
  `934124226da08ebd09c410570188840571c50205d6e379f8ccddac1a854dae0e`

Focused documentation:

- PR: #327
- Head: `98375cb4e79cc364f6baf4da91d2c1b286645af6`
- Documentation squash: `8afbc37751a76edb93d52175146be6dbb619a0a3`
- Final production deployment: `GooqVaWAfTVhunUU1eYFyBLguiDx`

Current post-closure state:

- P0 remained 0.
- P1 returned from 1 to 0.
- P2 remained 6.
- P3 remained 5.
- Finishing returned to **FINISHING ACCEPTED WITH LIMITED COVERAGE**.
- `LIVE-REPAIR-OPTIONAL-001` remains open. Its blank UUID, optional-string
  preprocessing, and malformed nonblank date root causes are established, but
  no optional-field correction exists.
- Repair statuses, permissions, settlement, accounting, stock/FIFO, and Cash
  Drawer behavior remain unchanged.
- Audit-ready: no.
- MVP-live: no.
- Next task: resume `LIVE-REPAIR-OPTIONAL-001` from retained evidence in a
  fresh current-main worktree; do not reuse the protected old worktree or
  repeat the tenant-integrity correction.

This section records later chronology and does not rewrite the original July 26
acceptance facts.

## Rollback And Finalization

This acceptance run changed no repository file or application behavior. QA
records were safely finalized while truthful transaction history was retained.

If the canonical documentation synchronization must later be reverted:

`git revert <documentation_squash_sha> && git push origin main`

Risk remains open because six P2 findings or coverage limits and five P3
observations remain, including Repairs optional-field behavior,
customer/supplier settlement client completion, invoice presentation gaps, and
unavailable authenticated cashier acceptance. Customer lifecycle auditing,
customer ledger presentation, and repair/customer tenant integrity are closed.
No active P0 or P1 remains.
