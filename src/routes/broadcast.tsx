import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Megaphone, Pencil, Plus, Send, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getAccessToken } from "@/lib/app-access";
import { useAuth } from "@/lib/auth";
import {
  createBroadcast,
  deleteBroadcast,
  listBroadcasts,
  updateBroadcast,
} from "@/lib/broadcast.functions";

export const Route = createFileRoute("/broadcast")({
  head: () => ({
    meta: [
      { title: "Broadcast — SchoolRise" },
      { name: "description", content: "Send announcements to all trainers." },
    ],
  }),
  component: BroadcastPage,
});

type Broadcast = {
  id: string;
  title: string;
  description: string;
  sender_name: string;
  created_at: string;
  updated_at: string;
};

function tokenData() {
  return { token: getAccessToken() };
}

export function BroadcastPage() {
  const { ready, profile } = useAuth();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Broadcast | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const broadcasts = useQuery({
    queryKey: ["broadcasts"],
    enabled: ready && profile?.role === "admin",
    queryFn: () => listBroadcasts({ data: tokenData() }),
  });
  const save = useMutation({
    mutationFn: (payload: { id?: string; title: string; description: string }) =>
      payload.id
        ? updateBroadcast({ data: { ...tokenData(), ...payload, id: payload.id } })
        : createBroadcast({ data: { ...tokenData(), ...payload } }),
    onSuccess: () => {
      toast.success(editing ? "Broadcast updated" : "Broadcast sent to all trainers");
      setEditing(null);
      setIsCreating(false);
      void queryClient.invalidateQueries({ queryKey: ["broadcasts"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteBroadcast({ data: { ...tokenData(), id } }),
    onSuccess: () => {
      toast.success("Broadcast deleted");
      void queryClient.invalidateQueries({ queryKey: ["broadcasts"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!ready) return null;
  if (profile?.role !== "admin") {
    return (
      <Card className="m-6 p-8 text-center text-muted-foreground">
        Administrator access is required.
      </Card>
    );
  }

  const formBroadcast = editing ?? (isCreating ? { id: "", title: "", description: "" } : null);
  return (
    <main className="mx-auto w-full max-w-5xl space-y-5 px-3 py-6 sm:px-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-primary to-primary-glow text-primary-foreground shadow-elegant">
            <Megaphone />
          </div>
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight">Broadcast</h1>
            <p className="text-sm text-muted-foreground">
              Send important announcements to every active trainer.
            </p>
          </div>
        </div>
        {!formBroadcast && (
          <Button onClick={() => setIsCreating(true)} className="gap-2">
            <Plus className="h-4 w-4" /> New Broadcast
          </Button>
        )}
      </header>

      {formBroadcast && (
        <BroadcastForm
          initial={formBroadcast}
          pending={save.isPending}
          onCancel={() => {
            setEditing(null);
            setIsCreating(false);
          }}
          onSubmit={(payload) => save.mutate(editing ? { ...payload, id: editing.id } : payload)}
        />
      )}

      <section className="space-y-3">
        {(broadcasts.data as Broadcast[] | undefined)?.map((broadcast) => (
          <Card key={broadcast.id} className="space-y-3 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold">{broadcast.title}</h2>
                  <Badge variant="secondary">Sent</Badge>
                </div>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                  {broadcast.description}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setIsCreating(false);
                    setEditing(broadcast);
                  }}
                >
                  <Pencil className="mr-1 h-4 w-4" /> Edit
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={remove.isPending}
                  onClick={() => {
                    if (window.confirm(`Delete broadcast “${broadcast.title}”?`))
                      remove.mutate(broadcast.id);
                  }}
                >
                  <Trash2 className="mr-1 h-4 w-4" /> Delete
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {broadcast.sender_name} · {new Date(broadcast.created_at).toLocaleString()}
            </p>
          </Card>
        ))}
        {broadcasts.isLoading && (
          <Card className="p-8 text-center text-sm text-muted-foreground">Loading broadcasts…</Card>
        )}
        {!broadcasts.isLoading && !broadcasts.data?.length && (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            No broadcasts sent yet.
          </Card>
        )}
      </section>
    </main>
  );
}

function BroadcastForm({
  initial,
  pending,
  onCancel,
  onSubmit,
}: {
  initial: { id: string; title: string; description: string };
  pending: boolean;
  onCancel: () => void;
  onSubmit: (payload: { title: string; description: string }) => void;
}) {
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  return (
    <Card className="space-y-4 border-primary/30 p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-bold">
          {initial.id ? "Edit Broadcast" : "New Broadcast"}
        </h2>
        <Button size="icon" variant="ghost" onClick={onCancel}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="broadcast-title">Title</Label>
        <Input
          id="broadcast-title"
          value={title}
          maxLength={200}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Important announcement"
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="broadcast-description">Description</Label>
        <Textarea
          id="broadcast-description"
          value={description}
          maxLength={20000}
          rows={6}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Write the full announcement…"
        />
      </div>
      <div className="flex justify-end">
        <Button
          className="gap-2"
          disabled={pending || title.trim().length < 3 || !description.trim()}
          onClick={() => onSubmit({ title: title.trim(), description: description.trim() })}
        >
          <Send className="h-4 w-4" />
          {pending ? "Sending…" : initial.id ? "Save Changes" : "Send to All Trainers"}
        </Button>
      </div>
    </Card>
  );
}
