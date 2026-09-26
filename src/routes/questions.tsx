import { useMasterPage } from "@/hooks/use-master-page";
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
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { SheetImportDialog, pick, type ParsedBase } from "@/components/master/sheet-import-dialog";
import {
  ANSWER_OPTIONS,
  DIFFICULTY_OPTIONS,
  QUESTION_STATUS_OPTIONS,
  deleteRowsByIds,
  fetchAssessments,
  fetchQuestions,
  insertRows,
  updateRowsByIds,
  type Question,
} from "@/lib/master";
import { QUESTION_SAMPLE } from "@/lib/sample-templates";
import { RequireModule } from "@/components/require-module";

export const Route = createFileRoute("/questions")({
  head: () => ({
    meta: [
      { title: "Question Master — SchoolRise" },
      {
        name: "description",
        content:
          "Manage each assessment's question bank: answers, marks, difficulty, chapter and topic.",
      },
      { property: "og:title", content: "Question Master — SchoolRise" },
      {
        property: "og:description",
        content: "Bulk import and edit thousands of assessment questions.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <RequireModule module="questions">
      <QuestionsPage />
    </RequireModule>
  ),
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
  const [copyOpen, setCopyOpen] = useState(false);
  const [destination, setDestination] = useState("");

  const assessments = useQuery({ queryKey: ["assessments"], queryFn: fetchAssessments });
  const list = useMasterPage<Question>("questions", { assessmentId: assessment, subject });
  const rows = list.data?.rows ?? [];
  const sortedAssessments = useMemo(
    () =>
      [...(assessments.data ?? [])].sort((a, b) =>
        a.assessment_id.localeCompare(b.assessment_id, undefined, { numeric: true }),
      ),
    [assessments.data],
  );

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
      await updateRowsByIds("questions", selected, { correct_answer: answer });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["questions"] });
      toast.success("Answers updated");
      setBulkAnswer("");
      setSelected([]);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const copyQuestions = useMutation({
    mutationFn: async () => {
      if (!destination || destination === assessment)
        throw new Error("Choose a different destination assessment.");
      const selectedQuestions = (await fetchQuestions()).filter((q) => selected.includes(q.id));
      const destinationRows = await fetchQuestions(destination);
      const existing = new Set(destinationRows.map((q) => q.question_no));
      const payload = selectedQuestions
        .filter((q) => !existing.has(q.question_no))
        .map(({ id, created_at, updated_at, assessment_id, ...q }) => ({
          ...q,
          assessment_id: destination,
        }));
      if (payload.length === 0)
        throw new Error("All selected question numbers already exist in the destination.");
      await insertRows("questions", payload);
      return { copied: payload.length, skipped: selectedQuestions.length - payload.length };
    },
    onSuccess: ({ copied, skipped }) => {
      qc.invalidateQueries({ queryKey: ["questions"] });
      setCopyOpen(false);
      setSelected([]);
      toast.success(
        `${copied} question(s) copied${skipped ? `; ${skipped} duplicate(s) skipped` : ""}.`,
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const columns = useMemo<GridColumn<Question>[]>(
    () => [
      {
        key: "assessment_id",
        label: "Assessment ID",
        value: (r) => r.assessment_id,
        className: "font-mono text-xs",
        render: (r) => {
          const assessmentInfo = (assessments.data ?? []).find(
            (a) => a.assessment_id === r.assessment_id,
          );
          return (
            <HoverCard openDelay={120} closeDelay={80}>
              <HoverCardTrigger asChild>
                <button
                  type="button"
                  className="cursor-help rounded-md px-1.5 py-1 font-mono text-xs font-semibold text-primary underline decoration-dotted underline-offset-4 transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  onClick={(event) => event.stopPropagation()}
                >
                  {r.assessment_id}
                </button>
              </HoverCardTrigger>
              <HoverCardContent align="start" className="w-[340px] overflow-hidden p-0">
                <div className="border-b border-border/60 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
                    Assessment details
                  </p>
                  <p className="mt-1 font-mono text-base font-bold text-foreground">
                    {r.assessment_id}
                  </p>
                  <p className="mt-0.5 truncate text-sm font-medium text-muted-foreground">
                    {assessmentInfo?.name ?? "Assessment information unavailable"}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-4">
                  <Detail label="School" value={assessmentInfo?.school_name} />
                  <Detail label="Exam type" value={assessmentInfo?.exam_type} />
                  <Detail label="Class" value={assessmentInfo?.class} />
                  <Detail label="Section" value={assessmentInfo?.section} />
                  <Detail label="Exam date" value={assessmentInfo?.date} />
                  <Detail label="Questions" value={assessmentInfo?.total_questions} />
                </div>
              </HoverCardContent>
            </HoverCard>
          );
        },
      },
      { key: "question_no", label: "Question No.", value: (r) => r.question_no },
      {
        key: "correct_answer",
        label: "Correct Ans (A/B/C/D)",
        value: (r) => r.correct_answer,
        render: (r) => <Badge variant="secondary">{r.correct_answer}</Badge>,
      },
      { key: "parameter", label: "Parameter", value: (r) => r.parameter ?? "—" },
      { key: "topic", label: "Topic", value: (r) => r.topic ?? "—" },
      { key: "chapter", label: "Chapter", value: (r) => r.chapter ?? "—" },
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
    [assessments.data],
  );

  return (
    <>
      {list.isError && (
        <p role="alert" className="p-4 text-destructive">
          {list.error.message}
        </p>
      )}
      <main className="mx-auto max-w-7xl space-y-4 px-3 py-6 sm:px-6">
        <header className="min-w-0">
          <h1 className="font-display text-2xl font-bold sm:text-3xl">Question Master</h1>
          <p className="text-sm text-muted-foreground">
            Each assessment keeps its own question bank and answer key.
          </p>
        </header>

        <DataGrid
          title="Questions"
          description={`${list.data?.total ?? 0} question(s)`}
          remote={list.remote}
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
                  {sortedAssessments.map((a) => (
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
                  <Button variant="outline" size="sm" onClick={() => setCopyOpen(true)}>
                    Copy Questions
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
        sample={QUESTION_SAMPLE}
        description="Columns: Assessment ID, Question No., Correct Ans (A,B,C,D), Parameter, Topic, Chapter. Column order does not matter."
        parse={async (raw) => {
          const known = new Set((assessments.data ?? []).map((a) => a.assessment_id.toLowerCase()));
          const existing = new Set(
            (await fetchQuestions()).map(
              (q) => `${q.assessment_id.toLowerCase()}#${q.question_no}`,
            ),
          );
          const seen = new Set<string>();
          return raw.map((row, i) => {
            const aid =
              pick(row, "Assessment ID", "assessment_id") ||
              (assessment !== "all" ? assessment : "");
            const no = Number(pick(row, "Question No", "Question Number", "question_no", "No"));
            const ans = (
              pick(row, "Correct Ans", "Correct Answer", "correct_answer", "Answer", "Ans") || "A"
            )
              .toUpperCase()
              .replace(/[^A-D]/g, "")
              .slice(0, 1);
            const errors: string[] = [];
            let duplicate = false;
            if (!aid) errors.push("Assessment ID required");
            else if (!known.has(aid.toLowerCase())) errors.push("Unknown Assessment ID");
            if (!Number.isFinite(no) || no < 1) errors.push("Invalid question number");
            if (!ANSWER_OPTIONS.includes(ans as (typeof ANSWER_OPTIONS)[number]))
              errors.push("Correct Ans must be A, B, C or D");
            const key = `${aid.toLowerCase()}#${no}`;
            if (existing.has(key) || seen.has(key)) {
              duplicate = true;
              errors.push("Duplicate question — skipped");
            }
            seen.add(key);
            const diff = pick(row, "Difficulty", "difficulty") || "Medium";
            const status = pick(row, "Status", "status") || "Active";
            return {
              _row: i + 2,
              errors,
              duplicate,
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
          { label: "Assessment ID", get: (r) => r.assessment_id },
          { label: "Question No.", get: (r) => r.question_no },
          { label: "Correct Ans", get: (r) => r.correct_answer },
          { label: "Parameter", get: (r) => r.parameter ?? "—" },
          { label: "Topic", get: (r) => r.topic ?? "—" },
          { label: "Chapter", get: (r) => r.chapter ?? "—" },
        ]}
        commit={async (valid, onProgress) => {
          const chunk = 500;
          for (let i = 0; i < valid.length; i += chunk) {
            const payload = valid
              .slice(i, i + chunk)
              .map(({ _row, errors, duplicate, ...rest }) => rest);
            await insertRows("questions", payload);
            onProgress?.(Math.min(i + chunk, valid.length));
          }
          qc.invalidateQueries({ queryKey: ["questions"] });
          return `Import complete — ${valid.length} question(s) imported.`;
        }}
      />

      <AlertDialog
        open={copyOpen}
        onOpenChange={(open) => !copyQuestions.isPending && setCopyOpen(open)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Copy {selected.length} question(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              From {assessment} to the selected destination. Duplicate question numbers are skipped
              by default.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Select value={destination} onValueChange={setDestination}>
            <SelectTrigger>
              <SelectValue placeholder="Choose destination assessment" />
            </SelectTrigger>
            <SelectContent>
              {(assessments.data ?? [])
                .filter((a) => a.assessment_id !== assessment)
                .map((a) => (
                  <SelectItem key={a.id} value={a.assessment_id}>
                    {a.assessment_id} — {a.name} — Class {a.class ?? "—"} — {a.school_name ?? "—"}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!destination || copyQuestions.isPending}
              onClick={() => copyQuestions.mutate()}
            >
              {copyQuestions.isPending ? "Copying..." : "Copy Questions"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

function Detail({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 truncate text-sm font-medium text-foreground">{value || "—"}</p>
    </div>
  );
}
