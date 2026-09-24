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
import type { School } from "@/lib/types";
import {
  ASSESSMENT_STATUS_OPTIONS,
  EXAM_TYPE_OPTIONS,
  insertRows,
  updateRowsByIds,
  type Assessment,
} from "@/lib/master";

type Errors = Partial<
  Record<"assessment_id" | "name" | "total_questions" | "passing_marks", string>
>;

export function AssessmentDialog({
  open,
  onOpenChange,
  assessment,
  defaultCode,
  schools,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Provided for edit and duplicate; omit for a fresh record. */
  assessment?: Assessment | null;
  /** Pre-filled code for new / duplicated records. */
  defaultCode?: string;
  schools: School[];
}) {
  const qc = useQueryClient();
  const isEdit = !!assessment?.id && !defaultCode;

  const [code, setCode] = useState("");
  const [examType, setExamType] = useState<string>("ICA");
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [schoolId, setSchoolId] = useState<string>("none");
  const [cls, setCls] = useState("");
  const [section, setSection] = useState("");
  const [total, setTotal] = useState("0");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [subject, setSubject] = useState("");
  const [totalMarks, setTotalMarks] = useState("0");
  const [passMarks, setPassMarks] = useState("0");
  const [status, setStatus] = useState<string>("Draft");
  const [errors, setErrors] = useState<Errors>({});

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setCode(defaultCode ?? assessment?.assessment_id ?? "");
    setExamType(assessment?.exam_type ?? "ICA");
    setName(assessment?.name ?? "");
    setDate(assessment?.date ?? new Date().toISOString().slice(0, 10));
    setSchoolId(assessment?.school_id ?? "none");
    setCls(assessment?.class ?? "");
    setSection(assessment?.section ?? "");
    setTotal(String(assessment?.total_questions ?? 0));
    setYear(assessment?.academic_year ?? String(new Date().getFullYear()));
    setSubject(assessment?.subject ?? "");
    setTotalMarks(String(assessment?.total_marks ?? 0));
    setPassMarks(String(assessment?.passing_marks ?? 0));
    setStatus(assessment?.status ?? "Draft");
  }, [open, assessment, defaultCode]);

  const save = useMutation({
    mutationFn: async () => {
      const school = schools.find((s) => s.id === schoolId);
      const payload = {
        assessment_id: code.trim(),
        exam_type: examType,
        name: name.trim(),
        date: date || null,
        school_id: schoolId === "none" ? null : schoolId,
        school_name: school?.name ?? null,
        class: cls.trim() || null,
        section: section.trim().toUpperCase() || null,
        total_questions: Number(total) || 0,
        academic_year: year.trim() || String(new Date().getFullYear()),
        subject: subject.trim() || null,
        total_marks: Number(totalMarks) || 0,
        passing_marks: Number(passMarks) || 0,
        status,
      };
      if (isEdit && assessment) {
        await updateRowsByIds("assessments", [assessment.id], payload);
      } else {
        try {
          await insertRows("assessments", [payload]);
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Failed to save assessment";
          throw new Error(
            msg === "DUPLICATE" ? `Assessment ID "${payload.assessment_id}" already exists.` : msg,
          );
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assessments"] });
      toast.success(isEdit ? "Assessment updated" : "Assessment created");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const submit = () => {
    const e: Errors = {};
    if (!code.trim()) e.assessment_id = "Assessment ID is required.";
    if (!name.trim()) e.name = "Assessment name is required.";
    const n = Number(total);
    if (!Number.isFinite(n) || n < 0) e.total_questions = "Must be a positive number.";
    if (Number(passMarks) > Number(totalMarks))
      e.passing_marks = "Passing marks cannot exceed total marks.";
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
            {isEdit
              ? "Edit assessment"
              : defaultCode && assessment
                ? "Duplicate assessment"
                : "New assessment"}
          </DialogTitle>
          <DialogDescription>
            Assessments group a question bank and its clicker responses.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-2 sm:grid-cols-2">
          <Field label="Assessment ID" error={errors.assessment_id}>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="font-mono text-xs"
            />
          </Field>
          <Field label="Exam Type">
            <Select value={examType} onValueChange={setExamType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXAM_TYPE_OPTIONS.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Assessment Name" error={errors.name}>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={150} />
          </Field>
          <Field label="Date">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="School">
            <Select value={schoolId} onValueChange={setSchoolId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— No school —</SelectItem>
                {schools.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Class">
            <Input value={cls} onChange={(e) => setCls(e.target.value)} placeholder="e.g. 5" />
          </Field>
          <Field label="Section">
            <Input value={section} onChange={(e) => setSection(e.target.value)} placeholder="A" />
          </Field>
          <Field label="Total Questions" error={errors.total_questions}>
            <Input value={total} onChange={(e) => setTotal(e.target.value)} inputMode="numeric" />
          </Field>
          <Field label="Academic Year">
            <Input value={year} onChange={(e) => setYear(e.target.value)} placeholder="2026" />
          </Field>
          <Field label="Subject">
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Mathematics"
            />
          </Field>
          <Field label="Total Marks">
            <Input
              value={totalMarks}
              onChange={(e) => setTotalMarks(e.target.value)}
              inputMode="numeric"
            />
          </Field>
          <Field label="Passing Marks" error={errors.passing_marks}>
            <Input
              value={passMarks}
              onChange={(e) => setPassMarks(e.target.value)}
              inputMode="numeric"
            />
          </Field>
          <Field label="Status">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ASSESSMENT_STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
