"use client";

import { useState } from "react";
import {
  fetchExportDataAction,
  startImportJobAction,
  importTableChunkAction,
  updateImportJobStatusAction,
  previewFactoryResetAction,
  restoreFactoryDefaultsAction
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
  Check,
  Lock,
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
  Source?: string;
};

type BackupZipKind = "online" | "desktop" | "unknown";

type TableCount = {
  name: string;
  count: number;
  status: "pending" | "importing" | "completed" | "failed" | "skipped";
  inserted: number;
  skippedCount: number;
  failedCount: number;
  skippedOrphanCount?: number;
};

type OrphanFinding = {
  table: string;
  count: number;
  missingIds: (number | string)[];
  rule: string;
  recommendedAction: string;
};

type OrphanPolicy = "drop" | "stop";

export function BackupTab({ backupImportEnabled = true, factoryResetEnabled = true }: { backupImportEnabled?: boolean; factoryResetEnabled?: boolean }) {
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
  const [isOnlineBackup, setIsOnlineBackup] = useState(false);
  const [manifestMissingWarning, setManifestMissingWarning] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [onlineData, setOnlineData] = useState<any>(null);

  // Config parameters
  const [applyBranding, setApplyBranding] = useState(false);
  const [importActivityLog, setImportActivityLog] = useState(false);

  // Dry run warnings
  const [dryRunWarnings, setDryRunWarnings] = useState<string[]>([]);
  const [dryRunChecked, setDryRunChecked] = useState(false);
  // Orphan rows detected during dry-run + the per-table orphan ID sets we
  // use to filter chunks before upload when the user picks "drop".
  const [orphanFindings, setOrphanFindings] = useState<OrphanFinding[]>([]);
  const [orphanIdsByTable, setOrphanIdsByTable] = useState<
    Record<string, Set<number | string>>
  >({});
  const [orphanPolicy, setOrphanPolicy] = useState<OrphanPolicy | null>(null);
  // Hard mapping-failure blockers — these prevent the Confirm button from
  // becoming clickable even if the orphan policy is set. They surface in
  // the dry-run UI as red error chips (not warnings).
  const [dryRunBlockers, setDryRunBlockers] = useState<string[]>([]);

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

  // Factory Reset modal/stepper states
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [resetStep, setResetStep] = useState<"preview" | "backup" | "confirm" | "resetting" | "done">("preview");
  const [previewCounts, setPreviewCounts] = useState<Record<string, number> | null>(null);
  const [deletedCounts, setDeletedCounts] = useState<Record<string, number> | null>(null);
  const [isFetchingPreview, setIsFetchingPreview] = useState(false);

  // Checkboxes & inputs
  const [checkboxBackupDownloaded, setCheckboxBackupDownloaded] = useState(false);
  const [checkboxCannotBeUndone, setCheckboxCannotBeUndone] = useState(false);
  const [checkboxDataRemoved, setCheckboxDataRemoved] = useState(false);
  const [typedShopName, setTypedShopName] = useState("");
  const [typedPassword, setTypedPassword] = useState("");
  const [typedConfirmationPhrase, setTypedConfirmationPhrase] = useState("");
  const [resetBrandingSettings, setResetBrandingSettings] = useState(false);
  const [resettingError, setResettingError] = useState<string | null>(null);

  // Open Factory Reset and fetch preview details
  async function openFactoryResetFlow() {
    setIsResetModalOpen(true);
    setResetStep("preview");
    setPreviewCounts(null);
    setDeletedCounts(null);
    setCheckboxBackupDownloaded(false);
    setCheckboxCannotBeUndone(false);
    setCheckboxDataRemoved(false);
    setTypedShopName("");
    setTypedPassword("");
    setTypedConfirmationPhrase("");
    setResetBrandingSettings(false);
    setResettingError(null);
    await fetchResetPreview();
  }

  async function fetchResetPreview() {
    try {
      setIsFetchingPreview(true);
      setResettingError(null);
      const res = await previewFactoryResetAction();
      if (res.success && res.counts) {
        setPreviewCounts(res.counts);
      } else {
        setResettingError(res.error || "Failed to load database stats.");
      }
    } catch (err: unknown) {
      console.error(err);
      setResettingError("An unexpected error occurred reading database counts.");
    } finally {
      setIsFetchingPreview(false);
    }
  }

  // Trigger destructive factory reset
  async function triggerFactoryReset() {
    try {
      setResettingError(null);
      setResetStep("resetting");

      const res = await restoreFactoryDefaultsAction(
        typedPassword,
        typedShopName,
        resetBrandingSettings
      );

      if (res.success && res.counts) {
        setDeletedCounts(res.counts);
        setResetStep("done");
      } else {
        setResettingError(res.error || "Wipe process failed.");
        setResetStep("confirm");
      }
    } catch (err: unknown) {
      console.error(err);
      const msg = err instanceof Error ? err.message : "An unexpected error occurred during factory reset.";
      setResettingError(msg);
      setResetStep("confirm");
    }
  }

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
        AppName: "SaleDock Cloud POS",
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

  // Helper to find ZIP entries recursively by suffix
  function findZipEntryBySuffix(zip: JSZip, suffixes: string[]) {
    const keys = Object.keys(zip.files);
    for (const suffix of suffixes) {
      const matchedKey = keys.find(k => k === suffix || k.endsWith("/" + suffix) || k.endsWith(suffix));
      if (matchedKey) {
        return { entry: zip.files[matchedKey], path: matchedKey };
      }
    }
    return null;
  }

  // Handle Backup ZIP Upload & sqlite parsing
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    let detectedZipKind: BackupZipKind = "unknown";
    let detectedBackupPath = "not detected";
    const wasmPath = "/sql-wasm.wasm";

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
      setOrphanFindings([]);
      setOrphanIdsByTable({});
      setOrphanPolicy(null);
      setDryRunBlockers([]);
      setIsOnlineBackup(false);
      setOnlineData(null);
      setManifestMissingWarning(false);

      const zip = await JSZip.loadAsync(file);

      // Find possible manifest.json anywhere in the zip
      let manifestObj: ManifestData | null = null;
      const manifestMatch = findZipEntryBySuffix(zip, ["manifest.json"]);
      if (manifestMatch) {
        try {
          const manifestStr = await manifestMatch.entry.async("string");
          manifestObj = JSON.parse(manifestStr) as ManifestData;
        } catch (e) {
          console.error("Failed to parse manifest.json:", e);
        }
      }

      // Check online json and sqlite db matches (handling nesting)
      const onlineJsonMatch = findZipEntryBySuffix(zip, ["data/gadgetzone-online.json", "gadgetzone-online.json"]);
      const dbFileMatch = findZipEntryBySuffix(zip, ["data/gadgetzonepos.db", "gadgetzonepos.db"]);

      // Classify ZIP kind
      let zipKind: BackupZipKind = "unknown";
      if (onlineJsonMatch || (manifestObj && (manifestObj.AppName?.includes("Gadget Zone Online POS") || manifestObj.AppName?.includes("SaleDock Cloud POS")))) {
        zipKind = "online";
      } else if (dbFileMatch) {
        zipKind = "desktop";
      }
      detectedZipKind = zipKind;
      detectedBackupPath = onlineJsonMatch?.path ?? dbFileMatch?.path ?? "not detected";

      if (zipKind === "unknown") {
        throw new Error("Unsupported ZIP. Expected either data/gadgetzone-online.json or data/gadgetzonepos.db.");
      }

      if (zipKind === "online") {
        setIsOnlineBackup(true);
        if (!onlineJsonMatch) {
          throw new Error("Online backup detected. Use Online Restore Preview.");
        }

        if (!manifestObj) {
          manifestObj = {
        AppName: "SaleDock Cloud POS",
            BackupVersion: 2,
            SchemaVersion: 1,
            BackupType: "OnlineBackup",
            CreatedAt: new Date().toISOString(),
            CreatedBy: "unknown",
            Source: file.name
          };
        }
        setManifest(manifestObj);

        const onlineDataStr = await onlineJsonMatch.entry.async("string");
        const onlineData = JSON.parse(onlineDataStr);

        const keyToTableName: Record<string, string> = {
          categories: "Categories",
          suppliers: "Suppliers",
          customers: "Customers",
          products: "Products",
          lots: "ProductStockLots",
          movements: "StockMovements",
          invoices: "Bills",
          invoiceItems: "BillItems",
          payments: "Payments",
          ledgerEntries: "CustomerLedgerEntries",
          returns: "ReturnRefunds",
          returnItems: "ReturnItems",
          expenses: "Expenses",
          repairs: "RepairJobs",
          closings: "DailyClosings",
          auditLogs: "ActivityLog"
        };

        const counts: TableCount[] = [];
        for (const [key, tableName] of Object.entries(keyToTableName)) {
          const list = onlineData[key];
          const count = Array.isArray(list) ? list.length : 0;
          counts.push({
            name: tableName,
            count,
            status: count > 0 ? "pending" : "skipped",
            inserted: 0,
            skippedCount: 0,
            failedCount: 0,
            skippedOrphanCount: 0
          });
        }

        setOnlineData(onlineData);
        setTableProgress(counts);
        setDbFileDetected(`Online JSON found at: ${onlineJsonMatch.path}`);
        setStep("preview");
        return;
      }

      // Desktop SQLite Flow
      if (zipKind === "desktop") {
        if (!dbFileMatch) {
          throw new Error("Desktop SQLite database detected inside nested folder.");
        }

        const dbArrayBuffer = await dbFileMatch.entry.async("arraybuffer");
        setDbFileDetected(`SQLite database found at: ${dbFileMatch.path}`);

        const wasmProbe = await fetch(wasmPath, { method: "GET" });
        if (!wasmProbe.ok) {
          throw new Error("SQLite parser asset is missing. Please redeploy the app with sql-wasm.wasm included.");
        }

        // Lazy import sql.js and load its WASM from our own public asset.
        const initSqlJs = (await import("sql.js")).default;
        const SQL = await initSqlJs({
          locateFile: () => wasmPath
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
        const tableCountsRecord: Record<string, number> = {};
        for (const table of supportedTables) {
          try {
            const res = db.exec(`SELECT count(*) as cnt FROM "${table}"`);
            const cnt = res[0]?.values[0][0] || 0;
            const countNum = Number(cnt);
            tableCountsRecord[table] = countNum;
            counts.push({
              name: table,
              count: countNum,
              status: countNum > 0 ? "pending" : "skipped",
              inserted: 0,
              skippedCount: 0,
              failedCount: 0,
              skippedOrphanCount: 0
            });
          } catch {
            tableCountsRecord[table] = 0;
            counts.push({
              name: table,
              count: 0,
              status: "skipped",
              inserted: 0,
              skippedCount: 0,
              failedCount: 0,
              skippedOrphanCount: 0
            });
          }
        }

        setTableProgress(counts);

        // Generate fallback manifest if manifest.json is missing
        if (!manifestMatch || !manifestObj) {
          setManifestMissingWarning(true);
          manifestObj = {
            AppName: "GadgetZonePOS",
            BackupVersion: 2,
            SchemaVersion: 1,
            BackupType: "DesktopSQLite",
            Source: file.name,
            CreatedAt: new Date().toISOString(),
            CreatedBy: "inferred",
            ProductCount: tableCountsRecord["Products"] || 0,
            CustomerCount: tableCountsRecord["Customers"] || 0,
            CategoryCount: tableCountsRecord["Categories"] || 0,
            SupplierCount: tableCountsRecord["Suppliers"] || 0,
            InvoiceCount: tableCountsRecord["Bills"] || 0
          };
        }
        setManifest(manifestObj);
        setStep("preview");
      }

    } catch (err: unknown) {
      console.error(err);
      const msg = err instanceof Error ? err.message : "Failed to parse backup ZIP archive.";
      const friendlyDetails = [
        `File: ${file.name}`,
        `Detected backup type: ${detectedZipKind}`,
        `Detected backup path: ${detectedBackupPath}`,
        `SQLite WASM path: ${wasmPath}`,
        "No data was imported.",
      ];
      const friendlyMessage = msg.includes("SQLite parser asset")
        ? `${msg}\n${friendlyDetails.join("\n")}`
        : `Could not preview backup ZIP. ${msg}\n${friendlyDetails.join("\n")}`;
      setParseError(friendlyMessage);
    } finally {
      setIsParsing(false);
    }
  }

  // Stepper Stage 4: Run Dry run Validation checks
  function runDryRunValidation() {
    if (isOnlineBackup) {
      setDryRunWarnings([]);
      setDryRunChecked(true);
      setOrphanFindings([]);
      setOrphanIdsByTable({});
      setOrphanPolicy(null);
      return;
    }
    setIsParsing(true);
    // Reset orphan state for every fresh dry-run pass.
    setOrphanFindings([]);
    setOrphanIdsByTable({});
    setOrphanPolicy(null);
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

    // ====================================================================
    // Structured orphan detection: rows whose parent record is missing.
    // These rows cannot be imported without manual mapping. We collect them
    // here, surface them in a required-choice card in the UI, and remove
    // them from each chunk before upload if the user picks "drop".
    // ====================================================================
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ledger = getTableRows(sqliteDb, "CustomerLedgerEntries") as any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const creditPayments = getTableRows(sqliteDb, "CreditPayments") as any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const returnRefunds = getTableRows(sqliteDb, "ReturnRefunds") as any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const returnItems = getTableRows(sqliteDb, "ReturnItems") as any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const repairs = getTableRows(sqliteDb, "RepairJobs") as any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const billAllocs = getTableRows(sqliteDb, "BillItemBatchAllocations") as any[];

    const customerIds = new Set(customers.map((c) => c.Id));
    const billIds = new Set(bills.map((b) => b.Id));
    const billItemIds = new Set(billItems.map((bi) => bi.Id));
    const productIdsSet = new Set(products.map((p) => p.Id));
    const returnRefundIds = new Set(returnRefunds.map((r) => r.Id));

    const findings: OrphanFinding[] = [];
    const idMap: Record<string, Set<number | string>> = {};

    function collect<TRow>(
      tableName: string,
      rows: TRow[],
      rule: string,
      isOrphan: (row: TRow) => boolean,
      missingValueOf: (row: TRow) => number | string,
      recommendedAction: string,
    ) {
      const orphans = rows.filter(isOrphan);
      if (orphans.length === 0) return;
      const ids = new Set<number | string>(
        orphans.map((r) => (r as unknown as { Id?: number | string }).Id ?? missingValueOf(r)),
      );
      const missingIds = [
        ...new Set(orphans.map(missingValueOf).filter((v) => v !== undefined && v !== null)),
      ];
      findings.push({
        table: tableName,
        count: orphans.length,
        missingIds: missingIds.slice(0, 12),
        rule,
        recommendedAction,
      });
      idMap[tableName] = ids;
    }

    collect(
      "CustomerLedgerEntries",
      ledger,
      "CustomerLedgerEntries.CustomerId not found in Customers",
      (r) => r.CustomerId && !customerIds.has(r.CustomerId),
      (r) => r.CustomerId,
      "Drop these rows or fix the desktop backup before retrying.",
    );

    collect(
      "CreditPayments",
      creditPayments,
      "CreditPayments.CustomerId not found in Customers",
      (r) => r.CustomerId && !customerIds.has(r.CustomerId),
      (r) => r.CustomerId,
      "Drop these rows or fix the desktop backup before retrying.",
    );

    collect(
      "ReturnItems",
      returnItems,
      "ReturnItems.ReturnId not found in ReturnRefunds",
      (r) => r.ReturnId && !returnRefundIds.has(r.ReturnId),
      (r) => r.ReturnId,
      "Drop these rows; ReturnRefunds parent is empty or missing.",
    );

    collect(
      "BillItems",
      billItems,
      "BillItems.BillId not found in Bills",
      (r) => r.BillId && !billIds.has(r.BillId),
      (r) => r.BillId,
      "Drop these rows; sale receipt is missing.",
    );

    collect(
      "BillItemBatchAllocations",
      billAllocs,
      "BillItemBatchAllocations.BillItemId not found in BillItems",
      (r) => r.BillItemId && !billItemIds.has(r.BillItemId),
      (r) => r.BillItemId,
      "Drop these rows; FIFO allocation is missing its line item.",
    );

    collect(
      "StockMovements",
      movements,
      "StockMovements.ProductId not found in Products",
      (r) => r.ProductId && !productIdsSet.has(r.ProductId),
      (r) => r.ProductId,
      "Drop these rows; movement points at a deleted product.",
    );

    collect(
      "ProductStockLots",
      lots,
      "ProductStockLots.ProductId not found in Products",
      (r) => r.ProductId && !productIdsSet.has(r.ProductId),
      (r) => r.ProductId,
      "Drop these rows; stock lot points at a deleted product.",
    );

    collect(
      "ReturnRefunds",
      returnRefunds,
      "ReturnRefunds.BillId not found in Bills",
      (r) => r.BillId && !billIds.has(r.BillId),
      (r) => r.BillId,
      "Drop these rows; refund references a missing invoice.",
    );

    // Repairs allow walk-in (CustomerId=0); only flag positive IDs that don't exist.
    collect(
      "RepairJobs",
      repairs,
      "RepairJobs.CustomerId not found in Customers (walk-in CustomerId=0 is OK)",
      (r) =>
        r.CustomerId !== undefined &&
        r.CustomerId !== null &&
        Number(r.CustomerId) > 0 &&
        !customerIds.has(r.CustomerId),
      (r) => r.CustomerId,
      "Drop these rows or recreate the customer manually first.",
    );

    setOrphanFindings(findings);
    setOrphanIdsByTable(idMap);

    // ====================================================================
    // Mapping-failure preflight. These check the same field-fallback chain
    // the server uses (ItemName/ProductName/Name for products; PaymentStatus
    // normalisation for bills). If a category of essential rows would fail
    // to import, we block the Confirm Import button rather than letting the
    // wizard cascade orphans afterwards.
    // ====================================================================
    const blockers: string[] = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const productNameOf = (r: any): string => {
      for (const k of ["ItemName", "ProductName", "Name", "name"]) {
        const v = r?.[k];
        if (v !== undefined && v !== null) {
          const s = String(v).trim();
          if (s.length > 0) return s;
        }
      }
      return "";
    };

    if (products.length > 0) {
      const noName = products.filter((p) => !productNameOf(p)).length;
      if (noName > 0 && noName === products.length) {
        blockers.push(
          `Product mapping failed: expected ItemName / ProductName / Name field was not resolved on any of ${products.length} product rows. ` +
            `Import is disabled until the source backup is fixed or the importer is updated.`,
        );
      } else if (noName > 0) {
        warnings.push(
          `⚠️ ${noName} of ${products.length} products have no resolvable name (ItemName/ProductName/Name all blank). They will fail to import.`,
        );
      }
    }

    // Bills payment-status sanity: every desktop version we know uses
    // capitalised "Paid"/"Partial"/etc. — so an unrecognised value is a sign
    // of a schema we haven't mapped. The server normaliser falls back to
    // money-based status when the string is unknown, so this is only a
    // warning, not a blocker.
    const knownStatusSet = new Set([
      "paid",
      "partial",
      "unpaid",
      "credit",
      "due",
      "draft",
      "void",
      "cancelled",
      "",
    ]);
    const unknownStatuses = new Set<string>();
    for (const b of bills) {
      const v = String(b.PaymentStatus ?? b.Status ?? "")
        .trim()
        .toLowerCase();
      if (!knownStatusSet.has(v)) unknownStatuses.add(v);
    }
    if (unknownStatuses.size > 0) {
      warnings.push(
        `ℹ️ Bills have unrecognised PaymentStatus value(s): ${[...unknownStatuses].join(", ")}. ` +
          `They will be normalised from money fields (AmountPaid/GrandTotal/BalanceDue).`,
      );
    }

    warnings.push("ℹ️ Preflight verification passed: product_stock_lots schema mapping columns verified.");
    warnings.push("ℹ️ Preflight verification passed: stock_movements movement_type enum normalizer verified.");
    warnings.push("ℹ️ Preflight verification passed: returns duplicate deduplication strategy registered.");
    if (!importActivityLog) {
      warnings.push("ℹ️ Preflight configuration: ActivityLog import is disabled by default to keep DB clean.");
    }

    // ====================================================================
    // Value bounds preflight: detect negative values in money/stock/quantity
    // fields that would be rejected server-side. These are warnings, not
    // blockers — the server will skip individual bad rows.
    // ====================================================================
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pickNum = (row: any, keys: string[], fallback = 0): number => {
      for (const k of keys) {
        const v = row?.[k];
        if (v === undefined || v === null || v === "") continue;
        const n = Number(v);
        if (Number.isFinite(n)) return n;
      }
      return fallback;
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cheq = (row: any, keys: string[], fallback = 0) => { const v = pickNum(row, keys, fallback); return v < 0 ? v : null; };

    for (const p of products) {
      const n = cheq(p, ["purchase_price", "PurchasePrice"]);
      if (n !== null) warnings.push(`Negative purchase_price (${n}) in Products ID ${p.Id}.`);
      const s = cheq(p, ["sale_price", "SalePrice"]);
      if (s !== null) warnings.push(`Negative sale_price (${s}) in Products ID ${p.Id}.`);
      const st = cheq(p, ["stock_quantity", "Stock", "StockQuantity"]);
      if (st !== null) warnings.push(`Negative stock_quantity (${st}) in Products ID ${p.Id}.`);
      const ms = cheq(p, ["minimum_stock", "MinStock", "MinimumStock"]);
      if (ms !== null) warnings.push(`Negative minimum_stock (${ms}) in Products ID ${p.Id}.`);
    }
    for (const b of bills) {
      const gt = cheq(b, ["grand_total", "GrandTotal"]);
      if (gt !== null) warnings.push(`Negative grand_total (${gt}) in Bills BillNo ${b.BillNo}.`);
      const ap = cheq(b, ["amount_paid", "AmountPaid"]);
      if (ap !== null) warnings.push(`Negative amount_paid (${ap}) in Bills BillNo ${b.BillNo}.`);
      const bd = cheq(b, ["balance_due", "BalanceDue"]);
      if (bd !== null) warnings.push(`Negative balance_due (${bd}) in Bills BillNo ${b.BillNo}.`);
    }
    for (const bi of billItems) {
      const q = cheq(bi, ["quantity", "Qty", "Quantity"], 1);
      if (q !== null) warnings.push(`Negative quantity (${q}) in BillItems ID ${bi.Id}.`);
      const up = cheq(bi, ["unit_price", "Price", "UnitPrice", "SalePrice"]);
      if (up !== null) warnings.push(`Negative unit_price (${up}) in BillItems ID ${bi.Id}.`);
      const lt = cheq(bi, ["line_total", "LineTotal"]);
      if (lt !== null) warnings.push(`Negative line_total (${lt}) in BillItems ID ${bi.Id}.`);
    }

    setDryRunBlockers(blockers);
    setDryRunWarnings(warnings);
    setDryRunChecked(true);
    setIsParsing(false);
  }

  // Convert online JSON rows to desktop-style row shapes for importTableChunkAction
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function convertOnlineRows(tableName: string, rows: any[]): any[] {
    // Build lookup maps from categories data if available
    const cats = onlineData?.categories || [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const catIdToName = new Map(cats.map((c: any) => [c.id, c.name]));

    switch (tableName) {
      case "Categories":
        return rows.map((r) => ({ Id: r.id, Name: r.name, Description: r.description || "", IsActive: r.is_active }));
      case "Suppliers":
        return rows.map((r) => ({ Id: r.id, Name: r.name, Company: r.company || "", Phone: r.phone || "", Email: r.email || "", Address: r.address || "", Notes: r.notes || "", IsActive: r.is_active }));
      case "Customers":
        return rows.map((r) => ({ Id: r.id, Name: r.name, Phone: r.phone || "", Email: r.email || "", OutstandingBalance: r.outstanding_balance ?? 0, Address: r.address || "", Notes: r.notes || "" }));
      case "Products":
        return rows.map((r) => ({
          Id: r.id, ItemName: r.name, Sku: r.sku || "", Barcode: r.barcode || "", Type: r.type || "product",
          Category: catIdToName.get(r.category_id) || "", SupplierId: r.supplier_id || "",
          PurchasePrice: r.purchase_price ?? 0, SalePrice: r.sale_price ?? 0, Stock: r.stock_quantity ?? 0,
          MinimumStock: r.minimum_stock ?? 0, DefaultCommissionAmount: r.default_commission_amount ?? 0,
          DefaultCommissionPercent: r.default_commission_percent ?? 0,
          AllowSellAtLoss: r.allow_sell_at_loss, SellAtLossReason: r.sell_at_loss_reason || "",
          Notes: r.notes || "", IsActive: r.is_active,
          ServiceType: r.service_type || "", ServicePricingMode: r.service_pricing_mode || "",
          RequiresAccountNumber: r.requires_account_number, RequiresProvider: r.requires_provider,
          RequiresReference: r.requires_reference
        }));
      case "ProductStockLots":
        return rows.map((r) => ({
          Id: r.id, ProductId: r.product_id, SupplierId: r.supplier_id || "",
          BatchNumber: r.lot_number || "", AddedAt: r.purchase_date || "",
          QuantityAdded: r.quantity_received ?? 0, QuantityRemaining: r.quantity_remaining ?? 0,
          PurchasePrice: r.unit_cost ?? 0, IsActive: r.is_active
        }));
      case "StockMovements":
        return rows.map((r) => ({
          Id: r.id, ProductId: r.product_id, StockLotId: r.stock_lot_id || "",
          MovementType: r.movement_type, Quantity: r.quantity ?? 0,
          unit_cost: r.unit_cost ?? 0, reference_type: r.reference_type || "manual",
          reference_id: r.reference_id || null, Reason: r.notes || "Imported from online backup",
          CreatedAt: r.created_at || new Date().toISOString()
        }));
      case "Bills":
        return rows.map((r) => ({
          Id: r.id, CustomerId: r.customer_id || "", BillNo: r.invoice_no,
          GrandTotal: r.grand_total ?? 0, AmountPaid: r.amount_paid ?? 0,
          BalanceDue: r.balance_due ?? 0, Subtotal: r.subtotal ?? 0,
          DiscountTotal: r.discount_total ?? 0, Status: r.status || "unpaid",
          BillDate: r.invoice_date || r.created_at || "", Note: r.note || ""
        }));
      case "BillItems":
        return rows.map((r) => ({
          Id: r.id, BillId: r.invoice_id, ProductId: r.product_id || "",
          ItemName: r.product_name || "Unknown Product", Price: r.unit_price ?? 0,
          Qty: r.quantity ?? 1, PurchasePrice: r.purchase_price ?? 0,
          ItemDiscount: r.item_discount ?? 0, LineTotal: r.line_total ?? 0,
          ServiceTransactionAmount: r.service_transaction_amount ?? 0,
          ServiceCommission: r.service_commission ?? 0,
          ServiceTotalCharged: r.service_total_charged ?? 0,
          ServiceProvider: r.service_provider || "",
          ServiceDirection: r.service_direction || "",
          ServiceAccountNumber: r.service_account_number || "",
          ServiceReceiverAccount: r.service_receiver_account || "",
          ServiceReferenceNo: r.service_reference_no || "",
          ServiceNote: r.service_note || "",
          ProductType: r.product_type || ""
        }));
      case "BillItemBatchAllocations":
        return rows.map((r) => ({
          Id: r.id, BillItemId: r.invoice_item_id, StockLotId: r.stock_lot_id || "",
          Qty: r.quantity ?? 0, PurchasePrice: r.unit_cost ?? 0
        }));
      case "Payments":
        return rows.map((r) => ({
          Id: r.id, BillId: r.invoice_id, CustomerId: r.customer_id || "",
          Amount: r.amount ?? 0, Method: r.method || "cash",
          ReferenceNo: r.reference_no || "", Note: r.note || "",
          CreatedAt: r.paid_at || r.created_at || new Date().toISOString()
        }));
      case "CustomerLedgerEntries":
        return rows.map((r) => ({
          Id: r.id, CustomerId: r.customer_id, BillId: r.invoice_id || "",
          Amount: r.amount ?? 0, BalanceAfter: r.balance_after ?? 0,
          EntryType: r.entry_type || "invoice_credit", Direction: r.direction || "debit",
          Description: r.description || "", Date: r.created_at || new Date().toISOString()
        }));
      case "ReturnRefunds":
        return rows.map((r) => ({
          Id: r.id, BillId: r.invoice_id, CustomerId: r.customer_id || "",
          ReturnNo: r.return_no || `RET-${r.id}`, RefundAmount: r.refund_amount ?? 0,
          Status: r.status || "completed", Method: r.refund_method || "cash",
          Notes: r.notes || "", CreatedAt: r.created_at || new Date().toISOString()
        }));
      case "ReturnItems":
        return rows.map((r) => ({
          Id: r.id, ReturnId: r.return_id, BillItemId: r.invoice_item_id,
          ProductId: r.product_id, QtyReturned: r.quantity ?? 1,
          UnitPrice: r.unit_price ?? 0, LineTotal: r.line_total ?? 0,
          Restocked: r.restock
        }));
      case "Expenses":
        return rows.map((r) => ({
          Id: r.id, Category: r.category || "General", Amount: r.amount ?? 0,
          PaymentMethod: r.payment_method || "cash",
          VendorName: r.vendor_name || "", Notes: r.notes || "",
          Date: r.spent_at || r.created_at || new Date().toISOString(),
          Status: r.status || "active"
        }));
      case "RepairJobs":
        return rows.map((r) => ({
          Id: r.id, CustomerId: r.customer_id || "",
          JobNo: r.job_no || `JOB-${r.id}`,
          EstimatedCost: r.estimated_cost ?? 0, AdvancePaid: r.advance_paid ?? 0,
          CustomerName: r.customer_name || "Walk-in customer",
          CustomerPhone: r.customer_phone || "",
          DeviceType: r.device_type || "Other", DeviceModel: r.device_model || "",
          SerialImei: r.serial_imei || "", Problem: r.problem_description || "",
          Accessories: r.accessories_received || "",
          PaymentMethod: r.payment_method || "cash", Status: r.status || "received",
          Notes: r.notes || "",
          ExpectedDelivery: r.expected_delivery_at || null,
          DeliveredAt: r.delivered_at || null,
          CreatedAt: r.created_at || new Date().toISOString()
        }));
      case "DailyClosings":
        return rows.map((r) => ({
          Id: r.id, ClosingDate: (r.closing_date || "").split("T")[0],
          CashExpected: r.expected_closing_cash ?? 0,
          CashCounted: r.actual_closing_cash ?? 0,
          CashDifference: r.cash_difference ?? 0,
          Notes: r.notes || "Imported daily closing from online backup",
          FinalizedAt: r.finalized_at || null
        }));
      case "ActivityLog":
        return rows.map((r) => ({
          Id: r.id, Details: r.details || "",
          Module: r.module || "system", Action: r.action || "online_restore_activity",
          Actor: r.actor_id || null, Date: r.created_at || new Date().toISOString()
        }));
      default:
        return [];
    }
  }

  // Stepper Stage 6: Sequential Chunked Database Import Execution
  async function triggerBackupImport() {
    try {
      // The orphan policy is required if any orphans were detected.
      // "stop" should never reach here (the UI hides the import button) but
      // guard server-side anyway by passing "stop" — the server will reject.
      const hasOrphans = orphanFindings.length > 0;
      if (hasOrphans && orphanPolicy === null) {
        setImportError("Pick how to handle orphan rows before starting import.");
        return;
      }
      if (hasOrphans && orphanPolicy === "stop") {
        setImportError("Import stopped until orphan rows are resolved.");
        return;
      }
      const effectiveOrphanPolicy: OrphanPolicy =
        hasOrphans && orphanPolicy ? orphanPolicy : "drop";

      setImportError(null);
      setStep("progress");
      setImportReportLogs([]);

      // 1. Start Job Actions
      const countsMap: Record<string, number> = {};
      tableProgress.forEach(t => {
        countsMap[t.name] = t.count;
      });

      // Augment the manifest stored on the import job with the orphan
      // summary so the audit log shows exactly what was dropped per table.
      const orphanSummary = orphanFindings.map((f) => ({
        table: f.table,
        count: f.count,
        rule: f.rule,
      }));
      const auditedManifest = {
        ...(manifest ?? {}),
        OnlineImport: {
          orphanPolicy: effectiveOrphanPolicy,
          orphanFindings: orphanSummary,
        },
      };

      const startRes = await startImportJobAction(
        manifest?.AppName || "GadgetZonePOS",
        manifest?.BackupVersion?.toString() || "2",
        manifest?.SchemaVersion?.toString() || "1",
        auditedManifest,
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
        if (table.name === "ActivityLog") {
          if (!importActivityLog) {
            table.status = "skipped";
            setTableProgress([...updatedProgress]);
            logs.push(`ℹ️ Skipped table ${table.name} per user configuration.`);
            setImportReportLogs([...logs]);
            continue;
          }
          const hasCoreFailures = updatedProgress.some(t => t.name !== "ActivityLog" && t.failedCount > 0);
          if (hasCoreFailures) {
            table.status = "skipped";
            setTableProgress([...updatedProgress]);
            logs.push(`⚠️ Skipped table ${table.name} because core tables had failed rows.`);
            setImportReportLogs([...logs]);
            continue;
          }
        }

        if (table.count === 0 || table.status === "skipped") {
          table.status = "skipped";
          setTableProgress([...updatedProgress]);
          continue;
        }

        table.status = "importing";
        setTableProgress([...updatedProgress]);
        setCurrentProgressIndex(i);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let allRows: any[];
        if (isOnlineBackup && onlineData) {
          // Map table name back to the online JSON key
          const tableKey = Object.entries({
            categories: "Categories", suppliers: "Suppliers", customers: "Customers",
            products: "Products", lots: "ProductStockLots", movements: "StockMovements",
            invoices: "Bills", invoiceItems: "BillItems", payments: "Payments",
            ledgerEntries: "CustomerLedgerEntries", returns: "ReturnRefunds",
            returnItems: "ReturnItems", expenses: "Expenses", repairs: "RepairJobs",
            closings: "DailyClosings", auditLogs: "ActivityLog"
          }).find(([, v]) => v === table.name)?.[0] || "";
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const rawRows = (onlineData as any)?.[tableKey];
          allRows = convertOnlineRows(table.name, Array.isArray(rawRows) ? rawRows : []);
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          allRows = getTableRows(sqliteDb, table.name) as any[];
        }
        // Filter orphan rows out before upload when the policy is "drop".
        // The server re-validates this with the same policy as a safety net.
        const orphanIds = orphanIdsByTable[table.name];
        const orphanCountForTable = orphanIds?.size ?? 0;
        const rows =
          effectiveOrphanPolicy === "drop" && orphanIds && orphanIds.size > 0
            ? allRows.filter((r) => !orphanIds.has(r.Id))
            : allRows;
        if (effectiveOrphanPolicy === "drop" && orphanCountForTable > 0) {
          logs.push(
            `[${table.name}] Dropping ${orphanCountForTable} orphan row(s) before import (per chosen orphan policy).`,
          );
          setImportReportLogs([...logs]);
        }
        const chunkSize = 100;
        const totalRows = rows.length;
        const totalChks = Math.ceil(totalRows / chunkSize) || 0;
        setTotalChunks(totalChks);

        let tInserted = 0;
        let tSkipped = 0;
        let tFailed = 0;
        let tSkippedOrphan = effectiveOrphanPolicy === "drop" ? orphanCountForTable : 0;

        for (let c = 0; c < totalChks; c++) {
          setCurrentChunkIndex(c + 1);
          const chunk = rows.slice(c * chunkSize, (c + 1) * chunkSize);

          const chunkRes = await importTableChunkAction(
            activeJobId,
            table.name,
            chunk,
            effectiveOrphanPolicy,
          );
          if (!chunkRes.success) {
            throw new Error(chunkRes.error || `Failed executing chunk ${c+1} for table ${table.name}.`);
          }

          tInserted += chunkRes.inserted;
          tSkipped += chunkRes.skipped;
          tFailed += chunkRes.failed;
          tSkippedOrphan += chunkRes.skippedOrphan ?? 0;

          if (chunkRes.warnings.length > 0) {
            logs.push(...chunkRes.warnings.map(w => `[${table.name}] ${w}`));
            setImportReportLogs([...logs]);
          }
        }

        table.status = "completed";
        table.inserted = tInserted;
        table.skippedCount = tSkipped;
        table.failedCount = tFailed;
        table.skippedOrphanCount = tSkippedOrphan;
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
      const msg = err instanceof Error ? err.message : "Backup import interrupted due to an error.";
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

  // Check if any core table has failed rows
  const coreTables = new Set([
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
    "ReturnRefunds",
    "ReturnItems"
  ]);
  const hasCoreFailures = tableProgress.some(t => coreTables.has(t.name) && t.failedCount > 0);

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

      {step === "upload" && (<>
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
            {backupImportEnabled ? (
              <>
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
                    <div className="flex items-start gap-2 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
                      <AlertTriangle className="size-4 shrink-0" />
                      <span className="whitespace-pre-line">{parseError}</span>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="py-6 text-center">
                <Lock className="mx-auto size-8 text-slate-300" />
                <p className="mt-2 text-sm font-semibold text-slate-500">Backup import has been disabled by the platform administrator.</p>
              </div>
            )}
          </div>
        </div>

        {/* Danger Zone: Factory Reset Card */}
        {factoryResetEnabled ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50/30 p-5 shadow-sm space-y-4 dark:border-rose-900/50 dark:bg-rose-950/20">
            <div className="flex items-start gap-3">
              <AlertTriangle className="size-6 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-md font-bold text-rose-950 dark:text-rose-200">Restore Factory Defaults / Factory Reset</h4>
                <p className="mt-1 text-xs text-rose-800 dark:text-rose-300">
                  Wipes all sales history, repairs, customers, inventory records, and expenses. This action is organization-scoped, completely destructive, and cannot be undone. Pre-reset safety backup export will be created first.
                </p>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={openFactoryResetFlow}
                className="rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-rose-700 transition cursor-pointer shadow-sm"
              >
                Initiate Factory Reset
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm text-center">
            <Lock className="mx-auto size-8 text-slate-300" />
            <p className="mt-2 text-sm font-semibold text-slate-500">Factory reset has been disabled by the platform administrator.</p>
          </div>
        )}
      </>)}

      {/* Stepper Step 2: Table Counts Preview */}
      {step === "preview" && manifest && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-6">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <span className="rounded-lg bg-blue-50 px-2 py-0.5 text-[10px] font-black text-blue-700 uppercase tracking-wider">
                {manifest.AppName}
              </span>
              <h3 className="mt-1 text-lg font-black text-slate-900">
                {isOnlineBackup ? "Online Backup ZIP Detected" : "1. Inspect Backup Contents"}
              </h3>
              <p className="text-xs text-slate-500">
                {isOnlineBackup ? "Below are the record counts extracted from the online JSON backup." : "Below are the record counts extracted from the SQLite binary database."}
              </p>
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
              <p className="font-bold uppercase tracking-wider text-[10px]">
                {isOnlineBackup ? "Online Backup Footprint" : "Database Footprint"}
              </p>
              <p>
                {isOnlineBackup ? (
                  <>Online JSON found at: <code>{dbFileDetected}</code></>
                ) : (
                  <code>{dbFileDetected}</code>
                )}
                . Backup version: <strong>{manifest.BackupVersion}</strong>. Created on: <strong>{manifest.CreatedAt ? new Date(manifest.CreatedAt).toLocaleString() : "—"}</strong>. Uploaded file: <strong>{zipFile ? zipFile.name : "N/A"}</strong>.
              </p>
            </div>
          </div>

          {manifestMissingWarning && (
            <div className="rounded-xl bg-amber-50 p-4 border border-amber-200 flex items-start gap-3 text-xs text-amber-900">
              <AlertTriangle className="size-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Missing manifest.json</p>
                <p className="mt-1">manifest.json was not found, but a GadgetZonePOS SQLite database was detected and can be previewed.</p>
              </div>
            </div>
          )}

          {isOnlineBackup && (
            <div className="rounded-xl bg-emerald-50 p-4 border border-emerald-200 flex items-start gap-3 text-xs text-emerald-900">
              <ShieldCheck className="size-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Online Restore Available</p>
                <p className="mt-1">This online JSON backup can be inspected below and then executed in the confirmation step. All existing per-row value validation (rejecting negative prices, stock, amounts) runs before any insert.</p>
              </div>
            </div>
          )}

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

            {/* Checkbox Config options */}
            <div className="grid gap-4 md:grid-cols-2">
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

              <div className="rounded-xl border border-slate-200 p-4 space-y-4 bg-slate-50">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Audit Log Options</h4>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={importActivityLog}
                    onChange={(e) => setImportActivityLog(e.target.checked)}
                    className="mt-1 size-4 rounded accent-blue-700 cursor-pointer"
                  />
                  <div className="text-xs text-slate-600">
                    <p className="font-bold text-slate-800">Import desktop ActivityLog entries?</p>
                    <p className="mt-1">Imports historical cashier activity logs. **Default is OFF** to avoid importing noisy duplicate/test audit rows from the offline backup.</p>
                  </div>
                </label>
              </div>
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
                disabled={
                  dryRunBlockers.length > 0 ||
                  (orphanFindings.length > 0 && orphanPolicy !== "drop")
                }
                className="rounded-xl bg-blue-700 px-5 py-2.5 text-xs font-bold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 cursor-pointer"
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
            ) : dryRunWarnings.length === 0 && orphanFindings.length === 0 && dryRunBlockers.length === 0 ? (
              <div className="rounded-xl bg-emerald-50 p-5 text-center border border-emerald-100 space-y-2">
                <ShieldCheck className="mx-auto size-12 text-emerald-600 animate-bounce" />
                <h4 className="text-sm font-bold text-emerald-800">0 integrity errors detected</h4>
                <p className="text-xs text-emerald-700">Backup file satisfies all data-structure constraints and is 100% ready to merge.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Hard mapping-failure blockers — Confirm Import stays disabled. */}
                {dryRunBlockers.length > 0 && (
                  <div className="space-y-2 rounded-xl border-2 border-rose-300 bg-rose-100 p-4">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 size-5 shrink-0 text-rose-700" />
                      <div>
                        <h4 className="text-sm font-black text-rose-900">
                          Import blocked — mapping failure
                        </h4>
                        <p className="mt-1 text-xs text-rose-900">
                          The dry-run found a structural problem that the
                          importer cannot resolve. Confirm Import is disabled.
                          Fix the source backup or update the importer, then
                          re-upload.
                        </p>
                      </div>
                    </div>
                    <ul className="space-y-1 pl-7 text-xs text-rose-900">
                      {dryRunBlockers.map((b, idx) => (
                        <li key={idx} className="list-disc">{b}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {/* Structural orphan rows — requires explicit choice before continuing. */}
                {orphanFindings.length > 0 && (
                  <div className="space-y-3 rounded-xl border border-rose-200 bg-rose-50 p-4">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 size-5 shrink-0 text-rose-600" />
                      <div>
                        <h4 className="text-sm font-bold text-rose-900">
                          Orphan rows detected — choose how to proceed
                        </h4>
                        <p className="mt-1 text-xs text-rose-800">
                          The desktop backup has rows whose parent record is missing.
                          They cannot be imported without manual mapping. The
                          online wizard does <strong>not</strong> create
                          placeholder customers or returns automatically.
                        </p>
                      </div>
                    </div>

                    <div className="overflow-x-auto rounded-lg border border-rose-200 bg-white">
                      <table className="w-full min-w-[480px] text-left text-xs">
                        <thead className="border-b border-rose-200 bg-rose-50 text-[10px] font-bold uppercase tracking-wider text-rose-800">
                          <tr>
                            <th className="px-3 py-2">Table</th>
                            <th className="px-3 py-2 text-right">Orphan rows</th>
                            <th className="px-3 py-2">Missing source IDs</th>
                            <th className="px-3 py-2">Recommended action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-rose-100">
                          {orphanFindings.map((f) => (
                            <tr key={f.table} className="align-top">
                              <td className="px-3 py-2 font-semibold text-rose-900">{f.table}</td>
                              <td className="px-3 py-2 text-right font-bold text-rose-900">{f.count}</td>
                              <td className="px-3 py-2 text-rose-800">
                                {f.missingIds.length === 0
                                  ? "—"
                                  : f.missingIds.join(", ") +
                                    (f.missingIds.length >= 12 ? "…" : "")}
                              </td>
                              <td className="px-3 py-2 text-rose-800">{f.recommendedAction}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <fieldset className="space-y-2">
                      <legend className="text-xs font-bold uppercase tracking-wider text-rose-900">
                        Required choice
                      </legend>
                      <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-rose-200 bg-white p-3 text-xs">
                        <input
                          type="radio"
                          name="orphan-policy"
                          value="drop"
                          checked={orphanPolicy === "drop"}
                          onChange={() => setOrphanPolicy("drop")}
                          className="mt-0.5 size-4 accent-rose-700"
                        />
                        <span>
                          <strong className="text-rose-900">Drop orphan rows and continue import.</strong>
                          <span className="block text-rose-800">
                            These rows are filtered out of the upload. They are reported under
                            <em> skipped_orphan</em> on the final import report.
                          </span>
                        </span>
                      </label>
                      <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-rose-200 bg-white p-3 text-xs">
                        <input
                          type="radio"
                          name="orphan-policy"
                          value="stop"
                          checked={orphanPolicy === "stop"}
                          onChange={() => setOrphanPolicy("stop")}
                          className="mt-0.5 size-4 accent-rose-700"
                        />
                        <span>
                          <strong className="text-rose-900">Stop import and fix the desktop backup first.</strong>
                          <span className="block text-rose-800">
                            Import is disabled. Fix the source database (or re-export from the desktop app)
                            and re-upload.
                          </span>
                        </span>
                      </label>
                      {orphanPolicy === null && (
                        <p className="text-[11px] text-rose-700">
                          Pick one to enable the Confirm Import button.
                        </p>
                      )}
                      {orphanPolicy === "stop" && (
                        <p className="rounded-lg bg-white px-3 py-2 text-[11px] font-semibold text-rose-700">
                          Import stopped until orphan rows are resolved.
                        </p>
                      )}
                    </fieldset>
                  </div>
                )}

                {dryRunWarnings.length > 0 && (
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
                To confirm restore, type <span className="text-blue-700">{isOnlineBackup ? "RESTORE ONLINE BACKUP" : "IMPORT DESKTOP BACKUP"}</span>:
              </label>
              <input
                id="confirm-phrase"
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={isOnlineBackup ? "RESTORE ONLINE BACKUP" : "IMPORT DESKTOP BACKUP"}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-700 focus:bg-white"
              />
            </div>

            {isOnlineBackup ? (
              dryRunBlockers.length > 0 ? (
                <div className="rounded-xl bg-rose-50 border border-rose-200 p-4 text-xs text-rose-900">
                  Import is blocked because dry-run found a mapping failure.
                  Go back to the Dry Run step for details. Fix the source backup
                  (or update the importer) and re-upload.
                </div>
              ) : (
                <button
                  onClick={triggerBackupImport}
                  disabled={
                    confirmText !== "RESTORE ONLINE BACKUP" ||
                    !confirmCheckbox ||
                    !backupImportEnabled
                  }
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-800 disabled:bg-slate-100 disabled:text-slate-400 cursor-pointer"
                >
                  <Upload className="size-4" />
                  Begin Online Restore
                </button>
              )
            ) : (
              dryRunBlockers.length > 0 ? (
                <div className="rounded-xl bg-rose-50 border border-rose-200 p-4 text-xs text-rose-900">
                  Import is blocked because dry-run found a mapping failure.
                  Go back to the Dry Run step for details. Fix the source backup
                  (or update the importer) and re-upload.
                </div>
              ) : orphanFindings.length > 0 && orphanPolicy === "stop" ? (
                <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-xs text-amber-900">
                  Import stopped until orphan rows are resolved. Go back to the
                  Dry Run step and pick &quot;Drop orphan rows and continue&quot;,
                  or fix the desktop backup and re-upload.
                </div>
              ) : (
                <button
                  onClick={triggerBackupImport}
                  disabled={
                    confirmText !== "IMPORT DESKTOP BACKUP" ||
                    !confirmCheckbox ||
                    dryRunBlockers.length > 0 ||
                    (orphanFindings.length > 0 && orphanPolicy !== "drop")
                  }
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-800 disabled:bg-slate-100 disabled:text-slate-400 cursor-pointer"
                >
                  <Upload className="size-4" />
                  Begin Desktop Restore
                </button>
              )
            )}
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
              {!hasCoreFailures ? (
                <div className="rounded-xl bg-emerald-50 p-4 text-xs text-emerald-955 border border-emerald-100 flex gap-2">
                  <CheckCircle className="size-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-sm text-emerald-900">Backup Restored Successfully</p>
                    <p className="mt-1 text-emerald-800">All compatible entities are successfully mapped, deduped, and merged into the Supabase database.</p>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl bg-amber-50 p-4 text-xs text-amber-955 border border-amber-200 flex gap-2">
                  <AlertTriangle className="size-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-sm text-amber-900">Import Completed with Issues</p>
                    <p className="mt-1 text-amber-800">Some inventory or core records failed to import. Please review the table diagnostics and warning logs below.</p>
                  </div>
                </div>
              )}

              {/* Counts details table */}
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-[10px] uppercase font-bold tracking-wider text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-2.5">Table Name</th>
                      <th className="px-4 py-2.5 text-right">Extracted</th>
                      <th className="px-4 py-2.5 text-right text-emerald-700">Created</th>
                      <th className="px-4 py-2.5 text-right text-blue-700">Skipped existing</th>
                      <th className="px-4 py-2.5 text-right text-amber-700">Skipped orphan</th>
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
                        <td className="px-4 py-3 text-right text-amber-700">{t.skippedOrphanCount ?? 0}</td>
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

      {/* Factory Reset Modal Overlay */}
      {isResetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="w-full max-w-2xl bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <header className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-rose-50/50">
              <div className="flex items-center gap-2">
                <AlertTriangle className="size-5 text-rose-600 animate-pulse" />
                <h3 className="text-md font-black text-rose-950">Restore Factory Defaults</h3>
              </div>
              {resetStep !== "resetting" && resetStep !== "done" && (
                <button
                  onClick={() => setIsResetModalOpen(false)}
                  className="text-slate-400 hover:text-slate-600 text-sm font-bold p-1 cursor-pointer"
                >
                  ✕
                </button>
              )}
            </header>

            <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
              {resetStep === "preview" && (
                <div className="space-y-4">
                  <p className="text-slate-600 text-xs">
                    This step analyzes the current database tables for this organization to show exactly how many records will be wiped.
                  </p>

                  {isFetchingPreview ? (
                    <div className="flex items-center justify-center py-12 gap-2 text-slate-500">
                      <RefreshCw className="size-5 animate-spin text-blue-700" />
                      <span>Scanning organization database counts...</span>
                    </div>
                  ) : previewCounts ? (
                    <div className="space-y-4">
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                        <h4 className="font-bold text-slate-700 uppercase tracking-wider text-[10px] mb-2">Affected Business Tables & Counts:</h4>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {Object.entries(previewCounts).map(([table, count]) => (
                            <div key={table} className="flex justify-between items-center bg-white px-3 py-2 rounded-lg border border-slate-100">
                              <span className="font-semibold text-slate-600 capitalize">{table.replace(/_/g, " ")}</span>
                              <span className={`px-2 py-0.5 rounded font-black ${count > 0 ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-400"}`}>
                                {count}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-xl bg-amber-50 border border-amber-100 p-4 flex gap-2.5">
                        <AlertTriangle className="size-5 text-amber-600 shrink-0 mt-0.5" />
                        <div className="text-amber-900 space-y-1">
                          <p className="font-bold">What is preserved:</p>
                          <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-amber-800">
                            <li>The master Organization profile</li>
                            <li>Multi-tenant Branch profiles</li>
                            <li>Your active Owner / Admin logins and staff profiles</li>
                            <li>Supabase Auth directory accounts</li>
                          </ul>
                        </div>
                      </div>

                      <div className="flex justify-end gap-2 pt-2">
                        <button
                          onClick={() => setIsResetModalOpen(false)}
                          className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => setResetStep("backup")}
                          className="rounded-xl bg-rose-600 px-5 py-2.5 font-bold text-white hover:bg-rose-700 cursor-pointer shadow-sm"
                        >
                          Next: Safety Backup →
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-6">
                      <p className="text-rose-600 font-bold">Failed to load preview data.</p>
                      <button onClick={fetchResetPreview} className="mt-3 rounded-lg bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200">
                        Try Again
                      </button>
                    </div>
                  )}
                </div>
              )}

              {resetStep === "backup" && (
                <div className="space-y-4">
                  <div className="rounded-xl bg-rose-50 border border-rose-100 p-4">
                    <p className="font-bold text-rose-900 text-sm">Step 1: Download Safety Backup</p>
                    <p className="mt-1 text-rose-800">
                      Before proceeding, you must generate and download a full pre-reset backup ZIP. This ensures you can restore this {"organization's"} history in the future if needed.
                    </p>
                  </div>

                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center space-y-4">
                    <Download className="mx-auto size-12 text-slate-400" />
                    <div className="space-y-1">
                      <p className="font-bold text-slate-700">Pre-Reset ZIP Snapshot</p>
                      <p className="text-[10px] text-slate-500">Includes complete categories, products, invoices, customers, and ledger rows</p>
                    </div>

                    <button
                      onClick={async () => {
                        await handleExport();
                        setCheckboxBackupDownloaded(true);
                      }}
                      className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-6 py-3 font-bold text-white hover:bg-blue-800 shadow-sm cursor-pointer"
                    >
                      <Download className="size-4" />
                      Download Pre-Reset Backup
                    </button>
                  </div>

                  {checkboxBackupDownloaded && (
                    <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-4 text-emerald-955 flex gap-2">
                      <CheckCircle className="size-5 text-emerald-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold">Backup download triggered successfully!</p>
                        <p className="text-[10px] text-emerald-700">You may now proceed to the final confirmation screen.</p>
                      </div>
                    </div>
                  )}

                  <div className="flex justify-between items-center pt-2">
                    <button
                      onClick={() => setResetStep("preview")}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                    >
                      Back
                    </button>
                    <button
                      onClick={() => setResetStep("confirm")}
                      disabled={!checkboxBackupDownloaded}
                      className="rounded-xl bg-rose-600 px-5 py-2.5 font-bold text-white hover:bg-rose-700 disabled:bg-slate-100 disabled:text-slate-400 cursor-pointer shadow-sm"
                    >
                      Next: Confirm Wipe →
                    </button>
                  </div>
                </div>
              )}

              {resetStep === "confirm" && (
                <div className="space-y-4">
                  <div className="rounded-xl bg-rose-50 border border-rose-100 p-4">
                    <p className="font-bold text-rose-955">⚠️ Final Hard Confirmations Required</p>
                    <p className="mt-1 text-rose-800">
                      Wiping business data cannot be reversed. Please carefully acknowledge each warning checkmark below.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <label className="flex items-start gap-3 cursor-pointer rounded-xl border border-slate-200 p-3.5 hover:bg-slate-50/50">
                      <input
                        type="checkbox"
                        checked={checkboxCannotBeUndone}
                        onChange={(e) => setCheckboxCannotBeUndone(e.target.checked)}
                        className="mt-0.5 size-4 rounded accent-rose-600 cursor-pointer"
                      />
                      <div className="text-[11px] text-slate-600">
                        <p className="font-bold text-slate-800">I understand this operation cannot be undone</p>
                        <p className="mt-0.5">Wiped rows are permanently scrubbed from the active multi-tenant database clusters.</p>
                      </div>
                    </label>

                    <label className="flex items-start gap-3 cursor-pointer rounded-xl border border-slate-200 p-3.5 hover:bg-slate-50/50">
                      <input
                        type="checkbox"
                        checked={checkboxDataRemoved}
                        onChange={(e) => setCheckboxDataRemoved(e.target.checked)}
                        className="mt-0.5 size-4 rounded accent-rose-600 cursor-pointer"
                      />
                      <div className="text-[11px] text-slate-600">
                        <p className="font-bold text-slate-800">I understand all staff logs, repairs, sales, and catalog rows will be removed</p>
                        <p className="mt-0.5">All physical lots, expenses, return invoices, and active credit ledger entries will delete completely.</p>
                      </div>
                    </label>

                    <label className="flex items-start gap-3 cursor-pointer rounded-xl border border-slate-200 p-3.5 hover:bg-slate-50/50">
                      <input
                        type="checkbox"
                        checked={resetBrandingSettings}
                        onChange={(e) => setResetBrandingSettings(e.target.checked)}
                        className="mt-0.5 size-4 rounded accent-rose-600 cursor-pointer"
                      />
                      <div className="text-[11px] text-slate-600">
                        <p className="font-bold text-slate-800">Also reset shop settings / receipt branding to default state? (Optional)</p>
                        <p className="mt-0.5">Wipes support phone lines, store address, receipt custom footers, and logo URLs.</p>
                      </div>
                    </label>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label htmlFor="reset-pwd" className="block font-bold text-slate-700">Enter Your Current Password:</label>
                      <input
                        id="reset-pwd"
                        type="password"
                        value={typedPassword}
                        onChange={(e) => setTypedPassword(e.target.value)}
                        placeholder="••••••••"
                        className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-rose-600 focus:bg-white text-slate-900"
                      />
                    </div>

                    <div>
                      <label htmlFor="reset-shop" className="block font-bold text-slate-700">Type Your Exact Organization Name:</label>
                      <input
                        id="reset-shop"
                        type="text"
                        value={typedShopName}
                        onChange={(e) => setTypedShopName(e.target.value)}
                        placeholder="Enter organization name"
                        className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-rose-600 focus:bg-white text-slate-900"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="reset-phrase" className="block font-bold text-slate-700 uppercase tracking-wider text-[10px]">
                      To execute wipe, type <span className="text-rose-700 font-bold">RESTORE FACTORY DEFAULTS</span>:
                    </label>
                    <input
                      id="reset-phrase"
                      type="text"
                      value={typedConfirmationPhrase}
                      onChange={(e) => setTypedConfirmationPhrase(e.target.value)}
                      placeholder="RESTORE FACTORY DEFAULTS"
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-rose-600 focus:bg-white text-slate-900 font-mono"
                    />
                  </div>

                  {resettingError && (
                    <div className="flex items-center gap-2 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800">
                      <AlertTriangle className="size-4 shrink-0" />
                      <span>{resettingError}</span>
                    </div>
                  )}

                  <div className="flex justify-between gap-2 pt-2">
                    <button
                      onClick={() => setResetStep("backup")}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                    >
                      Back
                    </button>
                    <button
                      onClick={triggerFactoryReset}
                      disabled={
                        !checkboxCannotBeUndone ||
                        !checkboxDataRemoved ||
                        typedConfirmationPhrase !== "RESTORE FACTORY DEFAULTS" ||
                        !typedPassword ||
                        !typedShopName
                      }
                      className="rounded-xl bg-rose-600 px-6 py-2.5 font-bold text-white hover:bg-rose-700 disabled:bg-slate-100 disabled:text-slate-400 cursor-pointer shadow-sm"
                    >
                      ☠️ Wipe Data & Restore Factory Defaults
                    </button>
                  </div>
                </div>
              )}

              {resetStep === "resetting" && (
                <div className="py-12 text-center space-y-4">
                  <RefreshCw className="mx-auto size-12 text-rose-600 animate-spin" />
                  <div className="space-y-1">
                    <p className="font-bold text-slate-800 text-sm">Wiping Organization Business Records...</p>
                    <p className="text-slate-500">Executing Postgres RLS-hardened safe deletion transaction in correct order...</p>
                  </div>
                </div>
              )}

              {resetStep === "done" && deletedCounts && (
                <div className="space-y-6 text-center py-4">
                  <CheckCircle className="mx-auto size-14 text-emerald-600 animate-bounce" />
                  <div className="space-y-1.5">
                    <h4 className="text-lg font-black text-emerald-800">Wipe Completed Successfully!</h4>
                    <p className="text-xs text-emerald-700">The shop has been successfully restored to pristine factory defaults.</p>
                  </div>

                  <div className="max-w-md mx-auto rounded-xl border border-slate-200 bg-slate-50 p-4 text-left">
                    <h5 className="font-bold text-[10px] uppercase text-slate-500 tracking-wider mb-2 border-b border-slate-200 pb-1.5">Deletion Report:</h5>
                    <div className="max-h-40 overflow-y-auto space-y-1 font-mono text-[10px] text-slate-600">
                      {Object.entries(deletedCounts).map(([table, count]) => (
                        <div key={table} className="flex justify-between">
                          <span className="capitalize">{table.replace(/_/g, " ")}:</span>
                          <strong className="text-slate-900">{count} removed</strong>
                        </div>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setIsResetModalOpen(false);
                      window.location.reload();
                    }}
                    className="rounded-xl bg-blue-700 px-6 py-3 font-bold text-white hover:bg-blue-800 shadow-sm cursor-pointer"
                  >
                    Done & Reload Application
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
