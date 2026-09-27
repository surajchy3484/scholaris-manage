import {
  fetchExamTypes,
  normalizeClass,
  normalizeExam,
  bankKey,
  answerColumn,
} from "@/lib/question-bank";
import { useAuth } from "@/lib/auth";
import { clickerFacets, listClickerQuestionKeys } from "@/lib/performance.functions";
import { getAccessToken } from "@/lib/app-access";
import type { Question } from "@/lib/master";
import { useMasterPage } from "@/hooks/use-master-page";
import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Plus, Trash2, Upload } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { DataGrid, type GridColumn } from "@/components/data-grid";
import { ClickerDialog } from "@/components/master/clicker-dialog";
import { SheetImportDialog, pick, type ParsedBase } from "@/components/master/sheet-import-dialog";
import {
  clickerQuestionColumns,
  deleteRowsByIds,
  fetchAssessments,
  fetchClickerRecords,
  fetchQuestions,
  type ClickerRecord,
  insertRows,
  updateRowsByIds,
} from "@/lib/master";
import { clickerSample } from "@/lib/sample-templates";
import { RequireModule } from "@/components/require-module";
import { fetchAllRows } from "@/lib/fetch-all";

export const Route = createFileRoute("/clicker")({
  head: () => ({
    meta: [
      { title: "Clicker Data — SchoolRise" },
      {
        name: "description",
        content:
          "Import, edit and export clicker responses with automatically detected question columns.",
      },
      { property: "og:title", content: "Clicker Data — SchoolRise" },
      {
        property: "og:description",
        content: "Student clicker responses with dynamic question columns and inline editing.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <RequireModule module="clicker">
      <ClickerPage />
    </RequireModule>
  ),
});

type ParsedClicker = ParsedBase & {
  exam_type: string;
  assessment_id: string | null;
  keypad_id: string;
  student_id: string | null;
  student_name: string;
  roll_number: string | null;
  class: string | null;
  section: string | null;
  team: string | null;
  score: number;
  correct_rate: number;
  ranking: number | null;
  answers: Record<string, string>;
};

function sameValue(left: string | null | undefined, right: string | null | undefined) {
  const normalize = (value: string | null | undefined) =>
    (value ?? "")
      .trim()
      .toLowerCase()
      .replace(/^class\s*/, "")
      .replace(/^section\s*/, "");
  return normalize(left) === normalize(right);
}

function resolveAssessmentId(
  row: ParsedClicker,
  available: Awaited<ReturnType<typeof fetchAssessments>>,
) {
  const matches = available.filter(
    (a) =>
      (!row.assessment_id || a.assessment_id === row.assessment_id) &&
      normalizeExam(a.exam_type) === normalizeExam(row.exam_type) &&
      normalizeClass(a.class) === normalizeClass(row.class) &&
      (!row.section || !a.section || sameValue(a.section, row.section)),
  );
  return matches.length === 1 ? matches[0].assessment_id : null;
}

type StudentLookup = {
  id: string;
  name: string;
  roll_number: string;
  class: string;
  division: string;
  school_id: string;
};

function normalizeMatch(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^class\s*/, "")
    .replace(/^section\s*/, "")
    .replace(/\s+/g, " ");
}

async function fetchStudentLookup(schoolIds: string[]) {
  const entries = await Promise.all(
    schoolIds.map(async (schoolId) => {
      const rows = await fetchAllRows<StudentLookup>((from, to) =>
        supabase
          .from("students")
          .select("id,name,roll_number,class,division,school_id")
          .eq("school_id", schoolId)
          .range(from, to),
      );
      return [schoolId, rows] as const;
    }),
  );
  return new Map(entries);
}

function resolveStudentId(row: ParsedClicker, students: StudentLookup[]) {
  if (row.student_id) return row.student_id;
  const name = normalizeMatch(row.student_name);
  const roll = normalizeMatch(row.roll_number);
  const cls = normalizeMatch(row.class);
  const section = normalizeMatch(row.section);
  const matches = students.filter((student) => {
    if (name && normalizeMatch(student.name) !== name) return false;
    if (roll && normalizeMatch(student.roll_number) !== roll) return false;
    if (cls && normalizeMatch(student.class) !== cls) return false;
    if (section && normalizeMatch(student.division) !== section) return false;
    return true;
  });
  return matches.length === 1 ? matches[0].id : null;
}

/** Answer cell that supports inline edit, keyboard save/cancel and undo. */
function AnswerCell({
  value,
  correctAnswer,
  onSave,
  editable = true,
}: {
  value: string;
  correctAnswer?: string;
  editable?: boolean;
  onSave: (next: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const normalized = value.trim().toUpperCase();
  const isCorrect = !!normalized && !!correctAnswer && normalized === correctAnswer.toUpperCase();
  const answerClass = correctAnswer
    ? isCorrect
      ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
      : normalized
        ? "border-red-500 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
        : "border-border text-muted-foreground"
    : "border-border text-foreground";

  if (!editing)
    return (
      <button
        type="button"
        className={`min-w-8 rounded-full border px-2 py-0.5 text-center font-semibold transition-colors hover:opacity-80 focus-visible:outline-none ${answerClass}`}
        onClick={(e) => {
          e.stopPropagation();
          if (!editable) return;
          setDraft(value);
          setEditing(true);
        }}
      >
        {value || "—"}
      </button>
    );

  return (
    <Input
      autoFocus
      value={draft}
      maxLength={1}
      className="h-7 w-12 px-1 text-center text-xs uppercase"
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setDraft(e.target.value.toUpperCase())}
      onBlur={() => setEditing(false)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          const next = draft.trim().toUpperCase();
          if (next && !"ABCD".includes(next)) {
            toast.error("Answer must be A, B, C, D or blank.");
            return;
          }
          setEditing(false);
          if (next !== value) onSave(next);
        }
        if (e.key === "Escape") {
          setDraft(value);
          setEditing(false);
        }
      }}
    />
  );
}

function ClickerPage() {
  const { can } = useAuth();
  const types = useQuery({ queryKey: ["exam-types"], queryFn: fetchExamTypes });
  const qc = useQueryClient();
  const [assessment, setAssessment] = useState("all");
  const [minScore, setMinScore] = useState("");
  const [className, setClassName] = useState("");
  const [section, setSection] = useState("");
  const [team, setTeam] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<ClickerRecord | null>(null);
  const [dialog, setDialog] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [confirm, setConfirm] = useState<"single" | "bulk" | null>(null);
  const [target, setTarget] = useState<ClickerRecord | null>(null);

  const assessments = useQuery({ queryKey: ["assessments"], queryFn: fetchAssessments });
  const facets = useQuery({
    queryKey: ["clicker-filter-options"],
    queryFn: () => clickerFacets({ data: { token: getAccessToken() } }),
    staleTime: 60_000,
  });
  const sortedAssessments = useMemo(
    () =>
      [...(assessments.data ?? [])].sort((a, b) =>
        a.assessment_id.localeCompare(b.assessment_id, undefined, { numeric: true }),
      ),
    [assessments.data],
  );
  const list = useMasterPage<ClickerRecord>("clicker_records", {
    assessmentId: assessment,
    minScore: minScore.trim() && Number.isFinite(Number(minScore)) ? Number(minScore) : undefined,
    className: className === "all" ? "" : className,
    section: section === "all" ? "" : section,
    team: team === "all" ? "" : team,
  });
  const rows = list.data?.rows ?? [];
  const visibleAssessmentIds = [
    ...new Set(rows.map((row) => row.assessment_id).filter((id): id is string => !!id)),
  ].sort();
  const questionKeys = useQuery({
    queryKey: ["clicker-question-keys", visibleAssessmentIds, types.data],
    enabled: visibleAssessmentIds.length > 0,
    queryFn: async () => {
      const questions = await listClickerQuestionKeys({
        data: { token: getAccessToken(), assessmentIds: visibleAssessmentIds },
      });
      const grouped = new Map<string, typeof questions>();
      for (const question of questions) {
        const group = grouped.get(question.assessment_id) ?? [];
        group.push(question);
        grouped.set(question.assessment_id, group);
      }
      return grouped;
    },
  });
  const [knownColumns, setKnownColumns] = useState<{ assessment: string; columns: string[] }>({
    assessment: "",
    columns: [],
  });
  const columnsFromPage = list.data?.questionColumns;
  if (
    columnsFromPage?.length &&
    (knownColumns.assessment !== assessment ||
      JSON.stringify(knownColumns.columns) !== JSON.stringify(columnsFromPage))
  )
    setKnownColumns({ assessment, columns: columnsFromPage });
  const questionCols = useMemo(
    () =>
      [
        ...new Set([
          ...(knownColumns.assessment === assessment ? knownColumns.columns : []),
          ...clickerQuestionColumns(rows),
        ]),
      ].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1))),
    [knownColumns, assessment, rows],
  );
  const questionKeysByAssessment = useMemo(() => {
    const keys = new Map<string, string>();
    for (const [assessmentId, questions] of questionKeys.data ?? []) {
      for (const question of questions)
        keys.set(
          bankKey(question.exam_type, question.class, question.question_no),
          question.correct_answer,
        );
    }
    return keys;
  }, [questionKeys.data]);

  const saveAnswer = useMutation({
    mutationFn: async ({ row, col, value }: { row: ClickerRecord; col: string; value: string }) => {
      const answers = { ...row.answers };
      if (value) answers[col] = value;
      else delete answers[col];
      await updateRowsByIds("clicker_records", [row.id], { answers });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clicker"] });
      qc.invalidateQueries({ queryKey: ["visual-analytics-source"] });
      qc.invalidateQueries({ queryKey: ["exam-data"] });
      toast.success("Answer saved and results recalculated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (ids: string[]) => deleteRowsByIds("clicker_records", ids),
    onSuccess: (n) => {
      qc.invalidateQueries({ queryKey: ["clicker"] });
      setSelected([]);
      toast.success(`${n} record(s) deleted`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const columns = useMemo<GridColumn<ClickerRecord>[]>(() => {
    const base: GridColumn<ClickerRecord>[] = [
      { key: "exam_type", label: "Exam Type", value: (r) => r.exam_type ?? "Unassigned" },
      { key: "keypad_id", label: "Keypad ID", value: (r) => r.keypad_id },
      { key: "student_name", label: "Student Name", value: (r) => r.student_name },
      { key: "roll_number", label: "Roll", value: (r) => r.roll_number ?? "—" },
      { key: "class", label: "Class", value: (r) => r.class ?? "—" },
      { key: "section", label: "Section", value: (r) => r.section ?? "—" },
      { key: "team", label: "Team", value: (r) => r.team ?? "—" },
      { key: "score", label: "Score", value: (r) => r.score },
      {
        key: "correct_rate",
        label: "Correct Rate",
        value: (r) => r.correct_rate,
        render: (r) => `${r.correct_rate}%`,
      },
      { key: "ranking", label: "Ranking", value: (r) => r.ranking ?? 0 },
    ];
    const dyn: GridColumn<ClickerRecord>[] = questionCols.map((c) => ({
      key: c,
      label: `${c.slice(1)}-${c}`,
      value: (r) => r.answers[c] ?? "",
      render: (r) => (
        <AnswerCell
          value={r.answers[c] ?? ""}
          correctAnswer={
            types.data?.some((t) => t.name === r.exam_type && t.visible)
              ? (r.question_snapshot?.find(
                  (q) =>
                    q.exam_type === r.exam_type &&
                    normalizeClass(q.class) === normalizeClass(r.class) &&
                    q.question_no === Number(c.slice(1)),
                )?.correct_answer ??
                questionKeysByAssessment.get(bankKey(r.exam_type, r.class, c.slice(1))))
              : undefined
          }
          editable={can("clicker", "edit")}
          onSave={(next) => saveAnswer.mutate({ row: r, col: c, value: next })}
        />
      ),
    }));
    return [
      ...base,
      ...dyn,
      {
        key: "actions",
        label: "Actions",
        value: () => "",
        render: (r) => (
          <span className="flex gap-1" onClick={(e) => e.stopPropagation()}>
            {can("clicker", "edit") && (
              <Button
                size="icon"
                variant="ghost"
                aria-label="Edit"
                onClick={() => {
                  setEditing(r);
                  setDialog(true);
                }}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            )}
            {can("clicker", "delete") && (
              <Button
                size="icon"
                variant="ghost"
                className="text-destructive"
                aria-label="Delete"
                onClick={() => {
                  setTarget(r);
                  setConfirm("single");
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </span>
        ),
      },
    ];
  }, [questionCols, questionKeysByAssessment, saveAnswer, can, types.data]);

  return (
    <>
      {(types.error || questionKeys.error) && (
        <p role="alert" className="p-4 text-destructive">
          {types.error?.message ?? questionKeys.error?.message}
        </p>
      )}
      {list.isError && (
        <p role="alert" className="p-4 text-destructive">
          {list.error.message}
        </p>
      )}
      <main className="mx-auto max-w-7xl space-y-4 px-3 py-6 sm:px-6">
        <header className="min-w-0">
          <h1 className="font-display text-2xl font-bold sm:text-3xl">Clicker Data</h1>
          <p className="text-sm text-muted-foreground">
            {questionCols.length > 0
              ? `${questionCols.length} question column(s) detected automatically.`
              : "Import a sheet to detect question columns automatically."}
          </p>
        </header>

        <DataGrid
          title="Clicker responses"
          description={`${list.data?.total ?? 0} record(s)`}
          remote={list.remote}
          rows={rows}
          columns={columns}
          getId={(r) => r.id}
          loading={list.isLoading}
          filename="clicker-data"
          emptyMessage="No clicker records yet. Import a sheet or add one manually."
          selectedIds={selected}
          onSelectedChange={setSelected}
          filters={
            <>
              <Select value={assessment} onValueChange={setAssessment}>
                <SelectTrigger className="h-9 w-[190px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All assessments</SelectItem>
                  {sortedAssessments.map((a) => (
                    <SelectItem key={a.id} value={a.assessment_id}>
                      {a.assessment_id} — {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={minScore}
                onChange={(e) => setMinScore(e.target.value)}
                inputMode="numeric"
                placeholder="Min score"
                className="h-9 w-[120px]"
              />
              <Select value={className || "all"} onValueChange={setClassName}>
                <SelectTrigger className="h-9 w-[110px]">
                  <SelectValue placeholder="Class" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All classes</SelectItem>
                  {(facets.data?.classes ?? []).map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={section || "all"} onValueChange={setSection}>
                <SelectTrigger className="h-9 w-[120px]">
                  <SelectValue placeholder="Section" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sections</SelectItem>
                  {(facets.data?.sections ?? []).map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={team || "all"} onValueChange={setTeam}>
                <SelectTrigger className="h-9 w-[110px]">
                  <SelectValue placeholder="Team" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All teams</SelectItem>
                  {(facets.data?.teams ?? []).map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          }
          toolbar={
            <>
              {selected.length > 0 && can("clicker", "delete") && (
                <Button variant="destructive" size="sm" onClick={() => setConfirm("bulk")}>
                  <Trash2 className="h-4 w-4" /> Delete {selected.length}
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                disabled={!can("clicker", "add")}
                onClick={() => setImportOpen(true)}
              >
                <Upload className="h-4 w-4" /> Import
              </Button>
              <Button
                size="sm"
                disabled={!can("clicker", "add")}
                onClick={() => {
                  if (!can("clicker", "add")) return;
                  setEditing(null);
                  setDialog(true);
                }}
              >
                <Plus className="h-4 w-4" /> Add Record
              </Button>
            </>
          }
        />
      </main>

      <ClickerDialog
        open={dialog}
        onOpenChange={setDialog}
        record={editing}
        assessments={assessments.data ?? []}
        questionColumns={questionCols}
        defaultAssessmentId={assessment !== "all" ? assessment : undefined}
        examTypes={types.data ?? []}
      />

      <SheetImportDialog<ParsedClicker>
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Import clicker data"
        sample={clickerSample(questionCols)}
        description="Include Exam Type and Class. Include Assessment ID to identify the school/session; ambiguous matches are rejected. Use S1 or 1-S1 answer columns. Scores and rankings are calculated on the server; uploaded totals are ignored."
        parse={(raw) => {
          const known = new Set([
            "assessment id",
            "exam type",
            "keypad id",
            "keypad",
            "student id",
            "student_id",
            "student name",
            "student",
            "name",
            "roll",
            "roll number",
            "class",
            "section",
            "team",
            "score",
            "correct rate",
            "ranking",
          ]);
          return raw.map((row, i) => {
            const keypad = pick(row, "Keypad ID", "keypad_id", "Keypad");
            const name = pick(row, "Student Name", "student_name", "Student", "Name");
            const errors: string[] = [];
            if (!keypad) errors.push("Keypad ID required");
            if (!name) errors.push("Student name required");
            const answers: Record<string, string> = {};
            for (const key of Object.keys(row)) {
              const k = key.trim().toUpperCase();
              if (known.has(k.toLowerCase())) continue;
              const column = answerColumn(k);
              if (!column) {
                if (/S\d+/i.test(k)) errors.push(`Invalid question column: ${key}`);
                continue;
              }
              if (Object.prototype.hasOwnProperty.call(answers, column)) {
                errors.push(`Duplicate question column: ${key}`);
                continue;
              }
              const v = String(row[key] ?? "")
                .trim()
                .toUpperCase();
              if (v && !/^[ABCD]$/.test(v)) errors.push(`Invalid answer in ${key}`);
              answers[column] = v;
            }
            const aid =
              pick(row, "Assessment ID", "assessment_id") ||
              (assessment !== "all" ? assessment : "");
            const exam_type = normalizeExam(
              pick(row, "Exam Type", "exam_type") ||
                (assessments.data ?? []).find((a) => a.assessment_id === aid)?.exam_type,
            );
            if (!exam_type) errors.push("Exam Type required");
            if (!normalizeClass(pick(row, "Class"))) errors.push("Class required");
            return {
              exam_type,
              _row: i + 2,
              errors,
              assessment_id: aid || null,
              keypad_id: keypad,
              student_id: pick(row, "Student ID", "student_id") || null,
              student_name: name,
              roll_number: pick(row, "Roll", "Roll No", "Roll Number", "roll_number") || null,
              class: normalizeClass(pick(row, "Class", "class")) || null,
              section: pick(row, "Section", "section") || null,
              team: pick(row, "Team", "team") || null,
              score: Number(pick(row, "Score", "score")) || 0,
              correct_rate: Number(pick(row, "Correct Rate", "correct_rate")) || 0,
              ranking: Number(pick(row, "Ranking", "ranking")) || null,
              answers,
            };
          });
        }}
        columns={[
          { label: "Exam Type", get: (r) => r.exam_type },
          { label: "Keypad", get: (r) => r.keypad_id },
          { label: "Student", get: (r) => r.student_name },
          { label: "Class", get: (r) => r.class ?? "—" },
          { label: "Questions", get: (r) => Object.keys(r.answers).length },
        ]}
        commit={async (valid) => {
          const resolved = valid.map((row) => ({
            ...row,
            assessment_id: resolveAssessmentId(row, assessments.data ?? []),
          }));
          const unresolved = resolved.find((r) => !r.assessment_id);
          if (unresolved) {
            throw new Error(
              `No unique assessment for ${unresolved.exam_type}, Class ${unresolved.class ?? "—"}, Section ${unresolved.section ?? "—"}. Select the exact Assessment ID; other exam types are never used.`,
            );
          }
          const assessmentIds = [
            ...new Set(resolved.map((r) => r.assessment_id).filter(Boolean)),
          ] as string[];
          const knownAssessments = new Set((assessments.data ?? []).map((a) => a.assessment_id));
          const invalidAssessment = assessmentIds.find((id) => !knownAssessments.has(id));
          if (invalidAssessment)
            throw new Error(`Assessment ID not found in Assessment Master: ${invalidAssessment}`);
          const schoolIds = [
            ...new Set(
              assessmentIds
                .map(
                  (id) => (assessments.data ?? []).find((a) => a.assessment_id === id)?.school_id,
                )
                .filter((id): id is string => !!id),
            ),
          ];
          const studentLookup = await fetchStudentLookup(schoolIds);
          const linked = resolved.map((row) => {
            const assessmentInfo = (assessments.data ?? []).find(
              (a) => a.assessment_id === row.assessment_id,
            );
            const schoolStudents = assessmentInfo?.school_id
              ? (studentLookup.get(assessmentInfo.school_id) ?? [])
              : [];
            return {
              ...row,
              student_id: resolveStudentId(row, schoolStudents),
            };
          });
          const unresolvedStudent = linked.find((row) => !row.student_id);
          if (unresolvedStudent) {
            throw new Error(
              `Could not match student "${unresolvedStudent.student_name}". Include Student ID or an exact Student Name + Roll + Class + Section.`,
            );
          }
          const availableTypes = await fetchExamTypes();
          for (const row of linked) {
            if (!availableTypes.some((t) => t.name === row.exam_type && t.visible))
              throw new Error(
                "Question Set Inactive: This Exam Type is currently hidden in Question Master and cannot be used for Clicker evaluation.",
              );
          }
          const clickerRows = linked.map(
            ({ _row, errors, score, correct_rate, ranking, ...row }) => {
              const a = (assessments.data ?? []).find((a) => a.assessment_id === row.assessment_id);
              return {
                ...row,
                class: normalizeClass(row.class),
                school_id: a?.school_id ?? null,
                school_name: a?.school_name ?? null,
              };
            },
          );
          await insertRows("clicker_records", clickerRows, 300);
          await qc.invalidateQueries({ queryKey: ["visual-analytics-source"] });
          await qc.invalidateQueries({ queryKey: ["exam-data"] });
          qc.invalidateQueries({ queryKey: ["clicker"] });
          const detected = new Set<string>();
          for (const v of valid) for (const k of Object.keys(v.answers)) detected.add(k);
          return `Imported ${valid.length} record(s) with ${detected.size} question column(s).`;
        }}
      />

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete clicker record(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "bulk"
                ? `${selected.length} record(s) will be permanently removed.`
                : `"${target?.student_name ?? ""}" will be permanently removed.`}
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
