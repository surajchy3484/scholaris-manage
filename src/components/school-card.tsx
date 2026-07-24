import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { MapPin, Users, MoreVertical, Pencil, Trash2, ArrowRight, School as SchoolIcon } from "lucide-react";

import type { School } from "@/lib/types";
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
import { EditSchoolDialog } from "./add-school-dialog";

export function SchoolCard({
  school,
  onDelete,
  onUpdated,
}: {
  school: School & { student_count: number };
  onDelete: () => void;
  onUpdated: () => void;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <Card className="group relative flex h-full flex-col gap-4 overflow-hidden p-5 transition-all hover:-translate-y-0.5 hover:shadow-elegant">
        <div className="absolute right-3 top-3 z-10">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 bg-background/70 backdrop-blur">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setEditOpen(true)}>
                <Pencil className="h-4 w-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setConfirmOpen(true)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex items-start gap-4">
          <div
            className="relative shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-primary/90 to-primary-glow text-primary-foreground shadow-soft"
            style={{ width: 140, height: 140 }}
          >
            {school.image_url ? (
              <img
                src={school.image_url}
                alt={school.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-1">
                <SchoolIcon className="h-10 w-10 opacity-90" />
                <span className="font-display text-xl font-bold">
                  {school.name.slice(0, 2).toUpperCase()}
                </span>
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1 pr-8">
            <h3 className="truncate font-display text-lg font-semibold">{school.name}</h3>
            <p className="mt-0.5 flex items-center gap-1 truncate text-sm text-muted-foreground">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{school.location}</span>
            </p>
            <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">
              <Users className="h-3.5 w-3.5" />
              {school.student_count} students
            </div>
          </div>
        </div>

        <div className="mt-auto flex items-center justify-end">
          <Button asChild size="sm" variant="secondary">
            <Link to="/schools/$schoolId" params={{ schoolId: school.id }}>
              Open
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </Card>

      <EditSchoolDialog school={school} open={editOpen} onOpenChange={setEditOpen} onSaved={onUpdated} />

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this school?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes <strong>{school.name}</strong> along with all its {school.student_count}{" "}
              students and attendance records. This action cannot be undone.
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
    </>
  );
}
