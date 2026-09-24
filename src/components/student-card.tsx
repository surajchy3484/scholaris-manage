import { useState } from "react";
import { Eye, Pencil, Trash2, MoreVertical, User } from "lucide-react";
import type { Student } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { PhotoPicker } from "./photo-picker";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  uploadPhotoToDrive,
  deletePhotoFromDrive,
  extractDriveFileId,
  toDisplayablePhotoUrl,
} from "@/lib/drive.functions";

export function StudentCard({
  student,
  onView,
  onEdit,
  onDelete,
}: {
  student: Student;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const qc = useQueryClient();
  const uploadPhoto = useServerFn(uploadPhotoToDrive);

  const setPhoto = useMutation({
    mutationFn: async (dataUrl: string | null) => {
      const prevUrl = student.photo_url;
      let photoUrl = dataUrl;
      if (photoUrl && photoUrl.startsWith("data:")) {
        const filename = `${student.student_code}-${student.name.replace(/\s+/g, "_")}.jpg`;
        const res = await uploadPhoto({ data: { dataUrl: photoUrl, filename } });
        photoUrl = res.url;
      }
      const { error } = await supabase
        .from("students")
        .update({ photo_url: photoUrl })
        .eq("id", student.id);
      if (error) throw error;
      // Best-effort: delete previous Drive file if it changed.
      if (prevUrl && prevUrl !== photoUrl) {
        const oldId = extractDriveFileId(prevUrl);
        if (oldId) deletePhotoFromDrive({ data: { fileId: oldId } }).catch(() => {});
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["students"] });
      toast.success("Photo updated");
      setPhotoOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <Card className="group relative flex gap-3 p-3 transition-all hover:shadow-soft">
        <button
          type="button"
          onClick={() => (student.photo_url ? onView() : setPhotoOpen(true))}
          className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-muted"
        >
          {student.photo_url ? (
            <img
              src={toDisplayablePhotoUrl(student.photo_url) ?? ""}
              alt={student.name}
              className="h-full w-full object-cover"
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-0.5 border-2 border-dashed border-border text-muted-foreground">
              <User className="h-5 w-5" />
              <span className="text-[9px] font-medium">No Photo</span>
            </div>
          )}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h4 className="truncate font-semibold">{student.name}</h4>
              <p className="truncate font-mono text-[10px] text-muted-foreground">
                {student.student_code}
              </p>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onView}>
                  <Eye className="h-4 w-4" /> View
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onEdit}>
                  <Pencil className="h-4 w-4" /> Edit
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => setConfirmOpen(true)}
                >
                  <Trash2 className="h-4 w-4" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <span className="rounded-md bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground">
              Class {student.class}
            </span>
            <span className="rounded-md bg-warm/60 px-2 py-0.5 text-xs font-medium text-warm-foreground">
              Div {student.division}
            </span>
            <span className="rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
              Roll {student.roll_number}
            </span>
          </div>
        </div>
      </Card>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this student?</AlertDialogTitle>
            <AlertDialogDescription>
              Remove <strong>{student.name}</strong> and all attendance records. This cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={onDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {photoOpen && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
          onClick={() => setPhotoOpen(false)}
        >
          <Card className="w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-4 font-display text-lg font-semibold">
              Add photo for {student.name}
            </h3>
            <PhotoPicker
              value={student.photo_url}
              onChange={(url) => setPhoto.mutate(url)}
              size={110}
            />
            <div className="mt-4 flex justify-end">
              <Button variant="outline" onClick={() => setPhotoOpen(false)}>
                Close
              </Button>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
