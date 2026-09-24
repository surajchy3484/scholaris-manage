import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, Pencil, Plus, Trash2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { DataGrid, type GridColumn } from "@/components/data-grid";
import { AssessmentDialog } from "@/components/master/assessment-dialog";
import {
  SheetImportDialog,
  pick,
  pickDate,
  type ParsedBase,
} from "@/components/master/sheet-import-dialog";
import { supabase } from "@/integrations/supabase/client";
import {
  deleteRowsByIds,
  fetchAssessments,
  insertRows,
  nextAssessmentCode,
  type Assessment,
} from "@/lib/master";
import type { School } from "@/lib/types";
import { ASSESSMENT_SAMPLE } from "@/lib/sample-templates";
import { RequireModule } from "@/components/require-module";

export const Route = createFileRoute("/assessments")({
  head: () => ({
    meta: [
      { title: "Assessment Master — SchoolRise" },
      {
        name: "description",
        content:
          "Create, import and manage assessments with academic year, subject, marks and status.",
      },
      { property: "og:title", content: "Assessment Master — SchoolRise" },
      {
        property: "og:description",
        content: "Create, import and manage assessments across every school.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <RequireModule module="assessments">
      <AssessmentsPage />
    </RequireModule>
  ),
});

type ParsedAssessment = ParsedBase & {
  assessment_id: string;
  name: string;
  exam_type: string;
  academic_year: string;
  subject: string | null;
  class: string | null;
  section: string | null;
  school_id: string | null;
  school_name: string | null;
  total_questions: number;
  total_marks: number;
  passing_marks: number;
  date: string | null;
  status: string;
};

const fmtDate = (v: string | null) => (v ? new Date(v).toLocaleDateString() : "—");

function AssessmentsPage() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<Assessment | null>(null);
  const [dupCode, setDupCode] = useState<string | undefined>();
  const [dialog, setDialog] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [confirm, setConfirm] = useState<"single" | "bulk" | null>(null);
  const [target, setTarget] = useState<Assessment | null>(null);

  const list = useQuery({ queryKey: ["assessments"], queryFn: fetchAssessments });
  const schools = useQuery({
    queryKey: ["schools-lite"],
    queryFn: async (): Promise<School[]> => {
      const { data, error } = await supabase.from("schools").select("*").order("name");
      if (error) throw new Error(error.message);
      return (data ?? []) as School[];
    },
  });

  const rows = list.data ?? [];

  const remove = useMutation({
    mutationFn: (ids: string[]) => deleteRowsByIds("assessments", ids),
    onSuccess: (n) => {
      qc.invalidateQueries({ queryKey: ["assessments"] });
      setSelected([]);
      toast.success(`${n} assessment(s) deleted`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const columns = useMemo<GridColumn<Assessment>[]>(
    () => [
      {
        key: "assessment_id",
        label: "Assessment ID",
        value: (r) => r.assessment_id,
        className: "font-mono text-xs",
      },
      { key: "name", label: "Assessment Name", value: (r) => r.name },
      { key: "school_name", label: "School Name", value: (r) => r.school_name ?? "—" },
      { key: "class", label: "Class", value: (r) => r.class ?? "—" },
      { key: "section", label: "Section", value: (r) => r.section ?? "—" },
      { key: "exam_type", label: "Exam Type", value: (r) => r.exam_type },
      {
        key: "date",
        label: "Exam Date",
        value: (r) => r.date ?? "",
        render: (r) => fmtDate(r.date),
      },
      { key: "total_questions", label: "Total Question", value: (r) => r.total_questions },
      {
        key: "status",
        label: "Status",
        value: (r) => r.status,
        render: (r) => <Badge variant="secondary">{r.status}</Badge>,
      },
      {
        key: "actions",
        label: "Actions",
        value: () => "",
        render: (r) => (
          <span className="flex gap-1" onClick={(e) => e.stopPropagation()}>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Edit"
              onClick={() => {
                setEditing(r);
                setDupCode(undefined);
                setDialog(true);
              }}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Duplicate"
              onClick={() => {
                setEditing(r);
                setDupCode(nextAssessmentCode(rows));
                setDialog(true);
              }}
            >
              <Copy className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Delete"
              className="text-destructive"
              onClick={() => {
                setTarget(r);
                setConfirm("single");
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </span>
        ),
      },
    ],
    [rows],
  );

  return (
    <>
      <main className="mx-auto max-w-7xl space-y-4 px-3 py-6 sm:px-6">
        <header className="min-w-0">
          <h1 className="font-display text-2xl font-bold sm:text-3xl">Assessment Master</h1>
          <p className="text-sm text-muted-foreground">
            Every assessment across your schools, with its question bank and clicker data.
          </p>
        </header>

        <DataGrid
          title="Assessments"
          description={`${rows.length} record(s)`}
          rows={rows}
          columns={columns}
          getId={(r) => r.id}
          loading={list.isLoading}
          filename="assessments"
          emptyMessage="No assessments yet. Add one or import a sheet."
          selectedIds={selected}
          onSelectedChange={setSelected}
          onRowClick={(r) => {
            setEditing(r);
            setDupCode(undefined);
            setDialog(true);
          }}
          toolbar={
            <>
              {selected.length > 0 && (
                <Button variant="destructive" size="sm" onClick={() => setConfirm("bulk")}>
                  <Trash2 className="h-4 w-4" /> Delete {selected.length}
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
                <Upload className="h-4 w-4" /> Import
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setEditing(null);
                  setDupCode(nextAssessmentCode(rows));
                  setDialog(true);
                }}
              >
                <Plus className="h-4 w-4" /> Add Assessment
              </Button>
            </>
          }
        />
      </main>

      <AssessmentDialog
        open={dialog}
        onOpenChange={setDialog}
        assessment={editing}
        defaultCode={dupCode}
        schools={schools.data ?? []}
      />

      <SheetImportDialog<ParsedAssessment>
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Import assessments"
        sample={ASSESSMENT_SAMPLE}
        description="Columns: Assessment ID, Assessment Name, School Name, Class, Section, Exam Type, Exam Date, Total Question, Status. Column order does not matter."
        parse={(raw) => {
          const existing = new Set(rows.map((r) => r.assessment_id.toLowerCase()));
          const seen = new Set<string>();
          const schoolList = schools.data ?? [];
          return raw.map((row, i) => {
            const id = pick(row, "Assessment ID", "assessment_id", "id");
            const name = pick(row, "Assessment Name", "name", "assessment");
            const errors: string[] = [];
            let duplicate = false;
            if (!id) errors.push("Assessment ID required");
            if (!name) errors.push("Assessment Name required");
            const keyed = id.toLowerCase();
            if (keyed && (existing.has(keyed) || seen.has(keyed))) {
              duplicate = true;
              errors.push("Duplicate Assessment ID — skipped");
            }
            if (keyed) seen.add(keyed);

            const schoolName = pick(row, "School Name", "School", "school_name");
            const school = schoolName
              ? (schoolList.find((s) => s.name.trim().toLowerCase() === schoolName.toLowerCase()) ??
                null)
              : null;
            if (schoolName && !school) errors.push("Unknown School Name");

            const totalRaw = pick(row, "Total Question", "Total Questions", "total_questions");
            const totalQuestions = totalRaw === "" ? 0 : Number(totalRaw);
            if (totalRaw !== "" && (!Number.isFinite(totalQuestions) || totalQuestions < 0))
              errors.push("Total Question must be a number");

            const totalMarks = Number(pick(row, "Total Marks", "total_marks")) || 0;
            const passing = Number(pick(row, "Passing Marks", "passing_marks")) || 0;
            if (passing > totalMarks) errors.push("Passing marks exceed total marks");

            const rawDate = pick(row, "Exam Date", "Date", "date");
            const date = pickDate(row, "Exam Date", "Date", "date");
            if (rawDate && !date) errors.push("Invalid Exam Date");

            const statusRaw = pick(row, "Status", "status") || "Draft";
            const status =
              ["draft", "active", "completed", "archived"].find(
                (s) => s === statusRaw.toLowerCase(),
              ) ?? null;
            if (!status) errors.push("Status must be Draft, Active, Completed or Archived");

            return {
              _row: i + 2,
              errors,
              duplicate,
              assessment_id: id,
              name,
              exam_type: (pick(row, "Exam Type", "exam_type") || "ICA").toUpperCase(),
              academic_year:
                pick(row, "Academic Year", "academic_year") || String(new Date().getFullYear()),
              subject: pick(row, "Subject", "subject") || null,
              class: pick(row, "Class", "class") || null,
              section: pick(row, "Section", "section") || null,
              school_id: school?.id ?? null,
              school_name: school?.name ?? (schoolName || null),
              total_questions: Number.isFinite(totalQuestions) ? totalQuestions : 0,
              total_marks: totalMarks,
              passing_marks: passing,
              date,
              status: status ? status[0].toUpperCase() + status.slice(1) : "Draft",
            };
          });
        }}
        columns={[
          { label: "Assessment ID", get: (r) => r.assessment_id },
          { label: "Name", get: (r) => r.name },
          { label: "School", get: (r) => r.school_name ?? "—" },
          { label: "Class", get: (r) => `${r.class ?? "—"} ${r.section ?? ""}`.trim() },
          { label: "Exam Type", get: (r) => r.exam_type },
          { label: "Date", get: (r) => r.date ?? "—" },
          { label: "Questions", get: (r) => r.total_questions },
          { label: "Status", get: (r) => r.status },
        ]}
        commit={async (valid, onProgress) => {
          const chunk = 500;
          for (let i = 0; i < valid.length; i += chunk) {
            const payload = valid
              .slice(i, i + chunk)
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              .map(({ _row, errors, duplicate, ...rest }) => rest);
            await insertRows("assessments", payload);
            onProgress?.(Math.min(i + chunk, valid.length));
          }
          qc.invalidateQueries({ queryKey: ["assessments"] });
          return `Import complete — ${valid.length} assessment(s) imported.`;
        }}
      />

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete assessment(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "bulk"
                ? `${selected.length} assessment(s) will be permanently removed.`
                : `"${target?.name ?? ""}" will be permanently removed.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                remove.mutate(confirm === "bulk" ? selected : target ? [target.id] : []);
                setConfirm(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
