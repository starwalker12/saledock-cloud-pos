# Loading and Pending UX Consistency

Date: 2026-08-29

Task: `77543`

Starting main: `80c9151b2a635e7f49ffe71d687eb507aaedd481`

## Scope

This change is limited to route loading, retry, and low-risk archive/restore presentation. It does not change database migrations, RLS, RPCs, permissions, accounting, payment or settlement behavior, stock/FIFO behavior, Cash Drawer behavior, or production data.

The existing specialized pending contracts for POS checkout, customer settlement, supplier payment, returns, expenses, Daily Closing, Repair Intake, supplier purchase creation, and inventory mutations remain unchanged.

## Baseline Inventory

The application has 39 page routes. Before this change:

- 37 routes had an exact `loading.tsx`;
- 31 exact loaders were structural;
- six exact loaders used the generic fallback;
- supplier purchase detail and new-purchase routes inherited the purchase-list skeleton;
- authenticated structural loaders could be delayed while the asynchronous sidebar, top bar, and mobile drawer resolved;
- there was no app-segment `error.tsx` retry boundary;
- the shared skeleton pulse did not explicitly honor reduced motion;
- `ConfirmForm` released its submission lock after a fixed 1000 ms instead of when the actual action settled.

The full pre-edit route and pending-state matrices are retained in the task evidence.

## Correction

### Route feedback

- `AppShell` now wraps its asynchronous sidebar, top bar, and mobile drawer in local Suspense boundaries with static shell fallbacks.
- All 25 authenticated structural route loaders mark their main destination region `aria-busy` and expose one polite, visually hidden loading status.
- The root/auth fallback is quieter and uses accessible status semantics without an oversized blocking card.
- Supplier purchase detail and new-purchase routes now have exact, destination-shaped skeletons.
- A safe app-level error boundary provides retry and dashboard recovery without exposing exception details.

### Shared primitives

- `Skeleton` remains decorative and `aria-hidden`, cannot receive pointer selection, and disables pulse animation under reduced motion.
- `PendingSubmitButton` uses `useFormStatus`, keeps both labels in the same grid cell to preserve width, disables duplicate submission, exposes `aria-busy`, and disables spinner motion under reduced motion.
- `ConfirmForm` awaits the real action promise, holds a same-tick lock, disables its fieldset, validates before submission, and releases state in `finally`. The fixed timer was removed.

### Low-risk actions

Archive and restore controls for products, categories, suppliers, customer lists, and customer detail now show `Archiving...` or `Restoring...` and remain disabled until their actual action settles. Their Server Actions, permissions, and business behavior were not changed.

## Route Result

All 39 page routes now have an exact loading boundary. Existing destination-shaped loaders remain in place for dashboard, products, customers, invoices, reports, expenses, repairs, returns, Daily Closing, settings, users, audit log, replenishment, supplier dues, supplier purchases, ledgers, and statements.

The two inherited supplier-purchase gaps now use exact detail/form skeletons. Public policy and platform loaders were preserved. The root fallback remains the fallback for auth/setup routes that already use it.

## Accessibility and Visual Review

- Changed loading regions passed axe WCAG 2 A/AA checks in light and dark mode.
- Skeletons are non-focusable and hidden from assistive technology.
- Reduced-motion testing computed `animation-name: none` for the loading pulse.
- The new loading status is announced once per destination region.
- 320x568, 390x844, 430x932, and 1440x900 checks found no horizontal overflow.
- Light and dark loading/resolved layouts remained legible and stable.
- Pending labels remain inside stable-width buttons.

A whole-page axe check on the resolved supplier-purchase form also reported two pre-existing issues outside this change: shared search-placeholder contrast and an unlabeled purchase-cost input. Neither node is part of the changed loading UI, and exact-main behavior was retained. No new accessibility violation was introduced.

## Performance

No artificial delay, minimum loader duration, package, or animation library was added. Server `loading.tsx` boundaries and CSS skeletons provide the route feedback. The only new client primitive is the small form-status button.

Comparable Next 16 production builds completed for exact main and the final branch. Uncompressed `.next/static/chunks` JavaScript changed from 3,698,873 bytes in 64 files to 3,704,343 bytes in 65 files: +5,470 bytes, about +0.15%. Server app JavaScript grew by 59,345 bytes for the new shell/loading/error output. The route count remained unchanged.

## Verification

- focused loading/pending contracts: 10/10;
- focused loopback Playwright: 3/3 with zero retries;
- revised print-boundary and loading contracts: 73/73;
- complete Node suite: 393/393;
- loading-region axe: zero violations in light and dark mode;
- responsive overflow checks: pass at all four target viewports;
- lint: zero errors, two pre-existing settings hook warnings;
- typecheck: pass;
- production build: pass;
- local fixtures: removed;
- production access and mutation: zero.

The final validation rerun and hosted draft checks are recorded in the evidence and pull request.

## Evidence

Evidence path:

`/Users/sw12/Projects/saledock-local-evidence/loading-pending-ux-consistency`

The accepted evidence is sealed by `evidence-manifest.sha256`. It contains the pre-edit route matrix, pending-state matrix, screenshots, accessibility result, build comparison, validation, cleanup, and final report.

Cashier authorization and all security work remain paused and untouched.
