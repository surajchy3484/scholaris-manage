import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { MapPin, Users, MoreVertical, Pencil, Trash2, School as SchoolIcon } from "lucide-react";

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
  canEdit = false,
  canDelete = false,
  clusterOptions = [],
}: {
  school: School & { student_count: number };
  onDelete: () => void;
  onUpdated: () => void;
  canEdit?: boolean;
  canDelete?: boolean;
  clusterOptions?: string[];
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <Card className="group relative flex h-full min-w-0 flex-col overflow-hidden p-0 transition-all hover:-translate-y-0.5 hover:shadow-elegant">
        {(canEdit || canDelete) && (
          <div className="absolute right-3 top-3 z-10">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 bg-background/70 backdrop-blur"
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {canEdit && (
                  <DropdownMenuItem onClick={() => setEditOpen(true)}>
                    <Pencil className="h-4 w-4" />
                    Edit
                  </DropdownMenuItem>
                )}
                {canDelete && (
                  <DropdownMenuItem
                    onClick={() => setConfirmOpen(true)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        <Link
          to="/schools/$schoolId"
          params={{ schoolId: school.id }}
          aria-label={`Open ${school.name}`}
          className="flex min-w-0 flex-1 cursor-pointer items-start gap-4 p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:bg-accent/40"
        >
          <div className="relative aspect-square w-24 shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-primary/90 to-primary-glow text-primary-foreground shadow-soft sm:w-[140px]">
            {school.image_url ? (
              <img
                src={school.image_url}
                alt={school.name}
                loading="lazy"
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
            <h3 className="truncate font-display text-lg font-semibold group-hover:text-primary">
              {school.name}
            </h3>
            <p className="mt-0.5 flex items-center gap-1 truncate text-sm text-muted-foreground">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{school.location}</span>
            </p>
            <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">
              <Users className="h-3.5 w-3.5" />
              {school.student_count} students
            </div>
          </div>
        </Link>
      </Card>

      <EditSchoolDialog
        school={school}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={onUpdated}
        clusterOptions={clusterOptions}
      />

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
