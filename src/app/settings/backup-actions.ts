"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentContext } from "@/lib/auth/session";
import { logAudit } from "@/lib/audit";
import { revalidatePath } from "next/cache";

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
  failed: number;
  warnings: string[];
  error?: string;
};

// Start an Import Job
export async function startImportJobAction(
  sourceApp: string,
  backupVersion: string,
  schemaVersion: string,
  manifestObj: unknown,
  countsObj: Record<string, number>
): Promise<ImportJobState> {
  try {
    const { user, profile } = await getCurrentContext();
    if (!user || !profile) {
      return { success: false, error: "Not authenticated." };
    }

    if (profile.role !== "owner" && profile.role !== "admin") {
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

// Client-Server Chunk Importer
export async function importTableChunkAction(
  jobId: string,
  tableName: string,
  rows: unknown[]
): Promise<ChunkImportState> {
  let inserted = 0;
  let skipped = 0;
  let failed = 0;
  const warnings: string[] = [];

  try {
    const { user, profile } = await getCurrentContext();
    if (!user || !profile || !profile.organization_id) {
      return { success: false, inserted: 0, skipped: 0, failed: 0, warnings, error: "Not authenticated." };
    }

    const orgId = profile.organization_id;
    const branchId = profile.branch_id;
    const supabase = await createClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const typedRows = rows as any[];
    const mappingsToSave: Array<{ sourceId: string; targetId: string }> = [];

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
          const { data, error } = await supabase
            .from("customers")
            .insert({
              organization_id: orgId,
              name,
              phone: phone || "",
              email: email || "",
              address: row.Address?.toString() || "",
              notes: row.Notes?.toString() || "",
              outstanding_balance: Number(row.OutstandingBalance || 0)
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

      // Map Category and Supplier IDs
      const categoryIds = typedRows.map(r => r.CategoryId?.toString()).filter(Boolean);
      const supplierIds = typedRows.map(r => r.SupplierId?.toString()).filter(Boolean);
      const catMappings = await resolveTargetIdsBatch(supabase, orgId, jobId, "Categories", categoryIds);
      const supMappings = await resolveTargetIdsBatch(supabase, orgId, jobId, "Suppliers", supplierIds);

      for (const row of typedRows) {
        const name = row.Name?.toString().trim();
        if (!name) {
          failed++;
          warnings.push(`Skipped product with empty name (ID: ${row.Id}).`);
          continue;
        }
        const sku = row.Sku?.toString().trim().toLowerCase();
        const barcode = row.Barcode?.toString().trim().toLowerCase();
        const type = row.Type || "product";

        let matchedId: string | null = null;
        if (sku && skuMap.has(sku)) matchedId = skuMap.get(sku)!;
        else if (barcode && barcodeMap.has(barcode)) matchedId = barcodeMap.get(barcode)!;
        else if (nameTypeMap.has(`${name.toLowerCase()}-${type}`)) matchedId = nameTypeMap.get(`${name.toLowerCase()}-${type}`)!;

        if (matchedId) {
          mappingsToSave.push({ sourceId: row.Id.toString(), targetId: matchedId });
          skipped++;
        } else {
          const catId = row.CategoryId ? catMappings.get(row.CategoryId.toString()) : null;
          const supId = row.SupplierId ? supMappings.get(row.SupplierId.toString()) : null;

          const { data, error } = await supabase
            .from("products")
            .insert({
              organization_id: orgId,
              category_id: catId || null,
              supplier_id: supId || null,
              name,
              sku: row.Sku?.toString() || null,
              barcode: row.Barcode?.toString() || null,
              type,
              purchase_price: Number(row.PurchasePrice || 0),
              sale_price: Number(row.SalePrice || 0),
              stock_quantity: Number(row.StockQuantity || 0),
              minimum_stock: Number(row.MinStock || 0),
              allow_sell_at_loss: Boolean(row.AllowSellAtLoss),
              sell_at_loss_reason: row.SellAtLossReason?.toString() || "",
              notes: row.Notes?.toString() || "",
              is_active: row.IsActive === undefined ? true : Boolean(row.IsActive),
              service_type: row.ServiceType?.toString() || null,
              service_pricing_mode: row.ServicePricingMode?.toString() || null,
              default_commission_amount: Number(row.DefaultCommissionAmount || 0),
              default_commission_percent: Number(row.DefaultCommissionPercent || 0),
              requires_account_number: Boolean(row.RequiresAccountNumber),
              requires_provider: Boolean(row.RequiresProvider),
              requires_reference: Boolean(row.RequiresReference)
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

      for (const row of typedRows) {
        const prodId = row.ProductId ? prodMappings.get(row.ProductId.toString()) : null;
        if (!prodId) {
          failed++;
          warnings.push(`Skipped lot with unmapped product (Lot ID: ${row.Id}, Prod ID: ${row.ProductId}).`);
          continue;
        }
        const supId = row.SupplierId ? supMappings.get(row.SupplierId.toString()) : null;

        const { data, error } = await supabase
          .from("product_stock_lots")
          .insert({
            organization_id: orgId,
            branch_id: branchId,
            product_id: prodId,
            quantity_added: Number(row.QuantityAdded || 0),
            quantity_remaining: Number(row.QuantityRemaining || 0),
            unit_cost: Number(row.PurchasePrice || 0),
            purchase_price: Number(row.PurchasePrice || 0),
            sale_price_at_time: Number(row.SalePriceAtTime || 0),
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
          mappingsToSave.push({ sourceId: row.Id.toString(), targetId: data.id });
          inserted++;
        }
      }
      await saveRowMappingsBatch(supabase, orgId, jobId, "ProductStockLots", "product_stock_lots", mappingsToSave);

    } else if (tableName === "StockMovements") {
      const productIds = typedRows.map(r => r.ProductId?.toString()).filter(Boolean);
      const lotIds = typedRows.map(r => r.StockLotId?.toString()).filter(Boolean);
      const prodMappings = await resolveTargetIdsBatch(supabase, orgId, jobId, "Products", productIds);
      const lotMappings = await resolveTargetIdsBatch(supabase, orgId, jobId, "ProductStockLots", lotIds);

      for (const row of typedRows) {
        const prodId = row.ProductId ? prodMappings.get(row.ProductId.toString()) : null;
        if (!prodId) {
          failed++;
          warnings.push(`Skipped movement with unmapped product (ID: ${row.Id}).`);
          continue;
        }
        const lotId = row.StockLotId ? lotMappings.get(row.StockLotId.toString()) : null;

        const { error } = await supabase
          .from("stock_movements")
          .insert({
            organization_id: orgId,
            branch_id: branchId,
            product_id: prodId,
            stock_lot_id: lotId || null,
            movement_type: row.MovementType || "adjustment",
            quantity: Number(row.Quantity || 0),
            unit_cost: Number(row.unit_cost || 0),
            reference_type: row.reference_type || "manual",
            reference_id: row.reference_id || null,
            notes: row.Reason?.toString() || "Imported from desktop stock movements",
            created_by: profile.id,
            created_at: row.Date || new Date().toISOString()
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

        const { data, error } = await supabase
          .from("invoices")
          .insert({
            organization_id: orgId,
            branch_id: branchId,
            customer_id: custId || null,
            invoice_no: invoiceNo,
            status: row.PaymentStatus || "paid",
            subtotal: Number(row.Subtotal || 0),
            discount_total: Number(row.Discount || 0),
            grand_total: Number(row.GrandTotal || 0),
            amount_paid: Number(row.AmountPaid || 0),
            balance_due: Number(row.BalanceDue || 0),
            note: row.Note?.toString() || "",
            created_by: profile.id,
            invoice_date: row.Date || new Date().toISOString(),
            created_at: row.Date || new Date().toISOString()
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

        const { data, error } = await supabase
          .from("invoice_items")
          .insert({
            organization_id: orgId,
            invoice_id: billId,
            product_id: prodId || null,
            product_name: row.ProductName?.toString() || "Unknown Product",
            product_type: row.ProductType || "product",
            quantity: Number(row.Quantity || 1),
            purchase_price: Number(row.PurchasePrice || 0),
            unit_price: Number(row.UnitPrice || 0),
            item_discount: Number(row.ItemDiscount || 0),
            line_total: Number(row.LineTotal || 0),
            service_provider: row.ServiceProvider?.toString() || null,
            service_direction: row.ServiceDirection?.toString() || null,
            service_account_number: row.ServiceAccountNumber?.toString() || null,
            service_receiver_account: row.ServiceReceiverAccount?.toString() || null,
            service_reference_no: row.ServiceReferenceNo?.toString() || null,
            service_transaction_amount: Number(row.ServiceTransactionAmount || 0),
            service_commission: Number(row.ServiceCommission || 0),
            service_total_charged: Number(row.ServiceTotalCharged || 0),
            service_note: row.ServiceNote?.toString() || null,
            effective_unit_price_snapshot: Number(row.UnitPrice || 0),
            loss_amount_snapshot: 0
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

        const { error } = await supabase
          .from("invoice_item_stock_allocations")
          .insert({
            organization_id: orgId,
            invoice_id: invoiceId,
            invoice_item_id: itemId,
            product_id: productId,
            stock_lot_id: lotId,
            quantity: Number(row.Quantity || 0),
            unit_cost: Number(row.PurchasePrice || 0)
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

        const { error } = await supabase
          .from("payments")
          .insert({
            organization_id: orgId,
            branch_id: branchId,
            invoice_id: billId || null,
            customer_id: custId || null,
            method: row.Method || "cash",
            amount: Number(row.Amount || 0),
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

        const { error } = await supabase
          .from("customer_ledger_entries")
          .insert({
            organization_id: orgId,
            branch_id: branchId,
            customer_id: custId,
            invoice_id: billId || null,
            entry_type: row.EntryType || "invoice_credit",
            direction: row.Direction || "debit",
            amount: Number(row.Amount || 0),
            balance_after: Number(row.BalanceAfter || 0),
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

      for (const row of typedRows) {
        const billId = row.BillId ? billMappings.get(row.BillId.toString()) : null;
        if (!billId) {
          failed++;
          warnings.push(`Skipped return refund with unmapped bill (ID: ${row.Id}).`);
          continue;
        }
        const custId = row.CustomerId ? custMappings.get(row.CustomerId.toString()) : null;

        const { data, error } = await supabase
          .from("returns")
          .insert({
            organization_id: orgId,
            branch_id: branchId,
            invoice_id: billId,
            customer_id: custId || null,
            return_no: row.ReturnNo?.toString() || `RET-${row.Id.toString()}`,
            status: row.Status || "completed",
            subtotal: Number(row.RefundAmount || 0),
            refund_amount: Number(row.RefundAmount || 0),
            refund_method: row.RefundMethod || "cash",
            notes: row.Reason?.toString() || "",
            created_by: profile.id,
            created_at: row.CreatedAt || new Date().toISOString()
          })
          .select("id")
          .single();

        if (error) {
          failed++;
          warnings.push(`Return insert error: ${error.message} (Return ID: ${row.Id}).`);
        } else {
          mappingsToSave.push({ sourceId: row.Id.toString(), targetId: data.id });
          inserted++;
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
            quantity: Number(row.Quantity || 0),
            unit_price: itemPriceMap.get(itemId) || 0,
            line_total: Number(row.LineTotal || 0),
            restock: Boolean(row.Restock)
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

        const { error } = await supabase
          .from("expenses")
          .insert({
            organization_id: orgId,
            branch_id: branchId,
            category,
            amount: Number(row.Amount || 0),
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
            estimated_cost: Number(row.EstimatedCost || 0),
            advance_paid: Number(row.AdvancePaid || 0),
            payment_method: row.PaymentMethod || "cash",
            status: (row.Status || "received").toLowerCase(),
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
            expected_cash: Number(row.CashExpected || 0),
            actual_cash: Number(row.CashCounted || 0),
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
            metadata: { source: "desktop_import", original_actor: row.Actor || "staff" },
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
      return { success: false, inserted: 0, skipped: 0, failed: 0, warnings, error: `Unsupported table: ${tableName}` };
    }

    return { success: true, inserted, skipped, failed, warnings };
  } catch (err: unknown) {
    console.error(`Error importing chunk for ${tableName}:`, err);
    const msg = err instanceof Error ? err.message : "Unknown error.";
    return { success: false, inserted, skipped, failed: failed + rows.length, warnings, error: msg };
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
      audits
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
      supabase.from("audit_logs").select("*").eq("organization_id", orgId)
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
      auditLogs: audits.data ?? []
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
