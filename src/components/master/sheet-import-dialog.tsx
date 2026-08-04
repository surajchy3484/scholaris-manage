import { useState, type ReactNode } from "react";
import * as XLSX from "xlsx";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Upload } from "lucide-react";

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

export type ParsedBase = { _row: number; errors: string[] };

/** Reads the first sheet of an .xls/.xlsx/.csv file into plain objects. */
export async function readSheet(file: File): Promise<Record<string, unknown>[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
}

/** Case-insensitive column lookup helper for imported rows. */
export function pick(row: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const found = Object.keys(row).find((rk) => rk.trim().toLowerCase() === k.toLowerCase());
    if (found) return String(row[found] ?? "").trim();
  }
  return "";
}

/**
 * Generic Excel/CSV importer with validation preview. Each module supplies its
 * own `parse` (row → typed record + errors) and `commit` (write valid rows).
 */
export function SheetImportDialog<T extends ParsedBase>({
  open,
  onOpenChange,
  title,
  description,
  parse,
  commit,
  columns,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description: string;
  parse: (rows: Record<string, unknown>[]) => T[];
  commit: (valid: T[]) => Promise<string>;
  columns: { label: string; get: (r: T) => ReactNode }[];
}) {
  const [rows, setRows] = useState<T[]>([]);
  const [summary, setSummary] = useState<string | null>(null);

  const valid = rows.filter((r) => r.errors.length === 0);
  const invalid = rows.filter((r) => r.errors.length > 0);

  const run = useMutation({
    mutationFn: () => commit(valid),
    onSuccess: (msg) => {
      setSummary(msg);
      toast.success("Import complete");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const close = (o: boolean) => {
    if (run.isPending) return;
    if (!o) {
      setRows([]);
      setSummary(null);
    }
    onOpenChange(o);
  };

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
            <span className="text-sm font-medium">Choose an .xlsx, .xls or .csv file</span>
            <input
              type="file"
              accept=".xls,.xlsx,.csv"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setSummary(null);
                try {
                  setRows(parse(await readSheet(f)));
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Could not read that file");
                }
              }}
            />
          </label>

          {rows.length > 0 && (
            <>
              <div className="flex flex-wrap gap-2 text-sm">
                <Badge className="bg-success/15 text-success">
                  <CheckCircle2 className="mr-1 h-3 w-3" /> {valid.length} valid
                </Badge>
                {invalid.length > 0 && (
                  <Badge className="bg-destructive/15 text-destructive">
                    <AlertTriangle className="mr-1 h-3 w-3" /> {invalid.length} with errors
                  </Badge>
                )}
              </div>

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
                  Showing the first 400 rows of {rows.length}. All valid rows are imported.
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
            {run.isPending ? "Importing..." : `Import ${valid.length} valid row(s)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
