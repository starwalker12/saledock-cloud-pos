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

The online schema exports return/refund records from the live `returns` table, along with `return_items` and `return_stock_allocations`. Older desktop backup names may differ; desktop SQLite uploads are parsed on-the-fly and mapped safely during preview.

---

## Desktop SQLite Preview Foundation

Desktop SQLite backup inspection has been implemented as a browser-safe preview foundation:
1. **Local sql.js WASM Parsing**: Initializes lazy WebAssembly-compiled `sql.js` inside the browser using the app-hosted `/sql-wasm.wasm` asset.
2. **SQLite Buffer Reading**: Reads `gadgetzonepos.db` SQLite database file buffers completely in-memory.
3. **Nested ZIP Traversal**: Finds `gadgetzonepos.db` even when the desktop ZIP is wrapped inside another folder or archive structure.
4. **Preview and Mapping**: Extracts row counts across supported desktop tables (`Products`, `Categories`, `Customers`, `Suppliers`, `Bills`, `BillItems`, `Allocations`, `Ledgers`, `Payments`, `Returns`, `Expenses`, `Repairs`, `DailyClosings`, `AuditLog`) before importing data.
5. **Guarded Additive Import**: Owners and admins can continue through dry-run, orphan handling, double confirmation, and chunked additive import. The operation has no automatic rollback and must be tested on staging first.

CDN WASM loading was removed because production browsers can block or fail cross-origin WASM fetches. Serving `public/sql-wasm.wasm` from the same Vercel deployment keeps desktop backup previews stable and makes missing-parser errors diagnosable.

For a deep-dive into table mapping rules and dry-run validation mechanics, refer to the [Offline Backup Restore Guide](offline-backup-restore.md).

---

## Restore Factory Defaults / Factory Reset

The system features an Owner-only **Factory Reset** danger zone under the Backup tab:
- **Safety Snapshot Enforced**: Requires generating and downloading a pre-reset backup ZIP before confirmation triggers.
- **Wasm/Server Integrity**: Wipes the RPC's current organization-scoped operational datasets in foreign-key-safe order while keeping tenant profiles and logins active.
- **Bulletproof Protections**: Re-authenticates user password against Supabase Auth, matches exact organization name, and requires verification phrase `RESTORE FACTORY DEFAULTS`.
- **Full Traceability**: Details deleted count statistics in the final report and leaves a permanent `settings.factory_reset_completed` event in the system audit logs.

For detailed security mechanics and cascading rules, see the [Factory Reset Guide](factory-reset.md).

---

## 📦 ZIP Ingestion Specs & Nested Archive Traversal

The system includes a robust client-side ZIP classifier that handles both online backups and desktop SQLite exports, supporting arbitrary nesting (e.g. from macOS/Windows folder-wrapping compression tools).

### 1. Robust ZIP Classifier
During file upload, the archive is inspected using JSZip and classified into one of three formats:
* **Online Backup ZIP (`online`)**:
  * Identified by the presence of `data/gadgetzone-online.json` (at root or nested), or a `manifest.json` whose `AppName` includes `"Gadget Zone Online POS"`.
  * The interface parses the JSON structure dynamically and previews collections and record counts.
  * The same guarded dry-run and additive import flow is used after the archive is previewed.
* **Desktop SQLite Backup ZIP (`desktop`)**:
  * Identified by the presence of `data/gadgetzonepos.db` or `gadgetzonepos.db` (at root or nested).
  * Relies on a recursive key scanner `findZipEntryBySuffix` to automatically traverse nested top-level wrappers (e.g., `BackupFolder/data/gadgetzonepos.db`).
* **Unsupported ZIP (`unknown`)**:
  * Throws a user-friendly error: *"Unsupported ZIP. Expected either data/gadgetzone-online.json or data/gadgetzonepos.db."*

### 2. Missing Manifest Fallback (Desktop SQLite)
If `manifest.json` is missing from the ZIP:
* The system does **not** crash or fail the upload.
* The system inspects the in-memory SQLite schema using WebAssembly and extracts real row counts across all tables.
* A fallback manifest is dynamically generated on-the-fly with:
  * `BackupType: "DesktopSQLite"`
  * `Source: [Inferred file name]`
  * `CreatedAt: [Current preview timestamp]`
  * `Table counts` from the SQLite database
* A visible warning is displayed in the preview UI:
  *"manifest.json was not found, but a GadgetZonePOS SQLite database was detected and can be previewed."*

### 3. Production Import Safety Warning
> [!WARNING]
> **Production Safety Warnings:**
> - Importing backups is a permanent append/merge operation. It is recommended to perform imports only on staging environments first.
> - Never run factory resets or destructive database merges on live multi-tenant production systems without an offline pre-reset ZIP snapshot safely downloaded first.

---

## Orphan-row Handling (Required Before Final Import)

The desktop SQLite sometimes contains rows whose parent record was deleted on the desktop side without a cascade (e.g. test customers were removed but their ledger entries weren't). These rows would fail to import cleanly into the online schema because the online tables enforce foreign-key constraints.

### Detected during dry-run

The dry-run validator inspects the SQLite for these orphan patterns:

- `CustomerLedgerEntries.CustomerId` not in `Customers`
- `CreditPayments.CustomerId` not in `Customers`
- `ReturnRefunds.BillId` not in `Bills`
- `ReturnItems.ReturnId` not in `ReturnRefunds`
- `BillItems.BillId` not in `Bills`
- `BillItemBatchAllocations.BillItemId` not in `BillItems`
- `StockMovements.ProductId` not in `Products`
- `ProductStockLots.ProductId` not in `Products`
- `RepairJobs.CustomerId` not in `Customers` (walk-in `CustomerId=0/null` is allowed)

For each affected table, the wizard shows: table name, orphan count, missing source IDs (first 12), and a recommended action.

### Required choice (UI)

When any orphan rows are detected, the **Confirm Import →** button stays disabled until the user picks one of:

1. **Drop orphan rows and continue import** — these rows are filtered out of the upload. They appear in the final report under a *Skipped orphan* column. The import succeeds for the rest of the data.
2. **Stop import and fix the desktop backup first** — disables the import button entirely. Fix the source SQLite (or re-export from the desktop app) and re-upload.

### Why no automatic placeholders

The wizard intentionally does **not** create placeholder customers or returns to absorb orphans. Doing so would surface as `[Imported #N]` rows in production with no business context. For old desktop test leftovers (the typical case), dropping is the correct outcome — placeholders would clutter the live customer directory.

### Server-side enforcement (defence in depth)

`importTableChunkAction` re-runs the orphan check against the row mappings already inserted for parent tables in the current job. The behaviour is:

- `orphanPolicy = "drop"` — orphan rows are silently filtered out of the chunk and counted as `skippedOrphan`. A warning is appended to the audit log.
- `orphanPolicy = "stop"` or missing — the action returns an error and no rows in the chunk are written. The wizard surfaces this error in red on the report screen.

The orphan policy and the per-table orphan summary are also written to the import job's `manifest_jsonb` field under `OnlineImport`, so the audit log records exactly what was dropped.

### Final report

The Import Complete table now shows: **Extracted**, **Created**, **Skipped existing**, **Skipped orphan**, **Failed**, **Status**.

---

## Field Mapping Reference (Desktop → Online)

Desktop SQLite uses PascalCase that doesn't match the online snake_case schema. The importer uses the `pickString` / `pickNumber` / `pickBool` helpers with a key-list fallback so cross-version desktop dumps still work.

| Desktop column | Online column | Notes |
|---|---|---|
| `Products.ItemName` | `products.name` | First-tried key; falls back to `ProductName`, `Name`. |
| `Products.Category` (text) | `products.category_id` | Resolved by looking up `product_categories.name` (lowercased). Desktop has no `CategoryId` on Products. |
| `Products.Stock` | `products.stock_quantity` | Falls back to `StockQuantity`. |
| `Products.MinimumStock` | `products.minimum_stock` | Falls back to `MinStock`. |
| `Products.PurchasePrice` / `SalePrice` | identical mapping | |
| `Products.Type` | `products.type` | Normalised: `"Service"` → `service`, else `product`. |
| `Bills.BillDate` | `invoices.invoice_date` + `invoices.created_at` | Falls back to `Date`, `InvoiceDate`, `CreatedAt`. |
| `Bills.PaymentStatus` | `invoices.status` | Normalised: `"Paid"` → `paid`, `"Partial"` → `partial`, `"Credit"`/`"Unpaid"` → `unpaid`. Unknown values derived from `AmountPaid`/`GrandTotal`/`BalanceDue`. |
| `Bills.PaymentMethod` | (payment row, `payments.method`) | Normalised: `"Cash"` → `cash`, `"Card"` → `card`, `"EasyPaisa"` → `easypaisa`, `"JazzCash"` → `jazzcash`, `"Bank Transfer"` → `bank_transfer`. Unknown → `cash` with warning. |
| `BillItems.Qty` | `invoice_items.quantity` | Falls back to `Quantity`. |
| `BillItems.Price` | `invoice_items.unit_price` | Falls back to `UnitPrice`, `SalePrice`. |
| `BillItems.IsServiceTransaction` | `invoice_items.product_type` | `true` → `service`, else `product`. |
| `BillItemBatchAllocations.Qty` | `invoice_item_stock_allocations.quantity` | Was the source of a previous import bug. |
| `ReturnRefunds.Status` | `returns.status` | Normalised to online enum `completed` / `cancelled` only. |
| `ReturnRefunds.RefundMethod` | `returns.refund_method` | Normalised; collapsed to `cash` if a method isn't in the online refund enum. |
| `ReturnItems.QtyReturned` | `return_items.quantity` | Falls back to `Qty`. |
| `RepairJobs.Status` | `repairs.status` | Normalised: `"InProgress"` → `in_progress`, etc. |
| `RepairJobs.PaymentMethod` | `repairs.payment_method` | Normalised. |
| `Users.PasswordHash` / `RecoveryCodeHash` | **skipped** | Auth secrets are never imported. Staff must be invited via `/users`. |

---

## Cleaning Up After a Failed Import Attempt

If a previous import partially wrote audit-log rows (e.g. an old run that inserted 211 `ActivityLog` rows even though no business data made it in), you can identify and remove only those rows by filtering on the failed import job's `id`. The wizard does **not** auto-delete; this is documented as a one-time SQL recipe so you can review the rows first.

1. List recent import jobs:
   ```sql
   select id, source_app, started_at, completed_at, status
     from import_jobs
     where organization_id = '<your-org-id>'
     order by started_at desc
     limit 10;
   ```
2. For each failed job you want to clean up, inspect the audit logs it produced:
   ```sql
   select id, module, action, created_at
     from audit_logs
     where organization_id = '<your-org-id>'
       and metadata->>'import_job_id' = '<failed-job-id>';
   ```
3. If you're satisfied they're orphans of the failed run, delete them — scoped strictly by that job ID:
   ```sql
   delete from audit_logs
     where organization_id = '<your-org-id>'
       and metadata->>'import_job_id' = '<failed-job-id>';
   delete from import_row_mappings where import_job_id = '<failed-job-id>';
   delete from import_jobs where id = '<failed-job-id>';
   ```

The wizard does **not** offer an automated "Remove failed import" button yet — adding one safely needs to enumerate every dependent table per import job, which is a larger feature. Until then, run the recipe above against the Supabase SQL editor (owner-only).
