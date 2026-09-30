import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { RequireModule } from "@/components/require-module";
import { DataGrid, type GridColumn } from "@/components/data-grid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { QuestionDialog } from "@/components/master/question-dialog";
import { SheetImportDialog, pick, type ParsedBase } from "@/components/master/sheet-import-dialog";
import { QUESTION_SAMPLE } from "@/lib/sample-templates";
import { useMasterPage } from "@/hooks/use-master-page";
import { useAuth } from "@/lib/auth";
import {
  fetchExamTypes,
  fetchBankQuestions,
  saveExamType,
  saveBankQuestions,
  deleteBankQuestions,
  fetchLegacyIssues,
  promoteLegacyQuestions,
  normalizeClass,
  normalizeExam,
  bankKey,
  type BankQuestion,
} from "@/lib/question-bank";
export const Route = createFileRoute("/questions")({
  head: () => ({ meta: [{ title: "Universal Question Master — SchoolRise" }] }),
  component: () => (
    <RequireModule module="questions">
      <QuestionsPage />
    </RequireModule>
  ),
});
type Parsed = ParsedBase & Omit<BankQuestion, "id" | "created_at" | "updated_at">;
function QuestionsPage() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const [exam, setExam] = useState("");
  const [cls, setCls] = useState("");
  const [newExam, setNewExam] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<BankQuestion | null>(null);
  const [duplicate, setDuplicate] = useState(false);
  const [dialog, setDialog] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const types = useQuery({ queryKey: ["exam-types"], queryFn: fetchExamTypes });
  const availableQuestions = useQuery({
    queryKey: ["question-class-options"],
    queryFn: () => fetchBankQuestions(),
    staleTime: 60_000,
  });
  const issues = useQuery({ queryKey: ["question-migration-issues"], queryFn: fetchLegacyIssues });
  const list = useMasterPage<BankQuestion>("questions", { examType: exam, className: cls });
  const classOptions = useMemo(
    () =>
      [...new Set((availableQuestions.data ?? []).map((question) => normalizeClass(question.class)))]
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    [availableQuestions.data],
  );
  async function action(work: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    try {
      await work();
      await qc.invalidateQueries({ queryKey: ["questions"] });
      await qc.invalidateQueries({ queryKey: ["exam-types"] });
      await qc.invalidateQueries({ queryKey: ["clicker-question-keys"] });
      await qc.invalidateQueries({ queryKey: ["question-migration-issues"] });
      setSelected([]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }
  const columns: GridColumn<BankQuestion>[] = [
    { key: "exam_type", label: "Exam Type", value: (r) => r.exam_type },
    { key: "class", label: "Class", value: (r) => r.class },
    { key: "question_no", label: "Question Number", value: (r) => r.question_no },
    { key: "correct_answer", label: "Answer Key", value: (r) => r.correct_answer },
    { key: "parameter", label: "Parameter", value: (r) => r.parameter ?? "" },
    { key: "chapter", label: "Chapter", value: (r) => r.chapter ?? "" },
    { key: "topic", label: "Topic", value: (r) => r.topic ?? "" },
    {
      key: "actions",
      label: "Actions",
      value: () => "",
      render: (r) => (
        <span className="flex gap-1" onClick={(e) => e.stopPropagation()}>
          {can("questions", "edit") && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditing(r);
                setDuplicate(false);
                setDialog(true);
              }}
            >
              Edit
            </Button>
          )}
          {can("questions", "add") && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditing(r);
                setDuplicate(true);
                setDialog(true);
              }}
            >
              Copy
            </Button>
          )}
          {can("questions", "delete") && (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                if (
                  confirm(
                    "Delete this universal question for all schools? Historical result snapshots remain unchanged.",
                  )
                )
                  void action(() => deleteBankQuestions([r.id]));
              }}
            >
              Delete
            </Button>
          )}
        </span>
      ),
    },
  ];
  return (
    <main className="mx-auto max-w-7xl space-y-4 px-3 py-6 sm:px-6">
      <header>
        <h1 className="font-display text-3xl font-bold">Question Master</h1>
        <p className="text-sm text-muted-foreground">
          Universal question bank: Exam Type → Class → Question Number. Shared by every school.
        </p>
      </header>
      <section className="rounded-xl border p-4">
        <h2 className="font-semibold">Exam Type visibility</h2>
        <p className="text-sm text-muted-foreground">
          Hidden exam types keep their questions but cannot evaluate Clicker responses.
        </p>
        {types.error && <p role="alert">{types.error.message}</p>}
        <div className="mt-3 flex flex-wrap gap-3">
          {types.data?.map((t) => (
            <div key={t.name} className="flex items-center gap-2 rounded border p-2">
              <strong>{t.name}</strong>
              <span>{t.visible ? "🟢 Visible" : "🔴 Hidden"}</span>
              {can("questions", "edit") && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void action(() => saveExamType(t.name, !t.visible))}
                >
                  {t.visible ? "Hide" : "Make visible"}
                </Button>
              )}
            </div>
          ))}
        </div>
        {can("questions", "add") && (
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void action(async () => {
                await saveExamType(newExam);
                setNewExam("");
              });
            }}
          >
            <Input
              aria-label="New Exam Type"
              placeholder="New Exam Type, e.g. Practice Test"
              maxLength={80}
              required
              value={newExam}
              onChange={(e) => setNewExam(e.target.value)}
            />
            <Button disabled={busy}>Add Exam Type</Button>
          </form>
        )}
      </section>
      {!!issues.data?.length && (
        <details className="rounded-xl border p-4">
          <summary>Legacy question sets need review ({issues.data.length})</summary>
          <p className="my-2 text-sm">
            Existing questions are preserved. Compare source sets and select the correct universal
            set, or import a reviewed set. A selection cannot overwrite existing universal
            questions.
          </p>
          {issues.data.map((issue) => (
            <details key={issue.assessment_id} className="my-2 rounded border p-2">
              <summary>
                {issue.assessment_id} — {issue.exam_type ?? "No exam type"} / Class{" "}
                {issue.class ?? "missing"}
              </summary>
              <p>{issue.reason}</p>
              <pre className="max-h-56 overflow-auto text-xs">
                {JSON.stringify(issue.questions, null, 2)}
              </pre>
              {can("questions", "add") && issue.exam_type && issue.class && (
                <Button
                  disabled={busy}
                  onClick={() => void action(() => promoteLegacyQuestions(issue.assessment_id))}
                >
                  Use this source set for all schools
                </Button>
              )}
            </details>
          ))}
        </details>
      )}
      {list.error && (
        <p role="alert" className="text-destructive">
          {list.error.message}
        </p>
      )}
      <DataGrid
        title="Universal questions"
        description={`${list.data?.total ?? 0} questions`}
        rows={list.data?.rows ?? []}
        remote={list.remote}
        columns={columns}
        getId={(r) => r.id}
        filename="universal-questions"
        loading={list.isLoading}
        selectedIds={selected}
        onSelectedChange={setSelected}
        filters={
          <>
            <select
              aria-label="Exam Type filter"
              className="rounded border bg-background p-2"
              value={exam}
              onChange={(e) => {
                setExam(e.target.value);
                setSelected([]);
              }}
            >
              <option value="">All Exam Types</option>
              {types.data?.map((t) => (
                <option key={t.name}>{t.name}</option>
              ))}
            </select>
            <select
              aria-label="Class filter"
              className="w-32 rounded border bg-background p-2"
              value={cls}
              onChange={(e) => {
                setCls(e.target.value);
                setSelected([]);
              }}
            >
              <option value="">All Classes</option>
              {classOptions.map((option) => (
                <option key={option} value={option}>
                  Class {option}
                </option>
              ))}
            </select>
          </>
        }
        toolbar={
          <>
            {selected.length > 0 && can("questions", "delete") && (
              <Button
                disabled={busy}
                variant="destructive"
                onClick={() => {
                  if (confirm(`Delete ${selected.length} universal questions?`))
                    void action(() => deleteBankQuestions(selected));
                }}
              >
                Delete selected
              </Button>
            )}
            {can("questions", "add") && (
              <>
                <Button variant="outline" onClick={() => setImportOpen(true)}>
                  Import
                </Button>
                <Button
                  onClick={() => {
                    setEditing(null);
                    setDuplicate(false);
                    setDialog(true);
                  }}
                >
                  Add Question
                </Button>
              </>
            )}
          </>
        }
      />
      <QuestionDialog
        open={dialog}
        onOpenChange={setDialog}
        question={editing}
        duplicate={duplicate}
        examTypes={types.data ?? []}
        defaultExam={exam}
        defaultClass={cls}
      />
      <SheetImportDialog<Parsed>
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Import universal questions"
        sample={QUESTION_SAMPLE}
        description="Columns: Exam Type, Class, Question Number, Question, Correct Answer Key, Parameter, Chapter, Topic. No School or Assessment ID needed."
        parse={async (raw) => {
          const existing = new Set(
            (await fetchBankQuestions()).map((q) => bankKey(q.exam_type, q.class, q.question_no)),
          );
          const known = new Set((types.data ?? []).map((t) => t.name));
          const seen = new Set<string>();
          return raw.map((row, i) => {
            const exam_type = normalizeExam(pick(row, "Exam Type", "exam_type") || exam),
              classValue = normalizeClass(pick(row, "Class") || cls),
              question_no = Number(pick(row, "Question Number", "Question No", "question_no")),
              correct_answer = pick(
                row,
                "Correct Answer Key",
                "Correct Ans",
                "Correct Answer",
                "correct_answer",
                "Answer",
              )
                .trim()
                .toUpperCase();
            const key = bankKey(exam_type, classValue, question_no);
            const errors: string[] = [];
            if (!known.has(exam_type)) errors.push("Add this Exam Type first");
            if (!classValue) errors.push("Class required");
            if (!Number.isInteger(question_no) || question_no < 1 || question_no > 10000)
              errors.push("Invalid question number");
            if (!/^[ABCD]$/.test(correct_answer)) errors.push("Answer key must be A/B/C/D");
            const duplicate = existing.has(key) || seen.has(key);
            if (duplicate) errors.push("Duplicate key — skipped");
            seen.add(key);
            return {
              _row: i + 2,
              errors,
              duplicate,
              exam_type,
              class: classValue,
              question_no,
              correct_answer,
              question_text: pick(row, "Question", "Question Text") || null,
              parameter: pick(row, "Parameter") || null,
              chapter: pick(row, "Chapter") || null,
              topic: pick(row, "Topic") || null,
              subject: pick(row, "Subject") || null,
              marks: 1,
              difficulty: "Medium",
            };
          });
        }}
        columns={[
          { label: "Exam Type", get: (r) => r.exam_type },
          { label: "Class", get: (r) => r.class },
          { label: "Question Number", get: (r) => r.question_no },
          { label: "Answer", get: (r) => r.correct_answer },
        ]}
        commit={async (valid, onProgress) => {
          for (let i = 0; i < valid.length; i += 500) {
            await saveBankQuestions(
              valid.slice(i, i + 500).map(({ _row, errors, duplicate, ...q }) => q),
            );
            onProgress?.(Math.min(i + 500, valid.length));
          }
          await qc.invalidateQueries({ queryKey: ["questions"] });
          return `Imported ${valid.length} universal questions.`;
        }}
      />
    </main>
  );
}
