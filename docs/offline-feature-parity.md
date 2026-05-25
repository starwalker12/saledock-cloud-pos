# Offline → Online Feature Parity

Source of truth: `GadgetZonePOS_Full_Project_Documentation.md` (offline desktop app spec). The online app must eventually replicate every module. Each entry below tracks where we are.

Statuses: **Done** · **Partial** · **Not started** · **Planned**

| # | Module | Status | Notes |
|---|---|---|---|
| 1 | Auth / users / permissions | **Partial** | Owner sign-in/sign-up + first-owner setup live. Public sign-up locked after first owner. **Missing**: invite flow, password reset, multi-user roles UI, recovery codes, protected-admin pattern. |
| 2 | Dashboard | **Partial** | Live counts: active products, low stock, categories, suppliers, customers, invoices, open balances, repairs, today sales. **Missing**: profit, payment-method breakdown, staff performance, daily-closing summary. |
| 3 | Products / services catalog | **Done (MVP)** | CRUD with search/filter, archive/restore, services flagged with `type='service'`, cost forced to 0 for services. **Missing**: batches/lots, supplier purchases UI, product history. |
| 4 | Inventory and stock lots | **Done** | FIFO stock lots database migration 0005, atomic pos_checkout allocation, manual stock adjustments, restock lot additions, and double-entry movement ledger implemented. |
| 5 | POS / new bill | **Done (MVP)** | Cart, customer pick / quick-add, 6 payment methods, server-side totals, atomic checkout RPC, sequential invoice numbers. **Missing**: full service principal/commission entry, multi-payment per bill, hold/resume bill, barcode scan UX. |
| 6 | Service transactions | **Partial** | Schema has all 9 `service_*` columns on `invoice_items`. RPC stores `purchase_price=0` for services so profit math is safe (commission only). **Missing**: principal-vs-commission entry UI, provider/direction/account/reference fields exposed in POS, service profit report. |
| 7 | Invoice A4 print | **Partial** | Browser-print invoice detail page (`@media print` CSS). **Missing**: dedicated A4 PDF template with shop logo, polished header/footer. |
| 8 | 80mm thermal receipt | **Not started** | Planned: separate `/invoices/[id]/receipt` route with 80mm-width CSS + thermal-friendly layout. |
| 9 | WhatsApp invoice sharing | **Not started** | Planned: `wa.me/<phone>?text=…` link with invoice URL once invoices are public per-org or accessible via signed link. |
| 10 | Customers | **Done** | CRUD with search/filter, archive/restore, and customer detail profile page. |
| 11 | Customer credit / ledger | **Done** | Ledger entries are created automatically for invoice balances; general settlements are supported via `record_credit_payment` RPC; cached balance with double-entry audit history is live. |
| 12 | Returns / refunds | **Not started** | Planned tables: `return_refunds`, `return_items`. Will need to reverse stock and create negative payment / customer credit. |
| 13 | Expenses | **Partial (schema only)** | Table `expenses` exists in migration 0001. No UI yet. |
| 14 | Suppliers | **Done (MVP)** | CRUD with archive/restore. **Missing**: supplier purchase entry that creates stock lots. |
| 15 | Repairs | **Not started (schema only)** | Tables `repairs`, `repair_status_history` exist in migration 0001. No UI. |
| 16 | Reports | **Not started** | Daily sales, profit, payment-method breakdown, low-stock report, stock value, staff performance. |
| 17 | Daily closing | **Not started (schema only)** | Table `daily_closings` exists in migration 0001. |
| 18 | Audit log | **Not started (schema only)** | Table `audit_logs` exists. Checkout should emit `bill.created` events; catalog mutations should emit `product.created/updated/archived`. |
| 19 | Settings / branding | **Partial (schema only)** | Table `app_settings` exists with shop name, logo paths, theme accent. No UI to edit yet. |
| 20 | Backup / restore / export | **Not applicable in same form** | Online app uses Supabase for daily backups (free tier: PITR limited). Replace offline backup/restore with periodic Supabase logical backup + per-org export-to-CSV. |
| 21 | Global search | **Not started** | Planned: command-palette over products / customers / invoices / repairs. |
| 22 | User management | **Not started** | Planned: invite users, assign role, deactivate, recovery codes. Schema already supports roles. |

## Critical rules from the offline doc that must be preserved forever

1. **Service profit rule** — profit for service lines = commission only. Never subtract the service principal from profit. This is enforced today by always storing `purchase_price = 0` for services (server-side in `saveProductAction`) so `line_total - purchase_price * qty = commission`.
2. **Stock decrement only for `type='product'`** — services never reduce stock. Enforced inside the `pos_checkout` Postgres function.
3. **All totals recomputed server-side** — the browser cart is hints only; the RPC re-fetches each product and recomputes line totals, subtotal, grand total, balance due.
4. **Invoice numbers are sequential per organization** — generated inside the RPC under a per-org row lock so concurrent checkouts cannot collide.
5. **RLS is org-scoped, no exceptions** — every catalog/POS/payment/customer row is gated by `current_organization_id()` in policies created by migration 0001. The `pos_checkout` RPC is `security invoker` so RLS still applies.
6. **No production seed data** — `supabase/seed.sql` is for local dev only and is never run against the live project.

## Suggested module ordering (after PR #3)

1. **Customer detail + edit + archive** (fills out the existing Customers page).
2. **Customer ledger** — `customer_ledger_entries`, `credit_payments`, settlement UI. Hardens "customer_credit" payment method properly.
3. **Returns / refunds** — needed before stock-lots so we can reverse a sale cleanly.
4. **Stock lots + movements (FIFO)** — migration `0004_stock_lots.sql`, allocate on `pos_checkout`, reverse on return.
5. **Expenses UI** + **Daily closing**.
6. **Reports** (after closing exists so it has authoritative day-cuts).
7. **Audit log** — wire `audit_logs` into every mutating server action.
8. **Repairs**.
9. **Settings / branding UI**.
10. **A4 PDF + 80mm receipt + WhatsApp share**.
11. **Invite / user management**.
12. **Global search**.
