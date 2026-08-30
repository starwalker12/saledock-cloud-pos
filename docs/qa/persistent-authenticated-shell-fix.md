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

## Production Delivery And Verification

- Source PR: #353.
- Reviewed head: `fc3ff2bc2befbaa3a2750a8932cda7bd3821e817`.
- Source squash: `2adc8b4efe7e002faa79931c26ecfce2940db49d`.
- Ready timestamp: `2026-08-30T00:17:52Z`.
- Merge timestamp: `2026-08-30T00:18:12Z`.
- Main CI: run 33282992623, successful.
- Production deployment: `dpl_GWztDHnjD8UBEHeLUWZzPufVzPaX`, Ready/Current/Production for the exact source squash.
- Public root and login: HTTP 200/200.
- Authenticated identity: Fardan Aatir, Owner.
- Collapsed production result: 96px before, during, and after destination loading across the requested sibling-route sequence; no 288px flash, fake navigation rows, or horizontal shell movement.
- Expanded production result: 288px before, during, and after loading; real navigation remained visible without skeleton replacement.
- Real Sidebar continuity: the clicked real navigation anchor retained focus before commit, through `aria-busy`, and after settlement; the deployed root slot architecture and absence of replacement markup matched the reviewed persistence contract.
- Destination skeletons: Invoices, Supplier Purchases, Reports, Dashboard, Products, Customers, and Settings showed route-shaped main loading states and settled without a blank or stuck transition.
- Topbar: one visible topbar throughout representative transitions, with destination titles and no duplicate search/profile controls.
- Mobile: 320x568, 390x844, and 430x932 each retained one mobile trigger and one bottom navigation, no visible drawer during route changes, no desktop sidebar, and no horizontal overflow.
- Accessibility: the real navigation remained in the accessibility tree; main loading regions exposed `aria-busy` and status text; focus remained on the real Sidebar link and never entered decorative skeletons.
- Theme and motion: light and dark transitions passed; under Chrome reduced-motion emulation the sidebar remained 288px and skeleton pulse animation computed to `none`.
- Preference restoration: opening and closing state matched exactly - expanded 288px, light theme, zero archived items, and unchanged navigation order.
- Production business-data mutations: zero. Only the authorized temporary sidebar/theme preferences changed, and both were restored.
- Production evidence: `/Users/sw12/Projects/saledock-local-evidence/persistent-authenticated-shell-production-verification`.
- Evidence manifest SHA-256: `e09656293dc2a2a4985603b8a7cf50fc874e8bac722fc6d778835f4896f1322f` (30 entries plus manifest).
- Single-active-account workspace coordination remains not started.
- Date-range work remains paused.
- Cashier and security work remain paused.

## Safety

- Local implementation evidence: `/Users/sw12/Projects/saledock-local-evidence/persistent-authenticated-shell-fix` (sealed manifest recorded in PR #353).
- Source implementation production access: zero.
- Delivery verification production access: bounded authenticated read-only UI verification.
- Production mutations: zero.
- Local task-owned role fixtures are removed after focused tests.
- The seeded local owner's original sidebar preference is restored after evidence capture.
- Single-active-account workspace coordination was not started.
- Date-range work remains paused.
- Cashier and security work remain paused.
