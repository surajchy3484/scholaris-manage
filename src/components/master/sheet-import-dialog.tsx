import { useState, type ReactNode } from "react";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Copy, Download, Upload } from "lucide-react";
import { downloadSampleSheet } from "@/lib/sample-templates";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

/** `duplicate` rows are skipped on import but reported separately from errors. */
export type ParsedBase = { _row: number; errors: string[]; duplicate?: boolean };

/** Reads the first sheet of an .xls/.xlsx/.csv file into plain objects. */
export async function readSheet(file: File): Promise<Record<string, unknown>[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error("That file has no readable sheet");
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
}

/** Normalises a header so "Correct Ans (A,B,C,D)" matches "correct ans". */
const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Excel serial date → yyyy-mm-dd. */
function serialToDate(n: number): string | null {
  if (!Number.isFinite(n) || n <= 0) return null;
  const ms = Math.round((n - 25569) * 86400 * 1000);
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/**
 * Header-name lookup that ignores case, spacing, punctuation and bracketed
 * hints, so column order and small header differences never break an import.
 */
export function pick(row: Record<string, unknown>, ...keys: string[]): string {
  const entries = Object.keys(row).map((k) => [norm(k), k] as const);
  for (const k of keys) {
    const want = norm(k);
    const hit = entries.find(([n]) => n === want) ?? entries.find(([n]) => n.startsWith(want));
    if (!hit) continue;
    const v = row[hit[1]];
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    return String(v ?? "").trim();
  }
  return "";
}

/** Reads a date cell in any common shape (Date, Excel serial, text). */
export function pickDate(row: Record<string, unknown>, ...keys: string[]): string | null {
  const raw = pick(row, ...keys);
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (/^\d+(\.\d+)?$/.test(raw)) return serialToDate(Number(raw));
  const dmy = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (dmy) {
    const [, a, b, y] = dmy;
    const year = y.length === 2 ? `20${y}` : y;
    return `${year}-${b.padStart(2, "0")}-${a.padStart(2, "0")}`;
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

const tick = () => new Promise((r) => setTimeout(r, 0));

/**
 * Generic Excel/CSV importer with validation preview, batched commit,
 * live progress and a downloadable error report.
 */
export function SheetImportDialog<T extends ParsedBase>({
  open,
  onOpenChange,
  title,
  description,
  parse,
  commit,
  columns,
  sample,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description: string;
  parse: (rows: Record<string, unknown>[]) => T[];
  commit: (valid: T[], onProgress?: (done: number) => void) => Promise<string>;
  columns: { label: string; get: (r: T) => ReactNode }[];
  sample?: { fileName: string; sheetName: string; rows: Record<string, string | number>[] };
}) {
  const [rows, setRows] = useState<T[]>([]);
  const [fileName, setFileName] = useState("");
  const [reading, setReading] = useState(false);
  const [done, setDone] = useState(0);
  const [summary, setSummary] = useState<string | null>(null);

  const valid = rows.filter((r) => r.errors.length === 0);
  const duplicates = rows.filter((r) => r.duplicate);
  const failed = rows.filter((r) => r.errors.length > 0 && !r.duplicate);

  const run = useMutation({
    mutationFn: async () => {
      setDone(0);
      return commit(valid, (n) => setDone(n));
    },
    onSuccess: (msg) => {
      setSummary(msg);
      toast.success("Import complete");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const downloadErrors = () => {
    const bad = rows.filter((r) => r.errors.length > 0);
    const data = bad.map((r) => {
      const out: Record<string, string> = { Row: String(r._row) };
      for (const c of columns) out[c.label] = String(c.get(r) ?? "");
      out.Issues = r.errors.join("; ");
      return out;
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Errors");
    const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    saveAs(new Blob([buf], { type: "application/octet-stream" }), "import-error-report.xlsx");
  };

  const close = (o: boolean) => {
    if (run.isPending) return;
    if (!o) {
      setRows([]);
      setSummary(null);
      setFileName("");
      setDone(0);
    }
    onOpenChange(o);
  };

  const percent = valid.length ? Math.min(100, Math.round((done / valid.length) * 100)) : 0;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border p-8 text-center transition hover:border-primary/60 hover:bg-muted/40">
            <Upload className="h-6 w-6 text-primary" />
            <span className="text-sm font-medium">
              {fileName || "Choose an .xlsx, .xls or .csv file"}
            </span>
            {reading && <span className="text-xs text-muted-foreground">Reading file…</span>}
            <input
              type="file"
              accept=".xls,.xlsx,.csv"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setSummary(null);
                setFileName(f.name);
                setReading(true);
                await tick();
                try {
                  const raw = await readSheet(f);
                  if (raw.length === 0) throw new Error("That file has no data rows");
                  setRows(parse(raw));
                } catch (err) {
                  setRows([]);
                  toast.error(err instanceof Error ? err.message : "Could not read that file");
                } finally {
                  setReading(false);
                }
              }}
            />
          </label>

          {sample && (
            <div className="flex justify-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => downloadSampleSheet(sample.fileName, sample.sheetName, sample.rows)}
              >
                <Download className="h-4 w-4" />
                Download template
              </Button>
            </div>
          )}

          {rows.length > 0 && (
            <>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge className="bg-success/15 text-success">
                  <CheckCircle2 className="mr-1 h-3 w-3" /> {valid.length} ready
                </Badge>
                {duplicates.length > 0 && (
                  <Badge className="bg-warning/15 text-warning">
                    <Copy className="mr-1 h-3 w-3" /> {duplicates.length} duplicate
                  </Badge>
                )}
                {failed.length > 0 && (
                  <Badge className="bg-destructive/15 text-destructive">
                    <AlertTriangle className="mr-1 h-3 w-3" /> {failed.length} with errors
                  </Badge>
                )}
                {rows.length - valid.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={downloadErrors}>
                    <Download className="h-4 w-4" /> Download error report
                  </Button>
                )}
              </div>

              {run.isPending && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>
                      Importing {done.toLocaleString()} / {valid.length.toLocaleString()}
                    </span>
                    <span>{percent}%</span>
                  </div>
                  <Progress value={percent} />
                </div>
              )}

              <div className="max-h-72 overflow-auto rounded-lg border border-border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted">
                    <tr>
                      <th className="px-2 py-2 text-left font-semibold">Row</th>
                      {columns.map((c) => (
                        <th key={c.label} className="px-2 py-2 text-left font-semibold">
                          {c.label}
                        </th>
                      ))}
                      <th className="px-2 py-2 text-left font-semibold">Issues</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 400).map((r) => (
                      <tr
                        key={r._row}
                        className={r.errors.length ? "bg-destructive/5" : "border-t border-border"}
                      >
                        <td className="px-2 py-1.5">{r._row}</td>
                        {columns.map((c) => (
                          <td key={c.label} className="whitespace-nowrap px-2 py-1.5">
                            {c.get(r)}
                          </td>
                        ))}
                        <td className="px-2 py-1.5 text-destructive">{r.errors.join(", ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.length > 400 && (
                <p className="text-xs text-muted-foreground">
                  Showing the first 400 rows of {rows.length.toLocaleString()}. All valid rows are
                  imported.
                </p>
              )}
            </>
          )}

          {summary && (
            <div className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
              {summary}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)} disabled={run.isPending}>
            Close
          </Button>
          <Button onClick={() => run.mutate()} disabled={valid.length === 0 || run.isPending}>
            {run.isPending
              ? `Importing… ${percent}%`
              : `Import ${valid.length.toLocaleString()} row(s)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
