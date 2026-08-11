# Supplier Payment Client Settlement Fix

Date: 2026-08-11

Status: production verified and closed after reviewed source delivery and bounded authenticated acceptance.

## Scope

This record covers only `KNOWN RESIDUAL SUPPLIER-PAYMENT CLIENT-SETTLEMENT RISK - P2`.
It does not change supplier accounting, invoice thermal printing, cashier coverage,
customer settlement, global loading UI, date-range reporting, or canonical documents.

Starting main: `807cd3eb30a3ef3ab2e713d3787dd7fbbee1d4f6`

The source correction was delivered by PR #340 from reviewed head
`12fc9760d9afda34331b768221983161af2a86db` as squash
`ef18246ab3c67219bcafcb07876466f8a1460d46`. The authenticated production
verification below closed this finding. The operational register is now P0 0,
P1 0, P2 2, and P3 5.

## Accepted Historical Symptom

The retained historical diagnostic proved that a supplier payment could commit once,
reduce the supplier balance once, allocate the intended purchase balance once, create
one supplier ledger debit, and create one audit while the connected page remained on
`Recording...`. Independent truth and a reload showed the committed payment. The
diagnostic source is byte-for-byte the starting source used here.

Historical evidence:

`/Users/sw12/Projects/saledock-local-evidence/supplier-payment-settlement`

## Source Map

The purchase-detail and supplier-ledger forms both render
`RecordPaymentForm`. Before this correction the component invoked
`recordSupplierPaymentAction` inside an async `useTransition` callback. The same
transition also applied success state, cleared fields, and called `router.refresh()`.

The payment Action performed one `record_supplier_payment` RPC and then called five
`revalidatePath` operations before returning. In Next.js 16.2.6 those invalidations
made the Action response carry the route reconciliation payload. The connected client
therefore treated mutation settlement and page reconciliation as one transition.

The unchanged RPC in
`supabase/migrations/0031_supplier_payment_fifo_allocation.sql` remains the only
financial write path. It retains organization and branch checks, one supplier payment,
one supplier balance reduction, purchase-specific allocation or oldest-purchase FIFO,
and one supplier-ledger debit.

## Deterministic Baseline

The local harness held same-page RSC reconciliation after allowing the Action response
and exact database truth to complete. Both routes used one HTTP 200 Action POST, one
payment, one ledger debit, one audit, and no duplicate.

Purchase-specific baseline:

- Action response: 56,968 bytes and 167 newline-delimited chunks.
- Pending while reconciliation was held: true.
- Success state had been produced inside the transition: true.
- Original route truth remained coupled to the held reconciliation.

On-account baseline:

- Action response: 50,695 bytes and 168 newline-delimited chunks.
- Pending while reconciliation was held: true.
- Success state had been produced inside the transition: true.
- Original route truth remained coupled to the held reconciliation.

This isolates the client-completion risk from the RPC, database, audit, parser,
permissions, and browser environment.

## Experiments

Removing payment-path invalidations alone did not finish the original direct
`useTransition` client. Moving route refresh to an effect while retaining the direct
async transition also remained transition-coupled. This rejected the theory that one
specific invalidated route, form clearing, or the audit invocation alone caused the
stall.

The successful boundary used Action-state settlement for the mutation response and a
separate same-route reconciliation after truthful success. The final fixed Action
response is 165 bytes and 3 newline-delimited chunks for both routes. While the
separate reconciliation was deliberately held, pending was false and
`Payment recorded.` was visible.

## Baseline, Fix, Revert, Fix

The exact application source was exercised in this order with fresh production builds
and server processes:

1. Baseline: purchase-specific and on-account both remained pending while route
   reconciliation was held.
2. Fix: both routes settled before the held reconciliation.
3. Exact revert: source hashes returned to main and both baseline outcomes returned.
4. Reapplication: both fixed outcomes returned.

Every accepted case used one Action POST, exact financial truth, one audit, zero
duplicates, exact cleanup, and equal before/after signatures. Two discarded local
launches recorded Supabase Auth fetch aborts during preflight navigation; they were not
classified as settlement evidence. The final harness waits for owner preflight before
installing case listeners.

## Root Cause

Outcome C: mutation and same-page reconciliation shared the same client transition.

The server mutation completed before the connected transition could finish, but the
Action's route invalidations expanded the response into a large RSC reconciliation.
The direct async `useTransition` client then kept pending tied to that reconciliation.
This explains the dangerous state where exact accounting is committed but the
connected page can continue to imply that recording is in progress.

Confidence is high because the behavior followed the exact source across the
baseline/fix/revert/fix cycle and both supplier payment routes.

## Correction

`src/app/suppliers/purchases/actions.ts` now exposes a serializable
`SupplierPaymentActionState` and accepts the `FormData` contract required by
`useActionState`. It parses the same seven business values, calls the same RPC once,
uses the same safe error handling, writes the same audit, and returns truthful success.
Only payment-path invalidations were removed. Purchase creation and supplier write-off
invalidations remain unchanged.

`src/app/suppliers/purchases/[id]/record-payment-form.tsx` now:

- uses `<form action={action}>` with `useActionState`;
- preserves the controlled amount, method, reference, and note inputs;
- clears amount, reference, and note only after confirmed success;
- renders safe Action and client validation errors;
- synchronously locks a second same-tick activation;
- releases that lock only after pending is false;
- starts one unique `suppaystate` same-route reconciliation for each successful
  `payment_id`;
- uses no timer, retry, forced reload, or duplicate submission.

The unique query value prevents a stale no-op navigation. Mutation settlement is now
observable before route reconciliation begins, while the original connected page still
receives refreshed supplier and purchase truth.

Exact-head senior review tightened the reconciliation dependency from the constant success
message to the unique returned `payment_id`. This keeps a later legitimate payment in the
same mounted form from reusing the previous effect dependency and missing its own refresh.

## Financial and Tenant Safety

The correction does not change:

- `record_supplier_payment` or any migration;
- purchase-specific allocation;
- on-account oldest-purchase FIFO allocation;
- supplier balance arithmetic;
- supplier ledger direction, amount, or balance;
- payment or audit payloads;
- owner/admin/manager permission boundaries;
- cashier or technician denial;
- organization or branch checks;
- Dashboard or Reports formulas;
- Card Cash Drawer treatment;
- products, lots, stock movements, or FIFO inventory;
- customer settlement.

The focused E2E covers one purchase-specific Card payment, one on-account Card payment,
same-tick duplicate activation, validation and RPC failure, foreign supplier and
foreign purchase denial, and 390x844 and 320x568 mobile routes. Every fixture is
marker-owned and removed in `finally` with all 20 safety signatures restored.

## Source Contracts

`tests/supplier-payment-client-settlement.test.mjs` protects:

- three-role supplier payment authorization;
- one exact RPC and parameter contract;
- purchase ID versus on-account semantics;
- tenant, balance, FIFO, one-payment, and one-ledger RPC behavior;
- validation and error ordering before success;
- payment Action isolation from route invalidation;
- mutation settlement before unique route reconciliation;
- synchronous duplicate locking;
- visible success, safe errors, and field clearing;
- the delivered customer-settlement mechanism.

## Failure Semantics

Validation, RPC, and tenant errors return safe visible state and release pending. They
do not navigate, create a payment, reduce a balance, create a ledger debit, or create a
payment audit. The form never retries automatically. A user can correct valid input and
make a new intentional submission after pending has cleared.

## Audit Observation

Every accepted purchase-specific and on-account case observed exactly one
`supplier_payment.recorded` audit with the exact payment and supplier IDs. The payment
Action retains the existing non-awaited `logAudit` call. This settlement correction
does not change the global audit helper or claim stronger audit durability; it proves
only that no duplicate payment audit was observed in the covered cases.

## Validation Results

- Focused source contracts: 10/10.
- Retained production-mode supplier-payment E2E: 10/10.
- Fresh purchases-list, Dashboard, and Reports navigation: 2/2.
- Complete Node suite with loopback runtime in memory: 336/336.
- Lint: 0 errors and 2 pre-existing `privacy-center.tsx` hook warnings.
- Typecheck: passed.
- Production build: passed on Next.js 16.2.6 and React 19.2.4.
- Playwright automatic retries: 0.
- Cleanup retries/failures: 0/0.
- Retained safety signatures: all 20 equal.

One first Node launch was discarded because its shell omitted the loopback Supabase
key required by two seed-lot tests; the correctly configured run passed 336/336. Two
fixed-state delayed launches were discarded after local Auth fetch aborts during the
Dashboard preflight. Listener installation now begins after that preflight settles.
Two error-path launches exposed and corrected diagnostic locator assumptions without
changing product source.

An additional broad browser regression batch passed 16 cases and intentionally skipped
one dormant diagnostic. It also exposed three unrelated existing harness/workflow
boundaries: the wrong-password smoke expected a credential error while local production
mode reported unavailable CAPTCHA, the Net Cash workflow encountered the retained
return-settlement pending behavior, and the supplier-numbering browser test used a
non-hermetic single-owner lookup against two existing local Owner profiles. Their
hermetic Node accounting, numbering, cash, role, and FIFO contracts passed in the
336/336 suite. No fixture or open shift remained from those launches.

## Retained Evidence

Evidence is sealed outside Git at:

`/Users/sw12/Projects/saledock-local-evidence/supplier-payment-client-settlement-fix`

It includes the source map, unchanged RPC contract, baseline/fix/revert/fix results,
both payment shapes, error and tenant probes, financial and stock safety, mobile
results, screenshots, cleanup, and a SHA-256 manifest. The explicit writer target is
fail-closed and was used once.

Manifest: `bd5c9df01d70f63ac806ed0929a1f5311770467892498b1236ad840a14c3c8ba`

Manifested entries: 33.

## Source Delivery

- Source PR: #340.
- Reviewed head: `12fc9760d9afda34331b768221983161af2a86db`.
- Squash: `ef18246ab3c67219bcafcb07876466f8a1460d46`.
- Merge timestamp: `2026-08-11T06:46:34Z`.
- Main CI: run `31466341832`, successful.
- Production deployment: `dpl_BC1XXFMfhvtpDr9eDnL5XfkSERKT`, Ready, Current,
  Production, and sourced from the exact squash.
- Root and login availability: HTTP 200/200.
- Migration/schema change: none.

## Authenticated Production Verification

Authenticated identity was Fardan Aatir, Owner, Star Shop, Main Branch, PKR, and
Asia/Karachi. Production initially had no safe supplier debt. Under explicit owner
authorization, exactly two retained synthetic records were temporarily restored:

- supplier `c703191b-6b8f-4026-9052-2cde834d2f1e`,
  `LIVE-PURCHASE-20260723-2224-K9Q4 Supplier`;
- product `b0be3f44-78ff-4ce6-a9ec-fb7e310cc206`,
  `LIVE-PURCHASE-20260723-2224-K9Q4 Product`.

The restore actions changed only active/archive state. Supplier outstanding, purchase
history, product quantity, cost, price, stock movements, and FIFO truth were unchanged.
The supplier restore has no audit in the existing source contract; product restore also
has no audit. No other supplier or product was restored or created.

Fixture marker `LIVE-SUPPLIER-SETTLEMENT-FIXTURE--9F2C` created exactly one ordinary
supplier purchase, `PUR-000002` (`84fdbb9e-44ff-4107-abb5-f668a7e57b14`), containing
one unit of the synthetic product at PKR 20, no discount, and no upfront payment. This
created PKR 20 supplier debt, one purchase item, one purchase-credit ledger entry, one
purchase audit, one stock movement, and one PKR 20 FIFO lot. Existing `PUR-000001`
remained PKR 300 total, PKR 300 paid, PKR 0 due, and paid. The owner-accepted permanent
fixture effect is +1 synthetic unit and +PKR 20 FIFO valuation.

### Purchase-specific route

Marker `LIVE-SUPPLIER-PURCHASE-PAY--A7D9` submitted one PKR 10 Card payment from the
new purchase page. One user submission produced one HTTP 200 Action POST, one payment
with the exact purchase ID, one debit ledger entry, and one observed ordinary
`supplier_payment.recorded` audit. The original connected page entered `Recording...`,
disabled the button, cleared pending, rendered `Payment recorded.`, cleared the fields,
and refreshed without manual reload. `PUR-000002` moved from unpaid / PKR 0 paid /
PKR 20 due to partial / PKR 10 paid / PKR 10 due. Supplier outstanding moved from
PKR 20 to PKR 10. Duplicates were zero.

### On-account route

Marker `LIVE-SUPPLIER-ACCOUNT-PAY--B3F2` submitted one PKR 10 Card on-account payment
from the supplier ledger. One user submission produced one HTTP 200 Action POST, one
payment with `purchase_id` null, one debit ledger entry, and one observed ordinary
audit. The connected page entered `Recording...`, disabled submission, cleared pending,
applied the successful Action state, and reconciled supplier and purchase truth without
manual reload. The success-only `suppaystate` transition was observed. Because the
successful reconciliation reduced outstanding to zero, the payment form unmounted and
the static post-reconciliation snapshot did not retain the transient success text.
No retry or resubmission occurred.

The on-account FIFO allocation applied the exact remaining PKR 10 to `PUR-000002`, the
oldest and only eligible debt. Spillover was zero. The purchase became paid / PKR 20
paid / PKR 0 due, supplier outstanding became PKR 0, and duplicates were zero.

### Reconciliation and final state

Across the two distinct submissions there were exactly two POSTs, two PKR 10 Card
payments, two PKR 10 debit ledger entries, and two observed ordinary payment audits.
Supplier Dues moved PKR 0 before the fixture to PKR 20, PKR 10, then PKR 0. Net Cash,
physical Cash Drawer, open shifts, and Customer Dues were unchanged. Payment-stage
product quantity, stock movements, inventory FIFO quantity, and FIFO valuation were
unchanged. Tenant mismatches and duplicate rows were zero. Dashboard and Reports
displayed the expected supplier dues and paid purchase truth.

After all payment, audit, stock, and tenant truth was reconciled, the product and
supplier were each archived once through the ordinary UI. The product archive emitted
one normal `product.archived` audit; supplier archive has no audit in the current source
contract. Final state:

- supplier archived with PKR 0 outstanding;
- product archived with quantity 9 and FIFO valuation PKR 820;
- permanent pre-fixture delta retained at +1 unit and +PKR 20 valuation;
- `PUR-000002`, its item, stock movement, FIFO lot, both payments, both payment ledger
  entries, and all truthful audits retained;
- archive actions created no stock or financial effect.

Fixture evidence is sealed at
`/Users/sw12/Projects/saledock-local-evidence/supplier-payment-production-fixture` with
manifest SHA-256
`47d352d6d0a16f8b1dadc438218b5faa39d48abf09ec30f134e32d47ee90f0c9`.
Live settlement evidence is sealed at
`/Users/sw12/Projects/saledock-local-evidence/supplier-payment-client-settlement-live-verification`
with 39 entries, 18 screenshots, and manifest SHA-256
`8b7c85efaee5b403fcde3887f7c4091a3302b64559cafefaa99432997cde5fe5`.

## Closure

`PASS - SUPPLIER-PAYMENT CLIENT SETTLEMENT FIXED`.

The finding is closed because both distinct supplier-payment routes committed once,
their original connected pages settled and refreshed without manual reload, financial
allocation was exact, ordinary audits were observed, duplicate counts were zero, Card
had no Cash Drawer effect, payment-stage inventory was unchanged, and the temporary
synthetic records returned safely to their archived states.

P0 remains 0, P1 remains 0, P2 is reduced from 3 to 2, and P3 remains 5. Remaining P2
findings are `LIVE-INVOICE-THERMAL-BLANK-PAGE-001` and accepted limited Cashier
coverage. Customer settlement and invoice filters remain closed. Classification remains
`FINISHING ACCEPTED WITH LIMITED COVERAGE`; SaleDock remains below audit-ready and is
not MVP-live. Canonical synchronization is deferred.

## Rollback

Source rollback:

`git revert ef18246ab3c67219bcafcb07876466f8a1460d46 && git push origin main`

The focused live-documentation squash can be reverted separately after it is merged.
No database rollback or migration is involved. Do not delete the truthful synthetic
purchase, stock receipt, FIFO lot, payments, ledger entries, or audits. The accepted
+1 synthetic stock unit and PKR 20 FIFO valuation remain retained QA history.
