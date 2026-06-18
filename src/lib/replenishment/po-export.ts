/**
 * Client-side export helpers for the Replenishment / Purchase-Order planner.
 *
 * These are pure formatting/download utilities. They do NOT touch the database,
 * stock, suppliers, purchases, dues, payments, or any business records. A
 * purchase order produced here is a draft/export document only — nothing is
 * saved. Costs are included only when explicitly requested (cost toggle ON) and
 * are always "last known cost / estimate only".
 */

export type ExportColumn = {
  key: string;
  header: string;
  /** "text" left-aligns; "number" right-aligns and is treated as numeric in xlsx. */
  type?: "text" | "number";
};

export type ExportRow = Record<string, string | number | null | undefined>;

export type PoMeta = {
  shopName?: string | null;
  supplierLabel: string;
  supplierCompany?: string | null;
  supplierPhone?: string | null;
  supplierEmail?: string | null;
  priorities: string; // e.g. "Critical, High"
  preparedBy?: string | null;
  expectedDate?: string | null;
  notes?: string | null;
  showCosts: boolean;
  dateLabel: string; // human date for the document
};

function csvEscape(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function buildCsv(columns: ExportColumn[], rows: ExportRow[]): string {
  const head = columns.map((c) => csvEscape(c.header)).join(",");
  const body = rows
    .map((row) => columns.map((c) => csvEscape(row[c.key])).join(","))
    .join("\r\n");
  // Prepend a UTF-8 BOM so Excel opens it with correct encoding.
  return `﻿${head}\r\n${body}`;
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

/**
 * Build a minimal but valid .xlsx (single sheet, inline strings) using the
 * already-present `jszip` dependency. No new package is added. Numbers are
 * written as numeric cells; everything else as inline strings.
 */
export async function buildXlsxBlob(columns: ExportColumn[], rows: ExportRow[]): Promise<Blob> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();

  const allRows: ExportRow[] = [
    Object.fromEntries(columns.map((c) => [c.key, c.header])),
    ...rows,
  ];

  const sheetRowsXml = allRows
    .map((row, rowIdx) => {
      const cells = columns
        .map((col, colIdx) => {
          const ref = `${columnLetter(colIdx)}${rowIdx + 1}`;
          const raw = row[col.key];
          const isHeaderRow = rowIdx === 0;
          const numeric =
            !isHeaderRow && col.type === "number" && raw !== null && raw !== undefined && raw !== "" && !Number.isNaN(Number(raw));
          if (numeric) {
            return `<c r="${ref}"><v>${Number(raw)}</v></c>`;
          }
          const text = raw === null || raw === undefined ? "" : String(raw);
          return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(text)}</t></is></c>`;
        })
        .join("");
      return `<row r="${rowIdx + 1}">${cells}</row>`;
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
    `<sheets><sheet name="Replenishment" sheetId="1" r:id="rId1"/></sheets></workbook>`;

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
  // Revoke on the next tick so the download has time to start.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadCsv(filename: string, columns: ExportColumn[], rows: ExportRow[]) {
  triggerDownload(new Blob([buildCsv(columns, rows)], { type: "text/csv;charset=utf-8" }), filename);
}

export async function downloadXlsx(filename: string, columns: ExportColumn[], rows: ExportRow[]) {
  const blob = await buildXlsxBlob(columns, rows);
  triggerDownload(blob, filename);
}

export function exportDateStamp(d = new Date()): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Build a clean, self-contained printable HTML document for a purchase-order
 * draft / replenishment export and open it in a new window for the browser's
 * native Print / Save-as-PDF. No PDF library is used.
 */
export function openPrintablePo(
  title: string,
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

  const metaLines: string[] = [];
  if (meta.shopName) metaLines.push(`<div class="shop">${xmlEscape(meta.shopName)}</div>`);
  metaLines.push(`<div class="sub">Purchase order draft &middot; ${xmlEscape(meta.dateLabel)}</div>`);
  const supLines: string[] = [`<strong>Supplier:</strong> ${xmlEscape(meta.supplierLabel)}`];
  if (meta.supplierCompany) supLines.push(`Company: ${xmlEscape(meta.supplierCompany)}`);
  if (meta.supplierPhone) supLines.push(`Phone: ${xmlEscape(meta.supplierPhone)}`);
  if (meta.supplierEmail) supLines.push(`Email: ${xmlEscape(meta.supplierEmail)}`);
  const detailLines: string[] = [`<div><strong>Priorities:</strong> ${xmlEscape(meta.priorities)}</div>`];
  if (meta.preparedBy) detailLines.push(`<div><strong>Prepared by:</strong> ${xmlEscape(meta.preparedBy)}</div>`);
  if (meta.expectedDate) detailLines.push(`<div><strong>Expected date:</strong> ${xmlEscape(meta.expectedDate)}</div>`);

  const doc = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>${xmlEscape(title)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, system-ui, Segoe UI, Roboto, sans-serif; color: #0f172a; margin: 24px; }
  .shop { font-size: 20px; font-weight: 800; }
  .sub { color: #64748b; font-size: 12px; margin-top: 2px; }
  .title { font-size: 16px; font-weight: 800; margin: 16px 0 4px; }
  .grid { display: flex; flex-wrap: wrap; gap: 24px; margin: 12px 0 16px; font-size: 12px; }
  .grid .box { line-height: 1.6; }
  .notice { background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 12px; font-size: 11px; color: #475569; margin: 8px 0 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; }
  th { background: #f8fafc; font-weight: 700; text-transform: uppercase; font-size: 10px; letter-spacing: .03em; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  .notes { margin-top: 16px; font-size: 12px; }
  .foot { margin-top: 24px; color: #94a3b8; font-size: 10px; }
  @media print { body { margin: 12mm; } .noprint { display: none; } }
  .btn { display:inline-block; margin: 0 6px 16px 0; padding: 8px 14px; border-radius: 8px; border: 1px solid #cbd5e1; background:#fff; font-size: 13px; cursor: pointer; }
  .btn.primary { background:#0b2f6f; color:#fff; border-color:#0b2f6f; }
</style></head>
<body>
  <div class="noprint">
    <button class="btn primary" onclick="window.print()">Print / Save as PDF</button>
    <button class="btn" onclick="window.close()">Close</button>
  </div>
  ${metaLines.join("")}
  <div class="title">${xmlEscape(title)}</div>
  <div class="grid">
    <div class="box">${supLines.join("<br>")}</div>
    <div class="box">${detailLines.join("")}</div>
  </div>
  <div class="notice">
    Purchase order draft. No stock will change. Prices are not final${meta.showCosts ? " — last known cost / estimate only" : ""}. Confirm rates and availability with the supplier. This export is for ordering, not payment.
  </div>
  <table><thead><tr>${headCells}</tr></thead><tbody>${bodyRows}</tbody></table>
  ${meta.notes ? `<div class="notes"><strong>Notes:</strong> ${xmlEscape(meta.notes)}</div>` : ""}
  <div class="foot">Generated by SaleDock &middot; ${xmlEscape(meta.dateLabel)} &middot; Draft document, not a payment record.</div>
</body></html>`;

  win.document.open();
  win.document.write(doc);
  win.document.close();
  return true;
}
