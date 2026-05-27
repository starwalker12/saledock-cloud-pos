# Supplier Purchases & Supplier Ledger

Records goods received from suppliers and tracks money owed to them. Stock
purchases are **not expenses** — they convert cash (or supplier credit) into
inventory value. Profit/COGS is realised later, when the stock is sold via the
existing FIFO allocator.

## Data model (migration 0016)

- `suppliers.outstanding_balance numeric(12,2)` — running total we owe the
  supplier (mirrors `customers.outstanding_balance`).
- `supplier_purchases` — header row per goods-received event.
  - `purchase_no` is org-unique, format `PUR-NNNNNN`.
  - `status` ∈ `unpaid` | `partial` | `paid` (derived from amount_paid).
- `supplier_purchase_items` — line items, snapshot `product_name`, pointer to
  the stock lot we created.
- `supplier_payments` — payments to a supplier, optionally tied to a specific
  purchase (`purchase_id` nullable for on-account payments).
- `supplier_ledger_entries` — append-only ledger per supplier with running
  `balance_after`. Entry types: `purchase_credit`, `payment_debit`,
  `adjustment`. Direction is `credit` (we owe more) or `debit` (we owe less).

All tables are org-scoped with `current_organization_id()` RLS policies.

## RPCs

### `create_supplier_purchase`

Single transaction that:
1. Locks the supplier row.
2. Generates the next `PUR-NNNNNN` (serialised by `for update` on org row).
3. Validates each item (active physical product, qty > 0, unit_cost ≥ 0).
4. Inserts the header, items, a `product_stock_lots` row per item, matching
   `stock_movements` (type `purchase`), and bumps `products.stock_quantity`.
5. Inserts the `purchase_credit` ledger entry and bumps
   `suppliers.outstanding_balance`.
6. If `p_amount_paid > 0`, also inserts a `supplier_payments` row and a
   matching `payment_debit` ledger entry, reducing outstanding accordingly.

Returns `(purchase_id, purchase_no)`.

### `record_supplier_payment`

Standalone payment, optionally applied to a purchase:
- Validates amount > 0, amount ≤ supplier outstanding, and (if a purchase is
  provided) amount ≤ that purchase's `balance_due`.
- Inserts `supplier_payments`, `supplier_ledger_entries` (`payment_debit`).
- Decrements `suppliers.outstanding_balance`.
- If applied to a purchase, updates the purchase's `amount_paid`,
  `balance_due`, and `status`.

Returns the new `payment_id`.

Both RPCs are `security invoker` with `set search_path = public`. Execute
grants: `authenticated`, `service_role`.

## UI

| Route | Who | Notes |
|---|---|---|
| `/suppliers/purchases` | manager+ | List + filters + stat cards + supplier-dues table. |
| `/suppliers/purchases/new` | manager+ | Header + dynamic line-item builder + optional initial payment. |
| `/suppliers/purchases/[id]` | manager+ | Detail with items, payments list, "Record payment" sidebar (when balance_due > 0). |
| `/suppliers/[id]/ledger` | manager+ | Full ledger, recent purchases, recent payments, on-account payment form. |

Sidebar shows the "Purchases" link only for roles allowed by
`canManageSupplierPurchases` (owner, admin, manager). Mobile nav has the same
entry. The global search adds page-level entries plus a `supplier_purchases`
search block (matches by `purchase_no` / `reference_no`). The Suppliers search
block now links directly to `/suppliers/{id}/ledger`.

## Reports

A new **Supplier Dues & Purchases Snapshot** section on `/reports#supplier-dues`
shows month purchases, unpaid purchases, total dues, and the top 5 supplier
balances with quick links into each ledger.

## Backup / Restore

The export ZIP (`ExportData`) now includes:
- `supplierPurchases`
- `supplierPurchaseItems`
- `supplierPayments`
- `supplierLedgerEntries`

Importer support for these tables is not yet wired (offline desktop app has no
equivalent table); a future migration will add field-mapping handlers if the
desktop app gains a purchases module.

## Factory reset (migration 0017)

`reset_organization_to_factory_defaults` now also clears the four new tables.
They are deleted **before** `suppliers` and `products` because both of those
parent FK columns use `ON DELETE RESTRICT` (intentional: prevents accidental
loss of in-flight purchases when archiving a supplier or product).

## Audit log events

- `purchases.supplier_purchase.created` — recorded by
  `createSupplierPurchaseAction`.
- `purchases.supplier_payment.recorded` — recorded by
  `recordSupplierPaymentAction`.

## Permissions

New helper: `canManageSupplierPurchases(role)` — true for owner, admin,
manager. Cashiers, technicians, and viewers cannot record purchases or
payments.

## Non-goals (deferred)

- Edit / void of recorded purchases (manual SQL only for now — wrong entries
  should be reversed with a negative adjustment ledger entry).
- Supplier returns (defective stock returned to supplier).
- Per-purchase supplier discount terms / due-date tracking.
- Importing purchases from the offline desktop backup ZIP.
