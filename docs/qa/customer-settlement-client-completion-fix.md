# Customer settlement client-completion correction

## Status

`KNOWN RESIDUAL CUSTOMER-SETTLEMENT CLIENT-COMPLETION RISK - P2` is corrected
on draft branch `fix/customer-settlement-client-completion-current` and remains
open until separately authorized production delivery and authenticated live
verification.

Production was not accessed or modified during this task. Operational status
remains P0 0, P1 0, P2 4, and P3 5. Supplier-payment settlement, the invoice
thermal blank page, and limited cashier coverage remain open. Invoice filtering
remains closed. SaleDock is not audit-ready and is not MVP-live.

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

The current client used `useActionState(recordCreditPaymentAction, initial)` and
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

## Evidence and delivery

Sanitized evidence is retained at:

`/Users/sw12/Projects/saledock-local-evidence/customer-settlement-client-completion-fix`

The directory is fail-closed against reuse and is sealed once with
`evidence-manifest.sha256`. Disposable runs used unique operating-system temp
directories.

The draft changes are limited to the settlement form, its Server Action
revalidation boundary, one direct contract, one production-mode E2E, and this
QA record. There is no migration, package, lockfile, workflow, supplier,
thermal-print, cashier-policy, global-loader, canonical-document, or production
change.

Rollback is the eventual draft commit revert or closure of its draft pull
request. No production rollback applies at this review stage.
