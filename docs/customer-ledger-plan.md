# Customer Ledger and Management Plan

This document outlines the implementation plan for the **Customer Detail**, **Edit/Archive/Restore UI**, and **Customer Ledger Foundation** modules to achieve parity with the offline Gadget Zone POS system.

---

## 1. Objectives

- **Customer Profile Detail**: Provide a central screen (`/customers/[id]`) showing the customer's full identity, contact info, notes, credit stats, invoice history, and running ledger.
- **Customer Management UI**: Expose inline/modal edit forms, archive (soft delete), and restore controls to keep the customer database clean.
- **Ledger Foundation**: Establish the database schema and ledger tracking mechanics for customer balances, settlements, invoice credit charges, advance payments, and refunds.

---

## 2. Parity Requirements

> [!IMPORTANT]
> **RLS & Security Invoker for Ledger**
> The customer ledger must be completely secure. All ledger insertions and queries will respect Supabase Row Level Security (RLS) policies scoped by `organization_id`.

> [!NOTE]
> **Running Balance Computation Rule**
> The customer's total outstanding balance is determined as:
> `Outstanding Balance = Sum of Invoices Grand Totals - Sum of Payments Received`
> This can be computed dynamically or snapshotted in a ledger table. To prevent performance bottlenecks on long histories, we will implement a dual approach:
> 1. An atomic, double-entry ledger table `customer_ledger_entries` tracking individual charges/payments.
> 2. A cached `outstanding_balance` column on the `customers` table, updated atomically via triggers or transactions.

---

## 3. Schema Changes (Proposals for Migration `0004_customer_ledger.sql`)

The database is currently missing transaction-level ledger logging and general (non-invoice-bound) customer payment entries. We propose two new tables:

### A. `customer_ledger_entries`
Tracks all financial events affecting the customer's balance.

| Column | Type | Description |
|---|---|---|
| `id` | `uuid` (PK) | Unique entry identifier. |
| `organization_id` | `uuid` (FK) | Scopes entry to organization (RLS). |
| `customer_id` | `uuid` (FK) | References the customer. |
| `type` | `text` | Enum: `charge` (invoice creation), `payment` (settlement), `adjustment` (manual correction), `refund` (returned item credit). |
| `amount` | `numeric(12,2)` | Positive for charges, negative for payments/refunds. |
| `running_balance` | `numeric(12,2)` | The calculated balance after this transaction. |
| `invoice_id` | `uuid` (FK, Nullable) | Links to the original invoice. |
| `payment_id` | `uuid` (FK, Nullable) | Links to the transaction's payment record. |
| `description` | `text` | Friendly audit description (e.g. "Charged for INV-000001", "Received cash settlement"). |
| `created_by` | `uuid` (FK) | Profile ID of the cashier. |
| `created_at` | `timestamptz` | Date of transaction. |

### B. `public.payments` (Enhancements for General Settlements)
Currently, `payments` requires a direct `invoice_id`. We will modify the column constraints of `payments.invoice_id` to be **nullable** so cashiers can record general account-level payments (advances or general balance settlements) that are not bound to a single invoice.

---

## 4. Workflows

### A. Invoice Charge Creation
- When an invoice is created via `pos_checkout`:
  - If a customer is linked (`customer_id is not null`):
    1. A ledger entry of type `charge` with `amount = grand_total` is created.
    2. If `amount_paid > 0`, a ledger entry of type `payment` with `amount = -amount_paid` is created.
    3. The customer's `outstanding_balance` cache is incremented by `grand_total - amount_paid`.

### B. General Account Settlement
- Cashier goes to `/customers/[id]` -> **Receive Payment**.
- Modal fields: **Amount**, **Payment Method**, **Reference No (optional)**, **Note**.
- Execution (Atomic SQL Transaction):
  1. Insert into `public.payments` with `invoice_id = null`, `customer_id = customer_id`, and `amount = entered_amount`.
  2. Insert into `customer_ledger_entries` with `type = 'payment'`, `amount = -entered_amount`, and link to the new payment.
  3. Update customer's `outstanding_balance` cache by subtracting `entered_amount`.
  4. (Optional FIFO Settlement): Automatically allocate the paid amount to the oldest unpaid/partial invoices by subtracting from their `balance_due` and updating their statuses until the paid amount is exhausted.

### C. Advance Payments
- If a customer pays *more* than their current debt, the ledger records a negative balance.
- This creates a customer credit advance (pre-payment).
- During future POS checkouts, the customer can choose `customer_credit` as a payment method, which acts as a ledger `charge` (deducting from their advance balance).

### D. Returns and Refunds
- When an invoice item is returned:
  - If a customer is linked and has an outstanding balance, the system inserts a ledger entry of type `refund` with direction `credit`.
  - The credit is capped at the current outstanding balance so `customers.outstanding_balance` never drops below zero.
  - Paid-out refund method/reference are tracked on the `returns` table rather than as negative `payments` rows.

---

## 5. UI Layout Design

### A. Customer Detail Page (`/customers/[id]`)
- **Header Card**:
  - Customer Name, Phone, Email, Address.
  - Credit Limit info and dynamic progress bar of credit limit usage.
  - Quick buttons: **Edit Details**, **Receive Payment**, **Archive**.
- **Stats Row**:
  - Total Purchased (all-time grand totals).
  - Active Balance (red if owing, green if in advance credit).
  - Open Invoices Count.
- **Invoices Tab**:
  - Filterable list of invoices. Shows status (Paid, Unpaid, Partial), dates, grand totals, and balances due.
- **Ledger Tab**:
  - Clean chronological ledger grid: Date, Type, Description, Ref (Invoice/Payment No), Amount, and Running Balance.

---

## 6. Verification & Test Plan

- **Automatic Tests**:
  - Seed 1 customer with Rs. 10,000 credit limit.
  - Run checkout of Rs. 3,000 with Rs. 1,000 paid. Verify customer balance is Rs. 2,000.
  - Receive account payment of Rs. 2,500. Verify customer balance is -Rs. 500 (advance credit).
  - Run checkout of Rs. 400 using `customer_credit`. Verify balance becomes -Rs. 100.
- **Manual Verification**:
  - Visually verify progress indicators and styling on `/customers/[id]`.
