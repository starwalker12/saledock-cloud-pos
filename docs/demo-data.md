# Controlled Demo Data Seeding Documentation

This document describes the safe demonstration seeder engine designed to populate or clean shop records without affecting production data.

---

## Controlled Seeder Design

The demo loader tool is restricted strictly to **Owner** and **Administrator** roles. It can only be triggered after sign-in through `/settings?tab=demo-data`.

### Mock Seeding Coverage
When loaded, the seeder inserts a complete ecosystem of mock hardware store assets:
1. **Catalog:** Creates Categories (`[DEMO] Accessories`, `[DEMO] Devices`) and Suppliers (`[DEMO] Alpha Distributors`).
2. **Products & Services:**
   - Physical: USB-C Cable (cost $25, sale $45) and iPhone 14 Pro (cost $900, sale $1100).
   - Services: Screen Glass Replacement Service ($60).
3. **Inventory Batches (FIFO):** Registers FIFO stock lots (`DEMO-LOT-001`, `DEMO-LOT-002`) and opening stock movements.
4. **Customers:** Alices and Bobs populated with custom balances.
5. **Transactions:** Invoice 1 (full cash sale), Invoice 2 (partial card payment, generating customer ledger debt), and return refund logic.
6. **Operations:** Mock Utility Expenses ($85), Repair Job checkin status, status logs, and closing receipts for yesterday.
7. **Audit Logs:** Generates secure logs tracking the loading and removing actions.

---

## Double-Confirmation Safety Rails

To guarantee that demonstration files are never deployed or removed by mistake:
- **Never Auto-Run:** Seeder never triggers on deploy, server startups, or setup pages.
- **Role Verification:** Requests authenticated active context and drops the operation if user is not Owner/Admin.
- **Double-Confirmation Inputs:** Form submissions require the user to type exactly:
  - `CREATE DEMO DATA` to seed records.
  - `REMOVE DEMO DATA` to wipe records.
- **Cascade Safe Cleanups:** All demo rows are identified by the `[DEMO]` prefix or specific `INV-DEMO-`/`DEMO-` references. Removing demo data clears only tagged records using clean reverse-order deletions, preventing any modifications to real shop data.
- **Returns Schema:** Demo return/refund records use the online `returns`, `return_items`, and `return_stock_allocations` tables. Desktop backup terminology may differ and is mapped only during preview/inspection until full desktop restore is implemented.
