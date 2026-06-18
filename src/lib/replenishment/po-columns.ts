import type { ExportColumn, ExportRow } from "./po-export";
import type { ReplenishmentPriority } from "@/lib/data/replenishment";

const PRIORITY_LABEL: Record<ReplenishmentPriority, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
};

/** A normalized item for export. `quantity` may be the suggested or PO-edited qty. */
export type ExportItem = {
  productName: string;
  sku: string | null;
  supplierName: string | null;
  supplierCompany: string | null;
  supplierPhone: string | null;
  supplierEmail: string | null;
  currentStock: number;
  minimumStock: number;
  targetStock: number;
  quantity: number;
  purchasePrice: number;
  priority: ReplenishmentPriority;
  reason: string;
};

/**
 * Columns for an export/PO. When `showCosts` is false, unit cost and estimated
 * total are omitted entirely (never written to CSV/XLSX/PDF). When true they are
 * included with explicit "last known" / "estimate only" wording.
 */
export function buildExportColumns(showCosts: boolean, currency: string): ExportColumn[] {
  const base: ExportColumn[] = [
    { key: "product", header: "Product", type: "text" },
    { key: "sku", header: "SKU", type: "text" },
    { key: "supplier", header: "Supplier", type: "text" },
    { key: "company", header: "Company", type: "text" },
    { key: "phone", header: "Phone", type: "text" },
    { key: "email", header: "Email", type: "text" },
    { key: "currentStock", header: "Current stock", type: "number" },
    { key: "minimumStock", header: "Min stock", type: "number" },
    { key: "targetStock", header: "Target stock", type: "number" },
    { key: "quantity", header: "Order qty", type: "number" },
    { key: "priority", header: "Priority", type: "text" },
    { key: "reason", header: "Reason", type: "text" },
  ];
  if (showCosts) {
    base.push(
      { key: "unitCost", header: `Unit cost (${currency}, last known)`, type: "number" },
      { key: "estimate", header: `Estimated total (${currency}, estimate only)`, type: "number" },
    );
  }
  return base;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function mapItemsToRows(items: ExportItem[], showCosts: boolean): ExportRow[] {
  return items.map((it) => {
    const row: ExportRow = {
      product: it.productName,
      sku: it.sku ?? "",
      supplier: it.supplierName ?? "Unassigned",
      company: it.supplierCompany ?? "",
      phone: it.supplierPhone ?? "",
      email: it.supplierEmail ?? "",
      currentStock: it.currentStock,
      minimumStock: it.minimumStock,
      targetStock: it.targetStock,
      quantity: it.quantity,
      priority: PRIORITY_LABEL[it.priority],
      reason: it.reason,
    };
    if (showCosts) {
      const estimate = it.purchasePrice > 0 ? round2(it.quantity * it.purchasePrice) : null;
      row.unitCost = it.purchasePrice > 0 ? round2(it.purchasePrice) : "";
      row.estimate = estimate ?? "";
    }
    return row;
  });
}

/**
 * A fully-edited purchase-order draft row. `price` is null when the user left it
 * blank (then unit price and line total are exported blank). This is a
 * draft/export shape only — it never maps back to product or supplier records.
 */
export type PoDraftItem = {
  name: string;
  sku: string | null;
  supplierName: string | null;
  supplierCompany: string | null;
  supplierPhone: string | null;
  supplierEmail: string | null;
  currentStock: number | null;
  minimumStock: number | null;
  targetStock: number | null;
  quantity: number;
  price: number | null;
  note: string;
  priority: ReplenishmentPriority | null;
  reason: string;
};

/**
 * Columns for an editable purchase-order draft. Unit price and line total are
 * always present (the per-row price is optional/blank), with explicit
 * "quoted/draft" wording. Stock/min/target/priority/reason are planning context
 * and are left blank for custom items.
 */
export function buildPoColumns(currency: string): ExportColumn[] {
  return [
    { key: "product", header: "Product", type: "text" },
    { key: "sku", header: "SKU", type: "text" },
    { key: "supplier", header: "Supplier", type: "text" },
    { key: "company", header: "Company", type: "text" },
    { key: "phone", header: "Phone", type: "text" },
    { key: "email", header: "Email", type: "text" },
    { key: "currentStock", header: "Current stock", type: "number" },
    { key: "minimumStock", header: "Min stock", type: "number" },
    { key: "targetStock", header: "Target stock", type: "number" },
    { key: "quantity", header: "Order qty", type: "number" },
    { key: "priority", header: "Priority", type: "text" },
    { key: "reason", header: "Reason", type: "text" },
    { key: "unitPrice", header: `Unit price (${currency}, quoted/draft)`, type: "number" },
    { key: "lineTotal", header: `Line total (${currency}, quoted/draft)`, type: "number" },
    { key: "note", header: "Notes", type: "text" },
  ];
}

export function mapPoDraftRows(items: PoDraftItem[]): ExportRow[] {
  return items.map((it) => {
    const hasPrice = it.price !== null && it.price >= 0;
    const lineTotal = hasPrice ? round2(it.quantity * (it.price as number)) : "";
    return {
      product: it.name,
      sku: it.sku ?? "",
      supplier: it.supplierName ?? (it.priority === null ? "" : "Unassigned"),
      company: it.supplierCompany ?? "",
      phone: it.supplierPhone ?? "",
      email: it.supplierEmail ?? "",
      currentStock: it.currentStock ?? "",
      minimumStock: it.minimumStock ?? "",
      targetStock: it.targetStock ?? "",
      quantity: it.quantity,
      priority: it.priority ? PRIORITY_LABEL[it.priority] : "",
      reason: it.reason,
      unitPrice: hasPrice ? round2(it.price as number) : "",
      lineTotal,
      note: it.note,
    };
  });
}

export { PRIORITY_LABEL };
