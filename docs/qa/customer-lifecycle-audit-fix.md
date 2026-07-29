# Customer lifecycle audit correction and live verification

## Status

`LIVE-CUSTOMER-AUDIT-001` is closed.

Authenticated production verification established:

`PASS - LIVE-CUSTOMER-AUDIT-001 FIXED`

The active finding inventory is now P0 0, P1 0, P2 7, and P3 5. SaleDock
remains in `FINISHING ACCEPTED WITH LIMITED COVERAGE`, remains below
audit-ready, and is not MVP-live. Canonical project documents remain stale
until a separately reviewed synchronization records this closure.

Customer lifecycle auditing is fixed. Customer Credit Limit persistence also
passed when the browser value was visibly confirmed before submission. The
customer ledger presentation and customer-settlement client completion
findings are not fixed.

## Retained July 26 production finding

The original authenticated production finding is retained outside Git at:

`/Users/sw12/Projects/saledock-local-evidence/live-finishing-continuation-2026-07-26`

Its 58-entry manifest has SHA-256:

`90f9cd57b810a29eb554a283b43a11281e0e1f6c5c7fab3f60bdb949eca34429`

That evidence showed one available `customer.credit_payment` audit but no
lifecycle audits for the observed customer create, update, and archive
mutations. The retained marked customers were archived, balances were PKR 0,
and duplicate financial mutations were zero.

No private retained customer contact values are copied into this document.

## Local baseline and root cause

The local source investigation evidence is stored at:

`/Users/sw12/Projects/saledock-local-evidence/customer-lifecycle-audit-fix`

Its 11-entry manifest has SHA-256:

`50d6b1079a70f4b9848dd2e79e1c85a52874b1425cd6ddbcadd3899f708d2342`

The exact production source was built against loopback Supabase. One synthetic,
nonfinancial owner customer was created, genuinely updated, identically
resubmitted, archived, restored, and archived again through the ordinary
Customers UI.

All mutations committed, but baseline lifecycle audit counts were zero:

- `customers.created`: 0
- `customers.updated`: 0
- `customers.archived`: 0
- `customers.restored`: 0

The deterministic root cause was that `saveCustomerAction`,
`archiveCustomerAction`, and `restoreCustomerAction` mutated customer rows
without lifecycle calls to `logAudit`. Archive and Restore also lacked a
confirmed exact state transition, and update did not distinguish a genuine
profile change from an identical submission.

This was classified:

`OUTCOME A - LIFECYCLE ACTIONS MUTATE WITHOUT AUDIT`

The existing customer financial audit actions were not involved:

- `customer.credit_payment`
- `customer.write_off`
- `permission.denied`

The local workflow generated no sale, invoice, payment, credit settlement,
write-off, return, shift, or Cash Drawer mutation. Cleanup removed the
disposable customer and its matching local audits with zero retries or
failures, and all measured safety signatures returned to baseline.

## Source correction

The correction changed only customer lifecycle behavior in
`src/app/customers/actions.ts`:

- create confirms the inserted customer ID before one awaited create audit;
- update compares normalized persisted and submitted values, skips no-ops,
  confirms the exact organization-scoped row, and audits only safe changed
  field names;
- archive requires and confirms one active-to-archived transition;
- Restore requires and confirms one archived-to-active transition;
- lifecycle audits are awaited before existing route revalidation.

The stable lifecycle actions are:

- module `customers`, action `customers.created`
- module `customers`, action `customers.updated`
- module `customers`, action `customers.archived`
- module `customers`, action `customers.restored`

Error, no-match, foreign-organization, repeated transition, invalid, denied,
and identical-update paths cannot emit a lifecycle audit. Audit details and
metadata contain the customer ID, safe changed-field names, and status
transitions without raw phone, email, address, notes, or other private profile
values.

Customer balances, ledger logic, credit-payment and write-off RPCs, invoices,
payments, Dashboard, Reports, Cash Drawer, permissions, RLS, schema, and
migrations are unchanged.

## Local verification

The final local source confirmation recorded:

- focused lifecycle source contracts: 6/6;
- complete Node suite: 281/281, zero failures and zero skips;
- production-mode lifecycle E2E: 1/1, zero automatic retries;
- owner/admin/manager/cashier/technician authorization: 5/5;
- mobile reports/administration route matrix: 1/1;
- Customers dark-mode smoke: pass;
- lint: zero errors and two pre-existing `privacy-center.tsx` hook warnings;
- typecheck: pass;
- production build with `TZ=UTC`: pass;
- cleanup retries/failures: 0/0.

Discarded local harness launches and their cleanup are retained in the local
evidence. They are not represented as authenticated production proof.

## Source delivery

The reviewed source delivery was:

- pull request: #320;
- reviewed source head:
  `16f1fa9037ad998e4f8005eab17f4f44dcd9b8b8`;
- squash commit:
  `31e20a58d36657d9bca00ed13aa09c5b07711059`;
- merge timestamp:
  `2026-07-28T23:17:41Z`;
- production deployment:
  `Dn4teeYnjpW2eKEYwFfuvSvgxzde`;
- main CI:
  run `30407520538`, successful.

The production deployment was Ready and Current for the exact squash commit
before either production evidence session began. No migration or schema change
was required.

## First production attempt

The first production evidence is retained at:

`/Users/sw12/Projects/saledock-local-evidence/customer-lifecycle-audit-live-verification`

Its 12-entry manifest has SHA-256:

`3f82d47d3926524c910eab1f601f77d82cb193b7fa71c8efbff651695483a1c0`

The exact disposition is:

`INCOMPLETE PRODUCTION ACCEPTANCE - BROWSER INPUT PRECONDITION NOT ESTABLISHED`

The first marker and customer were:

- marker: `LIVE-CUSTOMER-AUDIT-20260729-0421-911A`;
- customer: `9fbf4b37-47ce-4dc0-be2f-9b7e653ea508`.

One customer and one truthful `customers.created` audit were created. The
intended Credit Limit PKR 500 was not visibly confirmed before the single
submission, and the row persisted Credit Limit PKR 0. The customer was not
retried or compensatingly updated. It was archived once, producing one
truthful `customers.archived` audit.

The customer remains archived with balance PKR 0 and zero invoices, payments,
ledger entries, credit payments, or write-offs. No application persistence
defect was concluded from this attempt, and it is not evidence that the source
correction failed.

## Successful authenticated production rerun

The successful production evidence is retained at:

`/Users/sw12/Projects/saledock-local-evidence/customer-lifecycle-audit-live-verification-rerun`

Its 22-entry manifest has SHA-256:

`d523c3a17c863e007df3d0c347cc8ec4d708b35e129fdfc990821de14008133e`

The evidence includes 12 screenshots, complete JSON/report evidence, a
verified manifest, and a clean secret scan.

The authenticated production identity was:

- Fardan Aatir;
- Owner;
- Star Shop;
- Main Branch;
- PKR;
- Asia/Karachi.

The fresh marker and customer were:

- marker: `LIVE-CUSTOMER-AUDIT-RERUN-20260729-0447-17BE`;
- customer: `b970bc25-0299-455e-b6b7-c0ffb6953bb2`.

Opening production totals were:

- customers: 9 total, 2 active, 7 archived;
- Customer Dues: PKR 405;
- Today’s Net Cash: PKR 0;
- invoices: 38;
- payments: 25;
- customer ledger entries: 6;
- credit entries: 1;
- write-offs: 0;
- branch stock quantity: 59;
- active FIFO quantity: 2,005;
- active FIFO valuation: PKR 325,340;
- supplier dues: PKR 0;
- open database shifts: 0.

### Credit Limit create gate

The Credit Limit was set last through ordinary visible browser interaction:
click, Select All, Backspace, type `500`, Tab, refocus, inspect, and Tab.

The displayed value, read-only element value, and post-blur value were all
exactly `500`. The final pre-submit screenshot is:

`screenshots/02-create-pre-submit-500.png`

One create submission persisted Credit Limit PKR 500 exactly.

### Lifecycle result

Create produced one active marked customer with balance PKR 0 and exactly one
`customers.created` audit with the exact customer ID and
`new_status: active`.

The genuine update visibly confirmed and persisted Credit Limit PKR 600 and
changed Notes from the marker Initial value to the marker Updated value. It
produced exactly one `customers.updated` audit with safe changed fields:

- `notes`
- `credit_limit`

The identical no-op form was submitted once. The profile timestamp did not
change, no database profile change occurred, and no second update audit was
created.

The first Archive produced one active-to-archived transition and one
`customers.archived` audit. Restore produced one archived-to-active transition,
cleared the archived timestamp, retained Credit Limit PKR 600, produced one
`customers.restored` audit, and removed the Restore control from the active
row. Final Archive produced one second genuine active-to-archived transition
and one second archive audit.

Final lifecycle totals were:

- `customers.created`: 1
- `customers.updated`: 1
- `customers.archived`: 2
- `customers.restored`: 1

Every audit identified Fardan Aatir, Star Shop, Main Branch, and the exact
customer ID with truthful details and metadata. No audit contained the raw
phone, email, address, initial Notes, or updated Notes value.

The final customer is archived with Credit Limit PKR 600 and balance PKR 0.
Marker invoices, payments, ledger entries, credit payments, and write-offs are
all zero. Customer Dues, Net Cash, Cash Drawer, stock/FIFO, supplier dues, and
open-shift signatures were unchanged. Duplicate customers, mutations, and
audits were zero.

Customers reload, archived-customer view, Audit Log reload, and an independent
authenticated tab all confirmed the final state.

The create and update pages remained pending and Restore initially appeared
stale. No mutation was resubmitted. Independent business and audit truth was
confirmed before one recovery reload. This remains a client-settlement
observation under the existing customer-settlement P2; this documentation does
not classify it as fixed.

## Finding closure

The fresh authenticated marker satisfied the complete production acceptance
contract:

`PASS - LIVE-CUSTOMER-AUDIT-001 FIXED`

This closes customer lifecycle auditing and reduces the active P2 register
from eight to seven. P3 remains unchanged at five.

The remaining P2 findings are:

1. `LIVE-CUSTOMER-LEDGER-001`
2. `LIVE-REPAIR-OPTIONAL-001`
3. `LIVE-INVOICE-FILTER-001`
4. `LIVE-INVOICE-THERMAL-BLANK-PAGE-001`
5. customer-settlement client completion
6. supplier-payment client settlement
7. limited cashier coverage

The remaining P3 observations are:

1. Expenses original-page settlement delay
2. Expense Restore settlement recovery
3. Expense Reset date presentation
4. Daily Closing hydration/print noise
5. narrow mobile wrapping

Customer ledger presentation remains open. Customer-settlement client
completion remains open. Limited cashier coverage remains open. No other
finding is changed or closed.

## Boundaries

No migration or schema change occurred. No financial accounting behavior,
settlement source, ledger behavior, payment, write-off, Cash Drawer,
Dashboard, Reports, permission, or RLS behavior changed.

This documentation delivery performs no production mutation and does not
repeat either customer workflow. Canonical documents remain unchanged and
stale pending a separate bounded synchronization.

SaleDock remains below audit-ready and is not MVP-live.

## Rollback

Source rollback:

`git revert 31e20a58d36657d9bca00ed13aa09c5b07711059 && git push origin main`

The two production customers and their truthful audits must remain retained;
rollback must not delete or rewrite that history.
