import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, Pencil, Plus, Trash2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { QuestionDialog } from "@/components/master/question-dialog";
import {
  SheetImportDialog,
  pick,
  type ParsedBase,
} from "@/components/master/sheet-import-dialog";
import { supabase } from "@/integrations/supabase/client";
import {
  ANSWER_OPTIONS,
  DIFFICULTY_OPTIONS,
  QUESTION_STATUS_OPTIONS,
  deleteRowsByIds,
  fetchAssessments,
  fetchQuestions,
  type Question,
} from "@/lib/master";

export const Route = createFileRoute("/questions")({
  head: () => ({
    meta: [
      { title: "Question Master — Scholaris" },
      {
        name: "description",
        content:
          "Manage each assessment's question bank: answers, marks, difficulty, chapter and topic.",
      },
      { property: "og:title", content: "Question Master — Scholaris" },
      {
        property: "og:description",
        content: "Bulk import and edit thousands of assessment questions.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: QuestionsPage,
});

type ParsedQuestion = ParsedBase & {
  assessment_id: string;
  question_no: number;
  question_text: string | null;
  correct_answer: string;
  marks: number;
  difficulty: string;
  status: string;
  subject: string | null;
  parameter: string | null;
  topic: string | null;
  chapter: string | null;
};

function QuestionsPage() {
  const qc = useQueryClient();
  const [assessment, setAssessment] = useState("all");
  const [subject, setSubject] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<Question | null>(null);
  const [duplicate, setDuplicate] = useState(false);
  const [dialog, setDialog] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [confirm, setConfirm] = useState<"single" | "bulk" | null>(null);
  const [target, setTarget] = useState<Question | null>(null);
  const [bulkAnswer, setBulkAnswer] = useState("");

  const assessments = useQuery({ queryKey: ["assessments"], queryFn: fetchAssessments });
  const list = useQuery({
    queryKey: ["questions", assessment],
    queryFn: () => fetchQuestions(assessment),
  });

  const rows = useMemo(() => {
    const needle = subject.trim().toLowerCase();
    const all = list.data ?? [];
    return needle
      ? all.filter((q) => (q.subject ?? "").toLowerCase().includes(needle))
      : all;
  }, [list.data, subject]);

  const remove = useMutation({
    mutationFn: (ids: string[]) => deleteRowsByIds("questions", ids),
    onSuccess: (n) => {
      qc.invalidateQueries({ queryKey: ["questions"] });
      setSelected([]);
      toast.success(`${n} question(s) deleted`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bulkEdit = useMutation({
    mutationFn: async (answer: string) => {
      const { error } = await supabase
        .from("questions")
        .update({ correct_answer: answer })
        .in("id", selected);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["questions"] });
      toast.success("Answers updated");
      setBulkAnswer("");
      setSelected([]);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const columns = useMemo<GridColumn<Question>[]>(
    () => [
      { key: "id", label: "Question ID", value: (r) => r.id.slice(0, 8), className: "font-mono text-xs" },
      {
        key: "assessment_id",
        label: "Assessment ID",
        value: (r) => r.assessment_id,
        className: "font-mono text-xs",
      },
      { key: "question_no", label: "Question No.", value: (r) => r.question_no },
      {
        key: "question_text",
        label: "Question Text",
        value: (r) => r.question_text ?? "",
        render: (r) => (
          <span className="block max-w-xs truncate">{r.question_text ?? "—"}</span>
        ),
      },
      {
        key: "correct_answer",
        label: "Correct Answer",
        value: (r) => r.correct_answer,
        render: (r) => <Badge variant="secondary">{r.correct_answer}</Badge>,
      },
      { key: "marks", label: "Marks", value: (r) => r.marks },
      { key: "difficulty", label: "Difficulty", value: (r) => r.difficulty },
      { key: "chapter", label: "Chapter", value: (r) => r.chapter ?? "—" },
      { key: "topic", label: "Topic", value: (r) => r.topic ?? "—" },
      { key: "status", label: "Status", value: (r) => r.status },
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
                setDuplicate(false);
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
                setDuplicate(true);
                setDialog(true);
              }}
            >
              <Copy className="h-4 w-4" />
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
    ],
    [],
  );

  return (
    <>
      <main className="mx-auto max-w-7xl space-y-4 px-3 py-6 sm:px-6">
        <header className="min-w-0">
          <h1 className="font-display text-2xl font-bold sm:text-3xl">Question Master</h1>
          <p className="text-sm text-muted-foreground">
            Each assessment keeps its own question bank and answer key.
          </p>
        </header>

        <DataGrid
          title="Questions"
          description={`${rows.length} question(s)`}
          rows={rows}
          columns={columns}
          getId={(r) => r.id}
          loading={list.isLoading}
          filename="questions"
          emptyMessage="No questions for this filter yet."
          selectedIds={selected}
          onSelectedChange={setSelected}
          onRowClick={(r) => {
            setEditing(r);
            setDuplicate(false);
            setDialog(true);
          }}
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
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Subject"
                className="h-9 w-[150px]"
              />
            </>
          }
          toolbar={
            <>
              {selected.length > 0 && (
                <>
                  <Select
                    value={bulkAnswer}
                    onValueChange={(v) => {
                      setBulkAnswer(v);
                      bulkEdit.mutate(v);
                    }}
                  >
                    <SelectTrigger className="h-9 w-[150px]">
                      <SelectValue placeholder="Set answer" />
                    </SelectTrigger>
                    <SelectContent>
                      {ANSWER_OPTIONS.map((a) => (
                        <SelectItem key={a} value={a}>
                          Set answer to {a}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="destructive" size="sm" onClick={() => setConfirm("bulk")}>
                    <Trash2 className="h-4 w-4" /> Delete {selected.length}
                  </Button>
                </>
              )}
              <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
                <Upload className="h-4 w-4" /> Import
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setEditing(null);
                  setDuplicate(false);
                  setDialog(true);
                }}
              >
                <Plus className="h-4 w-4" /> Add Question
              </Button>
            </>
          }
        />
      </main>

      <QuestionDialog
        open={dialog}
        onOpenChange={setDialog}
        question={editing}
        duplicate={duplicate}
        assessments={assessments.data ?? []}
        defaultAssessmentId={assessment !== "all" ? assessment : undefined}
      />

      <SheetImportDialog<ParsedQuestion>
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Import questions"
        description="Columns: Assessment ID, Question No, Question Text, Correct Answer, Marks, Difficulty, Subject, Parameter, Topic, Chapter, Status."
        parse={(raw) => {
          const known = new Set(
            (assessments.data ?? []).map((a) => a.assessment_id.toLowerCase()),
          );
          const existing = new Set(
            (list.data ?? []).map((q) => `${q.assessment_id.toLowerCase()}#${q.question_no}`),
          );
          const seen = new Set<string>();
          return raw.map((row, i) => {
            const aid =
              pick(row, "Assessment ID", "assessment_id") ||
              (assessment !== "all" ? assessment : "");
            const no = Number(pick(row, "Question No", "Question No.", "question_no", "No"));
            const ans = (pick(row, "Correct Answer", "correct_answer", "Answer") || "A")
              .toUpperCase()
              .slice(0, 1);
            const errors: string[] = [];
            if (!aid) errors.push("Assessment ID required");
            else if (!known.has(aid.toLowerCase())) errors.push("Unknown Assessment ID");
            if (!Number.isFinite(no) || no < 1) errors.push("Invalid question number");
            if (!ANSWER_OPTIONS.includes(ans as (typeof ANSWER_OPTIONS)[number]))
              errors.push("Answer must be A–D");
            const key = `${aid.toLowerCase()}#${no}`;
            if (existing.has(key) || seen.has(key)) errors.push("Duplicate question — skipped");
            seen.add(key);
            const diff = pick(row, "Difficulty", "difficulty") || "Medium";
            const status = pick(row, "Status", "status") || "Active";
            return {
              _row: i + 2,
              errors,
              assessment_id: aid,
              question_no: Number.isFinite(no) ? no : 0,
              question_text: pick(row, "Question Text", "question_text", "Question") || null,
              correct_answer: ans,
              marks: Number(pick(row, "Marks", "marks")) || 1,
              difficulty: DIFFICULTY_OPTIONS.includes(diff as (typeof DIFFICULTY_OPTIONS)[number])
                ? diff
                : "Medium",
              status: QUESTION_STATUS_OPTIONS.includes(
                status as (typeof QUESTION_STATUS_OPTIONS)[number],
              )
                ? status
                : "Active",
              subject: pick(row, "Subject", "subject") || null,
              parameter: pick(row, "Parameter", "parameter") || null,
              topic: pick(row, "Topic", "topic") || null,
              chapter: pick(row, "Chapter", "chapter") || null,
            };
          });
        }}
        columns={[
          { label: "Assessment", get: (r) => r.assessment_id },
          { label: "No.", get: (r) => r.question_no },
          { label: "Answer", get: (r) => r.correct_answer },
          { label: "Marks", get: (r) => r.marks },
          { label: "Difficulty", get: (r) => r.difficulty },
        ]}
        commit={async (valid) => {
          const chunk = 500;
          for (let i = 0; i < valid.length; i += chunk) {
            const payload = valid.slice(i, i + chunk).map(({ _row, errors, ...rest }) => rest);
            const { error } = await supabase.from("questions").insert(payload);
            if (error) throw new Error(error.message);
          }
          qc.invalidateQueries({ queryKey: ["questions"] });
          return `Imported ${valid.length} question(s).`;
        }}
      />

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete question(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "bulk"
                ? `${selected.length} question(s) will be permanently removed.`
                : `Question ${target?.question_no ?? ""} will be permanently removed.`}
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
