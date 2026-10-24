import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock3, Send, Ticket, TicketCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/lib/auth";
import { getAccessToken } from "@/lib/app-access";
import {
  createSupportTicket,
  deleteSupportTicket,
  listMySupportTickets,
  listSupportTickets,
  updateSupportTicketStatus,
  type SupportTicket,
} from "@/lib/support-tickets.functions";

export const Route = createFileRoute("/support-tickets")({
  head: () => ({ meta: [{ title: "Support Tickets — SchoolRise" }] }),
  component: SupportTicketsPage,
});

function SupportTicketsPage() {
  const { isAdmin, profile, session } = useAuth();
  const qc = useQueryClient();
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const token = getAccessToken();
  const tickets = useQuery({
    queryKey: ["support-tickets", "admin"],
    queryFn: () => listSupportTickets({ data: { token } }),
    enabled: isAdmin,
    refetchInterval: 30_000,
  });
  const myTickets = useQuery({
    queryKey: ["support-tickets", "mine", profile?.username],
    queryFn: () => listMySupportTickets({ data: { token } }),
    enabled: Boolean(token) && !isAdmin,
    refetchInterval: 30_000,
  });

  const submit = useMutation({
    mutationFn: () => createSupportTicket({ data: { token, subject, description } }),
    onSuccess: () => {
      toast.success("Ticket submitted successfully. Your status is Pending.");
      setSubject("");
      setDescription("");
      void qc.invalidateQueries({ queryKey: ["support-tickets"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const status = useMutation({
    mutationFn: (v: { id: string; status: SupportTicket["status"] }) =>
      updateSupportTicketStatus({ data: { token, ...v } }),
    onSuccess: () => {
      toast.success("Ticket status updated");
      void qc.invalidateQueries({ queryKey: ["support-tickets"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const removeTicket = useMutation({
    mutationFn: (id: string) => deleteSupportTicket({ data: { token, id } }),
    onSuccess: () => {
      toast.success("Ticket deleted");
      void qc.invalidateQueries({ queryKey: ["support-tickets"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const currentName = profile?.fullName || profile?.username || session?.user || "User";

  return (
    <main className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:px-6">
      <header className="flex items-start gap-3">
        <div className="rounded-xl bg-primary/10 p-3 text-primary"><Ticket className="h-6 w-6" /></div>
        <div>
          <h1 className="font-display text-3xl font-bold">Support Tickets</h1>
          <p className="text-sm text-muted-foreground">Tell the administrator what difficulty you are facing. Your ticket is private.</p>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Send className="h-5 w-5" /> Raise a ticket</CardTitle>
          <CardDescription>Your name and account details are attached automatically. Only administrators can read your problem details; you can track your own tickets below.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit.mutate(); }}>
            <div className="space-y-2">
              <Label htmlFor="ticket-user">Raised by</Label>
              <Input id="ticket-user" value={currentName} readOnly />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ticket-subject">Problem title</Label>
              <Input id="ticket-subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Unable to update session status" minLength={3} maxLength={160} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ticket-description">Describe the difficulty</Label>
              <Textarea id="ticket-description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Explain what happened, which page you were using, and what you expected..." minLength={10} maxLength={10000} rows={5} required />
            </div>
            <Button type="submit" disabled={submit.isPending || subject.trim().length < 3 || description.trim().length < 10}>
              <Send className="mr-2 h-4 w-4" /> {submit.isPending ? "Submitting..." : "Submit Ticket"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {!isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Clock3 className="h-5 w-5" /> My ticket history</CardTitle>
            <CardDescription>Track every problem you have reported. New tickets show Pending until an administrator resolves them.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {myTickets.isLoading && <p className="text-sm text-muted-foreground">Loading your tickets…</p>}
            {myTickets.error && <p role="alert" className="text-sm text-destructive">{myTickets.error.message}</p>}
            {!myTickets.isLoading && !myTickets.error && myTickets.data?.length === 0 && (
              <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">You have not raised any tickets yet.</p>
            )}
            {myTickets.data?.map((ticket) => (
              <article key={ticket.id} className="space-y-2 rounded-xl border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-semibold">{ticket.subject}</h3>
                    <p className="text-xs text-muted-foreground">Submitted {new Date(ticket.created_at).toLocaleString()}</p>
                  </div>
                  <Badge variant={ticket.status === "resolved" ? "secondary" : "outline"} className="gap-1">
                    {ticket.status === "resolved" ? <><CheckCircle2 className="h-3.5 w-3.5" /> Resolved</> : <><Clock3 className="h-3.5 w-3.5" /> Pending</>}
                  </Badge>
                </div>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">{ticket.description}</p>
                {ticket.status === "resolved" && <p className="text-xs font-medium text-emerald-600">The administrator has marked this ticket as resolved.</p>}
              </article>
            ))}
          </CardContent>
        </Card>
      )}

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><TicketCheck className="h-5 w-5" /> Trainer issues</CardTitle>
            <CardDescription>Administrator-only inbox. Recent tickets are shown first.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {tickets.isLoading && <p className="text-sm text-muted-foreground">Loading tickets…</p>}
            {tickets.error && <p role="alert" className="text-sm text-destructive">{tickets.error.message}</p>}
            {!tickets.isLoading && !tickets.error && tickets.data?.length === 0 && (
              <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No support tickets have been raised yet.</p>
            )}
            {tickets.data?.map((ticket) => (
              <article key={ticket.id} className="space-y-3 rounded-xl border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-semibold">{ticket.subject}</h3>
                    <p className="text-xs text-muted-foreground">
                      {ticket.full_name || ticket.username} · @{ticket.username} · {ticket.role} · {new Date(ticket.created_at).toLocaleString()}
                    </p>
                  </div>
                  <Badge variant={ticket.status === "resolved" ? "secondary" : ticket.status === "in_progress" ? "default" : "outline"}>
                    {ticket.status === "in_progress" ? "In progress" : ticket.status === "resolved" ? "Resolved" : "Open"}
                  </Badge>
                </div>
                <p className="whitespace-pre-wrap text-sm">{ticket.description}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <Label className="text-xs">Update status</Label>
                  <Select value={ticket.status} onValueChange={(value) => status.mutate({ id: ticket.id, status: value as SupportTicket["status"] })} disabled={status.isPending}>
                    <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="in_progress">In progress</SelectItem>
                      <SelectItem value="resolved">Resolved</SelectItem>
                    </SelectContent>
                  </Select>
                  {ticket.status !== "resolved" && (
                    <Button size="sm" onClick={() => status.mutate({ id: ticket.id, status: "resolved" })} disabled={status.isPending}>
                      <CheckCircle2 className="mr-2 h-4 w-4" /> Resolve Ticket
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => {
                      if (window.confirm(`Delete the ticket "${ticket.subject}"? This action cannot be undone.`)) {
                        removeTicket.mutate(ticket.id);
                      }
                    }}
                    disabled={removeTicket.isPending}
                  >
                    <Trash2 className="mr-2 h-4 w-4" /> Delete
                  </Button>
                </div>
              </article>
            ))}
          </CardContent>
        </Card>
      )}
    </main>
  );
}
