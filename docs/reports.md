# Reports Module

The Reports module lives at `/reports`. It provides owners, admins, and managers with an analytical dashboard of organizational and branch performance. 

## Features & Permissions

- **Role Gating**: Access is strictly restricted to `owner`, `admin`, and `manager` roles. Cashiers and technicians are redirected to the Dashboard.
- **Organization & Branch Scoping**: Reports are computed completely server-side. Data queries are filtered by `organization_id` and, where applicable, by `branch_id` from the active user profile context to enforce strict multi-tenant boundary lines.
- **Date Filters**: The dashboard defaults to the **current calendar month** and provides quick filters for:
  - Today
  - Yesterday
  - This Week
  - This Month
  - Last Month
  - Custom date selection inputs

---

## 1. Metric Sections & Formulas

### Sales Summary
- **Gross Sales**: Sum of `subtotal` from active invoices (where status !== 'void'). This represents sales after line-item discounts but before cart-level discounts.
- **Invoice Count**: Count of active invoices created inside the date range.
- **Average Invoice Value**: `Sales Revenue (Net Sales) / Invoice Count`.
- **Total Discounts**: Sum of cart-level `discount_total` from invoices plus the sum of `item_discount` from invoice items.
- **Open Balance / Unpaid**: Sum of `balance_due` on invoices generated during the range.
- **Sales by Day**: Grouped active invoices count, gross, and net sales by calendar day.

### Payment Summary
- **Payment Method Split**: Summarizes payments received by cash drawers and digital rails:
  - **Cash Drawer**: Sum of payment amounts where `method = 'cash'`.
  - **Credit Card**: Sum of payment amounts where `method = 'card'`.
  - **EasyPaisa**: Sum of payment amounts where `method = 'easypaisa'`.
  - **JazzCash**: Sum of payment amounts where `method = 'jazzcash'`.
  - **Bank Transfer**: Sum of payment amounts where `method = 'bank_transfer'`.
  - **Customer Ledger (Outstanding Credit)**: Sum of invoice `balance_due` (representing unpaid sales credit issued at checkout).

### Profit Summary
- **Sales Revenue (Net Sales)**: Sum of `grand_total` from active invoices (status !== 'void').
- **Product Cost of Sales**: Sum of `purchase_price * quantity` from invoice items of type `product`.
- **Gross Profit (Product Trade)**: `Sales Revenue - Product Cost`.
- **Gross Margin %**: `(Gross Profit / Sales Revenue) * 100`.
- **Service Revenue / Profit**: Sum of `line_total` from invoice items of type `service` (assumes service purchase price is 0).
- **Estimated Net Profit**: `Gross Profit - Total Expenses`. Since service revenue is already included in Sales Revenue (and has 0 cost), service profit is fully reflected in Gross Profit.

### Returns & Refunds Summary
- **Return Count**: Completed returns inside the range.
- **Refund Total**: Sum of `refund_amount` from completed returns.
- **Refunds by Method**: Grouped totals by refund method (Cash, Card, EasyPaisa, etc.).
- **Returned Product Quantity**: Total units returned during the range.

### Expenses Summary
- **Total Expenses**: Sum of `amount` from active expenses (`status = 'active'`).
- **Expenses by Category**: List of categories sorted descending by expenditure.
- **Expenses by Method**: List of payment methods used to settle expenses.

### Customer Outstanding Ledger
- **Total Outstanding Customer Balance**: Sum of `outstanding_balance` across all customer profiles (global state).
- **Debtor Count**: Count of customers with `outstanding_balance > 0`.
- **Top Debt Outstanding Profiles**: Top 5 debtor profiles sorted by debt outstanding.
- **Ledger Credit Payments**: Sum of settlements received in the `credit_payments` table during the range.

### Inventory Summary
- **Active Products**: Total catalog products that are active.
- **FIFO Stock Valuation**: Sum of `quantity_remaining * unit_cost` from `product_stock_lots` where `is_active = true`.
- **Low Stock & Out of Stock Warnings**: Listings of items at or below reorder levels or fully depleted.
- **Valuable Stock Concentrates**: Top 5 physical products in stock sorted by active lot value.

### Top Performing Catalog Lines
- **Top Products by Qty**: Top 5 products by quantity sold.
- **Top Products by Revenue**: Top 5 products by revenue.
- **Top Services by Revenue**: Top 5 services by revenue / commission.

### Daily Closings Summary
- **Closed Days Count**: Count of finalized daily closings.
- **Open Days Count**: Calendar days in the range lacking a finalized daily closing entry.
- **Drawer Discrepancy (Diff)**: Sum of `cash_difference` from finalized closings.

---

## 2. Print Layout Support

A custom print stylesheet is embedded inside the page:
- Suppresses sidebars, mobile headers, and interactive filter controls.
- Adds an authentic corporate letterhead showing organization details and audit ranges.
- Fits perfectly on standard A4 layout sheets.

---

## 3. Known Limitations & Estimates
1. **FIFO Costing vs Static Costing**: The product cost of sales is computed directly from `invoice_items.purchase_price * quantity` recorded at checkout. This relies on the POS atomic checkout function successfully mapping the FIFO stock lot's purchase price to `invoice_items.purchase_price`. Manual inventory stock corrections or lots added retrospectively do not retroactively alter already-issued invoice items' prices.
2. **Estimates vs Mature Audits**: Profit margins are estimates. True accounting audits mature with subsequent ledger integrations, tax calculations, and depreciation schedules.
