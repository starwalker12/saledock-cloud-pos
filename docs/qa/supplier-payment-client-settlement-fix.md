# Supplier Payment Client Settlement Fix

Date: 2026-08-11

Status: draft source correction ready for owner review. Production is unchanged.

## Scope

This record covers only `KNOWN RESIDUAL SUPPLIER-PAYMENT CLIENT-SETTLEMENT RISK - P2`.
It does not change supplier accounting, invoice thermal printing, cashier coverage,
customer settlement, global loading UI, date-range reporting, or canonical documents.

Starting main: `807cd3eb30a3ef3ab2e713d3787dd7fbbee1d4f6`

The operational register remains P0 0, P1 0, P2 3, and P3 5 until a later reviewed
merge and authenticated production verification close this finding.

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
- starts one unique `suppaystate` same-route reconciliation after success;
- uses no timer, retry, forced reload, or duplicate submission.

The unique query value prevents a stale no-op navigation. Mutation settlement is now
observable before route reconciliation begins, while the original connected page still
receives refreshed supplier and purchase truth.

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

## Delivery Boundary

There is no migration, package, lockfile, workflow, global audit-helper, Dashboard,
Reports, Cash Drawer, stock/FIFO, or production change in this draft.

The finding remains open until owner review, reviewed merge, exact production
deployment, and bounded authenticated purchase-specific and on-account verification.
Customer settlement and invoice filters remain closed. The invoice thermal and limited
cashier P2 findings remain open. P2 remains 3 and P3 remains 5 during source review.
SaleDock remains `FINISHING ACCEPTED WITH LIMITED COVERAGE`, below audit-ready, and not
MVP-live.

## Rollback

Before merge, close the draft PR and retain or delete the isolated branch/worktree.
After a future squash merge, revert only that reviewed squash commit and push main.
No database rollback or migration is involved.
