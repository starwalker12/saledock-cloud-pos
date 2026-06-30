# SaleDock MVP Production Pilot QA

Date: 2026-06-30

Production main baseline: `d701574b71142fa9607fcb2e7f3eba0d279af362`

Part 1 status: PR #282 merged while Part 2 was in progress. The final Part 2 branch was rebased from the temporary Part 1 stack onto the updated `main` baseline above.

Branch: `qa/mvp-part-2-manual-production-pilot-checklist`

## Executive summary

The local safety baseline, role accounts, physical checkout, FIFO stock movement, held-bill ordering, return/refund flow, idempotent double-click protection, cash overpayment/change, insufficient-stock rejection, key read-only pages, and cookie/sidebar regression checks passed against disposable local Supabase.

Part 2 found a release-blocking service-sale defect. A service line stored principal `1000`, commission `50`, and service total charged `1050`, but final checkout created paid invoice `INV-000016` with grand total and paid amount `0.00`. The physical stock rows did not move, which is correct, but the service invoice/revenue amount is wrong. Further business mutations stopped after this finding.

Final decision: **BLOCKED - DO NOT CALL MVP-LIVE** until service line total handling is fixed and this checklist is resumed.

## Environments and roles

- Disposable local Supabase at `127.0.0.1`; local database reset and seed only.
- Local Next.js 16.2.6 dev server at `http://localhost:3000`.
- Read-only HTTP checks against both production domains; no authenticated production session and no production mutation.
- Local fake roles: Owner, Admin, Manager, Cashier, Technician.
- No staging project was available or needed before the blocker was found.

## Command summary

| Command/check | Result |
| --- | --- |
| Local Supabase reset, seed, and five-role setup | Pass; localhost safety guard confirmed |
| Required Node tests | Pass; 26/26 |
| Auth and five-role Playwright smoke | Pass; 9/9 in the final localhost rerun |
| Cash drawer/settings/users smoke after selector maintenance | Pass; 3/3 |
| Customers/products/expenses/suppliers/replenishment smoke after selector maintenance | Pass; 6/6 |
| POS sale/invoice/return/report flow after selector maintenance | Pass; 2/2 focused checks; navigation also passed |
| Held-bill lifecycle and physical FIFO safety | Pass; lifecycle and physical test each passed in focused runs |
| Cookie banner/sidebar regression | Pass; 2/2 in the initial run |
| Temporary local money-edge QA | Overpayment/idempotency and insufficient stock passed; service sale failed; customer settlement remained unverified |
| Production-domain read-only HTTP checks | Pass; both roots and login returned 200; anonymous dashboard/POS ended at login |
| Final lint/typecheck/build/diff | Recorded after report completion in the PR checks section below |

## Feature checklist

### 1. Environment baseline

- Status: PASS
- Environment: local and production read-only
- User role used: Local Owner plus all five local roles
- What was tested: Main SHA, local Supabase startup/reset/seed, five fake accounts, application startup, unit baseline, git scope, environment host, production URL reachability.
- Result: Local app and Supabase worked; `.env.local` pointed to `127.0.0.1` and remained untracked; no package or lockfile changes were introduced. Part 1 merged during this run and the final branch was rebased onto updated `main`.
- Evidence: `local_status_ok=true`; 26/26 Node tests; production roots 200.
- Risk level: Medium
- Follow-up needed: None for the Part 1 dependency; the service-sale blocker below remains the release gate.

### 2. Authentication

- Status: PASS
- Environment: local
- User role used: Owner, Admin, Manager, Cashier, Technician
- What was tested: Browser login for every role, owner and cashier explicit login, protected-route redirect, refresh persistence, logout, wrong-password message, repeated sign-in/navigation.
- Result: All five roles authenticated; refresh kept the session; logout protected routes; wrong credentials showed `Invalid email or password.` without raw Supabase text. Repeated authentication exposed a test-helper callback race, repaired only in the test helper by reloading the authenticated destination before continuing.
- Evidence: Auth/role suite 9/9; local login page had no console errors in the in-app browser.
- Risk level: Low
- Follow-up needed: Browser-back-after-logout and cross-tab logout propagation were not completed after the blocker. Production reCAPTCHA and Google OAuth require Fardan's live eyeball check; no reCAPTCHA setting was weakened.

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

- Status: NOT TESTED
- Environment: local
- User role used: None
- What was tested: Part 1 source/RLS posture only; no second organization fixture was created in Part 2.
- Result: No browser cross-tenant assertion was completed before the service blocker.
- Evidence: Part 1 report lists this as deferred.
- Risk level: High
- Follow-up needed: Add a disposable second organization/user and verify products, customers, invoices, held bills, reports, and users never expose the first organization.

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

- Status: FAIL
- Environment: local
- User role used: Owner
- What was tested: Seeded EasyPaisa service with principal 1000, commission 50, total charged 1050, exact tender, final checkout, invoice and item database values.
- Result: Service metadata was stored correctly, but invoice `INV-000016` had unit price, line total, grand total, and paid amount `0.00`. The likely mismatch is that service editing updates service metadata while cart/invoice total continues using the service product's zero `unit_price`.
- Evidence: `invoice_items.service_transaction_amount=1000.00`, `service_commission=50.00`, `service_total_charged=1050.00`, but `line_total=0.00`; invoice `grand_total=0.00`.
- Risk level: Critical
- Follow-up needed: Fix service line pricing in a separate review-first money-logic PR, add deterministic tests, reset local QA, and resume Part 2 from this section. Do not pilot service sales meanwhile.

### 7. Held Bills / Suspended Sales

- Status: PASS
- Environment: local
- User role used: Owner
- What was tested: Customer A hold, Customer B checkout, Customer A resume/checkout, invoice ordering, no invoice/stock at hold, completed row linkage, empty drawer, themed close-tab confirmation.
- Result: Customer B received the next `INV-*`, then Customer A received the following number. Holding did not change stock or create an invoice. Physical stock/FIFO moved only on final checkout. Completed held rows linked to invoices and disappeared from active held bills.
- Evidence: Focused lifecycle pass; physical safety pass; database had three completed linked held rows and one intentionally resumed insufficient-stock QA row.
- Risk level: Low
- Follow-up needed: Explicit cancel-then-cannot-resume assertion remains for the resumed insufficient-stock QA row after the service blocker is fixed.

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

- Status: BLOCKED
- Environment: local
- User role used: Owner
- What was tested: Two customer-credit physical sales and one attempted 500 settlement.
- Result: Each credit invoice correctly recorded grand total/balance due 1200 and paid 0; customer debt and debit ledger moved 0 -> 1200 -> 2400. The settlement attempt did not produce a success state or payment row before timeout, so debt reduction was not verified.
- Evidence: `INV-000014` and `INV-000017`; customer balance `2400.00`; two debit ledger rows; zero `credit_payments` rows.
- Risk level: High
- Follow-up needed: Run a dedicated settlement test after the service blocker; determine whether this was a local action/test timing issue or a second product defect. Overpayment was separately verified as change, not credit.

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

- Status: NOT TESTED
- Environment: local
- User role used: Owner
- What was tested: Cash Drawer page render only.
- Result: Cash Drawer/Daily Closing surface loaded, but no shift close/reopen or arithmetic mutation was run after the blocker.
- Evidence: Cash drawer/settings suite 3/3; page heading verified.
- Risk level: High
- Follow-up needed: Reconcile cash sales, change, refunds, expense, expected cash, counted cash, variance, role gates, and reports on a fresh local reset.

### 12. Products / Categories / Suppliers

- Status: PASS
- Environment: local
- User role used: Owner and read-only lower roles
- What was tested: Products page, instant Products/Categories/Suppliers tab switching, customer/catalog/expense/supplier/replenishment page smoke, dark-mode customer page, catalog write-button role gating.
- Result: Core pages and polished tab navigation loaded; no full-page failure occurred. Add/edit/archive/image mutations were not repeated after the service blocker.
- Evidence: Catalog/customer/supplier suite 6/6; role suite catalog controls.
- Risk level: Medium
- Follow-up needed: Resume modal layering, add/edit, search, archive/restore, inline category, and responsive mutation checks at 375/768/1024/1440.

### 13. Product image upload

- Status: NOT TESTED
- Environment: local
- User role used: None in Part 2
- What was tested: Existing image code/build only; no new file upload in this run.
- Result: Prior product-image rollout evidence was not treated as a substitute for Part 2 browser evidence.
- Evidence: No Part 2 screenshot or upload artifact.
- Risk level: Medium
- Follow-up needed: Repeat valid JPG/PNG/WebP, spoofed/oversized rejection, preview, POS image, replace/remove, Manager allowance, Cashier denial, and cross-org policy checks locally.

### 14. Invoices

- Status: PASS
- Environment: local
- User role used: Owner
- What was tested: Invoice creation, list/navigation, detail, `INV-*` stability, totals/paid/due/change database values, A4 print control presence, held-bill separation.
- Result: Physical invoice details rendered and return links worked. Cash overpayment invoice recorded grand total/paid 1200 and change 800. Held bills did not allocate numbers before checkout.
- Evidence: Focused POS/invoice/return test; `INV-000015` overpayment row; held ordering assertions.
- Risk level: Medium
- Follow-up needed: Actual browser print/PDF/export output remains a live/manual eyeball check. Service invoices are blocked by section 6.

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

- Status: BLOCKED
- Environment: production documentation only
- User role used: None
- What was tested: No export, import, restore, or factory reset was run.
- Result: Safe production backup access was not used. No backup contents were downloaded, printed, or committed.
- Evidence: Git/process safety scan; no backup artifact in the workspace.
- Risk level: High
- Follow-up needed: Fardan should open the production Supabase Dashboard, select the SaleDock project, go to Database > Backups, confirm the latest successful backup timestamp and retention, and download/export only through the approved secure dashboard workflow if the plan supports it. Store it in an encrypted owner-controlled location. Never paste the archive, database password, connection string, API key, customer data, or backup contents into chat. Do not run Restore, Import, Factory Reset, or SQL cleanup during this check.

### 21. Safe error-message pass

- Status: PASS
- Environment: local
- User role used: Owner and lower roles
- What was tested: Wrong login, restricted Users page, insufficient-stock checkout, empty catalog/supplier states, validation-focused tests.
- Result: Wrong login and stock failures were friendly; restricted staff data was hidden; no raw Supabase/SQLSTATE/stack text appeared in tested UI states.
- Evidence: Auth safe-error assertion; insufficient-stock test; role suite; catalog validation 7/7.
- Risk level: Medium
- Follow-up needed: Failed image upload, repair/expense invalid submit, and forbidden server-action mutation messages remain pending.

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

- Severity: Critical
- Reproduction: Add the seeded service, enter principal 1000, commission 50, total charged 1050, exact tender, and checkout.
- Expected: Invoice grand total and paid amount 1050; service profit 50; no physical stock movement.
- Actual: Service metadata stores 1000/50/1050, but unit price, line total, invoice grand total, and paid amount are 0.
- Impact: Service invoices, revenue, payment, cash drawer, and reports can understate a completed service sale.
- Required action: Separate review-first business-logic fix plus database/browser tests. No fix was made in this QA branch.

### MVP-FOLLOWUP-02: customer settlement was not verified

- Severity: High until isolated
- Reproduction result: Customer-credit invoices and debt ledger were correct, but the attempted 500 settlement did not create a payment row before the local browser test timed out.
- Required action: Re-run as a focused test after the service blocker is fixed and determine whether this is test timing or a customer-settlement defect.

### MVP-FOLLOWUP-03: development warnings

- Severity: Low
- Result: Local Next.js dev mode repeatedly reported a CSP nonce hydration mismatch and the missing `data-scroll-behavior` guidance. The in-app browser did not report an application console error on the login page, and tested interactions still rendered.
- Required action: Investigate separately; do not mix with the service-money fix.

## Exact live-site eyeball checklist for Fardan

Do not perform real sales until the service-total blocker is fixed.

1. Open both production URLs and confirm the landing and login pages load.
2. Sign in as Owner and confirm Dashboard, Products, Invoices, Reports, Users, Settings, and Cash Drawer open without an error page.
3. Confirm a Cashier can open POS but cannot edit Products or Users.
4. Confirm a Technician is redirected away from POS and can access Repairs only as intended.
5. Confirm Product Add/Edit modals sit above the top bar on mobile and desktop.
6. Confirm one existing product image and one no-image fallback appear in Catalog and POS.
7. Confirm Cookie Reject all and Accept all stay remembered after reload; sidebar toggle must not reopen the banner.
8. Confirm an existing invoice detail and A4 print preview look correct. Do not create a new production transaction for this check.
9. In Supabase Dashboard, confirm the latest successful backup timestamp and retention without restoring or downloading data into chat.
10. After the service fix is reviewed and deployed, use one clearly marked QA service sale to verify total charged, paid, commission/profit, invoice, cash drawer, and reports all agree.

## Final PR checks

The final lint, typecheck, build, diff check, required Node tests, and focused E2E reruns are recorded in the PR body and final handoff. No production migration, reset, import, restore, factory reset, or production data mutation was performed.

## Final decision

**BLOCKED - DO NOT CALL MVP-LIVE**

The physical-product and held-bill safety work is in good shape, but service checkout can currently produce a zero-value invoice despite a non-zero total charged. That is a money/reporting blocker for a retail-and-services pilot.
