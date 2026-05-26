"use client";

import { useActionState, useState } from "react";
import {
  fetchExportDataAction,
  importDataAction,
  type ImportCategory,
  type ImportSupplier,
  type ImportProduct,
  type ImportCustomer,
  type ImportState
} from "./backup-actions";
import JSZip from "jszip";
import {
  Download,
  Upload,
  AlertTriangle,
  CheckCircle,
  FileSpreadsheet,
  FileJson,
  Database,
  RefreshCw,
  Archive
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

export function BackupTab() {
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // Import State
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [manifest, setManifest] = useState<ManifestData | null>(null);
  const [parsedPayload, setParsedPayload] = useState<{
    categories: ImportCategory[];
    suppliers: ImportSupplier[];
    products: ImportProduct[];
    customers: ImportCustomer[];
  } | null>(null);
  const [dbFileDetected, setDbFileDetected] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");

  const [importState, importAction, isImporting] = useActionState(
    async (state: ImportState | null) => {
      if (!parsedPayload) return { success: false, error: "No data payload loaded to import." };
      return importDataAction(state, parsedPayload);
    },
    null
  );

  // Helper: Convert array of objects to CSV string
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

  // Handle Export
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

      // 1. Create Manifest
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

      // 2. Create raw JSON dump
      zip.folder("data")?.file("gadgetzone-online.json", JSON.stringify(db, null, 2));

      // 3. Create CSV representations for portability
      const csvFolder = zip.folder("csv");
      if (csvFolder) {
        csvFolder.file("products.csv", convertToCSV(db.products));
        csvFolder.file("customers.csv", convertToCSV(db.customers));
        csvFolder.file("suppliers.csv", convertToCSV(db.suppliers));
        csvFolder.file("invoices.csv", convertToCSV(db.invoices));
        csvFolder.file("invoice_items.csv", convertToCSV(db.invoiceItems));
        csvFolder.file("payments.csv", convertToCSV(db.payments));
        csvFolder.file("expenses.csv", convertToCSV(db.expenses));
        csvFolder.file("repairs.csv", convertToCSV(db.repairs));
        csvFolder.file("daily_closings.csv", convertToCSV(db.closings));
        csvFolder.file("audit_logs.csv", convertToCSV(db.auditLogs));
      }

      // 4. Generate Zip File & Trigger Download
      const content = await zip.generateAsync({ type: "blob" });
      const url = window.URL.createObjectURL(content);
      const a = document.createElement("a");
      a.href = url;
      a.download = `gadgetzone_backup_${new Date().toISOString().split("T")[0]}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

    } catch (err) {
      const error = err as Error;
      console.error(error);
      setExportError(error.message || "An error occurred during export.");
    } finally {
      setIsExporting(false);
    }
  }

  // Handle Zip File Upload & Parse
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setZipFile(file);
      setIsParsing(true);
      setParseError(null);
      setManifest(null);
      setParsedPayload(null);
      setDbFileDetected(null);
      setConfirmText("");

      const zip = await JSZip.loadAsync(file);

      // Check for manifest
      const manifestFile = zip.file("manifest.json");
      if (!manifestFile) {
        throw new Error("Invalid backup file: manifest.json is missing from the ZIP root.");
      }

      const manifestStr = await manifestFile.async("string");
      const manifestObj = JSON.parse(manifestStr) as ManifestData;
      setManifest(manifestObj);

      // Check for DB file (indicates desktop backup)
      const dbFile = zip.file("data/gadgetzonepos.db");
      if (dbFile) {
        const uncompressedSize = (dbFile as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0;
        setDbFileDetected(`data/gadgetzonepos.db (${uncompressedSize} bytes)`);
      }

      // Check for online JSON dump
      const onlineDumpFile = zip.file("data/gadgetzone-online.json");
      if (onlineDumpFile) {
        const dumpStr = await onlineDumpFile.async("string");
        const dumpObj = JSON.parse(dumpStr);
        setParsedPayload({
          categories: (dumpObj.categories || []) as ImportCategory[],
          suppliers: (dumpObj.suppliers || []) as ImportSupplier[],
          products: (dumpObj.products || []) as ImportProduct[],
          customers: (dumpObj.customers || []) as ImportCustomer[]
        });
      } else if (dbFile) {
        // Desktop backup format detected. Needs custom parsing block.
        // We will show manifest preview and guide the user.
        setParsedPayload(null);
      } else {
        throw new Error("No data/gadgetzone-online.json dump file found in the zip archives.");
      }

    } catch (err) {
      const error = err as Error;
      console.error(error);
      setParseError(error.message || "Failed to parse backup ZIP file.");
    } finally {
      setIsParsing(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Information Header */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-start gap-4">
          <div className="hidden rounded-xl bg-blue-50 p-3 text-blue-700 sm:block">
            <Archive className="size-6" />
          </div>
          <div>
            <h3 className="text-lg font-black text-slate-950">Desktop & Online Backup Utility</h3>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Download your complete organization store profile, transaction data, inventory logs, and catalogs in a portable ZIP file.
              You can also upload a backup ZIP to inspect and restore your categories, suppliers, customers, and catalog items.
            </p>
          </div>
        </div>
      </div>

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
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-800 disabled:bg-slate-100 disabled:text-slate-400"
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
          <h4 className="text-md font-bold text-slate-900">Upload & Restore Backup</h4>
          <p className="mt-1 text-xs text-slate-500">
            Inspect the contents of a ZIP file and selectively restore core items.
          </p>

          <div className="mt-6 space-y-4">
            {/* File Dropzone */}
            <div className="relative flex min-h-[120px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-center hover:bg-slate-100/50">
              <input
                type="file"
                accept=".zip"
                onChange={handleFileUpload}
                disabled={isParsing || isImporting}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
              <Upload className="size-8 text-slate-400" />
              <p className="mt-2 text-xs font-bold text-slate-700">
                {zipFile ? zipFile.name : "Select or drag Backup ZIP file"}
              </p>
              <p className="mt-1 text-[10px] text-slate-500">Supports .zip backups under 50MB</p>
            </div>

            {isParsing && (
              <div className="flex items-center justify-center gap-2 text-sm text-slate-500">
                <RefreshCw className="size-4 animate-spin" />
                <span>Reading ZIP archive structure...</span>
              </div>
            )}

            {parseError && (
              <div className="flex items-center gap-2 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800">
                <AlertTriangle className="size-4 shrink-0" />
                <span>{parseError}</span>
              </div>
            )}

            {/* Manifest / Table Count Inspector */}
            {manifest && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Archive Details</span>
                  <span className="rounded-lg bg-blue-50 px-2 py-0.5 text-[10px] font-black text-blue-700 uppercase">
                    {manifest.AppName}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-y-2 text-xs text-slate-600">
                  <div>Backup Version: <strong>{manifest.BackupVersion}</strong></div>
                  <div>Schema Version: <strong>{manifest.SchemaVersion}</strong></div>
                  <div>Type: <strong>{manifest.BackupType}</strong></div>
                  <div>Created At: <strong>{manifest.CreatedAt ? new Date(manifest.CreatedAt).toLocaleDateString() : "—"}</strong></div>
                </div>

                {dbFileDetected && (
                  <div className="rounded-lg bg-amber-50 p-2.5 text-[11px] leading-5 text-amber-900 border border-amber-100 space-y-1">
                    <p className="font-bold flex items-center gap-1">
                      <Database className="size-3.5" />
                      Desktop SQLite Database Detected
                    </p>
                    <p className="text-[10px]">
                      Contains: <code>{dbFileDetected}</code>. Offline full migration requires raw SQL mapping.
                      Contact your admin to run manual desktop migrations.
                    </p>
                  </div>
                )}

                {/* Scoped Record Counts */}
                {parsedPayload && (
                  <div className="border-t border-slate-200 pt-2 space-y-2">
                    <p className="text-xs font-bold text-slate-700">Restorable Collections Found:</p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="flex items-center gap-1.5 bg-white p-2 rounded-lg border border-slate-100">
                        <FileJson className="size-4 text-blue-500" />
                        <span>Categories: <strong>{parsedPayload.categories.length}</strong></span>
                      </div>
                      <div className="flex items-center gap-1.5 bg-white p-2 rounded-lg border border-slate-100">
                        <FileJson className="size-4 text-blue-500" />
                        <span>Suppliers: <strong>{parsedPayload.suppliers.length}</strong></span>
                      </div>
                      <div className="flex items-center gap-1.5 bg-white p-2 rounded-lg border border-slate-100">
                        <FileJson className="size-4 text-blue-500" />
                        <span>Products: <strong>{parsedPayload.products.length}</strong></span>
                      </div>
                      <div className="flex items-center gap-1.5 bg-white p-2 rounded-lg border border-slate-100">
                        <FileJson className="size-4 text-blue-500" />
                        <span>Customers: <strong>{parsedPayload.customers.length}</strong></span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Confirm & Execute Import */}
            {parsedPayload && (
              <form action={importAction} className="mt-4 space-y-3">
                <div className="rounded-lg bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-950 border border-amber-200 flex gap-2">
                  <AlertTriangle className="size-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <strong>Data deduplication active:</strong> Records with matching SKUs, names, or phone numbers will be preserved instead of duplicated. All imported items are assigned to this organization.
                  </div>
                </div>

                <div>
                  <label htmlFor="confirm-import" className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                    To confirm restore, type <span className="text-blue-700">CONFIRM IMPORT</span>:
                  </label>
                  <input
                    id="confirm-import"
                    type="text"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder="CONFIRM IMPORT"
                    disabled={isImporting}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-700 focus:bg-white"
                  />
                </div>

                {importState?.error && (
                  <div className="flex items-center gap-2 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800">
                    <AlertTriangle className="size-4 shrink-0" />
                    <span>{importState.error}</span>
                  </div>
                )}

                {importState?.success && (
                  <div className="rounded-xl bg-emerald-50 px-4 py-3 text-xs text-emerald-800 space-y-1">
                    <p className="font-bold flex items-center gap-1">
                      <CheckCircle className="size-4" />
                      Restore Completed Successfully
                    </p>
                    {importState.importedCounts && (
                      <p>
                        Added: {importState.importedCounts.categories} categories, {importState.importedCounts.suppliers} suppliers, {importState.importedCounts.products} products, and {importState.importedCounts.customers} customers.
                      </p>
                    )}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={confirmText !== "CONFIRM IMPORT" || isImporting}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-800 disabled:bg-slate-100 disabled:text-slate-400"
                >
                  {isImporting ? (
                    <>
                      <RefreshCw className="size-4 animate-spin" />
                      Importing Records...
                    </>
                  ) : (
                    <>
                      <Upload className="size-4" />
                      Import Scoped Data
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
