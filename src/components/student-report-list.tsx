import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { getAccessToken } from "@/lib/app-access";
import {
  listStudentDetails,
  studentFacets,
  deleteStudentDetails,
} from "@/lib/performance.functions";
import { useDebounced } from "@/hooks/use-master-page";
import { EMPTY_SCORE_FILTERS, type ScoreFilters, type StudentListRow } from "@/lib/student-list";
import { StudentListTable, StudentScoreFilters } from "@/components/student-list";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ExamStudentDialog } from "@/components/exam/exam-student-dialog";
import { ExamImportDialog } from "@/components/exam/exam-import-dialog";
import { StudentProfileDialog } from "@/components/student-profile-dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";

export function StudentReportList({
  schoolId,
  cls,
  division,
  onClassChange,
  onDivisionChange,
}: {
  schoolId: string;
  cls: string;
  division: string;
  onClassChange: (v: string) => void;
  onDivisionChange: (v: string) => void;
}) {
  const { can } = useAuth(),
    qc = useQueryClient();
  const [search, setSearch] = useState(""),
    [page, setPage] = useState(0),
    [scores, setScores] = useState<ScoreFilters>(EMPTY_SCORE_FILTERS);
  const [selected, setSelected] = useState<StudentListRow[]>([]),
    [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState<StudentListRow | null>(null),
    [editing, setEditing] = useState<StudentListRow | null>(null),
    [add, setAdd] = useState(false),
    [importing, setImporting] = useState(false),
    [deleting, setDeleting] = useState<StudentListRow[] | null>(null);
  const querySearch = useDebounced(search),
    queryScores = useDebounced(scores);
  const scope = JSON.stringify([schoolId, cls, division, search, scores]);
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  useEffect(() => {
    setSelected([]);
    setPage(0);
  }, [scope]);
  const args = {
    module: "exam_report" as const,
    schoolId,
    klass: cls,
    division,
    search: querySearch,
    sortKey: "roll-asc",
    direction: "asc" as const,
    ...queryScores,
    min: queryScores.min === "" ? null : Number(queryScores.min),
    max: queryScores.max === "" ? null : Number(queryScores.max),
  };
  const list = useQuery({
    queryKey: ["students", schoolId, "report-list", args, page],
    queryFn: () =>
      listStudentDetails({ data: { token: getAccessToken(), ...args, page, pageSize: 50 } }),
  });
  const facets = useQuery({
    queryKey: ["students", schoolId, "report-facets"],
    queryFn: () =>
      studentFacets({ data: { token: getAccessToken(), schoolId, module: "exam_report" } }),
  });
  const school = useQuery({
    queryKey: ["school", schoolId],
    queryFn: async () => {
      const result = await supabase.from("schools").select("*").eq("id", schoolId).single();
      if (result.error) throw result.error;
      return result.data;
    },
  });
  const rows = list.data?.rows ?? [],
    total = list.data?.total ?? 0;
  useEffect(() => {
    if (list.data && page * 50 >= total && page > 0)
      setPage(Math.max(0, Math.ceil(total / 50) - 1));
  }, [list.data, page, total]);
  const waiting = list.isLoading || search !== querySearch || scores !== queryScores;
  async function allRows() {
    const result: StudentListRow[] = [];
    for (let page = 0; ; page++) {
      const part = await listStudentDetails({
        data: { token: getAccessToken(), ...args, page, pageSize: 250 },
      });
      result.push(...part.rows);
      if (part.rows.length < 250 || result.length >= part.total) break;
    }
    return result;
  }
  async function selectAll() {
    if (selected.length === total) {
      setSelected([]);
      return;
    }
    const version = scope;
    setBusy(true);
    try {
      const result = await allRows();
      if (scopeRef.current === version) setSelected(result);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Selection failed");
    } finally {
      setBusy(false);
    }
  }
  const del = useMutation({
    mutationFn: async (items: StudentListRow[]) => {
      if (!can("exam_report", "delete")) throw new Error("Delete permission required");
      for (let start = 0; start < items.length; start += 250)
        await deleteStudentDetails({
          data: {
            token: getAccessToken(),
            module: "exam_report",
            schoolId,
            ids: items.slice(start, start + 250).map((r) => r.id),
          },
        });
    },
    onSuccess: () => {
      setSelected([]);
      setDeleting(null);
      toast.success("Students deleted");
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["students"] });
      qc.invalidateQueries({ queryKey: ["exam-data"] });
      qc.invalidateQueries({ queryKey: ["schools"] });
    },
  });
  async function exportData(format: "excel" | "csv" | "pdf") {
    if (!can("exam_report", "export")) return;
    const popup = format === "pdf" ? window.open("", "_blank") : null;
    if (format === "pdf" && !popup) {
      toast.error("Allow pop-ups to print.");
      return;
    }
    setBusy(true);
    try {
      const data = selected.length ? selected : await allRows();
      const mapped = data.map((r) => ({
        "Student ID": r.student_code,
        "Student Name": r.name,
        Class: r.class,
        "Division / Section": r.division,
        "Roll No.": r.roll_number,
        Attendance: r.attendance_recorded ? r.attendance_pct : "",
        ICA: r.ica ?? "",
        IMF: r.mca ?? "",
        FCA: r.fca ?? "",
        Photo: r.photo_url ?? "",
        "School Name": r.school_name,
        "Enrollment Date": r.enrollment_date ?? r.created_at.slice(0, 10),
        "Update Date": r.updated_at.slice(0, 10),
        Performance: r.performance,
        Status: r.status,
      }));
      const helpers = await import("@/lib/exam-export");
      if (format === "pdf") helpers.printRows("Student Details", mapped, popup!);
      else if (format === "excel") await helpers.exportRowsToExcel("student-details", mapped);
      else await helpers.exportRowsToCsv("student-details", mapped);
    } catch (error) {
      popup?.close();
      toast.error(error instanceof Error ? error.message : "Export failed");
    } finally {
      setBusy(false);
    }
  }
  const selectClass = "h-10 rounded-md border border-input bg-background px-3 text-sm";
  return (
    <section className="space-y-4" aria-label="Student report details">
      <h2 className="font-display text-xl font-semibold">
        Student Details <span className="text-sm text-muted-foreground">({total})</span>
      </h2>
      <div className="flex flex-wrap gap-3">
        <Input
          className="min-w-48 flex-1"
          aria-label="Search students"
          placeholder="Search Student Name or Student ID…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          aria-label="Class"
          className={selectClass}
          value={cls}
          onChange={(e) => onClassChange(e.target.value)}
        >
          <option value="all">All classes</option>
          {[...new Set((facets.data?.groups ?? []).map((r) => r.class))].map((c) => (
            <option key={c} value={c}>
              Class {c}
            </option>
          ))}
        </select>
        <select
          aria-label="Division / Section"
          className={selectClass}
          value={division}
          onChange={(e) => onDivisionChange(e.target.value)}
        >
          <option value="all">All divisions</option>
          {[
            ...new Set(
              (facets.data?.groups ?? [])
                .filter((r) => cls === "all" || r.class === cls)
                .map((r) => r.division),
            ),
          ].map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>
      <StudentScoreFilters value={scores} onChange={setScores} />
      <div className="flex flex-wrap items-center gap-2">
        <label className="mr-auto flex items-center gap-2 text-sm">
          <Checkbox
            checked={total > 0 && selected.length === total}
            onCheckedChange={() => void selectAll()}
            disabled={busy || waiting || total === 0}
          />
          Select All ({total})
        </label>
        <span className="text-xs">{selected.length} selected</span>
        {selected.length > 0 && (
          <Button variant="ghost" onClick={() => setSelected([])}>
            Clear
          </Button>
        )}
        {can("exam_report", "add") && <Button onClick={() => setAdd(true)}>Add Student</Button>}
        {can("exam_report", "import") && (
          <Button variant="outline" onClick={() => setImporting(true)}>
            Import
          </Button>
        )}
        {can("exam_report", "export") &&
          (["excel", "csv", "pdf"] as const).map((format) => (
            <Button
              key={format}
              disabled={busy || waiting}
              variant="outline"
              onClick={() => void exportData(format)}
            >
              {format.toUpperCase()}
            </Button>
          ))}
        {can("exam_report", "delete") && selected.length > 0 && (
          <Button variant="destructive" onClick={() => setDeleting(selected)}>
            Delete Selected
          </Button>
        )}
      </div>
      {(list.error || facets.error) && (
        <p role="alert" className="text-destructive">
          {list.error?.message ?? facets.error?.message}
        </p>
      )}
      {busy && <p role="status">Processing matching students…</p>}
      <StudentListTable
        rows={rows}
        selectedIds={selected.map((r) => r.id)}
        loading={waiting}
        onView={setViewing}
        onEdit={can("exam_report", "edit") ? setEditing : undefined}
        onDelete={can("exam_report", "delete") ? (r) => setDeleting([r]) : undefined}
        onSelect={(id, checked) =>
          setSelected((current) =>
            checked
              ? [...current.filter((r) => r.id !== id), rows.find((r) => r.id === id)!]
              : current.filter((r) => r.id !== id),
          )
        }
      />
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          disabled={page === 0 || waiting}
          onClick={() => setPage((p) => p - 1)}
        >
          Previous
        </Button>
        <span className="text-sm">
          {total
            ? `${page * 50 + 1}–${Math.min(total, (page + 1) * 50)} of ${total}`
            : "0 students"}
        </span>
        <Button
          variant="outline"
          disabled={(page + 1) * 50 >= total || waiting}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </Button>
      </div>
      {school.data && can("exam_report", "add") && (
        <ExamStudentDialog
          mode="add"
          schoolId={schoolId}
          schoolCode={school.data.code}
          open={add}
          onOpenChange={setAdd}
        />
      )}
      {school.data && can("exam_report", "import") && (
        <ExamImportDialog
          schoolId={schoolId}
          schoolCode={school.data.code}
          open={importing}
          onOpenChange={setImporting}
        />
      )}
      {editing && can("exam_report", "edit") && (
        <ExamStudentDialog
          mode="edit"
          student={editing}
          open
          onOpenChange={(open) => !open && setEditing(null)}
        />
      )}
      <StudentProfileDialog
        student={viewing}
        open={!!viewing}
        onOpenChange={(open) => !open && setViewing(null)}
      />
      <AlertDialog
        open={!!deleting && can("exam_report", "delete")}
        onOpenChange={(open) => !open && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.length} student(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the selected students and related records. This cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={del.isPending}
              onClick={() => deleting && del.mutate(deleting)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
