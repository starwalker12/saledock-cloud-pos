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

The online schema exports return/refund records from the live `returns` table, along with `return_items` and `return_stock_allocations`. Older desktop backup names may differ; desktop SQLite uploads remain preview/inspection-only until the future desktop mapping phase.

### Security Restrictions
During backup generation, the system explicitly strips out:
- Secrets, credentials, env vars, or service keys.
- User password hashes or Recovery Codes.
- Invitation tokens or OAuth payloads.

---

## Backup ZIP Import & Restore

The import tool supports parsing both online backup archives and native desktop offline backups in the client browser.

### Browser-side ZIP Parsing Flow
1. **ZIP Extraction:** JSZip extracts and reads `manifest.json` asynchronously.
2. **Format Inspection:** If `manifest.json` is missing, the file is rejected. If `data/gadgetzonepos.db` (SQLite) is detected, the browser identifies it as a desktop backup format and shows a detailed metadata inspector.
3. **Table & Count Visualizer:** Displays App Name, Backup Version, Creation Date, and the counts of restorable items (Products, Customers, Categories, Suppliers) discovered in the backup.
4. **Interactive Mapping Preview:** Summarizes table collections before actual database ingestion.

### Deduplication and Collision Safety
To prevent duplicate records during import, the server action `importDataAction` performs multi-key mapping:
- **Categories:** Matched by lowercased name. Reuse existing ID if found.
- **Suppliers:** Matched by lowercased name. Reuse existing ID if found.
- **Customers:** Matched by unique combo of lowercased name + phone number.
- **Products:** Matched by SKUs (case-insensitive) or lowercased product names.

---

## Desktop to Online SQL Migration Path (Future Phase)

For full desktop databases (`data/gadgetzonepos.db` containing complex relationships), the current MVP provides table list inspection and count preview.
Full automated desktop SQLite data ingestion is planned for Phase 2:
1. Initialize WebAssembly-compiled `sql.js` in the browser page.
2. Read `gadgetzonepos.db` file buffer in-memory.
3. Execute SQLite queries to extract rows from desktop tables: `Products`, `Categories`, `Customers`, `Suppliers`, and `Bills`.
4. Send clean structured JSON arrays to our server actions for secure transaction-safe inserts inside Supabase.
