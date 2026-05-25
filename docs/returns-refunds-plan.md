# Returns & Refunds Plan

## Scope

Returns are processed against existing invoices only. The original invoice is never deleted or rewritten; every return keeps links to the invoice and invoice items so stock, customer balances, and profit can be audited later.

## Rules

- Returns require an authenticated active profile.
- Only owner, admin, and manager roles may process returns in this foundation.
- A return line cannot exceed the original sold quantity minus quantities already returned.
- Return totals are recomputed server-side from the original invoice item. Browser totals are display hints only.
- Product returns may restock inventory. Service refunds never affect stock.
- Refund methods tracked in this milestone: cash, card, EasyPaisa, JazzCash, bank transfer.
- Partial returns are supported by quantity. Partial payout amounts are supported as long as the payout does not exceed the server-computed return subtotal.

## Stock Impact

Physical product returns use the original `invoice_item_stock_allocations` rows created by FIFO checkout.

When restock is selected:

1. The RPC restores quantity back to the original `product_stock_lots`.
2. `products.stock_quantity` is incremented.
3. A `stock_movements` row is written with `movement_type = 'return_in'`.
4. `return_stock_allocations` preserves the exact restored stock lot, quantity, and unit cost.

If the original FIFO allocation is missing or already fully restored, the return is rejected instead of guessing a lot.

## Customer Ledger Impact

If the invoice has a linked customer and the customer still has outstanding debt, the return reduces that debt first:

1. Lock the customer row.
2. Credit the smaller of the return subtotal and current outstanding balance.
3. Insert a `customer_ledger_entries` row with `entry_type = 'refund'` and `direction = 'credit'`.
4. Keep `customers.outstanding_balance` from going below zero.

Paid-out refunds are recorded on the return through `refund_amount`, `refund_method`, and `reference_number`. This milestone does not create negative rows in `payments` because the existing payments table is for money received and requires non-negative values.

## Invoice Impact

The original invoice status remains unchanged in this foundation because the current invoice enum does not include `returned` or `partially_returned`. Return status is tracked on the `returns` table. Future reporting can compute returned totals by joining returns to invoices.

## Audit Trail

Every return stores:

- return document number
- invoice link
- invoice item links
- stock-lot restoration links for products
- refund method/reference/notes
- actor and timestamp
- an `audit_logs` entry

## Deferred

- Return listing filters beyond a simple recent list.
- Exchange workflow.
- Void/cancel return workflow.
- Dedicated refund payment ledger table.
- Invoice status enum expansion for `partially_returned` / `returned`.
- Receipt/PDF for return documents.
