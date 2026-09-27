import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveBankQuestions, type BankQuestion, type ExamType } from "@/lib/question-bank";
export function QuestionDialog({
  open,
  onOpenChange,
  question,
  duplicate,
  examTypes,
  defaultExam = "",
  defaultClass = "",
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  question?: BankQuestion | null;
  duplicate?: boolean;
  examTypes: ExamType[];
  defaultExam?: string;
  defaultClass?: string;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    exam_type: "",
    class: "",
    question_no: 1,
    question_text: "",
    correct_answer: "A",
    parameter: "",
    chapter: "",
    topic: "",
    subject: "",
    marks: 1,
    difficulty: "Medium",
  });
  useEffect(() => {
    if (open)
      setForm({
        exam_type: question?.exam_type ?? defaultExam,
        class: question?.class ?? defaultClass,
        question_no: (question?.question_no ?? 0) + (!question || duplicate ? 1 : 0),
        question_text: question?.question_text ?? "",
        correct_answer: question?.correct_answer ?? "A",
        parameter: question?.parameter ?? "",
        chapter: question?.chapter ?? "",
        topic: question?.topic ?? "",
        subject: question?.subject ?? "",
        marks: question?.marks ?? 1,
        difficulty: question?.difficulty ?? "Medium",
      });
  }, [open, question, duplicate, defaultExam, defaultClass]);
  const save = useMutation({
    mutationFn: () => saveBankQuestions([form], question && !duplicate ? [question.id] : []),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["questions"] });
      qc.invalidateQueries({ queryKey: ["clicker-question-keys"] });
      onOpenChange(false);
      toast.success("Universal question saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={(o) => !save.isPending && onOpenChange(o)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{question && !duplicate ? "Edit" : "Add"} universal question</DialogTitle>
          <DialogDescription>
            This question applies to every school with this class. Visibility is controlled by Exam
            Type.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
          className="space-y-3"
        >
          <Label>
            Exam Type
            <select
              required
              className="mt-1 block w-full rounded border bg-background p-2"
              value={form.exam_type}
              onChange={(e) => setForm({ ...form, exam_type: e.target.value })}
            >
              <option value="">Select Exam Type</option>
              {examTypes.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.name} — {t.visible ? "Visible" : "Hidden"}
                </option>
              ))}
            </select>
          </Label>
          {(
            [
              "class",
              "question_no",
              "question_text",
              "parameter",
              "chapter",
              "topic",
              "subject",
            ] as const
          ).map((key) => (
            <div key={key}>
              <Label htmlFor={`question-${key}`}>
                {
                  {
                    class: "Class",
                    question_no: "Question Number",
                    question_text: "Question",
                    parameter: "Parameter",
                    chapter: "Chapter",
                    topic: "Topic",
                    subject: "Subject",
                  }[key]
                }
              </Label>
              <Input
                id={`question-${key}`}
                required={key === "class" || key === "question_no"}
                type={key === "question_no" ? "number" : "text"}
                min={key === "question_no" ? 1 : undefined}
                max={key === "question_no" ? 10000 : undefined}
                value={form[key]}
                onChange={(e) =>
                  setForm({
                    ...form,
                    [key]: key === "question_no" ? Number(e.target.value) : e.target.value,
                  })
                }
              />
            </div>
          ))}
          <Label>
            Correct Answer
            <select
              className="mt-1 block w-full rounded border bg-background p-2"
              value={form.correct_answer}
              onChange={(e) => setForm({ ...form, correct_answer: e.target.value })}
            >
              {["A", "B", "C", "D"].map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </Label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button disabled={save.isPending}>{save.isPending ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
