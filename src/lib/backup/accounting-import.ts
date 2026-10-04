export const ACCOUNTING_ROW_LIMIT = 50_000;
export const ACCOUNTING_BYTE_LIMIT = 33_554_432;
export const IMPORT_REQUEST_BYTE_LIMIT = 1_048_576;
export const IMPORT_CHUNK_TARGET_BYTES = 524_288;

// Parent-before-child snapshot order, not transaction/posting chronology.
export const ACCOUNTING_TABLES = [
  "product_categories", "suppliers", "customers", "products", "invoices",
  "credit_payments", "customer_write_offs", "supplier_purchases", "supplier_write_offs",
  "product_stock_lots", "invoice_items", "payments", "returns", "supplier_payments",
  "customer_ledger_entries", "supplier_ledger_entries", "invoice_item_stock_allocations",
  "stock_movements", "supplier_purchase_items", "return_items", "return_stock_allocations",
] as const;

export type AccountingTable = (typeof ACCOUNTING_TABLES)[number];

export const ANCILLARY_TABLES = [
  "cash_shifts", "expenses", "repairs", "daily_closings", "staff_permissions", "loss_prevention_events", "audit_logs",
] as const;
export type AncillaryTable = (typeof ANCILLARY_TABLES)[number];
export type RestoreTable = AccountingTable | AncillaryTable;
export const ANCILLARY_ALIASES: Record<string, AncillaryTable> = {
  CashShifts: "cash_shifts", cashShifts: "cash_shifts", Expenses: "expenses", expenses: "expenses",
  RepairJobs: "repairs", repairs: "repairs", DailyClosings: "daily_closings", closings: "daily_closings",
  StaffPermissions: "staff_permissions", staffPermissions: "staff_permissions",
  LossPreventionEvents: "loss_prevention_events", lossPreventionEvents: "loss_prevention_events",
  ActivityLog: "audit_logs", auditLogs: "audit_logs",
};

export function restoreTable(name: string): RestoreTable | undefined {
  return accountingTable(name) ?? (ANCILLARY_TABLES.includes(name as AncillaryTable)
    ? name as AncillaryTable : Object.hasOwn(ANCILLARY_ALIASES, name) ? ANCILLARY_ALIASES[name] : undefined);
}

export const BACKUP_TABLE_ALIASES: Record<string, AccountingTable> = {
  Categories: "product_categories", categories: "product_categories",
  Suppliers: "suppliers", suppliers: "suppliers",
  Customers: "customers", customers: "customers",
  Products: "products", products: "products",
  ProductStockLots: "product_stock_lots", lots: "product_stock_lots",
  StockMovements: "stock_movements", movements: "stock_movements",
  Bills: "invoices", invoices: "invoices",
  BillItems: "invoice_items", invoiceItems: "invoice_items",
  BillItemBatchAllocations: "invoice_item_stock_allocations",
  invoiceItemStockAllocations: "invoice_item_stock_allocations",
  Payments: "payments", payments: "payments",
  CreditPayments: "credit_payments", creditPayments: "credit_payments",
  CustomerLedgerEntries: "customer_ledger_entries", ledgerEntries: "customer_ledger_entries",
  CustomerWriteOffs: "customer_write_offs", customerWriteOffs: "customer_write_offs",
  ReturnRefunds: "returns", returns: "returns",
  ReturnItems: "return_items", returnItems: "return_items",
  ReturnStockAllocations: "return_stock_allocations", returnStockAllocations: "return_stock_allocations",
  SupplierPurchases: "supplier_purchases", supplierPurchases: "supplier_purchases",
  SupplierPurchaseItems: "supplier_purchase_items", supplierPurchaseItems: "supplier_purchase_items",
  SupplierPayments: "supplier_payments", supplierPayments: "supplier_payments",
  SupplierLedgerEntries: "supplier_ledger_entries", supplierLedgerEntries: "supplier_ledger_entries",
  SupplierWriteOffs: "supplier_write_offs", supplierWriteOffs: "supplier_write_offs",
};

export function accountingTable(name: string): AccountingTable | undefined {
  return ACCOUNTING_TABLES.includes(name as AccountingTable)
    ? name as AccountingTable
    : Object.hasOwn(BACKUP_TABLE_ALIASES, name) ? BACKUP_TABLE_ALIASES[name] : undefined;
}

export type StagedAccountingRow = {
  source_id: string;
  payload: Record<string, unknown>;
};

export const AUTOMATIC_RESTORE_LIMIT_MESSAGE =
  "This backup may be valid, but it exceeds the automatic safe-restore limit. No shop data changed.";

export function serializedBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

// Size the complete application envelope, not only its rows. The database enforces
// its independently serialized RPC limit and authoritative normalized counters.
export function accountingChunks(
  jobId: string,
  table: RestoreTable,
  rows: StagedAccountingRow[],
): StagedAccountingRow[][] {
  const result: StagedAccountingRow[][] = [];
  let chunk: StagedAccountingRow[] = [];
  let rowBytes = 0;
  const overhead = serializedBytes({ jobId, table, chunkIndex: 999_999, rows: [] }) + 1024;
  for (const row of rows) {
    const size = serializedBytes(row) + 1;
    if (size + overhead > IMPORT_REQUEST_BYTE_LIMIT) {
      throw new Error("A backup row exceeds the safe upload size. No shop data changed.");
    }
    if (chunk.length && (rowBytes + size + overhead > IMPORT_CHUNK_TARGET_BYTES || chunk.length === 1000)) {
      result.push(chunk);
      chunk = [];
      rowBytes = 0;
    }
    chunk.push(row);
    rowBytes += size;
  }
  if (chunk.length) result.push(chunk);
  return result;
}

export function explicitOutstanding(row: Record<string, unknown>, field: string, supplier = false): string {
  if (!Object.hasOwn(row, field) || row[field] === null || row[field] === undefined) {
    throw new Error(supplier
      ? "This backup does not contain the current supplier balance required for a safe restore."
      : "This backup does not contain the current customer balance required for a safe restore.");
  }
  const value = row[field];
  if ((typeof value !== "number" && typeof value !== "string") ||
      !/^-?\d+(?:\.\d{1,2})?$/.test(String(value)) ||
      !Number.isFinite(Number(value)) || Math.abs(Number(value)) >= 10_000_000_000) {
    throw new Error("Current outstanding must be an explicit valid two-decimal balance.");
  }
  return String(value);
}
