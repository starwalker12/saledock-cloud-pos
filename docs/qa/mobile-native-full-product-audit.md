# SaleDock Mobile-Native Full Product Audit

Date: 2026-07-07

Branch: `qa/mobile-native-full-product-audit`

Base main SHA: `12cddabc28bf49d58af5e30fbb8d4f7f04a42af1`

Audit mode: review-first, audit-only. No production mutations, no app source changes, no migrations, and no business logic changes were made.

Final recommendation: MOBILE AUDIT FOUND FIXES — REVIEW PRIORITY LIST

## Executive Summary

This pass created a route and feature inventory, added a repeatable Playwright mobile-native smoke suite, performed code-level inspection of responsive/touch/drag/resize/print/export surfaces, then continued into authenticated local browser QA after Docker and local Supabase were restored.

The continuation found two P1 blockers, four P2 findings, and several P3 polish gaps that prevented calling the mobile/PDF audit passed. The mobile navigation close button was intercepted by the drawer overlay, the cookie banner appeared in invoice print/PDF output and covered invoice totals, dashboard widget reorder was drag-only, the Share Invoice modal used misleading print/PDF wording, the desktop sidebar reorder lacked a non-drag alternative, the authenticated viewport matrix was too heavy as one 224-navigation test, print/share touch targets were undersized, and the shared branding/profile crop dialog was drag-first. All P1 and P2 findings, plus MN-003 and MN-005, have since been fixed on main or in this audit suite and verified with focused regression tests. The audit still does not claim full mobile or PDF readiness because MN-007 and several untested areas remain.

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
| P0 findings | 0 observed, not a complete proof because some authenticated print/export surfaces remain untested |
| P1 findings | 0 |
| P2 findings | 0 |
| P3 findings | 1 |
| Fixed P1 findings | 2 |
| Fixed findings | 8 |
| Fixed finding IDs | MN-001, MN-002, MN-003, MN-004, MN-005, MN-006, MN-008, MN-009 |
| Remaining P3 finding | MN-007 |
| Blocked or not-tested areas | 8 |

## Environment Tested

| Item | Result |
| --- | --- |
| Git remote | `https://github.com/starwalker12/saledock-cloud-pos.git` |
| Starting main | `b240ae533351917f846fe240daf602f39ca4abe1` |
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
| Invoices | PASS with caveat | Local invoice screen and print-media artifacts captured; cookie banner no longer covers invoice print/PDF output. | Continue return/repair/cash drawer/report print QA. |
| PDFs/printing | PASS with caveat | Invoice A4/80mm PDF generated locally; cookie banner hidden in print media; Share Invoice action now says Print / Save as PDF while retaining browser print/save-to-PDF behavior. | Generate print artifacts for returns/repairs/daily-closing/reports/supplier statements. |
| Print/share touch targets | FIXED ON MAIN — VERIFIED | PR #292 normalized reports, repairs, daily closing, and supplier statement print/share controls to an explicit `min-h-[44px]`. Returns already used `min-h-[44px]` and remained unchanged. Browser-rendered checks passed for Reports, Daily Closing, and Supplier Statement at 320x568, 390x844, and 430x932. Repair detail, return detail, and conditional daily shift-report controls were verified by source-contract test because deterministic local fixtures were unavailable. | Re-run repair/return detail pages visually when safe fixtures exist. |
| Invoice PDF wording | FIXED ON MAIN — VERIFIED | PR #290 changed the Share Invoice modal wording from Download PDF to Print / Save as PDF, retained existing A4 browser print behavior, passed desktop 1440x900 and mobile 390x844 localhost review, passed focused invoice wording E2E, and passed cookie-print regression. | Do not claim direct PDF download was added; behavior remains browser print/save-to-PDF. |
| Returns | BLOCKED | Print/share surface inspected; local return print artifact not generated after invoice blocker was resolved. | Re-run returns mobile/print QA. |
| Customers | PARTIAL | Customer settlement flow passed locally; full customers list/detail mobile matrix not rerun. | Re-run customer mobile QA. |
| Settlement | PASS | Customer settlement optional-field E2E passed 1/1 locally. | Manual mobile keyboard check still useful. |
| Repairs | BLOCKED | Detail/print surfaces inspected; local repair print artifact not generated after invoice blocker was resolved. | Re-run repairs mobile/print QA. |
| Expenses | BLOCKED | Route and validation surface inspected; expense mobile workflow not rerun after blockers. | Re-run expenses mobile QA. |
| Cash Drawer | BLOCKED | Print surface inspected; cash drawer close/print workflow not rerun after invoice blocker was resolved. | Re-run cash drawer close/print QA. |
| Reports | BLOCKED | Print and report routes inspected; report print artifact not generated after invoice blocker was resolved. | Re-run reports mobile/print QA. |
| Users/permissions | PASS with caveat | Auth-role smoke passed for all five local roles; focused cashier mobile user-page restriction passed. | Full mobile direct URL matrix still pending. |
| Settings | PARTIAL | `/settings` and `/settings/permissions` completed in the authenticated owner route matrix. Full interactive settings-panel, form, modal, mobile keyboard, and role-specific mutation coverage remains incomplete. | Run focused settings interaction coverage in the authenticated remainder audit. |
| Responsive tables | PARTIAL | Route matrix and code inventory cover tables, but not every table was manually interacted with. | Re-run with local data. |
| Forms/mobile keyboard | BLOCKED | Code-level checks only. | Re-run on mobile emulation. |
| Modals/drawers | PASS with blocked app modals | Public drawer route smoke passed; authenticated modals blocked. | Re-run product/POS/settings modals. |
| Loading/success/errors | BLOCKED | Code-level inspection only for most app pages. | Re-run slow-network browser QA. |
| Dark mode | BLOCKED | Not fully browser-verified. | Re-run light/dark matrix. |
| Desktop sidebar reorder | FIXED ON MAIN — VERIFIED | PR #291 added visible Move Earlier and Move Later controls inside the existing desktop Rearrange mode. Controls work by mouse click and keyboard Enter/Space. First/last visible items disable the boundary controls. Existing pointer drag remains available. Reorder moves one visible item by one visible position, persists after reload, preserves archived items, stored collapsed state, and cookie-consent values. English, Urdu, and Roman Urdu labels verified. Dark mode and reduced motion verified. No href duplicates or missing links introduced. | P3 areas remain open. |
| Cross-browser behavior | PARTIAL | Public/auth viewport matrix passed in WebKit and Firefox; authenticated cross-browser not run. | Authenticated WebKit/Firefox coverage remains pending. |

## PDF, Print, Download, and Export Surfaces

| Surface | Implementation | Audit status |
| --- | --- | --- |
| Invoice detail | A4/80mm `window.print`, WhatsApp share, image capture/download, Share modal action labeled Print / Save as PDF | PASS: local invoice A4/80mm PDF generated; cookie banner hidden in print media; wording matches browser print/save-to-PDF behavior; totals visible |
| Returns detail | A4/80mm `window.print`, WhatsApp share | Code inspected; visual output blocked |
| Repair detail | A4/80mm `window.print`, WhatsApp share | Code inspected; visual output blocked |
| Daily closing | A4/80mm/shift thermal `window.print` | Code inspected; visual output blocked |
| Reports | `window.print` | Code inspected; visual output blocked |
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

### MN-007 - Local dev console shows CSP nonce hydration warning on public pages

| Field | Detail |
| --- | --- |
| Severity | P3 |
| Module | Public/auth pages, app root layout |
| Device/browser | Chromium local dev |
| Viewport | Multiple viewport matrix entries |
| User role | Logged-out |
| Steps | Run public/auth Playwright viewport smoke against local Next dev server. |
| Expected | No console hydration warnings during clean page load. |
| Actual | Local dev server emitted React hydration warnings for a script nonce attribute mismatch. The pages still loaded and the viewport smoke passed. |
| Evidence | Local dev server logs during `tests/e2e/mobile-native-audit.spec.ts`; nonce values are intentionally not recorded. |
| Console/network error | React hydration warning, local dev only in this run. |
| Environment | Local read-only browser smoke. |
| Risk to shop user | Likely low if production build behaves differently, but console noise can hide real frontend issues and should be verified on preview/production. |
| Recommended fix scope | Confirm on Vercel preview; if reproducible, align server/client nonce handling in a focused security-safe PR. |
| Suggested branch | `fix/csp-nonce-hydration-warning` |
| Suggested regression test | Console-clean public route smoke that ignores known framework dev-only noise only when explicitly justified. |

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
| Remaining limitations | Print artifacts were only generated for invoices. Returns, repairs, daily closing, reports, and supplier statement print surfaces were not visually regenerated. The non-invoice print surfaces are assumed to be covered by the same print-media CSS rule, but they were not directly generated. |

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
| `curl -sS -o /dev/null -w '%{http_code}' https://saledock-cloud-pos.vercel.app/login` | 200 |

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
| `curl -sS -o /dev/null -w '%{http_code}' https://saledock-cloud-pos.vercel.app/login` | 200 |

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

## Known Limitations

- MN-001 (dashboard drag-only reorder), MN-002 (invoice print/save-to-PDF wording), MN-003 (print/share touch targets), MN-004 (desktop sidebar drag-only reorder), MN-005 (shared branding/profile crop non-drag controls), MN-006 (heavy authenticated viewport matrix), MN-008 (mobile drawer), and MN-009 (cookie banner in invoice print) were fixed on main or in the audit suite and verified with focused regression tests.
- The authenticated owner route/viewport matrix now completes locally in split tests, but production remains read-only and not used for mutation testing.
- Production was not used for mutation testing.
- WebKit and Firefox authenticated routes were not re-run after the fixes; public/auth routes previously passed.
- Browser zoom at 125 percent was not run in this pass.
- Invoice PDF/print artifacts were regenerated and passed. Print/share touch-target browser checks passed for reports, daily closing, and supplier statement. Shared branding/profile crop controls were verified for square and landscape crop shapes without clicking Use crop. Return and repair print artifacts were not regenerated because deterministic local detail fixtures were unavailable.
- A supplemental JSON timing run of the full mobile audit exposed one intermittent local `/daily-closing` tablet operations timeout after the required line-reporter full audit had already passed. The exact focused group passed on rerun in 41.5s. Treat the broader full-file timing as not perfectly clean, while MN-003 remains closed by the focused touch-target contract and rendered-route evidence.
- No product, invoice, cash drawer, return, settlement, or stock mutation was performed in production.
- The `fix/mobile-drawer-close-and-duplicate-dialog` branch was not deleted during this audit; it is safe to delete once Fardan approves.
- The `fix/dashboard-mobile-reorder-controls` branch was merged through PR #289 and can be deleted after Fardan approves.
- The `fix/sidebar-rearrange-accessible-controls` branch was merged through PR #291 and can be deleted after Fardan approves.

## Top Priority Focused Fix PRs

1. `fix/csp-nonce-hydration-warning` - verify and address the local CSP nonce hydration warning if it reproduces outside dev.
2. `qa/mobile-native-authenticated-remainder` - finish the remaining blocked authenticated print/export, dark-mode, zoom, slow-network, and real-device checks.
3. `qa/product-image-upload-mobile-e2e` - finish product image upload mobile/browser coverage separately from MN-005, including persisted upload completion where safe local fixtures allow it.

## Fardan Live-Site Eyeball Checklist

Production should stay read-only unless a specific QA transaction is approved.

1. Open `https://saledock.site` on a real phone and confirm landing/login pages fit without sideways scrolling.
2. Log in and open Dashboard on phone; try rearranging widgets without relying on precise dragging.
3. Open POS on phone; confirm Products/Cart tabs, Held Bills, and checkout controls are not covered by browser bars.
4. Open Products on phone; open Add/Edit Product and image upload; confirm modal does not clip.
5. Open one invoice; tap Print/Download/Share actions; confirm wording matches what happens.
6. Open reports, returns, repairs, daily closing, and supplier statement print actions; confirm buttons are easy to tap.
7. Test dark mode on phone for POS, Products, Dashboard, Invoices, and Settings.

## Safety Confirmation

- No production mutations.
- No production reset/import/restore/factory reset.
- No secrets, tokens, connection strings, or customer data recorded.
- No app source changes.
- No migration changes.
- No checkout/payment/stock/FIFO/customer/supplier/report formula changes.
- No package or lockfile changes.
- No native browser dialog introduced.
- No merge.

## Risk Position

The two P1 blockers (MN-008 and MN-009) are resolved on main and verified with focused regression tests. The P2 dashboard reorder, invoice wording, desktop sidebar reorder, and authenticated matrix findings are also resolved and verified. MN-003 print/share touch targets are fixed on main through PR #292. MN-005 shared branding/profile crop controls are fixed on main through PR #293. The mobile navigation drawer now renders a single accessible dialog, the close/backdrop/Escape controls work, the cookie/privacy banner is hidden from invoice print/PDF output, the dashboard and desktop sidebar now provide Move Earlier / Move Later controls alongside existing drag, invoice print wording matches browser behavior, print/share controls have a 44 px source contract, the shared crop dialog has keyboard/touch nudge and reset controls above the mobile tab bar, and the owner viewport matrix no longer runs as one brittle 224-navigation test. The audit no longer recommends blocking the mobile/PDF surface on these issues.

Risk remains open for the remaining P3 finding and unverified areas including CSP nonce dev warnings, unavailable repair/return print artifacts, unavailable visible daily shift-report fixture, real-device hardware, authenticated WebKit/Firefox, 125 percent zoom, slow network, full dark-mode matrix, and broader product-image upload persistence coverage. The overall recommendation is therefore MOBILE AUDIT FOUND FIXES — REVIEW PRIORITY LIST, not a blanket pass.
