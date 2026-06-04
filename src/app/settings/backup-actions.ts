"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentContext } from "@/lib/auth/session";
import { logAudit } from "@/lib/audit";
import { revalidatePath } from "next/cache";

async function isPlatformSettingEnabled(key: string): Promise<boolean> {
  try {
    const admin = await createAdminClient();
    const { data } = await admin
      .from("platform_settings")
      .select("value")
      .eq("key", key)
      .single();
    return data?.value !== false && data?.value !== "false";
  } catch {
    return true;
  }
}

export type ExportData = {
  categories: unknown[];
  suppliers: unknown[];
  products: unknown[];
  lots: unknown[];
  movements: unknown[];
  customers: unknown[];
  invoices: unknown[];
  invoiceItems: unknown[];
  payments: unknown[];
  ledgerEntries: unknown[];
  returns: unknown[];
  returnItems: unknown[];
  returnStockAllocations: unknown[];
  expenses: unknown[];
  repairs: unknown[];
  closings: unknown[];
  auditLogs: unknown[];
  supplierPurchases: unknown[];
  supplierPurchaseItems: unknown[];
  supplierPayments: unknown[];
  supplierLedgerEntries: unknown[];
};

export type ImportJobState = {
  success: boolean;
  jobId?: string;
  error?: string;
  counts?: Record<string, number>;
};

export type ChunkImportState = {
  success: boolean;
  inserted: number;
  skipped: number;
  /** Rows skipped because they reference a missing parent (orphans). */
  skippedOrphan?: number;
  failed: number;
  warnings: string[];
  error?: string;
};

export type OrphanPolicy = "drop" | "stop";

// Start an Import Job
export async function startImportJobAction(
  sourceApp: string,
  backupVersion: string,
  schemaVersion: string,
  manifestObj: unknown,
  countsObj: Record<string, number>
): Promise<ImportJobState> {
  try {
    const backupImportEnabled = await isPlatformSettingEnabled("backup_import_enabled");
    if (!backupImportEnabled) {
      return { success: false, error: "Backup import has been disabled by the platform administrator." };
    }

    const { user, profile } = await getCurrentContext();
    if (!user || !profile) {
      return { success: false, error: "Not authenticated." };
    }

    if (profile.role !== "owner" && profile.role !== "admin") {
      logAudit({ module: "settings", action: "permission.denied", details: `Backup import start denied for role ${profile.role}` });
      return { success: false, error: "Only Owners and Admins can export data." };
    }

    const orgId = profile.organization_id;
    if (!orgId) {
      return { success: false, error: "No organization assigned." };
    }

    const supabase = await createClient();

    // Create the import job record
    const { data, error } = await supabase
      .from("import_jobs")
      .insert({
        organization_id: orgId,
        branch_id: profile.branch_id,
        imported_by: profile.id,
        source_app: sourceApp,
        source_backup_version: backupVersion,
        source_schema_version: schemaVersion,
        manifest: manifestObj,
        status: "importing",
        started_at: new Date().toISOString(),
        counts: countsObj
      })
      .select("id")
      .single();

    if (error) {
      throw new Error("Failed to create import job: " + error.message);
    }

    // Log the backup import start
    await logAudit({
      module: "settings",
      action: "backup.import_started",
      details: `Owner initiated desktop backup import from ${sourceApp} (Version: ${backupVersion}). Job ID: ${data.id}.`
    });

    return { success: true, jobId: data.id, counts: countsObj };
  } catch (err: unknown) {
    console.error("Failed to start import job:", err);
    const msg = err instanceof Error ? err.message : "Unknown error.";
    return { success: false, error: msg };
  }
}

// Complete or Fail Import Job
export async function updateImportJobStatusAction(
  jobId: string,
  status: "completed" | "failed" | "cancelled",
  errorMessage?: string
): Promise<{ success: boolean }> {
  try {
    const { user, profile } = await getCurrentContext();
    if (!user || !profile || !profile.organization_id) {
      return { success: false };
    }

    const supabase = await createClient();
    const updatePayload: Record<string, unknown> = {
      status,
      completed_at: new Date().toISOString()
    };
    if (errorMessage) {
      updatePayload.error_message = errorMessage;
    }

    await supabase
      .from("import_jobs")
      .update(updatePayload)
      .eq("organization_id", profile.organization_id)
      .eq("id", jobId);

    // Log the completion/failure audit
    await logAudit({
      module: "settings",
      action: status === "completed" ? "backup.import_completed" : "backup.import_failed",
      details: status === "completed"
        ? `Owner completed desktop backup import successfully. Job ID: ${jobId}.`
        : `Owner's desktop backup import failed or was cancelled. Job ID: ${jobId}. Error: ${errorMessage || "None"}`
    });

    revalidatePath("/settings");
    revalidatePath("/products");
    revalidatePath("/customers");
    revalidatePath("/invoices");
    revalidatePath("/returns");
    revalidatePath("/repairs");
    revalidatePath("/expenses");
    revalidatePath("/audit-log");

    return { success: true };
  } catch (err) {
    console.error("Failed to update import job status:", err);
    return { success: false };
  }
}

// Helper: Batch resolve mappings for parent foreign keys
async function resolveTargetIdsBatch(
  supabase: unknown,
  orgId: string,
  jobId: string,
  sourceTable: string,
  sourceIds: string[]
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const uniqueIds = Array.from(new Set(sourceIds.filter(Boolean)));
  if (uniqueIds.length === 0) return result;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = supabase as any;

  // Chunk large source ID parameters to avoid PostgreSQL param limits
  const size = 100;
  for (let i = 0; i < uniqueIds.length; i += size) {
    const chunkIds = uniqueIds.slice(i, i + size);
    const { data, error } = await client
      .from("import_row_mappings")
      .select("source_id, target_id")
      .eq("organization_id", orgId)
      .eq("import_job_id", jobId)
      .eq("source_table", sourceTable)
      .in("source_id", chunkIds);

    if (!error && data) {
      for (const row of data) {
        result.set(row.source_id.toString(), row.target_id);
      }
    }
  }
  return result;
}

// Helper: Insert mappings in chunks
async function saveRowMappingsBatch(
  supabase: unknown,
  orgId: string,
  jobId: string,
  sourceTable: string,
  targetTable: string,
  mappings: Array<{ sourceId: string; targetId: string }>
) {
  if (mappings.length === 0) return;
  const insertPayload = mappings.map(m => ({
    organization_id: orgId,
    import_job_id: jobId,
    source_table: sourceTable,
    source_id: m.sourceId.toString(),
    target_table: targetTable,
    target_id: m.targetId
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = supabase as any;

  const size = 100;
  for (let i = 0; i < insertPayload.length; i += size) {
    await client
      .from("import_row_mappings")
      .insert(insertPayload.slice(i, i + size));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Desktop → online field mapping helpers.
//
// Desktop SQLite uses C#-style PascalCase column names that don't match the
// online (Supabase) snake_case schema. The desktop schema also drifted across
// versions (e.g. Products has `ItemName` not `Name`, `Stock` not
// `StockQuantity`, `MinimumStock` not `MinStock`; Bills has `BillDate` not
// `Date`; BillItems has `Qty` not `Quantity` and `Price` not `UnitPrice`;
// ReturnItems has `QtyReturned` not `Quantity`). These helpers + enum
// normalisers replace the brittle direct-field-access pattern that caused
// every product to be skipped with "empty name" during the first real import.
// ─────────────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pickString(row: any, keys: string[]): string {
  for (const k of keys) {
    const v = row?.[k];
    if (v === undefined || v === null) continue;
    const s = String(v).trim();
    if (s.length > 0) return s;
  }
  return "";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pickNumber(row: any, keys: string[], fallback = 0): number {
  for (const k of keys) {
    const v = row?.[k];
    if (v === undefined || v === null || v === "") continue;
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pickBool(row: any, keys: string[], fallback = false): boolean {
  for (const k of keys) {
    const v = row?.[k];
    if (v === undefined || v === null || v === "") continue;
    if (typeof v === "boolean") return v;
    if (typeof v === "number") return v !== 0;
    if (typeof v === "string") {
      const s = v.trim().toLowerCase();
      if (["true", "1", "yes", "y"].includes(s)) return true;
      if (["false", "0", "no", "n"].includes(s)) return false;
    }
  }
  return fallback;
}

function assertNonNeg(
  value: number,
  fieldLabel: string,
  rowId: string | number | undefined | null,
): string | null {
  if (value < 0) {
    return `Negative ${fieldLabel} (${value}) in row ID ${rowId ?? "?"}. Value must be >= 0.`;
  }
  return null;
}

function normalizeInvoiceStatus(
  raw: unknown,
  amountPaid: number,
  grandTotal: number,
  balanceDue: number,
): "paid" | "partial" | "unpaid" | "draft" | "void" {
  const v = String(raw ?? "").trim().toLowerCase();
  if (v === "paid") return "paid";
  if (v === "partial") return "partial";
  if (v === "unpaid" || v === "credit" || v === "due") return "unpaid";
  if (v === "void" || v === "cancelled") return "void";
  if (v === "draft") return "draft";
  // Derive from money values when status is missing/unknown.
  if (grandTotal <= 0) return "paid";
  if (amountPaid >= grandTotal) return "paid";
  if (amountPaid > 0) return "partial";
  if (balanceDue > 0) return "unpaid";
  return "paid";
}

function normalizePaymentMethod(
  raw: unknown,
):
  | "cash"
  | "card"
  | "easypaisa"
  | "jazzcash"
  | "bank_transfer"
  | "customer_credit" {
  const v = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (v === "cash") return "cash";
  if (v === "card" || v === "debit_card" || v === "credit_card") return "card";
  if (v === "easypaisa" || v === "easy_paisa") return "easypaisa";
  if (v === "jazzcash" || v === "jazz_cash") return "jazzcash";
  if (
    v === "bank_transfer" ||
    v === "banktransfer" ||
    v === "bank" ||
    v === "transfer"
  )
    return "bank_transfer";
  if (
    v === "customer_credit" ||
    v === "credit" ||
    v === "store_credit" ||
    v === "on_account"
  )
    return "customer_credit";
  return "cash";
}

function normalizeProductType(raw: unknown): "product" | "service" {
  const v = String(raw ?? "").trim().toLowerCase();
  return v === "service" ? "service" : "product";
}

function normalizeReturnStatus(raw: unknown): "completed" | "cancelled" {
  // Online enum only has 'completed' | 'cancelled'. The desktop "Needs
  // Approval" / "Approved" / "Rejected" semantics collapse as follows.
  const v = String(raw ?? "").trim().toLowerCase().replace(/\s+/g, "_");
  if (v === "rejected" || v === "cancelled" || v === "void" || v === "voided") return "cancelled";
  // Everything else (approved, needs_approval, completed, pending, blank) is
  // treated as a completed return — it has line items and a refund.
  return "completed";
}

function normalizeRepairStatus(
  raw: unknown,
):
  | "received"
  | "waiting_for_parts"
  | "in_progress"
  | "completed"
  | "delivered"
  | "cancelled" {
  const v = String(raw ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (v === "received" || v === "intake") return "received";
  if (v === "waiting_for_parts" || v === "waitingforparts") return "waiting_for_parts";
  if (v === "in_progress" || v === "inprogress") return "in_progress";
  if (v === "completed" || v === "done") return "completed";
  if (v === "delivered" || v === "handedover" || v === "handed_over") return "delivered";
  if (v === "cancelled" || v === "canceled" || v === "void") return "cancelled";
  return "received";
}

// Client-Server Chunk Importer
export async function importTableChunkAction(
  jobId: string,
  tableName: string,
  rows: unknown[],
  orphanPolicy?: OrphanPolicy,
): Promise<ChunkImportState> {
  let inserted = 0;
  let skipped = 0;
  let skippedOrphan = 0;
  let failed = 0;
  const warnings: string[] = [];

  try {
    const { user, profile } = await getCurrentContext();
    if (!user || !profile || !profile.organization_id) {
      return { success: false, inserted: 0, skipped: 0, skippedOrphan: 0, failed: 0, warnings, error: "Not authenticated." };
    }

    // Only owner and admin can import data chunks (same gate as startImportJobAction)
    if (profile.role !== "owner" && profile.role !== "admin") {
      logAudit({ module: "settings", action: "permission.denied", details: `Import chunk denied for role ${profile.role}` });
      return { success: false, inserted: 0, skipped: 0, skippedOrphan: 0, failed: 0, warnings, error: "Only owners and admins can import data." };
    }

    const orgId = profile.organization_id;
    const branchId = profile.branch_id;
    const supabase = await createClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let typedRows = rows as any[];
    const mappingsToSave: Array<{ sourceId: string; targetId: string }> = [];

    // ----------------------------------------------------------------------
    // Server-side orphan guard. Tables with a structural FK dependency on
    // sibling rows in the same backup are checked here; if the chunk has any
    // orphans, behaviour depends on `orphanPolicy`:
    //   - "stop" or missing: throw with a clear message
    //   - "drop"            : silently filter the orphan rows from this chunk
    // The client wizard sets this from the user's explicit radio choice in
    // the dry-run step. Both layers must agree before any insert runs.
    // ----------------------------------------------------------------------
    const orphanGuardedTables = new Set([
      "CustomerLedgerEntries",
      "CreditPayments",
      "ReturnRefunds",
      "ReturnItems",
      "BillItems",
      "BillItemBatchAllocations",
      "StockMovements",
      "ProductStockLots",
      "RepairJobs",
    ]);

    if (orphanGuardedTables.has(tableName)) {
      // Build the set of valid parent source-IDs by reading the row mappings
      // already persisted earlier in this job (parents are imported first).
      const parentLookup = async (parentTableName: string) => {
        const { data } = await supabase
          .from("import_row_mappings")
          .select("source_id")
          .eq("organization_id", orgId)
          .eq("import_job_id", jobId)
          .eq("source_table", parentTableName);
        return new Set<string>((data ?? []).map((r) => String(r.source_id)));
      };

      const checks: { rule: string; parent: string; getFk: (row: { [k: string]: unknown }) => unknown; allowZero?: boolean }[] = [];
      if (tableName === "CustomerLedgerEntries") checks.push({ rule: "CustomerLedgerEntries.CustomerId not in Customers", parent: "Customers", getFk: (r) => r.CustomerId });
      if (tableName === "CreditPayments") checks.push({ rule: "CreditPayments.CustomerId not in Customers", parent: "Customers", getFk: (r) => r.CustomerId });
      if (tableName === "ReturnRefunds") checks.push({ rule: "ReturnRefunds.BillId not in Bills", parent: "Bills", getFk: (r) => r.BillId });
      if (tableName === "ReturnItems") checks.push({ rule: "ReturnItems.ReturnId not in ReturnRefunds", parent: "ReturnRefunds", getFk: (r) => r.ReturnId });
      if (tableName === "BillItems") checks.push({ rule: "BillItems.BillId not in Bills", parent: "Bills", getFk: (r) => r.BillId });
      if (tableName === "BillItemBatchAllocations") checks.push({ rule: "BillItemBatchAllocations.BillItemId not in BillItems", parent: "BillItems", getFk: (r) => r.BillItemId });
      if (tableName === "StockMovements") checks.push({ rule: "StockMovements.ProductId not in Products", parent: "Products", getFk: (r) => r.ProductId });
      if (tableName === "ProductStockLots") checks.push({ rule: "ProductStockLots.ProductId not in Products", parent: "Products", getFk: (r) => r.ProductId });
      if (tableName === "RepairJobs") checks.push({ rule: "RepairJobs.CustomerId not in Customers (CustomerId=0/null walk-in is OK)", parent: "Customers", getFk: (r) => r.CustomerId, allowZero: true });

      const parentSets = new Map<string, Set<string>>();
      for (const c of checks) {
        if (!parentSets.has(c.parent)) {
          parentSets.set(c.parent, await parentLookup(c.parent));
        }
      }

      const ok: typeof typedRows = [];
      const orphanRows: typeof typedRows = [];
      for (const row of typedRows) {
        let isOrphan = false;
        for (const c of checks) {
          const fk = c.getFk(row);
          if (fk === undefined || fk === null || fk === "") continue;
          if (c.allowZero && (fk === 0 || fk === "0")) continue;
          const set = parentSets.get(c.parent)!;
          if (!set.has(String(fk))) {
            isOrphan = true;
            break;
          }
        }
        if (isOrphan) orphanRows.push(row);
        else ok.push(row);
      }

      if (orphanRows.length > 0) {
        if (orphanPolicy !== "drop") {
          return {
            success: false,
            inserted: 0,
            skipped: 0,
            skippedOrphan: 0,
            failed: 0,
            warnings,
            error: `Server rejected ${orphanRows.length} orphan row(s) for ${tableName}. orphanPolicy must be "drop" to import them as skipped. ${checks.map((c) => c.rule).join("; ")}`,
          };
        }
        skippedOrphan += orphanRows.length;
        warnings.push(
          `Server dropped ${orphanRows.length} orphan row(s) for ${tableName} (orphanPolicy=drop).`,
        );
        typedRows = ok;
      }
    }
    if (typedRows.length === 0) {
      return { success: true, inserted: 0, skipped: 0, skippedOrphan, failed: 0, warnings };
    }

    if (tableName === "Categories") {
      const { data: existing } = await supabase
        .from("product_categories")
        .select("id, name")
        .eq("organization_id", orgId);
      const catMap = new Map(existing?.map(c => [c.name.trim().toLowerCase(), c.id]) ?? []);

      for (const row of typedRows) {
        const name = row.Name?.toString().trim();
        if (!name) {
          failed++;
          warnings.push(`Skipped category with empty name (ID: ${row.Id}).`);
          continue;
        }
        const lowerName = name.toLowerCase();
        if (catMap.has(lowerName)) {
          const targetId = catMap.get(lowerName)!;
          mappingsToSave.push({ sourceId: row.Id.toString(), targetId });
          skipped++;
        } else {
          const { data, error } = await supabase
            .from("product_categories")
            .insert({
              organization_id: orgId,
              name,
              description: row.Description?.toString() || "",
              is_active: row.IsActive === undefined ? true : Boolean(row.IsActive)
            })
            .select("id")
            .single();

          if (error) {
            failed++;
            warnings.push(`Category insert error: ${error.message} (Category: ${name}).`);
          } else {
            catMap.set(lowerName, data.id);
            mappingsToSave.push({ sourceId: row.Id.toString(), targetId: data.id });
            inserted++;
          }
        }
      }
      await saveRowMappingsBatch(supabase, orgId, jobId, "Categories", "product_categories", mappingsToSave);

    } else if (tableName === "Suppliers") {
      const { data: existing } = await supabase
        .from("suppliers")
        .select("id, name")
        .eq("organization_id", orgId);
      const supMap = new Map(existing?.map(s => [s.name.trim().toLowerCase(), s.id]) ?? []);

      for (const row of typedRows) {
        const name = row.Name?.toString().trim();
        if (!name) {
          failed++;
          warnings.push(`Skipped supplier with empty name (ID: ${row.Id}).`);
          continue;
        }
        const lowerName = name.toLowerCase();
        if (supMap.has(lowerName)) {
          const targetId = supMap.get(lowerName)!;
          mappingsToSave.push({ sourceId: row.Id.toString(), targetId });
          skipped++;
        } else {
          const { data, error } = await supabase
            .from("suppliers")
            .insert({
              organization_id: orgId,
              name,
              company: row.Company?.toString() || "",
              phone: row.Phone?.toString() || "",
              email: row.Email?.toString() || "",
              address: row.Address?.toString() || "",
              notes: row.Notes?.toString() || "",
              is_active: row.IsActive === undefined ? true : Boolean(row.IsActive)
            })
            .select("id")
            .single();

          if (error) {
            failed++;
            warnings.push(`Supplier insert error: ${error.message} (Supplier: ${name}).`);
          } else {
            supMap.set(lowerName, data.id);
            mappingsToSave.push({ sourceId: row.Id.toString(), targetId: data.id });
            inserted++;
          }
        }
      }
      await saveRowMappingsBatch(supabase, orgId, jobId, "Suppliers", "suppliers", mappingsToSave);

    } else if (tableName === "Customers") {
      const { data: existing } = await supabase
        .from("customers")
        .select("id, name, phone, email")
        .eq("organization_id", orgId);
      
      const phoneMap = new Map(existing?.filter(c => c.phone).map(c => [c.phone!.trim(), c.id]) ?? []);
      const emailMap = new Map(existing?.filter(c => c.email).map(c => [c.email!.trim().toLowerCase(), c.id]) ?? []);
      const nameMap = new Map(existing?.map(c => [c.name.trim().toLowerCase(), c.id]) ?? []);

      for (const row of typedRows) {
        const name = row.Name?.toString().trim();
        if (!name) {
          failed++;
          warnings.push(`Skipped customer with empty name (ID: ${row.Id}).`);
          continue;
        }
        const phone = row.Phone?.toString().trim();
        const email = row.Email?.toString().trim().toLowerCase();

        let matchedId: string | null = null;
        if (phone && phoneMap.has(phone)) matchedId = phoneMap.get(phone)!;
        else if (email && emailMap.has(email)) matchedId = emailMap.get(email)!;
        else if (nameMap.has(name.toLowerCase())) matchedId = nameMap.get(name.toLowerCase())!;

        if (matchedId) {
          mappingsToSave.push({ sourceId: row.Id.toString(), targetId: matchedId });
          skipped++;
        } else {
          const outstandingBalance = Number(row.OutstandingBalance || 0);
          const err = assertNonNeg(outstandingBalance, "outstanding_balance", row.Id);
          if (err) { failed++; warnings.push(err); continue; }

          const { data, error } = await supabase
            .from("customers")
            .insert({
              organization_id: orgId,
              name,
              phone: phone || "",
              email: email || "",
              address: row.Address?.toString() || "",
              notes: row.Notes?.toString() || "",
              outstanding_balance: outstandingBalance
            })
            .select("id")
            .single();

          if (error) {
            failed++;
            warnings.push(`Customer insert error: ${error.message} (Customer: ${name}).`);
          } else {
            if (phone) phoneMap.set(phone, data.id);
            if (email) emailMap.set(email, data.id);
            nameMap.set(name.toLowerCase(), data.id);
            mappingsToSave.push({ sourceId: row.Id.toString(), targetId: data.id });
            inserted++;
          }
        }
      }
      await saveRowMappingsBatch(supabase, orgId, jobId, "Customers", "customers", mappingsToSave);

    } else if (tableName === "Products") {
      const { data: existing } = await supabase
        .from("products")
        .select("id, name, sku, barcode, type")
        .eq("organization_id", orgId);

      const skuMap = new Map(existing?.filter(p => p.sku).map(p => [p.sku!.trim().toLowerCase(), p.id]) ?? []);
      const barcodeMap = new Map(existing?.filter(p => p.barcode).map(p => [p.barcode!.trim().toLowerCase(), p.id]) ?? []);
      const nameTypeMap = new Map(existing?.map(p => [`${p.name.trim().toLowerCase()}-${p.type}`, p.id]) ?? []);

      // Desktop Products.Category is a TEXT field that references Categories.Name (not Id).
      // We resolve the online product_category id by category-name lookup against
      // the categories we already imported in this org.
      const { data: existingCats } = await supabase
        .from("product_categories")
        .select("id, name")
        .eq("organization_id", orgId);
      const catByName = new Map(
        existingCats?.map((c) => [c.name.trim().toLowerCase(), c.id]) ?? [],
      );

      // SupplierId is INTEGER (0 = none). Lookup via the import_row_mappings table.
      const supplierIds = typedRows
        .map((r) => r.SupplierId?.toString())
        .filter((v) => v && v !== "0");
      const supMappings = await resolveTargetIdsBatch(supabase, orgId, jobId, "Suppliers", supplierIds);

      for (const row of typedRows) {
        const name = pickString(row, ["ItemName", "ProductName", "Name", "name"]);
        if (!name) {
          failed++;
          warnings.push(`Skipped product with empty name (ID: ${row.Id}). Checked ItemName, ProductName, Name.`);
          continue;
        }
        const sku = pickString(row, ["Sku", "SKU", "sku"]).toLowerCase();
        const barcode = pickString(row, ["Barcode", "barcode"]).toLowerCase();
        const type = normalizeProductType(row.Type ?? row.type);

        let matchedId: string | null = null;
        if (sku && skuMap.has(sku)) matchedId = skuMap.get(sku)!;
        else if (barcode && barcodeMap.has(barcode)) matchedId = barcodeMap.get(barcode)!;
        else if (nameTypeMap.has(`${name.toLowerCase()}-${type}`)) matchedId = nameTypeMap.get(`${name.toLowerCase()}-${type}`)!;

        if (matchedId) {
          mappingsToSave.push({ sourceId: row.Id.toString(), targetId: matchedId });
          skipped++;
        } else {
          const categoryName = pickString(row, ["Category", "CategoryName", "category"]).toLowerCase();
          const catId = categoryName ? (catByName.get(categoryName) ?? null) : null;
          const supplierRaw = row.SupplierId?.toString();
          const supId =
            supplierRaw && supplierRaw !== "0" ? (supMappings.get(supplierRaw) ?? null) : null;

          const purchasePrice = pickNumber(row, ["PurchasePrice", "purchase_price"]);
          const salePrice = pickNumber(row, ["SalePrice", "sale_price"]);
          const stockQty = pickNumber(row, ["Stock", "StockQuantity", "stock_quantity"]);
          const minStock = pickNumber(row, ["MinimumStock", "MinStock", "minimum_stock"]);
          const commAmount = pickNumber(row, ["DefaultCommissionAmount", "default_commission_amount"]);
          const commPct = pickNumber(row, ["DefaultCommissionPercent", "default_commission_percent"]);

          const vErr =
            assertNonNeg(purchasePrice, "purchase_price", row.Id) ??
            assertNonNeg(salePrice, "sale_price", row.Id) ??
            assertNonNeg(stockQty, "stock_quantity", row.Id) ??
            assertNonNeg(minStock, "minimum_stock", row.Id) ??
            assertNonNeg(commAmount, "default_commission_amount", row.Id) ??
            assertNonNeg(commPct, "default_commission_percent", row.Id);
          if (vErr) { failed++; warnings.push(vErr); continue; }

          const { data, error } = await supabase
            .from("products")
            .insert({
              organization_id: orgId,
              category_id: catId,
              supplier_id: supId,
              name,
              sku: sku || null,
              barcode: pickString(row, ["Barcode"]) || null,
              type,
              purchase_price: purchasePrice,
              sale_price: salePrice,
              stock_quantity: stockQty,
              minimum_stock: minStock,
              allow_sell_at_loss: pickBool(row, ["AllowSellAtLoss", "allow_sell_at_loss"]),
              sell_at_loss_reason: pickString(row, ["SellAtLossReason", "sell_at_loss_reason"]),
              notes: pickString(row, ["Notes", "notes"]),
              is_active: pickBool(row, ["IsActive", "is_active"], true),
              service_type: pickString(row, ["ServiceType", "service_type"]) || null,
              service_pricing_mode: pickString(row, ["ServicePricingMode", "service_pricing_mode"]) || null,
              default_commission_amount: commAmount,
              default_commission_percent: commPct,
              requires_account_number: pickBool(row, ["RequiresAccountNumber", "requires_account_number"]),
              requires_provider: pickBool(row, ["RequiresProvider", "requires_provider"]),
              requires_reference: pickBool(row, ["RequiresReference", "requires_reference"]),
            })
            .select("id")
            .single();

          if (error) {
            failed++;
            warnings.push(`Product insert error: ${error.message} (Product: ${name}).`);
          } else {
            if (sku) skuMap.set(sku, data.id);
            if (barcode) barcodeMap.set(barcode, data.id);
            nameTypeMap.set(`${name.toLowerCase()}-${type}`, data.id);
            mappingsToSave.push({ sourceId: row.Id.toString(), targetId: data.id });
            inserted++;
          }
        }
      }
      await saveRowMappingsBatch(supabase, orgId, jobId, "Products", "products", mappingsToSave);

    } else if (tableName === "ProductStockLots") {
      const productIds = typedRows.map(r => r.ProductId?.toString()).filter(Boolean);
      const supplierIds = typedRows.map(r => r.SupplierId?.toString()).filter(Boolean);
      const prodMappings = await resolveTargetIdsBatch(supabase, orgId, jobId, "Products", productIds);
      const supMappings = await resolveTargetIdsBatch(supabase, orgId, jobId, "Suppliers", supplierIds);

      // Fetch existing lots to avoid duplicate insert and register mapping safely
      const { data: existingLots } = await supabase
        .from("product_stock_lots")
        .select("id, product_id, lot_number")
        .eq("organization_id", orgId);
      
      const lotMap = new Map(
        existingLots?.map(l => [`${l.product_id}-${l.lot_number || ""}`, l.id]) ?? []
      );

      for (const row of typedRows) {
        const prodId = row.ProductId ? prodMappings.get(row.ProductId.toString()) : null;
        if (!prodId) {
          failed++;
          warnings.push(`Skipped lot with unmapped product (Lot ID: ${row.Id}, Prod ID: ${row.ProductId}).`);
          continue;
        }
        const supId = row.SupplierId ? supMappings.get(row.SupplierId.toString()) : null;
        const lotNo = row.BatchNumber?.toString() || null;
        const key = `${prodId}-${lotNo || ""}`;

        if (lotMap.has(key)) {
          const targetId = lotMap.get(key)!;
          mappingsToSave.push({ sourceId: row.Id.toString(), targetId });
          skipped++;
        } else {
          const qtyReceived = Number(row.QuantityAdded || 0);
          const qtyRemaining = Number(row.QuantityRemaining || 0);
          const unitCost = Number(row.PurchasePrice || 0);
          const lErr =
            assertNonNeg(qtyReceived, "quantity_received", row.Id) ??
            assertNonNeg(qtyRemaining, "quantity_remaining", row.Id) ??
            assertNonNeg(unitCost, "unit_cost", row.Id);
          if (lErr) { failed++; warnings.push(lErr); continue; }

          const { data, error } = await supabase
            .from("product_stock_lots")
            .insert({
              organization_id: orgId,
              branch_id: branchId,
              product_id: prodId,
              lot_number: lotNo,
              quantity_received: qtyReceived,
              quantity_remaining: qtyRemaining,
              unit_cost: unitCost,
              supplier_id: supId || null,
              purchase_date: row.AddedAt || new Date().toISOString(),
              is_active: row.IsActive === undefined ? true : Boolean(row.IsActive)
            })
            .select("id")
            .single();

          if (error) {
            failed++;
            warnings.push(`Stock lot insert error: ${error.message} (Lot ID: ${row.Id}).`);
          } else {
            lotMap.set(key, data.id);
            mappingsToSave.push({ sourceId: row.Id.toString(), targetId: data.id });
            inserted++;
          }
        }
      }
      await saveRowMappingsBatch(supabase, orgId, jobId, "ProductStockLots", "product_stock_lots", mappingsToSave);

    } else if (tableName === "StockMovements") {
      const productIds = typedRows.map(r => r.ProductId?.toString()).filter(Boolean);
      const lotIds = typedRows.map(r => r.StockLotId?.toString() || r.BatchNumber?.toString()).filter(Boolean);
      const prodMappings = await resolveTargetIdsBatch(supabase, orgId, jobId, "Products", productIds);
      const lotMappings = await resolveTargetIdsBatch(supabase, orgId, jobId, "ProductStockLots", lotIds);

      const normalizeStockMovementType = (mType: string, cType?: string) => {
        const mt = (mType || cType || "").toLowerCase().trim();
        if (mt.includes("opening") || mt.includes("initial")) return "opening_stock";
        if (mt.includes("purchase") || mt.includes("stock_in") || mt.includes("in")) return "purchase";
        if (mt.includes("sale") || mt.includes("stock_out") || mt.includes("out")) return "sale";
        if (mt.includes("return_in") || mt.includes("return in")) return "return_in";
        if (mt.includes("return_out") || mt.includes("return out")) return "return_out";
        if (mt.includes("adjustment_in") || mt.includes("adjustment in")) return "adjustment_in";
        if (mt.includes("adjustment_out") || mt.includes("adjustment out")) return "adjustment_out";
        if (mt.includes("void")) return "void";
        if (mt.includes("add")) return "purchase";
        if (mt.includes("deduct")) return "sale";
        return "adjustment_in";
      };

      for (const row of typedRows) {
        const prodId = row.ProductId ? prodMappings.get(row.ProductId.toString()) : null;
        if (!prodId) {
          failed++;
          warnings.push(`Skipped movement with unmapped product (ID: ${row.Id}).`);
          continue;
        }
        const lotId = row.StockLotId 
          ? lotMappings.get(row.StockLotId.toString()) 
          : (row.BatchNumber ? lotMappings.get(row.BatchNumber.toString()) : null);

        const normalizedType = normalizeStockMovementType(row.MovementType, row.ChangeType);
        const qty = Math.max(1, Math.abs(Number(row.Difference || row.QuantityChange || row.Quantity || 0)));
        const cost = Number(row.unit_cost || row.NewPurchasePrice || row.OldPurchasePrice || 0);

        const smErr = assertNonNeg(cost, "unit_cost", row.Id);
        if (smErr) { failed++; warnings.push(smErr); continue; }

        const { error } = await supabase
          .from("stock_movements")
          .insert({
            organization_id: orgId,
            branch_id: branchId,
            product_id: prodId,
            stock_lot_id: lotId || null,
            movement_type: normalizedType,
            quantity: qty,
            unit_cost: cost,
            reference_type: row.reference_type || "manual",
            reference_id: row.reference_id || null,
            notes: row.Reason?.toString() || "Imported from desktop stock movements",
            created_by: profile.id,
            created_at: row.CreatedAt || row.DateTime || row.Date || new Date().toISOString()
          });

        if (error) {
          failed++;
          warnings.push(`Stock movement insert error: ${error.message} (ID: ${row.Id}).`);
        } else {
          inserted++;
        }
      }

    } else if (tableName === "Bills") {
      const customerIds = typedRows.map(r => r.CustomerId?.toString()).filter(Boolean);
      const custMappings = await resolveTargetIdsBatch(supabase, orgId, jobId, "Customers", customerIds);

      // Fetch existing invoice numbers to avoid unique key conflicts
      const { data: existingInvs } = await supabase
        .from("invoices")
        .select("invoice_no")
        .eq("organization_id", orgId);
      const invNoSet = new Set(existingInvs?.map(i => i.invoice_no.toLowerCase()) ?? []);

      for (const row of typedRows) {
        const custId = row.CustomerId ? custMappings.get(row.CustomerId.toString()) : null;
        let invoiceNo = row.BillNo?.toString().trim();
        if (!invoiceNo) {
          failed++;
          warnings.push(`Skipped bill with empty BillNo (ID: ${row.Id}).`);
          continue;
        }

        // Avoid unique constraint conflicts
        if (invNoSet.has(invoiceNo.toLowerCase())) {
          invoiceNo = `${invoiceNo}-imported-${jobId.slice(0, 4)}`;
        }

        const grandTotal = pickNumber(row, ["GrandTotal", "grand_total"]);
        const amountPaid = pickNumber(row, ["AmountPaid", "amount_paid"]);
        const balanceDue = pickNumber(row, ["BalanceDue", "balance_due"]);
        const subtotal = pickNumber(row, ["Subtotal", "subtotal"]);
        const discountTotal = pickNumber(row, ["Discount", "DiscountTotal", "discount_total"]);
        const bErr =
          assertNonNeg(grandTotal, "grand_total", row.Id) ??
          assertNonNeg(amountPaid, "amount_paid", row.Id) ??
          assertNonNeg(subtotal, "subtotal", row.Id) ??
          assertNonNeg(discountTotal, "discount_total", row.Id);
        if (bErr) { failed++; warnings.push(bErr); continue; }

        const status = normalizeInvoiceStatus(
          row.PaymentStatus ?? row.Status ?? row.status,
          amountPaid,
          grandTotal,
          balanceDue,
        );
        const billDate =
          pickString(row, ["BillDate", "Date", "InvoiceDate", "CreatedAt"]) ||
          new Date().toISOString();

        const { data, error } = await supabase
          .from("invoices")
          .insert({
            organization_id: orgId,
            branch_id: branchId,
            customer_id: custId || null,
            invoice_no: invoiceNo,
            status,
            subtotal,
            discount_total: discountTotal,
            grand_total: grandTotal,
            amount_paid: amountPaid,
            balance_due: balanceDue,
            note: pickString(row, ["Note", "Notes", "note"]),
            created_by: profile.id,
            invoice_date: billDate,
            created_at: billDate,
          })
          .select("id")
          .single();

        if (error) {
          failed++;
          warnings.push(`Bill insert error: ${error.message} (BillNo: ${invoiceNo}).`);
        } else {
          invNoSet.add(invoiceNo.toLowerCase());
          mappingsToSave.push({ sourceId: row.Id.toString(), targetId: data.id });
          inserted++;
        }
      }
      await saveRowMappingsBatch(supabase, orgId, jobId, "Bills", "invoices", mappingsToSave);

    } else if (tableName === "BillItems") {
      const billIds = typedRows.map(r => r.BillId?.toString()).filter(Boolean);
      const productIds = typedRows.map(r => r.ProductId?.toString()).filter(Boolean);
      const billMappings = await resolveTargetIdsBatch(supabase, orgId, jobId, "Bills", billIds);
      const prodMappings = await resolveTargetIdsBatch(supabase, orgId, jobId, "Products", productIds);

      for (const row of typedRows) {
        const billId = row.BillId ? billMappings.get(row.BillId.toString()) : null;
        if (!billId) {
          failed++;
          warnings.push(`Skipped bill item with unmapped bill (Bill ID: ${row.BillId}, Item ID: ${row.Id}).`);
          continue;
        }
        const prodId = row.ProductId ? prodMappings.get(row.ProductId.toString()) : null;

        // Desktop BillItems uses Qty (not Quantity), Price (not UnitPrice),
        // and IsServiceTransaction (not ProductType).
        const productName = pickString(row, ["ProductName", "ItemName", "Name"]) || "Unknown Product";
        const isService =
          pickBool(row, ["IsServiceTransaction", "is_service_transaction"]) ||
          String(row.ProductType ?? "").toLowerCase() === "service";
        const unitPrice = pickNumber(row, ["Price", "UnitPrice", "SalePrice", "unit_price"]);

        const qty = pickNumber(row, ["Qty", "Quantity", "quantity"], 1);
        const purchasePrice = pickNumber(row, ["PurchasePrice", "purchase_price"]);
        const itemDiscount = pickNumber(row, ["ItemDiscount", "item_discount"]);
        const lineTotal = pickNumber(row, ["LineTotal", "line_total"]);
        const svcTransAmt = pickNumber(row, ["ServiceTransactionAmount"]);
        const svcComm = pickNumber(row, ["ServiceCommission"]);
        const svcTotalCharged = pickNumber(row, ["ServiceTotalCharged"]);
        const biErr =
          assertNonNeg(qty, "quantity", row.Id) ??
          assertNonNeg(unitPrice, "unit_price", row.Id) ??
          assertNonNeg(purchasePrice, "purchase_price", row.Id) ??
          assertNonNeg(itemDiscount, "item_discount", row.Id) ??
          assertNonNeg(lineTotal, "line_total", row.Id) ??
          assertNonNeg(svcTransAmt, "service_transaction_amount", row.Id) ??
          assertNonNeg(svcComm, "service_commission", row.Id) ??
          assertNonNeg(svcTotalCharged, "service_total_charged", row.Id);
        if (biErr) { failed++; warnings.push(biErr); continue; }

        const { data, error } = await supabase
          .from("invoice_items")
          .insert({
            organization_id: orgId,
            invoice_id: billId,
            product_id: prodId || null,
            product_name: productName,
            product_type: isService ? "service" : "product",
            quantity: qty,
            purchase_price: purchasePrice,
            unit_price: unitPrice,
            item_discount: itemDiscount,
            line_total: lineTotal,
            service_provider: pickString(row, ["ServiceProvider"]) || null,
            service_direction: pickString(row, ["ServiceDirection"]) || null,
            service_account_number: pickString(row, ["ServiceAccountNumber"]) || null,
            service_receiver_account: pickString(row, ["ServiceReceiverAccount"]) || null,
            service_reference_no: pickString(row, ["ServiceReferenceNo"]) || null,
            service_transaction_amount: svcTransAmt,
            service_commission: svcComm,
            service_total_charged: svcTotalCharged,
            service_note: pickString(row, ["ServiceNote"]) || null,
            effective_unit_price_snapshot: unitPrice,
            loss_amount_snapshot: 0,
          })
          .select("id")
          .single();

        if (error) {
          failed++;
          warnings.push(`Bill item insert error: ${error.message} (Item ID: ${row.Id}).`);
        } else {
          mappingsToSave.push({ sourceId: row.Id.toString(), targetId: data.id });
          inserted++;
        }
      }
      await saveRowMappingsBatch(supabase, orgId, jobId, "BillItems", "invoice_items", mappingsToSave);

    } else if (tableName === "BillItemBatchAllocations") {
      const billItemIds = typedRows.map(r => r.BillItemId?.toString()).filter(Boolean);
      const lotIds = typedRows.map(r => r.StockLotId?.toString()).filter(Boolean);
      const itemMappings = await resolveTargetIdsBatch(supabase, orgId, jobId, "BillItems", billItemIds);
      const lotMappings = await resolveTargetIdsBatch(supabase, orgId, jobId, "ProductStockLots", lotIds);

      // We also need the invoice_id and product_id which we can resolve by querying invoice_items
      const mappedItemIds = Array.from(new Set(Array.from(itemMappings.values())));
      const { data: itemsData } = await supabase
        .from("invoice_items")
        .select("id, invoice_id, product_id")
        .in("id", mappedItemIds);
      const itemInvoiceMap = new Map(itemsData?.map(it => [it.id, it.invoice_id]) ?? []);
      const itemProductMap = new Map(itemsData?.map(it => [it.id, it.product_id]) ?? []);

      for (const row of typedRows) {
        const itemId = row.BillItemId ? itemMappings.get(row.BillItemId.toString()) : null;
        const lotId = row.StockLotId ? lotMappings.get(row.StockLotId.toString()) : null;

        if (!itemId || !lotId) {
          failed++;
          warnings.push(`Skipped lot allocation with missing item/lot mapping (Allocation ID: ${row.Id}).`);
          continue;
        }

        const invoiceId = itemInvoiceMap.get(itemId);
        const productId = itemProductMap.get(itemId);

        if (!invoiceId || !productId) {
          failed++;
          warnings.push(`Skipped lot allocation with missing item context (Allocation ID: ${row.Id}).`);
          continue;
        }

        const allocQty = pickNumber(row, ["Qty", "Quantity"]);
        const allocUnitCost = pickNumber(row, ["PurchasePrice"]);
        const allocErr =
          assertNonNeg(allocQty, "quantity", row.Id) ??
          assertNonNeg(allocUnitCost, "unit_cost", row.Id);
        if (allocErr) { failed++; warnings.push(allocErr); continue; }

        const { error } = await supabase
          .from("invoice_item_stock_allocations")
          .insert({
            organization_id: orgId,
            invoice_id: invoiceId,
            invoice_item_id: itemId,
            product_id: productId,
            stock_lot_id: lotId,
            quantity: allocQty,
            unit_cost: allocUnitCost,
          });

        if (error) {
          failed++;
          warnings.push(`Allocation insert error: ${error.message} (ID: ${row.Id}).`);
        } else {
          inserted++;
        }
      }

    } else if (tableName === "Payments") {
      const billIds = typedRows.map(r => r.BillId?.toString()).filter(Boolean);
      const customerIds = typedRows.map(r => r.CustomerId?.toString()).filter(Boolean);
      const billMappings = await resolveTargetIdsBatch(supabase, orgId, jobId, "Bills", billIds);
      const custMappings = await resolveTargetIdsBatch(supabase, orgId, jobId, "Customers", customerIds);

      for (const row of typedRows) {
        const billId = row.BillId ? billMappings.get(row.BillId.toString()) : null;
        const custId = row.CustomerId ? custMappings.get(row.CustomerId.toString()) : null;

        const paymentAmount = Number(row.Amount || 0);
        const payErr = assertNonNeg(paymentAmount, "amount", row.Id);
        if (payErr) { failed++; warnings.push(payErr); continue; }

        const { error } = await supabase
          .from("payments")
          .insert({
            organization_id: orgId,
            branch_id: branchId,
            invoice_id: billId || null,
            customer_id: custId || null,
            method: row.Method || "cash",
            amount: paymentAmount,
            reference_no: row.ReferenceNo?.toString() || "",
            received_by: profile.id,
            created_at: row.CreatedAt || new Date().toISOString()
          });

        if (error) {
          failed++;
          warnings.push(`Payment insert error: ${error.message} (ID: ${row.Id}).`);
        } else {
          inserted++;
        }
      }

    } else if (tableName === "CustomerLedgerEntries") {
      const customerIds = typedRows.map(r => r.CustomerId?.toString()).filter(Boolean);
      const billIds = typedRows.map(r => r.BillId?.toString()).filter(Boolean);
      const custMappings = await resolveTargetIdsBatch(supabase, orgId, jobId, "Customers", customerIds);
      const billMappings = await resolveTargetIdsBatch(supabase, orgId, jobId, "Bills", billIds);

      for (const row of typedRows) {
        const custId = row.CustomerId ? custMappings.get(row.CustomerId.toString()) : null;
        if (!custId) {
          failed++;
          warnings.push(`Skipped ledger entry with unmapped customer (ID: ${row.Id}).`);
          continue;
        }
        const billId = row.BillId ? billMappings.get(row.BillId.toString()) : null;

        const ledAmount = Number(row.Amount || 0);
        const ledBalance = Number(row.BalanceAfter || 0);
        const ledErr = assertNonNeg(ledAmount, "amount", row.Id);
        if (ledErr) { failed++; warnings.push(ledErr); continue; }

        const { error } = await supabase
          .from("customer_ledger_entries")
          .insert({
            organization_id: orgId,
            branch_id: branchId,
            customer_id: custId,
            invoice_id: billId || null,
            entry_type: row.EntryType || "invoice_credit",
            direction: row.Direction || "debit",
            amount: ledAmount,
            balance_after: ledBalance,
            description: row.Description?.toString() || "",
            created_by: profile.id,
            created_at: row.Date || new Date().toISOString()
          });

        if (error) {
          failed++;
          warnings.push(`Ledger insert error: ${error.message} (ID: ${row.Id}).`);
        } else {
          inserted++;
        }
      }

    } else if (tableName === "ReturnRefunds") {
      const billIds = typedRows.map(r => r.BillId?.toString()).filter(Boolean);
      const customerIds = typedRows.map(r => r.CustomerId?.toString()).filter(Boolean);
      const billMappings = await resolveTargetIdsBatch(supabase, orgId, jobId, "Bills", billIds);
      const custMappings = await resolveTargetIdsBatch(supabase, orgId, jobId, "Customers", customerIds);

      // Fetch existing returns to avoid duplicate insert and register mapping safely
      const { data: existingReturns } = await supabase
        .from("returns")
        .select("id, return_no")
        .eq("organization_id", orgId);
      
      const returnMap = new Map(
        existingReturns?.map(r => [r.return_no, r.id]) ?? []
      );

      for (const row of typedRows) {
        const billId = row.BillId ? billMappings.get(row.BillId.toString()) : null;
        if (!billId) {
          failed++;
          warnings.push(`Skipped return refund with unmapped bill (ID: ${row.Id}).`);
          continue;
        }
        const custId = row.CustomerId ? custMappings.get(row.CustomerId.toString()) : null;

        const refundMethod = normalizePaymentMethod(row.RefundMethod);
        // Online returns.refund_method enum is a subset (no customer_credit) —
        // fall back to "cash" if the normalised method isn't allowed there.
        const allowedRefundMethods = new Set(["cash", "card", "easypaisa", "jazzcash", "bank_transfer"]);
        const finalRefundMethod = allowedRefundMethods.has(refundMethod) ? refundMethod : "cash";

        const retNo = pickString(row, ["ReturnNo"]) || `RET-${row.Id.toString()}`;

        if (returnMap.has(retNo)) {
          const targetId = returnMap.get(retNo)!;
          mappingsToSave.push({ sourceId: row.Id.toString(), targetId });
          skipped++;
        } else {
          const refundAmt = pickNumber(row, ["RefundAmount"]);
          const retErr = assertNonNeg(refundAmt, "refund_amount", row.Id);
          if (retErr) { failed++; warnings.push(retErr); continue; }

          const { data, error } = await supabase
            .from("returns")
            .insert({
              organization_id: orgId,
              branch_id: branchId,
              invoice_id: billId,
              customer_id: custId || null,
              return_no: retNo,
              status: normalizeReturnStatus(row.Status),
              subtotal: refundAmt,
              refund_amount: refundAmt,
              refund_method: finalRefundMethod,
              notes: pickString(row, ["Reason", "Notes"]),
              created_by: profile.id,
              created_at: pickString(row, ["CreatedAt"]) || new Date().toISOString(),
            })
            .select("id")
            .single();

          if (error) {
            failed++;
            warnings.push(`Return insert error: ${error.message} (Return ID: ${row.Id}).`);
          } else {
            returnMap.set(retNo, data.id);
            mappingsToSave.push({ sourceId: row.Id.toString(), targetId: data.id });
            inserted++;
          }
        }
      }
      await saveRowMappingsBatch(supabase, orgId, jobId, "ReturnRefunds", "returns", mappingsToSave);

    } else if (tableName === "ReturnItems") {
      const returnIds = typedRows.map(r => r.ReturnId?.toString()).filter(Boolean);
      const billItemIds = typedRows.map(r => r.BillItemId?.toString()).filter(Boolean);
      const productIds = typedRows.map(r => r.ProductId?.toString()).filter(Boolean);
      const retMappings = await resolveTargetIdsBatch(supabase, orgId, jobId, "ReturnRefunds", returnIds);
      const itemMappings = await resolveTargetIdsBatch(supabase, orgId, jobId, "BillItems", billItemIds);
      const prodMappings = await resolveTargetIdsBatch(supabase, orgId, jobId, "Products", productIds);

      // Fetch invoice contexts to find invoice_id and product metadata
      const mappedItemIds = Array.from(new Set(Array.from(itemMappings.values())));
      const { data: itemsData } = await supabase
        .from("invoice_items")
        .select("id, invoice_id, product_name, product_type, unit_price")
        .in("id", mappedItemIds);
      const itemInvoiceMap = new Map(itemsData?.map(it => [it.id, it.invoice_id]) ?? []);
      const itemNameMap = new Map(itemsData?.map(it => [it.id, it.product_name]) ?? []);
      const itemTypeMap = new Map(itemsData?.map(it => [it.id, it.product_type]) ?? []);
      const itemPriceMap = new Map(itemsData?.map(it => [it.id, Number(it.unit_price)]) ?? []);

      for (const row of typedRows) {
        const retId = row.ReturnId ? retMappings.get(row.ReturnId.toString()) : null;
        const itemId = row.BillItemId ? itemMappings.get(row.BillItemId.toString()) : null;

        if (!retId || !itemId) {
          failed++;
          warnings.push(`Skipped return item with missing parent mapping (ReturnItem ID: ${row.Id}).`);
          continue;
        }

        const invoiceId = itemInvoiceMap.get(itemId);
        const prodId = row.ProductId ? prodMappings.get(row.ProductId.toString()) : null;

        if (!invoiceId) {
          failed++;
          warnings.push(`Skipped return item due to missing invoice context (ReturnItem ID: ${row.Id}).`);
          continue;
        }

        const riQty = pickNumber(row, ["QtyReturned", "Qty", "Quantity"]);
        const riUnitPrice = pickNumber(row, ["UnitPrice"], itemPriceMap.get(itemId) || 0);
        const riLineTotal = pickNumber(row, ["LineTotal", "RefundAmount"]);
        const riErr =
          assertNonNeg(riQty, "quantity", row.Id) ??
          assertNonNeg(riUnitPrice, "unit_price", row.Id) ??
          assertNonNeg(riLineTotal, "line_total", row.Id);
        if (riErr) { failed++; warnings.push(riErr); continue; }

        const { error } = await supabase
          .from("return_items")
          .insert({
            organization_id: orgId,
            invoice_id: invoiceId,
            return_id: retId,
            invoice_item_id: itemId,
            product_id: prodId || null,
            item_name: itemNameMap.get(itemId) || "Unknown Returned Item",
            item_type: itemTypeMap.get(itemId) || "product",
            quantity: riQty,
            unit_price: riUnitPrice,
            line_total: riLineTotal,
            restock: pickBool(row, ["Restocked", "Restock"]),
          });

        if (error) {
          failed++;
          warnings.push(`Return item insert error: ${error.message} (ReturnItem ID: ${row.Id}).`);
        } else {
          inserted++;
        }
      }

    } else if (tableName === "Expenses") {
      for (const row of typedRows) {
        const category = row.Category?.toString().trim();
        if (!category) {
          failed++;
          warnings.push(`Skipped expense with empty category (ID: ${row.Id}).`);
          continue;
        }

        const expenseAmount = Number(row.Amount || 0);
        const expErr = assertNonNeg(expenseAmount, "amount", row.Id);
        if (expErr) { failed++; warnings.push(expErr); continue; }

        const { error } = await supabase
          .from("expenses")
          .insert({
            organization_id: orgId,
            branch_id: branchId,
            category,
            amount: expenseAmount,
            payment_method: row.PaymentMethod || "cash",
            vendor_name: row.VendorName?.toString() || "",
            notes: row.Notes?.toString() || "",
            date: row.Date || new Date().toISOString(),
            status: row.Status || "active",
            created_by: profile.id,
            created_at: row.Date || new Date().toISOString()
          });

        if (error) {
          failed++;
          warnings.push(`Expense insert error: ${error.message} (ID: ${row.Id}).`);
        } else {
          inserted++;
        }
      }

    } else if (tableName === "RepairJobs") {
      const customerIds = typedRows.map(r => r.CustomerId?.toString()).filter(Boolean);
      const custMappings = await resolveTargetIdsBatch(supabase, orgId, jobId, "Customers", customerIds);

      for (const row of typedRows) {
        const custId = row.CustomerId ? custMappings.get(row.CustomerId.toString()) : null;
        const jobNo = row.JobNo?.toString().trim();
        if (!jobNo) {
          failed++;
          warnings.push(`Skipped repair job with empty JobNo (ID: ${row.Id}).`);
          continue;
        }

        const estCost = Number(row.EstimatedCost || 0);
        const advPaid = Number(row.AdvancePaid || 0);
        const rjErr =
          assertNonNeg(estCost, "estimated_cost", row.Id) ??
          assertNonNeg(advPaid, "advance_paid", row.Id);
        if (rjErr) { failed++; warnings.push(rjErr); continue; }

        const { data, error } = await supabase
          .from("repairs")
          .insert({
            organization_id: orgId,
            branch_id: branchId,
            customer_id: custId || null,
            job_no: jobNo,
            customer_name: row.CustomerName?.toString() || "Walk-in customer",
            customer_phone: row.CustomerPhone?.toString() || "",
            device_type: row.DeviceType?.toString() || "Other",
            device_model: row.DeviceModel?.toString() || "",
            serial_imei: row.SerialImei?.toString() || "",
            problem: row.Problem?.toString() || "",
            accessories: row.Accessories?.toString() || "",
            estimated_cost: estCost,
            advance_paid: advPaid,
            payment_method: normalizePaymentMethod(row.PaymentMethod),
            status: normalizeRepairStatus(row.Status),
            notes: row.Notes?.toString() || "",
            expected_delivery: row.ExpectedDelivery || null,
            delivered_at: row.DeliveredAt || null,
            created_at: row.CreatedAt || new Date().toISOString()
          })
          .select("id")
          .single();

        if (error) {
          failed++;
          warnings.push(`Repair job insert error: ${error.message} (JobNo: ${jobNo}).`);
        } else {
          mappingsToSave.push({ sourceId: row.Id.toString(), targetId: data.id });
          inserted++;
        }
      }
      await saveRowMappingsBatch(supabase, orgId, jobId, "RepairJobs", "repairs", mappingsToSave);

    } else if (tableName === "DailyClosings") {
      for (const row of typedRows) {
        const closingDate = row.ClosingDate?.toString().split("T")[0];
        if (!closingDate) {
          failed++;
          warnings.push(`Skipped daily closing with empty date (ID: ${row.Id}).`);
          continue;
        }

        const cashExpected = Number(row.CashExpected || 0);
        const cashCounted = Number(row.CashCounted || 0);
        const dcErr =
          assertNonNeg(cashExpected, "CashExpected", row.Id) ??
          assertNonNeg(cashCounted, "CashCounted", row.Id);
        if (dcErr) { failed++; warnings.push(dcErr); continue; }

        const { error } = await supabase
          .from("daily_closings")
          .insert({
            organization_id: orgId,
            branch_id: branchId,
            closing_date: closingDate,
            notes: row.Notes?.toString() || "Imported daily closing",
            opening_cash: 0,
            sales_cash: 0,
            expenses_cash: 0,
            expected_cash: cashExpected,
            actual_cash: cashCounted,
            difference: Number(row.CashDifference || 0),
            status: "closed",
            finalized_by: profile.id,
            finalized_at: row.FinalizedAt || new Date().toISOString(),
            created_at: row.FinalizedAt || new Date().toISOString()
          });

        if (error) {
          failed++;
          warnings.push(`Daily closing insert error: ${error.message} (Date: ${closingDate}).`);
        } else {
          inserted++;
        }
      }

    } else if (tableName === "ActivityLog") {
      for (const row of typedRows) {
        const details = row.Details?.toString() || "";
        // Basic passwords / recovery codes masking to guarantee database security
        if (
          details.toLowerCase().includes("password") ||
          details.toLowerCase().includes("recovery") ||
          details.toLowerCase().includes("secret")
        ) {
          skipped++;
          continue;
        }

        const { error } = await supabase
          .from("audit_logs")
          .insert({
            organization_id: orgId,
            branch_id: branchId,
            actor_id: profile.id,
            module: row.Module || "system",
            action: row.Action || "desktop_activity",
            details,
            metadata: {
              source: "desktop_import",
              original_actor: row.Actor || "staff",
              import_job_id: jobId,
              source_table: "ActivityLog",
              source_id: row.Id?.toString() || null
            },
            created_at: row.Date || new Date().toISOString()
          });

        if (error) {
          failed++;
          warnings.push(`Audit log insert error: ${error.message} (ID: ${row.Id}).`);
        } else {
          inserted++;
        }
      }
    } else {
      return { success: false, inserted: 0, skipped: 0, skippedOrphan, failed: 0, warnings, error: `Unsupported table: ${tableName}` };
    }

    return { success: true, inserted, skipped, skippedOrphan, failed, warnings };
  } catch (err: unknown) {
    console.error(`Error importing chunk for ${tableName}:`, err);
    const msg = err instanceof Error ? err.message : "Unknown error.";
    return { success: false, inserted, skipped, skippedOrphan, failed: failed + rows.length, warnings, error: msg };
  }
}

// Enhance Export Database Action
export async function fetchExportDataAction(): Promise<{ success: boolean; data?: ExportData; error?: string }> {
  try {
    const { user, profile } = await getCurrentContext();
    if (!user || !profile) {
      return { success: false, error: "Not authenticated." };
    }

    if (profile.role !== "owner" && profile.role !== "admin") {
      logAudit({ module: "settings", action: "permission.denied", details: `Export data denied for role ${profile.role}` });
      return { success: false, error: "Only Owners and Admins can export data." };
    }

    const orgId = profile.organization_id;
    if (!orgId) {
      return { success: false, error: "No organization assigned." };
    }

    const supabase = await createClient();

    // Fetch all tables in parallel
    const [
      cats,
      sups,
      prods,
      lots,
      movs,
      custs,
      invs,
      invItems,
      pays,
      ledgers,
      returns,
      returnItems,
      returnStockAllocations,
      exps,
      reps,
      closings,
      audits,
      supPurchases,
      supPurchaseItems,
      supPayments,
      supLedger
    ] = await Promise.all([
      supabase.from("product_categories").select("*").eq("organization_id", orgId),
      supabase.from("suppliers").select("*").eq("organization_id", orgId),
      supabase.from("products").select("*").eq("organization_id", orgId),
      supabase.from("product_stock_lots").select("*").eq("organization_id", orgId),
      supabase.from("stock_movements").select("*").eq("organization_id", orgId),
      supabase.from("customers").select("*").eq("organization_id", orgId),
      supabase.from("invoices").select("*").eq("organization_id", orgId),
      supabase.from("invoice_items").select("*").eq("organization_id", orgId),
      supabase.from("payments").select("*").eq("organization_id", orgId),
      supabase.from("customer_ledger_entries").select("*").eq("organization_id", orgId),
      supabase.from("returns").select("*").eq("organization_id", orgId),
      supabase.from("return_items").select("*").eq("organization_id", orgId),
      supabase.from("return_stock_allocations").select("*").eq("organization_id", orgId),
      supabase.from("expenses").select("*").eq("organization_id", orgId),
      supabase.from("repairs").select("*").eq("organization_id", orgId),
      supabase.from("daily_closings").select("*").eq("organization_id", orgId),
      supabase.from("audit_logs").select("*").eq("organization_id", orgId),
      supabase.from("supplier_purchases").select("*").eq("organization_id", orgId),
      supabase.from("supplier_purchase_items").select("*").eq("organization_id", orgId),
      supabase.from("supplier_payments").select("*").eq("organization_id", orgId),
      supabase.from("supplier_ledger_entries").select("*").eq("organization_id", orgId)
    ]);

    // Handle any critical query errors
    if (cats.error) throw new Error("Failed to export categories: " + cats.error.message);
    if (sups.error) throw new Error("Failed to export suppliers: " + sups.error.message);
    if (prods.error) throw new Error("Failed to export products: " + prods.error.message);
    if (returns.error) throw new Error("Failed to export returns: " + returns.error.message);
    if (returnItems.error) throw new Error("Failed to export return items: " + returnItems.error.message);
    if (returnStockAllocations.error) {
      throw new Error("Failed to export return stock allocations: " + returnStockAllocations.error.message);
    }

    const data: ExportData = {
      categories: cats.data ?? [],
      suppliers: sups.data ?? [],
      products: prods.data ?? [],
      lots: lots.data ?? [],
      movements: movs.data ?? [],
      customers: custs.data ?? [],
      invoices: invs.data ?? [],
      invoiceItems: invItems.data ?? [],
      payments: pays.data ?? [],
      ledgerEntries: ledgers.data ?? [],
      returns: returns.data ?? [],
      returnItems: returnItems.data ?? [],
      returnStockAllocations: returnStockAllocations.data ?? [],
      expenses: exps.data ?? [],
      repairs: reps.data ?? [],
      closings: closings.data ?? [],
      auditLogs: audits.data ?? [],
      supplierPurchases: supPurchases.data ?? [],
      supplierPurchaseItems: supPurchaseItems.data ?? [],
      supplierPayments: supPayments.data ?? [],
      supplierLedgerEntries: supLedger.data ?? []
    };

    // Log the backup action
    await logAudit({
      module: "settings",
      action: "backup.export_created",
      details: `Owner exported online database backup ZIP containing ${data.products.length} products, ${data.invoices.length} invoices, and other POS data.`
    });

    return { success: true, data };
  } catch (error) {
    const err = error as Error;
    console.error("Backup export failed:", err);
    return { success: false, error: err.message || "An unexpected error occurred during export data preparation." };
  }
}

// Preview Factory Reset Counts
export async function previewFactoryResetAction(): Promise<{ success: boolean; counts?: Record<string, number>; error?: string }> {
  try {
    const factoryResetEnabled = await isPlatformSettingEnabled("factory_reset_enabled");
    if (!factoryResetEnabled) {
      return { success: false, error: "Factory reset has been disabled by the platform administrator." };
    }

    const { user, profile } = await getCurrentContext();
    if (!user || !profile || !profile.organization_id) {
      return { success: false, error: "Not authenticated." };
    }

    if (profile.role !== "owner" && profile.role !== "admin") {
      logAudit({ module: "settings", action: "permission.denied", details: `Factory reset preview denied for role ${profile.role}` });
      return { success: false, error: "Only Owners and Admins can access factory reset preview." };
    }

    const orgId = profile.organization_id;
    const supabase = await createClient();

    const [
      returnStockAllocations,
      returnItems,
      returns,
      invoiceItemStockAllocations,
      stockMovements,
      productStockLots,
      payments,
      invoiceItems,
      invoices,
      customerLedgerEntries,
      repairStatusHistory,
      repairs,
      expenses,
      dailyClosings,
      products,
      productCategories,
      suppliers,
      customers,
      importRowMappings,
      importJobs
    ] = await Promise.all([
      supabase.from("return_stock_allocations").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
      supabase.from("return_items").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
      supabase.from("returns").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
      supabase.from("invoice_item_stock_allocations").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
      supabase.from("stock_movements").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
      supabase.from("product_stock_lots").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
      supabase.from("payments").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
      supabase.from("invoice_items").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
      supabase.from("invoices").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
      supabase.from("customer_ledger_entries").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
      supabase.from("repair_status_history").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
      supabase.from("repairs").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
      supabase.from("expenses").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
      supabase.from("daily_closings").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
      supabase.from("products").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
      supabase.from("product_categories").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
      supabase.from("suppliers").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
      supabase.from("customers").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
      supabase.from("import_row_mappings").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
      supabase.from("import_jobs").select("id", { count: "exact", head: true }).eq("organization_id", orgId)
    ]);

    const counts: Record<string, number> = {
      return_stock_allocations: returnStockAllocations.count || 0,
      return_items: returnItems.count || 0,
      returns: returns.count || 0,
      invoice_item_stock_allocations: invoiceItemStockAllocations.count || 0,
      stock_movements: stockMovements.count || 0,
      product_stock_lots: productStockLots.count || 0,
      payments: payments.count || 0,
      invoice_items: invoiceItems.count || 0,
      invoices: invoices.count || 0,
      customer_ledger_entries: customerLedgerEntries.count || 0,
      repair_status_history: repairStatusHistory.count || 0,
      repairs: repairs.count || 0,
      expenses: expenses.count || 0,
      daily_closings: dailyClosings.count || 0,
      products: products.count || 0,
      product_categories: productCategories.count || 0,
      suppliers: suppliers.count || 0,
      customers: customers.count || 0,
      import_row_mappings: importRowMappings.count || 0,
      import_jobs: importJobs.count || 0
    };

    return { success: true, counts };
  } catch (err: unknown) {
    console.error("Preview factory reset failed:", err);
    const msg = err instanceof Error ? err.message : "An unexpected error occurred.";
    return { success: false, error: msg };
  }
}

// Restore Factory Defaults / Wipes Business Data
export async function restoreFactoryDefaultsAction(
  password: string,
  shopName: string,
  resetSettings: boolean
): Promise<{ success: boolean; counts?: Record<string, number>; error?: string }> {
  try {
    const factoryResetEnabled = await isPlatformSettingEnabled("factory_reset_enabled");
    if (!factoryResetEnabled) {
      return { success: false, error: "Factory reset has been disabled by the platform administrator." };
    }

    const { user, profile, organization } = await getCurrentContext();
    if (!user || !profile || !profile.organization_id) {
      return { success: false, error: "Not authenticated." };
    }

    if (profile.role !== "owner" && profile.role !== "admin") {
      logAudit({ module: "settings", action: "permission.denied", details: `Factory reset execution denied for role ${profile.role}` });
      return { success: false, error: "Only Owners and Admins can reset shop data." };
    }

    const orgId = profile.organization_id;

    // 1. Re-authenticate user password against Supabase Auth
    const supabase = await createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: user.email!,
      password: password
    });

    if (authError) {
      return { success: false, error: "Re-authentication failed. Incorrect password." };
    }

    // 2. Validate typed organization / shop name matches
    const orgName = organization?.name || "Gadget Zone";
    if (shopName.trim().toLowerCase() !== orgName.trim().toLowerCase()) {
      return { success: false, error: `Confirmed organization name does not match '${orgName}'.` };
    }

    // 3. Log pre-reset export trace
    await logAudit({
      module: "settings",
      action: "backup.pre_reset_export_created",
      details: `Owner initiated factory reset. Pre-reset backup trace created.`
    });

    // 4. Trigger database RPC to wipe business data
    const { data: resetResult, error: resetError } = await supabase.rpc(
      "reset_organization_to_factory_defaults",
      {
        p_organization_id: orgId,
        p_actor_id: profile.id,
        p_reset_settings: resetSettings
      }
    );

    if (resetError) {
      throw new Error(resetError.message);
    }

    // 5. Revalidate cache paths
    revalidatePath("/settings");
    revalidatePath("/products");
    revalidatePath("/customers");
    revalidatePath("/invoices");
    revalidatePath("/returns");
    revalidatePath("/repairs");
    revalidatePath("/expenses");
    revalidatePath("/daily-closing");
    revalidatePath("/audit-log");

    return { success: true, counts: resetResult as Record<string, number> };
  } catch (err: unknown) {
    console.error("Factory reset failed:", err);
    const msg = err instanceof Error ? err.message : "An unexpected error occurred.";
    return { success: false, error: msg };
  }
}
