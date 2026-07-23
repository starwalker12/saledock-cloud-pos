# Supplier purchase number generation fix

Date: 2026-07-23

Finding: `LIVE-SUPPLIER-PURCHASE-001`

Severity: P1

Status: Purchase-number correction proven locally and authorized for independent delivery. Supplier payment client settlement remains an accepted, unresolved P2 risk.

## Live blocker

Authenticated production acceptance on main `2f71c5f740488b51eabe820cbe371ff807a860b0` used marker `FINISH-QA-20260720-1548-A79D`, an active disposable supplier, and a physical product with opening stock 5. One unpaid purchase submission used quantity 3, unit cost PKR 100, discount 0, and amount paid 0.

The user saw: `We couldn't save this purchase. Please try again.`

Independent read-only verification found zero supplier-purchase headers, items, supplier-balance delta, supplier-ledger entries, product-stock delta, FIFO-lot delta, stock-movement delta, supplier payments, and duplicates. The live transaction failed atomically. The marked supplier and product were archived; no false financial or stock history was created.

## Baseline local reproduction

The complete local migration chain through `20260720093639_product_opening_stock_fifo_atomicity.sql` was running against loopback Supabase. A disposable active supplier and a physical product were created through the current atomic product-create RPC with opening stock 5, unit cost 100, sale price 150, one opening lot, and one opening movement.

One authenticated Owner RPC call then used the same unpaid purchase shape as production. It failed with:

- SQLSTATE: `42702`
- Message: `column reference "purchase_no" is ambiguous`
- Detail: `It could refer to either a PL/pgSQL variable or a table column.`
- Function: `public.create_supplier_purchase`
- Statement: the next-number aggregate over `public.supplier_purchases`
- Hint: none

The local database linter independently identified the same `42702` at the unqualified `purchase_no` expression. The failed transaction left zero purchase, item, purchase lot, purchase movement, supplier ledger, supplier payment, supplier-balance, or product-stock changes. The opening product remained at stock/FIFO 5 until exact fixture cleanup.

The production-mode browser baseline submitted once, rendered the same safe generic message, and retained the same zero-write state. No database internals were exposed to the application UI.

## Root cause

Migration `0016_supplier_purchases_ledger.sql` was still the final effective definition of `public.create_supplier_purchase`. Its `RETURNS TABLE` declaration creates an output parameter named `purchase_no`, while the next-number query also referenced `purchase_no` without a table alias. PL/pgSQL could not choose between the output parameter and `supplier_purchases.purchase_no`.

The application action, validation, RLS, browser input, and safe-error mapper were not the cause. The safe-error mapper correctly concealed the internal SQL error from the browser.

## Migration

`20260720135013_fix_supplier_purchase_number_ambiguity.sql` replaces only `public.create_supplier_purchase` and preserves its signature and return shape.

The numbering query now uses:

- `from public.supplier_purchases sp`
- `sp.purchase_no`
- `sp.organization_id`

The existing per-organization row lock, `PUR-` prefix, six-digit minimum padding, transaction boundary, accounting formulas, status formulas, FIFO behavior, supplier-balance behavior, payment behavior, and ledger directions remain unchanged. No dynamic SQL, transform, background repair, or historical rewrite is introduced.

## Security review

The existing Server Action permits Owner, Admin, and Manager through `canManageSupplierPurchases`, but the old direct RPC did not enforce that role contract. It also accepted a caller-supplied branch without proving that the branch was active and belonged to the caller's organization, and it did not reject an inactive supplier.

The replacement adds the smallest matching database guards:

- active profile required;
- Owner, Admin, or Manager required;
- active same-organization branch required;
- active same-organization supplier required;
- active same-organization physical product required;
- negative discounts rejected, matching existing application validation.

The function remains `security invoker` with `search_path = public`. Execute is revoked from `public`, `anon`, and `service_role`, and granted only to `authenticated`, matching the hardened opening-stock RPC precedent. RLS is not weakened.

Local direct-RPC evidence:

- Owner: accepted
- Admin: accepted
- Manager: accepted
- Cashier: rejected
- Technician: rejected
- Anonymous: rejected
- Service role: rejected
- Foreign branch: rejected
- Inactive branch: rejected
- Foreign supplier: rejected
- Inactive supplier: rejected
- Foreign product: rejected
- Inactive product: rejected
- Service product: rejected

## Database and atomicity evidence

The focused local RPC matrix passed 4/4 test contracts.

- Unpaid: quantity 3 at 100 produced subtotal/grand total 300, amount paid 0, balance 300, unpaid status, supplier due +300, one purchase-credit entry, stock/FIFO +3, one purchase lot, one purchase movement, and no payment.
- Paid Card: quantity 2 at 100 produced paid status, balance 0, supplier net due 0, one credit, one debit, one payment, stock/FIFO +2, and no Cash Drawer state change.
- Partial: quantity 4 at 100 with 100 paid produced partial status, balance 300, supplier net due +300, correct credit/debit entries, and stock/FIFO +4.
- Discount: line total 300 with discount 25 produced grand total/due 275 while stock remained quantity-based at +3.
- Multiple items: one header, two items, two lots, two movements, correct 350 total, and exact product stock changes.
- Invalid inputs: empty items, zero/negative quantity, negative unit cost, negative discount, negative payment, overpayment, service product, inactive product/supplier, foreign product/supplier/branch, unauthenticated calls, and restricted roles were rejected.
- Numbering: an inserted highest same-organization number produced the exact next number; a higher foreign-organization number was ignored.
- Concurrency: two bounded concurrent calls received distinct sequential numbers under the retained organization lock.
- Forced rollback: a test-only local trigger rejected the first purchase lot after header insertion; no header, item, purchase lot, purchase movement, stock delta, supplier-balance delta, ledger, or payment survived.

All disposable suppliers, products, purchases, items, payments, ledger entries, lots, movements, and audits were removed. Every available requested business-table signature matched before and after. The requested `cash_movements` table does not exist in the current schema; `cash_shifts` was available and unchanged.

## Browser evidence

Two local production-mode Chromium launches passed 1/1 with zero Playwright retries before the final validation pass.

It created one unpaid purchase through the visible form, confirmed one HTTP 200 Server Action POST, opened the generated `PUR-` detail, and verified:

- product stock 5 to 8;
- FIFO remaining 5 to 8;
- one additional quantity-3 purchase lot;
- one purchase movement;
- supplier due 0 to 300;
- one purchase-credit ledger entry;
- zero supplier payments;
- one `supplier_purchase.created` audit;
- persistence after reload;
- no duplicate.

It then recorded one Card payment of 300 through the visible form and verified:

- one HTTP 200 payment Server Action POST;
- purchase status paid;
- purchase due 0;
- supplier balance 0;
- one supplier payment;
- one payment-debit ledger entry;
- one `supplier_payment.recorded` audit;
- unchanged `cash_shifts` signature;
- persistence after reload;
- no duplicate.

Passing-run page errors, unexpected console errors, unexpected request failures, native dialogs, unexpected business writes, and cleanup failures were zero. Expected Next.js RSC/prefetch cancellations were classified separately from request failures.

The mandatory source-fix E2E now ends after the unpaid purchase is created once and its generated number, accounting, supplier due, stock/FIFO artifacts, purchase-credit ledger, audit, Cash Drawer non-effect, persistence, and cleanup are verified. Supplier-payment accounting remains covered deterministically by the focused RPC/database matrix and the separate retained settlement diagnostic. The mandatory SQL-fix E2E does not require the intermittent payment client behavior to reproduce or disappear.

Four earlier post-fix launches were discarded after the business operations completed because the test harness used: a non-exact duplicate heading locator; a success locator inside the payment form that is removed after the paid-state refresh; a duplicate desktop/mobile `Card` locator; and an unclassified set of expected `net::ERR_ABORTED` RSC cancellations. Each discarded launch used zero automatic retries and completed exact fixture cleanup before the next launch.

### Final required gate failure

After formatting and a clean migration replay, the exact focused source/RPC test passed 4/4 and the final production build passed. The final focused browser run then reproduced a real client-settlement failure after the Card payment:

- one visible payment submission;
- `Payment recorded.` rendered, proving the action returned its success result;
- the payment form remained disabled on `Recording…` through 30 seconds;
- the server-rendered purchase status remained `unpaid`;
- the server-rendered due remained 300;
- no visible error, framework overlay, page error, console error, or request error explained the stall;
- exact fixture cleanup left zero marked suppliers, products, purchases, or audits.

The final run was not retried. Its screenshot, video, trace, and DOM/error context are retained under `/tmp/saledock-supplier-purchase-number-generation/final-payment-client-stall/`.

### Bounded payment-settlement investigation

On 2026-07-21, the retained failure was checked against the trace and a new evidence-first production-mode diagnostic. The retained action response reached the client, `Payment recorded.` rendered, the payment POST returned HTTP 200, and the database reached one payment, one debit ledger entry, paid status, due 0, and supplier balance 0. The subsequent detail RSC request was issued but aborted before the stale original page reconciled. The form remained connected and disabled on `Recording…`; an independent authenticated read and a diagnostic reload both showed the committed paid state. The retained failure therefore remains a valid client-settlement failure rather than a database, AppSelect, duplicate-submission, or payment-calculation failure.

The fresh baseline reproduced in case 2 after one complete success. It had the same one-POST, one-payment, one-ledger, one-audit, paid/due-0 database truth and stale original-page symptoms, with zero explanatory page, console, request, overlay, dialog, retry, or cleanup errors.

Five bounded source variants were then tested from an exact byte-for-byte baseline, using fresh fixtures and contexts and zero retries:

- Variant A, server revalidation without `router.refresh()`: 5/6 complete; one qualifying settlement failure. Client refresh alone was not the sole cause.
- Variant B, client refresh without current-detail `revalidatePath`: 2/6 complete; four qualifying settlement failures. Simultaneous current-page invalidation plus client refresh was not required for the defect.
- Variant C, supported server-side `refresh()` with no current-detail invalidation and no client refresh: 2/6 complete; three qualifying settlement failures and one separate local Auth-fetch error case. The server refresh API did not establish a correction.
- Variant D, mutation and client refresh split into separate transitions: 4/6 complete; two settlement stalls also carried local Auth-fetch console errors. The decoupled direct-action design failed the required 6/6 gate.
- Variant E, canonical `useActionState` form submission: the first form-action pass reached paid/due-0, cleared pending, displayed one payment, and removed the form in 6/6, but removed the form before the required success message was observed. A follow-up that applied ActionState before one client refresh reached the paid UI in 4/6 and stalled in 2/6; the success message was still not reliably observable. It therefore also failed the acceptance contract.

All experimental source was restored after each candidate. Final tracked application source matches the starting hashes: `actions.ts` is `21c882d87ff34a378b9811136026176e7fbb5f27abe8ba6379488505783875b3`, and `record-payment-form.tsx` is `97e3579f335ab80305ea2078519c2b4212e39e74ef7cd8bc5a772b777da84b22`. Every generated supplier, product, purchase, item, payment, ledger entry, stock lot, stock movement, and audit row was removed after its case.

No isolated variant passed 6/6, so baseline/fix/revert/fix proof was not available and no client or action correction is authorized. No supplier-payment client source, Action behavior, revalidation path, refresh behavior, AppSelect behavior, React version, or Next version is changed by this fix.

### Owner payment-settlement risk waiver

The owner has authorized independent delivery of the proven purchase-number SQL correction and accepts the separate client behavior as:

`KNOWN RESIDUAL SUPPLIER-PAYMENT CLIENT-SETTLEMENT RISK — P2`

The issue is not fixed. A production payment may be accepted under this waiver only when there is one ordinary successful submission, one payment, one payment-debit ledger entry, one audit, paid status, the exact amount paid, due 0, supplier balance 0, no non-cash Cash Drawer effect, no duplicate, correct organization and permissions, an independent authenticated paid/due-0 view, and recovery through one manual reload. A missing, duplicate, incorrect, cross-organization, unauthorized, partially committed, or reload-unrecoverable business state is not covered and remains a live failure.

When the original page stalls on `Recording…`, reload is a documented user recovery step after independent business-truth verification; no reload, retry, polling, timer, or optimistic paid state is added to application source. The SQL migration is now authorized for delivery independently because the payment mutation, accounting, uniqueness, and recovery were correct in every qualifying stall.

SaleDock remains below audit-ready while this P2 risk and remaining coverage findings are open. Canonical finishing documents remain unsynchronized until the comprehensive live finishing continuation is complete.

An additional legacy browser smoke run completed 10/19. The atomic product/FIFO/checkout test and all role route-access cases passed. Nine unrelated assertions failed on pre-existing strict text locators that matched duplicated AppShell/mobile/desktop content, plus the old exact wrong-password message assertion. Those unrelated smoke suites were not edited in this focused branch.

## Scope and impact

Changed source behavior is limited to the additive function-replacement migration. No application source, package, lockfile, workflow, canonical document, customer logic, Expenses logic, Cash Drawer logic, Reports logic, Repairs logic, Returns logic, POS accounting, or opening-stock RPC is changed.

Accounting formulas and permissions visible through the application remain unchanged. The migration makes the database contract enforce the application's established role and tenant boundaries.

## Deployment plan

After the focused unpaid-purchase E2E and complete local SQL/RPC gate pass without retry:

1. verify the merged migration hash and exact production project `bvxyxrdskjryepwjmsvc`;
2. prove this is the only pending production migration;
3. apply it exactly once through the established Supabase migration process;
4. verify function signature, invoker security, search path, grants, qualified numbering, and guards;
5. wait for the exact main Vercel deployment to become Ready;
6. perform one authenticated live purchase and one non-cash settlement using a unique disposable marker;
7. accept the payment result only when it settles normally or satisfies every owner-waiver business-truth and recovery condition;
8. retain truthful purchase/payment/FIFO/ledger history, archive the disposable product and supplier, and record the live outcome in a separate one-file documentation PR.

## Remaining findings

This fix does not address the known residual supplier-payment client-settlement P2 risk, `LIVE-CUSTOMER-LEDGER-001`, `LIVE-CUSTOMER-AUDIT-001`, `LIVE-CONSOLE-001`, or the historical Expenses client-settlement risk. Comprehensive finishing may resume only after the production migration and authenticated supplier-purchase/payment retest pass; SaleDock must not be described as audit-ready while these risks and coverage gaps remain.

## Rollback

Before production application, the branch can be abandoned with no production effect. After merge and migration, application rollback is `git revert <supplier-purchase-merge-sha> && git push origin main`. Because the migration replaces a function, database rollback requires a separately reviewed forward migration restoring the prior function body and grants; migration history must not be edited or manually marked down. Any live QA purchase/payment history must remain truthful, while only the disposable supplier and product are archived.
