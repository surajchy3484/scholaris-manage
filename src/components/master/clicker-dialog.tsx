import type { ExamType } from "@/lib/question-bank";
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { insertRows, updateRowsByIds, type Assessment, type ClickerRecord } from "@/lib/master";

type Errors = Partial<Record<"keypad_id" | "student_name", string>>;

/** Create / edit one clicker response row, including its dynamic answers. */
export function ClickerDialog({
  open,
  onOpenChange,
  record,
  assessments,
  examTypes,
  questionColumns,
  defaultAssessmentId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  record?: ClickerRecord | null;
  assessments: Assessment[];
  examTypes: ExamType[];
  questionColumns: string[];
  defaultAssessmentId?: string;
}) {
  const qc = useQueryClient();
  const isEdit = !!record?.id;

  const [examType, setExamType] = useState("");
  const [assessmentId, setAssessmentId] = useState("");
  const [keypad, setKeypad] = useState("");
  const [name, setName] = useState("");
  const [roll, setRoll] = useState("");
  const [cls, setCls] = useState("");
  const [section, setSection] = useState("");
  const [team, setTeam] = useState("");
  const [score, setScore] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Errors>({});

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setExamType(
      record?.exam_type ??
        assessments.find((a) => a.assessment_id === (record?.assessment_id ?? defaultAssessmentId))
          ?.exam_type ??
        "",
    );
    setAssessmentId(record?.assessment_id ?? defaultAssessmentId ?? "");
    setKeypad(record?.keypad_id ?? "");
    setName(record?.student_name ?? "");
    setRoll(record?.roll_number ?? "");
    setCls(record?.class ?? "");
    setSection(record?.section ?? "");
    setTeam(record?.team ?? "");
    setScore(record?.score != null ? String(record.score) : "0");
    setAnswers({ ...(record?.answers ?? {}) });
  }, [open, record, defaultAssessmentId, assessments]);

  const baseCols = Array.from({ length: 10 }, (_, i) => `S${i + 1}`);
  const cols = [...baseCols, ...questionColumns.filter((c) => !baseCols.includes(c))];

  const save = useMutation({
    mutationFn: async () => {
      const school = assessments.find((a) => a.assessment_id === assessmentId);
      const payload = {
        exam_type: examType,
        assessment_id: assessmentId || null,
        keypad_id: keypad.trim(),
        student_id: record?.student_id ?? null,
        student_name: name.trim(),
        roll_number: roll.trim() || null,
        school_id: school?.school_id ?? null,
        school_name: school?.school_name ?? null,
        class: cls.trim() || null,
        section: section.trim().toUpperCase() || null,
        team: team.trim() || null,

        answers,
      };
      if (isEdit && record) {
        await updateRowsByIds("clicker_records", [record.id], payload);
      } else {
        await insertRows("clicker_records", [payload]);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clicker"] });
      qc.invalidateQueries({ queryKey: ["visual-analytics-source"] });
      qc.invalidateQueries({ queryKey: ["exam-data"] });
      toast.success(isEdit ? "Record updated" : "Record created");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const submit = () => {
    const e: Errors = {};
    if (!keypad.trim()) e.keypad_id = "Keypad ID is required.";
    if (!name.trim()) e.student_name = "Student name is required.";
    setErrors(e);
    if (Object.keys(e).length > 0) {
      toast.error("Please fix the highlighted fields.");
      return;
    }
    save.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !save.isPending && onOpenChange(o)}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit clicker record" : "New clicker record"}</DialogTitle>
          <DialogDescription>
            Answers are stored per question column and can be edited individually.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-2 sm:grid-cols-2">
          <Field label="Assessment">
            <Select
              value={assessmentId}
              onValueChange={(value) => {
                setAssessmentId(value);
                const a = assessments.find((a) => a.assessment_id === value);
                if (a) {
                  setExamType(a.exam_type);
                  setCls(a.class ?? "");
                  setSection(a.section ?? "");
                }
              }}
            >
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
          <Field label="Exam Type">
            <Select value={examType} onValueChange={setExamType}>
              <SelectTrigger>
                <SelectValue placeholder="Select Exam Type" />
              </SelectTrigger>
              <SelectContent>
                {examTypes.map((t) => (
                  <SelectItem key={t.name} value={t.name}>
                    {t.name} — {t.visible ? "Visible" : "Hidden"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Keypad ID" error={errors.keypad_id}>
            <Input value={keypad} onChange={(e) => setKeypad(e.target.value)} />
          </Field>
          <Field label="Student Name" error={errors.student_name}>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Roll Number">
            <Input value={roll} onChange={(e) => setRoll(e.target.value)} />
          </Field>
          <Field label="Class">
            <Input value={cls} onChange={(e) => setCls(e.target.value)} />
          </Field>
          <Field label="Section">
            <Input value={section} onChange={(e) => setSection(e.target.value)} />
          </Field>
          <Field label="Team">
            <Input value={team} onChange={(e) => setTeam(e.target.value)} />
          </Field>
          <Field label="Score">
            <p className="text-sm text-muted-foreground">
              Calculated automatically from the universal answer key.
            </p>
          </Field>
        </div>

        {record?.evaluated_at && (
          <dl className="grid grid-cols-3 gap-2 rounded border p-3 text-sm">
            {[
              ["Total", record.total_questions],
              ["Attempted", record.attempted_questions],
              ["Correct", record.correct_answers],
              ["Wrong", record.wrong_answers],
              ["Unattempted", record.unattempted_questions],
              ["Ranking", record.ranking],
            ].map(([label, value]) => (
              <div key={String(label)}>
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="font-semibold">{value ?? "—"}</dd>
              </div>
            ))}
          </dl>
        )}
        <div className="space-y-2">
          <Label>Answers</Label>
          <div className="grid max-h-64 grid-cols-3 gap-2 overflow-y-auto rounded-xl border border-border/60 p-3 sm:grid-cols-6">
            {cols.map((c) => (
              <div key={c} className="space-y-1">
                <span className="text-[10px] font-semibold text-muted-foreground">{c}</span>
                <Input
                  value={answers[c] ?? ""}
                  maxLength={1}
                  onChange={(e) =>
                    setAnswers((prev) => ({ ...prev, [c]: e.target.value.toUpperCase() }))
                  }
                  className="h-8 text-center text-xs uppercase"
                />
              </div>
            ))}
          </div>
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
