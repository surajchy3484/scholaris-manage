import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Upload, Download, AlertCircle, CheckCircle2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import type { School } from "@/lib/types";
import { formatStudentCode, nextStudentCode } from "@/lib/student-id";
import { parseImportFile, downloadSampleTemplate, type ImportRow } from "@/lib/excel";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export function ImportStudentsDialog({
  school,
  open,
  onOpenChange,
}: {
  school: School;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [fileName, setFileName] = useState("");
  const qc = useQueryClient();

  const reset = () => {
    setRows([]);
    setFileName("");
  };

  async function handleFile(file: File) {
    setFileName(file.name);
    try {
      const parsed = await parseImportFile(file);
      // Detect duplicates within import
      const seen = new Map<string, number>();
      parsed.forEach((r, i) => {
        const key = `${r.class}|${r.division}|${r.roll_number}`.toLowerCase();
        if (seen.has(key)) {
          r._errors.push(`Duplicate roll in file (row ${seen.get(key)! + 2})`);
        } else {
          seen.set(key, i);
        }
      });
      setRows(parsed);
    } catch {
      toast.error("Could not parse file");
    }
  }

  const importMut = useMutation({
    mutationFn: async () => {
      const valid = rows.filter((r) => r._errors.length === 0);
      if (!valid.length) throw new Error("No valid rows to import");
      // Get current max sequence for this school, then assign sequentially.
      const first = await nextStudentCode(school.id, school.code);
      // parse starting seq from first
      const startSeq = parseInt(first.split("-STU")[1], 10);
      const payload = valid.map((r, i) => ({
        school_id: school.id,
        student_code: formatStudentCode(school.code, startSeq + i),
        name: r.name,
        class: r.class,
        division: r.division,
        roll_number: r.roll_number,
        photo_url: null,
      }));
      const { error } = await supabase.from("students").insert(payload);
      if (error) throw error;
      return valid.length;
    },
    onSuccess: (n) => {
      qc.invalidateQueries({ queryKey: ["students"] });
      qc.invalidateQueries({ queryKey: ["schools"] });
      toast.success(`Imported ${n} students`);
      reset();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const valid = rows.filter((r) => r._errors.length === 0).length;
  const invalid = rows.length - valid;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import students</DialogTitle>
          <DialogDescription>
            Upload an Excel (.xlsx, .xls) or CSV file with columns: Student Name, Class, Division,
            Roll Number.
          </DialogDescription>
        </DialogHeader>

        {rows.length === 0 ? (
          <div className="space-y-4 py-4">
            <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border bg-muted/40 p-10 transition-colors hover:border-primary hover:bg-accent/40">
              <Upload className="h-8 w-8 text-muted-foreground" />
              <div className="text-center">
                <p className="font-medium">Click to choose a file</p>
                <p className="text-xs text-muted-foreground">.xlsx, .xls, or .csv</p>
              </div>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
            </label>
            <div className="flex justify-center">
              <Button variant="ghost" size="sm" onClick={downloadSampleTemplate}>
                <Download className="h-4 w-4" />
                Download sample template
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{fileName}</Badge>
              <Badge className="bg-success text-success-foreground">
                <CheckCircle2 className="h-3 w-3" /> {valid} valid
              </Badge>
              {invalid > 0 && (
                <Badge variant="destructive">
                  <AlertCircle className="h-3 w-3" /> {invalid} invalid
                </Badge>
              )}
              <Button variant="ghost" size="sm" onClick={reset} className="ml-auto">
                Choose another file
              </Button>
            </div>
            <div className="max-h-80 overflow-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead>Div</TableHead>
                    <TableHead>Roll</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow
                      key={r._row}
                      className={r._errors.length ? "bg-destructive/5" : ""}
                    >
                      <TableCell className="text-xs text-muted-foreground">{r._row}</TableCell>
                      <TableCell>{r.name || <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell>{r.class || "—"}</TableCell>
                      <TableCell>{r.division || "—"}</TableCell>
                      <TableCell>{r.roll_number || "—"}</TableCell>
                      <TableCell>
                        {r._errors.length ? (
                          <span className="text-xs text-destructive">{r._errors.join(", ")}</span>
                        ) : (
                          <span className="text-xs text-success">Ready</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => importMut.mutate()}
            disabled={rows.length === 0 || valid === 0 || importMut.isPending}
          >
            {importMut.isPending ? "Importing..." : `Import ${valid} valid`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
