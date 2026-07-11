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
import { PhotoPicker } from "./photo-picker";
import { generateStudentCode } from "@/lib/student-id";
import type { Student } from "@/lib/types";

type Mode = { mode: "add"; schoolId: string; schoolName: string } | { mode: "edit"; student: Student };

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
  const [name, setName] = useState("");
  const [cls, setCls] = useState("");
  const [division, setDivision] = useState("");
  const [roll, setRoll] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [code, setCode] = useState("");

  useEffect(() => {
    if (!open) return;
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

  const save = useMutation({
    mutationFn: async () => {
      if (rest.mode === "add") {
        const { error } = await supabase.from("students").insert({
          school_id: rest.schoolId,
          student_code: code,
          name: name.trim(),
          class: cls.trim(),
          division: division.trim(),
          roll_number: roll.trim(),
          photo_url: photo,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("students")
          .update({
            name: name.trim(),
            class: cls.trim(),
            division: division.trim(),
            roll_number: roll.trim(),
            photo_url: photo,
          })
          .eq("id", rest.student.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["students"] });
      qc.invalidateQueries({ queryKey: ["schools"] });
      toast.success(isEdit ? "Student updated" : "Student added");
      onOpenChange(false);
    },
    onError: (e: Error) => {
      if (e.message.includes("duplicate") || e.message.includes("unique")) {
        toast.error("A student with this roll number already exists in this class & division");
      } else {
        toast.error(e.message);
      }
    },
  });

  const submit = () => {
    if (!name.trim() || !cls.trim() || !division.trim() || !roll.trim()) {
      toast.error("All fields are required");
      return;
    }
    save.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit student" : "Add student"}</DialogTitle>
          <DialogDescription>All fields are required.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <PhotoPicker value={photo} onChange={setPhoto} />

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Student Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Class</Label>
              <Input value={cls} onChange={(e) => setCls(e.target.value)} placeholder="e.g. 5" />
            </div>
            <div className="space-y-1.5">
              <Label>Division</Label>
              <Input
                value={division}
                onChange={(e) => setDivision(e.target.value)}
                placeholder="e.g. A"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Roll Number</Label>
              <Input value={roll} onChange={(e) => setRoll(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Student ID</Label>
              <Input value={code} readOnly className="bg-muted font-mono text-xs" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
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
              <img src={student.photo_url} alt={student.name} className="h-full w-full object-cover" />
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
