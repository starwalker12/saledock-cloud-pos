# Expenses Mobile Touch And Void Copy Fix

## Scope

- Base SHA: `756631a1d8e0b1506030207f631b1265a95d2f34`
- Branch: `fix/expenses-mobile-touch-and-void-copy`
- Findings: `EXP-MOBILE-001`, `EXP-MOBILE-002`
- Environment: production-mode Next.js on localhost with loopback-only local Supabase
- Roles: local QA owner and local QA cashier
- Viewports: 320x568, 390x844, 430x932, and 1440x900

This is a focused presentation and guidance fix. It does not change expense actions, data, amounts, accounting, queries, filters, audit behavior, permissions, authentication, RLS, database schema, stock, FIFO, payments, balances, reports, Cash Drawer, or Daily Closing.

`EXP-MOBILE-003` remains open. Payment-filter behavior, AppSelect, StatCard, and Expenses summary-label readability are not changed by this fix.

## Root Cause

`EXP-MOBILE-001` had four presentation causes:

- The Add a new expense summary had no minimum height and rendered as a 20px text hit area.
- Add, Update, and mobile Apply used `h-10` and rendered at 40px.
- Edit, Void, and Restore used `min-h-9` and rendered at 36px.
- Shared confirmation buttons used vertical padding without a minimum height and rendered below 44px.

`EXP-MOBILE-002` was stale copy. Expense Void already archives rather than deletes, Show voided exposes the archived row, and Restore returns it to active state, but the dialog said the action could not be undone.

No money, data, or action change was required.

## Implementation

- The Expenses disclosure now uses a visible `min-h-11` flex row.
- Add and Update now use `h-11`.
- Mobile Apply now uses `h-11`; the desktop Apply layout remains unchanged.
- Edit, Void, and Restore now use `min-h-11`.
- Both shared confirmation actions now use `min-h-11`.
- Void guidance now states that the expense is marked void, hidden from normal lists and reports, and restorable through Show voided.
- The title and confirm action remain `Void this expense?` and `Void expense`.

No native dialog was introduced. Existing focus, keyboard, pending, disabled, and submission behavior remains in place.

## Shared Confirmation Decision

A shared 44px minimum was selected instead of an Expenses-only API because every consumer renders through the same responsive dialog action row. The change adds only minimum height; it does not alter labels, ordering, callbacks, variants, focus management, or responsive layout.

Direct `useConfirmDialog` consumers inspected:

- Expenses Void.
- Daily Closing reopen.
- Dashboard layout reset.
- POS held-bill resume and cancel.
- Users invite revoke.
- Sidebar reset.
- User-menu sign out.

`ConfirmForm` consumers inspected:

- Customer archive.
- Product category archive in both responsive renderings.
- Product archive.
- Supplier archive in both responsive renderings.

The shared action row remains stacked on mobile and right-aligned on desktop. Existing sign-out confirmation browser coverage passed after the change.

## Touch-Target Evidence

Every control measured exactly 44px high at every phone viewport. Every center point resolved to the intended control or one of its children. Every label remained visible and unclipped.

| Control | 320x568 | 390x844 | 430x932 | Center hit | Clipping |
| --- | ---: | ---: | ---: | --- | --- |
| Add a new expense disclosure | 44px | 44px | 44px | Pass | None |
| Add expense | 44px | 44px | 44px | Pass | None |
| Update expense | 44px | 44px | 44px | Pass | None |
| Mobile Apply | 44px | 44px | 44px | Pass | None |
| Edit | 44px | 44px | 44px | Pass | None |
| Void | 44px | 44px | 44px | Pass | None |
| Restore | 44px | 44px | 44px | Pass | None |
| Confirmation Cancel | 44px | 44px | 44px | Pass | None |
| Confirmation Void expense | 44px | 44px | 44px | Pass | None |

The test positions controls within the safe region between fixed app header and bottom navigation before strict `elementFromPoint` hit testing. It does not force clicks or accept controls covered by navigation.

## Dialog And Keyboard Evidence

- Light dialog: passed at 320x568 and 390x844.
- Dark dialog: passed and visually inspected at 430x932.
- Escape: closes without submission.
- Enter: confirms exactly one Void submission.
- Tab: wraps from confirm to cancel.
- Shift+Tab: wraps from cancel to confirm.
- Focus restoration: returns to the Void trigger.
- Cancel button: zero submissions and no row change.
- Message: complete, readable, and free of irreversible/deletion claims.
- Native dialogs: 0.

## Local Mutation Boundary

One uniquely marked synthetic expense was created through the owner UI.

- Expected action submissions: 4.
- Observed action submissions: 4.
- Successful action submissions: 4.
- Sequence: create, update, void, restore.
- Allowed application table: `expenses`.
- Allowed existing side-effect table: `audit_logs`.
- Observed matching audit rows: 3 for the existing create/update/void behavior.
- Unexpected browser business writes: 0.
- Duplicate expense rows: 0.
- Cashier action submissions: 0.
- Desktop action submissions: 0.

Request bodies, amounts, row IDs, credentials, cookies, and audit metadata were not logged or documented.

## Workflow Results

- Create: passed; visible disabled Saving state; exactly one submission.
- Update: passed; visible disabled Saving state; exactly one submission; no duplicate.
- Void Cancel: passed; zero submissions; row remained active.
- Void Confirm: passed through Enter; exactly one submission; row archived, not deleted.
- Show voided: passed; archived row and Restore were visible.
- Restore: passed; exactly one submission; row active with archive metadata cleared.
- Owner: management controls present and usable.
- Cashier: read-only banner present; Add/Edit/Void/Restore absent; zero writes.
- Desktop: table, single row, Edit, Void, and sorting layout remained usable.
- Mobile bottom navigation: did not obstruct measured controls.
- Page-level horizontal overflow: none.

## Cleanup And Data Safety

Normalized count/hash signatures covered expenses, audit logs, products, stock lots, stock movements, allocations, invoices, returns, repairs, payments, customers, customer ledgers, suppliers, purchases, daily closings, cash shifts, branches, profiles, and organizations.

- Generated expense rows remaining: 0.
- Matching generated audit rows remaining: 0.
- Unrelated signatures equal: yes.
- Final accepted-run cleanup failures: 0.

Two diagnostic hard-timeout runs raced their in-test cleanup and temporarily left one synthetic expense plus two matching audit rows. Those uniquely marked local rows were immediately removed through the local admin helper and independently verified at zero before further work. No unrelated row was touched. The corrected route gate eliminated the timeout and both accepted runs cleaned themselves successfully.

## Errors And Requests

Final accepted run:

- Page errors: 0.
- Unexpected console errors: 0.
- Framework overlays: 0.
- Native dialogs: 0.
- Unexpected request failures: 0.
- Expected unavailable local instrumentation events: 30.
- Expected `net::ERR_ABORTED` navigation, prefetch, and static-resource cancellations: 186.
- Unexpected state-changing requests: 0.
- Retries: 0.
- Skips: 0.
- Timeouts: 0.
- Flakes: 0.

## Diagnostic Run History

- Source-contract diagnostic: 1 subtest failed because the test helper selected the spinner class instead of the enclosing button; source was unchanged and the corrected contract passed 5/5.
- Browser diagnostic 1: stale exact-name locator after the button changed to Saving; zero rows remained.
- Browser diagnostic 2: unrelated success-message timing after a deliberately held request; zero rows remained.
- Browser diagnostics 3 and 4: two 360-second test-harness timeouts caused by stale reusable gate ownership and an update URL query-string mismatch. Each left only the uniquely marked local row/audit pair, which was removed and verified at zero before continuing.
- Browser diagnostics 5 and 6: hit-test setup placed the 320px disclosure under the fixed bottom nav; strict hit testing was retained and the test now positions controls inside the safe viewport region.
- Browser diagnostic 7: a dialog button was measured during scale-in animation; the test now waits for the actual animation-finished state without lowering the threshold.
- Browser diagnostic 8: aborted Next.js static-resource navigations were separated from unexpected request failures.
- Accepted focused runs: 2/2 passed after the final harness corrections, with no retry or flake.

## Validation

- Focused source contract: 5/5 passed.
- Focused Expenses E2E: 1/1 passed in the final run; one earlier accepted run also passed.
- Shared sign-out confirmation regression: 1/1 passed.
- Owner/cashier permission regression: passed inside the focused Expenses E2E.
- Lint: passed with 0 errors and 2 pre-existing warnings.
- Typecheck: passed.
- Production build: passed.
- Final diff safety: passed; exactly four approved source files, one focused source contract, one focused E2E, and this QA report.

## Evidence Boundary

- Local: authenticated browser, responsive layout, touch geometry, keyboard behavior, disposable mutation lifecycle, cleanup, and data signatures.
- CI: pending exact-head GitHub checks after draft PR creation.
- Vercel: pending exact-head preview status after draft PR creation.
- Production: public application not authenticated or mutated; no production Expenses test occurred.
- Manual: temporary local screenshots were inspected and not uploaded.

## Classification And Follow-Up

`EXP-MOBILE-001`: FIX VERIFIED LOCALLY.

`EXP-MOBILE-002`: FIX VERIFIED LOCALLY.

`EXP-MOBILE-003`: OPEN and explicitly out of scope. Cash Drawer has not begun.

After this PR is reviewed and merged, update `02_CURRENT_STATE.md`, `03_REMEMBER.md` when appropriate, and `CHATGPT_CONTINUATION_BRIEF.md`. Then handle `EXP-MOBILE-003` in its separate review-first PR. Do not remove Expenses from blocked audit coverage until the complete post-merge workflow and separate documentation-only synchronization pass.

## Handoff Delta

- Newly reproduced defect: none.
- Files requiring refresh after merge: `02_CURRENT_STATE.md`, `03_REMEMBER.md` when the merged result creates durable truth, and `CHATGPT_CONTINUATION_BRIEF.md`.
