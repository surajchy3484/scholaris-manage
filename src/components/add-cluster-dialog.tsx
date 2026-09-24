import { useState } from "react";
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
import { supabase } from "@/integrations/supabase/client";
import { isMissingClustersTable, saveLocalCluster } from "@/lib/clusters";

export function AddClusterDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState("");
  const qc = useQueryClient();

  const create = useMutation({
    mutationFn: async () => {
      const clusterName = name.trim();
      if (!clusterName) throw new Error("Cluster name is required.");
      const { error } = await supabase.from("school_clusters").insert({ name: clusterName });
      if (error) {
        if (error.code === "23505") throw new Error("That cluster already exists.");
        if (isMissingClustersTable(error)) {
          saveLocalCluster(clusterName);
          return;
        }
        throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clusters"] });
      toast.success("Cluster added");
      setName("");
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const submit = () => {
    if (!name.trim()) {
      toast.error("Enter a cluster name.");
      return;
    }
    create.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !create.isPending && onOpenChange(next)}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add cluster</DialogTitle>
          <DialogDescription>
            Create a cluster now and choose it when adding schools.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5 py-2">
          <Label htmlFor="cluster-name">Cluster name</Label>
          <Input
            id="cluster-name"
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Mannmad Cluster"
            onKeyDown={(event) => {
              if (event.key === "Enter") submit();
            }}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={create.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={create.isPending}>
            {create.isPending ? "Saving..." : "Add Cluster"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
