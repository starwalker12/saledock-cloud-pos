/**
 * Client-side export helpers for the Replenishment / Purchase-Order planner.
 *
 * These are pure formatting/download utilities. They do NOT touch the database,
 * stock, suppliers, purchases, dues, payments, or any business records. A
 * purchase order produced here is a draft/export document only — nothing is
 * saved.
 *
 * Price handling depends on the caller:
 *  - Main replenishment table export: prices appear only when the "Show
 *    previous cost prices" toggle is ON, labelled "last known cost / estimate".
 *  - Purchase-order draft export: prices are per-row and fully editable, blank
 *    by default, and labelled "quoted / draft only".
 */

export type ExportColumn = {
  key: string;
  header: string;
  /** "text" left-aligns; "number" right-aligns and is treated as numeric in xlsx. */
  type?: "text" | "number";
};

export type ExportRow = Record<string, string | number | null | undefined>;

/** Optional [label, value] metadata rows written above the table (PO header info). */
export type MetaPair = [string, string];

export type PoMeta = {
  shopName?: string | null;
  title: string;
  reference?: string | null;
  supplierLabel: string;
  supplierCompany?: string | null;
  supplierPhone?: string | null;
  supplierEmail?: string | null;
  contactPerson?: string | null;
  priorities: string;
  preparedBy?: string | null;
  expectedDate?: string | null;
  deliveryNote?: string | null;
  paymentTerms?: string | null;
  notes?: string | null;
  quotedTotalLabel?: string | null; // pre-formatted "PKR 1,234" of priced rows, or null
  dateLabel: string;
};

function csvEscape(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function buildCsv(columns: ExportColumn[], rows: ExportRow[], metaPairs: MetaPair[] = []): string {
  const lines: string[] = [];
  for (const [label, value] of metaPairs) {
    lines.push(`${csvEscape(label)},${csvEscape(value)}`);
  }
  if (metaPairs.length > 0) lines.push("");
  lines.push(columns.map((c) => csvEscape(c.header)).join(","));
  for (const row of rows) {
    lines.push(columns.map((c) => csvEscape(row[c.key])).join(","));
  }
  // Prepend a UTF-8 BOM so Excel opens it with correct encoding.
  return `﻿${lines.join("\r\n")}`;
}

function xmlEscape(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? "" : String(value);
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function columnLetter(index: number): string {
  let n = index + 1;
  let letter = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}

type SheetCell = { numeric: boolean; value: string | number };

/**
 * Build a minimal but valid .xlsx (single sheet, inline strings) using the
 * already-present `jszip` dependency. No new package is added. Optional metadata
 * pairs are written as label/value rows above the table.
 */
export async function buildXlsxBlob(
  columns: ExportColumn[],
  rows: ExportRow[],
  metaPairs: MetaPair[] = [],
): Promise<Blob> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();

  const sheetRows: SheetCell[][] = [];
  for (const [label, value] of metaPairs) {
    sheetRows.push([
      { numeric: false, value: label },
      { numeric: false, value },
    ]);
  }
  if (metaPairs.length > 0) sheetRows.push([]);
  sheetRows.push(columns.map((c) => ({ numeric: false, value: c.header })));
  for (const row of rows) {
    sheetRows.push(
      columns.map((c) => {
        const raw = row[c.key];
        const numeric = c.type === "number" && raw !== null && raw !== undefined && raw !== "" && !Number.isNaN(Number(raw));
        return numeric ? { numeric: true, value: Number(raw) } : { numeric: false, value: raw === null || raw === undefined ? "" : String(raw) };
      }),
    );
  }

  const sheetRowsXml = sheetRows
    .map((cells, rowIdx) => {
      const cellsXml = cells
        .map((cell, colIdx) => {
          const ref = `${columnLetter(colIdx)}${rowIdx + 1}`;
          if (cell.numeric) return `<c r="${ref}"><v>${Number(cell.value)}</v></c>`;
          return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(String(cell.value))}</t></is></c>`;
        })
        .join("");
      return `<row r="${rowIdx + 1}">${cellsXml}</row>`;
    })
    .join("");

  const sheetXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetData>${sheetRowsXml}</sheetData></worksheet>`;

  const workbookXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets><sheet name="Purchase Order" sheetId="1" r:id="rId1"/></sheets></workbook>`;

  const workbookRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
    `</Relationships>`;

  const contentTypes =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
    `</Types>`;

  const rootRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
    `</Relationships>`;

  zip.file("[Content_Types].xml", contentTypes);
  zip.file("_rels/.rels", rootRels);
  zip.file("xl/workbook.xml", workbookXml);
  zip.file("xl/_rels/workbook.xml.rels", workbookRels);
  zip.file("xl/worksheets/sheet1.xml", sheetXml);

  return zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadCsv(filename: string, columns: ExportColumn[], rows: ExportRow[], metaPairs: MetaPair[] = []) {
  triggerDownload(new Blob([buildCsv(columns, rows, metaPairs)], { type: "text/csv;charset=utf-8" }), filename);
}

export async function downloadXlsx(filename: string, columns: ExportColumn[], rows: ExportRow[], metaPairs: MetaPair[] = []) {
  const blob = await buildXlsxBlob(columns, rows, metaPairs);
  triggerDownload(blob, filename);
}

export function exportDateStamp(d = new Date()): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Build a clean, SaleDock-branded printable purchase-order draft / replenishment
 * export and open it for the browser's native Print / Save-as-PDF. No PDF
 * library is used.
 */
export function openPrintablePo(
  meta: PoMeta,
  columns: ExportColumn[],
  rows: ExportRow[],
): boolean {
  const win = window.open("", "_blank", "noopener,noreferrer,width=900,height=1000");
  if (!win) return false;

  const headCells = columns
    .map((c) => `<th class="${c.type === "number" ? "num" : ""}">${xmlEscape(c.header)}</th>`)
    .join("");
  const bodyRows = rows
    .map(
      (row) =>
        `<tr>${columns
          .map((c) => `<td class="${c.type === "number" ? "num" : ""}">${xmlEscape(row[c.key] ?? "")}</td>`)
          .join("")}</tr>`,
    )
    .join("");

  const supLines: string[] = [`<strong>Supplier:</strong> ${xmlEscape(meta.supplierLabel)}`];
  if (meta.contactPerson) supLines.push(`Contact: ${xmlEscape(meta.contactPerson)}`);
  if (meta.supplierCompany) supLines.push(`Company: ${xmlEscape(meta.supplierCompany)}`);
  if (meta.supplierPhone) supLines.push(`Phone: ${xmlEscape(meta.supplierPhone)}`);
  if (meta.supplierEmail) supLines.push(`Email: ${xmlEscape(meta.supplierEmail)}`);

  const detailLines: string[] = [`<div><strong>Priorities:</strong> ${xmlEscape(meta.priorities)}</div>`];
  if (meta.reference) detailLines.push(`<div><strong>Reference:</strong> ${xmlEscape(meta.reference)}</div>`);
  if (meta.preparedBy) detailLines.push(`<div><strong>Prepared by:</strong> ${xmlEscape(meta.preparedBy)}</div>`);
  if (meta.expectedDate) detailLines.push(`<div><strong>Expected date:</strong> ${xmlEscape(meta.expectedDate)}</div>`);

  const extraBlocks: string[] = [];
  if (meta.deliveryNote) extraBlocks.push(`<div class="block"><strong>Delivery / location:</strong> ${xmlEscape(meta.deliveryNote)}</div>`);
  if (meta.paymentTerms) extraBlocks.push(`<div class="block"><strong>Payment / terms:</strong> ${xmlEscape(meta.paymentTerms)}</div>`);
  if (meta.notes) extraBlocks.push(`<div class="block"><strong>Notes:</strong> ${xmlEscape(meta.notes)}</div>`);

  const doc = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>${xmlEscape(meta.title)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, system-ui, Segoe UI, Roboto, sans-serif; color: #0f172a; margin: 0; }
  .wrap { margin: 24px; }
  .brandbar { background: linear-gradient(90deg, #0b2f6f 0%, #0d3b8a 55%, #0d9488 100%); color: #fff; padding: 18px 24px; border-radius: 12px; display: flex; justify-content: space-between; align-items: center; gap: 16px; }
  .brandbar .shop { font-size: 20px; font-weight: 800; letter-spacing: .2px; }
  .brandbar .tag { font-size: 11px; opacity: .85; margin-top: 2px; }
  .brandbar .doc { text-align: right; }
  .brandbar .doc .t { font-size: 15px; font-weight: 800; }
  .brandbar .doc .r { font-size: 11px; opacity: .9; margin-top: 2px; }
  .grid { display: flex; flex-wrap: wrap; gap: 24px; margin: 18px 0 12px; font-size: 12px; }
  .grid .box { line-height: 1.6; }
  .block { font-size: 12px; line-height: 1.6; margin-top: 4px; }
  .notice { background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 12px; font-size: 11px; color: #475569; margin: 12px 0 14px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #0b2f6f; color: #fff; font-weight: 700; text-transform: uppercase; font-size: 10px; letter-spacing: .03em; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  tbody tr:nth-child(even) { background: #f8fafc; }
  .total { margin-top: 12px; text-align: right; font-size: 13px; font-weight: 800; color: #0b2f6f; }
  .foot { margin-top: 24px; color: #94a3b8; font-size: 10px; }
  @media print { .wrap { margin: 12mm; } .noprint { display: none; } }
  .btn { display:inline-block; margin: 16px 6px 0 0; padding: 8px 14px; border-radius: 8px; border: 1px solid #cbd5e1; background:#fff; font-size: 13px; cursor: pointer; }
  .btn.primary { background:#0b2f6f; color:#fff; border-color:#0b2f6f; }
</style></head>
<body>
  <div class="wrap">
    <div class="brandbar">
      <div>
        <div class="shop">${xmlEscape(meta.shopName || "SaleDock")}</div>
        <div class="tag">Powered by SaleDock Cloud POS</div>
      </div>
      <div class="doc">
        <div class="t">${xmlEscape(meta.title)}</div>
        <div class="r">${meta.reference ? xmlEscape(meta.reference) + " &middot; " : ""}${xmlEscape(meta.dateLabel)}</div>
      </div>
    </div>

    <div class="grid">
      <div class="box">${supLines.join("<br>")}</div>
      <div class="box">${detailLines.join("")}</div>
    </div>
    ${extraBlocks.join("")}

    <div class="notice">
      Draft purchase order. Prices are quoted / draft only. Confirm rates and availability with the supplier. This is not a payment or stock record.
    </div>

    <table><thead><tr>${headCells}</tr></thead><tbody>${bodyRows}</tbody></table>
    ${meta.quotedTotalLabel ? `<div class="total">Quoted total (priced rows only): ${xmlEscape(meta.quotedTotalLabel)}</div>` : ""}

    <div class="noprint">
      <button class="btn primary" onclick="window.print()">Print / Save as PDF</button>
      <button class="btn" onclick="window.close()">Close</button>
    </div>
    <div class="foot">Generated by SaleDock &middot; ${xmlEscape(meta.dateLabel)} &middot; Draft document, not a payment record.</div>
  </div>
</body></html>`;

  win.document.open();
  win.document.write(doc);
  win.document.close();
  return true;
}
