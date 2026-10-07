import {
  ACCOUNTING_TABLES, ANCILLARY_TABLES, ACCOUNTING_ROW_LIMIT, AUTOMATIC_RESTORE_LIMIT_MESSAGE,
  explicitOutstanding, restoreTable, type RestoreTable, type StagedAccountingRow,
} from "./accounting-import";
import { SOURCE_COLUMNS, SOURCE_REFERENCES, SOURCE_BOOLEAN_FIELDS } from "./source-schema";

type Row = Record<string, unknown>;
type RootContext = { actorId: string; branchId: string | null };
export type RestorePlan = Record<RestoreTable, StagedAccountingRow[]>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Known desktop schema aliases, without fallback-to-zero financial conversion.
const FIELD_ALIASES: Record<string, string[]> = {
  name: ["Name", "ItemName", "ProductName"], invoice_id: ["InvoiceId", "BillId"],
  invoice_item_id: ["InvoiceItemId", "BillItemId"], invoice_no: ["InvoiceNo", "BillNo"],
  invoice_date: ["InvoiceDate", "BillDate", "Date"], quantity: ["Quantity", "Qty", "QtyReturned"],
  unit_price: ["UnitPrice", "Price", "SalePrice"], product_name: ["ProductName", "ItemName", "Name"],
  stock_quantity: ["StockQuantity", "Stock"], minimum_stock: ["MinimumStock", "MinStock"],
  lot_number: ["LotNumber", "BatchNumber"], quantity_received: ["QuantityReceived", "QuantityAdded"],
  unit_cost: ["UnitCost", "PurchasePrice"], purchase_date: ["PurchaseDate", "AddedAt"],
  paid_at: ["PaidAt", "PaymentDate", "CreatedAt"], method: ["Method", "PaymentMethod"],
  discount_total: ["DiscountTotal", "Discount"], reference_no: ["ReferenceNo", "ReferenceNumber"],
  note: ["Note", "Notes"], restock: ["Restock", "Restocked"],
};

function rowObject(value: unknown, table: string): Row {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid ${table} backup row. No shop data changed.`);
  }
  return value as Row;
}

function sourceIdentity(row: Row, desktop: boolean): string {
  const value = row[desktop ? "Id" : "id"];
  if ((typeof value !== "string" && typeof value !== "number") || !String(value).trim() ||
      (desktop && (!Number.isSafeInteger(Number(value)) || Number(value) <= 0)) || String(value).length > 256) {
    throw new Error("Every backup row requires a unique source identity. No shop data changed.");
  }
  if (!desktop && !UUID.test(String(value))) throw new Error("Native backup row identity is not a UUID.");
  return String(value);
}

function pick(row: Row, field: string, table: RestoreTable): unknown {
  let aliases = FIELD_ALIASES[field] ?? [field.split("_").map(s => s[0].toUpperCase() + s.slice(1)).join("")];
  if (field === "status" && table === "invoices") aliases = ["Status", "PaymentStatus"];
  if (field === "type" && table === "products") aliases = ["Type", "ProductType"];
  if (field === "created_at" && table.endsWith("ledger_entries")) aliases = ["CreatedAt", "Date"];
  const keys = [field, ...aliases].filter(k => Object.hasOwn(row, k));
  const values = keys.map(k => row[k]).filter(v => v !== undefined);
  if (values.length > 1 && values.some(v => JSON.stringify(v) !== JSON.stringify(values[0]))) {
    throw new Error(`Ambiguous ${table}.${field} in backup. No shop data changed.`);
  }
  return values[0];
}

function desktopValue(field: string, value: unknown): unknown {
  if (value === undefined || value === null) return value;
  if (SOURCE_BOOLEAN_FIELDS.has(field)) {
    if (value === true || value === 1 || value === "1") return true;
    if (value === false || value === 0 || value === "0") return false;
    throw new Error(`Invalid ${field} boolean in backup.`);
  }
  if (["status", "direction", "entry_type", "type", "product_type", "item_type", "method", "payment_method", "refund_method", "movement_type"].includes(field)) {
    return String(value).trim().toLowerCase().replace(/[ -]+/g, "_");
  }
  return value;
}

// No database lookups or cross-job mappings. The database repeats every validation.
export function prepareRestore(
  input: Record<string, unknown>, format: "native" | "desktop", roots: RootContext,
  includeAudit: boolean, randomId: () => string = () => crypto.randomUUID(),
): RestorePlan {
  const desktop = format === "desktop";
  const raw = {} as Record<RestoreTable, Row[]>;
  for (const table of [...ACCOUNTING_TABLES, ...ANCILLARY_TABLES]) raw[table] = [];
  const seen = new Set<RestoreTable>();
  for (const [alias, value] of Object.entries(input)) {
    const table = restoreTable(alias);
    if (!table) {
      if (Array.isArray(value) && value.length) throw new Error(`Unsupported backup relation ${alias}. No shop data changed.`);
      continue;
    }
    if (seen.has(table)) throw new Error(`Duplicate ${table} source tables. No shop data changed.`);
    seen.add(table);
    if (!Array.isArray(value)) throw new Error(`Invalid ${alias} table in backup.`);
    raw[table] = value.map(v => rowObject(v, table));
  }
  if (!includeAudit) raw.audit_logs = [];
  // Older native exports omitted invoice stock allocations. Never silently invent them.
  if (!desktop && !seen.has("invoice_item_stock_allocations") && raw.invoice_items.some(r => r.product_type === "product")) {
    throw new Error("This backup lacks the invoice stock allocations required for a complete accounting restore. No shop data changed.");
  }
  if (ACCOUNTING_TABLES.reduce((n, t) => n + raw[t].length, 0) > ACCOUNTING_ROW_LIMIT) {
    throw new Error(AUTOMATIC_RESTORE_LIMIT_MESSAGE);
  }
  const maps = new Map<RestoreTable, Map<string, string>>();
  for (const [table, rows] of Object.entries(raw) as [RestoreTable, Row[]][]) {
    const map = new Map<string, string>();
    for (const row of rows) {
      const id = sourceIdentity(row, desktop);
      if (map.has(id)) throw new Error(`Duplicate ${table} source identity. No shop data changed.`);
      map.set(id, desktop ? randomId() : id);
    }
    maps.set(table, map);
  }
  const result = {} as RestorePlan;
  for (const [table, rows] of Object.entries(raw) as [RestoreTable, Row[]][]) {
    result[table] = rows.map(row => {
      const sourceId = sourceIdentity(row, desktop);
      const payload: Row = desktop ? {} : { ...row };
      if (desktop) {
        if (table === "supplier_purchases" && Object.hasOwn(row, "TotalPurchaseValue") && !Object.hasOwn(row, "Subtotal")) {
          throw new Error("This desktop backup lacks explicit supplier purchase headers required for a safe snapshot restore. No shop data changed.");
        }
        for (const field of SOURCE_COLUMNS[table]) {
          const value = desktopValue(field, pick(row, field, table));
          if (value !== undefined) payload[field] = value;
        }
        for (const [field, parent] of Object.entries(SOURCE_REFERENCES[table])) {
          if (parent === "organizations") { delete payload[field]; continue; }
          if (parent === "branches") { payload[field] = roots.branchId; continue; }
          if (parent === "profiles") { payload[field] = roots.actorId; continue; }
          const value = payload[field];
          if (value === undefined || value === null || value === 0 || value === "0") { delete payload[field]; continue; }
          const target = maps.get(parent as RestoreTable)?.get(String(value));
          if (!target) throw new Error(`Unresolved ${table}.${field} reference. No shop data changed.`);
          payload[field] = target;
        }
        if (table === "products" && !payload.category_id && row.Category) {
          const matches = raw.product_categories.filter(c => String(c.Name ?? c.name).trim().toLowerCase() === String(row.Category).trim().toLowerCase());
          if (matches.length !== 1) throw new Error("Unresolved or ambiguous product category. No shop data changed.");
          payload.category_id = maps.get("product_categories")!.get(sourceIdentity(matches[0], true));
        }
        if (table === "invoice_items" && row.IsServiceTransaction !== undefined) {
          const service = desktopValue("is_active", row.IsServiceTransaction);
          if (payload.product_type && payload.product_type !== (service ? "service" : "product")) throw new Error("Ambiguous invoice item type.");
          payload.product_type = service ? "service" : "product";
        }
      }
      payload.id = maps.get(table)!.get(sourceId);
      delete payload.posting_sequence;
      delete payload.posting_trust_version;
      delete payload.posting_effective_at;
      for (const key of Object.keys(payload)) if (key.startsWith("ledger_anchor_")) delete payload[key];
      if (table === "customers" || table === "suppliers") {
        payload.outstanding_balance = explicitOutstanding(row, desktop ? "OutstandingBalance" : "outstanding_balance", table === "suppliers");
      }
      return { source_id: sourceId, payload };
    });
  }
  // Older desktop allocations carry item/lot IDs only; derive references from this
  // same snapshot, never from an existing target or reconstructed stock chronology.
  if (desktop) {
    const items = new Map(result.invoice_items.map(r => [r.payload.id, r.payload]));
    for (const row of result.invoice_item_stock_allocations) {
      const item = items.get(row.payload.invoice_item_id);
      if (!item) throw new Error("Unresolved invoice allocation item.");
      row.payload.invoice_id ??= item.invoice_id;
      row.payload.product_id ??= item.product_id;
    }
    const returns = new Map(result.returns.map(r => [r.payload.id, r.payload]));
    for (const row of result.return_items) {
      const item = items.get(row.payload.invoice_item_id);
      const parent = returns.get(row.payload.return_id);
      if (!item || !parent) throw new Error("Unresolved returned invoice item.");
      row.payload.invoice_id ??= parent.invoice_id;
      row.payload.product_id ??= item.product_id;
      row.payload.item_name ??= item.product_name;
      row.payload.item_type ??= item.product_type;
    }
  }
  return result;
}
