import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Download,
  
  FileSpreadsheet,
  Pencil,
  Plus,
  Printer,
  Search,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ExamStudentDialog } from "@/components/exam/exam-student-dialog";
import { ExamImportDialog } from "@/components/exam/exam-import-dialog";
import { toDisplayablePhotoUrl } from "@/lib/drive.functions";
import {
  CLASS_OPTIONS,
  DIVISION_OPTIONS,
  STATUS_COLORS,
  deleteScoresForStudentIds,
  fetchExamData,
  type StudentReport,
} from "@/lib/exam";
import { exportRowsToCsv, exportRowsToExcel, printRows } from "@/lib/exam-export";
import { RequireModule } from "@/components/require-module";

export const Route = createFileRoute("/exam-report/$schoolId/students")({
  validateSearch: (search: Record<string, unknown>) => ({
    cls: typeof search.cls === "string" ? search.cls : "all",
    division: typeof search.division === "string" ? search.division : "all",
  }),
  head: () => ({
    meta: [
      { title: "Student Exam Records — SchoolRise" },
      {
        name: "description",
        content: "Search, edit, import and export student attendance and exam scores.",
      },
      { property: "og:title", content: "Student Exam Records — SchoolRise" },
      {
        property: "og:description",
        content: "Search, edit, import and export student attendance and exam scores.",
      },
    ],
  }),
  component: () => (
    <RequireModule module="exam_report">
      <StudentExamDashboard />
    </RequireModule>
  ),
});

function toRow(s: StudentReport) {
  return {
    "Student ID": s.student_code,
    "Student Name": s.name,
    School: s.school_name,
    Class: s.class,
    Division: s.division,
    "Roll No": s.roll_number,
    Attendance: s.attendance_pct,
    Photo: s.photo_url ?? "",
    "Enrollment Date": s.enrollment_date ?? s.created_at.slice(0, 10),
    "Update Date": s.updated_at.slice(0, 10),
    "ICA Score": s.ica ?? "",
    "MCA Score": s.mca ?? "",
    "FCA Score": s.fca ?? "",
    "Performance %": s.performance,
    Status: s.status,
  };
}

function StudentExamDashboard() {
  const { schoolId } = Route.useParams();
  const { cls, division } = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [q, setQ] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<StudentReport | null>(null);
  const [viewing, setViewing] = useState<StudentReport | null>(null);
  const [pendingDelete, setPendingDelete] = useState<StudentReport[] | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ["exam-data"], queryFn: fetchExamData });
  const school = data?.schools.find((s) => s.id === schoolId);

  const students = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data?.students ?? [])
      .filter((s) => s.school_id === schoolId)
      .filter((s) => cls === "all" || s.class === cls)
      .filter((s) => division === "all" || s.division === division)
      .filter(
        (s) =>
          !needle ||
          [s.name, s.student_code, s.school_name, s.class, s.division, s.roll_number].some((v) =>
            String(v).toLowerCase().includes(needle),
          ),
      );
  }, [data, schoolId, cls, division, q]);

  const del = useMutation({
    mutationFn: async (list: StudentReport[]) => {
      const ids = list.map((s) => s.id);
      await deleteScoresForStudentIds(ids);
      const { error } = await supabase.from("students").delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["exam-data"] });
      qc.invalidateQueries({ queryKey: ["students"] });
      qc.invalidateQueries({ queryKey: ["schools"] });
      setSelectedIds([]);
      setPendingDelete(null);
      toast.success("Deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const exportRows = (only?: StudentReport[]) => (only ?? students).map(toRow);
  const filenameBase = `${school?.name ?? "students"}-exam-report`;
  const selection = students.filter((s) => selectedIds.includes(s.id));

  const chartData = students.slice(0, 25).map((s) => ({
    name: s.name.split(" ")[0],
    ICA: s.ica ?? 0,
    MCA: s.mca ?? 0,
    FCA: s.fca ?? 0,
  }));

  if (isLoading) {
    return (
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
        <Skeleton className="h-10 w-72 rounded-lg" />
        <div className="grid gap-4 [&>*]:min-w-0 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-56 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 pb-24 sm:px-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="icon" asChild>
          <Link to="/exam-report/$schoolId" params={{ schoolId }}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="font-display text-3xl font-bold">Student Records</h1>
          <p className="text-sm text-muted-foreground">
            {school?.name} · {students.length} student(s)
          </p>
        </div>
      </div>

      {/* Filters + toolbar */}
      <Card className="grid gap-3 border-border/60 p-4 shadow-soft lg:grid-cols-[1fr_auto_auto_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, ID, roll number, class..."
            className="pl-9"
          />
        </div>
        <Select
          value={cls}
          onValueChange={(v) => navigate({ to: ".", search: { cls: v, division } })}
        >
          <SelectTrigger className="lg:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Classes</SelectItem>
            {CLASS_OPTIONS.map((c) => (
              <SelectItem key={c} value={c}>
                Class {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={division}
          onValueChange={(v) => navigate({ to: ".", search: { cls, division: v } })}
        >
          <SelectTrigger className="lg:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Divisions</SelectItem>
            {DIVISION_OPTIONS.map((d) => (
              <SelectItem key={d} value={d}>
                Division {d}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4" /> Import
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportRowsToExcel(filenameBase, exportRows(selection.length ? selection : undefined))}
          >
            <FileSpreadsheet className="h-4 w-4" /> Excel
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportRowsToCsv(filenameBase, exportRows(selection.length ? selection : undefined))}
          >
            <Download className="h-4 w-4" /> CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (!printRows(filenameBase, exportRows(selection.length ? selection : undefined)))
                toast.error("Allow pop-ups to print or save as PDF.");
            }}
          >
            <Printer className="h-4 w-4" /> Print / PDF
          </Button>
        </div>
      </Card>

      {selection.length > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-primary/30 bg-primary/10 px-4 py-3">
          <span className="text-sm font-medium">{selection.length} selected</span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelectedIds([])}>
              Clear
            </Button>
            <Button variant="destructive" size="sm" onClick={() => setPendingDelete(selection)}>
              <Trash2 className="h-4 w-4" /> Delete selected
            </Button>
          </div>
        </div>
      )}

      {students.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 border-dashed p-12 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-full bg-accent">
            <Users className="h-6 w-6 text-accent-foreground" />
          </div>
          <h3 className="font-display text-lg font-semibold">No students match these filters</h3>
          <p className="max-w-sm text-sm text-muted-foreground">
            Add a student or import an Excel sheet to populate this report.
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 [&>*]:min-w-0 sm:grid-cols-2 lg:grid-cols-3">
          {students.map((s, i) => (
            <motion.div
              key={s.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.02, 0.3) }}
              whileHover={{ y: -3 }}
            >
              <Card
                role="button"
                tabIndex={0}
                onClick={() => setViewing(s)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setViewing(s);
                  }
                }}
                className="h-full cursor-pointer overflow-hidden border-border/60 p-4 shadow-soft transition-all hover:border-primary/40 hover:shadow-elegant focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.995]"
              >
                <div className="flex items-start gap-3">
                  <span onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      aria-label={`Select ${s.name}`}
                      checked={selectedIds.includes(s.id)}
                      onCheckedChange={(c) =>
                        setSelectedIds((prev) =>
                          c ? [...prev, s.id] : prev.filter((id) => id !== s.id),
                        )
                      }
                    />
                  </span>
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full bg-muted ring-2 ring-accent">
                    {s.photo_url ? (
                      <img
                        src={toDisplayablePhotoUrl(s.photo_url) ?? ""}
                        alt={s.name}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="grid h-full w-full place-items-center text-[10px] text-muted-foreground">
                        No Photo
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-display font-semibold">{s.name}</h3>
                    <p className="truncate font-mono text-[11px] text-muted-foreground">
                      {s.student_code}
                    </p>
                    <Badge variant="outline" className={`mt-1 ${STATUS_COLORS[s.status]}`}>
                      {s.status}
                    </Badge>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 text-center text-xs sm:grid-cols-4">
                  <Metric label="Attendance" value={`${s.attendance_pct}%`} />
                  <Metric label="ICA" value={s.ica ?? "—"} />
                  <Metric label="MCA" value={s.mca ?? "—"} />
                  <Metric label="FCA" value={s.fca ?? "—"} />
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
                  <span>Class {s.class}-{s.division} · Roll {s.roll_number}</span>
                  <span className="text-right">
                    Enrolled {s.enrollment_date ?? s.created_at.slice(0, 10)}
                  </span>
                </div>

                <div className="mt-3 flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 flex-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditing(s);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9"
                    aria-label={`Delete ${s.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setPendingDelete([s]);
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* Floating add button */}
      <Button
        size="lg"
        onClick={() => setAddOpen(true)}
        className="fixed bottom-6 right-6 z-40 rounded-full shadow-elegant"
      >
        <Plus className="h-5 w-5" /> Add Student
      </Button>

      {school && (
        <>
          <ExamStudentDialog
            key={`add-${addOpen}`}
            mode="add"
            schoolId={schoolId}
            schoolCode={school.code}
            open={addOpen}
            onOpenChange={setAddOpen}
          />
          <ExamImportDialog
            open={importOpen}
            onOpenChange={setImportOpen}
            schoolId={schoolId}
            schoolCode={school.code}
          />
        </>
      )}

      {editing && (
        <ExamStudentDialog
          key={editing.id}
          mode="edit"
          student={editing}
          open={!!editing}
          onOpenChange={(o) => !o && setEditing(null)}
        />
      )}

      <StudentProfileDialog
        student={viewing}
        open={!!viewing}
        onOpenChange={(o) => !o && setViewing(null)}
        chartFallback={chartData}
      />

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {pendingDelete?.length === 1 ? pendingDelete[0].name : `${pendingDelete?.length} students`}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the student record and all related exam scores. This cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => pendingDelete && del.mutate(pendingDelete)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-muted/60 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}

function StudentProfileDialog({
  student,
  open,
  onOpenChange,
}: {
  student: StudentReport | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  chartFallback?: unknown;
}) {
  if (!student) return null;
  const chart = [
    { name: "Attendance", value: student.attendance_pct },
    { name: "ICA", value: student.ica ?? 0 },
    { name: "MCA", value: student.mca ?? 0 },
    { name: "FCA", value: student.fca ?? 0 },
    { name: "Overall", value: student.performance },
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Student profile</DialogTitle>
        </DialogHeader>
        <div className="space-y-5 py-2">
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
            <div className="h-28 w-28 shrink-0 overflow-hidden rounded-2xl bg-muted ring-4 ring-accent">
              {student.photo_url ? (
                <img
                  src={toDisplayablePhotoUrl(student.photo_url) ?? ""}
                  alt={student.name}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="grid h-full w-full place-items-center text-xs text-muted-foreground">
                  No Photo
                </div>
              )}
            </div>
            <div className="grid flex-1 grid-cols-2 gap-2 text-sm">
              <Info label="Student ID" value={student.student_code} />
              <Info label="Name" value={student.name} />
              <Info label="Class" value={student.class} />
              <Info label="Division" value={student.division} />
              <Info label="Roll Number" value={student.roll_number} />
              <Info label="Attendance" value={`${student.attendance_pct}%`} />
              <Info label="ICA Score" value={String(student.ica ?? "—")} />
              <Info label="MCA Score" value={String(student.mca ?? "—")} />
              <Info label="FCA Score" value={String(student.fca ?? "—")} />
              <Info label="Overall Performance" value={`${student.performance}%`} />
              <Info
                label="Enrollment Date"
                value={student.enrollment_date ?? student.created_at.slice(0, 10)}
              />
              <Info label="Last Updated" value={student.updated_at.slice(0, 10)} />
            </div>
          </div>

          <div>
            <h4 className="mb-2 text-sm font-semibold">Performance</h4>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="name" fontSize={11} />
                  <YAxis domain={[0, 100]} fontSize={11} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="value" name="Score" fill="#4F46E5" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-lg border border-border p-3 text-sm">
            <div className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
              Remarks
            </div>
            <p className="mt-1">
              {student.remarks ??
                `Overall performance ${student.performance}% — ${student.status}.`}
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border p-2.5">
      <div className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 truncate font-medium">{value}</div>
    </div>
  );
}
