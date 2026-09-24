import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { PhotoPicker } from "@/components/photo-picker";
import { DivisionEditor } from "@/components/division-editor";
import { fetchSchoolDivisions, saveSchoolDivisions, type DivisionDraft } from "@/lib/divisions";
import type { School } from "@/lib/types";

export function AddSchoolDialog({
  open,
  onOpenChange,
  clusterOptions = [],
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  clusterOptions?: string[];
}) {
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [cluster, setCluster] = useState("");
  const [newCluster, setNewCluster] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [divisions, setDivisions] = useState<DivisionDraft[]>([]);
  const qc = useQueryClient();

  const create = useMutation({
    mutationFn: async () => {
      const clusterName = cluster === "__new__" ? newCluster.trim() : cluster.trim();
      // `code` is auto-assigned by a DB trigger (SCH001, SCH002, ...); pass empty string.
      const { data, error } = await supabase
        .from("schools")
        .insert({
          name,
          location,
          cluster_name: clusterName || null,
          code: "",
          image_url: imageUrl,
        })
        .select("id")
        .single();
      if (error) throw error;
      if (divisions.length) await saveSchoolDivisions(data.id, divisions);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schools"] });
      toast.success("School added");
      setName("");
      setLocation("");
      setCluster("");
      setNewCluster("");
      setImageUrl(null);
      setDivisions([]);
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const submit = () => {
    const clusterName = cluster === "__new__" ? newCluster.trim() : cluster.trim();
    if (!name.trim() || !location.trim() || !clusterName) {
      toast.error("Please fill in all fields");
      return;
    }
    create.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add school</DialogTitle>
          <DialogDescription>
            Create a new school. You can add students afterwards.
          </DialogDescription>
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
          <ClusterField
            value={cluster}
            onChange={setCluster}
            newValue={newCluster}
            onNewChange={setNewCluster}
            options={clusterOptions}
          />
          <DivisionEditor rows={divisions} onChange={setDivisions} />
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
  clusterOptions = [],
}: {
  school: School;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved?: () => void;
  clusterOptions?: string[];
}) {
  const [name, setName] = useState(school.name);
  const [location, setLocation] = useState(school.location);
  const [cluster, setCluster] = useState(school.cluster_name ?? "");
  const [newCluster, setNewCluster] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(school.image_url);
  const [divisions, setDivisions] = useState<DivisionDraft[]>([]);
  const qc = useQueryClient();

  const existing = useQuery({
    queryKey: ["school-divisions", school.id],
    queryFn: () => fetchSchoolDivisions(school.id),
    enabled: open,
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (open && existing.data)
      setDivisions(existing.data.map((d) => ({ class: d.class, name: d.name })));
  }, [open, existing.data]);

  const update = useMutation({
    mutationFn: async () => {
      const clusterName = cluster === "__new__" ? newCluster.trim() : cluster.trim();
      const { error } = await supabase
        .from("schools")
        .update({
          name,
          location,
          cluster_name: clusterName || null,
          image_url: imageUrl,
        })
        .eq("id", school.id);
      if (error) throw error;
      await saveSchoolDivisions(school.id, divisions);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schools"] });
      qc.invalidateQueries({ queryKey: ["school", school.id] });
      qc.invalidateQueries({ queryKey: ["school-divisions", school.id] });
      toast.success("School updated");
      onSaved?.();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto">
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
          <ClusterField
            value={cluster}
            onChange={setCluster}
            newValue={newCluster}
            onNewChange={setNewCluster}
            options={clusterOptions}
          />
          <DivisionEditor rows={divisions} onChange={setDivisions} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (!name.trim() || !location.trim() || (cluster === "__new__" && !newCluster.trim()))
                return toast.error("Fill all fields");
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

function ClusterField({
  value,
  onChange,
  newValue,
  onNewChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  newValue: string;
  onNewChange: (value: string) => void;
  options: string[];
}) {
  return (
    <div className="space-y-1.5">
      <Label>School Cluster</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder="Choose a cluster" />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
          <SelectItem value="__new__">＋ Add new cluster</SelectItem>
        </SelectContent>
      </Select>
      {value === "__new__" && (
        <>
          <Input
            id="new-cluster-name"
            value={newValue}
            onChange={(e) => onNewChange(e.target.value)}
            placeholder="New cluster name"
            autoFocus
          />
          <p className="text-xs text-muted-foreground">
            This creates the cluster and assigns it to this school when you save.
          </p>
        </>
      )}
    </div>
  );
}
