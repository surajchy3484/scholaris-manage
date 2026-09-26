import { saveStudentDetails } from "@/lib/performance.functions";
import { getAccessToken } from "@/lib/app-access";
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
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
import { PhotoPicker } from "@/components/photo-picker";
import { nextStudentCode } from "@/lib/student-id";
import { uploadPhotoToDrive } from "@/lib/drive.functions";
import { ATTENDANCE_TYPE, saveScore, type StudentReport } from "@/lib/exam";

type Mode =
  { mode: "add"; schoolId: string; schoolCode: string } | { mode: "edit"; student: StudentReport };

type Errors = Partial<
  Record<
    "code" | "name" | "class" | "division" | "roll" | "attendance" | "ica" | "mca" | "fca" | "date",
    string
  >
>;

function numOrNull(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

export function ExamStudentDialog({
  open,
  onOpenChange,
  ...rest
}: { open: boolean; onOpenChange: (o: boolean) => void } & Mode) {
  const qc = useQueryClient();
  const isEdit = rest.mode === "edit";
  const uploadPhoto = useServerFn(uploadPhotoToDrive);

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [cls, setCls] = useState("");
  const [division, setDivision] = useState("");
  const [roll, setRoll] = useState("");
  const [attendance, setAttendance] = useState("");
  const [ica, setIca] = useState("");
  const [mca, setMca] = useState("");
  const [fca, setFca] = useState("");
  const [enrolled, setEnrolled] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setStatus("");
    if (rest.mode === "edit") {
      const s = rest.student;
      setCode(s.student_code);
      setName(s.name);
      setCls(s.class);
      setDivision(s.division);
      setRoll(s.roll_number);
      setAttendance(s.attendance_override != null ? String(s.attendance_override) : "");
      setIca(s.ica != null ? String(s.ica) : "");
      setMca(s.mca != null ? String(s.mca) : "");
      setFca(s.fca != null ? String(s.fca) : "");
      setEnrolled(s.enrollment_date ?? s.created_at.slice(0, 10));
      setPhoto(s.photo_url);
    } else {
      setName("");
      setCls("");
      setDivision("");
      setRoll("");
      setAttendance("");
      setIca("");
      setMca("");
      setFca("");
      setEnrolled(new Date().toISOString().slice(0, 10));
      setPhoto(null);
      setCode("");
      nextStudentCode(rest.schoolId, rest.schoolCode)
        .then(setCode)
        .catch(() => setCode(`${rest.schoolCode}-STU000001`));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isEdit, isEdit ? rest.student.id : rest.schoolId]);

  function validate(): Errors {
    const e: Errors = {};
    if (!code.trim()) e.code = "Student ID is required.";
    if (!name.trim()) e.name = "Student name is required.";
    if (!cls.trim()) e.class = "Class is required.";
    if (!division.trim()) e.division = "Division is required.";
    if (!roll.trim()) e.roll = "Roll number is required.";
    const rangeCheck = (raw: string, key: "attendance" | "ica" | "mca" | "fca", label: string) => {
      const n = numOrNull(raw);
      if (n === null) return;
      if (Number.isNaN(n)) e[key] = `${label} must be a number.`;
      else if (n < 0 || n > 100) e[key] = `${label} must be between 0 and 100.`;
    };
    rangeCheck(attendance, "attendance", "Attendance");
    rangeCheck(ica, "ica", "ICA score");
    rangeCheck(mca, "mca", "MCA score");
    rangeCheck(fca, "fca", "FCA score");
    if (enrolled && Number.isNaN(new Date(enrolled).getTime())) e.date = "Invalid date.";
    return e;
  }

  const save = useMutation({
    mutationFn: async () => {
      const schoolId = rest.mode === "add" ? rest.schoolId : rest.student.school_id;
      const values = {
        student_code: code.trim(),
        name: name.trim(),
        class: cls.trim(),
        division: division.trim().toUpperCase(),
        roll_number: roll.trim(),
        enrollment_date: enrolled || null,
      };

      setStatus("Checking for duplicates...");
      let dupQ = supabase.from("students").select("id").eq("student_code", values.student_code);
      if (rest.mode === "edit") dupQ = dupQ.neq("id", rest.student.id);
      const { data: dupes, error: dupErr } = await dupQ.limit(1);
      if (dupErr) throw dupErr;
      if (dupes && dupes.length > 0)
        throw new Error(`Student ID "${values.student_code}" already exists.`);

      let rollQ = supabase
        .from("students")
        .select("id")
        .eq("school_id", schoolId)
        .eq("class", values.class)
        .eq("division", values.division)
        .eq("roll_number", values.roll_number);
      if (rest.mode === "edit") rollQ = rollQ.neq("id", rest.student.id);
      const { data: rollDupes, error: rollErr } = await rollQ.limit(1);
      if (rollErr) throw rollErr;
      if (rollDupes && rollDupes.length > 0)
        throw new Error(
          `Roll number "${values.roll_number}" already exists in that class/division.`,
        );

      let photoUrl: string | null = photo;
      if (photo && photo.startsWith("data:")) {
        setStatus("Uploading photo...");
        const filename = `${values.student_code}-${values.name.replace(/\s+/g, "_")}.jpg`;
        try {
          photoUrl = (await uploadPhoto({ data: { dataUrl: photo, filename } })).url;
        } catch (err) {
          throw new Error(
            `Photo upload failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      setStatus("Saving student...");
      const { id: studentId } = await saveStudentDetails({
        data: {
          token: getAccessToken(),
          module: "exam_report",
          schoolId,
          id: rest.mode === "edit" ? rest.student.id : undefined,
          values: { ...values, photo_url: photoUrl },
        },
      });

      setStatus("Saving scores...");
      await saveScore({ schoolId, studentId, examType: "ICA", score: numOrNull(ica) });
      await saveScore({ schoolId, studentId, examType: "MCA", score: numOrNull(mca) });
      await saveScore({ schoolId, studentId, examType: "FCA", score: numOrNull(fca) });
      await saveScore({
        schoolId,
        studentId,
        examType: ATTENDANCE_TYPE,
        score: numOrNull(attendance),
      });
    },
    onSuccess: () => {
      setStatus("");
      qc.invalidateQueries({ queryKey: ["exam-data"] });
      qc.invalidateQueries({ queryKey: ["students"] });
      qc.invalidateQueries({ queryKey: ["schools"] });
      toast.success(isEdit ? "Student updated" : "Student added");
      onOpenChange(false);
    },
    onError: (e: Error) => {
      setStatus("");
      toast.error(e.message);
    },
  });

  const submit = () => {
    const e = validate();
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
          <DialogTitle>{isEdit ? "Edit student" : "Add student"}</DialogTitle>
          <DialogDescription>
            Attendance, ICA, MCA and FCA accept values between 0 and 100. Leave a score blank if not
            recorded.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <PhotoPicker value={photo} onChange={setPhoto} />

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Student ID" error={errors.code}>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="font-mono text-xs"
              />
            </Field>
            <Field label="Student Name" error={errors.name}>
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
            </Field>
            <Field label="Class" error={errors.class}>
              <Input value={cls} onChange={(e) => setCls(e.target.value)} placeholder="e.g. 5" />
            </Field>
            <Field label="Division" error={errors.division}>
              <Input
                value={division}
                onChange={(e) => setDivision(e.target.value)}
                placeholder="A"
              />
            </Field>
            <Field label="Roll Number" error={errors.roll}>
              <Input value={roll} onChange={(e) => setRoll(e.target.value)} />
            </Field>
            <Field label="Attendance % (override)" error={errors.attendance}>
              <Input
                value={attendance}
                onChange={(e) => setAttendance(e.target.value)}
                inputMode="decimal"
                placeholder="auto from register"
              />
            </Field>
            <Field label="ICA Score" error={errors.ica}>
              <Input value={ica} onChange={(e) => setIca(e.target.value)} inputMode="decimal" />
            </Field>
            <Field label="MCA Score" error={errors.mca}>
              <Input value={mca} onChange={(e) => setMca(e.target.value)} inputMode="decimal" />
            </Field>
            <Field label="FCA Score" error={errors.fca}>
              <Input value={fca} onChange={(e) => setFca(e.target.value)} inputMode="decimal" />
            </Field>
            <Field label="Enrollment Date" error={errors.date}>
              <Input type="date" value={enrolled} onChange={(e) => setEnrolled(e.target.value)} />
            </Field>
          </div>

          {status && (
            <div className="rounded-md border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              {status}
            </div>
          )}
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
