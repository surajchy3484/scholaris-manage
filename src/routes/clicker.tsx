import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Plus, Trash2, Upload } from "lucide-react";

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
  applyCompetitionRanking,
  calculateClickerMetrics,
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
  if (row.assessment_id && available.some((a) => a.assessment_id === row.assessment_id)) {
    return row.assessment_id;
  }
  const matches = available.filter(
    (a) =>
      sameValue(a.class, row.class) &&
      (!row.section || !a.section || sameValue(a.section, row.section)),
  );
  if (matches.length === 0) return null;
  // Prefer an exact section match, then the most recently created assessment.
  return [...matches].sort((a, b) => {
    const sectionScore = (x: typeof a) =>
      row.section && sameValue(x.section, row.section) ? 1 : 0;
    return sectionScore(b) - sectionScore(a) || b.created_at.localeCompare(a.created_at);
  })[0].assessment_id;
}

/** Answer cell that supports inline edit, keyboard save/cancel and undo. */
function AnswerCell({
  value,
  correctAnswer,
  onSave,
}: {
  value: string;
  correctAnswer?: string;
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
  const qc = useQueryClient();
  const [assessment, setAssessment] = useState("all");
  const [minScore, setMinScore] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<ClickerRecord | null>(null);
  const [dialog, setDialog] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [confirm, setConfirm] = useState<"single" | "bulk" | null>(null);
  const [target, setTarget] = useState<ClickerRecord | null>(null);

  const assessments = useQuery({ queryKey: ["assessments"], queryFn: fetchAssessments });
  const questionKeys = useQuery({
    queryKey: ["clicker-question-keys", assessments.data?.map((a) => a.assessment_id).join(",")],
    enabled: !!assessments.data,
    queryFn: async () => {
      const entries = await Promise.all(
        (assessments.data ?? []).map(
          async (a) => [a.assessment_id, await fetchQuestions(a.assessment_id)] as const,
        ),
      );
      return new Map(entries);
    },
  });
  const list = useQuery({
    queryKey: ["clicker", assessment],
    queryFn: () => fetchClickerRecords(assessment),
  });

  const rows = useMemo(() => {
    const min = Number(minScore);
    const all = list.data ?? [];
    return Number.isFinite(min) && minScore.trim() !== "" ? all.filter((r) => r.score >= min) : all;
  }, [list.data, minScore]);

  const questionCols = useMemo(() => clickerQuestionColumns(list.data ?? []), [list.data]);
  const questionKeysByAssessment = useMemo(() => {
    const keys = new Map<string, string>();
    for (const [assessmentId, questions] of questionKeys.data ?? []) {
      for (const question of questions)
        keys.set(`${assessmentId}|S${question.question_no}`, question.correct_answer);
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
      toast.success("Answer saved");
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
      label: c,
      value: (r) => r.answers[c] ?? "",
      render: (r) => (
        <AnswerCell
          value={r.answers[c] ?? ""}
          correctAnswer={questionKeysByAssessment.get(`${r.assessment_id}|${c}`)}
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
          </span>
        ),
      },
    ];
  }, [questionCols, questionKeysByAssessment, saveAnswer]);

  return (
    <>
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
          description={`${rows.length} record(s)`}
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
                  {(assessments.data ?? []).map((a) => (
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
            </>
          }
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
      />

      <SheetImportDialog<ParsedClicker>
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Import clicker data"
        sample={clickerSample(questionCols)}
        description="Student columns (Keypad ID, Student Name, Roll, Class, Section, Team) are mapped automatically; every other column becomes a question column."
        parse={(raw) => {
          const known = new Set([
            "assessment id",
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
              if (!/^S\d+$/.test(k)) continue;
              const v = String(row[key] ?? "")
                .trim()
                .toUpperCase();
              if (v) answers[k] = v;
            }
            const aid =
              pick(row, "Assessment ID", "assessment_id") ||
              (assessment !== "all" ? assessment : "");
            return {
              _row: i + 2,
              errors,
              assessment_id: aid || null,
              keypad_id: keypad,
              student_id: pick(row, "Student ID", "student_id") || null,
              student_name: name,
              roll_number: pick(row, "Roll", "Roll Number", "roll_number") || null,
              class: pick(row, "Class", "class") || null,
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
              `No Assessment Master match for class ${unresolved.class ?? "—"}, section ${unresolved.section ?? "—"}. Add Assessment ID or create a matching assessment.`,
            );
          }
          const assessmentIds = [
            ...new Set(resolved.map((r) => r.assessment_id).filter(Boolean)),
          ] as string[];
          const knownAssessments = new Set((assessments.data ?? []).map((a) => a.assessment_id));
          const invalidAssessment = assessmentIds.find((id) => !knownAssessments.has(id));
          if (invalidAssessment)
            throw new Error(`Assessment ID not found in Assessment Master: ${invalidAssessment}`);
          const questionSets = new Map(
            await Promise.all(
              assessmentIds.map(async (id) => [id, await fetchQuestions(id)] as const),
            ),
          );
          const calculated = resolved.map(({ _row, errors, ...rest }) => {
            const metrics = calculateClickerMetrics(
              rest.answers,
              questionSets.get(rest.assessment_id ?? "") ?? [],
              {
                score: rest.score,
                correct_rate: rest.correct_rate,
              },
            );
            const assessmentInfo = (assessments.data ?? []).find(
              (a) => a.assessment_id === rest.assessment_id,
            );
            return {
              ...rest,
              school_id: assessmentInfo?.school_id ?? null,
              school_name: assessmentInfo?.school_name ?? null,
              ...metrics,
              ranking: null,
            };
          });
          applyCompetitionRanking(calculated);
          const clickerRows = calculated.map(({ correct_answers, wrong_answers, ...row }) => row);
          const resultRows = calculated.map((row) => ({
            assessment_id: row.assessment_id,
            keypad_id: row.keypad_id,
            student_id: row.student_id,
            student_name: row.student_name,
            school_id:
              (assessments.data ?? []).find((a) => a.assessment_id === row.assessment_id)
                ?.school_id ?? null,
            school_name:
              (assessments.data ?? []).find((a) => a.assessment_id === row.assessment_id)
                ?.school_name ?? null,
            class: row.class,
            section: row.section,
            score: row.score,
            total_questions: (questionSets.get(row.assessment_id ?? "") ?? []).length,
            correct_answers: row.correct_answers,
            wrong_answers: row.wrong_answers,
            correct_rate: row.correct_rate,
            ranking: row.ranking,
            answers: row.answers,
          }));
          await insertRows("clicker_records", clickerRows, 300);
          // Keep raw Clicker imports available even before the optional centralized
          // results migration has been applied to an older Supabase project.
          try {
            await insertRows("assessment_results", resultRows, 300);
          } catch (error) {
            console.warn(
              "Centralized assessment results are not available yet; raw Clicker data was saved.",
              error,
            );
          }
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
