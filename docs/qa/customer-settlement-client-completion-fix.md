# Customer settlement client-completion correction

## Status

`KNOWN RESIDUAL CUSTOMER-SETTLEMENT CLIENT-COMPLETION RISK - P2` is closed.
PR #338 was squash-merged and the exact deployed correction passed one bounded
authenticated production settlement on 11 August 2026.

Operational status is P0 0, P1 0, P2 3, and P3 5. Supplier-payment settlement,
the invoice thermal blank page, and limited cashier coverage remain open.
Invoice filtering remains closed. The finishing classification remains
`FINISHING ACCEPTED WITH LIMITED COVERAGE`. SaleDock is not audit-ready and is
not MVP-live. Canonical synchronization is deferred.

## Retained symptom

The retained production symptom was one successful Customer Settlement request
whose payment, customer ledger, invoice allocation, balance, and audit committed
exactly once while the connected form remained disabled on `Processing...`.
Independent authenticated truth and one reload showed the committed result.

The preserved investigation worktree is:

`/Users/sw12/Projects/saledock-customer-settlement-client-completion`

Its untracked diagnostic is:

`tests/e2e/customer-settlement-client-completion-investigation.spec.ts`

The diagnostic SHA-256 remains:

`a1e81833205e4916d8683a91fa3b85a922d2b4013e9e8e7cb3269241425257af`

The old worktree and diagnostic were read only and were not staged, modified,
cleaned, switched, or reused.

## Current source map

The pre-correction client used `useActionState(recordCreditPaymentAction, initial)` and
displayed `Processing...` from React's pending state. The Server Action verified
the authenticated organization-owned customer, called
`record_credit_payment` exactly once with the established parameters, invoked
the existing `customer.credit_payment` audit, called four `revalidatePath`
operations, and returned `Credit payment recorded successfully.`

The RPC remains the atomic accounting boundary for payment creation, invoice
allocation, customer ledger entries, and customer balance. Its implementation,
parameters, roles, validation, audit amount, and tenant scope were not changed.

## Deterministic reproduction

All source experiments used a fresh production build, a production-mode Next
server, loopback Supabase values read only from `supabase status --output json`,
an authenticated local Owner, an Asia/Karachi browser, and zero Playwright
automatic retries. No `.env.local` was created.

Normal baseline timing completed three sequential Card settlements 3/3. A
local HTTP transport harness then delayed the combined Server Action and route
reconciliation response only after the server response contained the truthful
success result. The exact restored baseline produced 3/3 qualifying failures:

- one HTTP 200 Action POST per submission;
- exact FormData and one RPC result;
- one payment, one credit-ledger effect, and one audit per settlement;
- exact invoice allocation and customer balance;
- connected form still mounted and stuck on `Processing...` for 30 seconds;
- no success applied and the original balance stayed stale;
- independent page and reload showed the committed truth;
- no duplicate and complete cleanup.

Removing only the four settlement-path invalidations made the Action response
small and independently settleable. The client cleared pending and displayed
success before a separately delayed customer-page reconciliation was released.
Restoring the exact baseline reproduced 3/3 stalls again. Reapplying the
decoupled design removed them again.

This baseline/fix/revert/fix result establishes:

`OUTCOME B - SERVER ACTION / REVALIDATION DOES NOT COMPLETE`

The financial RPC was complete. The client remained pending because the
mutation Action response also carried route-revalidation reconciliation, so a
delayed or interrupted reconciliation stream withheld the ActionState result.

## Correction

`recordCreditPaymentAction` no longer performs its four path invalidations. It
returns the confirmed mutation result directly after the unchanged RPC and
audit invocation.

After the ActionState success is applied, `SettlementForm`:

1. resets the form;
2. creates a unique value in the customer page's existing `paystate` query
   slot;
3. performs a same-route `router.replace(..., { scroll: false })` outside the
   mutation Action transition.

The unique same-route navigation refreshes server-rendered customer truth after
the Action has already settled. A plain `router.refresh()` experiment was
rejected because one retained repeat cleared pending and showed success but
reused a stale PKR 800 page result instead of displaying PKR 500. That unsealed
run is preserved separately at:

`/Users/sw12/Projects/saledock-local-evidence/customer-settlement-client-completion-fix-discarded-stale-refresh`

The final implementation also adds a same-tick form lock. A rapid second
activation is prevented before React's pending render can disable the button.
The lock clears only after pending becomes false. No timer, sleep, optimistic
financial success, retry, second RPC, or database idempotency change was added.

## Final settlement proof

The final production-mode run passed 5/5:

- three normal Card settlements of PKR 400, PKR 300, and PKR 500;
- one Action POST, one payment, one credit-ledger entry, and one audit per
  settlement;
- customer balances PKR 800, PKR 500, and PKR 0 rendered in the connected page;
- exact invoice paid/due/status transitions retained;
- pending began and ended, success rendered for partial settlements, and the
  fully settled page replaced the form at zero balance;
- the rapid double activation on the first payment produced one Action POST and
  one mutation;
- optional reference and notes normalization remained unchanged;
- no manual reload was used for normal success.

The deterministic delayed-refresh case passed 1/1. The HTTP 200 Action response
settled pending and displayed success while the separate page reconciliation
was still deliberately held. Releasing that read rendered the exact PKR 800
balance with one payment, one ledger entry, and one audit.

The RPC overpayment error and a forged foreign-organization customer attempt
each released pending, displayed a safe error, and created zero local or foreign
financial mutations. The ordinary owner/admin/manager/cashier roles remain
allowed and technician remains denied.

## Accounting and presentation boundaries

All final settlements used Card. Customer balances and invoice allocation
changed exactly once, while physical Cash Drawer and daily-closing signatures
remained unchanged. The isolated Dashboard net-cash regression passed its full
Card/Cash matrix: Card activity contributed zero physical cash, Cash activity
reconciled the drawer, and cleanup restored its safety snapshot.

Dashboard customer-dues, Daily Closing physical-cash, return-profit, customer
ledger, lifecycle-audit, validation, tenant, and Karachi-day source contracts
all passed. No payment amount, method, ledger sign, FIFO, stock, Cash Drawer,
Net Cash, permission, organization, or audit payload semantics changed.

The settlement controls passed at 390x844 and 320x568 with all fields and the
submit control reachable and no horizontal overflow.

## Validation and cleanup

Accepted results:

- focused settlement contracts: 8/8;
- focused accounting and directly affected contracts: 78/78;
- complete Node suite with loopback values in memory: 330/330;
- focused production-mode settlement E2E: 5/5;
- role authorization matrix: 5/5;
- isolated Dashboard Card/Cash reconciliation E2E: 1/1;
- Playwright automatic retries: 0;
- typecheck: pass;
- final production build with `TZ=UTC`: pass.

The first complete Node launch supplied no local Supabase keys to its shell:
328 tests passed and two seed-stock tests refused to start. That launch was
discarded and the correctly configured 330/330 run replaced it.

One combined affected-browser launch recorded two unrelated local-harness
assumptions: the wrong-password smoke did not render its exact expected copy,
and the customer lifecycle E2E selected a different active Owner row than the
hardcoded `owner@saledock.local` session. The lifecycle audit itself existed.
The exact role matrix passed separately. A masked Dashboard cleanup failure from
that combined launch left one test-owned shift and temporary owner hierarchy;
those exact rows were removed and verified absent before the isolated 1/1
Dashboard rerun. No SaleDock source was changed for these harness results.

The retained settlement run removed every generated customer, invoice, item,
payment, ledger entry, audit, and related fixture with cleanup counts all zero.
All measured before/after signatures were equal. Expected local-only 406 UI
preference reads and aborted Vercel analytics assets were recorded; page errors,
unexpected console errors, and unexplained request failures were zero.

## Source delivery

Owner-reviewed PR #338 used base
`efbe4037b93b99a2384d358f91bc29d927db8e70` and reviewed head
`6e418031f2ab71275d51e8862d576942fbeec08c`. It was marked ready after the
exact-head gates and squash-merged at `2026-08-10T23:26:12Z` as
`b2f77e6822c711515c73f4376965db9b23c12675` with title
`fix: settle customer payment UI reliably`.

Main CI run 31442341898 succeeded. Vercel production deployment
`dpl_4gt1oor4Y8dyci2z7dwUKggA2i6X` became Ready and current for the exact source
squash. The canonical and login URLs returned HTTP 200. No migration or schema
change was present.

## Authenticated production verification

The authenticated session was Fardan Aatir, Owner, Star Shop, Main Branch, PKR,
and Asia/Karachi. The bounded case used an existing retained `[DEMO]` synthetic
customer with no indication of ordinary customer use. Its opening balance was
PKR 360.

Marker `LIVE-CUSTOMER-SETTLEMENT-20260811-0428-1745` submitted PKR 10 by Card
exactly once. Browser network evidence recorded one customer Server Action
POST and HTTP 200. The connected form entered disabled `Processing...`, pending
then cleared, `Credit payment recorded successfully.` rendered, the form reset,
and the original page displayed PKR 350 without a manual reload.

Persisted truth was exact:

- one PKR 10 Card `credit_payments` row with the marker reference and notes;
- one customer-ledger credit with balance after PKR 350;
- one PKR 10 allocation to the oldest eligible invoice, changing its paid/due
  values from PKR 800/360 to PKR 810/350 while keeping status `partial`;
- the retained imported duplicate invoice remained unchanged at PKR 800/360;
- one `customer.credit_payment` audit for the exact actor, organization, branch,
  customer, amount, and method;
- zero duplicate POST, payment, ledger entry, audit, balance change, or
  allocation.

A fresh independent authenticated customer page displayed PKR 350 and the
exact settlement history. It was used only after the original connected page
had already passed.

Customer Dues decreased from PKR 405 to PKR 395. Dashboard Today's Net Cash
remained PKR 0. Daily Closing classified PKR 10 as digital credit collection,
PKR 0 as cash credit collection, and expected cash as PKR 0. There was no open
cash shift and no physical Cash Drawer effect.

Branch product quantity remained 59, active FIFO quantity remained 5,485, FIFO
valuation remained PKR 845,322, supplier dues remained PKR 0, and supplier
payment count remained one. Payment, ledger, and audit organization/branch
scope was exact and tenant mismatches were zero.

This production result closes the customer-settlement client-completion P2. It
does not close supplier-payment client settlement, the invoice thermal blank
page, or limited cashier coverage. It does not add authenticated cashier
production coverage.

## Evidence and delivery

Sanitized evidence is retained at:

`/Users/sw12/Projects/saledock-local-evidence/customer-settlement-client-completion-fix`

The directory is fail-closed against reuse and is sealed once with
`evidence-manifest.sha256`. Disposable runs used unique operating-system temp
directories.

Authenticated production evidence is retained separately at:

`/Users/sw12/Projects/saledock-local-evidence/customer-settlement-client-completion-live-verification`

Its sealed `evidence-manifest.sha256` has SHA-256
`ae3d733a7ac0c3973f86a4dfc8ad30bf74a399eeed277d53a31176a3add2f538`.
The bundle contains sanitized deployment, browser lifecycle, action-request,
payment, ledger, invoice-allocation, audit, Dashboard, Daily Closing, cash,
stock/FIFO, tenant, duplicate, independent-page, and screenshot evidence. It
contains no credentials, cookies, tokens, request headers, or raw Server Action
identifiers.

The delivered source changes are limited to the settlement form, its Server Action
revalidation boundary, one direct contract, one production-mode E2E, and this
QA record. There is no migration, package, lockfile, workflow, supplier,
thermal-print, cashier-policy, global-loader, or canonical-document change.

Source rollback is:

`git revert b2f77e6822c711515c73f4376965db9b23c12675 && git push origin main`

The truthful synthetic production payment and its ledger/audit history must be
retained. This focused live-verification documentation change does not mutate
production.
