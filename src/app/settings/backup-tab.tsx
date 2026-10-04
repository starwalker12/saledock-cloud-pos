"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  fetchExportDataAction,
  accountingImportAction,
  previewFactoryResetAction,
  restoreFactoryDefaultsAction
} from "./backup-actions";
import JSZip from "jszip";
import { prepareRestore } from "@/lib/backup/source-adapter";
import { restoreBackup } from "@/lib/backup/restore-workflow";
import { restoreTable } from "@/lib/backup/accounting-import";
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

function ClientPortal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(timer);
  }, []);
  return mounted ? createPortal(children, document.body) : null;
}

type BackupGuardLabels = {
  busyTitle: string;
  exportTitle: string;
  importPreviewTitle: string;
  importTitle: string;
  busyDescription: string;
  busyFooter: string;
  exportSuccess: string;
  exportError: string;
  previewSuccess: string;
  previewError: string;
  importSuccess: string;
  importError: string;
  beforeUnload: string;
};

type BackupOperation = "export" | "import-preview" | "import";
type BackupOperationNotice = {
  type: "success" | "error";
  message: string;
};

const MAX_BACKUP_FILE_BYTES = 50 * 1024 * 1024;

const DEFAULT_BACKUP_GUARD_LABELS: BackupGuardLabels = {
  busyTitle: "Backup in progress",
  exportTitle: "Creating backup ZIP",
  importPreviewTitle: "Reading backup file",
  importTitle: "Restoring backup",
  busyDescription:
    "Please do not close this tab, refresh, navigate away, or use the app until this finishes. Leaving early can make the backup incomplete or corrupted.",
  busyFooter: "This screen will unlock automatically when the operation finishes.",
  exportSuccess: "Backup ZIP is ready. Check your downloads.",
  exportError: "Backup export failed. No file was completed.",
  previewSuccess: "Backup file preview is ready.",
  previewError: "Backup file preview failed. No data was imported.",
  importSuccess: "Backup restore finished. Review the report below.",
  importError: "Backup restore stopped. Review the error report below.",
  beforeUnload: "A backup is in progress. Leaving now may make it incomplete.",
};

function BackupOperationOverlay({
  operation,
  labels,
  phase,
}: {
  operation: BackupOperation;
  labels: BackupGuardLabels;
  phase?: string;
}) {
  const titleByOperation: Record<BackupOperation, string> = {
    export: labels.exportTitle,
    "import-preview": labels.importPreviewTitle,
    import: labels.importTitle,
  };

  return (
    <ClientPortal>
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#020617]/75 p-4 backdrop-blur-sm animate-fade-in">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="backup-operation-title"
          aria-describedby="backup-operation-description"
          className="animate-scale-in w-full max-w-lg rounded-2xl border border-[#cbd5e1] bg-[#f8fafc] p-5 text-[#0f172a] shadow-2xl dark:border-[#334155] dark:bg-[#0f172a] dark:text-[#e2e8f0] sm:p-6"
        >
          <div className="flex items-start gap-4">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[var(--primary-accent-soft)] text-[var(--primary-accent-bg)]">
              <RefreshCw className="size-5 animate-spin" aria-hidden="true" />
            </span>
            <div className="min-w-0 space-y-3">
              <div>
                <p className="text-xs font-black uppercase tracking-wider text-[var(--primary-accent-bg)]">
                  {labels.busyTitle}
                </p>
                <h3 id="backup-operation-title" className="mt-1 text-lg font-black text-[#0f172a] dark:text-[#f8fafc]">
                  {operation === "import" && phase ? phase : titleByOperation[operation]}
                </h3>
              </div>
              <p id="backup-operation-description" className="text-sm leading-6 text-[#334155] dark:text-[#cbd5e1]">
                {operation === "import"
                  ? "Keep this tab open until the restore finishes. If the connection is interrupted, check the saved restore status before starting again."
                  : labels.busyDescription}
              </p>
              <div className="h-2 overflow-hidden rounded-full bg-[#e2e8f0] dark:bg-[#1e293b]">
                <div className="h-full w-1/2 animate-pulse rounded-full bg-[var(--primary-accent-bg)]" />
              </div>
              <p className="text-xs font-semibold text-[#64748b] dark:text-[#94a3b8]">
                {labels.busyFooter}
              </p>
            </div>
          </div>
        </div>
      </div>
    </ClientPortal>
  );
}

function BackupOperationNotice({
  notice,
}: {
  notice: BackupOperationNotice;
}) {
  const isSuccess = notice.type === "success";
  const Icon = isSuccess ? CheckCircle : AlertTriangle;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed inset-x-3 bottom-3 z-[60] rounded-xl border px-4 py-3 text-sm font-semibold shadow-xl sm:left-auto sm:right-5 sm:w-[min(420px,calc(100%-2rem))] ${
        isSuccess
          ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100"
          : "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-100"
      }`}
    >
      <div className="flex items-start gap-2">
        <Icon
          className={`mt-0.5 size-4 shrink-0 ${
            isSuccess ? "text-emerald-600 dark:text-emerald-300" : "text-rose-600 dark:text-rose-300"
          }`}
          aria-hidden="true"
        />
        <span>{notice.message}</span>
      </div>
    </div>
  );
}

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

export function BackupTab({
  backupImportEnabled = true,
  factoryResetEnabled = true,
  backupGuardLabels,
  hasPassword = true,
  shopName = "SaleDock Cloud POS",
  isOwner = false,
}: {
  backupImportEnabled?: boolean;
  factoryResetEnabled?: boolean;
  backupGuardLabels?: Partial<BackupGuardLabels>;
  hasPassword?: boolean;
  shopName?: string;
  isOwner?: boolean;
}) {
  const guardLabels = useMemo(
    () => ({ ...DEFAULT_BACKUP_GUARD_LABELS, ...backupGuardLabels }),
    [backupGuardLabels],
  );
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [activeBackupOperation, setActiveBackupOperation] = useState<BackupOperation | null>(null);
  const [operationNotice, setOperationNotice] = useState<BackupOperationNotice | null>(null);

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
  const [importActivityLog, setImportActivityLog] = useState(false);

  // Dry run warnings
  const [dryRunChecked, setDryRunChecked] = useState(false);
  // Source validation is fail-closed; no orphan dropping or account merging.
  const [dryRunBlockers, setDryRunBlockers] = useState<string[]>([]);

  // Confirmation parameters
  const [confirmText, setConfirmText] = useState("");
  const [confirmCheckbox, setConfirmCheckbox] = useState(false);

  // Progress metrics
  const [jobId, setJobId] = useState<string | null>(null);
  const [savedRestore, setSavedRestore] = useState<{ state: string; digest: string; committed: boolean } | null>(null);
  const [checkingRestore, setCheckingRestore] = useState(false);
  const [restoreCompleted, setRestoreCompleted] = useState(false);
  const [tableProgress, setTableProgress] = useState<TableCount[]>([]);
  const [currentProgressIndex, setCurrentProgressIndex] = useState(0);
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);
  const [totalChunks, setTotalChunks] = useState(0);
  const [importReportLogs, setImportReportLogs] = useState<string[]>([]);
  const [importError, setImportError] = useState<string | null>(null);
  const [importPhase, setImportPhase] = useState("Uploading/staging");

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

  useEffect(() => {
    if (!activeBackupOperation) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = guardLabels.beforeUnload;
      return guardLabels.beforeUnload;
    };

    const handleDocumentClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const anchor = target.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || anchor.hasAttribute("download") || anchor.href.startsWith("blob:")) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };

    const handlePopState = () => {
      window.history.pushState({ saledockBackupGuard: true }, "", window.location.href);
    };

    window.history.pushState({ saledockBackupGuard: true }, "", window.location.href);
    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("popstate", handlePopState);
    document.addEventListener("click", handleDocumentClick, true);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("popstate", handlePopState);
      document.removeEventListener("click", handleDocumentClick, true);
    };
  }, [activeBackupOperation, guardLabels.beforeUnload]);

  useEffect(() => {
    if (!operationNotice) return;

    const timer = window.setTimeout(() => setOperationNotice(null), 8000);
    return () => window.clearTimeout(timer);
  }, [operationNotice]);

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
      setActiveBackupOperation("export");
      setOperationNotice(null);
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
        BackupVersion: 3,
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
        csvFolder.file("cash_shifts.csv", convertToCSV(db.cashShifts));
        csvFolder.file("staff_permissions.csv", convertToCSV(db.staffPermissions));
        csvFolder.file("loss_prevention_events.csv", convertToCSV(db.lossPreventionEvents));
        csvFolder.file("customer_write_offs.csv", convertToCSV(db.customerWriteOffs));
        csvFolder.file("supplier_write_offs.csv", convertToCSV(db.supplierWriteOffs));
      }

      const content = await zip.generateAsync({ type: "blob" });
      const url = window.URL.createObjectURL(content);
      const a = document.createElement("a");
      a.href = url;
      const sanitizedShop = (shopName || "")
        .trim()
        .replace(/[^a-zA-Z0-9]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-+|-+$/g, "");
      const finalShopName = sanitizedShop || "Shop";
      const dateStr = new Date().toISOString().split("T")[0];
      a.download = `SaleDock-${finalShopName}-${dateStr}-Backup.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      setOperationNotice({ type: "success", message: guardLabels.exportSuccess });

    } catch (err: unknown) {
      console.error(err);
      const msg = err instanceof Error ? err.message : "An error occurred during export.";
      setExportError(msg);
      setOperationNotice({ type: "error", message: guardLabels.exportError });
    } finally {
      setIsExporting(false);
      setActiveBackupOperation(null);
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
    if (!file.name.toLowerCase().endsWith(".zip")) {
      setZipFile(null);
      setParseError("Choose a SaleDock backup ZIP file.");
      e.target.value = "";
      return;
    }
    if (file.size === 0 || file.size > MAX_BACKUP_FILE_BYTES) {
      setZipFile(null);
      setParseError("Backup ZIP files must be larger than 0 bytes and no more than 50 MB.");
      e.target.value = "";
      return;
    }
    let detectedZipKind: BackupZipKind = "unknown";
    let detectedBackupPath = "not detected";
    const wasmPath = "/sql-wasm.wasm";

    try {
      setActiveBackupOperation("import-preview");
      setOperationNotice(null);
      setZipFile(file);
      setIsParsing(true);
      setParseError(null);
      setManifest(null);
      setSqliteDb(null);
      setDbFileDetected(null);
      setConfirmText("");
      setConfirmCheckbox(false);
      setDryRunChecked(false);
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
          products: "Products",
          lots: "ProductStockLots",
          customers: "Customers",
          invoices: "Bills",
          invoiceItems: "BillItems",
          invoiceItemStockAllocations: "BillItemBatchAllocations",
          payments: "Payments",
          creditPayments: "CreditPayments",
          ledgerEntries: "CustomerLedgerEntries",
          movements: "StockMovements",
          returns: "ReturnRefunds",
          returnItems: "ReturnItems",
          returnStockAllocations: "ReturnStockAllocations",
          expenses: "Expenses",
          repairs: "RepairJobs",
          closings: "DailyClosings",
          supplierPurchases: "SupplierPurchases",
          supplierPurchaseItems: "SupplierPurchaseItems",
          supplierPayments: "SupplierPayments",
          supplierLedgerEntries: "SupplierLedgerEntries",
          customerWriteOffs: "CustomerWriteOffs",
          supplierWriteOffs: "SupplierWriteOffs",
          cashShifts: "CashShifts",
          staffPermissions: "StaffPermissions",
          lossPreventionEvents: "LossPreventionEvents",
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
        setOperationNotice({ type: "success", message: guardLabels.previewSuccess });
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
          "SupplierPurchases",
          "SupplierPurchaseItems",
          "SupplierPayments",
          "SupplierLedgerEntries",
          "StockMovements",
          "Bills",
          "BillItems",
          "BillItemBatchAllocations",
          "Payments",
          "CreditPayments",
          "CustomerLedgerEntries",
          "ReturnRefunds",
          "ReturnItems",
          "ReturnStockAllocations",
          "CustomerWriteOffs",
          "SupplierWriteOffs",
          "CashShifts",
          "StaffPermissions",
          "LossPreventionEvents",
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
        setOperationNotice({ type: "success", message: guardLabels.previewSuccess });
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
      setOperationNotice({ type: "error", message: guardLabels.previewError });
    } finally {
      setIsParsing(false);
      setActiveBackupOperation(null);
    }
  }

  function restoreInput(): Record<string, unknown> {
    if (isOnlineBackup && onlineData) return onlineData as Record<string, unknown>;
    return Object.fromEntries(tableProgress.map(t => [t.name, getTableRows(sqliteDb, t.name)]));
  }

  function runDryRunValidation() {
    setDryRunBlockers([]);
    try {
      if (!isOwner) throw new Error("Only the shop Owner can restore accounting data.");
      if (!manifest || manifest.SchemaVersion !== 1 || ![2, 3].includes(manifest.BackupVersion)) {
        throw new Error("This backup version is not supported for safe accounting restore.");
      }
      prepareRestore(restoreInput(), isOnlineBackup ? "native" : "desktop",
        { actorId: "00000000-0000-4000-8000-000000000000", branchId: null }, importActivityLog);
    } catch (error) {
      setDryRunBlockers([error instanceof Error ? error.message : "Backup validation failed. No shop data changed."]);
    }
    setDryRunChecked(true);
  }

  async function triggerBackupImport() {
    if (!isOwner || !manifest || !backupImportEnabled || activeBackupOperation) return;
    let activeJobId: string | null = null;
    let accountingCommitted = false;
    try {
      setActiveBackupOperation("import");
      setOperationNotice(null);
      setImportError(null);
      setRestoreCompleted(false);
      setSavedRestore(null);
      setImportPhase("Uploading/staging");
      setStep("progress");
      setImportReportLogs([]);
      const result = await restoreBackup(accountingImportAction, restoreInput(),
        isOnlineBackup ? "native" : "desktop", String(manifest.BackupVersion), importActivityLog,
        value => {
          setImportPhase(value.phase);
          accountingCommitted ||= value.committed === true;
          if (value.table) {
            const index = tableProgress.findIndex(t => restoreTable(t.name) === value.table);
            if (index >= 0) setCurrentProgressIndex(index);
            setCurrentChunkIndex(value.chunk ?? 0);
            setTotalChunks(value.chunks ?? 0);
          }
        }, id => {
          activeJobId = id;
          setJobId(id);
          sessionStorage.setItem("saledock-accounting-restore-job", id);
        });
      setTableProgress(previous => previous.map(t => {
        const table = restoreTable(t.name);
        const inserted = table ? result.counts[table] : 0;
        return { ...t, inserted, failedCount: 0, skippedCount: 0, status: inserted ? "completed" : "skipped" };
      }));
      setImportReportLogs(["Accounting and inventory committed atomically. Remaining requested data completed.",
        "Existing user accounts, credentials and shop branding were preserved."]);
      setRestoreCompleted(true);
      setOperationNotice({ type: "success", message: guardLabels.importSuccess });
    } catch (error) {
      let message = error instanceof Error ? error.message : "Restore could not be confirmed.";
      // A read-only receipt check distinguishes rollback from a lost response after COMMIT.
      if (activeJobId) {
        try {
          const saved = await accountingImportAction("get_job", { p_job: activeJobId });
          if (saved.success && saved.data?.ok === true) {
            accountingCommitted ||= !!saved.data.receipt;
            if (!accountingCommitted && ["staging", "sealed", "validation_failed", "ineligible"].includes(String(saved.data.state))) {
              await accountingImportAction("cancel_job", { p_job: activeJobId });
            }
          } else {
            message += " Check saved restore status before starting another import.";
          }
        } catch {
          message += " Check saved restore status before starting another import.";
        }
      }
      setImportPhase(accountingCommitted ? "Remaining restore incomplete" : "Restore not completed");
      setImportError(message);
      setImportReportLogs([accountingCommitted
        ? "Accounting data is saved. Remaining data is incomplete; do not repeat the whole import."
        : "No completed accounting receipt was observed. Check saved status before retrying."]);
      setOperationNotice({ type: "error", message: guardLabels.importError });
    } finally {
      setActiveBackupOperation(null);
      setStep("report");
    }
  }

  async function checkSavedRestore() {
    if (checkingRestore) return;
    const id = jobId ?? sessionStorage.getItem("saledock-accounting-restore-job");
    if (!id) { setImportError("No saved restore job is available in this tab."); return; }
    setJobId(id);
    setCheckingRestore(true);
    try {
      const result = await accountingImportAction("get_job", { p_job: id });
      if (!result.success || !result.data || result.data.ok !== true) {
        throw new Error(result.error ?? "Saved restore status is unavailable.");
      }
      const state = String(result.data.state);
      const committed = !!result.data.receipt;
      setSavedRestore({ state, committed, digest: String(result.data.digest ?? "") });
      setRestoreCompleted(state === "completed" && committed);
      setImportError(state === "completed" && committed ? null : committed
        ? "Accounting data is saved. Remaining data is incomplete; do not repeat the whole import."
        : "This restore has not committed accounting data.");
      setImportReportLogs([
        committed ? "Accounting commit is confirmed. Do not upload the accounting data again." : "Accounting commit is not confirmed."]);
      setStep("report");
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Saved restore status is unavailable.");
    } finally {
      setCheckingRestore(false);
    }
  }

  async function recoverSavedRestore(operation: "cancel_job" | "finalize_job") {
    if (!jobId || !savedRestore || checkingRestore) return;
    setCheckingRestore(true);
    try {
      const result = await accountingImportAction(operation, { p_job: jobId,
        ...(operation === "finalize_job" ? { p_digest: savedRestore.digest } : {}) });
      if (!result.success || result.data?.ok !== true) throw new Error(String(result.data?.message ?? result.error ?? "Restore could not be confirmed. Check saved status."));
      if (operation === "finalize_job") {
        // This only marks completion if every declared ancillary count is already present.
        await accountingImportAction("finish_job", { p_job: jobId });
      }
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Restore could not be confirmed.");
    } finally {
      setCheckingRestore(false);
    }
    await checkSavedRestore();
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
      {activeBackupOperation && (
        <BackupOperationOverlay operation={activeBackupOperation} labels={guardLabels} phase={importPhase} />
      )}
      {!activeBackupOperation && operationNotice && (
        <BackupOperationNotice notice={operationNotice} />
      )}
      {isOwner && !activeBackupOperation && (
        <button type="button" onClick={checkSavedRestore} disabled={checkingRestore} className="inline-flex items-center gap-2 text-sm text-blue-700 hover:underline disabled:opacity-50">
          <RefreshCw className="size-4" aria-hidden="true" /> Check Saved Restore Status
        </button>
      )}
      {savedRestore && !activeBackupOperation && (
        <p role="status" className="text-sm text-slate-600 dark:text-slate-300">Saved restore state: {savedRestore.state}</p>
      )}
      {savedRestore && !savedRestore.committed && !activeBackupOperation && (
        <div className="flex flex-wrap gap-3">
          {savedRestore.state === "ready" && (
            <button type="button" disabled={checkingRestore} onClick={() => recoverSavedRestore("finalize_job")} className="text-sm text-blue-700 hover:underline disabled:opacity-50">
              Finalize Saved Restore
            </button>
          )}
          {["staging", "sealed", "ready", "validation_failed", "ineligible"].includes(savedRestore.state) && (
            <button type="button" disabled={checkingRestore} onClick={() => recoverSavedRestore("cancel_job")} className="text-sm text-rose-700 hover:underline disabled:opacity-50">
              Discard Uncommitted Upload
            </button>
          )}
        </div>
      )}

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
            {backupImportEnabled && isOwner ? (
              <>
                <h4 className="text-md font-bold text-slate-900">Restore Backup ZIP</h4>
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
                <p className="mt-2 text-sm font-semibold text-slate-500">{!isOwner ? "Only the shop Owner can restore accounting data." : "Backup import has been disabled by the platform administrator."}</p>
              </div>
            )}
          </div>
        </div>

        {/* Danger Zone: Factory Reset Card — owner-only (matches the action + RPC owner guards) */}
        {!isOwner ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm text-center dark:border-slate-800 dark:bg-slate-900">
            <Lock className="mx-auto size-8 text-slate-300" />
            <p className="mt-2 text-sm font-semibold text-slate-500">Only the shop Owner can access factory reset.</p>
          </div>
        ) : factoryResetEnabled ? (
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
                Restore options →
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
                  User accounts and credentials are not restored. Desktop actor references use the authenticated Owner; native references must resolve within this organization. Existing shop branding is preserved.
                </p>
              </div>
            </div>

            {/* Checkbox Config options */}
            <div className="grid gap-4 md:grid-cols-2">
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
              <p className="text-xs text-slate-500">Source checks run here. The database validates all rows and target collisions before restoring.</p>
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
                  dryRunBlockers.length > 0
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
            ) : dryRunBlockers.length === 0 ? (
              <div className="rounded-xl bg-emerald-50 p-5 text-center border border-emerald-100 space-y-2">
                <ShieldCheck className="mx-auto size-12 text-emerald-600 animate-bounce" />
                <h4 className="text-sm font-bold text-emerald-800">Source checks passed</h4>
                <p className="text-xs text-emerald-700">Final database validation still applies. Existing-account collisions and missing references stop the restore.</p>
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
              <h3 className="text-lg font-black text-slate-950">4. Double Confirmation Required</h3>
              <p className="text-xs text-slate-500">Existing-account collisions stop the restore. A completed restore cannot be undone.</p>
            </div>
            <button
              onClick={() => setStep("dryrun")}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Back
            </button>
          </header>

          <div className="space-y-4">
            <label className="flex items-start gap-3 cursor-pointer rounded-xl bg-rose-50 border border-rose-100 p-4 text-xs text-rose-950">
              <input
                type="checkbox"
                checked={confirmCheckbox}
                onChange={(e) => setConfirmCheckbox(e.target.checked)}
                className="mt-1 size-4 rounded accent-rose-700 cursor-pointer"
              />
              <div>
                <p className="font-black text-rose-800">I understand this will append new snapshot records to the current organization, without merging existing accounts.</p>
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
                    !backupImportEnabled ||
                    activeBackupOperation === "import"
                  }
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-800 disabled:bg-slate-100 disabled:text-slate-400 cursor-pointer"
                >
                  {activeBackupOperation === "import" ? (
                    <RefreshCw className="size-4 animate-spin" />
                  ) : (
                    <Upload className="size-4" />
                  )}
                  {activeBackupOperation === "import" ? "Starting Restore..." : "Begin Online Restore"}
                </button>
              )
            ) : (
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
                    confirmText !== "IMPORT DESKTOP BACKUP" ||
                    !confirmCheckbox ||
                    dryRunBlockers.length > 0 ||
                    activeBackupOperation === "import"
                  }
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-800 disabled:bg-slate-100 disabled:text-slate-400 cursor-pointer"
                >
                  {activeBackupOperation === "import" ? (
                    <RefreshCw className="size-4 animate-spin" />
                  ) : (
                    <Upload className="size-4" />
                  )}
                  {activeBackupOperation === "import" ? "Starting Import..." : "Begin Desktop Restore"}
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
            <h3 className="text-lg font-black text-slate-900">{importPhase}</h3>
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
              <h3 className="text-lg font-black text-slate-900">6. Restore Report</h3>
              <p className="text-xs text-slate-500">Review the saved restore state and committed counts.</p>
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
            <div className="rounded-xl bg-rose-50 p-4 text-xs text-rose-950 border border-rose-100 flex gap-2">
              <AlertTriangle className="size-5 text-rose-600 shrink-0" />
              <div>
                <p className="font-bold text-sm">Import Process Halted</p>
                <p className="mt-1">{importError}</p>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {restoreCompleted && !hasCoreFailures ? (
                <div className="rounded-xl bg-emerald-50 p-4 text-xs text-emerald-950 border border-emerald-100 flex gap-2">
                  <CheckCircle className="size-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-sm text-emerald-900">Backup Restored Successfully</p>
                    <p className="mt-1 text-emerald-800">Accounting and inventory committed atomically. All requested remaining data completed.</p>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl bg-amber-50 p-4 text-xs text-amber-950 border border-amber-200 flex gap-2">
                  <AlertTriangle className="size-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-sm text-amber-900">Restore incomplete</p>
                    <p className="mt-1 text-amber-800">The restore is not complete. Review the saved state before retrying.</p>
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
                      <th className="px-4 py-2.5 text-right text-blue-700">Skipped</th>
                      <th className="px-4 py-2.5 text-right text-amber-700">Excluded</th>
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
        <ClientPortal>
          <div className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <div className="animate-scale-in w-full max-w-2xl bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
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
                      <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-4 text-emerald-950 flex gap-2">
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
                      <p className="font-bold text-rose-950">⚠️ Final Hard Confirmations Required</p>
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

                    {hasPassword ? (
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
                    ) : (
                      <div>
                        <label htmlFor="reset-shop" className="block font-bold text-slate-700">
                          Type Your Exact Organization Name to Confirm (Expected: <span className="text-rose-700 font-black">{shopName}</span>):
                        </label>
                        <input
                          id="reset-shop"
                          type="text"
                          value={typedShopName}
                          onChange={(e) => setTypedShopName(e.target.value)}
                          placeholder={shopName}
                          className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-rose-600 focus:bg-white text-slate-900 font-semibold"
                        />
                      </div>
                    )}

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
                          (hasPassword && !typedPassword) ||
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
        </ClientPortal>
      )}
    </div>
  );
}
