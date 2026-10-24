import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  FileText,
  LifeBuoy,
  MessageSquare,
  Paperclip,
  RefreshCw,
  Send,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { RequireModule } from "@/components/require-module";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getAccessToken } from "@/lib/app-access";
import { getAcademicYear } from "@/lib/academic-year";
import { useAuth } from "@/lib/auth";
import {
  categories,
  priorities,
  statuses,
  type TicketCategory,
  type TicketPriority,
  type TicketStatus,
} from "@/lib/support-types";
import {
  createSupportTicket,
  getSupportTicket,
  getSupportSummary,
  listSupportRoster,
  listSupportSchools,
  listSupportTickets,
  replySupportTicket,
  updateSupportTicket,
} from "@/lib/support.functions";

export const Route = createFileRoute("/support")({
  head: () => ({
    meta: [
      { title: "Help & Support — SchoolRise" },
      { name: "description", content: "Raise and manage SchoolRise support tickets." },
    ],
  }),
  component: () => (
    <RequireModule module="support">
      <SupportPage />
    </RequireModule>
  ),
});

type Upload = { filename: string; contentType: string; dataUrl: string };
type TicketRow = {
  id: string;
  ticket_id: string;
  subject: string;
  category: string;
  priority: string;
  school_id: string | null;
  created_at: string;
  status: string;
};
type UpdateTicketInput = {
  token: string;
  academicYear?: string;
  id: string;
  status?: TicketStatus;
  priority?: TicketPriority;
  assignedTo?: string | null;
  resolutionDetails?: string | null;
};
type CreateTicketInput = {
  token: string;
  academicYear?: string;
  subject: string;
  category: TicketCategory;
  priority: TicketPriority;
  description: string;
  schoolId: string | null;
  className: string | null;
  division: string | null;
  attachments: Upload[];
};
const tokenData = () => ({ token: getAccessToken(), academicYear: getAcademicYear() });
const statusTone = (status: string) =>
  status === "Critical" || status === "Open" || status === "Reopened"
    ? "destructive"
    : status === "Resolved" || status === "Closed"
      ? "secondary"
      : "default";
const priorityTone = (priority: string) =>
  priority === "Critical" ? "destructive" : priority === "High" ? "default" : "secondary";

function SupportPage() {
  const { ready, can, profile } = useAuth();
  const qc = useQueryClient();
  const canRaise = can("support", "raise");
  const canManage = can("support", "manage");
  const [tab, setTab] = useState<"raise" | "mine" | "manage">(
    canRaise ? "raise" : canManage ? "manage" : "mine",
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [priority, setPriority] = useState("");
  const isListTab = tab === "mine" || tab === "manage";
  const listQ = useQuery({
    queryKey: ["support-tickets", tab, page, search, status, category, priority],
    enabled: ready && isListTab,
    queryFn: () =>
      listSupportTickets({
        data: {
          ...tokenData(),
          page,
          pageSize: 15,
          search: search || undefined,
          status: (status || undefined) as TicketStatus | undefined,
          category: (category || undefined) as TicketCategory | undefined,
          priority: (priority || undefined) as TicketPriority | undefined,
        },
      }),
  });
  const summaryQ = useQuery({
    queryKey: ["support-summary"],
    enabled: ready && (can("support", "view") || canManage),
    queryFn: () => getSupportSummary({ data: tokenData() }),
  });
  const detailQ = useQuery({
    queryKey: ["support-ticket", selectedId],
    enabled: ready && !!selectedId,
    queryFn: () => getSupportTicket({ data: { ...tokenData(), id: selectedId! } }),
  });
  const schoolsQ = useQuery({
    queryKey: ["support-schools"],
    enabled: ready && (canRaise || canManage || can("support", "view")),
    queryFn: () => listSupportSchools({ data: tokenData() }),
    staleTime: 300000,
  });
  const createM = useMutation({
    mutationFn: (payload: CreateTicketInput) => createSupportTicket({ data: payload }),
    onSuccess: (row) => {
      toast.success(`Ticket ${row.ticket_id} submitted`);
      setSelectedId(row.id);
      setTab("mine");
      qc.invalidateQueries({ queryKey: ["support-tickets"] });
      qc.invalidateQueries({ queryKey: ["support-summary"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const replyM = useMutation({
    mutationFn: (payload: { id: string; message: string; internal: boolean }) =>
      replySupportTicket({ data: { ...tokenData(), ...payload } }),
    onSuccess: () => {
      toast.success("Reply saved");
      qc.invalidateQueries({ queryKey: ["support-ticket", selectedId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const updateM = useMutation({
    mutationFn: (payload: UpdateTicketInput) => updateSupportTicket({ data: payload }),
    onSuccess: () => {
      toast.success("Ticket updated");
      qc.invalidateQueries({ queryKey: ["support-ticket", selectedId] });
      qc.invalidateQueries({ queryKey: ["support-tickets"] });
      qc.invalidateQueries({ queryKey: ["support-summary"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const selected = detailQ.data;
  if (!ready) return null;
  return (
    <main className="mx-auto w-full max-w-7xl space-y-5 px-3 py-6 sm:px-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-primary to-primary-glow text-primary-foreground shadow-elegant">
            <LifeBuoy />
          </div>
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight">Help &amp; Support</h1>
            <p className="text-sm text-muted-foreground">
              Raise issues, follow progress, and keep every support conversation documented.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            qc.invalidateQueries({ queryKey: ["support-tickets"] });
            qc.invalidateQueries({ queryKey: ["support-summary"] });
          }}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </header>
      {summaryQ.data && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            ["Total Tickets", summaryQ.data.total],
            ["Open", summaryQ.data.open],
            ["In Progress", summaryQ.data.inProgress],
            ["Pending", summaryQ.data.pending],
            ["Resolved", summaryQ.data.resolved],
          ].map(([label, value]) => (
            <Card key={String(label)} className="p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {label}
              </p>
              <p className="mt-1 text-2xl font-bold text-primary">{value}</p>
            </Card>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2 border-b pb-2">
        {canRaise && (
          <TabButton active={tab === "raise"} onClick={() => setTab("raise")}>
            Raise a Ticket
          </TabButton>
        )}
        {(can("support", "view") || canManage) && (
          <TabButton
            active={tab === "mine"}
            onClick={() => {
              setTab("mine");
              setPage(1);
            }}
          >
            My Tickets
          </TabButton>
        )}
        {canManage && (
          <TabButton
            active={tab === "manage"}
            onClick={() => {
              setTab("manage");
              setPage(1);
            }}
          >
            Ticket Management
          </TabButton>
        )}
      </div>
      {tab === "raise" && canRaise && (
        <RaiseTicketForm
          schools={schoolsQ.data ?? []}
          onSubmit={(payload) => createM.mutate({ ...tokenData(), ...payload })}
          pending={createM.isPending}
        />
      )}
      {isListTab && (
        <>
          <Card className="p-4">
            <div className="grid gap-3 md:grid-cols-4">
              <Input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search ticket ID or subject"
              />
              <select
                className="h-10 rounded-md border bg-background px-3 text-sm"
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">All statuses</option>
                {statuses.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
              <select
                className="h-10 rounded-md border bg-background px-3 text-sm"
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">All categories</option>
                {categories.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
              <select
                className="h-10 rounded-md border bg-background px-3 text-sm"
                value={priority}
                onChange={(e) => {
                  setPriority(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">All priorities</option>
                {["Low", "Medium", "High", "Critical"].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </div>
          </Card>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    {[
                      "Ticket ID",
                      "Subject",
                      "Category",
                      "Priority",
                      "School/Centre",
                      "Created",
                      "Status",
                      "Action",
                    ].map((h) => (
                      <th className="whitespace-nowrap px-3 py-3 text-left font-semibold" key={h}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {listQ.isLoading && (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-muted-foreground">
                        Loading tickets…
                      </td>
                    </tr>
                  )}
                  {!listQ.isLoading && !listQ.data?.rows.length && (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-muted-foreground">
                        No tickets found.
                      </td>
                    </tr>
                  )}
                  {(listQ.data?.rows as TicketRow[] | undefined)?.map((row) => (
                    <tr className="border-t" key={row.id}>
                      <td className="px-3 py-3 font-mono text-xs">{row.ticket_id}</td>
                      <td className="max-w-64 px-3 py-3 font-medium">{row.subject}</td>
                      <td className="px-3 py-3">{row.category}</td>
                      <td className="px-3 py-3">
                        <Badge variant={priorityTone(row.priority)}>{row.priority}</Badge>
                      </td>
                      <td className="px-3 py-3">
                        {row.school_id
                          ? (schoolsQ.data?.find((s) => s.id === row.school_id)?.name ??
                            "Assigned school")
                          : "General"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-xs text-muted-foreground">
                        {new Date(row.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-3 py-3">
                        <Badge variant={statusTone(row.status)}>{row.status}</Badge>
                      </td>
                      <td className="px-3 py-3">
                        <Button size="sm" variant="outline" onClick={() => setSelectedId(row.id)}>
                          View Details
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {listQ.data && (
              <div className="flex items-center justify-between border-t p-3 text-sm">
                <span>{listQ.data.count} ticket(s)</span>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page <= 1}
                    onClick={() => setPage((v) => v - 1)}
                  >
                    Previous
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page * 15 >= listQ.data.count}
                    onClick={() => setPage((v) => v + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </>
      )}
      {selected && (
        <TicketDetails
          data={selected}
          schools={schoolsQ.data ?? []}
          canManage={canManage}
          onReply={(message, internal) =>
            replyM.mutate({ id: selected.ticket.id, message, internal })
          }
          onUpdate={(patch) => updateM.mutate({ ...tokenData(), id: selected.ticket.id, ...patch })}
          pending={replyM.isPending || updateM.isPending}
          onClose={() => setSelectedId(null)}
        />
      )}
      {profile?.role !== "admin" && !canRaise && !can("support", "view") && (
        <Card className="p-8 text-center text-muted-foreground">
          Support permissions have not been granted to this account.
        </Card>
      )}
    </main>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button variant={active ? "default" : "ghost"} onClick={onClick}>
      {children}
    </Button>
  );
}
function RaiseTicketForm({
  schools,
  onSubmit,
  pending,
}: {
  schools: { id: string; name: string }[];
  onSubmit: (payload: {
    subject: string;
    category: TicketCategory;
    priority: TicketPriority;
    description: string;
    schoolId: string | null;
    className: string | null;
    division: string | null;
    attachments: Upload[];
  }) => void;
  pending: boolean;
}) {
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState<TicketCategory>("Technical Issue");
  const [priority, setPriority] = useState<TicketPriority>("Medium");
  const [description, setDescription] = useState("");
  const [schoolId, setSchoolId] = useState("none");
  const [className, setClassName] = useState("");
  const [division, setDivision] = useState("");
  const [files, setFiles] = useState<Upload[]>([]);
  const rosterQ = useQuery({
    queryKey: ["support-roster", schoolId],
    enabled: schoolId !== "none",
    queryFn: () => listSupportRoster({ data: { ...tokenData(), schoolId } }),
  });
  const addFiles = async (list: FileList | null) => {
    if (!list) return;
    const next: Upload[] = [];
    for (const file of [...list].slice(0, 5)) {
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`${file.name} is larger than 10 MB.`);
        continue;
      }
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      next.push({
        filename: file.name,
        contentType: file.type || "application/octet-stream",
        dataUrl,
      });
    }
    setFiles(next);
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || description.trim().length < 10) {
      toast.error("Enter a subject and at least 10 characters of detail.");
      return;
    }
    onSubmit({
      subject: subject.trim(),
      category,
      priority,
      description: description.trim(),
      schoolId: schoolId === "none" ? null : schoolId,
      className: className || null,
      division: division || null,
      attachments: files,
    });
  };
  return (
    <Card className="p-5 sm:p-7">
      <div className="mb-5">
        <h2 className="font-display text-2xl font-bold">Raise a Ticket</h2>
        <p className="text-sm text-muted-foreground">
          Tell the support team what happened. Your name, role, and creation time are captured
          automatically.
        </p>
      </div>
      <form className="grid gap-4" onSubmit={submit}>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Subject" required>
            <Input
              value={subject}
              maxLength={240}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Short description of the issue"
            />
          </Field>
          <Field label="Category" required>
            <select
              className="h-10 rounded-md border bg-background px-3 text-sm"
              value={category}
              onChange={(e) => setCategory(e.target.value as TicketCategory)}
            >
              {categories.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </Field>
          <Field label="Priority">
            <select
              className="h-10 rounded-md border bg-background px-3 text-sm"
              value={priority}
              onChange={(e) => setPriority(e.target.value as TicketPriority)}
            >
              {["Low", "Medium", "High", "Critical"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </Field>
          <Field label="School / Centre (optional)">
            <select
              className="h-10 rounded-md border bg-background px-3 text-sm"
              value={schoolId}
              onChange={(e) => {
                setSchoolId(e.target.value);
                setClassName("");
                setDivision("");
              }}
            >
              <option value="none">General / no school</option>
              {schools.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          {schoolId !== "none" && (
            <Field label="Class / Division (optional)">
              <div className="grid grid-cols-2 gap-2">
                <select
                  className="h-10 rounded-md border bg-background px-3 text-sm"
                  value={className}
                  onChange={(e) => {
                    setClassName(e.target.value);
                    setDivision("");
                  }}
                >
                  <option value="">Class</option>
                  {[...new Set((rosterQ.data ?? []).map((r) => r.class))].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
                <select
                  className="h-10 rounded-md border bg-background px-3 text-sm"
                  value={division}
                  onChange={(e) => setDivision(e.target.value)}
                >
                  <option value="">Division</option>
                  {(rosterQ.data ?? [])
                    .filter((r) => r.class === className)
                    .map((r) => (
                      <option key={`${r.class}-${r.division}`}>{r.division || "General"}</option>
                    ))}
                </select>
              </div>
            </Field>
          )}
        </div>
        <Field label="Description" required>
          <Textarea
            rows={7}
            value={description}
            maxLength={20000}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the problem, steps to reproduce it, and what outcome you expected…"
          />
        </Field>
        <Field label="Attachments (optional)">
          <Input
            type="file"
            multiple
            accept="image/*,.pdf,.xlsx,.xls,.csv,.txt"
            onChange={(e) => void addFiles(e.target.files)}
          />
          <p className="text-xs text-muted-foreground">
            Up to 5 files, 10 MB each.{" "}
            {files.length ? `${files.length} selected.` : "Screenshots, PDFs, or supporting files."}
          </p>
        </Field>
        <div className="flex justify-end">
          <Button type="submit" disabled={pending} className="gap-2">
            <Send className="h-4 w-4" />
            {pending ? "Submitting…" : "Submit Ticket"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label>
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      {children}
    </div>
  );
}
function TicketDetails({
  data,
  schools,
  canManage,
  onReply,
  onUpdate,
  pending,
  onClose,
}: {
  data: any;
  schools: { id: string; name: string }[];
  canManage: boolean;
  onReply: (message: string, internal: boolean) => void;
  onUpdate: (patch: {
    status?: TicketStatus;
    priority?: TicketPriority;
    assignedTo?: string | null;
    resolutionDetails?: string | null;
  }) => void;
  pending: boolean;
  onClose: () => void;
}) {
  const [message, setMessage] = useState("");
  const [internal, setInternal] = useState(false);
  const ticket = data.ticket;
  const school = schools.find((s) => s.id === ticket.school_id);
  return (
    <Card className="border-primary/30 p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs text-muted-foreground">{ticket.ticket_id}</p>
          <h2 className="font-display text-2xl font-bold">{ticket.subject}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {ticket.creator_name} · {ticket.creator_designation} ·{" "}
            {new Date(ticket.created_at).toLocaleString()}
          </p>
        </div>
        <Button variant="outline" onClick={onClose}>
          Close details
        </Button>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Badge variant={statusTone(ticket.status)}>{ticket.status}</Badge>
        <Badge variant={priorityTone(ticket.priority)}>{ticket.priority}</Badge>
        <Badge variant="outline">{ticket.category}</Badge>
        {school && <Badge variant="outline">{school.name}</Badge>}
      </div>
      <p className="mt-5 whitespace-pre-wrap rounded-xl bg-muted/30 p-4 text-sm">
        {ticket.description}
      </p>
      {canManage && (
        <div className="mt-5 grid gap-3 rounded-xl border border-dashed p-4 md:grid-cols-3">
          <Field label="Status">
            <select
              className="h-10 rounded-md border bg-background px-3 text-sm"
              value={ticket.status}
              onChange={(e) => onUpdate({ status: e.target.value as TicketStatus })}
            >
              {statuses.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </Field>
          <Field label="Priority">
            <select
              className="h-10 rounded-md border bg-background px-3 text-sm"
              value={ticket.priority}
              onChange={(e) => onUpdate({ priority: e.target.value as TicketPriority })}
            >
              {["Low", "Medium", "High", "Critical"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </Field>
          <Field label="Resolution details">
            <Input
              placeholder="Optional resolution note"
              onBlur={(e) => e.target.value && onUpdate({ resolutionDetails: e.target.value })}
            />
          </Field>
        </div>
      )}
      <div className="mt-6 space-y-3">
        <h3 className="flex items-center gap-2 font-semibold">
          <MessageSquare className="h-4 w-4" />
          Conversation &amp; activity
        </h3>
        {data.replies.map((reply: any) => (
          <div
            className={`rounded-xl border p-3 text-sm ${reply.visibility === "internal" ? "border-warning/40 bg-warning/5" : "bg-card"}`}
            key={reply.id}
          >
            <div className="flex justify-between gap-3 text-xs text-muted-foreground">
              <span>
                {reply.sender_name} {reply.visibility === "internal" ? "· Internal note" : ""}
              </span>
              <span>{new Date(reply.created_at).toLocaleString()}</span>
            </div>
            <p className="mt-2 whitespace-pre-wrap">{reply.message}</p>
          </div>
        ))}
        {!data.replies.length && <p className="text-sm text-muted-foreground">No replies yet.</p>}
      </div>
      <div className="mt-5 grid gap-2">
        <Textarea
          rows={4}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={
            internal
              ? "Add an internal note for support staff…"
              : "Write a reply to the ticket creator…"
          }
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={internal}
              disabled={!canManage}
              onChange={(e) => setInternal(e.target.checked)}
            />{" "}
            Internal note
          </label>
          <Button
            disabled={pending || !message.trim()}
            onClick={() => {
              onReply(message.trim(), internal);
              setMessage("");
            }}
          >
            <Send className="mr-2 h-4 w-4" />
            Send
          </Button>
        </div>
      </div>
      <div className="mt-6 border-t pt-4">
        <h3 className="mb-2 text-sm font-semibold">Status history</h3>
        <div className="space-y-2">
          {data.activity.map((event: any) => (
            <div className="text-xs text-muted-foreground" key={event.id}>
              <span className="font-medium text-foreground">{event.actor_name}</span> ·{" "}
              {event.action}
              {event.new_value ? ` → ${event.new_value}` : ""} ·{" "}
              {new Date(event.created_at).toLocaleString()}
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
