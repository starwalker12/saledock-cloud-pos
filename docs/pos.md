# POS Checkout

The cashier flow lives at `/pos`. Invoices land at `/invoices` (list) and `/invoices/[id]` (printable detail).

## Atomic checkout

`supabase/migrations/0003_pos_checkout.sql` adds a Postgres function `public.pos_checkout(...)` that runs the entire sale in a single transaction:

1. Verifies authenticated user has an active profile.
2. Locks the organization row to serialize invoice-number generation.
3. Generates a sequential invoice number `INV-NNNNNN`.
4. Re-fetches each product `FOR UPDATE`, validates active state and stock for physical items.
5. Recomputes line totals and subtotal **server-side** (the browser is never trusted).
6. Computes `grand_total`, `amount_paid`, `balance_due`, and the status (`paid` / `partial` / `unpaid`).
7. Inserts the invoice, invoice items, and (if `amount_paid > 0`) a payment row.
8. Decrements stock for `type = 'product'` items only.
9. Returns `(invoice_id, invoice_no)`.

`security invoker` keeps RLS active; only org members can call it successfully, and inserts respect the existing org-scoped policies.

## Validation

`src/lib/validation/pos.ts` exposes:

- `cartItemSchema` — per-line: product_id, quantity, unit_price, discount
- `checkoutSchema` — full cart + customer + discount + payment method + amount paid + reference + note
- `quickCustomerSchema` — name (required), phone (optional)

Payment methods: `cash`, `card`, `easypaisa`, `jazzcash`, `bank_transfer`, `customer_credit`.

## Permissions

`canUsePos(role)` allows `owner`, `admin`, `manager`, `cashier`. Server actions reject everyone else and the UI disables the checkout button for those roles.

## Server actions

`src/app/pos/actions.ts`:

- `checkoutAction(input)` — validates, calls `pos_checkout` RPC, revalidates `/pos`, `/invoices`, `/dashboard`, `/products`.
- `quickCreateCustomerAction({ name, phone })` — quick walk-in customer creation.

## UI

`src/app/pos/pos-client.tsx` (client component) holds the cart state:

- Product grid filtered by search (name/SKU/barcode) + category.
- Out-of-stock items are disabled; low-stock items show a badge.
- Cart: per-line quantity (+/−), editable unit price, line discount, remove.
- Customer dropdown with quick-add inline form.
- Cart-level discount.
- Payment method select, amount paid (with "Exact" helper that fills the grand total), optional reference for non-cash methods, optional note.
- Live subtotal / cart discount / grand total / balance due.
- On success: in-line confirmation with a link to the new invoice.

Layout: products + cart side by side on `xl:` screens, stacked on smaller.

## Invoices

- `src/app/invoices/page.tsx` — responsive list (desktop table / mobile card list).
- `src/app/invoices/[id]/page.tsx` — printable detail with business header, customer, line items, totals, payments, and note.
- `src/app/invoices/[id]/print-button.tsx` — client button that calls `window.print()`.
- Print CSS is in `src/app/globals.css` (`@media print`) — strips chrome, prints just the invoice. No paid PDF service.

## Dashboard

- New cards: Invoices total, Open balances (partial + unpaid), Customers, Repairs.
- "Today sales" card now reads from `invoiceCounts()` (sum of grand totals for invoices dated today, plus invoice count).

## Page titles

`AppShell` now accepts a `pageTitle` prop. Each page sets a friendly title (Dashboard, Catalog, New sale, Invoices, Customers, Repairs, Reports, Settings).

## Service profit rule (must never regress)

The offline app defines: **profit for a service line = commission only**. The principal (e.g. the Rs. 500 a customer hands over for an EasyPaisa cash-in) is pass-through money and must never be subtracted from profit.

How we enforce that today, in the simplest possible way:

- `saveProductAction` (server) forces `purchase_price = 0` for any product with `is_service = true`. The UI also disables the cost field and relabels "Sale price" as "Commission" for services.
- The `pos_checkout` RPC snapshots the product's `purchase_price` (which is 0 for services) onto each `invoice_items` row. Profit later = `line_total - purchase_price * quantity` = the commission the cashier entered.

When the full service-transaction UI lands (next service milestone), we will start populating the `service_*` columns on `invoice_items` (already present in migration 0001): `service_provider`, `service_direction`, `service_account_number`, `service_receiver_account`, `service_reference_no`, `service_transaction_amount`, `service_commission`, `service_total_charged`, `service_note`. Until then, the cashier should enter **only the commission** as the service line price.

## Customer credit & Ledger

The full customer ledger is live:
- Unpaid or partial invoices with linked customers automatically create a `debit` entry of type `invoice_credit` in `customer_ledger_entries` and increment `customers.outstanding_balance` atomically inside `pos_checkout`.
- Walk-in checkouts with any `balance_due > 0` are blocked atomically.
- Cashiers can record direct customer credit settlements via a clean "Receive Settlement" form on the customer detail page. This triggers the `record_credit_payment` Supabase RPC which atomically inserts a `credit_payments` row, creates a corresponding `credit` ledger entry, and decrements `outstanding_balance`, ensuring the balance never drops below zero.

## Returns / Refunds

Returns are started from `/invoices/[id]` and are invoice-linked only. Migration `0006_returns_refunds.sql` adds the atomic `create_invoice_return` RPC.

- Owner, admin, and manager roles can process returns.
- The RPC recomputes return totals from the original invoice item and blocks over-returning.
- Product returns can restore stock to the original FIFO lots and write `return_in` stock movements.
- Service refunds do not affect inventory.
- Customer debt is reduced first through a `customer_ledger_entries` refund credit, capped so outstanding balance never drops below zero.
- Paid-out refund method/reference are tracked on the return document.

## Inventory

Current behavior: `products.stock_quantity` is decremented atomically inside `pos_checkout` for `type='product'` rows only. Services never touch stock.

Physical inventory now uses FIFO across `product_stock_lots`, with `invoice_item_stock_allocations` snapshotted per sale and `stock_movements` preserving sale/restock/adjustment/return history.

## What's intentionally NOT in this milestone

- Per-payment receipts beyond the invoice view.
- Void invoice flow.
- Daily closing / Z-reports.
- Repairs workflow.
- Server-rendered PDF.

## How to start using POS

If the catalog is empty, add at least one product in **Catalog** first. Then go to **New sale** and tap a product to add it to the cart.
