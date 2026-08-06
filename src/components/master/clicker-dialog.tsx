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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { type Assessment, type ClickerRecord } from "@/lib/master";

type Errors = Partial<Record<"keypad_id" | "student_name", string>>;

/** Create / edit one clicker response row, including its dynamic answers. */
export function ClickerDialog({
  open,
  onOpenChange,
  record,
  assessments,
  questionColumns,
  defaultAssessmentId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  record?: ClickerRecord | null;
  assessments: Assessment[];
  questionColumns: string[];
  defaultAssessmentId?: string;
}) {
  const qc = useQueryClient();
  const isEdit = !!record?.id;

  const [assessmentId, setAssessmentId] = useState("");
  const [keypad, setKeypad] = useState("");
  const [name, setName] = useState("");
  const [roll, setRoll] = useState("");
  const [cls, setCls] = useState("");
  const [section, setSection] = useState("");
  const [team, setTeam] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Errors>({});

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setAssessmentId(record?.assessment_id ?? defaultAssessmentId ?? "");
    setKeypad(record?.keypad_id ?? "");
    setName(record?.student_name ?? "");
    setRoll(record?.roll_number ?? "");
    setCls(record?.class ?? "");
    setSection(record?.section ?? "");
    setTeam(record?.team ?? "");
    setAnswers({ ...(record?.answers ?? {}) });
  }, [open, record, defaultAssessmentId]);

  const baseCols = Array.from({ length: 10 }, (_, i) => `S${i + 1}`);
  const cols = [...baseCols, ...questionColumns.filter((c) => !baseCols.includes(c))];

  const save = useMutation({
    mutationFn: async () => {
      const school = assessments.find((a) => a.assessment_id === assessmentId);
      const payload = {
        assessment_id: assessmentId || null,
        keypad_id: keypad.trim(),
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
        const { error } = await supabase
          .from("clicker_records")
          .update(payload)
          .eq("id", record.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.from("clicker_records").insert(payload);
        if (error) throw new Error(error.message);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clicker"] });
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
        </div>

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
