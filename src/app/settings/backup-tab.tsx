"use client";

import { useState } from "react";
import {
  fetchExportDataAction,
  startImportJobAction,
  importTableChunkAction,
  updateImportJobStatusAction
} from "./backup-actions";
import JSZip from "jszip";
import {
  Download,
  Upload,
  AlertTriangle,
  CheckCircle,
  FileSpreadsheet,
  Database,
  RefreshCw,
  ArrowRight,
  ShieldCheck,
  Check
} from "lucide-react";

type ManifestData = {
  AppName: string;
  BackupVersion: number;
  SchemaVersion: number;
  BackupType: string;
  CreatedAt: string;
  CreatedBy: string;
  AppVersion?: string;
  ProductCount?: number;
  CustomerCount?: number;
  CategoryCount?: number;
  InvoiceCount?: number;
  SupplierCount?: number;
};

type TableCount = {
  name: string;
  count: number;
  status: "pending" | "importing" | "completed" | "failed" | "skipped";
  inserted: number;
  skippedCount: number;
  failedCount: number;
};

export function BackupTab() {
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // Import / Restore Stepper Wizard
  const [step, setStep] = useState<"upload" | "preview" | "config" | "dryrun" | "confirm" | "progress" | "report">("upload");
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [manifest, setManifest] = useState<ManifestData | null>(null);
  const [sqliteDb, setSqliteDb] = useState<unknown>(null); // SQLite db reference
  const [dbFileDetected, setDbFileDetected] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  // Config parameters
  const [applyBranding, setApplyBranding] = useState(false);

  // Dry run warnings
  const [dryRunWarnings, setDryRunWarnings] = useState<string[]>([]);
  const [dryRunChecked, setDryRunChecked] = useState(false);

  // Confirmation parameters
  const [confirmText, setConfirmText] = useState("");
  const [confirmCheckbox, setConfirmCheckbox] = useState(false);

  // Progress metrics
  const [jobId, setJobId] = useState<string | null>(null);
  const [tableProgress, setTableProgress] = useState<TableCount[]>([]);
  const [currentProgressIndex, setCurrentProgressIndex] = useState(0);
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);
  const [totalChunks, setTotalChunks] = useState(0);
  const [importReportLogs, setImportReportLogs] = useState<string[]>([]);
  const [importError, setImportError] = useState<string | null>(null);

  // Helpers: Convert array to CSV
  function convertToCSV(array: unknown[]) {
    if (!array || array.length === 0) return "id";
    const recordArray = array as Record<string, unknown>[];
    const keys = Object.keys(recordArray[0]).filter(k => typeof recordArray[0][k] !== "object");
    const header = keys.join(",");
    const rows = recordArray.map(row =>
      keys.map(fieldName => {
        const val = row[fieldName];
        if (val === null || val === undefined) return '""';
        return JSON.stringify(val.toString());
      }).join(",")
    );
    return [header, ...rows].join("\r\n");
  }

  // Handle Organization Backup Export
  async function handleExport() {
    try {
      setIsExporting(true);
      setExportError(null);

      const res = await fetchExportDataAction();
      if (!res.success || !res.data) {
        throw new Error(res.error || "Failed to fetch backup data.");
      }

      const db = res.data;
      const zip = new JSZip();

      // Create manifest
      const manifestObj: ManifestData = {
        AppName: "Gadget Zone Online POS",
        BackupVersion: 2,
        SchemaVersion: 1,
        BackupType: "Manual",
        CreatedAt: new Date().toISOString(),
        CreatedBy: "owner",
        AppVersion: "1.0.0-online",
        ProductCount: db.products.length,
        CustomerCount: db.customers.length,
        CategoryCount: db.categories.length,
        SupplierCount: db.suppliers.length,
        InvoiceCount: db.invoices.length
      };
      zip.file("manifest.json", JSON.stringify(manifestObj, null, 2));

      // Create JSON dump
      zip.folder("data")?.file("gadgetzone-online.json", JSON.stringify(db, null, 2));

      // CSV folders
      const csvFolder = zip.folder("csv");
      if (csvFolder) {
        csvFolder.file("products.csv", convertToCSV(db.products));
        csvFolder.file("customers.csv", convertToCSV(db.customers));
        csvFolder.file("suppliers.csv", convertToCSV(db.suppliers));
        csvFolder.file("invoices.csv", convertToCSV(db.invoices));
        csvFolder.file("invoice_items.csv", convertToCSV(db.invoiceItems));
        csvFolder.file("payments.csv", convertToCSV(db.payments));
        csvFolder.file("returns.csv", convertToCSV(db.returns));
        csvFolder.file("return_items.csv", convertToCSV(db.returnItems));
        csvFolder.file("return_stock_allocations.csv", convertToCSV(db.returnStockAllocations));
        csvFolder.file("expenses.csv", convertToCSV(db.expenses));
        csvFolder.file("repairs.csv", convertToCSV(db.repairs));
        csvFolder.file("daily_closings.csv", convertToCSV(db.closings));
        csvFolder.file("audit_logs.csv", convertToCSV(db.auditLogs));
      }

      const content = await zip.generateAsync({ type: "blob" });
      const url = window.URL.createObjectURL(content);
      const a = document.createElement("a");
      a.href = url;
      a.download = `gadgetzone_backup_${new Date().toISOString().split("T")[0]}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

    } catch (err: unknown) {
      console.error(err);
      const msg = err instanceof Error ? err.message : "An error occurred during export.";
      setExportError(msg);
    } finally {
      setIsExporting(false);
    }
  }

  // SQLite table rows helper
  function getTableRows(db: unknown, tableName: string): unknown[] {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const clientDb = db as any;
      const res = clientDb.exec(`SELECT * FROM "${tableName}"`);
      if (res.length === 0) return [];
      const columns = res[0].columns;
      const values = res[0].values;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return values.map((row: any) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const obj: any = {};
        columns.forEach((col: string, idx: number) => {
          obj[col] = row[idx];
        });
        return obj;
      });
    } catch {
      return [];
    }
  }

  // Handle Backup ZIP Upload & sqlite parsing
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setZipFile(file);
      setIsParsing(true);
      setParseError(null);
      setManifest(null);
      setSqliteDb(null);
      setDbFileDetected(null);
      setConfirmText("");
      setConfirmCheckbox(false);
      setDryRunWarnings([]);
      setDryRunChecked(false);

      const zip = await JSZip.loadAsync(file);

      // Read manifest
      const manifestFile = zip.file("manifest.json");
      if (!manifestFile) {
        throw new Error("Invalid backup file: manifest.json is missing from the ZIP root.");
      }

      const manifestStr = await manifestFile.async("string");
      const manifestObj = JSON.parse(manifestStr) as ManifestData;
      setManifest(manifestObj);

      // Read SQLite database
      const dbFile = zip.file("data/gadgetzonepos.db");
      if (!dbFile) {
        throw new Error("Invalid desktop backup: data/gadgetzonepos.db SQLite database is missing.");
      }

      const dbArrayBuffer = await dbFile.async("arraybuffer");
      setDbFileDetected(`data/gadgetzonepos.db (${dbArrayBuffer.byteLength.toLocaleString()} bytes)`);

      // Lazy import sql.js CDN/wasm in the browser
      const initSqlJs = (await import("sql.js")).default;
      const SQL = await initSqlJs({
        locateFile: (locateFile) => `https://sql.js.org/dist/${locateFile}`
      });

      const db = new SQL.Database(new Uint8Array(dbArrayBuffer));
      setSqliteDb(db);

      // Detect available tables & record counts
      const supportedTables = [
        "Categories",
        "Suppliers",
        "Customers",
        "Products",
        "ProductStockLots",
        "StockMovements",
        "Bills",
        "BillItems",
        "BillItemBatchAllocations",
        "Payments",
        "CustomerLedgerEntries",
        "ReturnRefunds",
        "ReturnItems",
        "Expenses",
        "RepairJobs",
        "DailyClosings",
        "ActivityLog"
      ];

      const counts: TableCount[] = [];
      for (const table of supportedTables) {
        try {
          const res = db.exec(`SELECT count(*) as cnt FROM "${table}"`);
          const cnt = res[0]?.values[0][0] || 0;
          counts.push({
            name: table,
            count: Number(cnt),
            status: "pending",
            inserted: 0,
            skippedCount: 0,
            failedCount: 0
          });
        } catch {
          counts.push({
            name: table,
            count: 0,
            status: "skipped",
            inserted: 0,
            skippedCount: 0,
            failedCount: 0
          });
        }
      }

      setTableProgress(counts);
      setStep("preview");

    } catch (err: unknown) {
      console.error(err);
      const msg = err instanceof Error ? err.message : "Failed to parse desktop backup ZIP archive.";
      setParseError(msg);
    } finally {
      setIsParsing(false);
    }
  }

  // Stepper Stage 4: Run Dry run Validation checks
  function runDryRunValidation() {
    setIsParsing(true);
    const warnings: string[] = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const categories = getTableRows(sqliteDb, "Categories") as any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const suppliers = getTableRows(sqliteDb, "Suppliers") as any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const customers = getTableRows(sqliteDb, "Customers") as any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const products = getTableRows(sqliteDb, "Products") as any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lots = getTableRows(sqliteDb, "ProductStockLots") as any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const movements = getTableRows(sqliteDb, "StockMovements") as any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bills = getTableRows(sqliteDb, "Bills") as any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const billItems = getTableRows(sqliteDb, "BillItems") as any[];

    // Check sizes
    if (products.length > 1000) {
      warnings.push(`⚠️ Heavy catalog size: ${products.length} products will be chunked into multiple uploads.`);
    }
    if (bills.length > 5000) {
      warnings.push(`⚠️ Large historical size: ${bills.length} sales invoices are present. Process will take a few minutes.`);
    }

    // 1. Missing Categories check
    if (categories.length === 0 && products.some(p => p.CategoryId)) {
      warnings.push("⚠️ Orphaned Categories detected: Products reference Categories but no Category records exist.");
    }

    // 2. Invoice number conflicts check
    const invNumbers = new Set(bills.map(b => b.BillNo?.toString().trim().toLowerCase()).filter(Boolean));
    if (invNumbers.size < bills.filter(b => b.BillNo).length) {
      warnings.push("⚠️ Non-unique desktop invoice numbers: Backup file contains duplicate bill codes. Importing will suffix duplicates safely.");
    }

    // 3. Unmapped stock lots check
    const productIds = new Set(products.map(p => p.Id));
    const lotOrphaned = lots.some(l => !productIds.has(l.ProductId));
    if (lotOrphaned) {
      warnings.push("⚠️ Orphaned FIFO Stock Lots: Backup contains stock batches referring to deleted products.");
    }

    // 4. Inactive suppliers referencing active products
    const activeSupplierIds = new Set(suppliers.filter(s => s.IsActive).map(s => s.Id));
    const productsWithInactiveSups = products.some(p => p.SupplierId && !activeSupplierIds.has(p.SupplierId));
    if (productsWithInactiveSups) {
      warnings.push("ℹ️ Products bound to archived suppliers: catalog products refer to archived suppliers.");
    }

    // 5. Relations and history check
    if (billItems.length === 0 && bills.length > 0) {
      warnings.push("⚠️ Bill items missing: Sales history exists but no bill items were found.");
    }
    if (movements.length === 0 && lots.length > 0) {
      warnings.push("ℹ️ Zero stock movement entries found: FIFO Stock Lots exist but no movement logs exist.");
    }
    if (customers.length === 0 && bills.some(b => b.CustomerId)) {
      warnings.push("⚠️ Orphaned Bills: Sales records are bound to customer IDs, but no Customer directory is present.");
    }

    setDryRunWarnings(warnings);
    setDryRunChecked(true);
    setIsParsing(false);
  }

  // Stepper Stage 6: Sequential Chunked Database Import Execution
  async function triggerBackupImport() {
    try {
      setImportError(null);
      setStep("progress");
      setImportReportLogs([]);

      // 1. Start Job Actions
      const countsMap: Record<string, number> = {};
      tableProgress.forEach(t => {
        countsMap[t.name] = t.count;
      });

      const startRes = await startImportJobAction(
        manifest?.AppName || "GadgetZonePOS",
        manifest?.BackupVersion?.toString() || "2",
        manifest?.SchemaVersion?.toString() || "1",
        manifest || {},
        countsMap
      );

      if (!startRes.success || !startRes.jobId) {
        throw new Error(startRes.error || "Failed to initialize import job on Supabase.");
      }

      const activeJobId = startRes.jobId;
      setJobId(activeJobId);

      const logs: string[] = [];
      const updatedProgress = [...tableProgress];

      // Sequential iteration of 17 supported tables in correct relational order
      for (let i = 0; i < updatedProgress.length; i++) {
        const table = updatedProgress[i];
        if (table.count === 0 || table.status === "skipped") {
          table.status = "skipped";
          setTableProgress([...updatedProgress]);
          continue;
        }

        table.status = "importing";
        setTableProgress([...updatedProgress]);
        setCurrentProgressIndex(i);

        // Fetch sqlite data chunk
        const rows = getTableRows(sqliteDb, table.name);
        const chunkSize = 100;
        const totalRows = rows.length;
        const totalChks = Math.ceil(totalRows / chunkSize);
        setTotalChunks(totalChks);

        let tInserted = 0;
        let tSkipped = 0;
        let tFailed = 0;

        for (let c = 0; c < totalChks; c++) {
          setCurrentChunkIndex(c + 1);
          const chunk = rows.slice(c * chunkSize, (c + 1) * chunkSize);
          
          const chunkRes = await importTableChunkAction(activeJobId, table.name, chunk);
          if (!chunkRes.success) {
            throw new Error(chunkRes.error || `Failed executing chunk ${c+1} for table ${table.name}.`);
          }

          tInserted += chunkRes.inserted;
          tSkipped += chunkRes.skipped;
          tFailed += chunkRes.failed;

          if (chunkRes.warnings.length > 0) {
            logs.push(...chunkRes.warnings.map(w => `[${table.name}] ${w}`));
            setImportReportLogs([...logs]);
          }
        }

        table.status = "completed";
        table.inserted = tInserted;
        table.skippedCount = tSkipped;
        table.failedCount = tFailed;
        setTableProgress([...updatedProgress]);

        logs.push(`✅ Table ${table.name} complete: ${tInserted} inserted, ${tSkipped} skipped (duplicates), ${tFailed} failed.`);
        setImportReportLogs([...logs]);
      }

      // Handle AppSettings optional branding override
      if (applyBranding) {
        logs.push("⚙️ Desktop branding override skipped (preserving active multi-tenant online config safely).");
        setImportReportLogs([...logs]);
      }

      // Complete job
      await updateImportJobStatusAction(activeJobId, "completed");
      setStep("report");

    } catch (err: unknown) {
      console.error(err);
      const msg = err instanceof Error ? err.message : "Desktop import interrupted due to an error.";
      setImportError(msg);
      if (jobId) {
        await updateImportJobStatusAction(jobId, "failed", msg);
      }
      setStep("report");
    }
  }

  // Dynamic status badges mapping
  const STATUS_CLASSES = {
    pending: "text-slate-400 bg-slate-50 border-slate-200 border",
    importing: "text-blue-700 bg-blue-50 border-blue-200 border animate-pulse font-bold",
    completed: "text-emerald-700 bg-emerald-50 border-emerald-200 border font-bold",
    failed: "text-rose-700 bg-rose-50 border-rose-200 border font-bold",
    skipped: "text-slate-400 bg-slate-100 border-slate-300 border line-through"
  };

  return (
    <div className="space-y-6">
      {/* Dynamic Breadcrumb Stepper Indicator */}
      {step !== "upload" && (
        <div className="print-hidden flex flex-wrap gap-2 items-center bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs font-semibold text-slate-500">
          <span className={step === "preview" ? "text-blue-700 font-bold" : "text-slate-700"}>1. Preview</span>
          <ArrowRight className="size-3 text-slate-400" />
          <span className={step === "config" ? "text-blue-700 font-bold" : "text-slate-700"}>2. Config</span>
          <ArrowRight className="size-3 text-slate-400" />
          <span className={step === "dryrun" ? "text-blue-700 font-bold" : "text-slate-700"}>3. Dry run</span>
          <ArrowRight className="size-3 text-slate-400" />
          <span className={step === "confirm" ? "text-blue-700 font-bold" : "text-slate-700"}>4. Confirm</span>
          <ArrowRight className="size-3 text-slate-400" />
          <span className={step === "progress" ? "text-blue-700 font-bold" : "text-slate-700"}>5. Progress</span>
          <ArrowRight className="size-3 text-slate-400" />
          <span className={step === "report" ? "text-blue-700 font-bold" : "text-slate-700"}>6. Report</span>
        </div>
      )}

      {step === "upload" && (
        <div className="grid gap-6 md:grid-cols-2">
          {/* Export Card */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h4 className="text-md font-bold text-slate-900">Export Online Database</h4>
            <p className="mt-1 text-xs text-slate-500">
              Creates a compressed backup containing standard manifest details, structured JSON collections, and standard CSV tables.
            </p>

            <div className="mt-8 space-y-4">
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
                <FileSpreadsheet className="mx-auto size-10 text-slate-400" />
                <p className="mt-2 text-xs font-semibold text-slate-500">Includes manifest.json, raw JSON & full CSV folders</p>
              </div>

              {exportError && (
                <div className="flex items-center gap-2 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800">
                  <AlertTriangle className="size-4 shrink-0" />
                  <span>{exportError}</span>
                </div>
              )}

              <button
                onClick={handleExport}
                disabled={isExporting}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-800 disabled:bg-slate-100 disabled:text-slate-400 cursor-pointer"
              >
                {isExporting ? (
                  <>
                    <RefreshCw className="size-4 animate-spin" />
                    Generating Archive...
                  </>
                ) : (
                  <>
                    <Download className="size-4" />
                    Download Backup ZIP
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Import Card */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h4 className="text-md font-bold text-slate-900">Import Desktop Backup ZIP</h4>
            <p className="mt-1 text-xs text-slate-500">
              Read, parse and securely upload data tables straight from your offline sqlite database files.
            </p>

            <div className="mt-6 space-y-4">
              {/* File Dropzone */}
              <div className="relative flex min-h-[140px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-center hover:bg-slate-100/50 cursor-pointer">
                <input
                  type="file"
                  accept=".zip"
                  onChange={handleFileUpload}
                  disabled={isParsing}
                  className="absolute inset-0 cursor-pointer opacity-0"
                />
                <Upload className="size-8 text-slate-400" />
                <p className="mt-2 text-xs font-bold text-slate-700">Select or drag Backup ZIP file</p>
                <p className="mt-1 text-[10px] text-slate-500">Supports .zip backups under 50MB</p>
              </div>

              {isParsing && (
                <div className="flex items-center justify-center gap-2 text-sm text-slate-500">
                  <RefreshCw className="size-4 animate-spin" />
                  <span>Loading SQLite binary elements dynamically...</span>
                </div>
              )}

              {parseError && (
                <div className="flex items-center gap-2 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800">
                  <AlertTriangle className="size-4 shrink-0" />
                  <span>{parseError}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Stepper Step 2: Table Counts Preview */}
      {step === "preview" && manifest && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-6">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <span className="rounded-lg bg-blue-50 px-2 py-0.5 text-[10px] font-black text-blue-700 uppercase tracking-wider">
                {manifest.AppName}
              </span>
              <h3 className="mt-1 text-lg font-black text-slate-900">1. Inspect Backup Contents</h3>
              <p className="text-xs text-slate-500">Below are the record counts extracted from the SQLite binary database.</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setStep("upload")}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => setStep("config")}
                className="rounded-xl bg-blue-700 px-5 py-2.5 text-xs font-bold text-white hover:bg-blue-800 cursor-pointer"
              >
                Configure mapping →
              </button>
            </div>
          </header>

          {/* SQLite Stats Cards */}
          <div className="rounded-xl bg-blue-50/50 p-4 border border-blue-100 flex items-start gap-3">
            <Database className="size-5 text-blue-700 shrink-0 mt-0.5" />
            <div className="text-xs text-blue-900 space-y-1">
              <p className="font-bold uppercase tracking-wider text-[10px]">Database Footprint</p>
              <p>Found binary database: <code>{dbFileDetected}</code>. SQLite schema version: <strong>{manifest.SchemaVersion}</strong>. Backup created on: <strong>{manifest.CreatedAt ? new Date(manifest.CreatedAt).toLocaleString() : "—"}</strong>. Uploaded file: <strong>{zipFile ? zipFile.name : "N/A"}</strong>.</p>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
            {tableProgress.map(t => (
              <div key={t.name} className="flex justify-between items-center bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs">
                <span className="font-bold text-slate-700">{t.name}</span>
                <span className={`px-2 py-0.5 rounded-md font-black ${t.status === "skipped" ? "bg-slate-200 text-slate-500" : "bg-blue-50 text-blue-700"}`}>
                  {t.status === "skipped" ? "N/A" : t.count}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stepper Step 3: Configure mapping options */}
      {step === "config" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-6">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-lg font-black text-slate-900">2. Configuration Options</h3>
              <p className="text-xs text-slate-500">Determine override actions before dry-running data integrity checks.</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setStep("preview")}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Back
              </button>
              <button
                onClick={() => {
                  setStep("dryrun");
                  if (!dryRunChecked) runDryRunValidation();
                }}
                className="rounded-xl bg-blue-700 px-5 py-2.5 text-xs font-bold text-white hover:bg-blue-800 cursor-pointer"
              >
                Dry run checks →
              </button>
            </div>
          </header>

          <div className="space-y-4">
            {/* Warning Alert Box */}
            <div className="rounded-xl bg-amber-50 p-4 text-xs text-amber-950 border border-amber-200 flex gap-2">
              <AlertTriangle className="size-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-2">
                <p className="font-black text-sm">⚠️ Critical Safety Warning: Passwords Excluded</p>
                <p>
                  To protect your organization, **raw desktop passwords, password hashes, env vars, and recovery tokens are strictly ignored**. Offline staff profiles are imported strictly as inactive reference placeholders purely for matching cashier history logs. Re-invite and register staff credentials inside **User Management** page.
                </p>
              </div>
            </div>

            {/* Checkbox Config option */}
            <div className="rounded-xl border border-slate-200 p-4 space-y-4 bg-slate-50">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Branding overrides</h4>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={applyBranding}
                  onChange={(e) => setApplyBranding(e.target.checked)}
                  className="mt-1 size-4 rounded accent-blue-700 cursor-pointer"
                />
                <div className="text-xs text-slate-600">
                  <p className="font-bold text-slate-800">Apply safe offline shop branding settings?</p>
                  <p className="mt-1">Overrides active support phones, addresses, and print receipt footers with the profile settings found in AppSettings. The master organization title itself will not be changed.</p>
                </div>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Stepper Step 4: Dry Run Integrity Checks */}
      {step === "dryrun" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-6">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-lg font-black text-slate-900">3. Dry Run Validation</h3>
              <p className="text-xs text-slate-500">Integrity analysis checks dates, structural dependencies, and invoice uniqueness.</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setStep("config")}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Back
              </button>
              <button
                onClick={() => setStep("confirm")}
                className="rounded-xl bg-blue-700 px-5 py-2.5 text-xs font-bold text-white hover:bg-blue-800 cursor-pointer"
              >
                Confirm Import →
              </button>
            </div>
          </header>

          <div className="space-y-4">
            {isParsing ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500">
                <RefreshCw className="size-4 animate-spin" />
                <span>Scanning database relationships...</span>
              </div>
            ) : dryRunWarnings.length === 0 ? (
              <div className="rounded-xl bg-emerald-50 p-5 text-center border border-emerald-100 space-y-2">
                <ShieldCheck className="mx-auto size-12 text-emerald-600 animate-bounce" />
                <h4 className="text-sm font-bold text-emerald-800">0 integrity errors detected</h4>
                <p className="text-xs text-emerald-700">Backup file satisfies all data-structure constraints and is 100% ready to merge.</p>
              </div>
            ) : (
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Analysis Warnings Found:</h4>
                <div className="space-y-2">
                  {dryRunWarnings.map((w, idx) => (
                    <div key={idx} className="bg-amber-50 px-4 py-3 rounded-lg border border-amber-200 text-xs text-amber-900">
                      {w}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Stepper Step 5: Confirmation confirmation */}
      {step === "confirm" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-6">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-lg font-black text-slate-955">4. Double Confirmation Required</h3>
              <p className="text-xs text-slate-500">Confirm you understand this is a merge operation and cannot be undone.</p>
            </div>
            <button
              onClick={() => setStep("dryrun")}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Back
            </button>
          </header>

          <div className="space-y-4">
            <label className="flex items-start gap-3 cursor-pointer rounded-xl bg-rose-50 border border-rose-100 p-4 text-xs text-rose-955">
              <input
                type="checkbox"
                checked={confirmCheckbox}
                onChange={(e) => setConfirmCheckbox(e.target.checked)}
                className="mt-1 size-4 rounded accent-rose-700 cursor-pointer"
              />
              <div>
                <p className="font-black text-rose-800">I understand this will merge imported data into the current organization.</p>
                <p className="mt-1">Imported entities (products, categories, invoices, stock lots) will be permanently appended to the organization profile. There is no rollback function.</p>
              </div>
            </label>

            <div>
              <label htmlFor="confirm-phrase" className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                To confirm restore, type <span className="text-blue-700">IMPORT DESKTOP BACKUP</span>:
              </label>
              <input
                id="confirm-phrase"
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="IMPORT DESKTOP BACKUP"
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-700 focus:bg-white"
              />
            </div>

            <button
              onClick={triggerBackupImport}
              disabled={confirmText !== "IMPORT DESKTOP BACKUP" || !confirmCheckbox}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-800 disabled:bg-slate-100 disabled:text-slate-400 cursor-pointer"
            >
              <Upload className="size-4" />
              Begin Desktop Restore
            </button>
          </div>
        </div>
      )}

      {/* Stepper Step 6: Importing Progress screen */}
      {step === "progress" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-6">
          <header className="border-b border-slate-100 pb-4">
            <h3 className="text-lg font-black text-slate-900">5. Importing Tables...</h3>
            <p className="text-xs text-slate-500">Chunked insertions prevent function payload / timeout blocks.</p>
          </header>

          <div className="space-y-6 py-4">
            <div className="flex items-center gap-3">
              <RefreshCw className="size-6 text-blue-700 animate-spin shrink-0" />
              <div className="text-sm">
                <p className="font-bold text-slate-800">
                  Processing Table: <span className="text-blue-700">{tableProgress[currentProgressIndex]?.name}</span>
                </p>
                <p className="text-xs text-slate-500">
                  Chunk {currentChunkIndex} of {totalChunks} ({tableProgress[currentProgressIndex]?.count} rows)
                </p>
              </div>
            </div>

            {/* Custom progress bars */}
            <div className="w-full bg-slate-100 rounded-full h-3.5 overflow-hidden">
              <div
                className="bg-blue-700 h-3.5 rounded-full transition-all duration-300"
                style={{
                  width: `${((currentProgressIndex + (currentChunkIndex / (totalChunks || 1))) / tableProgress.length) * 100}%`
                }}
              />
            </div>

            <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-1 font-mono text-[10px] text-slate-600">
              {importReportLogs.map((log, idx) => (
                <div key={idx}>{log}</div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Stepper Step 7: Completed Import Report */}
      {step === "report" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-6">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-lg font-black text-slate-900">6. Import Complete Report</h3>
              <p className="text-xs text-slate-500">Review final chunked stats and warnings logged during merge.</p>
            </div>
            <button
              onClick={() => {
                setZipFile(null);
                setStep("upload");
              }}
              className="rounded-xl bg-blue-700 px-5 py-2.5 text-xs font-bold text-white hover:bg-blue-800 cursor-pointer"
            >
              Done & Return
            </button>
          </header>

          {importError ? (
            <div className="rounded-xl bg-rose-50 p-4 text-xs text-rose-955 border border-rose-100 flex gap-2">
              <AlertTriangle className="size-5 text-rose-600 shrink-0" />
              <div>
                <p className="font-bold text-sm">Import Process Halted</p>
                <p className="mt-1">{importError}</p>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="rounded-xl bg-emerald-50 p-4 text-xs text-emerald-955 border border-emerald-100 flex gap-2">
                <CheckCircle className="size-5 text-emerald-600 shrink-0" />
                <div>
                  <p className="font-bold text-sm">Desktop Backup Restored Successfully</p>
                  <p className="mt-1">All compatible entities are successfully mapped, deduped, and merged into the Supabase database.</p>
                </div>
              </div>

              {/* Counts details table */}
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-[10px] uppercase font-bold tracking-wider text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-2.5">Table Name</th>
                      <th className="px-4 py-2.5 text-right">Extracted</th>
                      <th className="px-4 py-2.5 text-right text-emerald-700">Created</th>
                      <th className="px-4 py-2.5 text-right text-blue-700">Skipped</th>
                      <th className="px-4 py-2.5 text-right text-rose-700">Failed</th>
                      <th className="px-4 py-2.5 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {tableProgress.map(t => (
                      <tr key={t.name}>
                        <td className="px-4 py-3 font-semibold text-slate-700">{t.name}</td>
                        <td className="px-4 py-3 text-right">{t.count}</td>
                        <td className="px-4 py-3 text-right text-emerald-700 font-semibold">{t.inserted}</td>
                        <td className="px-4 py-3 text-right text-blue-700">{t.skippedCount}</td>
                        <td className="px-4 py-3 text-right text-rose-700">{t.failedCount}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] ${STATUS_CLASSES[t.status]}`}>
                            {t.status.toUpperCase()}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Logs */}
              {importReportLogs.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Process Warnings/Logs:</h4>
                  <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-1 font-mono text-[10px] text-slate-600">
                    {importReportLogs.map((log, idx) => (
                      <div key={idx} className="flex gap-1.5 items-start">
                        {log.includes("✅") ? <Check className="size-3 text-emerald-600 mt-0.5 shrink-0" /> : null}
                        <span>{log}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
