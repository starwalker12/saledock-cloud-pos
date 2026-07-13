# Expenses Mobile Filter and Summary Labels Fix

Date: 2026-07-14

Branch: `fix/expenses-mobile-filter-and-summary-labels`

Base: `2f96a2b00d9b2f63c4d4cc55b3cbacb6271c203a`

Finding: `EXP-MOBILE-003`

Classification: FIX VERIFIED LOCALLY; OFFICIAL AUDIT SYNCHRONIZATION PENDING

## Scope and continuation boundary

This work resumed the previously stopped source task without resetting or regenerating its reviewed uncommitted changes. The continuation started with exactly five changed or untracked files:

- `src/app/expenses/page.tsx`
- `tests/expenses-mobile-touch-and-void-copy.test.mjs`
- `tests/reports-mobile-card-label-wrapping.test.mjs`
- `tests/expenses-mobile-filter-and-summary-labels.test.mjs`
- `tests/e2e/expenses-mobile-filter-and-summary-labels.spec.ts`

The final scope is exactly seven files after adding the shared AppSelect correction and this report:

- `src/components/ui/app-select.tsx`
- `src/app/expenses/page.tsx`
- `tests/expenses-mobile-touch-and-void-copy.test.mjs`
- `tests/reports-mobile-card-label-wrapping.test.mjs`
- `tests/expenses-mobile-filter-and-summary-labels.test.mjs`
- `tests/e2e/expenses-mobile-filter-and-summary-labels.spec.ts`
- `docs/qa/expenses-mobile-filter-and-summary-labels-fix.md`

No expense action, data, validation, permission, authentication, database, migration, package, workflow, audit, handoff, Cash Drawer, Reports source, StatCard source, or other AppSelect consumer was changed.

## Protected evidence

- Live worktrees before continuation: 20.
- Protected dirty or untracked files outside this source worktree: 22.
- Every protected branch, HEAD, dirty scope, and SHA-256 fingerprint matched the saved pre-continuation inventory.
- Original Expenses evidence document SHA-256: `7dc4dafc10c834aee01e71ea36b42b67c73b308270016c5e999bc2309f78c8b7`.
- Original Expenses evidence test SHA-256: `760f480c4794488146c80183f1f30e2128272c7c1376c55f895c02c40a8bc469`.
- Archived sequence diagnostic: `/tmp/saledock-expenses-filter-sequence-comparison/expenses-mobile-filter-sequence-comparison.spec.ts`.
- Archived sequence diagnostic SHA-256: `618d908a647cf4209f54656d40df89cd19bf763736f5c04ab10a46e845d675b1`.

The five uncommitted source-worktree hashes before continuation were:

- Expenses page: `39583e49de6604c365bc8adc08c123646cce3af411a3bf0ac664eb42f730debe`.
- PR #303 source contract: `e6ad6e8100241f62b00602cbe61b71759ebba9ad1be5c2d1fb78cf21702ea623`.
- Reports label contract: `2b11642204a78b9938d82542d3bfe55c741e7b1c5ae0747a1a97d3c607393931`.
- New EXP-MOBILE-003 source contract: `37cd994059a6a3475ea97e74efb79d355d9430d45dc80742ec9b3b799171ddb8`.
- New focused E2E: `c673cb9699706ab41d4b2b326df3a572fdce731af8a5a2196c390a5b253dfdad`.

## Defect classification

The original Cash-option actionability timeout was not reproduced. This PR does not claim to fix that historical timeout.

Completed historical and current option evidence remained:

- Historical original locator: 3/3 pass.
- Historical scoped locator: 3/3 pass.
- Current-main original locator: 3/3 pass.
- Current-main scoped locator: 3/3 pass.
- Current fresh ordinary touch: 3/3 pass.
- The historical and current AppSelect Git blob remained identical: `d41ae1d4f5c71a52ad62aa9ce71dee51c660579b`.
- Options were visible, center-hit-testable, within the viewport, and unobstructed by mobile navigation.

A separate current-main defect was reproduced: Link-based Reset navigation updated the URL but left uncontrolled AppSelect visible and hidden values stale.

The deterministic red path was:

1. Select a disposable Category through the rendered AppSelect.
2. Submit the real GET form.
3. Activate the real Next.js Reset Link.
4. Observe `/expenses` with no server-side category parameter.
5. Observe the visible Category trigger and hidden `category` input still holding the selected disposable category for at least five seconds.
6. Submit Card and observe both the stale category and `payment_method=card` as non-empty filters, excluding the otherwise matching Card fixture.

The stale visible and hidden values were byte-for-byte equal to the selected disposable QA category string. The random fixture suffix is intentionally not retained in this durable report; no business identifier was involved.

Classification of the reproduced issue: CURRENT PRODUCT DEFECT REPRODUCED.

## Root cause

AppSelect initialized `internalValue` from `defaultValue`. User selection updated uncontrolled internal state. A native form `reset` event restored the latest default, but Expenses Reset is a Next.js Link and emits no native reset event. App Router navigation supplied a new URL-derived `defaultValue`, while the preserved client component retained its previous internal value.

The same uncontrolled URL-filter plus Link-reset pattern exists in Expenses, Repairs, and Audit Log. An Expenses-only `key` remount would hide a shared state contract problem and was not used.

## AppSelect consumer inventory

The repository contains 46 AppSelect instances across 21 files:

- Controlled (`value` and `onChange`): 26.
- Uncontrolled: 20.
- Instances supplying `defaultValue`: 20, including two controlled Users wrappers.
- Named form fields: 24.
- Explicit searchable uses: 21.
- Component-disabled uses: 7.
- URL/search-param-derived uncontrolled defaults: 10 across Audit Log, Expenses, and Repairs.
- Link-navigation reset routes: Audit Log, Expenses, and Repairs.
- Direct native form-reset consumers confirmed by source: Expenses expense form and Customer settlement form.
- Disabled-option consumer confirmed by source: new supplier purchase product picker.

| Consumer file | Instances | Controlled | Uncontrolled |
| --- | ---: | ---: | ---: |
| `src/app/audit-log/page.tsx` | 4 | 0 | 4 |
| `src/app/customers/[id]/settlement-form.tsx` | 1 | 0 | 1 |
| `src/app/expenses/expense-form.tsx` | 1 | 0 | 1 |
| `src/app/expenses/page.tsx` | 4 | 0 | 4 |
| `src/app/invoices/[id]/returns/return-form.tsx` | 1 | 0 | 1 |
| `src/app/onboarding/onboarding-wizard.tsx` | 4 | 4 | 0 |
| `src/app/platform/privacy-requests/triage-client.tsx` | 3 | 2 | 1 |
| `src/app/pos/pos-client.tsx` | 4 | 4 | 0 |
| `src/app/products/inventory-section.tsx` | 2 | 0 | 2 |
| `src/app/products/product-form.tsx` | 2 | 1 | 1 |
| `src/app/products/products-tab.tsx` | 2 | 2 | 0 |
| `src/app/purchases/replenishment/po-planner-modal.tsx` | 2 | 2 | 0 |
| `src/app/purchases/replenishment/product-detail-modal.tsx` | 1 | 1 | 0 |
| `src/app/purchases/replenishment/replenishment-ui.tsx` | 3 | 3 | 0 |
| `src/app/repairs/[id]/status-form.tsx` | 1 | 1 | 0 |
| `src/app/repairs/page.tsx` | 2 | 0 | 2 |
| `src/app/repairs/repair-form.tsx` | 2 | 0 | 2 |
| `src/app/settings/settings-form.tsx` | 1 | 0 | 1 |
| `src/app/suppliers/purchases/[id]/record-payment-form.tsx` | 1 | 1 | 0 |
| `src/app/suppliers/purchases/new/new-purchase-form.tsx` | 3 | 3 | 0 |
| `src/app/users/users-client.tsx` | 2 | 2 | 0 |

## Shared AppSelect correction

The shared AppSelect correction synchronizes uncontrolled internal state when `defaultValue` changes, while controlled `value`/`onChange` behavior and native form-reset behavior remain protected.

The focused effect is equivalent to:

```tsx
useEffect(() => {
  if (value !== undefined) return;
  setInternalValue(defaultValue);
  setIsOpen(false);
  setQuery("");
}, [defaultValue, value]);
```

The controlled guard prevents the effect from changing any parent-controlled value. `selectedValue` remains `value ?? internalValue`, and real selection only updates internal state when `value === undefined`.

The new synchronization effect does not invoke `onChange` and does not dispatch hidden-input `input` or `change` events. Real user selection retains its existing callback and synthetic event behavior. The existing closest-form reset listener, delayed native reset adoption, and listener cleanup remain unchanged. Menu and query state close when a new uncontrolled default arrives, avoiding stale open UI.

No new prop, pathname inspection, router coupling, Link detection, key remount, global state, timer synchronization, polling, reload, or direct hidden-input mutation was added.

## Expenses Reset red/green evidence

The accepted green path used ordinary rendered controls with no force, JavaScript selection, hidden-input mutation, page reload, or direct Reset navigation:

- Category GET completed with the selected disposable category.
- Real Reset Link completed at `/expenses`.
- Category trigger became `All` and hidden `category` became empty within five seconds.
- Payment trigger became `All` and hidden `payment_method` became empty within five seconds.
- Card submission had `payment_method=card` as its only non-empty filter.
- The stale category was absent as a non-empty query value and the matching Card fixture appeared.
- A second Category -> Reset -> Cash sequence produced the same synchronized result.
- Cash submission had `payment_method=cash` as its only non-empty filter and the matching Cash fixture appeared.

Native GET serialization retains empty named fields in the URL; acceptance is based on the complete set of non-empty filters, not omission of empty controls.

## Shared-consumer regressions

Repairs mobile regression:

- Selected Received through the rendered Status AppSelect.
- Submitted the real GET form and observed `status=received`.
- Activated the real Reset filters Link and reached `/repairs`.
- Reopened the real Filters disclosure.
- Visible Status returned to `All statuses`; hidden `status` returned to empty.
- A subsequent real filter submit carried no non-empty stale status.
- No Repair fixture or business mutation was used.

Controlled Products regression:

- Opened the mobile Products filter.
- Selected a real non-default category through the parent-controlled AppSelect.
- The trigger followed the parent-controlled value.
- Activated the real client-state Reset filters control.
- The trigger returned to `All`.
- No product or category mutation was used.

No pre-existing dedicated AppSelect unit or browser test was discovered. Controlled mode, uncontrolled defaults, native reset, outside pointer close, Escape, Arrow keys, Enter, Space, search, disabled options, user-selection events, and the backward-compatible public prop set are enforced separately in the new source contract. The full Expenses mutation workflow was intentionally not rerun in this focused task.

## Payment option regression

At 390x844 with touch enabled:

- Trigger: 274 x 40 CSS pixels.
- Menu: approximately 271 x 255 CSS pixels.
- Cash option: approximately 255 x 40 CSS pixels.
- Viewport intersection ratio: 1.0.
- Center point resolved to the option or its child.
- Mobile bottom-navigation overlap: false.
- Cash and Card ordinary touch selection: pass.
- Trigger and hidden input update: pass.
- Menu close after selection: pass.
- GET filter result: pass.

The original Cash-option actionability timeout was not reproduced. This PR does not claim to fix that historical timeout.

## Summary-label correction

Summary-label truncation was fixed locally through the existing Expenses-only StatCard `wrapLabel` opt-in.

Exactly these four Expenses cards opt in:

- Today expenses.
- This month.
- Top category (month).
- Latest expense.

Their wording, values, details, icons, order, grid, formatting, calculations, and data fetching remain unchanged. StatCard source and its default truncation behavior remain unchanged.

The Reports regression contract was updated only to remove Expenses from the default-truncation consumer inventory after Expenses deliberately opted into the existing wrapping mode. All remaining consumer and Reports contracts remain enforced.

Reports retains all five existing wrap opt-ins, labels, values, query hash, and invocation. Reports source was not changed.

## Responsive evidence

Light and dark modes passed at 320x568, 390x844, 430x932, and 1440x900.

For every label in all eight contexts:

- `white-space` was `normal`.
- `text-overflow` was not ellipsis.
- overflow did not hide content.
- full exact text was present.
- label stayed within its card.
- no label/value, label/icon, value/icon, or value/detail overlap occurred.
- cards stayed within the viewport.
- page-level horizontal overflow was absent.
- mobile two-column layout remained coherent.
- mobile bottom navigation did not obstruct the final card.
- desktop card heights remained balanced.

Temporary inspected screenshots are under `/tmp/saledock-expenses-filter-and-summary-labels/` and are not part of the repository.

## Request, fixture, and cleanup accounting

Accepted run:

- Browser GET requests observed: 1582, including App Router and asset requests across all page contexts.
- Browser state-changing application requests: 0.
- Direct disposable fixture inserts: 2 rows in `expenses` only.
- Direct fixture audit writes: 0.
- Cleanup expense deletes: 2.
- Cleanup audit deletes: 0.
- Generated expense rows remaining: 0.
- Matching audit rows remaining: 0.
- Cleanup retries: 0.
- Cleanup failures: 0.
- Unrelated safety signatures: equal before and after.
- Application RPCs: 0.

Safety signatures covered expenses, audit logs, payments, invoices, invoice items, returns, repairs, products, stock lots, stock movements, allocations, customers, customer ledgers, suppliers, purchases, daily closings, cash shifts, organizations, branches, profiles, and roles represented in profiles.

## Errors and invalidated runs

Accepted run:

- Page errors: 0.
- Console errors: 0.
- Framework overlays: 0.
- Native dialogs: 0.
- Unexpected request failures: 0.
- Browser state-changing requests: 0.
- Expected framework/RSC or asset aborts: 316.
- Expected analytics instrumentation warnings: 162.

Pre-continuation evidence included one invalid server setup without the local service-role environment and two expected red runs that exposed the stale category state, first through a contaminated Card result and then through the direct five-second Reset assertion.

Five post-fix runs were invalidated by deterministic test-design assumptions and corrected before the accepted run:

1. Accessible-role lookup attempted to inspect an Expenses trigger while its disclosure was closed after Reset.
2. The URL predicate required an empty named GET field to be omitted instead of accepting its empty serialized value.
3. Accessible-role lookup attempted to inspect a Repairs trigger while its disclosure was closed after Reset.
4. Products navigation reused a page while the preceding Repairs App Router transition was settling and received `ERR_ABORTED`; the controlled check was isolated in its own context.
5. Accessible-role lookup attempted to inspect the Products trigger before opening its disclosure.

Each failed command used zero Playwright retries and ran fixture cleanup. The accepted test source passed 1/1 with zero retries. This is not recorded as a flaky pass because each rerun followed a deterministic test-source correction; no unchanged test was retried into a pass.

## Validation

- Current base and origin/main: exact match.
- Source contracts: 27/27 pass.
- EXP-MOBILE-003 source contract: 13/13 pass.
- PR #303 contract: 5/5 pass.
- Reports/StatCard contract: 9/9 pass.
- Existing focused AppSelect tests discovered: none.
- Focused production-mode Chromium E2E: 1/1 pass.
- Accepted-run Playwright retries: 0.
- Accepted-run skips: 0.
- Accepted-run timeouts: 0.
- Accepted-run flakes: 0.
- Lint: pass with zero errors and two pre-existing warnings in `privacy-center.tsx`.
- Typecheck: pass.
- Build: pass.
- Diff check: pass.

## Evidence boundaries and limitations

- Local: authenticated local owner, loopback Supabase, production-mode Next.js, Chromium, direct disposable fixture, responsive screenshots, request guards, cleanup, and safety signatures.
- GitHub CI: pending until the draft PR head exists.
- Vercel: pending until the draft PR head exists.
- Supabase Preview: expected to skip because no migration or database file changed; status pending until the draft PR exists.
- Production: not accessed and not mutated.
- Manual physical-device testing: not performed.
- Full Expenses owner/cashier create, update, void, and restore workflow: intentionally deferred until after review and merge.
- Official audit and canonical handoff documents: unchanged.

EXP-MOBILE-003 remains open in the official audit until this PR merges, the complete Expenses owner/cashier workflow is rerun, and a separate documentation-only synchronization is merged.

Expenses remains PARTIAL and Cash Drawer has not begun.

## Recommended next action

Review this draft PR only. After merge, rerun the complete Expenses owner/cashier workflow and verify exactly four create/update/void/restore submissions, cleanup, and unchanged safety signatures. Then create a separate documentation-only synchronization. Cash Drawer remains blocked until those steps finish.

## Risk closed because

- Link-based navigation now updates uncontrolled AppSelect state from the latest server-derived default without an Expenses-only remount workaround.
- Controlled consumers remain parent-driven and a representative Products filter passed.
- Native reset and real user-selection event behavior remain separate and source-enforced.
- Expenses and Repairs Link-reset paths passed through ordinary rendered controls.
- Cash and Card remained visible, tappable, unobstructed, and correctly filtered after Reset.
- All four Expenses summary headings are complete across the required light/dark viewport matrix without overlap or overflow.
- Expense actions, queries, values, accounting, permissions, authentication, database behavior, and protected evidence were untouched.

## Rollback

If this PR is later merged:

```bash
git revert <future_merge_commit_sha> && git push origin main
```
