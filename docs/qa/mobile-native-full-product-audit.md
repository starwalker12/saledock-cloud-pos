# SaleDock Mobile-Native Full Product Audit

Date: 2026-07-12

Branch: `qa/returns-print-audit-refresh`

Base main SHA: `09e1df96ccb571872ba0c3f46bd457723bfdae53`

Audit mode: review-first, audit-only. No production mutations, no app source changes, no migrations, and no business logic changes were made.

This 2026-07-12 documentation-only refresh inherits reviewed local browser, print-media, PDF, lifecycle, cleanup, and fixture-safety evidence from merged PR #299. It does not imply that the entire mobile/native audit, authenticated browser matrix, or all print surfaces were rerun on this date; the original audit history remains recorded below.

Final recommendation: 13 FINDINGS DISPOSITIONED — 6 BLOCKED/NOT-TESTED AREAS REMAIN

## Executive Summary

This pass created a route and feature inventory, added a repeatable Playwright mobile-native smoke suite, performed code-level inspection of responsive/touch/drag/resize/print/export surfaces, then continued into authenticated local browser QA after Docker and local Supabase were restored.

The continuation found two P1 blockers, four P2 findings, and several P3 polish gaps that prevented calling the mobile/PDF audit passed. All nine original MN findings retain a recorded disposition: eight are fixed on main or in the audit suite, and MN-007 is verified as development-only in the tested environments. Both supplemental Reports findings remain fixed through PRs #295 and #297. Focused Returns verification then found two supplemental findings: RET-PRINT-001 for miniature or clipped 80mm output and RET-PRINT-001-LIFECYCLE for stale asynchronous preparation after cleanup. PR #299 fixed both. Local production-mode Chromium evidence covers one-page A4 output, standard and longer one-page 80mm receipts, cancellation, and client-navigation unmount behavior. All thirteen tracked findings are now dispositioned, while six broader blocked/not-tested areas remain. The audit does not claim full product, mobile, real-device, every-print-surface, financial, refund, stock/FIFO, authenticated production Returns, or authenticated WebKit/Firefox certification.

| Metric | Result |
| --- | --- |
| Page routes discovered | 39 |
| App route/loading/error/route files discovered | 79 |
| Modules inspected | 35 |
| Required viewport sizes encoded in Playwright | 14 |
| Browsers executed | Chromium, WebKit public smoke, Firefox public smoke |
| Public/auth routes browser-smoked | 5 routes across 14 viewports in Chromium, WebKit, and Firefox |
| Authenticated browser routes encoded | 16 routes across 14 viewports |
| Authenticated browser route matrix executed | Chromium full audit file passed after splitting the owner matrix into 12 focused tests |
| PDF/print/export surfaces discovered | 10 |
| Drag/drop/resize/rearrange surfaces discovered | 5 |
| P0 active | 0 |
| P1 active | 0 |
| P2 active | 0 |
| P3 active | 0 |
| Active tracked findings | 0 |
| Active finding IDs | None |
| Fixed P1 findings | 2 |
| Fixed findings | 12 |
| Fixed finding IDs | MN-001, MN-002, MN-003, MN-004, MN-005, MN-006, MN-008, MN-009, RPT-PRINT-001, RPT-MOBILE-001, RET-PRINT-001, RET-PRINT-001-LIFECYCLE |
| Verified development-only findings | 1 |
| Verified development-only finding IDs | MN-007 |
| Total tracked findings | 13 |
| Total tracked findings dispositioned | 13 |
| Original MN finding set | 9/9 dispositioned |
| Supplemental Reports findings | RPT-PRINT-001 fixed; RPT-MOBILE-001 fixed |
| Supplemental Returns findings | RET-PRINT-001 fixed; RET-PRINT-001-LIFECYCLE fixed |
| Blocked or not-tested areas | 6 |

## Environment Tested

| Item | Result |
| --- | --- |
| Git remote | `https://github.com/starwalker12/saledock-cloud-pos.git` |
| Previous merged audit base | `6ccca9b7f9e1127a848890fe2918ee54501f6507` |
| Current documentation refresh base | `09e1df96ccb571872ba0c3f46bd457723bfdae53` |
| Local app | `http://localhost:3000` |
| Local Supabase | Restored; local reset, seed, QA user setup, and local-only grants completed |
| Production | Read-only only; no production mutation testing performed |
| QA users | Local-only owner, admin, manager, cashier, and technician verified |
| Secrets | No secrets, tokens, connection strings, or customer data recorded |

## Route Inventory

Discovered page routes:

| Area | Routes |
| --- | --- |
| Public and auth | `/`, `/about`, `/contact`, `/privacy`, `/terms`, `/data-deletion`, `/login`, `/auth/confirm`, `/auth/invite`, `/auth/reset-password`, `/onboarding`, `/setup` |
| Core app | `/dashboard`, `/pos`, `/products`, `/customers`, `/customers/[id]`, `/invoices`, `/invoices/[id]`, `/returns`, `/returns/[id]`, `/repairs`, `/repairs/[id]`, `/expenses`, `/daily-closing`, `/reports`, `/users`, `/settings`, `/settings/permissions`, `/audit-log` |
| Supplier and stock | `/purchases/replenishment`, `/suppliers/dues`, `/suppliers/purchases`, `/suppliers/purchases/new`, `/suppliers/purchases/[id]`, `/suppliers/[id]/ledger`, `/suppliers/[id]/statement` |
| Platform/admin | `/platform`, `/platform/privacy-requests` |

## Feature Surface Inventory

| Feature group | Surfaces inspected |
| --- | --- |
| Navigation | App shell, mobile drawer, desktop sidebar, top bar, bottom mobile tabs, global search |
| Auth | Login, invite, reset password, expired invite state, onboarding/setup route inventory |
| Dashboard | Widget grid, edit mode, add/remove/restore, drag handles, resize controls, layout persistence code path |
| POS | Product browsing, search, cart, bill tabs, held bills, service fields, checkout controls, customer selection, payment controls |
| Products | Product list, images, add/edit modal, category and supplier tabs, search, stock/FIFO action |
| Suppliers | Purchases, dues, ledger, statement, replenishment export |
| Invoices/returns/repairs | Detail screens, print/share buttons, WhatsApp share, receipt formats |
| Cash drawer | Daily closing page and print button |
| Reports | Reports page, report print button |
| Backup/privacy | Backup export/import UI, privacy export |
| Settings/users | Settings panels, staff permissions, user management |

## Device and Viewport Matrix

The new Playwright suite encodes these viewports:

| Type | Viewports |
| --- | --- |
| Mobile | 320x568, 360x800, 375x667, 390x844, 412x915, 430x932 |
| Tablet | 768x1024 portrait, 1024x768 landscape, 820x1180 portrait |
| Desktop | 1024x768, 1280x720, 1366x768, 1440x900, 1920x1080 |

Executed in Chromium:

- Public/auth responsive smoke: PASS across all encoded viewports.
- Authenticated app responsive smoke: PASS in Chromium. The full audit file passed after the owner route/viewport matrix was split into 12 focused tests.
- WebKit and Firefox: PASS for public/auth route viewport smoke using a temporary uncommitted Playwright config after installing local browser binaries.
- Browser zoom 125 percent: NOT TESTED in this pass.
- Real mobile device hardware: NOT TESTED in this pass.

## Status Table

| Area | Status | Evidence | Follow-up |
| --- | --- | --- | --- |
| Authentication/onboarding | PASS with caveat | Local owner/admin/manager/cashier/technician roles verified; auth-role smoke passed 9/9. | Verify again on Vercel preview before MVP-live. |
| Navigation/sidebar | PASS | Mobile drawer renders one accessible dialog; hamburger opens/closes; close button, backdrop, and Escape work; Customize tabs move up/down; body scroll locks/restores; tablet-to-desktop closes drawer. | Continue monitoring on Vercel preview. |
| Dashboard mobile layout | PASS with caveat | The current authenticated Chromium matrix completed in the required 16/16 full-audit run. Focused Dashboard mobile navigation/edit/POS touch-surface coverage passed. A separate supplemental timing run had an intermittent tablet operations `/daily-closing` timeout unrelated to Dashboard. | Real-device Dashboard layout and touch-resize confirmation remain pending. |
| Dashboard rearrange | FIXED ON MAIN — VERIFIED | Touch-friendly Move Earlier / Move Later controls added in PR #289. Button reorder preserves exact widget width/height, 4/8/12-column layouts remain valid, no overlap or duplicate IDs, persistence after reload verified. Existing drag behavior retained. | Continue monitoring on Vercel preview. |
| Dashboard resize | PASS with caveat | Size controls are visible in focused mobile dashboard smoke; drag resize still needs manual touch confirmation. | Manual touch-resize confirmation remains pending. |
| POS | PASS with caveat | Focused POS mobile controls visible; service-sale and settlement regressions passed; full manual POS matrix not complete. | Real-device and fuller manual checkout layout coverage remain pending. |
| Held bills | PASS | Focused physical-product held bill safety rerun passed 1/1 after clean local reset. | Keep manual real-device confirmation pending. |
| Products/catalog | PARTIAL | The Products route completed in the current authenticated owner matrix. Full product image upload, modal, and mobile keyboard interaction were not rerun. | Continue product image upload/mobile-keyboard workflow separately. MN-005 is the shared `ImageUpload` crop dialog used by branding/profile/onboarding, not the product image field. Product image upload remains a separate partially tested workflow. |
| Product images | PARTIAL | Prior QA history and code inventory inspected; no fresh upload mutation in this continuation. | Re-run image upload mobile matrix. |
| Shared branding/profile crop controls | FIXED ON MAIN — VERIFIED | PR #293 added explicit Move image up/left/right/down and Reset crop controls, 5-point nudge step, 0-100 clamp, reset to X 50 / Y 50 / zoom 1, visible/screen-reader crop status, keyboard activation, 44 px controls, and portal rendering to `document.body` above mobile tabs. Square Profile Picture crop at 390x844 and landscape Invoice Logo crop at 375x667 passed focused browser evidence with zero page errors, visible framework errors, native dialogs, and storage writes. | The no-write regression did not click Use crop. Persisted upload completion remains covered by unchanged source/callback contracts, not by this MN-005 closure. |
| Invoices | PASS with caveat | Local invoice screen and print-media artifacts captured; cookie banner no longer covers invoice print/PDF output. | Continue repair/cash drawer print QA. |
| PDFs/printing | PASS with caveat | Invoice A4/80mm output remains verified. Reports full-document A4 pagination remains verified locally through PR #295, and PR #297 retained five-page A4 output with complete mobile and print labels. PR #299 verified Returns A4 plus standard and longer centered, single-page 80mm receipts using content-derived page heights. | Repairs, daily closing, and supplier-statement physical artifacts remain incomplete or blocked. Do not treat this row as verification of every print surface. |
| Print/share touch targets | FIXED ON MAIN — VERIFIED | PR #292 normalized reports, repairs, daily closing, and supplier statement print/share controls to an explicit `min-h-[44px]`. Returns already used `min-h-[44px]` and remained unchanged. Browser-rendered checks passed for Reports, Daily Closing, and Supplier Statement at 320x568, 390x844, and 430x932. Repair detail, return detail, and conditional daily shift-report controls were verified by source-contract test because deterministic local fixtures were unavailable during that focused finding. | Re-run repair detail visually when a safe fixture exists; Returns visual print evidence is now recorded through PR #299. |
| Invoice PDF wording | FIXED ON MAIN — VERIFIED | PR #290 changed the Share Invoice modal wording from Download PDF to Print / Save as PDF, retained existing A4 browser print behavior, passed desktop 1440x900 and mobile 390x844 localhost review, passed focused invoice wording E2E, and passed cookie-print regression. | Do not claim direct PDF download was added; behavior remains browser print/save-to-PDF. |
| Returns | FIXED ON MAIN — A4 AND 80MM PRINT VERIFIED LOCALLY | PR #299, reviewed head `76cfd4f7c1fd834fe2a1fbfb72f0732e5406559f`, merged as `09e1df96ccb571872ba0c3f46bd457723bfdae53`. Local authenticated testing used a disposable service-only fixture with no production access. A4 produced one complete page. Standard and longer thermal receipts produced centered, unclipped, single-page artifacts at approximately 80mm by 132.3mm and 80mm by 164.4mm with 89.9% horizontal span. Wrapping, totals, notes, and footer were complete. Cancellation and client-navigation unmount tests passed; generated rows remaining and forbidden writes were 0. | Monitor Returns printing during future browser and layout changes. Financial, refund, stock-restoration, and FIFO correctness remain outside this presentation verification. |
| Customers | PARTIAL | Customer settlement flow passed locally; full customers list/detail mobile matrix not rerun. | Re-run customer mobile QA. |
| Settlement | PASS | Customer settlement optional-field E2E passed 1/1 locally. | Manual mobile keyboard check still useful. |
| Repairs | BLOCKED | Detail/print surfaces inspected; local repair print artifact not generated after invoice blocker was resolved. | Re-run repairs mobile/print QA. |
| Expenses | BLOCKED | Route and validation surface inspected; expense mobile workflow not rerun after blockers. | Re-run expenses mobile QA. |
| Cash Drawer | BLOCKED | Print surface inspected; cash drawer close/print workflow not rerun after invoice blocker was resolved. | Re-run cash drawer close/print QA. |
| Reports | FIXED ON MAIN — MOBILE LABELS AND PRINT PAGINATION VERIFIED LOCALLY | RPT-PRINT-001 was fixed through PR #295, merge commit `30400475202eeb2bbeb126abe3e5a281efebb95d`: the optional Reports-only AppShell print contract changed one truncated A4 page to five pages with later/final sections present, retained screen scrolling, and zero unexpected writes. RPT-MOBILE-001 was fixed through PR #297, merge commit `0e85a47561b073236c5297d629927c8684fcc889`: typed `wrapLabel?: boolean` defaults false, unrelated StatCard consumers retain truncation, and exactly five shared Reports StatCards opt into wrapping. Net Sales (Revenue), Gross Profit Margin, and Service Revenue / Profit remain unchanged and passed at 320x568, 390x844, 430x932, desktop 1440x900, and print media 390x844 with no tooltip/value overlap, clipping, horizontal overflow, or unexpected writes. The local PDF remained five A4 pages. Evidence is authenticated local QA only; GitHub CI did not independently rerun browser/screenshots/PDF, financial formulas were not tested, and no authenticated production Reports test occurred. | Continue the six blocked/not-tested coverage areas separately and monitor Reports during future design changes. |
| Users/permissions | PASS with caveat | Auth-role smoke passed for all five local roles; focused cashier mobile user-page restriction passed. | Full mobile direct URL matrix still pending. |
| Settings | PARTIAL | `/settings` and `/settings/permissions` completed in the authenticated owner route matrix. Full interactive settings-panel, form, modal, mobile keyboard, and role-specific mutation coverage remains incomplete. | Run focused settings interaction coverage in the authenticated remainder audit. |
| Responsive tables | PARTIAL | Route matrix and code inventory cover tables, but not every table was manually interacted with. | Re-run with local data. |
| Forms/mobile keyboard | BLOCKED | Code-level checks only. | Re-run on mobile emulation. |
| Modals/drawers | PASS with blocked app modals | Public drawer route smoke passed; authenticated modals blocked. | Re-run product/POS/settings modals. |
| Loading/success/errors | BLOCKED | Code-level inspection only for most app pages. | Re-run slow-network browser QA. |
| Dark mode | BLOCKED | Not fully browser-verified. | Re-run light/dark matrix. |
| Desktop sidebar reorder | FIXED ON MAIN — VERIFIED | PR #291 added visible Move Earlier and Move Later controls inside the existing desktop Rearrange mode. Controls work by mouse click and keyboard Enter/Space. First/last visible items disable the boundary controls. Existing pointer drag remains available. Reorder moves one visible item by one visible position, persists after reload, preserves archived items, stored collapsed state, and cookie-consent values. English, Urdu, and Roman Urdu labels verified. Dark mode and reduced motion verified. No href duplicates or missing links introduced. | Broader blocked/not-tested areas remain listed below. |
| Cross-browser behavior | PARTIAL | Public/auth viewport matrix passed in WebKit and Firefox; authenticated cross-browser not run. | Authenticated WebKit/Firefox coverage remains pending. |
| CSP / public pages | VERIFIED — DEVELOPMENT-ONLY | PR #294 merged; CSP nonce hydration warning reproduced 10/10 in `next dev` only; local production 0/10; production 0/10; no CSP violation reports observed in production; protected branch preview redirected to Vercel SSO. | No source change; treat dev-only warning as a documented development-only observation in the tested environments. |

## PDF, Print, Download, and Export Surfaces

| Surface | Implementation | Audit status |
| --- | --- | --- |
| Invoice detail | A4/80mm `window.print`, WhatsApp share, image capture/download, Share modal action labeled Print / Save as PDF | PASS: local invoice A4/80mm PDF generated; cookie banner hidden in print media; wording matches browser print/save-to-PDF behavior; totals visible |
| Returns detail | A4/80mm `window.print`, WhatsApp share | A4 and 80mm output verified locally through PR #299. A4 produced one complete page. Standard and longer 80mm receipts produced centered, unclipped, single-page artifacts with content-derived heights, complete summaries, notes, wrapping, and footer. No authenticated production print occurred. |
| Repair detail | A4/80mm `window.print`, WhatsApp share | Code inspected; visual output blocked |
| Daily closing | A4/80mm/shift thermal `window.print` | Code inspected; visual output blocked |
| Reports | `window.print` with Reports-only full-document AppShell print opt-in | Desktop A4 full-document pagination and mobile/print StatCard label readability are fixed and verified locally through PRs #295 and #297. Five A4 pages were generated after both fixes with later and final sections present. |
| Supplier statement | A4/80mm `window.print`, WhatsApp share | Code inspected; visual output blocked |
| Replenishment | CSV/XLSX export | Code inspected; browser download blocked |
| Purchase order planner | CSV/XLSX export | Code inspected; browser download blocked |
| Privacy center | JSON export | Code inspected; browser download blocked |
| Backup settings | Backup ZIP export, import upload | Code inspected; no destructive import run |

## Drag, Drop, Resize, and Rearrange Surfaces

| Surface | Desktop behavior | Mobile/touch readiness |
| --- | --- | --- |
| Dashboard widgets | `react-grid-layout` drag and resize handles plus Move Earlier / Move Later controls | FIXED: touch-friendly reorder controls verified; size controls still need broader mobile browser confirmation |
| Desktop sidebar nav order | Pointer drag reorder plus Move Earlier / Move Later buttons in Rearrange mode | FIXED: keyboard and button reorder controls added; existing drag retained |
| Mobile drawer nav order | Up/down buttons in customize mode | Better mobile alternative present |
| Shared branding/profile image crop | Pointer drag reposition plus zoom plus explicit direction and reset controls in the shared `ImageUpload` crop dialog | FIXED: PR #293 added non-drag controls, keyboard activation, reset, 44 px controls, and portal stacking above the mobile tab bar while retaining pointer drag and zoom |
| Shop map location | Draggable marker and location adjustment | Needs mobile verification |
| Backup import upload | Drag/drop copy plus file picker | Needs browser verification; do not run destructive import |

## Findings

### MN-001 - Dashboard reorder is not mobile-native

| Field | Detail |
| --- | --- |
| Severity | P2 |
| Status | FIXED ON MAIN — VERIFIED |
| Module | Dashboard |
| Device/browser | Mobile/touch, Chromium code audit and E2E |
| Viewport | 390x844 target |
| User role | Owner/Admin |
| Steps | Log in, open Dashboard, tap Edit layout, attempt to rearrange widgets without precise dragging. |
| Expected | User can reorder widgets with clear touch-friendly controls such as Move Up/Move Down or a rearrange mode that does not fight page scroll. |
| Actual (original) | Widget order used drag handles; no non-drag reorder alternative was found for dashboard widgets. |
| Evidence (original) | `src/app/dashboard/widgets/widget-grid.tsx` used `react-grid-layout`, drag handles, and resize handles. |
| Console/network error | None observed. |
| Environment | Local/code audit and local E2E. |
| Risk to shop user (original) | Mobile owner may be unable to customize dashboard layout reliably. |
| Recommended fix scope | Add explicit Move Up/Move Down controls in dashboard edit mode, keep desktop drag behavior. |
| Suggested branch | `fix/dashboard-mobile-reorder-controls` |
| Suggested regression test | Mobile dashboard edit test reorders one widget with buttons, reloads, and verifies persistence. |
| Resolution | Fixed on main in merge commit `21857aa639a88c3d615e3d6abdc6e10f07060e6d` from PR #289. Touch-friendly Move Earlier and Move Later controls were added to the widget edit menu. Existing drag behavior is retained. Exact customized widget width and height are preserved during button reorder. Four-, eight-, and twelve-column layouts remain valid, with no overlap or duplicate widget IDs introduced. Local and preference-sync persistence are verified. |
| Regression evidence | `tests/dashboard-widget-reorder.test.mjs` passed 8/8 locally. `tests/e2e/dashboard-mobile-reorder-controls.spec.ts` passed 3/3 in Chromium against local Supabase: move earlier, move later, and reload persistence at mobile width. The mobile-native audit test that exercises Dashboard touch surfaces passed. |
| Remaining limitations | Only the dashboard reorder surface was regenerated. Full authenticated viewport matrix, real-device hardware, WebKit/Firefox authenticated runs, 125% zoom, and full dark-mode matrix were not re-run. |

### MN-002 - Invoice "Download PDF" action is actually browser print

| Field | Detail |
| --- | --- |
| Severity | P2 |
| Status | FIXED ON MAIN — VERIFIED |
| Module | Invoices, PDFs/printing |
| Device/browser | Mobile and desktop browsers |
| Viewport | Desktop 1440x900 and mobile 390x844 manual localhost review |
| User role | Owner/Admin/Cashier where invoice access is allowed |
| Steps | Open invoice detail, open share/export actions, select Download PDF. |
| Expected | Either a real downloadable PDF is generated with clear loading/success/error feedback, or the label says Print/Save as PDF. |
| Actual (original) | The action called `window.print()`, so the wording could mislead users, especially on mobile. |
| Evidence (original) | `src/app/invoices/[id]/print-button.tsx` label/action inspection. |
| Console/network error | None observed. |
| Environment | Local/code audit, localhost manual review, and focused Playwright regression. |
| Risk to shop user (original) | Owner may think PDF export is broken when the browser print dialog opens instead of downloading a file. |
| Recommended fix scope | Rename to "Print / Save as PDF" or add real PDF generation/download. |
| Suggested branch | `fix/invoice-pdf-download-ux` |
| Suggested regression test | Invoice action test confirms the button label matches the behavior and print/export feedback is visible. |
| Resolution | Fixed on main in merge commit `17551da8db6723d4b7d235c9b55b9d81ef92f190` from PR #290. The Share Invoice modal action changed from `Download PDF` to `Print / Save as PDF`, the misleading download icon was replaced by the printer icon, and the accessible name is `Print or save invoice as PDF`. This did not add direct PDF generation; the behavior remains browser print/save-to-PDF. |
| Regression evidence | Desktop 1440x900 localhost manual review passed. Mobile 390x844 localhost manual review passed. `tests/e2e/invoice-print-save-pdf-wording.spec.ts` passed in Chromium and confirmed `window.print` is called, A4 print mode is selected, the modal closes after starting print, old `Download PDF` wording is absent, and the main `Print A4 / Save PDF`, Print 80mm, WhatsApp, and Download Image actions remain unchanged. `tests/e2e/cookie-banner-print-output.spec.ts` passed and confirmed the cookie banner remains absent from print output. |
| Business safety | No invoice totals, payments, balances, stock/FIFO, cash drawer, reports, invoice numbering, or business logic changed. |

### MN-003 - Print/share touch targets are below the mobile target guideline

| Field | Detail |
| --- | --- |
| Severity | P3 |
| Status | FIXED ON MAIN — VERIFIED |
| Module | Reports, returns, repairs, daily closing, supplier statements |
| Device/browser | Mobile touch |
| Viewport | 320x568, 390x844, and 430x932 focused verification |
| User role | Owner/Admin/Cashier where allowed |
| Steps | Open print/export action groups on detail/report pages. |
| Expected | Important print/share buttons should be approximately 44x44 px or larger. |
| Actual (original) | Several print/share buttons were styled around `h-10` or `h-9`, which rendered below the 44 px mobile touch-target guideline. |
| Evidence (original) | `src/app/reports/print-button.tsx`, `src/app/repairs/[id]/print-button.tsx`, `src/app/daily-closing/print-button.tsx`, and `src/app/suppliers/[id]/statement/print-button.tsx`; returns controls were already compliant. |
| Console/network error | None observed. |
| Environment | Local/code audit, localhost browser regression, source-contract regression. |
| Risk to shop user (original) | Slightly harder tapping on small phones. |
| Recommended fix scope | Normalize print/share controls to mobile-sized app buttons. |
| Suggested branch | `fix/print-action-touch-targets` |
| Suggested regression test | Visual/touch target smoke checks print buttons at 320 px width. |
| Resolution | Fixed on main in merge commit `b240ae533351917f846fe240daf602f39ca4abe1` from PR #292. Reports Print Report; repairs Print A4, Print 80mm, and Share WhatsApp; daily closing Print A4, Print 80mm, and Print shift report; and supplier statement Print A4 / Save PDF, Print 80mm, and Share WhatsApp now carry an explicit `min-h-[44px]`. Returns Print A4, Print 80mm, and Share WhatsApp already used `min-h-[44px]`, remained unchanged, and remain covered by the source-contract test. |
| Behavior retained | Print labels, icons, A4/thermal/shift-thermal modes, `window.print()`, print cleanup behavior, WhatsApp URLs, `_blank` and safe `rel` behavior, and existing print-hidden behavior were unchanged. No report, repair, return, daily-closing, supplier, financial, or business calculation changed. |
| Browser-rendered evidence | `tests/e2e/print-action-touch-targets.spec.ts` passed 2/2 in Chromium. Reports, Daily Closing, and Supplier Statement controls rendered at least 44 px tall at 320x568, 390x844, and 430x932 without horizontal overflow, clipped labels, framework overlays, or print-mode regressions. |
| Source-contract evidence | `tests/print-action-touch-targets.test.mjs` passed 13/13 and covers Reports: Print Report; Repairs: Print A4, Print 80mm, Share WhatsApp; Returns: Print A4, Print 80mm, Share WhatsApp; Daily closing: Print A4, Print 80mm, Print shift report; Supplier statement: Print A4 / Save PDF, Print 80mm, Share WhatsApp. |
| Limitations | No local repair detail fixture was available, no local return detail fixture was available, and no open local shift existed for a visible Print shift report control. Those controls were verified through the precise source-contract test rather than rendered detail-page browser checks. |

### MN-004 - Desktop sidebar reorder lacks a clear non-drag alternative

| Field | Detail |
| --- | --- |
| Severity | P2 |
| Status | FIXED ON MAIN — VERIFIED |
| Module | Sidebar/navigation |
| Device/browser | Desktop/tablet pointer and keyboard |
| Viewport | 1024x768 and larger |
| User role | Authenticated app user |
| Steps | Open app shell, enter desktop Rearrange mode, try to reorder sidebar navigation without pointer drag. |
| Expected | Drag reorder should have a keyboard/button alternative, matching the mobile drawer's up/down approach. |
| Actual (original) | Sidebar reorder used pointer events and drag state; no obvious up/down buttons were found in desktop sidebar. |
| Evidence (original) | `src/components/layout/sidebar-nav.tsx` pointer drag inspection; mobile drawer has button alternative. |
| Console/network error | None observed. |
| Environment | Local/code audit and focused local E2E. |
| Risk to shop user (original) | Accessibility and precision-pointer issue for users who cannot drag reliably. |
| Recommended fix scope | Add optional up/down controls or reuse mobile drawer customization controls. |
| Suggested branch | `fix/sidebar-rearrange-accessible-controls` |
| Suggested regression test | Keyboard-accessible sidebar reorder test. |
| Resolution | Fixed on main in merge commit `4cd1c0745334ed12fb4fc4eefff0cb26af7e9a40` from PR #291. The desktop sidebar Rearrange mode now shows visible Move Earlier and Move Later controls for every visible nav item. The first visible item has Move Earlier disabled; the last visible item has Move Later disabled. The existing pointer drag handle remains visible and wired. Reorder still uses the existing sidebar preference object and `saveSidebarPreferences` path. Archived items stay archived and excluded from visible order. Dashboard and POS archive protection remains unchanged. Stored collapsed state is not overwritten when Rearrange mode temporarily expands the sidebar. Cookie-consent values in the shared sidebar preference object are preserved. English, Urdu, and Roman Urdu sidebar labels were added for the new controls. Dark mode and reduced-motion behavior verified. No duplicate or missing navigation hrefs introduced. |
| Regression evidence | `tests/e2e/sidebar-accessible-reorder-controls.spec.ts` verified Move Earlier, Move Later, disabled boundaries, persistence after reload, archived-item preservation, consent preservation, and localized labels in Chromium against local Supabase. The full-file run was 2/3; the mouse/keyboard reorder test passed on an isolated rerun. `tests/e2e/auth-role-smoke.spec.ts` passed 9/9 across all five local roles. `tests/e2e/mobile-drawer-single-dialog.spec.ts` passed 5/5 on rerun. `tests/e2e/mobile-native-audit.spec.ts` passed 4/4 in this run. |
| Business safety | No auth, permission, route visibility, tenant scope, business-data, database, financial, or stock logic changed. |
| Remaining limitations | Real-device hardware, WebKit/Firefox authenticated runs, 125% zoom, and full dark-mode matrix were not re-run. |

### MN-005 - Shared branding/profile image crop is drag-first

| Field | Detail |
| --- | --- |
| Severity | P3 |
| Status | FIXED ON MAIN — VERIFIED |
| Module | Shared image upload, branding, profile picture, and onboarding |
| Device/browser | Mobile touch and keyboard users |
| Viewport | 375x667 and 390x844 targets |
| User role | Owner/Admin/Manager |
| Steps | Upload an image through a current shared `ImageUpload` surface, open the crop dialog, and try to position the image without dragging. |
| Expected | The user can reposition the crop by touch drag and by clear button/keyboard controls, and can restore a known default position and zoom. |
| Actual (original) | The crop dialog supported pointer drag and a zoom range, but lacked explicit directional nudge and reset controls. |
| Evidence (original) | `src/components/shared/image-upload.tsx` |
| Console/network error | None observed in final focused verification. |
| Environment | Local/code audit, localhost focused browser E2E, and source-contract regression. |
| Risk to shop user (original) | Users who cannot drag precisely may struggle to position shop logos, invoice logos, or profile images on small screens. |
| Recommended fix scope | Add non-drag directional nudge controls and a reset action inside the shared crop dialog without changing upload, storage, URL, bucket, image-processing, or form-save behavior. |
| Suggested branch | `fix/shared-image-crop-accessible-controls` |
| Suggested regression test | `tests/e2e/shared-image-crop-accessible-controls.spec.ts` |
| Call sites verified | `ImageUpload` is used in `src/app/settings/settings-form.tsx` for app/shop logo, invoice logo, and profile picture; and in `src/app/onboarding/onboarding-wizard.tsx` for profile picture and shop logo. `src/app/products/product-image-field.tsx` does **not** use `ImageUpload` and is not the affected surface. |
| Resolution | Fixed on main in merge commit `12cddabc28bf49d58af5e30fbb8d4f7f04a42af1` from PR #293, reviewed head `5395bef310abc950e5275b27e6bdc465371840da`. The shared crop dialog now has Move image up, Move image left, Reset crop, Move image right, and Move image down controls. The nudge step is 5, clamping remains 0 through 100, and reset restores X 50 / Y 50 / zoom 1. Crop status is visible and screen-reader-accessible. Controls are keyboard operable and at least 44 px. The overlay renders through `createPortal(..., document.body)` above the mobile tab bar. |
| Direction contract | Move image right decreases X, Move image left increases X, Move image down decreases Y, and Move image up increases Y. This intentionally matches the retained pointer-drag behavior, where CSS `object-position` moves the alignment point inversely to the visible image. |
| Retained behavior | Pointer drag, zoom range 1-3, zoom step 0.05, selected file preservation, Cancel, Escape, backdrop close, and the Use crop production path remain available. |
| Square crop evidence | Settings Profile Picture crop at 390x844 passed. Enter and Space keyboard operation worked, reset returned to 50 / 50 / 1, the square mask remained active, the focus ring was visible, and all five controls were at least 44 px with no clipping or horizontal overflow. |
| Landscape crop evidence | Settings Invoice Logo crop at 375x667 passed. Drag and button directions agreed, the landscape mask remained active, and all five controls were at least 44 px with no clipping or horizontal overflow. |
| Portal evidence | Browser verification confirmed the overlay is a direct child of `document.body`, overlay z-index 80 is above mobile-tab z-index 40, the bottom-tab hit area resolves inside the crop overlay while open, and normal tab interaction returns after close. |
| Safety evidence | No framework error portal was removed or hidden. Page errors: 0. Visible framework errors: 0. Native browser dialogs: 0. Storage monitoring began before Settings navigation and file selection. Supabase Storage object writes: 0. No saved-settings success state and no uploaded-success state appeared. |
| Use crop limitation | The automated no-write crop regression did not click Use crop. It intentionally verified positioning, accessibility, portal behavior, reset, close paths, and absence of unintended storage writes. Existing upload, canvas, storage, callback, bucket, folder, and save behavior was unchanged by source review and regression contracts. Actual persisted upload completion was not required to close MN-005 because MN-005 concerned the absence of non-drag positioning controls. Product image upload remains a separate partially tested workflow. |

### MN-006 - Full authenticated viewport matrix is too heavy as one dev-server test

| Field | Detail |
| --- | --- |
| Severity | P2 |
| Status | FIXED IN AUDIT SUITE — VERIFIED |
| Module | Whole authenticated app |
| Device/browser | Local Chromium |
| Viewport | 14 required viewport entries preserved |
| User role | Owner/Cashier intended; owner matrix split and verified |
| Steps | Start local app and local Supabase, run authenticated Playwright route/viewport matrix. |
| Expected | The route matrix completes across all required authenticated routes and viewports without one slow route blocking later coverage. |
| Actual (original) | Local Supabase was restored and login worked, but the full owner route matrix timed out after several minutes on the local dev server. Focused owner/cashier mobile smoke passed. |
| Evidence (original) | `PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/mobile-native-audit.spec.ts --project=chromium` timed out in the owner app-shell matrix; focused `-g "mobile navigation"` run passed 2/2. |
| Console/network error | Original test timeout while navigating repeated route/viewport matrix. |
| Environment | Local only. |
| Risk to shop user (original) | No direct production risk by itself, but the audit suite needed splitting before it could be a reliable CI/manual tool. |
| Recommended fix scope | Split authenticated viewport matrix into smaller focused tests by area or viewport group. |
| Suggested branch | `test/split-mobile-native-authenticated-matrix` |
| Suggested regression test | Smaller mobile-native audit tests that complete independently for Dashboard, POS, Products, Invoices, and Settings. |
| Resolution | The single 224-navigation owner test was replaced with 12 independently reported owner matrix tests: three viewport families multiplied by four route groups. The viewport families are mobile (6), tablet (3), and desktop (5). The route groups are core sales (5), operations (4), reports and administration (4), and supply (3). A dedicated `matrix partition preserves all required owner route coverage` test proves every existing `REQUIRED_VIEWPORTS` entry appears exactly once, every existing `APP_ROUTES` path appears exactly once, there are no duplicate viewport names or route paths, and the total remains 14 x 16 = 224 combinations. |
| Regression evidence | Two consecutive focused runs passed 13/13 each, including the partition test and all 12 owner matrix tests. Focused run 1 longest owner slice was 34s (`mobile viewports / reports and administration routes`). Focused run 2 longest owner slice was 44s (`desktop viewports / reports and administration routes`). The complete `tests/e2e/mobile-native-audit.spec.ts` file passed 16/16 with no skips; longest owner slice was 54s (`mobile viewports / core sales routes`). `tests/e2e/auth-role-smoke.spec.ts` passed 9/9. |
| Business safety | No application source, auth, permission, route visibility, tenant scope, business-data, database, financial, stock, or report logic changed. |
| Remaining limitations | Real-device hardware, WebKit/Firefox authenticated runs, 125% zoom, slow network, and full dark-mode matrix were not re-run. |

### MN-007 - Local dev console shows CSP nonce hydration warning on public pages (development-only)

| Field | Detail |
| --- | --- |
| Severity | P3 |
| Status | VERIFIED — DEVELOPMENT-ONLY / NO PRODUCTION IMPACT OBSERVED |
| Module | Public/auth pages, app root layout |
| Device/browser | Chromium local dev, Chromium local production build, Chromium production |
| Viewport | Multiple viewport matrix entries |
| User role | Logged-out |
| Steps | Run public/auth Playwright viewport smoke against local Next dev server; run local production build; run live production curl; inspect Vercel preview authentication barrier. |
| Expected | Hydration warning should be absent in production and local production builds; dev-only console noise is acceptable if documented. |
| Actual | Warning reproduced 10/10 against local dev server; not reproduced in local production build (0/10); not observed in production Playwright classification (0/10). The protected branch preview (`https://saledock-cloud-pos-git-qa-csp-non-e4e51f-fardan-aatirs-projects.vercel.app`) redirected to `https://vercel.com/sso-api`, so SaleDock application tests could not be exercised. |
| Evidence | Local dev logs during `tests/e2e/mobile-native-audit.spec.ts`; PR #294 (`docs/qa/csp-nonce-hydration-verification.md` and `tests/e2e/csp-nonce-hydration-verification.spec.ts`) browser classification evidence on `https://saledock.site/`; `tests/csp-nonce-flow.test.mjs` source-contract check; no CSP violation reports collected from production. HTTP 200 curl checks against `https://saledock.site/` and `https://saledock-cloud-pos.vercel.app/login` verify public availability only, not browser hydration or CSP behavior. |
| Console/network error | React hydration warning, local dev only. |
| Environment | Local dev, local production build, live production, SSO-protected preview. |
| Risk to shop user | No observed production risk. The warning was observed only under the tested `next dev` environment. It was not reproduced under `next build` plus `next start` or production. No source cause was proven. |
| Recommended fix scope | None. No source change justified. |
| Suggested branch | N/A |
| Suggested regression test | N/A |
| Resolution | Classified as a documented development-only observation in the tested environments. PR #294 provides a reproducible verification record and the test file `tests/csp-nonce-flow.test.mjs` enforces the CSP nonce propagation source contract. |
| Regression evidence | `tests/csp-nonce-flow.test.mjs` source-contract check passed; `tests/e2e/csp-nonce-hydration-verification.spec.ts` public route smoke passed; `tests/e2e/mobile-native-audit.spec.ts` public route smoke passed. PR #294 production E2E on `https://saledock.site/` installed the CSP-report interceptor and observed 0 hydration warnings, 0 nonce mismatches, 0 framework overlays, 0 page errors, 0 native dialogs, 0 CSP report attempts, 0 CSP report requests blocked, and 0 CSP reports stored across 10/10 public routes. Subsequent curl checks confirmed endpoint availability only: `https://saledock.site/` returned HTTP 200, `https://saledock.site/login` returned HTTP 200, and `https://saledock-cloud-pos.vercel.app/login` returned HTTP 200. The HTTP 200 checks do not independently inspect browser hydration, console warnings, nonce equality, or CSP reports. |
| Remaining limitations | Vercel preview application tests were blocked by SSO protection. The protected branch preview URL was `https://saledock-cloud-pos-git-qa-csp-non-e4e51f-fardan-aatirs-projects.vercel.app`; unauthenticated requests redirected to `https://vercel.com/sso-api`. The SSO preflight test passed by confirming the HTTP 302 redirect; 10 SaleDock application tests were skipped. No SaleDock application response was inspected on the protected preview. The public Vercel alias `https://saledock-cloud-pos.vercel.app/login` was used only for an HTTP availability check, not as a preview or as browser classification evidence. External `_next` scripts without an explicit nonce were observed in dev/local production HTML but were not proven safe under an enforced CSP. |

### MN-008 - Mobile navigation drawer close button is blocked by overlay

| Field | Detail |
| --- | --- |
| Severity | P1 |
| Status | FIXED ON MAIN — VERIFIED |
| Module | Mobile navigation/sidebar |
| Device/browser | Chromium, mobile emulation |
| Viewport | 390x844 |
| User role | Owner |
| Steps | Log in locally as owner, open Dashboard, tap the hamburger menu, tap the close button. |
| Expected | One navigation dialog opens, the close button is tappable, and the drawer closes immediately. |
| Actual (original) | The DOM exposed duplicate `Navigation menu` dialogs and duplicate close buttons. A Playwright click on the visible close button was intercepted by the drawer overlay and did not complete. |
| Evidence (original) | `/Users/sw12/Projects/gadget-zone-online-pos/test-results/mobile-native-audit-Mobile-c55ea-s-expose-reachable-controls-chromium/test-failed-1.png` from the failed focused run; trace retained under the same test-results folder. |
| Console/network error | Playwright reported pointer-event interception by the drawer overlay. |
| Environment | Local disposable Supabase, authenticated owner. |
| Risk to shop user (original) | A mobile owner was unable to close the menu using the visible close control, making the app feel broken and trapping part of the screen. Screen readers also saw duplicate dialogs. |
| Recommended fix scope | Render a single mobile drawer instance, ensure only the active drawer is accessible, and fix overlay/close-button stacking. |
| Suggested branch | `fix/mobile-drawer-close-and-duplicate-dialog` |
| Suggested regression test | Mobile navigation test opens the drawer, asserts exactly one dialog, taps close, and verifies it disappears. |
| Resolution | Fixed on main in commit `faf1dddfacaced9e3a91ce2e70b8d5c4c9d4b2dd`. The drawer was split into a single `mobile-drawer-panel` portal and a `mobile-drawer-trigger` hamburger. The trigger is rendered in the topbar for mobile and tablet, and the panel mounts once inside `DrawerProvider`. A `matchMedia` listener closes the drawer and restores body scroll when the viewport crosses into desktop width. Original PR #288 was closed by the commit keyword; the code is present on main. |
| Regression evidence | `tests/e2e/mobile-drawer-single-dialog.spec.ts` passed 5/5 in Chromium against local Supabase: mobile open/close/backdrop/Escape/navigate/customize, tablet hamburger and single drawer, desktop trigger hidden, rotation to desktop closes drawer and restores scroll, repeated open/close creates no duplicate portal. `tests/e2e/auth-role-smoke.spec.ts` passed 9/9 across all five local roles. |
| Remaining limitations | Real-device hardware, WebKit/Firefox authenticated runs, 125% zoom, and full dark-mode matrix were not retested. |

### MN-009 - Cookie banner appears in invoice print/PDF output

| Field | Detail |
| --- | --- |
| Severity | P1 |
| Status | FIXED ON MAIN — VERIFIED |
| Module | Invoices, PDF/printing, cookie/privacy banner |
| Device/browser | Chromium, mobile emulation and print media |
| Viewport | 390x844, A4 print output |
| User role | Owner |
| Steps | Log in locally, open invoice `INV-000001`, generate print-media screenshot and A4 PDF while the cookie banner is present. |
| Expected | Printable invoice uses a clean white print background with no web overlays; totals, paid, due, and item rows remain visible. |
| Actual (original) | The cookie banner appeared inside the printable invoice output and covered the item/totals area. The A4 PDF was generated but included this overlay state. |
| Evidence (original) | `/tmp/saledock-mobile-audit-artifacts/invoice-mobile-print-media.png`, `/tmp/saledock-mobile-audit-artifacts/invoice-a4-print.pdf`, and the repeated dismissed-banner attempt at `/tmp/saledock-mobile-audit-artifacts/invoice-mobile-print-media-cookie-dismissed.png`. |
| Console/network error | None. |
| Environment | Local disposable Supabase, local invoice generated through QA flow. |
| Risk to shop user (original) | Printed/PDF invoices could be unusable for a first-time browser/session because the privacy banner covered financial totals. |
| Recommended fix scope | Hide cookie/privacy banner under print media and confirm it does not overlay invoice/receipt/report print views. |
| Suggested branch | `fix/cookie-banner-print-output` |
| Suggested regression test | Invoice print-media test asserts cookie banner is not visible with `media: print` and generated PDF contains no overlay. |
| Resolution | Fixed on main in commit `2c98657293449629f30be4ee08e34cc4cafca3ab`. PR #287 added a print-media CSS rule that hides the cookie/privacy banner when printing. The fix applies to the invoice A4 and 80mm/thermal print paths. |
| Regression evidence | `tests/e2e/cookie-banner-print-output.spec.ts` passed 1/1 in Chromium: banner visible on screen, hidden in `media: print`, A4 and 80mm thermal print PDFs generated with visible totals. `tests/e2e/cookie-banner-sidebar.test.ts` passed 1/2 (one skipped because no dashboard credentials, one accept-all sidebar test passed). `tests/unit/analytics-notice-consent.test.mjs` passed 4/4, including the print-media visibility assertion. |
| Remaining limitations | The MN-009 focused run generated invoice artifacts only. Reports was later generated and verified separately through PR #295, and Returns was later generated and verified through PR #299. Repairs, daily closing, and supplier statement print surfaces were not visually regenerated under this finding. |

### RPT-PRINT-001 - Reports A4 output was clipped after one physical page

| Field | Detail |
| --- | --- |
| Severity | P2 presentation/print completeness defect |
| Status | FIXED ON MAIN — VERIFIED LOCALLY |
| Route | `/reports?range=this_month` |
| Device/browser | Chromium against a local production-mode Next server |
| Viewport | 1440x900, A4 print output |
| User role | Local disposable QA owner |
| Original issue | Reports A4 PDF was limited to one physical page and ended partway through Profitability Summary. |
| Impact | Later report sections were missing from saved and printed output. |
| Source cause | AppShell retained fixed viewport-height and internal-scroll constraints in print media. |
| Fix | Optional `printFullDocument` AppShell contract. It defaults off and is enabled only for Reports, allowing the print root, content column, main element, and content wrapper to grow and paginate. |
| PR | #295 - `fix: print the complete reports document` |
| Merge commit | `30400475202eeb2bbeb126abe3e5a281efebb95d` |
| Before | 1 A4 page, truncated. |
| After | 5 A4 pages, with later sections and the final Supplier Dues & Purchases Snapshot section present. |
| Validation | Source contract passed 8/8; focused Reports pagination E2E passed 1/1; existing print-control E2E passed 1/1; all five locally rendered PDF pages were inspected; unexpected business-data writes were 0. |
| Regression after PR #297 | The existing pagination regression was rerun locally. The Reports PDF remained five A4 pages with later and final sections present and no truncation. |
| Behavior retained | Normal Reports screen scrolling remained active. Screen and print value signatures matched in memory. No report formula, value, query, auth, permission, database, or business-data behavior changed. |
| Limitations | Evidence was authenticated locally only. GitHub CI verified lint, typecheck, and build but did not render or visually inspect the five PDF pages. Financial formula correctness was not tested. No authenticated production Reports login or PDF generation occurred. |

### RPT-MOBILE-001 - Reports metric labels were ellipsized on mobile

| Field | Detail |
| --- | --- |
| Severity | P3 |
| Status | FIXED ON MAIN — VERIFIED LOCALLY |
| Route | `/reports?range=this_month` |
| Device/browser | Chromium against a local production-mode Next server |
| Original viewport | 390x844 |
| Original issue | Three shared Reports StatCard labels were visually truncated with ellipses. |
| Affected labels | Net Sales (Revenue); Gross Profit Margin; Service Revenue / Profit |
| Original source condition | Shared StatCard placed `truncate` directly on every label. |
| Fix | Typed opt-in `wrapLabel?: boolean`, default false. Reports opts all five shared StatCards into wrapping while unrelated consumers retain truncation. |
| PR | #297 - `fix: show complete reports card labels on mobile` |
| Reviewed head | `e37303e04c2fefaa7b83b5a1b0b9662f4147cad7` |
| Merge commit | `0e85a47561b073236c5297d629927c8684fcc889` |
| Regression evidence | Source contract passed 8/8; focused label E2E passed 5/5; mobile 320x568, 390x844, and 430x932 passed; desktop 1440x900 passed; print media 390x844 passed; pagination E2E passed 1/1; local PDF remained five A4 pages; tooltip overlap, value overlap, horizontal overflow, and unexpected writes were all 0. |
| Business safety | Labels, values, formulas, queries, authentication, permissions, and database behavior were unchanged. |
| Limitations | Evidence was authenticated locally only. No production Reports login or PDF was performed. Unrelated StatCard consumers were source-contract protected but were not all visually revisited. Financial formula correctness was not tested. |

### RET-PRINT-001 - Returns 80mm output was miniature or clipped

| Field | Detail |
| --- | --- |
| Severity | P2 |
| Status | FIXED ON MAIN — VERIFIED LOCALLY |
| Module | Returns, PDFs/printing |
| Route | `/returns/[id]` |
| Device/browser | Chromium against a local production-mode Next server |
| User role | Local disposable QA owner |
| Original issue | The generated 80mm Returns PDF used only 34.3% of the physical page width and appeared as a miniature left-side receipt. A valid fixed-height page restored readable scale but exposed right-edge clipping until the printable context was corrected to 72mm. |
| Original evidence | Physical page approximately 80mm wide; original content span 34.3%; original bounds approximately 8.82 to 86.65 points. A valid-page-only proof reached 86.4% span but clipped at the right edge. |
| Cause | Invalid mixed `size: 80mm auto` page syntax; explicit-width PDF scaling from a wider print context; and an 80mm body/main combined with a centered 72mm receipt plus 4mm physical margins, which created an additional internal horizontal offset. |
| Fix | Returns-specific named page `returnsThermalReceipt`; valid 80mm by 297mm fallback; 4mm physical margins; 72mm printable context; pre-print receipt measurement; CSS pixel conversion using `25.4 / 96`; 8mm physical-margin addition plus 1mm upward allowance; page height rounded upward to 0.1mm; and a Returns-only body marker. The shared thermal page remains unchanged. No AppShell, transform, scale, or zoom workaround was used. |
| PR | #299 - `fix: center and size returns thermal receipts` |
| Reviewed head | `76cfd4f7c1fd834fe2a1fbfb72f0732e5406559f` |
| Merge commit | `09e1df96ccb571872ba0c3f46bd457723bfdae53` |
| Standard receipt evidence | Approximately 80mm by 132.3mm; 1 page; 89.9% horizontal span; bounds 11.25 to 215.34 points; no clipping. |
| Long receipt evidence | Approximately 80mm by 164.4mm; 1 page; 89.9% horizontal span; no clipping; footer present. |
| Additional regression evidence | A4 produced one complete page. Mobile 390x844 and desktop 1440x900 passed. Reports pagination passed 3/3 with five A4 pages, final section present, and screen scrolling retained. Fixture cleanup left 0 generated rows. Browser business writes and forbidden stock, payment, balance, and closing writes were 0. |
| Business safety | Return and refund values, queries, stock/FIFO, payments, balances, authentication, permissions, and database behavior were unchanged. |
| Limitations | Local authenticated evidence only. No production Returns login or PDF, return-accounting verification, refund-correctness verification, stock/FIFO restoration verification, or physical thermal-printer hardware test was performed. |

### RET-PRINT-001-LIFECYCLE - Returns thermal preparation could resume after cleanup

| Field | Detail |
| --- | --- |
| Severity | P3 |
| Status | FIXED ON MAIN — VERIFIED LOCALLY |
| Module | Returns print controls |
| Route | `/returns/[id]` |
| Original issue | Asynchronous thermal preparation could continue after cleanup or component unmount. The deterministic previous-head test produced no stale print or markers in the held-readiness path, but the stale continuation entered the error path and displayed one false preparation alert. |
| Previous-head evidence | Head `e160dc10ec53c124855a5fd690e2f92e0a569829`; afterprint dispatched during held image readiness; print calls 0; stale styles/markers 0; false role-alert 1. |
| Fix | Unique component-local attempt identity; exact-attempt cancellation; cleanup ownership protection; mounted-state guard; cancellation checks after readiness and animation frames and before measurement, style insertion, markers, and print; silent cancellation with no fallback timer; and unmount cancellation plus cleanup. |
| PR | #299 - `fix: center and size returns thermal receipts` |
| Reviewed head | `76cfd4f7c1fd834fe2a1fbfb72f0732e5406559f` |
| Merge commit | `09e1df96ccb571872ba0c3f46bd457723bfdae53` |
| Cleanup-during-readiness evidence | PASS. Print calls 0; dynamic styles 0; body markers 0; measurement markers 0; fallback timers 0; role-alert absent. |
| Client-navigation unmount evidence | PASS. Print calls 0; stale state 0; false alert absent. |
| Errors and writes | Page errors 0; console errors 0; native dialogs 0; browser business writes 0. |
| Limitations | Local browser evidence only. No production cancellation test and no financial-correctness claim. |

## Automated Audit Coverage Added

New file:

- `tests/e2e/mobile-native-audit.spec.ts`

The suite currently covers:

- Public/auth route viewport smoke across all required mobile, tablet, and desktop sizes.
- Page-level horizontal overflow detection.
- Native browser dialog failure detection.
- Framework error overlay detection.
- Authenticated app-shell route matrix for 16 app routes when local seeded owner login is available.
- Mobile navigation/dashboard/POS touch-surface smoke when local seeded owner login is available.
- Cashier restricted-users-page smoke when local seeded cashier login is available.

The authenticated tests deliberately skip instead of guessing when local login is unavailable. In this continuation run, local login was available after Docker/Supabase restoration.

## Commands Run During Audit

| Command | Result |
| --- | --- |
| `git remote -v` | SaleDock GitHub remote confirmed |
| `git rev-parse HEAD` | `cad3b8ce70a20a58c2f3919703b7cfa5edf861ba` |
| `docker info` | PASS during continuation |
| `npx supabase status --output json` | PASS during continuation; API URL confirmed local `http://127.0.0.1:54321` |
| `npx supabase db reset --local --yes` | PASS against local Supabase only |
| `node scripts/dev/setup-local-qa.mjs` | PASS; fake local owner/admin/manager/cashier/technician created/linked |
| Local role verification query | PASS; all five fake users active, same local org/branch, profile/org onboarding complete |
| Local test grants for disposable DB | PASS; used only to allow local service-role test reads after reset |
| `git diff --check` | PASS |
| `npm run lint` | PASS - 0 errors, 2 existing Privacy Center hook warnings |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `node --test tests/pos-held-bills.test.mjs tests/catalog-validation.test.mjs tests/karachi-business-day.test.mjs tests/pos-service-checkout.test.mjs tests/customer-settlement-validation.test.mjs` | PASS - 35 tests passed |
| `node --env-file=.env.local --test tests/seed-stock-lots.test.mjs tests/pos-held-bills.test.mjs tests/catalog-validation.test.mjs tests/karachi-business-day.test.mjs tests/pos-service-checkout.test.mjs tests/customer-settlement-validation.test.mjs` | PASS - 37 tests passed after local Supabase restoration and local-only grants |
| `npx supabase db query --local --file tests/pos-qa-checklist-part2.sql` | BLOCKED - file is not present on this branch after repository search |
| `npx supabase db query --local --file tests/pos-service-checkout-zero-unit.sql` | PASS |
| `PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/mobile-native-audit.spec.ts --project=chromium` | FAIL/PARTIAL - public matrix passed, focused smoke later passed, full owner matrix timed out and drawer close bug was found |
| `PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/mobile-native-audit.spec.ts --project=chromium -g "mobile navigation"` | PASS - 2 focused authenticated tests passed after preserving drawer finding in report |
| Temporary WebKit/Firefox public smoke | PASS - public/auth viewport matrix passed in WebKit and Firefox after local browser binary install |
| `PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/auth-role-smoke.spec.ts --project=chromium` | PASS - 9 tests passed |
| `PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/customer-settlement-optional-fields.spec.ts --project=chromium` | PASS - 1 test passed |
| `PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/pos-held-bills-qa.spec.ts --project=chromium -g "physical-product"` | PASS - 1 test passed after clean local reset; earlier parallel run was contaminated by reset and discarded |
| Local invoice print artifact capture | FAIL/PARTIAL - A4 PDF generated; cookie banner appeared in print media and covered totals |

## Commands Run During Rerun (post-fix)

| Command | Result |
| --- | --- |
| `git fetch origin main` | PASS - origin/main at `faf1dddfacaced9e3a91ce2e70b8d5c4c9d4b2dd` |
| `git checkout qa/mobile-native-full-product-audit` | PASS |
| `git rebase origin/main` | PASS - no conflicts |
| `git push --force-with-lease origin qa/mobile-native-full-product-audit` | PASS - new head `a6c546b6fb5703f7ed9a8ee0a5dbcf8303a894cb` |
| `npx supabase db reset --local --yes` | PASS against local Supabase only |
| `node scripts/dev/setup-local-qa.mjs` | PASS; fake local QA users created/linked |
| `npm run lint` | PASS - 0 errors, 2 existing Privacy Center hook warnings |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `node --test tests/pos-held-bills.test.mjs tests/catalog-validation.test.mjs tests/karachi-business-day.test.mjs tests/pos-service-checkout.test.mjs tests/customer-settlement-validation.test.mjs` | PASS - 35 tests passed |
| `PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/mobile-drawer-single-dialog.spec.ts --project=chromium` | PASS - 5/5 tests passed |
| `PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/auth-role-smoke.spec.ts --project=chromium` | PASS - 9/9 tests passed |
| `PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/cookie-banner-print-output.spec.ts --project=chromium` | PASS - 1/1 test passed |
| `PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/cookie-banner-sidebar.test.ts --project=chromium` | PASS - 1/2 passed, 1 skipped (no dashboard credentials for reject-all test) |
| `node --test tests/unit/analytics-notice-consent.test.mjs` | PASS - 4/4 tests passed |
| `PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/mobile-native-audit.spec.ts --project=chromium` | PARTIAL - 3/4 passed; owner touch-surface test failed in full matrix run but passed when run in isolation (MN-006 flakiness) |
| `gh pr comment 288 --body "..."` | PASS - traceability comment added to PR #288 |
| `curl -sS -o /dev/null -w '%{http_code}' https://saledock.site/` | 200 |
| `curl -sS -o /dev/null -w '%{http_code}' https://saledock.site/login` | 200 |
| `curl -sS -o /dev/null -w '%{http_code}' https://saledock-cloud-pos.vercel.app/login` | 200 (public Vercel production alias; availability only) |

## Commands Run During MN-002 Rebase Update

| Command | Result |
| --- | --- |
| `git fetch origin main qa/mobile-native-full-product-audit` | PASS - origin/main at `17551da8db6723d4b7d235c9b55b9d81ef92f190`; audit branch pre-rebase head at `1f04956744a3f41b4b58e9d2a27099251f4350f4` |
| `git rebase origin/main` | PASS - no conflicts |
| `git diff --check` | PASS |
| `npm run lint` | PASS - 0 errors, 2 existing Privacy Center hook warnings |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `node --test tests/pos-held-bills.test.mjs tests/catalog-validation.test.mjs tests/karachi-business-day.test.mjs tests/pos-service-checkout.test.mjs tests/customer-settlement-validation.test.mjs tests/dashboard-widget-reorder.test.mjs` | PASS - 47 tests passed |
| `PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/invoice-print-save-pdf-wording.spec.ts --project=chromium` | PASS - 1/1 test passed after the test accepted cookie consent before clicking the modal print action |
| `PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/cookie-banner-print-output.spec.ts --project=chromium` | PASS - 1/1 test passed |
| `PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/mobile-native-audit.spec.ts --project=chromium` | PARTIAL - public matrix passed, owner route matrix timed out at `/returns` after 420 seconds, and the remaining two tests did not run (MN-006 remains open) |
| `PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/mobile-native-audit.spec.ts --project=chromium -g "mobile navigation, dashboard editing, and POS touch surfaces"` | PASS - 1/1 focused owner touch-surface test passed after updating the audit smoke to wait for the drawer portal and verify the new dashboard Move Earlier / Move Later controls |
| `PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/mobile-drawer-single-dialog.spec.ts --project=chromium` | PASS - 5/5 tests passed; confirms the MN-008 drawer fix still works |

## Commands Run During MN-004 Rebase Update

| Command | Result |
| --- | --- |
| `git fetch origin main qa/mobile-native-full-product-audit` | PASS - origin/main at `4cd1c0745334ed12fb4fc4eefff0cb26af7e9a40`; audit branch pre-rebase head at `f2c0dfdf9bc5668a183e22294c2582c81b731eda` |
| `git rebase origin/main` | PASS - no conflicts |
| `git diff --check` | PASS |
| `npm run lint` | PASS - 0 errors, 2 existing Privacy Center hook warnings |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `node --test tests/pos-held-bills.test.mjs tests/catalog-validation.test.mjs tests/karachi-business-day.test.mjs tests/pos-service-checkout.test.mjs tests/customer-settlement-validation.test.mjs tests/dashboard-widget-reorder.test.mjs` | PASS - 47 tests passed |
| `PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/sidebar-accessible-reorder-controls.spec.ts --project=chromium` | 2/3 passed in full-file run; the mouse/keyboard reorder test showed timing sensitivity around preference sync. When rerun in isolation, that test passed. |
| `PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/sidebar-accessible-reorder-controls.spec.ts --project=chromium -g "mouse and keyboard reorder one visible item"` | PASS - 1/1 isolated rerun passed |
| `PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/auth-role-smoke.spec.ts --project=chromium` | PASS - 9/9 tests passed |
| `PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/mobile-drawer-single-dialog.spec.ts --project=chromium` | 4/5 passed in first full run; the mobile navigation test failed to carry the authenticated session to the POS link. Rerun passed 5/5. |
| `PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/mobile-native-audit.spec.ts --project=chromium` | PASS - 4/4 tests passed; the full owner route/viewport matrix completed in this run, but the suite has historically timed out (MN-006 remains open as a test-infrastructure finding). |
| `curl -sS -o /dev/null -w '%{http_code}' https://saledock.site/` | 200 |
| `curl -sS -o /dev/null -w '%{http_code}' https://saledock.site/login` | 200 |
| `curl -sS -o /dev/null -w '%{http_code}' https://saledock-cloud-pos.vercel.app/login` | 200 (public Vercel production alias; availability only) |

## Commands Run During MN-006 Audit Suite Split

| Command | Result |
| --- | --- |
| `git fetch origin main qa/mobile-native-full-product-audit` | PASS - origin/main at `4cd1c0745334ed12fb4fc4eefff0cb26af7e9a40`; audit branch starting head at `165e9ea38c1de6438976675d8fdaec4ba72c9bf4` |
| `git diff --check` | PASS |
| `npm run lint` | PASS - 0 errors, 2 existing Privacy Center hook warnings |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `node --test tests/pos-held-bills.test.mjs tests/catalog-validation.test.mjs tests/karachi-business-day.test.mjs tests/pos-service-checkout.test.mjs tests/customer-settlement-validation.test.mjs tests/dashboard-widget-reorder.test.mjs` | PASS - 47 tests passed |
| `PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/mobile-native-audit.spec.ts --project=chromium --workers=1 -g "owner matrix\|matrix partition"` | PASS - focused run 1 completed 13/13 with no skips. Longest owner matrix test: 34s, `mobile viewports / reports and administration routes`. |
| `PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/mobile-native-audit.spec.ts --project=chromium --workers=1 -g "owner matrix\|matrix partition"` | PASS - focused run 2 completed 13/13 with no skips. Longest owner matrix test: 44s, `desktop viewports / reports and administration routes`. |
| `PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/mobile-native-audit.spec.ts --project=chromium --workers=1` | PASS - full audit file completed 16/16 with no skips. Longest owner matrix test: 54s, `mobile viewports / core sales routes`. |
| `PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/auth-role-smoke.spec.ts --project=chromium --workers=1` | PASS - 9/9 tests passed |

## Commands Run During MN-003 Main Sync

| Command | Result |
| --- | --- |
| `git fetch origin main qa/mobile-native-full-product-audit` | PASS - origin/main at `b240ae533351917f846fe240daf602f39ca4abe1`; audit branch pre-rebase head at `b4d9528329a3a6ecadaa0de07e00c1164302eb34` |
| `git rebase origin/main` | PASS - no conflicts |
| `git diff --check` | PASS |
| `npm run lint` | PASS - 0 errors, 2 existing Privacy Center hook warnings |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `node --test tests/pos-held-bills.test.mjs tests/catalog-validation.test.mjs tests/karachi-business-day.test.mjs tests/pos-service-checkout.test.mjs tests/customer-settlement-validation.test.mjs tests/dashboard-widget-reorder.test.mjs tests/print-action-touch-targets.test.mjs` | PASS - 60/60 tests passed, including 13/13 print/share touch-target source-contract checks |
| `PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/print-action-touch-targets.spec.ts --project=chromium --workers=1` | PASS - 2/2 tests passed; deterministic Reports, Daily Closing, and Supplier Statement controls rendered at least 44 px at 320x568, 390x844, and 430x932 |
| `PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/cookie-banner-print-output.spec.ts --project=chromium --workers=1` | PASS - 1/1 test passed |
| `PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/auth-role-smoke.spec.ts --project=chromium --workers=1` | PASS - 9/9 tests passed |
| `PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/mobile-native-audit.spec.ts --project=chromium --workers=1` | PASS - 16/16 tests passed in 4.2m; no skips, retries, or timeouts |
| Extra timing extraction run: `PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/mobile-native-audit.spec.ts --project=chromium --workers=1 --reporter=json > /tmp/saledock-mobile-audit-final.json` | FAIL - 15 expected, 1 unexpected, no skips/flakes reported by Playwright JSON. The tablet operations owner matrix timed out after 180s while navigating to `/daily-closing`. This was an additional timing run after the required full audit pass. |
| Focused rerun of failed group: `PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/mobile-native-audit.spec.ts --project=chromium --workers=1 -g "owner matrix: tablet viewports / operations routes"` | PASS - 1/1 in 41.5s. The `/daily-closing` timeout did not reproduce in the focused group. |
| Local visual spot-check at 320x568 and 390x844 | PASS for `/reports`, `/daily-closing`, and `/suppliers/00000000-0000-4000-8000-000000002001/statement`; measured controls at 44 px, no horizontal overflow, no clipped labels, and print/share controls hidden in print media |

## Commands Run During MN-005 Main Sync

| Command | Result |
| --- | --- |
| `git fetch origin --prune` | PASS - origin/main at `12cddabc28bf49d58af5e30fbb8d4f7f04a42af1`; audit branch pre-rebase head at `259c1e4d71dfb0975cba23a32fc7fbc459d823ec` |
| `git switch qa/mobile-native-full-product-audit` | PASS - switched from `fix/shared-image-crop-accessible-controls` to the verified audit branch |
| `git rebase origin/main` | PASS - no conflicts; rebased audit head before this documentation update was `30aa691357f0372f0a535d169ecdf84b4988b49f` |
| `git diff --check` | PASS |
| `npm run lint` | PASS - 0 errors, 2 existing Privacy Center hook warnings |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `node --test tests/pos-held-bills.test.mjs tests/catalog-validation.test.mjs tests/karachi-business-day.test.mjs tests/pos-service-checkout.test.mjs tests/customer-settlement-validation.test.mjs tests/dashboard-widget-reorder.test.mjs tests/print-action-touch-targets.test.mjs tests/shared-image-crop-accessible-controls.test.mjs` | PASS - 77/77 tests passed, including 17/17 shared crop source-contract checks |
| `PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/shared-image-crop-accessible-controls.spec.ts --project=chromium --workers=1` | PASS - 6/6 tests passed in 50.7s; page errors 0, visible framework errors 0, native dialogs 0, Supabase Storage object writes 0 |
| `PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/auth-role-smoke.spec.ts --project=chromium --workers=1` | PASS - 9/9 tests passed in 47.3s |
| `PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/mobile-native-audit.spec.ts --project=chromium --workers=1` | PASS - 16/16 tests passed in 3.8m; no skips, retries, failures, or timeouts |
| Historical supplemental JSON timing experiment | NOT RERUN - the previous intermittent tablet `/daily-closing` timeout remains recorded above as audit history |

## Commands Run During MN-007 Final Refresh

| Command | Result |
| --- | --- |
| `git fetch origin main qa/mobile-native-full-product-audit` | PASS - origin/main at `6ccca9b7f9e1127a848890fe2918ee54501f6507`; PR #294 merge commit reachable on main |
| `git switch qa/mobile-native-full-product-audit` | PASS - working tree clean except for intended audit doc edits |
| `git rebase origin/main` | PASS - no conflicts; rebased audit head before this documentation update was `4c8bba535a2512ac1b27e07477c8e042ecb947e5` |
| `git diff --check` | PASS |
| `git diff origin/main...HEAD --name-only` | PASS - exactly the six established PR #286 files |
| `npm run lint` | PASS - 0 errors, 2 existing Privacy Center hook warnings |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `node --test tests/pos-held-bills.test.mjs tests/catalog-validation.test.mjs tests/karachi-business-day.test.mjs tests/pos-service-checkout.test.mjs tests/customer-settlement-validation.test.mjs tests/dashboard-widget-reorder.test.mjs tests/print-action-touch-targets.test.mjs tests/shared-image-crop-accessible-controls.test.mjs tests/csp-nonce-flow.test.mjs` | PASS - 96/96 tests passed, including 26/26 CSP nonce source-contract checks |
| `PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/auth-role-smoke.spec.ts --project=chromium --workers=1` | PASS - 9/9 tests passed |
| `PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/mobile-native-audit.spec.ts --project=chromium --workers=1` | PASS - 16/16 tests passed in 3.4m; no skips, retries, failures, or timeouts |
| `CSP_TEST_ENV=dev PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/csp-nonce-hydration-verification.spec.ts --project=chromium --workers=1` | PASS - 10/10 dev application tests passed; 1 preview SSO preflight test skipped because `CSP_TEST_ENV=dev` |
| `npx next start -p 3001` + `CSP_TEST_ENV=local-production PLAYWRIGHT_BASE_URL=http://localhost:3001 npx playwright test tests/e2e/csp-nonce-hydration-verification.spec.ts --project=chromium --workers=1` | PASS - 10/10 local-production application tests passed; 1 preview SSO preflight test skipped because `CSP_TEST_ENV=local-production` |
| `curl -sS -o /dev/null -w '%{http_code}' https://saledock.site/` | 200 (production custom domain; availability only, no browser test) |
| `curl -sS -o /dev/null -w '%{http_code}' https://saledock.site/login` | 200 (production custom domain; availability only, no browser test) |
| `curl -sS -o /dev/null -w '%{http_code}' https://saledock-cloud-pos.vercel.app/login` | 200 (public Vercel production alias; availability only, no browser test) |

## Commands Run During Reports Audit Refresh

| Command | Result |
| --- | --- |
| Evidence worktree `git branch --show-current`, `git rev-parse HEAD`, `git status --porcelain=v1 --untracked-files=all`, and SHA-256 checks | PASS - branch remained `qa/reports-print-pdf-verification` at `82db6ecca5f13439cf6bb624556dd921c1dcd5d3`; only the two expected untracked evidence files were present and their hashes were recorded. |
| `git fetch origin --prune` and GitHub PR state checks | PASS - origin/main was `30400475202eeb2bbeb126abe3e5a281efebb95d`; PR #295, PR #286, and PR #294 were closed and merged. |
| `git worktree add /Users/sw12/Projects/saledock-reports-audit-refresh -b qa/reports-audit-refresh origin/main` | PASS - clean documentation worktree created from exact main. |
| `git status --short`, `git diff --check`, `git diff --stat`, and `git diff --name-only` | PASS - only `docs/qa/mobile-native-full-product-audit.md` changed. |
| `npm ci` | PASS - worktree dependencies installed; package and lockfiles remained unchanged. |
| `npm run lint` | PASS - 0 errors and 2 existing Privacy Center hook warnings. |
| `npm run typecheck` | PASS. |
| `npm run build` | PASS - production build completed. |
| `node --test tests/reports-print-full-document-pagination.test.mjs tests/print-action-touch-targets.test.mjs` | PASS - 21/21 source-contract tests passed: Reports pagination 8/8 and print touch targets 13/13. |

No authenticated browser or PDF suite was rerun for this documentation-only refresh. The local five-page Chromium PDF generation and visual inspection are inherited from the reviewed and merged PR #295 evidence. GitHub CI independently passed lint, typecheck, and build for exact reviewed head `95b23ace6281611d4821bc55cb63ce7f8b07e29a`. Vercel reported the Production deployment Ready for merge commit `30400475202eeb2bbeb126abe3e5a281efebb95d`. Previously reported public HTTP 200 checks prove availability only; they were not rerun here and do not certify authenticated Reports or PDF behavior.

## Commands Run During Reports Mobile Audit Refresh

| Command | Result |
| --- | --- |
| Evidence worktree `git status --short`, `git branch --show-current`, `git rev-parse HEAD`, and SHA-256 checks | PASS - branch remained `qa/reports-print-pdf-verification` at `82db6ecca5f13439cf6bb624556dd921c1dcd5d3`; only the two expected untracked evidence files were present and both hashes were unchanged. |
| `git fetch origin --prune` and GitHub PR/branch state checks | PASS - origin/main was `0e85a47561b073236c5297d629927c8684fcc889`; PRs #295, #296, and #297 were merged; no audit-refresh branch or PR already existed. |
| `git worktree add /Users/sw12/Projects/saledock-reports-mobile-audit-refresh -b qa/reports-mobile-audit-refresh origin/main` | PASS - clean documentation worktree created from exact main. |
| `git status --short`, `git diff --check`, `git diff --stat`, and `git diff --name-only` | PASS - only `docs/qa/mobile-native-full-product-audit.md` changed. |
| `npm ci` | PASS - dependencies installed; package and lockfiles remained unchanged. |
| `npm run lint` | PASS - 0 errors and 2 existing Privacy Center hook warnings. |
| `npm run typecheck` | PASS. |
| `npm run build` | PASS - production build completed. |
| `node --test tests/reports-mobile-card-label-wrapping.test.mjs tests/reports-print-full-document-pagination.test.mjs tests/print-action-touch-targets.test.mjs` | PASS - 29/29 source-contract tests passed: mobile labels 8/8, Reports pagination 8/8, and print touch targets 13/13. |
| GitHub check/deployment API reads for PR #297 | PASS - exact reviewed head `e37303e04c2fefaa7b83b5a1b0b9662f4147cad7` had successful CI and Vercel status; Production deployment for merge commit `0e85a47561b073236c5297d629927c8684fcc889` was successful. |

No authenticated browser, screenshot, print-media, or PDF suite was rerun for this documentation-only refresh. That evidence is inherited from the reviewed and merged PR #297. GitHub CI independently covered lint, typecheck, and build; the local browser and five-page PDF results remain reported local evidence rather than CI or production evidence. Previously reported public HTTP 200 checks prove availability only and were not rerun here. No production authentication occurred.

## Commands Run During Returns Print Audit Refresh

| Command | Result |
| --- | --- |
| Seven protected worktree `git status --short`, `git branch --show-current`, `git rev-parse HEAD`, and SHA-256 checks | PASS - all expected branches, HEADs, dirty/untracked scopes, and recorded hashes matched before editing; the merged source worktree remained clean. |
| `git fetch origin --prune`, GitHub PR state checks, merge-scope inspection, and branch/PR-name checks | PASS - origin/main was `09e1df96ccb571872ba0c3f46bd457723bfdae53`; PR #299 was merged with the exact five-file scope; PRs #297 and #298 remained merged; no `qa/returns-print-audit-refresh` branch or PR existed. |
| `git worktree add /Users/sw12/Projects/saledock-returns-print-audit-refresh -b qa/returns-print-audit-refresh origin/main` | PASS - clean documentation worktree created from exact main. |
| `npm ci` | PASS - locked dependencies installed; package and lockfiles remained unchanged. The npm audit summary reported 1 low and 3 moderate dependency advisories; no package remediation was attempted in this documentation-only task. |
| `git status --short`, `git diff --check`, `git diff --stat`, and `git diff --name-only` | PASS - only `docs/qa/mobile-native-full-product-audit.md` changed. |
| `npm run lint` | PASS - 0 errors and 2 existing Privacy Center hook warnings. |
| `npm run typecheck` | PASS. |
| `npm run build` | PASS - production build completed. |
| `node --test tests/returns-thermal-centered-dynamic-page.test.mjs tests/print-action-touch-targets.test.mjs tests/reports-print-full-document-pagination.test.mjs tests/reports-mobile-card-label-wrapping.test.mjs` | PASS - 50/50 source-contract tests passed: Returns lifecycle/geometry 21/21 and existing shared contracts 29/29. |
| GitHub check and deployment API reads for PR #299 and merge commit | PASS - exact reviewed head `76cfd4f7c1fd834fe2a1fbfb72f0732e5406559f` had successful CI and Vercel status. The user reported, and the GitHub run API confirmed, successful main-commit push CI for `09e1df96ccb571872ba0c3f46bd457723bfdae53`; no separate pull-request-triggered run is claimed for the squash SHA. Vercel reported the merge-SHA deployment Ready. |

PR #299 browser, print-media, PDF, visual, lifecycle, cleanup, and fixture-safety evidence is inherited from the reviewed and merged PR. No authenticated browser, Returns PDF, cancellation browser, unmount browser, Reports browser, screenshot, or production-authentication suite was rerun for this documentation-only refresh. GitHub CI independently covered repository checks on the reviewed head; local authenticated tests remain reported local evidence rather than CI or production evidence. Previously reported public HTTP 200 checks prove availability only and were not rerun here. No production authentication occurred.

## Blocked / Not-Tested Areas

Six broader areas remain blocked or not tested:

- Repairs print artifact
- Expenses mobile workflow
- Cash Drawer close/print workflow
- Forms/mobile keyboard
- Loading/success/error states
- Dark mode

Reports and Returns are not included in this blocked/not-tested count. RPT-PRINT-001, RPT-MOBILE-001, RET-PRINT-001, and RET-PRINT-001-LIFECYCLE are fixed on main and verified locally; the six unrelated coverage areas above remain unfinished.

## Known Limitations

- All thirteen tracked findings are dispositioned. The nine original MN findings retain their recorded outcomes: MN-001, MN-002, MN-003, MN-004, MN-005, MN-006, MN-008, and MN-009 were fixed on main or in the audit suite, while MN-007 was verified as development-only with no observed production impact. Supplemental RPT-PRINT-001, RPT-MOBILE-001, RET-PRINT-001, and RET-PRINT-001-LIFECYCLE are fixed on main and verified locally.
- The authenticated owner route/viewport matrix now completes locally in split tests, but production remains read-only and not used for mutation testing.
- Production was not used for mutation testing.
- WebKit and Firefox authenticated routes were not re-run after the fixes; public/auth routes previously passed.
- Browser zoom at 125 percent was not run in this pass.
- Invoice PDF/print artifacts were regenerated and passed. Both Reports presentation findings are fixed locally: PR #295 verified five-page A4 full-document pagination with later and final sections present, and PR #297 verified complete mobile and print StatCard labels while retaining five-page output. No authenticated production Reports login or PDF generation occurred; browser, screenshot, print-media, and PDF inspection remain local reported evidence. Financial formula correctness remains outside this presentation audit.
- Returns A4 and 80mm presentation is fixed and verified locally through PR #299. Standard and longer thermal receipts were centered, unclipped, complete, and single-page; cancellation and unmount behavior also passed. No authenticated production Returns verification or physical thermal-printer hardware test occurred. Financial, refund, stock-restoration, and FIFO correctness remain outside this presentation audit.
- Print/share touch-target browser checks passed for reports, daily closing, and supplier statement. Shared branding/profile crop controls were verified for square and landscape crop shapes without clicking Use crop. Repair, daily-closing, and supplier-statement physical artifacts remain incomplete as previously documented.
- A supplemental JSON timing run of the full mobile audit exposed one intermittent local `/daily-closing` tablet operations timeout after the required line-reporter full audit had already passed. The exact focused group passed on rerun in 41.5s. Treat the broader full-file timing as not perfectly clean, while MN-003 remains closed by the focused touch-target contract and rendered-route evidence.
- Real-device hardware, authenticated WebKit/Firefox, and 125% browser zoom remain untested. Six blocked/not-tested areas remain.
- No product, invoice, cash drawer, return, settlement, or stock mutation was performed in production.
- The `fix/mobile-drawer-close-and-duplicate-dialog` branch was not deleted during this audit; it is safe to delete once Fardan approves.
- The `fix/dashboard-mobile-reorder-controls` branch was merged through PR #289 and can be deleted after Fardan approves.
- The `fix/sidebar-rearrange-accessible-controls` branch was merged through PR #291 and can be deleted after Fardan approves.

## Top Priority Follow-up Work

1. Generate a Repairs print artifact using a safe disposable local fixture.
2. Complete the Expenses mobile workflow.
3. Complete the Cash Drawer close/print workflow using disposable local data and review-first safeguards.
4. Add forms/mobile-keyboard coverage.
5. Add loading, success, and error-state coverage.
6. Run the dark-mode matrix.

Cash Drawer and any business-data mutation remain review-first. Do not start these tasks automatically from this documentation refresh.

## Fardan Live-Site Eyeball Checklist

Production should stay read-only unless a specific QA transaction is approved. This is a human review checklist; automated agents must not log in to production.

1. Open `https://saledock.site` on a real phone and confirm landing/login pages fit without sideways scrolling.
2. Log in and open Dashboard on phone; try rearranging widgets without relying on precise dragging.
3. Open POS on phone; confirm Products/Cart tabs, Held Bills, and checkout controls are not covered by browser bars.
4. Open Products on phone; open Add/Edit Product and image upload; confirm modal does not clip.
5. Open one invoice; tap Print/Download/Share actions; confirm wording matches what happens.
6. Reports has local mobile-label verification at 320x568, 390x844, and 430x932, local desktop sanity at 1440x900, local print-media verification at 390x844, and local five-page A4 evidence. No authenticated production Reports verification occurred; public HTTP checks prove availability only.
7. Returns has local authenticated A4, standard 80mm, longer 80mm, cancellation, and unmount evidence. No authenticated production Returns verification or production thermal PDF exists. Public HTTP checks prove availability only, and financial, refund, stock-restoration, and FIFO behavior was not tested. Continue human-only read-only review of repairs, daily closing, and supplier statement print actions.
8. Test dark mode on phone for POS, Products, Dashboard, Invoices, and Settings.

## Safety Confirmation

- Documentation-only refresh.
- No production login.
- No production mutations.
- No production reset/import/restore/factory reset.
- No secrets, tokens, connection strings, or customer data recorded.
- No app source changes.
- No test changes.
- No migration changes.
- No checkout/payment/stock/FIFO/customer/supplier/report formula or report-query changes.
- No package or lockfile changes.
- No workflow or configuration changes.
- No native browser dialog introduced.
- No merge.

## Risk Position

All thirteen tracked findings have a recorded disposition: twelve are fixed on main or in the audit suite, and MN-007 is verified as development-only in the tested environments. The original nine MN findings remain 9/9 dispositioned. Supplemental RPT-PRINT-001 and RPT-MOBILE-001 remain fixed through PRs #295 and #297. Supplemental RET-PRINT-001 and RET-PRINT-001-LIFECYCLE are fixed through PR #299. Reports mobile labels and full-document A4 pagination remain verified locally. Returns A4 and 80mm presentation, content-derived thermal sizing, cancellation, and unmount behavior are verified locally.

Zero active P0 through P3 tracked findings remain, but six broader blocked/not-tested areas remain: repairs print artifact, expenses mobile workflow, cash drawer close/print workflow, forms/mobile keyboard, loading/success/error states, and dark mode. Real-device hardware, authenticated WebKit/Firefox, 125% zoom, every print surface, authenticated production Reports/Returns, physical thermal-printer hardware, financial and refund correctness, stock/FIFO restoration, and full product certification remain outside the completed evidence. No financial, refund, stock, FIFO, query, authentication, permission, database, or production-data behavior changed through PR #299 or this documentation refresh. The overall recommendation is 13 FINDINGS DISPOSITIONED — 6 BLOCKED/NOT-TESTED AREAS REMAIN, not a blanket pass.
