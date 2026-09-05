# Return success pending settlement

## Scope

Task 32176 corrects the Invoice Return form lifecycle after a successful,
durable `create_invoice_return` call. Task 66831 continues the same draft after
its delivery gate found that the client wrapper swallowed auth redirect control
flow. Task 84751 delivered the reviewed source and completed one bounded
authenticated production acceptance. The work remains limited to the Return
Server Action response boundary, client auth/success/error settlement,
submission integrity, focused tests, and this QA record.

No Return SQL, migration, eligibility, permission, refund, customer ledger,
FIFO, stock movement, invoice, numbering, or accounting rule changed.

## Starting point

- Main: `7a7c2fbd9e08ab4d3607a25580329a029c65dd78`
- Branch: `fix/return-success-pending-settlement`
- First blocked PR head: `9606d73c202ed50f36b25fff517573109dde757c`
- Implementation-stage production access or mutation: none
- Test target: local Supabase and local Next.js production/development servers

## Exact reproduction

The production-mode reproduction uses an isolated invoice containing a
physical product and a service, an allocated FIFO lot, and a customer with an
outstanding balance. A local HTTP proxy forwards all Supabase traffic and, only
after `create_invoice_return` completes, holds server-originated REST reads.

On untouched main, one click produced all expected durable truth:

- one Server Action request;
- one `create_invoice_return` RPC;
- one Return and Return Item;
- one Return stock allocation and one `return_in` movement;
- product quantity `3 -> 4`;
- FIFO lot remaining quantity `3 -> 4`;
- customer outstanding `150 -> 0`;
- one refund credit ledger entry.

While those rows were already durable, the original action response remained
open, the browser stayed at `Processing return...`, and no success state was
delivered. The same focused browser test failed on main for that reason and
passes after the correction.

## Root cause

The Return Action ran six `revalidatePath` calls in the same Server Action
response as the already-completed RPC. Next.js kept that response and its route
reconciliation work open while the held server reads were unresolved.
`useActionState` therefore remained pending even though the Return transaction
had committed. The form's render-time success-preservation setters were an
invalid secondary pattern, but they were not the cause because the action state
had not reached the browser.

The disabled controls, persistent authenticated shell, Supabase RPC, response
serialization, and FIFO/customer accounting were not the blocking layer.

## Correction

After the RPC succeeds, the Action now returns its confirmed result before
post-response cache reconciliation and the existing action-level audit. All six
cache invalidations remain present and run through Next.js `after`:

- Invoice detail;
- Invoices;
- Returns;
- Products;
- Customers;
- Dashboard.

The client preserves a confirmed success in the settled action callback, then
starts one unique same-route `router.replace` reconciliation. Success is
visible while that read is pending. No timer, automatic retry, duplicate RPC,
or optimistic success was introduced.

The form also:

- blocks same-tick duplicate submits;
- reports an interrupted/unknown action response as uncertain;
- keeps uncertain submissions locked until the invoice is refreshed;
- clears pending and re-enables submission after a confirmed RPC error;
- announces success with `role="status"` and `aria-live="polite"`;
- announces errors with `role="alert"`;
- exposes form progress through `aria-busy`.

The partial-return matrix found a separate client submission-integrity defect:
an exhausted disabled quantity input was omitted from `FormData`, shifting the
remaining item quantities against their item IDs. An exhausted row now submits
an explicit hidden zero so the existing positional Server Action contract stays
aligned. This does not change Return eligibility or mutation mathematics.

## Auth redirect correction

The mandatory delivery auth gate removed the authenticated browser session
after the Return page loaded and then submitted once. Middleware correctly
started navigation to `/login`, and no Return RPC or mutation ran, but the
client `catch` treated the framework control flow as an uncertain business
result. The stale Invoice page remained visible and locked.

The correction avoids private or unstable Next.js exception inspection. The
Return Action now exposes one narrow typed field whose only values are
`/login` and `/setup`, and returns either auth destination before validation or
the `create_invoice_return` RPC. The client handles those confirmed results
with `router.replace`. When middleware intercepts an unauthenticated Action
POST before the typed result can reach the browser, the client checks its
Supabase session: an absent session routes explicitly to `/login`; a present
session, or a failed auth-state check, retains the existing uncertain-result
lock. This keeps a real transport interruption distinct from lost auth without
matching `NEXT_REDIRECT`, parsing digests, or importing `next/dist` internals.

The production-mode login regression now proves one Action POST, zero Return
RPCs, zero Return/Return Item/stock/customer-ledger mutations, navigation to
`/login`, no uncertain alert, and no automatic retry. The `/setup` path is
protected by the focused Action contract rather than a browser fixture because
constructing a profile-less authenticated workspace would bypass the normal
route bootstrap. The contract proves both auth results precede the sole Return
RPC and accept no other destination.

## Connected proof

The fixed production-mode browser matrix passed with automatic retries set to
zero:

- durable Return success while post-response reads were held;
- expired auth leaves the workspace for `/login` with zero Return RPC/mutation;
- rapid same-tick activation: one Action, one RPC, one Return;
- partial physical Return with Card refund and FIFO restock;
- second legitimate partial Return with zero payout and no restock;
- service Return with Cash refund and no stock movement;
- customer outstanding and one refund ledger credit reconciled exactly;
- confirmed RPC error rolled back and cleared pending;
- interrupted action response showed uncertain truth and did not retry;
- mobile widths `320x568`, `390x844`, and `430x932` had no overflow;
- persistent sidebar remained mounted and no workspace pause appeared.

The held-reconciliation and expired-auth controls both passed in Next.js
development mode. Development emitted the pre-existing request-nonce hydration
diagnostic; the harness classifies it only under an explicit dev-control flag.
In production-mode runs, a loopback `/auth/v1/user` request cancelled by client
navigation is accepted only when Playwright observes the matching
`net::ERR_ABORTED`; an unpaired fetch error still fails the test.

## Regression proof

- Focused Return/browser scenarios: `5/5`.
- Development-mode Return/auth controls: `2/2`.
- Focused Return and cross-surface Node contracts: `107/107`.
- Loading and persistent-shell browser scenarios: `7/7`.
- Active-workspace browser scenarios: `5/5`.
- Complete Node suite with local Supabase environment: `434/434`.
- Return A4/80mm artifact generation completed with valid outputs and fixture
  cleanup. Its legacy final no-write assertion still treats the current-main
  active-workspace claim/heartbeat RPCs as unexpected writes.
- The older Return profit browser test reaches Return submission but is blocked
  by the current cookie banner. Its static accounting/FIFO contracts pass and
  the new connected Return matrix independently proves the same mutation truth.
- The older customer-ledger presentation browser fixture has a pre-existing
  Returns-tab count mismatch; its source/accounting contracts pass.
- The older Dashboard widget browser test is blocked by the current cookie and
  mobile chrome overlays; all Daily Closing cash-refund contracts pass.

These three legacy harness limitations are unrelated to the two Return source
files and are not represented as passing browser runs.

## Safety

Every task-owned local customer, product, lot, invoice, Return, Return Item,
allocation, movement, customer ledger entry, and audit marker was removed.
Opening/closing marker counts are zero. The implementation and correction tasks
did not access production.

The correction uses no private Next.js internals and adds no migration, RPC,
retry, timer, or auth redesign.

## Production delivery and verification

Owner-authorized Task 84751 delivered PR #362 at reviewed head
`9101f43260378967a95e952abad91105ed2f1c8c`. The source was squash-merged as
`f112c07da9e2c4b020ba49434360dfdf19b2a43b` at
`2026-09-04T01:56:26Z`. Main CI run `33827646199` succeeded. Vercel deployment
`dpl_6eBFez7Zpw42SDeTXztwfQKiD6B4` became Ready, Current, and Production for the
exact source squash; the public root and login routes returned HTTP 200.

The authenticated Owner acceptance used one disposable PKR 10 service-only
invoice with one service Invoice Item, no customer, no product, no payment, no
stock, and no customer-ledger row. The browser submitted `Process return`
exactly once with quantity 1, refund amount zero, and no payout method. Vercel
recorded exactly one successful Server Action POST. `Processing return...`
appeared only while pending and settled to `Return Processed` after an observed
23,588 ms, with Return `RET-001010`, `Refund Amount: PKR 0`, `View return`, and
`Refresh invoice` visible without a manual refresh.

Database reconciliation found exactly one completed Return and one service
Return Item. Refund amount was zero, refund method was null, and the service
item was not restocked. Return stock allocations, stock movements, customer
ledger entries, and payments were all zero. One synchronous
`return.completed` audit and one eventual `returns.created` audit were present.
Refresh Invoice showed the item as fully returned and retained the previous
Return link. View Return opened the completed Return document, and the Returns
list showed the same Return with no payout.

The persistent authenticated shell remained stable: no SidebarLoading, sidebar
width jump, duplicate Topbar, active-workspace takeover, route-level reclaim,
or session loss appeared. Production Return detail at `390x844` had a 390 px
document width with no horizontal overflow. The live success state was observed
at the normal desktop viewport; the sealed exact-head local proof remains
authoritative for the `320x568`, `390x844`, and `430x932` success layout and its
`role="status"` / `aria-live="polite"` contract.

The exact-head local proof remains retained for Cash and Card refunds, one
customer refund ledger credit, FIFO Restock, no-restock, expired-auth login,
setup routing, uncertain-network locking, and confirmed-error recovery. Those
money, stock, auth-loss, and failure paths were not deliberately exercised in
production.

Cleanup deleted only the exact disposable fixture and its two audit rows. Final
fixture-linked counts were zero for Invoices, Invoice Items, Returns, Return
Items, Return Stock Allocations, Stock Movements, Customer Ledger, Payments,
and audit rows. All 32 opening/closing protected relation counts and digests
matched exactly, so permanent SaleDock production business-data mutation was
zero.

Production evidence is sealed at
`/Users/sw12/Projects/saledock-local-evidence/return-success-pending-settlement-production-verification`.
The SHA-256 of `evidence-manifest.sha256` is
`6edd9e7d608195d49dfa3485a22afef081076b542657524a91dadad542c432f2`.

The original durable-success stuck-pending defect is closed and production
verified.

Exchange, accounting ledger ordering/schema, Supplier Statement correction,
Customer period ledger work, Audit Log work, and Cashier/security work remain
outside this task.
