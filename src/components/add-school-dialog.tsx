import { useState } from "react";
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
import { PhotoPicker } from "@/components/photo-picker";
import type { School } from "@/lib/types";

export function AddSchoolDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const qc = useQueryClient();

  const create = useMutation({
    mutationFn: async () => {
      // `code` is auto-assigned by a DB trigger (SCH001, SCH002, ...); pass empty string.
      const { error } = await supabase
        .from("schools")
        .insert({ name, location, code: "", image_url: imageUrl });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schools"] });
      toast.success("School added");
      setName("");
      setLocation("");
      setImageUrl(null);
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const submit = () => {
    if (!name.trim() || !location.trim()) {
      toast.error("Please fill in all fields");
      return;
    }
    create.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add school</DialogTitle>
          <DialogDescription>Create a new school. You can add students afterwards.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>School Image</Label>
            <PhotoPicker value={imageUrl} onChange={setImageUrl} size={112} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="school-name">School Name</Label>
            <Input
              id="school-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Greenwood Public School"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="school-location">Location / Address</Label>
            <Input
              id="school-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="123 Main St, Bengaluru"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={create.isPending}>
            {create.isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EditSchoolDialog({
  school,
  open,
  onOpenChange,
  onSaved,
}: {
  school: School;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved?: () => void;
}) {
  const [name, setName] = useState(school.name);
  const [location, setLocation] = useState(school.location);
  const [imageUrl, setImageUrl] = useState<string | null>(school.image_url);
  const qc = useQueryClient();

  const update = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("schools")
        .update({ name, location, image_url: imageUrl })
        .eq("id", school.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schools"] });
      qc.invalidateQueries({ queryKey: ["school", school.id] });
      toast.success("School updated");
      onSaved?.();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit school</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>School Image</Label>
            <PhotoPicker value={imageUrl} onChange={setImageUrl} size={112} />
          </div>
          <div className="space-y-1.5">
            <Label>School Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Location / Address</Label>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (!name.trim() || !location.trim()) return toast.error("Fill all fields");
              update.mutate();
            }}
            disabled={update.isPending}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
