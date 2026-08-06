import { useState } from "react";
import * as XLSX from "xlsx";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Download, Upload } from "lucide-react";
import { downloadSampleSheet, EXAM_SAMPLE } from "@/lib/sample-templates";


import { supabase } from "@/integrations/supabase/client";
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
import { saveScore, ATTENDANCE_TYPE } from "@/lib/exam";
import { formatStudentCode } from "@/lib/student-id";

type ParsedRow = {
  _row: number;
  student_code: string;
  name: string;
  class: string;
  division: string;
  roll_number: string;
  attendance: number | null;
  photo_url: string | null;
  enrollment_date: string | null;
  ica: number | null;
  imf: number | null;
  fca: number | null;
  errors: string[];
};

function cellDate(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function cellNum(v: unknown): number | null | "invalid" {
  if (v == null || String(v).trim() === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return "invalid";
  return n;
}

export function ExamImportDialog({
  open,
  onOpenChange,
  schoolId,
  schoolCode,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  schoolId: string;
  schoolCode: string;
}) {
  const qc = useQueryClient();
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [summary, setSummary] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setSummary(null);
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
    const seen = new Set<string>();

    const parsed: ParsedRow[] = raw.map((r, i) => {
      const get = (...keys: string[]) => {
        for (const k of keys) {
          const found = Object.keys(r).find((rk) => rk.trim().toLowerCase() === k);
          if (found) return r[found];
        }
        return "";
      };
      const errors: string[] = [];
      const code = String(get("student id", "student code", "id") ?? "").trim();
      const name = String(get("student name", "name") ?? "").trim();
      const cls = String(get("class") ?? "").trim();
      const division = String(get("division", "section") ?? "").trim().toUpperCase();
      const roll = String(get("roll no", "roll number", "roll", "rollno") ?? "").trim();
      const photo = String(get("photo", "photo url") ?? "").trim();

      const att = cellNum(get("attendance", "attendance %"));
      const ica = cellNum(get("ica score", "ica"));
      const imf = cellNum(get("imf score", "imf"));
      const fca = cellNum(get("fca score", "fca"));

      if (!name) errors.push("Missing Student Name");
      if (!cls) errors.push("Missing Class");
      if (!division) errors.push("Missing Division");
      if (!roll) errors.push("Missing Roll No");
      const range = (v: number | null | "invalid", label: string) => {
        if (v === "invalid") errors.push(`${label} is not a number`);
        else if (v != null && (v < 0 || v > 100)) errors.push(`${label} must be 0–100`);
      };
      range(att, "Attendance");
      range(ica, "ICA Score");
      range(imf, "IMF Score");
      range(fca, "FCA Score");
      if (code) {
        if (seen.has(code)) errors.push("Duplicate Student ID in file");
        seen.add(code);
      }

      return {
        _row: i + 2,
        student_code: code,
        name,
        class: cls,
        division,
        roll_number: roll,
        attendance: att === "invalid" ? null : att,
        photo_url: photo || null,
        enrollment_date: cellDate(get("enrollment date", "enrolled")),
        ica: ica === "invalid" ? null : ica,
        imf: imf === "invalid" ? null : imf,
        fca: fca === "invalid" ? null : fca,
        errors,
      };
    });
    setRows(parsed);
  };

  const valid = rows.filter((r) => r.errors.length === 0);
  const invalid = rows.filter((r) => r.errors.length > 0);

  const doImport = useMutation({
    mutationFn: async () => {
      const { data: existing, error } = await supabase
        .from("students")
        .select("id,student_code")
        .eq("school_id", schoolId);
      if (error) throw error;
      const byCode = new Map((existing ?? []).map((s) => [s.student_code, s.id]));
      let seq = 0;
      for (const s of existing ?? []) {
        const m = /-STU(\d+)$/.exec(s.student_code ?? "");
        if (m) seq = Math.max(seq, Number(m[1]));
      }

      let created = 0;
      let updated = 0;
      for (const r of valid) {
        const code = r.student_code || formatStudentCode(schoolCode, ++seq);
        const payload = {
          school_id: schoolId,
          student_code: code,
          name: r.name,
          class: r.class,
          division: r.division,
          roll_number: r.roll_number,
          photo_url: r.photo_url,
          enrollment_date: r.enrollment_date,
        };
        let studentId = byCode.get(code);
        if (studentId) {
          const { error: uErr } = await supabase.from("students").update(payload).eq("id", studentId);
          if (uErr) throw uErr;
          updated++;
        } else {
          const { data, error: iErr } = await supabase
            .from("students")
            .insert(payload)
            .select("id")
            .single();
          if (iErr) throw iErr;
          studentId = data.id;
          byCode.set(code, studentId);
          created++;
        }
        await saveScore({ schoolId, studentId, examType: "ICA", score: r.ica });
        await saveScore({ schoolId, studentId, examType: "IMF", score: r.imf });
        await saveScore({ schoolId, studentId, examType: "FCA", score: r.fca });
        await saveScore({ schoolId, studentId, examType: ATTENDANCE_TYPE, score: r.attendance });
      }
      return { created, updated };
    },
    onSuccess: ({ created, updated }) => {
      qc.invalidateQueries({ queryKey: ["exam-data"] });
      qc.invalidateQueries({ queryKey: ["students"] });
      setSummary(
        `${created} student(s) added, ${updated} updated, ${invalid.length} row(s) skipped due to errors.`,
      );
      toast.success("Import complete");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const close = (o: boolean) => {
    if (doImport.isPending) return;
    if (!o) {
      setRows([]);
      setSummary(null);
    }
    onOpenChange(o);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import exam data</DialogTitle>
          <DialogDescription>
            Columns: Student ID, Student Name, Class, Division, Roll No, Attendance, Photo,
            Enrollment Date, Update Date, ICA Score, IMF Score, FCA Score. Existing Student IDs are
            updated.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border p-8 text-center transition hover:border-primary/60 hover:bg-muted/40">
            <Upload className="h-6 w-6 text-primary" />
            <span className="text-sm font-medium">Choose an .xls or .xlsx file</span>
            <input
              type="file"
              accept=".xls,.xlsx"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
          </label>

          <div className="flex justify-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                downloadSampleSheet(EXAM_SAMPLE.fileName, EXAM_SAMPLE.sheetName, EXAM_SAMPLE.rows)
              }
            >
              <Download className="h-4 w-4" />
              Download sample format
            </Button>
          </div>



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
                      {["Row", "Student ID", "Name", "Class", "Div", "Roll", "Att", "ICA", "IMF", "FCA", "Issues"].map(
                        (h) => (
                          <th key={h} className="px-2 py-2 text-left font-semibold">
                            {h}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr
                        key={r._row}
                        className={r.errors.length ? "bg-destructive/5" : "border-t border-border"}
                      >
                        <td className="px-2 py-1.5">{r._row}</td>
                        <td className="px-2 py-1.5 font-mono">{r.student_code || "auto"}</td>
                        <td className="px-2 py-1.5">{r.name}</td>
                        <td className="px-2 py-1.5">{r.class}</td>
                        <td className="px-2 py-1.5">{r.division}</td>
                        <td className="px-2 py-1.5">{r.roll_number}</td>
                        <td className="px-2 py-1.5">{r.attendance ?? "—"}</td>
                        <td className="px-2 py-1.5">{r.ica ?? "—"}</td>
                        <td className="px-2 py-1.5">{r.imf ?? "—"}</td>
                        <td className="px-2 py-1.5">{r.fca ?? "—"}</td>
                        <td className="px-2 py-1.5 text-destructive">{r.errors.join(", ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {summary && (
            <div className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
              {summary}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)} disabled={doImport.isPending}>
            Close
          </Button>
          <Button
            onClick={() => doImport.mutate()}
            disabled={valid.length === 0 || doImport.isPending}
          >
            {doImport.isPending ? "Importing..." : `Import ${valid.length} valid row(s)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
