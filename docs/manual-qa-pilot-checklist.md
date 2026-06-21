# SaleDock Cloud POS - Manual QA Pilot Checklist & Test Harness Plan

**Last Updated:** 2026-06-21  
**Target Baseline:** `40918df` (`main`, PR #271)  
**Safety Status:** Strictly docs-only. No mutations are performed on production databases.

This document serves as the guide for Fardan (Shop Owner) to execute manual QA validation of live safeguards in a controlled QA shop/account, provides a structured results template, outlines a plan for a safe disposable test harness, and documents important credential hygiene guidelines.

---

## 🔒 Crucial QA Safety Rules

> [!CAUTION]
> **Strict Operational Constraints:**
> - **No Production Data Alterations:** Do NOT use live customer, inventory, or supplier data for tests that mutate records. Use a dedicated "QA Shop" or test organization.
> - **Do NOT Run Factory Reset on Production:** The factory reset function is Owner-only and destructive. Never test the final confirmation step of the reset UI against a live production database.
> - **Do NOT Run Real Import/Restore on Production:** Importing backups is additive and permanent. Only perform import tests in a controlled staging/QA environment.

---

## Task A — Manual QA Checklist Pack

Run these checks in a controlled QA shop or test organization to verify the live safeguards.

### 1. Login & Session Navigation
* **Objective:** Ensure unauthorized users are blocked from key interfaces and redirected appropriately, while valid users can authenticate.
* **Steps:**
  1. Open a new Incognito browser window.
  2. Navigate directly to `/dashboard`. Verify that you are blocked and redirected to the login page with a `next` URL parameter: `/login?next=%2Fdashboard`.
  3. Navigate directly to `/pos`. Verify that you are redirected to `/login?next=%2Fpos`.
  4. Enter valid login credentials for your test account and submit. Verify that you are logged in and correctly redirected back to the destination page (e.g. `/pos`).
* **Expected Result:**
  - Unauthorized access redirects to `/login`.
  - Valid credentials permit access and redirect to the target page.

### 2. Normal POS Checkout
* **Objective:** Verify database transaction completeness (invoice, payment, stock lot consumption, ledger, audit log).
* **Steps:**
  1. Navigate to `/pos`.
  2. Select one product with known stock (e.g. `iPhone 15 Pro Max Clear Case`, available stock: 20 units).
  3. Add the product to the cart. Confirm the sale price (e.g. 1200) and tax/discount calculations are correct.
  4. Click checkout, select **Cash** as the payment method, enter exact cash received (1200), and submit the transaction.
  5. Go to `/invoices` and select the newly created invoice.
  6. Go to `/products` and locate the product.
  7. Check `/daily-closing` shift summary.
* **Expected Result:**
  - Invoice total matches `1200`, paid is `1200`, due is `0`, and payment method is `Cash`.
  - The product stock decreases by exactly 1 unit (from 20 to 19).
  - Invoice is registered under `/invoices`.
  - Cash sales total in the open shift increases by `1200`.

### 3. POS Checkout Idempotency (Duplicate Prevention)
* **Objective:** Verify that double-clicks, timeouts, or network retries do not result in duplicate invoices, duplicate stock deductions, or duplicate payments.
* **Steps:**
  1. Go to `/pos`. Add a product to the cart.
  2. Under browser developer options (Network tab), set throttling to "Slow 3G" if comfortable, OR prepare to double-click the checkout button rapidly.
  3. Click the checkout button twice in rapid succession.
  4. Allow the transaction to complete.
  5. Navigate to `/invoices` and check for duplicate entries.
  6. Check `/products` to inspect the product's remaining stock.
  7. Check `/audit-log` for checkout events.
  8. Check `/daily-closing` to inspect shift cash sales.
* **Expected Result:**
  - Exactly one invoice is created in the database.
  - The product stock decreases by exactly 1 unit (not 2).
  - Only a single `pos.checkout_completed` event is registered in the `/audit-log`.
  - The open cash shift reflects only a single transaction amount.

### 4. Stock & FIFO Lot Allocation
* **Objective:** Verify lot allocation order (oldest first) and ensure that overselling is blocked gracefully.
* **Steps:**
  1. Identify or create a product with multiple stock lots (e.g., Lot A: 5 units purchased on June 1 at 600 each; Lot B: 10 units purchased on June 15 at 650 each).
  2. Navigate to `/pos` and add 7 units of this product to the cart. Complete checkout.
  3. Go to `/products` and view the FIFO stock allocation details (if displayed) or check the remaining stock lots.
  4. Attempt to create a new POS checkout for a quantity exceeding available stock (e.g., request 15 units when only 8 are left).
* **Expected Result:**
  - Stock allocation consumes Lot A completely (5 units) and Lot B partially (2 units).
  - Total Cost of Goods Sold (COGS) is correctly computed as `(5 * 600) + (2 * 650) = 4300`.
  - Overselling is blocked by the POS with safe, user-friendly wording (e.g. *"Insufficient stock for product. Requested: 15, Available: 8"*). No rows are mutated, and no partial invoice is saved.

### 5. Below-Cost Sale Guard
* **Objective:** Ensure sales below cost are blocked unless authorized by an administrator/owner override.
* **Steps:**
  1. Add a product with a known purchase cost of 650 to the cart.
  2. Change its selling price in the cart to `600` (below the 650 purchase cost).
  3. Attempt to checkout without checking any override option or inputs.
  4. Check the behavior.
  5. Check if manager/owner override works when valid admin credentials are input.
* **Expected Result:**
  - Without override, checkout fails with safe wording: *"Price cannot be below cost price of 650.00 without administrator override."* No database entries are modified.
  - With authorized override, checkout completes successfully, and a warning-level audit event `security.below_cost_override` is written to the audit log.

### 6. Product Returns & Stock Restoration
* **Objective:** Verify full/partial return logic, FIFO lot restoration, and clean user-facing copy.
* **Steps:**
  1. Go to `/invoices` and select a completed invoice.
  2. Execute a **Full Return** for an item.
  3. Go to `/products` and confirm stock restoration.
  4. Locate the return transaction in `/returns`.
  5. Go to `/invoices` and select a different invoice with multiple quantities. Perform a **Partial Return** (e.g., return 1 out of 3 units).
* **Expected Result:**
  - For a full return, the exact quantity is restored back to the product's active FIFO stock lot. Customer credit or cash refund is recorded correctly.
  - For a partial return, only the returned quantity is restored.
  - Returns UI, printout receipts, and logs use safe terminology (avoiding raw SQL exception text or database jargon like "FIFO allocation link IDs").

### 7. Customer Ledger & Credit Sales
* **Objective:** Verify customer outstanding balances and ledger logs are updated accurately during credit sales and settlements.
* **Steps:**
  1. Go to `/pos` and assign a registered customer (e.g. `Walk-in Customer` or a test account) to the cart.
  2. Create a sale with a total of `3500`. Enter a partial payment of `1500` (due: `2000`). Checkout.
  3. Navigate to `/customers` and inspect the customer profile.
  4. Click **Record Payment**, enter a payment of `1000`, and save.
  5. Check `/customers` and `/audit-log`.
* **Expected Result:**
  - The customer's outstanding balance increases by `2000` immediately after checkout.
  - The customer ledger registers a debit entry of `2000`.
  - After recording the payment of `1000`, the outstanding balance decreases to `1000`.
  - The ledger registers a credit entry of `1000` without duplicate rows.

### 8. Supplier Purchases & Payment Ledger
* **Objective:** Verify supplier outstanding balances and dues are updated during purchase receipts.
* **Steps:**
  1. Navigate to `/suppliers/purchases`.
  2. Create a supplier purchase of 10 units at `50` per unit (total: `500`).
  3. Record a partial payment of `200` (due: `300`). Save the purchase.
  4. Go to `/suppliers/dues` and check the balance.
  5. Record a payment of `300` to the supplier.
* **Expected Result:**
  - Supplier due balance increases by `300` upon purchase creation.
  - Record is logged in the supplier ledger.
  - Recording the payment of `300` reduces the outstanding dues to `0`. No duplicate rows or incorrect allocations occur.

### 9. Reports & Asia/Karachi Timezone Boundaries
* **Objective:** Verify that transactions logged close to midnight PKT are grouped under the correct business day in dashboard statistics and daily closings.
* **Steps:**
  1. Create an invoice at 00:30 PKT (which corresponds to 19:30 UTC of the previous calendar day).
  2. Inspect `/dashboard` daily sales charts and `/daily-closing`.
  3. Create an invoice at 23:30 PKT. Inspect the dashboard.
* **Expected Result:**
  - The transaction at 00:30 PKT is grouped under today's business date (PKT day) in all reports and graphs. It is not allocated to the previous calendar day.
  - The transaction at 23:30 PKT is also grouped under the correct calendar day and does not prematurely roll over to the next day.

### 10. Cash Drawer & Daily Closings
* **Objective:** Ensure daily closing reports calculate cash math (opening, sales, expenses, settlements) correctly.
* **Steps:**
  1. Open a new cash shift in `/daily-closing` with an opening balance of `1000`.
  2. Create a POS cash sale of `1200`.
  3. Create an expense of `200` in `/expenses`.
  4. Record a customer ledger cash settlement of `500` under `/customers`.
  5. Go back to `/daily-closing` and inspect the shift summary.
  6. Finalize/close the shift by entering `2500` as the actual closing cash.
* **Expected Result:**
  - Expected cash matches exactly: `1000 (opening) + 1200 (sale) + 500 (settlement) - 200 (expense) = 2500`.
  - Shift summary updates in real time with correct totals.
  - Finalizing the shift locks the closing report. Variance is recorded as `0`.

### 11. Backup Import & Export Safety
* **Objective:** Confirm invalid file uploads are caught and rejected in the browser before parsing, and that exports execute cleanly.
* **Steps:**
  1. Go to `/settings` or `/backup` and export a full backup ZIP. Ensure it downloads.
  2. Attempt to upload an invalid backup file:
     - Upload a plain text file renamed to `.zip`.
     - Upload a blank, empty `.zip` archive.
     - Upload a very large non-ZIP file (e.g. an image renamed to `.zip`).
  3. Observe the validation output.
  4. **Strict rule:** Do NOT upload a real backup ZIP and submit the final import on your live production database.
* **Expected Result:**
  - Export generates a valid ZIP containing `manifest.json`, `/data/gadgetzone-online.json`, and CSV directories.
  - Invalid uploads are caught immediately in-browser by JSZip, blocking the preview step with a clear, safe message (e.g., *"Unsupported ZIP. Expected either data/gadgetzone-online.json or data/gadgetzonepos.db."*).

### 12. Roles & Permissions Guards
* **Objective:** Verify that access to dangerous modules (like factory reset) is restricted to the Shop Owner.
* **Steps:**
  1. Log in to the application as the Shop Owner. Navigate to `/settings`. Confirm the **Factory Reset** module is visible.
  2. Log in as an Admin or Staff member. Navigate to `/settings`.
  3. Try to access `/settings` or `/settings?tab=reset` directly.
  4. Attempt to promote a user to Owner/Admin from a Staff account.
* **Expected Result:**
  - Non-owner users cannot see the Factory Reset panel.
  - Direct navigation displays: *"Only the shop Owner can access factory reset."*
  - Permission elevations from staff roles fail server-side with permission denied.

---

## Task B — Manual QA Result Template

Fardan can use this table to document results when running the pilot manual checks.

| Test ID | Test Name | Expected Result | Actual Result | Pass/Fail | Screenshot Needed? | Notes / Observations | Issue/PR Needed? |
|---|---|---|---|---|---|---|---|
| **QA-01** | Login & Redirects | Block anonymous, redirect to login, redirect back to destination. | | | Yes (login page) | | |
| **QA-02** | Normal POS Checkout | Total invoice is correct, stock decrements by 1, appears in reports. | | | Yes (invoice page) | | |
| **QA-03** | Checkout Idempotency | Double-click creates exactly one invoice, single stock decrement, single audit log. | | | Yes (audit log / invoice list) | | |
| **QA-04** | FIFO Stock Lots | Consume oldest lot first. Oversell blocked with safe message. | | | Yes (oversell alert box) | | |
| **QA-05** | Below-Cost Guard | Block below-cost checkouts unless override is checked. | | | Yes (price warning) | | |
| **QA-06** | Product Returns | Full/partial returns restore stock and update ledger balances. | | | Yes (returns receipt) | | |
| **QA-07** | Customer Ledger | Debt is logged correctly on credit sales. Payments clear debt. | | | Yes (ledger table) | | |
| **QA-08** | Supplier Ledger | Supplier purchases add dues. Payments clear supplier dues. | | | Yes (dues dashboard) | | |
| **QA-09** | Karachi Timezone | Midnight PKT transactions group under correct business day. | | | No | | |
| **QA-10** | Daily Closing Math | Expected cash formula matches actual sales/expenses. | | | Yes (closing summary) | | |
| **QA-11** | Backup Safety | Export works. Invalid imports block in browser before parsing. | | | Yes (upload error alert) | | |
| **QA-12** | Owner Role Guard | Factory Reset hidden from and blocked for Admins/Staff. | | | Yes (non-owner settings view) | | |

---

## Task C — Disposable Test Harness Plan

This plan outlines the architecture for safe, automated money, stock, and FIFO tests that do not interact with the production database.

### 1. Environments & Isolated Infrastructure
To prevent any risk of mutating production data, testing must run against a distinct Postgres instance:
* **Local Supabase CLI:** Run a local emulator instance using `supabase start`. This spins up local Docker containers containing Postgres, Auth, Storage, and Edge Functions.
* **Disposable Supabase Project:** Alternatively, a dedicated, low-cost "Staging/QA" project can be provisioned in the Supabase Cloud dashboard specifically for automated tests.
* **Credentials Safeguard:** Test runner configurations (e.g. `.env.test`) MUST override `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to target `localhost:54321` or the staging domain. Under no circumstances should production environment variables be loaded by the test harness.

### 2. Schema Setup & Reset Strategy
* **Database Migrations:** Before running tests, execute `supabase db reset` (or run migrations against the staging DB). This ensures the database schema is clean and matches current production main exactly.
* **Deterministic Seeding:** Run the custom seed SQL (`supabase/seed.sql`) to provision standard entities:
  - Test Organization: `Gadget Zone` (ID: `00000000-0000-4000-8000-000000000001`)
  - Test Branch: `Main Branch` (ID: `00000000-0000-4000-8000-000000000101`)
  - Default Categories: Accessories, Smartphones, Digital Services, Repairs.
  - Test Supplier: `Demo Wholesale Supplier`.
  - Test Walk-in Customer: `Demo Walk-in Customer`.
* **Transaction Rollback:** Wrap each integration test in a Postgres transaction block (`BEGIN; ... ROLLBACK;`) where supported, or execute a database reset command after each test run to maintain isolation.

### 3. Automated Test Scenarios

#### POS Checkout & Totals
* **Assert:** Query `pos_checkout` RPC with fixed items. Assert that `invoice.total_amount` equals subtotal minus discounts, `invoice.due_amount` equals total minus paid, and stock tables are updated correctly.

#### Idempotency Tests
* **Assert:** Call `pos_checkout` twice with the same `checkout_idempotency_key` argument in parallel or sequentially. Assert that the second call returns the same invoice record, does not create a second invoice, does not deduct stock a second time, and logs only one audit log.

#### Oversell Prevention
* **Assert:** Seed a product with 3 units in stock. Call `pos_checkout` requesting 5 units. Assert that the RPC returns a code matching `insufficient_stock` and rolls back all database writes.

#### Below-Cost Checks
* **Assert:** Seed a product with purchase cost 650. Attempt checkout at price 600 without override. Assert transaction fails. Attempt checkout at price 600 with the `below_cost_override` parameter. Assert success and verify a `security.below_cost_override` log is written.

#### FIFO Returns & Lot Restoration
* **Assert:** Seed a product with Lot A (3 units) and Lot B (5 units). Sell 5 units (consuming Lot A completely and Lot B partially). Perform a return of 2 units. Assert that the returned units are added back to Lot A and Lot B in reverse order.

#### Customer Ledger Balances
* **Assert:** Run a credit sale transaction. Confirm customer balance is incremented. Submit a payment transaction. Assert that outstanding balance decreases and database ledger counts are correct.

#### Supplier Purchases
* **Assert:** Insert a supplier purchase with due balance. Submit a supplier payment. Assert that supplier dues are allocated to the oldest outstanding invoice first.

#### Karachi Date Grouping
* **Assert:** Insert checkouts at `2026-06-20T19:30:00Z` (00:30 PKT) and `2026-06-21T02:00:00Z` (07:00 PKT). Invoke the `get_sales_by_day` RPC for `2026-06-21` (Asia/Karachi). Assert that both transactions are grouped under the correct PKT date.

### 4. CI/CD Feasibility
* **GitHub Actions Integration:**
  1. Add a step to spin up the Supabase CLI:
     ```yaml
     - name: Start Supabase Local Emulator
       run: npx supabase start
     ```
  2. Run migrations:
     ```yaml
     - name: Run migrations
       run: npx supabase db reset
     ```
  3. Execute testing suites:
     ```yaml
     - name: Run Integration Tests
       run: npm run test:integration
       env:
         NEXT_PUBLIC_SUPABASE_URL: http://127.0.0.1:54321
         SUPABASE_SERVICE_ROLE_KEY: otlp_placeholder_test_key
     ```
* **No Production Secrets:** The GitHub CI secrets must never contain production DB credentials. Only emulator credentials or a dummy sandbox project connection string should be supplied.

---

## Task D — Database Password Rotation Reminder

> [!IMPORTANT]
> **DB Credentials Security Alert:**
> The database password for the production Supabase instance was previously pasted into a shared context. To ensure absolute security and protect production customer information:
> 1. Please go to the **Supabase Dashboard** -> **Project Settings** -> **Database**.
> 2. Scroll to **Database password** and click **Reset database password** or **Generate/Rotate password**.
> 3. Save the new password securely in your local password manager.
> 4. Update the server environment variable `POSTGRES_PASSWORD` (or equivalent connection string credentials) inside your **Vercel Project Settings** env configuration.
> 5. Redeploy the production branch in Vercel to pick up the updated database credentials.
> 6. **Do NOT paste the new password, connection strings, or secrets into this chat, terminal commands, or documentation files.**

---

## 🔄 Branch Rollback & Close Draft Instructions

Once these pilot documents have been reviewed and finalized, the draft PR branch can be safely managed.

### How to Rollback the Branch (If Needed)
If you decide to discard these checklists and revert to the main branch status:
1. Checkout the `main` branch locally:
   ```bash
   git checkout main
   ```
2. Delete the local checklist branch:
   ```bash
   git branch -D docs/manual-qa-pilot-checklist
   ```
3. (If pushed to remote) Delete the remote draft branch:
   ```bash
   git push origin --delete docs/manual-qa-pilot-checklist
   ```

No database migrations or SQL rollbacks are required since this branch contains documentation updates only.
