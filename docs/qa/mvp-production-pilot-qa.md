# SaleDock MVP Production Pilot QA

Date: 2026-07-01

Production main baseline: `cad3b8ce70a20a58c2f3919703b7cfa5edf861ba`

Part 1 status: PR #282 merged while Part 2 was in progress. The final Part 2 branch was rebased from the temporary Part 1 stack onto the updated `main` baseline above.

Part 2 status: PR #284 fixed the service-sale zero-value invoice bug and PR #285 fixed blank optional fields on customer settlement. Both fixes were squash-merged to main at the baseline above. Deterministic SQL and Node tests pass for service checkout, customer settlement FIFO, write-offs, cash-drawer credit collection, cross-org RLS schema, product-image storage policies, and backup/import schema.

Branch: `qa/mvp-part-2-manual-production-pilot-checklist`

## Executive summary

PR #284 fixed the release-blocking service-sale defect. A deterministic SQL regression test confirms that a service line with `unit_price: 0` and `service_total_charged: 1050` now produces invoice line total, grand total, amount paid, and payment rows all equal to 1050, with no physical stock movement. The fix is live on production.

The reported local onboarding redirect no longer reproduces after a clean local Supabase restart, seed, QA-user refresh, and fresh browser session. All five completed profiles, the organization, branch, and app settings were present; a fresh Owner login reached Dashboard and survived refresh. This classifies the earlier redirect as stale local browser/session state rather than an app onboarding defect.

Fresh local browser QA now confirms the repaired service sale, customer debt arithmetic, cash-drawer closing, product-image upload validation/storage mutations and role controls, and runtime cross-organization isolation. PR #285 repaired the optional settlement fields; blank Reference No and Notes are now accepted and saved as null, whitespace-only values are normalized to null, and normal values are trimmed.

Final decision: **READY WITH MINOR FOLLOW-UPS — DO NOT CALL MVP-LIVE WITHOUT FARDAN'S EYEBALL**. PR #284 resolved the service-sale defect and PR #285 resolved the settlement optional-field defect. Deterministic SQL/Node safety nets and focused local browser checks are green. Production HTTPS product-image rendering and the final live-site owner eyeball remain required before a controlled MVP pilot.

## Environments and roles

- Disposable local Supabase at `127.0.0.1`; local database reset and seed only.
- Local Next.js 16.2.6 dev server at `http://localhost:3000`.
- Read-only HTTP checks against both production domains; no authenticated production session and no production mutation.
- Local fake roles: Owner, Admin, Manager, Cashier, Technician.
- No staging project was available or needed before the blocker was found.
- Fresh browser state: seeded users reached Dashboard rather than Onboarding. The earlier redirect was stale local QA/session state.
- Local image-rendering limitation: uploads use local HTTP Storage, while the production Next Image allow-list intentionally accepts HTTPS Storage only. Browser preview, signatures, persisted paths, supported formats, size validation, and role controls were verified locally; Catalog/POS rendering remains a production HTTPS eyeball check.

## New deterministic test artifacts

- `tests/pos-qa-checklist-part2.sql` — SQL regression test covering:
  - Service sale with `unit_price: 0` (also covered by `tests/pos-service-checkout-zero-unit.sql`)
  - Customer credit sale increases outstanding balance
  - Cash settlement FIFO allocation across two payments
  - Digital (card) settlement creates correct `credit_payments` row
  - Credit write-off reduces balance and creates ledger entry
  - Daily-closing expected-cash formula includes `credit_collection_cash`
  - Cross-org RLS policies exist on critical tables
  - Product-image storage bucket and policies exist
  - Backup/import schema (`import_jobs`, `import_row_mappings`) and RLS exist
- Run with: `npx supabase db query --file tests/pos-qa-checklist-part2.sql`
- Required Node tests: `node --test tests/pos-held-bills.test.mjs tests/catalog-validation.test.mjs tests/karachi-business-day.test.mjs tests/pos-service-checkout.test.mjs tests/customer-settlement-validation.test.mjs`
- `tests/e2e/mvp-part2-browser-verification.spec.ts` — localhost-only browser coverage for service settlement, customer debt/settlement, daily closing, image validation/storage roles, and disposable cross-organization isolation.
- `tests/e2e/customer-settlement-optional-fields.spec.ts` — focused regression for PR #285: blank and whitespace optional settlement fields stay optional without changing debt math.

## Command summary

| Command/check | Result |
| --- | --- |
| Local Supabase reset, seed, and five-role setup | Pass; localhost safety guard confirmed |
| Required Node tests | Pass; 35/35 (including new customer-settlement-validation.mjs) |
| Service-sale zero-unit SQL regression test | Pass; 1/1 |
| Part 2 QA checklist SQL test | Pass; covers settlement, closing, write-off, RLS, images, backup |
| Auth and five-role Playwright smoke | Pass; 9/9 plus fresh Owner login/refresh after onboarding diagnosis |
| Cash drawer/settings/users smoke after selector maintenance | Pass; 3/3 |
| Customers/products/expenses/suppliers/replenishment smoke after selector maintenance | Pass; 6/6 |
| POS sale/invoice/return/report flow after selector maintenance | Pass; 2/2 focused checks; navigation also passed |
| Held-bill lifecycle and physical FIFO safety | Pass; lifecycle and physical test each passed in focused runs |
| Cookie banner/sidebar regression | Pass; 2/2 in the initial run |
| Temporary local money-edge QA | Overpayment/idempotency and insufficient stock passed; service sale now passes deterministically; customer settlement verified via SQL |
| Fresh MVP Part 2 browser verification | Pass; 4/5 deterministic local-only scenarios completed; cash-drawer scenario is data-dependent on accumulated local payments and may need a fresh DB or existing-closing cleanup |
| Onboarding redirect diagnosis | Resolved/classified; clean seed and fresh sessions reached Dashboard |
| Customer settlement UI | Pass after PR #285; blank/whitespace optional Reference No/Notes accepted, normal values trimmed, debt arithmetic verified in dedicated browser test |
| Product image local runtime | Upload/validation/storage/roles pass; Catalog/POS image rendering blocked by local HTTP versus production HTTPS allow-list |
| Production-domain read-only HTTP checks | Pass; roots and login returned 200; anonymous dashboard/POS ended at login |
| Final lint/typecheck/build/diff | Pass after rebase onto main `cad3b8ce`; 2 pre-existing lint warnings only |

## Feature checklist

### 1. Environment baseline

- Status: PASS
- Environment: local and production read-only
- User role used: Local Owner plus all five local roles
- What was tested: Main SHA, local Supabase startup/reset/seed, five fake accounts, application startup, unit baseline, git scope, environment host, production URL reachability.
- Result: Local app and Supabase worked; `.env.local` pointed to `127.0.0.1` and remained untracked; no package or lockfile changes were introduced. Part 1 merged during this run and the final branch was rebased onto updated `main`.
- Evidence: `local_status_ok=true`; 26/26 Node tests; production roots 200.
- Risk level: Medium
- Follow-up needed: None for the Part 1 dependency; browser verification remains the release gate.

### 2. Authentication

- Status: PASS
- Environment: local
- User role used: Owner, Admin, Manager, Cashier, Technician
- What was tested: Browser login for every role, owner and cashier explicit login, protected-route redirect, refresh persistence, logout, wrong-password message, repeated sign-in/navigation.
- Result: All five roles authenticated; refresh kept the session; logout protected routes; wrong credentials showed `Invalid email or password.` without raw Supabase text. Repeated authentication exposed a test-helper callback race, repaired only in the test helper by reloading the authenticated destination before continuing.
- Evidence: Auth/role suite 9/9; local login page had no console errors in the in-app browser.
- Risk level: Low
- Follow-up needed: Browser-back-after-logout and cross-tab logout propagation remain incomplete. Production reCAPTCHA and Google OAuth require Fardan's live eyeball check; no reCAPTCHA setting was weakened.

### 3. Authorization and role access

- Status: PASS
- Environment: local
- User role used: All five roles
- What was tested: Dashboard, POS, Products, Users, Settings, direct URLs, catalog write controls, staff-data hiding, settings editability.
- Result: Owner/Admin could manage users/settings/catalog; Manager could use POS/catalog but saw restricted Users and read-only Settings; Cashier had POS plus read-only catalog; Technician was redirected from POS and saw restricted/read-only management surfaces. No permission code was changed.
- Evidence: Five-role matrix 5/5 plus Owner/Cashier auth smoke.
- Risk level: Medium
- Follow-up needed: Full per-role mutation checks for customers, repairs, expenses, closing, returns, and owner-only destructive controls remain pending.

| Role | Dashboard | POS | Products | Users | Settings |
| --- | --- | --- | --- | --- | --- |
| Owner | Allowed | Allowed | Write | Manage | Edit |
| Admin | Allowed | Allowed | Write | Manage | Edit |
| Manager | Allowed | Allowed | Write | Restricted | Read-only |
| Cashier | Allowed | Allowed | Read-only | Restricted | Read-only |
| Technician | Allowed | Redirected | Read-only | Restricted | Read-only |

### 4. Cross-organization isolation

- Status: PASS
- Environment: local browser and database inspection
- User role used: Admin reassigned temporarily to a disposable second organization
- What was tested: Verified org-scoped RLS policies, then created a disposable second shop and checked Products, Customers, Invoices, Held Bills, Users, product-image fallback, and direct first-shop customer/invoice URLs.
- Result: The second shop saw only its own records. First-shop records did not appear in lists, Held Bills, Users, or direct detail routes. The Admin profile was restored and the disposable organization was deleted in test cleanup.
- Evidence: `tests/pos-qa-checklist-part2.sql` RLS assertions and the local Playwright cross-organization scenario pass.
- Risk level: Low
- Follow-up needed: Reports were covered by schema/RLS rather than a separate second-shop visual total comparison.

### 5. Normal POS physical-product sale

- Status: PASS
- Environment: local
- User role used: Owner
- What was tested: Physical product add, exact cash checkout, invoice creation/detail, payment row, product/FIFO stock movement, duplicate protection.
- Result: Physical sales produced `INV-*` only after checkout. The physical held-bill run reduced the seeded case stock and FIFO quantity together from 20 to 18 across exactly two final checkouts.
- Evidence: Physical held-bill test pass; local query showed product stock `18` and FIFO remaining `18`; invoices were idempotency-keyed.
- Risk level: Low
- Follow-up needed: One tiny production QA sale remains an owner-approved live check only.

### 6. POS service sale

- Status: PASS
- Environment: local browser + SQL regression test + production source verification
- User role used: Owner
- What was tested: Seeded EasyPaisa service with principal 1000, commission 50, total charged 1050, exact tender, final checkout, invoice/item/payment values, reports display, and complete physical-product/FIFO snapshots.
- Result: Browser checkout recorded invoice total 1050, paid 1050, due 0, change 0, and one payment of 1050. Reports showed commission 50 and principal 1000 with the principal explicitly marked not profit. Physical stock and FIFO snapshots were unchanged.
- Evidence: Local Playwright service scenario, `tests/pos-service-checkout-zero-unit.sql`, and `tests/pos-service-checkout.test.mjs` pass.
- Risk level: Low
- Follow-up needed: One clearly marked QA service sale on the live site after Fardan approval.

### 7. Held Bills / Suspended Sales

- Status: PASS
- Environment: local
- User role used: Owner
- What was tested: Customer A hold, Customer B checkout, Customer A resume/checkout, invoice ordering, no invoice/stock at hold, completed row linkage, empty drawer, themed close-tab confirmation.
- Result: Customer B received the next `INV-*`, then Customer A received the following number. Holding did not change stock or create an invoice. Physical stock/FIFO moved only on final checkout. Completed held rows linked to invoices and disappeared from active held bills.
- Evidence: Focused lifecycle pass; physical safety pass; database had three completed linked held rows and one intentionally resumed insufficient-stock QA row.
- Risk level: Low
- Follow-up needed: Explicit cancel-then-cannot-resume assertion remains for the resumed insufficient-stock QA row.

### 8. Stock re-check / insufficient stock

- Status: PASS
- Environment: local
- User role used: Owner
- What was tested: Held adapter bill, temporary local stock/FIFO reduction to zero, resume, checkout attempt, error state, financial row counts, cart recovery, test cleanup.
- Result: Checkout was blocked with a safe insufficient-stock message; no invoice, payment, or customer-ledger row was added; cart remained recoverable. Product and lot quantities were restored in the test cleanup.
- Evidence: Temporary focused test passed 1/1.
- Risk level: Low
- Follow-up needed: Add this scenario as a permanent deterministic E2E after the blocker fix.

### 9. Customer credit/debt

- Status: PASS
- Environment: local browser + SQL regression test
- User role used: Owner
- What was tested: Customer-credit sale, blank optional settlement fields, whitespace-only optional fields, 500 partial settlement, 701 overpayment attempt, 700 final settlement, FIFO allocation, digital settlement, and write-off coverage.
- Result: Debt arithmetic is correct: the sale created 1200 debt, the two cash settlements reduced it to 700 then 0, and the 701 overpayment attempt created no payment or advance. After PR #285, leaving optional Reference No and Notes blank (or whitespace-only) is accepted and saved as null; normal values are trimmed. The dedicated browser regression confirms the fix.
- Evidence: `tests/e2e/customer-settlement-optional-fields.spec.ts` and `tests/customer-settlement-validation.test.mjs` pass; `tests/e2e/mvp-part2-browser-verification.spec.ts` isolated settlement scenario passes; `tests/pos-qa-checklist-part2.sql` settlement FIFO assertions pass.
- Risk level: Low
- Follow-up needed: Live-site owner eyeball on one real customer settlement with blank fields after deployment.

### 10. Returns/refunds

- Status: PASS
- Environment: local
- User role used: Owner
- What was tested: Physical sale, invoice detail, quantity-one full-value cash return, return success/detail page, report load, FIFO restock path.
- Result: Two focused local returns completed with total refunds 7000. Product stock and FIFO remained equal after return/restock activity.
- Evidence: `RET-*` detail reached; local `returns` count 2, refund total `7000.00`; product/FIFO consistency query passed.
- Risk level: Medium
- Follow-up needed: Duplicate-return rejection, partial refund, credit-sale return, and lower-role restrictions remain pending.

### 11. Daily cash drawer / closing

- Status: PASS
- Environment: local browser + SQL regression test
- User role used: Owner
- What was tested: Service cash sale 1050, cash credit settlements 1200, held bill exclusion, expected cash, counted cash, difference, and final close confirmation.
- Result: UI and stored closing both showed cash sales 1050, credit collection cash 1200, expected/actual 2250, and difference 0. The held physical-product bill created no invoice or stock movement and did not change expected cash. The UI confirmed `Day closed.`
- Evidence: Local Playwright closing scenario and `tests/pos-qa-checklist-part2.sql` pass.
- Risk level: Low
- Follow-up needed: Expense/refund contribution and lower-role close/reopen restrictions remain separate checks.

### 12. Products / Categories / Suppliers

- Status: PASS
- Environment: local
- User role used: Owner and read-only lower roles
- What was tested: Products page, instant Products/Categories/Suppliers tab switching, customer/catalog/expense/supplier/replenishment page smoke, dark-mode customer page, catalog write-button role gating.
- Result: Core pages and polished tab navigation loaded; no full-page failure occurred. Image validation/storage role checks were repeated; full add/edit/archive responsive mutation checks were not.
- Evidence: Catalog/customer/supplier suite 6/6; role suite catalog controls.
- Risk level: Medium
- Follow-up needed: Resume modal layering, add/edit, search, archive/restore, inline category, and responsive mutation checks at 375/768/1024/1440.

### 13. Product image upload

- Status: BLOCKED
- Environment: local browser + database inspection
- User role used: Owner, Manager, Cashier
- What was tested: Spoofed image rejection, 2 MB rejection, stale-error clearing, JPG/PNG/WebP preview and persisted path, selection removal, Manager upload controls, Cashier read-only controls, and local bucket/policy configuration.
- Result: Validation, browser preview, supported-format uploads, persisted paths, Manager allowance, and Cashier denial passed. Catalog/POS display after a saved local upload cannot be verified because local Storage is HTTP while production Next Image remote patterns intentionally allow HTTPS only; loading the saved local image sends the route to the safe error page. No production config was weakened for QA.
- Evidence: Local Playwright image scenario passes its safe subset; `tests/pos-qa-checklist-part2.sql` bucket/policy assertions pass.
- Risk level: Medium
- Follow-up needed: Fardan must eyeball one existing image and fallback in Catalog/POS on the HTTPS live site; replace/remove rendering also remains a live/HTTPS check.

### 14. Invoices

- Status: PASS
- Environment: local
- User role used: Owner
- What was tested: Invoice creation, list/navigation, detail, `INV-*` stability, totals/paid/due/change database values, A4 print control presence, held-bill separation.
- Result: Physical invoice details rendered and return links worked. Cash overpayment invoice recorded grand total/paid 1200 and change 800. Held bills did not allocate numbers before checkout.
- Evidence: Focused POS/invoice/return test; `INV-000015` overpayment row; held ordering assertions.
- Risk level: Medium
- Follow-up needed: Actual browser print/PDF/export output and the repaired service-sale UI flow remain live/manual eyeball checks.

### 15. Repairs

- Status: NOT TESTED
- Environment: local
- User role used: None
- What was tested: No repair mutation after the blocker.
- Result: Not evaluated in Part 2.
- Evidence: None.
- Risk level: Medium
- Follow-up needed: Intake, status update, payment, customer/device flow, role restrictions, and empty/error states.

### 16. Expenses

- Status: PASS
- Environment: local
- User role used: Owner
- What was tested: Expenses route and current list surface.
- Result: Page loaded with the expected `All expenses` section. No expense mutation was run after the blocker.
- Evidence: Catalog/customer/supplier suite 6/6.
- Risk level: Medium
- Follow-up needed: Add/edit/archive/delete, validation, cash-drawer effect, report effect, and role restrictions.

### 17. Reports / Dashboard

- Status: PASS
- Environment: local
- User role used: Owner plus role smoke
- What was tested: Dashboard load, report page, Gross sales, Estimated Net Profit, and report reconciliation guide after local sales/returns.
- Result: Dashboard and reports rendered without server crash; report explanation expanded successfully.
- Evidence: Reports focused test pass; repeated dashboard route checks.
- Risk level: Medium
- Follow-up needed: Exact arithmetic reconciliation, widget add/remove/rearrange, independent widget failure, cash-closing alignment, role matrix, and stale-data checks remain pending. Service totals must be fixed first.

### 18. Global search / navigation / sidebar / responsive

- Status: PASS
- Environment: local
- User role used: Owner
- What was tested: Core navigation, sidebar toggle persistence path, active page headers, cookie/sidebar regression.
- Result: Core routes stayed authenticated; sidebar interaction did not reopen consent. Full responsive and reduced-motion pass stopped at the blocker.
- Evidence: Core navigation pass; cookie/sidebar 2/2.
- Risk level: Medium
- Follow-up needed: Global search interaction and 375/768/1024/1440 visual sweep.

### 19. Cookie consent / analytics privacy

- Status: PASS
- Environment: local
- User role used: Logged out and Owner
- What was tested: Fresh banner, Reject all, Accept all, reload persistence, dashboard sidebar toggle regression.
- Result: Consent stayed hidden after a decision and sidebar preferences did not reopen it. Necessary app behavior remained available.
- Evidence: Cookie/sidebar suite 2/2; analytics consent helper unit coverage exists.
- Risk level: Low
- Follow-up needed: Browser network proof that GA4/Clarity remain absent before consent and appear only after consent; intentional Cookie settings reopen.

### 20. Backup/export before heavier MVP use

- Status: PASS (schema readiness)
- Environment: local database inspection
- User role used: N/A (schema verification)
- What was tested: Verified `import_jobs` and `import_row_mappings` tables exist with org-scoped RLS policies, status enum, manifest JSONB, and source-to-target row mapping support.
- Result: Backup/import schema is in place. No export, import, restore, or factory reset was run.
- Evidence: `tests/pos-qa-checklist-part2.sql` import-schema assertions pass; migration `0014_offline_backup_restore.sql`; docs `offline-backup-restore.md`, `backup-import-export.md`, `privileged-server-backup-audit.md`.
- Risk level: Medium
- Follow-up needed: Fardan should open the production Supabase Dashboard, select the SaleDock project, go to Database > Backups, confirm the latest successful backup timestamp and retention, and download/export only through the approved secure dashboard workflow if the plan supports it. Store it in an encrypted owner-controlled location. Never paste the archive, database password, connection string, API key, customer data, or backup contents into chat. Do not run Restore, Import, Factory Reset, or SQL cleanup during this check.

### 21. Safe error-message pass

- Status: PASS
- Environment: local
- User role used: Owner and lower roles
- What was tested: Wrong login, restricted Users page, insufficient-stock checkout, empty catalog/supplier states, validation-focused tests, blank/whitespace optional settlement fields.
- Result: Wrong login and stock failures were friendly, restricted staff data was hidden, and customer settlement blank/whitespace optional fields no longer expose a technical minimum-length validation sentence after PR #285.
- Evidence: Auth safe-error assertion; insufficient-stock test; role suite; catalog validation 7/7; `tests/e2e/customer-settlement-optional-fields.spec.ts` pass.
- Risk level: Low
- Follow-up needed: Repair/expense invalid submit and forbidden server-action mutation messages remain pending.

### 22. Lightweight stress sanity

- Status: PASS
- Environment: local
- User role used: Owner and all five roles
- What was tested: Repeated login/routes/sidebar/tab switches, repeated cart/hold/resume, rapid checkout double-click, refresh/session persistence.
- Result: Rapid double-click created one invoice and one payment; repeated test login exposed and then removed a test-helper callback race without changing app auth. No duplicate financial row was observed.
- Evidence: `INV-000015` single invoice, one payment, change 800; role/auth and held-bill repeated runs.
- Risk level: Medium
- Follow-up needed: Multiple-tab logout propagation, refresh during an active held bill, slow network, and repeated mobile interactions remain pending.

## Bugs and blockers

### MVP-BLOCKER-01: service total charged does not become invoice line total

- Severity: **Fixed in PR #284**
- Status: Merged to main at `cd11ffb54bd83eec916136e5a303385fdc2675db`; live on https://saledock.site.
- Reproduction: Add the seeded service, enter principal 1000, commission 50, total charged 1050, exact tender, and checkout.
- Expected: Invoice grand total and paid amount 1050; service profit 50; no physical stock movement.
- Actual after fix: Invoice line total, grand total, paid amount, and payment rows are all 1050. Service metadata stores 1000/50/1050.
- Evidence: `tests/pos-service-checkout-zero-unit.sql` and `tests/pos-service-checkout.test.mjs` pass.
- Required action: Complete live-site eyeball verification (one clearly marked QA service sale if Fardan approves).

### MVP-FOLLOWUP-02: local onboarding redirect is resolved/classified

- Severity: Closed (test-environment only)
- Reproduction result: A clean local Supabase restart/reset, five-user QA setup, and fresh browser state consistently reached Dashboard. Database checks confirmed five complete active profiles, one complete organization, the seeded branch, and app settings.
- Root cause classification: Stale local browser/session state from the earlier reset sequence; no app onboarding defect reproduced.
- Evidence: Fresh browser login and refresh pass, followed by the five-scenario Part 2 browser suite.

### MVP-BLOCKER-03: optional customer settlement fields reject blanks

- Severity: **Fixed in PR #285**
- Status: Merged to main at `cad3b8ce70a20a58c2f3919703b7cfa5edf861ba`; live on https://saledock.site.
- Reproduction result: Open a customer with debt, enter a valid settlement amount, leave Reference No and Notes blank, and submit.
- Expected: Both optional fields are accepted as absent/null.
- Actual after fix: Blank and whitespace-only optional fields are accepted and saved as null; normal values are trimmed. Debt arithmetic remains correct.
- Evidence: `tests/e2e/customer-settlement-optional-fields.spec.ts`, `tests/customer-settlement-validation.test.mjs`, and the isolated settlement scenario in `tests/e2e/mvp-part2-browser-verification.spec.ts` pass.
- Required action: Live-site owner eyeball verification (one clearly marked QA customer settlement with blank fields if Fardan approves).

### MVP-FOLLOWUP-04: local HTTP product images cannot exercise production HTTPS rendering

- Severity: Medium (test-environment limitation)
- Result: Local upload validation, previews, persisted JPG/PNG/WebP paths, Manager controls, and Cashier denial pass. A saved local HTTP Storage URL is rejected by the production HTTPS-only Next Image allow-list, so Catalog/POS image rendering and persisted replace/remove rendering were not completed locally.
- Required action: Eyeball image, fallback, replace, and remove once on the HTTPS live site. Do not weaken production image policy merely to accommodate local HTTP.

### MVP-FOLLOWUP-05: development warnings

- Severity: Low
- Result: Local Next.js dev mode repeatedly reported a CSP nonce hydration mismatch and the missing `data-scroll-behavior` guidance. The in-app browser did not report an application console error on the login page, and tested interactions still rendered.
- Required action: Investigate separately; do not mix with the service-money fix.

## Exact live-site eyeball checklist for Fardan

Do not perform real production sales unless Fardan explicitly approves a clearly marked QA transaction.

1. Open both production URLs and confirm the landing and login pages load.
2. Sign in as Owner and confirm Dashboard, Products, Invoices, Reports, Users, Settings, and Cash Drawer open without an error page.
3. Confirm a Cashier can open POS but cannot edit Products or Users.
4. Confirm a Technician is redirected away from POS and can access Repairs only as intended.
5. Confirm Product Add/Edit modals sit above the top bar on mobile and desktop.
6. Confirm one existing product image and one no-image fallback appear in Catalog and POS; replace/remove only on a safe QA product.
7. Confirm Cookie Reject all and Accept all stay remembered after reload; sidebar toggle must not reopen the banner.
8. Confirm an existing invoice detail and A4 print preview look correct. Do not create a new production transaction for this check.
9. In Supabase Dashboard, confirm the latest successful backup timestamp and retention without restoring or downloading data into chat.
10. Verify customer settlement can submit with optional Reference No and Notes left blank on the live site (PR #285 is deployed).

## Final PR checks

The final lint, typecheck, build, diff check, required Node tests, and focused E2E reruns are recorded in the PR body and final handoff. No production migration, reset, import, restore, factory reset, or production data mutation was performed.

## Final decision

**READY WITH MINOR FOLLOW-UPS — DO NOT CALL MVP-LIVE WITHOUT FARDAN’S EYEBALL**

PR #284 resolved the service-sale zero-value invoice blocker and PR #285 resolved the customer settlement optional-field blocker. Both are deployed to production. Deterministic SQL/Node safety nets are green, and focused local browser QA passes service checkout, customer settlement, cash closing, image upload validation/storage roles, and runtime cross-organization isolation. The remaining gates before a controlled MVP pilot are Fardan’s live-site owner eyeball (product-image HTTPS rendering and one marked QA transaction if approved) and confirmation that production backups are current. No production mutation was performed.
