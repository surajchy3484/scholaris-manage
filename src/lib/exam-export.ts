import FileSaver from "file-saver";
const { saveAs } = FileSaver;

export type Row = Record<string, string | number>;

export async function exportRowsToExcel(filename: string, rows: Row[], sheet = "Report") {
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheet);
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  saveAs(new Blob([buf], { type: "application/octet-stream" }), `${filename}.xlsx`);
}

export async function exportRowsToCsv(filename: string, rows: Row[]) {
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.json_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(ws);
  saveAs(new Blob([csv], { type: "text/csv;charset=utf-8" }), `${filename}.csv`);
}

function tableHtml(title: string, rows: Row[]) {
  const cols = rows.length > 0 ? Object.keys(rows[0]) : [];
  const esc = (v: unknown) =>
    String(v ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  body{font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:28px;color:#1b1f3b}
  h1{font-size:20px;margin:0 0 4px}
  .sub{color:#6b7280;font-size:12px;margin-bottom:18px}
  table{width:100%;border-collapse:collapse;font-size:12px}
  th{background:#3949ab;color:#fff;text-align:left;padding:8px;font-weight:600}
  td{padding:7px 8px;border-bottom:1px solid #e5e7eb}
  tr:nth-child(even) td{background:#f7f8fc}
  @media print{@page{size:landscape;margin:12mm}}
</style></head><body>
<h1>${esc(title)}</h1>
<div class="sub">Generated ${new Date().toLocaleString()} · ${rows.length} records</div>
<table><thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead>
<tbody>${rows
    .map((r) => `<tr>${cols.map((c) => `<td>${esc(r[c])}</td>`).join("")}</tr>`)
    .join("")}</tbody></table></body></html>`;
}

/** Opens the browser print dialog — users can choose "Save as PDF". */
export function printRows(title: string, rows: Row[], existingWindow?: Window) {
  const w = existingWindow ?? window.open("", "_blank", "width=1100,height=800");
  if (!w) return false;
  w.document.write(tableHtml(title, rows));
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 350);
  return true;
}

export const exportRowsToPdf = printRows;
