# Persistent Authenticated Shell Fix

## Scope

- Task: 81357
- Starting main: `caafd3e93c3840b5820271f787f15c5b446b60bb`
- Branch: `fix/persistent-authenticated-shell`
- Scope is limited to authenticated shell and route-loading presentation.
- No business logic, authorization, database, migration, RPC, payment, stock, FIFO, supplier, Expense, or Cash Drawer behavior changed.

## Reproduced Regression

Exact-main production-mode testing held local profile and destination reads open while navigating between authenticated sibling routes.

- Collapsed: the real 96px sidebar was replaced by the 288px `SidebarLoading`, then returned to 96px.
- Expanded: the real 288px sidebar was replaced by a 288px fake navigation skeleton.
- The marked real sidebar DOM node did not survive either transition.
- Destination content still showed its route-specific busy skeleton.

The cause was route-level `loading.tsx` files rendering a new `AppShell`, while `AppShell` itself owned the Sidebar Suspense boundary and its hard-coded expanded fallback.

## Correction

The root layout now exposes an `@authenticatedShell` parallel slot. A shared workspace slot layout owns the real role-aware `Sidebar` and `MobileDrawerWrapper` above sibling page loading boundaries. Exact marker pages mirror the 25 existing routes that use `AppShell`; public, authentication, onboarding, setup, and platform routes resolve to the empty default slot.

`AppShell` remains route-owned and continues to provide:

- the destination Topbar and exact page title;
- the destination main region;
- `aria-busy` and the loading status;
- all existing destination-shaped skeleton content;
- existing mobile tab and full-document print behavior.

`SidebarLoading` was removed. `TopbarLoading` remains because the Topbar is still route-owned and may have destination-specific title and print controls. The persistent frame flattens under print media so full-document Reports output keeps its existing overflow and pagination contract.

## Accepted Behavior

- Collapsed width: 96px before, 96px during, 96px after.
- Expanded width: 288px before, 288px during, 288px after.
- The marked real sidebar DOM node survives each accepted sibling transition.
- Custom order and archived items persist across three sibling transitions.
- Owner, admin, manager, cashier, and technician retain their existing role-specific links with no privileged-link flash.
- Destination main skeletons remain immediate and `aria-busy` clears after settlement.
- Mobile 320px, 390px, and 430px retain one mobile chrome set, no desktop sidebar, and no horizontal overflow.
- Desktop 1440px passes in collapsed and expanded states.
- Light, dark, and reduced-motion checks pass.
- Busy main regions are keyboard reachable for the existing scrollable-region accessibility contract; decorative skeletons remain hidden from assistive technology.

## Performance

The aggregate generated JavaScript directory changed from 3,704,341 bytes in 65 files to 3,808,310 bytes in 68 files because the parallel route graph adds generated chunks. A fresh local production-mode Dashboard load improved from 36 chunk requests / 532,902 transfer bytes / 2,073,870 decoded bytes to 25 requests / 446,864 transfer bytes / 1,743,846 decoded bytes. This is local comparative evidence, not a production field-performance claim.

## Validation

- Persistent-shell source contracts: pass.
- Collapsed, expanded, custom preference, role navigation, print, mobile, and accessibility Playwright: pass with zero retries.
- Existing loading/pending and ConfirmForm Playwright: pass with zero retries.
- Existing route-loading, print, complete Node, lint, typecheck, production build, and `git diff --check`: recorded in the sealed evidence report.
- Two discarded focused browser runs failed because the rebuilt local server was missing its loopback service-role environment; no application assertion completed. One discarded baseline evidence attempt held only the destination table and therefore did not enter the old Sidebar fallback. These runs are not hidden or counted as passes.

## Safety

- Evidence: `/Users/sw12/Projects/saledock-local-evidence/persistent-authenticated-shell-fix` (sealed manifest recorded in the draft PR).
- Production access: zero.
- Production mutations: zero.
- Local task-owned role fixtures are removed after focused tests.
- The seeded local owner's original sidebar preference is restored after evidence capture.
- Single-active-account workspace coordination was not started.
- Date-range work remains paused.
- Cashier and security work remain paused.
