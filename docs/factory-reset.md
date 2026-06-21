# Restore Factory Defaults / Factory Reset

The **Restore Factory Defaults / Factory Reset** module provides an Owner-only tool inside the online POS to wipe historical business data securely for the current organization while maintaining structural, identity, and security safety boundaries.

---

## 🔒 Security Hardening & Gatekeepers

To prevent accidental triggers or malicious sweeps, the factory reset process enforces the following validation checks:

1. **Role Access Restriction**:
   * Enforced strictly server-side. Only the shop `owner` is permitted.
2. **Re-Authentication of Current Session**:
   * The active user must enter their current login password. This password is verified server-side directly against the Supabase Auth system (`supabase.auth.signInWithPassword`) to re-confirm identity before any transactional wipe.
3. **Double Confirmations**:
   * Checks mandatory acknowledgement checkboxes:
     * *I downloaded/saved the safety backup.*
     * *I understand this operation cannot be undone.*
     * *I understand all staff logs, repairs, sales, and catalog rows will be removed.*
4. **Validation Fields**:
   * **Organization Name**: The user must type their exact Organization Name (e.g. `Gadget Zone`).
   * **Verification Phrase**: The user must type the exact string: `RESTORE FACTORY DEFAULTS`.

---

## 💾 Pre-Reset Safety Backup Enforcer

* The wizard stepper prevents final confirmation until the operator executes the **Download Pre-Reset Backup** action.
* Clicking the download triggers a full client-side JSON/CSV `.zip` export containing all active database tables (Categories, Suppliers, Products, Invoices, Repairs, Ledger rows, etc.) to guarantee that historical data can be recovered or referenced offline if needed.
* An audit log event `backup.pre_reset_export_created` is registered at this step.

---

## ⚙️ Technical Deletion Flow

Once verified, the server action invokes the Postgres RPC function `reset_organization_to_factory_defaults`:

```mermaid
graph TD
    A[Wipe Request] --> B[Verify Owner Role]
    B --> C[Re-authenticate Password with Supabase Auth]
    C --> D[Ensure Org Name Matches]
    D --> E[Enforce Verified Phrase]
    E --> F[Invoke RPC Transaction]
    F --> G[Safe Cascading Table Wipe]
    G --> H[Reset App Settings Optional]
    H --> I[Insert Reset Audit Log]
    I --> J[Return Deletion Row Counts]
```

### 1. Database Cascading Deletion Order
The function clears rows strictly bounded by `organization_id` using a safe cascade sequence to satisfy database foreign key integrity:
1. `return_stock_allocations`
2. `return_items`
3. `returns`
4. `supplier_ledger_entries`
5. `supplier_payments`
6. `supplier_purchase_items`
7. `supplier_purchases`
8. `loss_prevention_events`
9. `cash_shifts`
10. `staff_permissions`
11. `invoice_item_stock_allocations`
12. `stock_movements`
13. `product_stock_lots` (FIFO batches)
14. `payments`
15. `invoice_items`
16. `invoices`
17. `customer_ledger_entries`
18. `repair_status_history`
19. `repairs`
20. `expenses`
21. `daily_closings`
22. `products`
23. `product_categories`
24. `supplier_write_offs`
25. `suppliers`
26. `credit_payments`
27. `customer_write_offs`
28. `customers`
29. `import_row_mappings`
30. `import_jobs`

### 2. What is Preserved
* **Auth Credentials**: Raw logins and user accounts in `supabase.users` are **never** deleted.
* **Profiles**: Existing user profiles remain intact; only the Owner can authorize the reset.
* **Tenancy**: The parent `organizations` row and `branches` tables are preserved.
* **Final Audit Event**: A final log entry `settings.factory_reset_completed` is injected to maintain a permanent audit trail.

---

## 📈 Audit Event Log

Every reset operation registers clear activity markers in the system logs:
* `backup.pre_reset_export_created`: Recorded when the pre-reset safety backup archive download is initiated.
* `settings.factory_reset_completed`: Recorded once the Postgres RPC finishes wiping all organization datasets.
