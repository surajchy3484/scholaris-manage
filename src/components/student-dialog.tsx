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
import { PhotoPicker } from "./photo-picker";
import { generateStudentCode } from "@/lib/student-id";
import { uploadPhotoToDrive } from "@/lib/drive.functions";
import type { Student } from "@/lib/types";

type Mode = { mode: "add"; schoolId: string; schoolName: string } | { mode: "edit"; student: Student };

type Errors = Partial<Record<"name" | "class" | "division" | "roll" | "photo", string>>;

export function StudentDialog({
  open,
  onOpenChange,
  ...rest
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
} & Mode) {
  const qc = useQueryClient();
  const isEdit = rest.mode === "edit";
  const uploadPhoto = useServerFn(uploadPhotoToDrive);

  const [name, setName] = useState("");
  const [cls, setCls] = useState("");
  const [division, setDivision] = useState("");
  const [roll, setRoll] = useState("");
  // `photo` may be a data: URL (freshly picked, needs upload) or an https URL
  // (previously uploaded to Drive).
  const [photo, setPhoto] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setStatus("");
    if (rest.mode === "edit") {
      setName(rest.student.name);
      setCls(rest.student.class);
      setDivision(rest.student.division);
      setRoll(rest.student.roll_number);
      setPhoto(rest.student.photo_url);
      setCode(rest.student.student_code);
    } else {
      setName("");
      setCls("");
      setDivision("");
      setRoll("");
      setPhoto(null);
      setCode(generateStudentCode(rest.schoolName));
    }
  }, [open, rest]);

  function validate(): Errors {
    const e: Errors = {};
    if (!name.trim()) e.name = "Student name is required.";
    else if (name.trim().length > 100) e.name = "Name must be 100 characters or less.";
    if (!cls.trim()) e.class = "Class is required.";
    if (!division.trim()) e.division = "Division is required.";
    if (!roll.trim()) e.roll = "Roll number is required.";
    if (!photo) e.photo = "Student photo is required.";
    return e;
  }

  const save = useMutation({
    mutationFn: async () => {
      const schoolId = rest.mode === "add" ? rest.schoolId : rest.student.school_id;
      const nameV = name.trim();
      const clsV = cls.trim();
      const divV = division.trim();
      const rollV = roll.trim();

      // Duplicate roll-number check within same school + class + division.
      setStatus("Checking for duplicates...");
      {
        let q = supabase
          .from("students")
          .select("id, roll_number, class, division")
          .eq("school_id", schoolId)
          .eq("class", clsV)
          .eq("division", divV)
          .eq("roll_number", rollV);
        if (rest.mode === "edit") q = q.neq("id", rest.student.id);
        const { data: dupes, error: dupErr } = await q;
        if (dupErr) throw dupErr;
        if (dupes && dupes.length > 0) {
          throw new Error(
            `Roll number "${rollV}" already exists for Class ${clsV} Div ${divV}.`,
          );
        }
      }

      // Duplicate student_code check (only on add — code is generated once).
      if (rest.mode === "add") {
        const { data: codeDupes, error: codeErr } = await supabase
          .from("students")
          .select("id")
          .eq("student_code", code)
          .limit(1);
        if (codeErr) throw codeErr;
        if (codeDupes && codeDupes.length > 0) {
          // Extremely unlikely; regenerate silently.
          setCode(generateStudentCode(rest.mode === "add" ? rest.schoolName : ""));
          throw new Error("Student ID collision — please save again.");
        }
      }

      // Upload photo to Google Drive if it's a freshly picked data URL.
      let photoUrl: string | null = photo;
      if (photo && photo.startsWith("data:")) {
        setStatus("Uploading photo to Google Drive...");
        let lastErr: unknown = null;
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            const filename = `${code || rollV}-${nameV.replace(/\s+/g, "_")}.jpg`;
            const result = await uploadPhoto({ data: { dataUrl: photo, filename } });
            photoUrl = result.url;
            lastErr = null;
            break;
          } catch (err) {
            lastErr = err;
            if (attempt < 3) {
              await new Promise((r) => setTimeout(r, 400 * attempt));
            }
          }
        }
        if (lastErr) {
          const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
          throw new Error(`Photo upload failed: ${msg}`);
        }
      }

      setStatus("Saving student...");
      if (rest.mode === "add") {
        const { error } = await supabase.from("students").insert({
          school_id: schoolId,
          student_code: code,
          name: nameV,
          class: clsV,
          division: divV,
          roll_number: rollV,
          photo_url: photoUrl,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("students")
          .update({
            name: nameV,
            class: clsV,
            division: divV,
            roll_number: rollV,
            photo_url: photoUrl,
          })
          .eq("id", rest.student.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      setStatus("");
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
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit student" : "Add student"}</DialogTitle>
          <DialogDescription>All fields are required, including a photo.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <PhotoPicker
              value={photo}
              onChange={(v) => {
                setPhoto(v);
                if (v) setErrors((prev) => ({ ...prev, photo: undefined }));
              }}
            />
            {errors.photo && (
              <p className="mt-1.5 text-xs text-destructive">{errors.photo}</p>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Student Name" error={errors.name} className="sm:col-span-2">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-invalid={!!errors.name}
                maxLength={100}
              />
            </Field>
            <Field label="Class" error={errors.class}>
              <Input
                value={cls}
                onChange={(e) => setCls(e.target.value)}
                placeholder="e.g. 5"
                aria-invalid={!!errors.class}
              />
            </Field>
            <Field label="Division" error={errors.division}>
              <Input
                value={division}
                onChange={(e) => setDivision(e.target.value)}
                placeholder="e.g. A"
                aria-invalid={!!errors.division}
              />
            </Field>
            <Field label="Roll Number" error={errors.roll}>
              <Input
                value={roll}
                onChange={(e) => setRoll(e.target.value)}
                aria-invalid={!!errors.roll}
              />
            </Field>
            <div className="space-y-1.5">
              <Label>Student ID</Label>
              <Input value={code} readOnly className="bg-muted font-mono text-xs" />
              <p className="text-[10px] text-muted-foreground">Auto-generated &amp; unique.</p>
            </div>
          </div>

          {status && (
            <div className="rounded-md border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              {status}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={save.isPending}
          >
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
  className,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function ViewStudentDialog({
  student,
  open,
  onOpenChange,
}: {
  student: Student | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  if (!student) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Student details</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-2">
          <div className="h-32 w-32 overflow-hidden rounded-full bg-muted ring-4 ring-accent">
            {student.photo_url ? (
              <img
                src={student.photo_url}
                alt={student.name}
                className="h-full w-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="grid h-full w-full place-items-center text-muted-foreground">
                No Photo
              </div>
            )}
          </div>
          <h3 className="font-display text-xl font-semibold">{student.name}</h3>
          <div className="grid w-full grid-cols-2 gap-3 text-sm">
            <Info label="Student ID" value={student.student_code} mono />
            <Info label="Roll Number" value={student.roll_number} />
            <Info label="Class" value={student.class} />
            <Info label="Division" value={student.division} />
          </div>
          {student.photo_url && /^https?:\/\//.test(student.photo_url) && (
            <a
              href={student.photo_url}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-primary underline underline-offset-2"
            >
              View original photo
            </a>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Info({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className={mono ? "mt-1 font-mono text-xs" : "mt-1 font-medium"}>{value}</div>
    </div>
  );
}
