# Current Production State

## Production Configuration
* **Current production main SHA:** `9f2224f9fd30a993f73f5865b35a4e6fff524c15` (after PR #240)
* **In-progress (review-first, NOT merged):** branch `fix/staff-invite-rules-permissions-cache` — staff invite messages/rules, permission audit, safe invite rate-limit.
* **Live URLs:**
  * https://saledock.site
  * https://saledock-cloud-pos.vercel.app
* **Hosting:** Vercel (main auto-deploys to production)
* **Database & Auth:** Supabase
* **Currency/Timezone:** PKR / Asia-Karachi

## Latest Completed Work
1. **Mobile Dashboard:** Much improved, fully responsive, and live.
2. **Mobile POS:** Product grid is optimized and responsive.
3. **Compacted Mobile Pages:** Polish and layout compaction completed for settings, catalog/products, customers, invoices, reports, expenses, cash drawer, supplier purchases, supplier dues, replenishment, repairs, audit log, and users.
4. **UX Improvements:** Required field cues and empty state displays have been optimized.
5. **Mobile Navigation Drawer:** Solved theme selector dropdown issues and page margins/padding overflow.
6. **Customizable Bottom Tab Bar:** Polish added to customize view supporting selection of 4 to 6 tabs, ordering, and quick reset/save.
7. **Bottom Tab Customize Screen:** Rendered within a React Portal to escape the topbar's stacking context, ensuring that the Save and Reset buttons are fully visible and clickable above the bottom tab bar.
8. **Cookie / Analytics Consent Banner:** Consent is tracked per device (for logged-out pages) and synced to database user preferences (for logged-in accounts). It asks only once per account/device and does not flash on loading screens.
9. **Invoice Logo Settings:** Hidden the technical raw Supabase URL field from invoice branding settings UI, replacing it with a clean upload success notice.
10. **Plain-Text WhatsApp Invoice Sharing:** Primary WhatsApp share action builds a plain-text invoice message and launches WhatsApp directly.
11. **Secondary PDF/Image Options:** Kept manual modal secondary actions intact (Download Image PNG, Download/Print PDF, A4 print, and 80mm print).
12. **reCAPTCHA Audit:** Standard reCAPTCHA v2 checkbox on login was kept untouched.
13. **Archived Nav Persistence:** Fixed archived sidebar list items where clicks would navigate incorrectly.
14. **Reports Reconciliation Guide:** Added a detailed walkthrough explanation on the reports page detailing the relationship between Gross Sales, Discounts, Net Sales, Returns, Cost of Goods Sold (COGS), and Net Profit.
15. **E2E Playwright Smoke-Test Foundation:** Setup serially-executed (`workers: 1`) Playwright E2E tests for core navigation, POS checkouts, invoice redirection, returns, and reports guides. Built a strict production-mutation guard that skips POS checkouts/returns on live production base URLs unless `PLAYWRIGHT_ALLOW_PRODUCTION_MUTATIONS=true` is explicitly set.
16. **PR #224 (merged):** Fixed visible POS hover and table filters. Replenishment alignment improvements. Supplier Purchases filter spacing.
17. **PR #225 (merged):** Improved public navbar (removed SaleDock word and white logo pill), settings dirty-save behavior, image cropping UX.
18. **PR #226 (merged):** Added Vercel Analytics and Speed Insights. Removed SD mark from public top bar. Supplier Purchases dropdowns are now app-themed (not browser-default). Logged-in theme control moved into the user dropdown. Theme removed from standalone topbar and mobile drawer. Login "Back to Home" fixed to go directly to `/`. Cropper polished with drag-to-position, zoom, circular profile guide, and rectangular logo guide.
19. **PR #239 (merged):** Login left panel uses only the dark ecosystem image integrated into the blue block; onboarding hero image removed; signup uses First name (required) + Last name (optional); fixed the unfinished-onboarding `/login` crash (a client onClick on a server component); image preview state syncs from `currentUrl`.
20. **PR #240 (merged):** Unfinished signed-in users are redirected from `/login` straight to `/onboarding` (single continue/start-over screen). Image preview root cause fixed: the `profile-pictures` bucket is private, so previews now use a short-lived signed URL; `public-branding` logo still uses the public URL. Stored canonical URL is unchanged.
21. **Branch `fix/staff-invite-rules-permissions-cache` (review-first, NOT merged):** Staff invite error messages rewritten to safe, specific plain English. Invite eligibility rules formalized (already-in-shop, pending block, revoked/declined/expired reuse, other-shop block, unfinished-owner allowed, fresh allowed). Added a safe invite rate-limit (Redis-optional, in-memory fallback, fail-open). Permission audit completed (no gaps fixed — system was already sound). No SQL/RLS/RPC/package changes.

## SaleDock UI Rules
* **Dropdown / Select Rule:** All dropdowns, selects, menus, and option pickers should use app-themed components. Avoid raw browser-default `<select>` UI for visible customer-facing controls unless there is a strong accessibility or technical reason.

## Safety & Business Rules
* **No Database Migrations or SQL:** No schemas or database table modifications have been made.
* **No Core Calculation Changes:** Unaltered pos_checkout, checkout/payment math, invoice totals/dues/payments, customer balance/ledger, supplier due, daily cash drawer, and report calculations.
* **No Auth/Session changes:** Kept Supabase authentication, session providers, and client login logic completely untouched.
* **No Backend Server Mutations:** Kept backend mutation endpoints and server action behavior unchanged.
* **Secure Invoice Sharing:** Invoice image/PDF sharing uses already-loaded client-side invoice data only, and does not expose private invoices via public urls.
* **No Dashboard Caching:** No caching layer added for dashboard/money reports.
* **Secure Test Credentials:** E2E test login credentials are never saved in code or files and are loaded dynamically from environment variables during runtime.
* **Analytics are official only:** Vercel Analytics and Speed Insights are installed using official Next.js components. No custom PII analytics events were added.
* **Settings/Image changes are UX-only:** Image crop and settings changes reuse existing save/upload flows without touching backend logic.

## Current Known Issues & Notes
* **reCAPTCHA Enterprise Key Email:** Google may continue to send emails about the unused key. The owner (Fardan) should manually delete or disable this key in his Google Cloud Console. Full integration of reCAPTCHA Enterprise would be a separate, auth-sensitive, review-first task.
* **Public navbar branding:** The public landing top bar should not show the SaleDock word, SD mark, or white logo pill. Branding remains in the hero section and footer.
* **Theme control location:** Theme control now lives in the user dropdown (top-right), not in the standalone topbar or mobile drawer. Theme persistence still works.

## Recommended Next Steps
1. **Review and Merge E2E Test Expansion:** Review and merge the expanded smoke tests (covering customers, products, expenses, suppliers, settings, permissions, and cash drawer routes).
2. **Review QA Test Runs:** Run E2E test runs using local env vars on localhost or staging to verify complete system behavior.
