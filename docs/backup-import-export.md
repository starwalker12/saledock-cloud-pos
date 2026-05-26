# Backup ZIP Import & Export Documentation

This document describes the offline/online backup roundtrip schema, browser-side file parsing architecture, and data restoration safety measures implemented in the Gadget Zone Online POS project.

---

## Online Backup Export

The backup export tool packages the active organization's database records into a single portable `.zip` archive. Zipping is offloaded to the client's browser utilizing `jszip` to minimize server resource usage.

### Archive File Structure
An exported ZIP file contains the following elements:
- `/manifest.json`: Stores backup metadata (timestamp, version, counts of records).
- `/data/gadgetzone-online.json`: Full nested JSON dump containing all organizational collections.
- `/csv/products.csv`: Portable comma-separated values table for products catalog.
- `/csv/customers.csv`: Portable CSV for customer directories.
- `/csv/suppliers.csv`: Portable CSV for wholesale suppliers.
- `/csv/invoices.csv`, `/csv/invoice_items.csv`, `/csv/payments.csv`: Sales receipts tables.
- `/csv/returns.csv`, `/csv/return_items.csv`, `/csv/return_stock_allocations.csv`: Online return/refund receipts and FIFO restock trace tables.
- `/csv/expenses.csv`, `/csv/repairs.csv`, `/csv/daily_closings.csv`, `/csv/audit_logs.csv`: Operational logs.

The online schema exports return/refund records from the live `returns` table, along with `return_items` and `return_stock_allocations`. Older desktop backup names may differ; desktop SQLite uploads are parsed on-the-fly and imported completely using modern client-side worker engines.

---

## Desktop SQLite Full Import System (Completed)

Full automated desktop SQLite data ingestion has been successfully implemented and integrated:
1. **sql.js WASM Parsing**: Initialized lazy WebAssembly-compiled `sql.js` inside the browser.
2. **SQLite Buffer Reading**: Reads `gadgetzonepos.db` SQLite database file buffers completely in-memory.
3. **Structured Mapping & Chunking**: Extracts rows across all 17 supported tables (`Products`, `Categories`, `Customers`, `Suppliers`, `Bills`, `BillItems`, `Allocations`, `Ledgers`, `Payments`, `Returns`, `Expenses`, `Repairs`, `DailyClosings`, `AuditLog`) in sequential relational order.
4. **Coordinated Server Transactions**: Chunks data arrays into batches of 100 to execute secure, transaction-safe, org-scoped merges inside Supabase.

For a deep-dive into table mapping rules and dry-run validation mechanics, refer to the [Offline Backup Restore Guide](file:///Users/sw12/Projects/gadget-zone-online-pos/docs/offline-backup-restore.md).

---

## Restore Factory Defaults / Factory Reset

The system features an Owner and Admin-scoped **Factory Reset** danger zone under the Backup tab:
- **Safety Snapshot Enforced**: Requires generating and downloading a pre-reset backup ZIP before confirmation triggers.
- **Wasm/Server Integrity**: Wipes active business data cleanly across all 20 operational tables in cascading relational order while keeping tenant profiles and logins active.
- **Bulletproof Protections**: Re-authenticates user password against Supabase Auth, matches exact organization name, and requires verification phrase `RESTORE FACTORY DEFAULTS`.
- **Full Traceability**: Details deleted count statistics in the final report and leaves a permanent `settings.factory_reset_completed` event in the system audit logs.

For detailed security mechanics and cascading rules, see the [Factory Reset Guide](file:///Users/sw12/Projects/gadget-zone-online-pos/docs/factory-reset.md).

