import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ANSWER_OPTIONS,
  DIFFICULTY_OPTIONS,
  QUESTION_STATUS_OPTIONS,
  type Assessment,
  type Question,
} from "@/lib/master";

type Errors = Partial<Record<"assessment_id" | "question_no" | "marks", string>>;

/** Create / edit / duplicate a single question of an assessment's bank. */
export function QuestionDialog({
  open,
  onOpenChange,
  question,
  duplicate,
  assessments,
  defaultAssessmentId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  question?: Question | null;
  duplicate?: boolean;
  assessments: Assessment[];
  defaultAssessmentId?: string;
}) {
  const qc = useQueryClient();
  const isEdit = !!question?.id && !duplicate;

  const [assessmentId, setAssessmentId] = useState("");
  const [no, setNo] = useState("1");
  const [text, setText] = useState("");
  const [answer, setAnswer] = useState<string>("A");
  const [marks, setMarks] = useState("1");
  const [difficulty, setDifficulty] = useState<string>("Medium");
  const [status, setStatus] = useState<string>("Active");
  const [subject, setSubject] = useState("");
  const [parameter, setParameter] = useState("");
  const [topic, setTopic] = useState("");
  const [chapter, setChapter] = useState("");
  const [errors, setErrors] = useState<Errors>({});

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setAssessmentId(question?.assessment_id ?? defaultAssessmentId ?? "");
    setNo(String(question ? question.question_no + (duplicate ? 1 : 0) : 1));
    setText(question?.question_text ?? "");
    setAnswer(question?.correct_answer ?? "A");
    setMarks(String(question?.marks ?? 1));
    setDifficulty(question?.difficulty ?? "Medium");
    setStatus(question?.status ?? "Active");
    setSubject(question?.subject ?? "");
    setParameter(question?.parameter ?? "");
    setTopic(question?.topic ?? "");
    setChapter(question?.chapter ?? "");
  }, [open, question, duplicate, defaultAssessmentId]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        assessment_id: assessmentId.trim(),
        question_no: Number(no) || 1,
        question_text: text.trim() || null,
        correct_answer: answer,
        marks: Number(marks) || 1,
        difficulty,
        status,
        subject: subject.trim() || null,
        parameter: parameter.trim() || null,
        topic: topic.trim() || null,
        chapter: chapter.trim() || null,
      };
      if (isEdit && question) {
        const { error } = await supabase.from("questions").update(payload).eq("id", question.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.from("questions").insert(payload);
        if (error) throw new Error(error.message);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["questions"] });
      toast.success(isEdit ? "Question updated" : "Question created");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const submit = () => {
    const e: Errors = {};
    if (!assessmentId.trim()) e.assessment_id = "Pick an assessment.";
    const n = Number(no);
    if (!Number.isFinite(n) || n < 1) e.question_no = "Question number must be 1 or more.";
    const m = Number(marks);
    if (!Number.isFinite(m) || m <= 0) e.marks = "Marks must be greater than zero.";
    setErrors(e);
    if (Object.keys(e).length > 0) {
      toast.error("Please fix the highlighted fields.");
      return;
    }
    save.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !save.isPending && onOpenChange(o)}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit question" : duplicate ? "Duplicate question" : "New question"}
          </DialogTitle>
          <DialogDescription>Questions belong to one assessment's question bank.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-2 sm:grid-cols-2">
          <Field label="Assessment ID" error={errors.assessment_id}>
            <Select value={assessmentId} onValueChange={setAssessmentId}>
              <SelectTrigger>
                <SelectValue placeholder="Select assessment" />
              </SelectTrigger>
              <SelectContent>
                {assessments.map((a) => (
                  <SelectItem key={a.id} value={a.assessment_id}>
                    {a.assessment_id} — {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Question No." error={errors.question_no}>
            <Input value={no} onChange={(e) => setNo(e.target.value)} inputMode="numeric" />
          </Field>
          <Field label="Correct Answer (A/B/C/D)">
            <Select value={answer} onValueChange={setAnswer}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ANSWER_OPTIONS.map((a) => (
                  <SelectItem key={a} value={a}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Parameter">
            <Input value={parameter} onChange={(e) => setParameter(e.target.value)} />
          </Field>
          <Field label="Topic">
            <Input value={topic} onChange={(e) => setTopic(e.target.value)} />
          </Field>
          <Field label="Chapter">
            <Input value={chapter} onChange={(e) => setChapter(e.target.value)} />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={save.isPending}>
            {save.isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
