import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  CalendarCheck,
  CheckCircle2,
  Clock,
  Download,
  Plus,
  School as SchoolIcon,
  Search,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SheetImportDialog,
  pick,
  type ParsedBase,
} from "@/components/master/sheet-import-dialog";
import { SESSION_SAMPLE } from "@/lib/sample-templates";
import { exportRowsToExcel } from "@/lib/exam-export";
import {
  DIVISIONS,
  UNITS,
  createSessions,
  fetchDivisionSessions,
  fetchSessions,
  fetchUnitCounts,
  normalizeClass,
  removeSessions,
  setSessionStatus,
  unitProgress,
  type DivisionSession,
  type NewSession,
  type SessionStatus,
  type Unit,
} from "@/lib/sessions";

const DEFAULT_CLASSES = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"];

export const Route = createFileRoute("/session-status")({
  head: () => ({
    meta: [
      { title: "Session Status — SchoolRise" },
      {
        name: "description",
        content:
          "Track and update training session progress by school, unit, class and division.",
      },
      { property: "og:title", content: "Session Status — SchoolRise" },
      {
        property: "og:description",
        content: "Track and update training session progress across schools and units.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SessionStatusPage,
});

function StatusBadge({ status }: { status: SessionStatus }) {
  return status === "complete" ? (
    <Badge className="gap-1 border-0 bg-success/15 text-success hover:bg-success/25">
      <CheckCircle2 className="h-3 w-3" /> Complete
    </Badge>
  ) : (
    <Badge className="gap-1 border-0 bg-warning/15 text-warning hover:bg-warning/25">
      <Clock className="h-3 w-3" /> Pending
    </Badge>
  );
}

function StatusSelect({
  value,
  onChange,
  disabled,
}: {
  value: SessionStatus;
  onChange: (v: SessionStatus) => void;
  disabled?: boolean;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as SessionStatus)} disabled={disabled}>
      <SelectTrigger
        className={`h-9 w-[140px] font-medium ${
          value === "complete"
            ? "border-success/40 bg-success/10 text-success"
            : "border-warning/40 bg-warning/10 text-warning"
        }`}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="pending">🟠 Pending</SelectItem>
        <SelectItem value="complete">🟢 Complete</SelectItem>
      </SelectContent>
    </Select>
  );
}

function SessionStatusPage() {
  const qc = useQueryClient();
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [unit, setUnit] = useState<Unit | null>(null);
  const [klass, setKlass] = useState<string | null>(null);
  const [division, setDivision] = useState<string>("A");
  const [statusFilter, setStatusFilter] = useState<"all" | SessionStatus>("all");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const schoolsQuery = useQuery({
    queryKey: ["schools"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("schools")
        .select("id, name, code, location")
        .order("code");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    staleTime: 5 * 60_000,
  });

  const unitCounts = useQuery({
    queryKey: ["session-unit-counts", schoolId],
    queryFn: () => fetchUnitCounts(schoolId!),
    enabled: !!schoolId,
    staleTime: 60_000,
  });

  // Class options come from the master list of this school+unit only.
  const classesQuery = useQuery({
    queryKey: ["session-classes", schoolId, unit],
    queryFn: () => fetchSessions(schoolId!, { unit: unit! }),
    enabled: !!schoolId && !!unit,
    staleTime: 60_000,
  });

  const sessionsQuery = useQuery({
    queryKey: ["division-sessions", schoolId, unit, klass, division],
    queryFn: () =>
      fetchDivisionSessions({
        schoolId: schoolId!,
        unit: unit!,
        klass: klass!,
        division,
      }),
    enabled: !!schoolId && !!unit && !!klass,
    staleTime: 30_000,
  });

  const school = schoolsQuery.data?.find((s) => s.id === schoolId) ?? null;

  const classOptions = useMemo(() => {
    const found = new Set((classesQuery.data ?? []).map((r) => r.class).filter(Boolean));
    return [...new Set([...found, ...DEFAULT_CLASSES])].sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true }),
    );
  }, [classesQuery.data]);

  const rows = useMemo(() => sessionsQuery.data ?? [], [sessionsQuery.data]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (statusFilter === "all" || r.status === statusFilter) &&
        (!needle ||
          r.session_name.toLowerCase().includes(needle) ||
          (r.topic ?? "").toLowerCase().includes(needle)),
    );
  }, [rows, statusFilter, q]);

  const summary = unitProgress(rows);

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ["division-sessions", schoolId, unit, klass] });
    await qc.invalidateQueries({ queryKey: ["session-classes", schoolId, unit] });
    await qc.invalidateQueries({ queryKey: ["session-unit-counts", schoolId] });
  };

  const setStatus = useMutation({
    mutationFn: ({ ids, status }: { ids: string[]; status: SessionStatus }) =>
      setSessionStatus({
        schoolId: schoolId!,
        unit: unit!,
        klass: klass!,
        division,
        ids,
        status,
      }),
    onSuccess: (_d, v) => {
      toast.success(
        v.ids.length > 1
          ? `${v.ids.length} sessions updated for Division ${division}`
          : `Status saved for Division ${division}`,
      );
      setSelected([]);
      void refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: (ids: string[]) => removeSessions(ids),
    onSuccess: () => {
      toast.success("Session(s) deleted");
      setSelected([]);
      void refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /* ---------------------------------------------------------------- steps */

  if (!schoolId) {
    return (
      <Shell title="Session Status" subtitle="Choose a school to begin">
        {schoolsQuery.isLoading ? (
          <GridSkeleton />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(schoolsQuery.data ?? []).map((s, i) => (
              <motion.button
                key={s.id}
                type="button"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                onClick={() => setSchoolId(s.id)}
                className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card p-4 text-left shadow-soft transition hover:border-primary/50 hover:shadow-elegant"
              >
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <SchoolIcon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="truncate font-semibold">{s.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {s.code} · {s.location}
                  </p>
                </div>
              </motion.button>
            ))}
            {schoolsQuery.data?.length === 0 && (
              <p className="text-sm text-muted-foreground">Add a school first from the dashboard.</p>
            )}
          </div>
        )}
      </Shell>
    );
  }

  if (!unit) {
    return (
      <Shell
        title={school?.name ?? "Select unit"}
        subtitle="Choose a unit"
        onBack={() => setSchoolId(null)}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {UNITS.map((u, i) => (
            <motion.button
              key={u}
              type="button"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              onClick={() => {
                setUnit(u);
                setKlass(null);
                setSelected([]);
              }}
              className="rounded-2xl border border-border/60 bg-card p-5 text-left shadow-soft transition hover:border-primary/50 hover:shadow-elegant"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-display text-lg font-bold">{u}</span>
                <CalendarCheck className="h-5 w-5 text-primary" />
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                {unitCounts.isLoading ? (
                  <Skeleton className="h-5 w-24 rounded-full" />
                ) : (
                  <Badge variant="secondary">{unitCounts.data?.[u] ?? 0} sessions</Badge>
                )}
              </div>
            </motion.button>
          ))}
        </div>
      </Shell>
    );
  }

  if (!klass) {
    return (
      <Shell
        title={`${school?.name ?? "School"} · ${unit}`}
        subtitle="Choose a class"
        onBack={() => setUnit(null)}
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {classOptions.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => {
                setKlass(c);
                setSelected([]);
              }}
              className="rounded-2xl border border-border/60 bg-card p-5 text-center shadow-soft transition hover:border-primary/50 hover:shadow-elegant"
            >
              <p className="font-display text-lg font-bold">Class {c}</p>
            </button>
          ))}
        </div>
      </Shell>
    );
  }

  /* --------------------------------------------------------------- table */

  const allVisibleSelected = visible.length > 0 && visible.every((r) => selected.includes(r.id));

  return (
    <Shell
      title={`${school?.name ?? "School"} · ${unit}`}
      subtitle={`Class ${klass} · Division ${division}`}
      onBack={() => setKlass(null)}
    >
      <Card className="space-y-3 p-4 shadow-soft">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Division
          </span>
          {DIVISIONS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => {
                setDivision(d);
                setSelected([]);
              }}
              className={`h-10 w-10 rounded-xl border text-sm font-bold transition ${
                division === d
                  ? "border-primary bg-primary text-primary-foreground shadow-elegant"
                  : "border-border hover:bg-accent"
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      </Card>

      <Card className="p-4 shadow-soft">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Total sessions</p>
            <p className="font-display text-2xl font-bold">{summary.total}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Complete</p>
            <p className="font-display text-2xl font-bold text-success">{summary.complete}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Pending</p>
            <p className="font-display text-2xl font-bold text-warning">{summary.pending}</p>
          </div>
        </div>
        <div className="mt-4">
          <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Class {klass} · Division {division} progress
            </span>
            <span>{summary.percent}%</span>
          </div>
          <Progress value={summary.percent} className="h-2.5" />
        </div>
      </Card>

      <Card className="space-y-3 p-4 shadow-soft">
        <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="relative min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search session or topic..."
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
              <SelectTrigger className="h-9 w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="pending">🟠 Pending</SelectItem>
                <SelectItem value="complete">🟢 Complete</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" /> Add Session
            </Button>
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              <Upload className="h-4 w-4" /> Import Excel
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                exportRowsToExcel(
                  `sessions-${unit}-class-${klass}-div-${division}`,
                  visible.map((r) => ({
                    "Session Name": r.session_name,
                    Class: r.class,
                    Topic: r.topic,
                    Division: division,
                    Status: r.status === "complete" ? "Complete" : "Pending",
                  })),
                )
              }
            >
              <Download className="h-4 w-4" /> Export
            </Button>
          </div>
        </div>

        {selected.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-muted/40 p-2">
            <span className="text-sm font-medium">
              {selected.length} selected · Division {division}
            </span>
            <Button
              size="sm"
              className="bg-success text-success-foreground hover:bg-success/90"
              disabled={setStatus.isPending}
              onClick={() => setStatus.mutate({ ids: selected, status: "complete" })}
            >
              Mark Complete
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={setStatus.isPending}
              onClick={() => setStatus.mutate({ ids: selected, status: "pending" })}
            >
              Mark Pending
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive"
              disabled={del.isPending}
              onClick={() => del.mutate(selected)}
            >
              Delete
            </Button>
          </div>
        )}
      </Card>

      {sessionsQuery.isLoading ? (
        <GridSkeleton />
      ) : visible.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground shadow-soft">
          No sessions yet for Class {klass}. Add one or import a sheet.
        </Card>
      ) : (
        <>
          {/* Desktop table */}
          <Card className="hidden overflow-hidden p-0 shadow-soft md:block">
            <div className="max-h-[65vh] overflow-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="sticky top-0 z-10 w-10 bg-muted/95 px-3 py-2.5 backdrop-blur">
                      <Checkbox
                        aria-label="Select all"
                        checked={allVisibleSelected}
                        onCheckedChange={(c) => setSelected(c ? visible.map((r) => r.id) : [])}
                      />
                    </th>
                    {["Session Name", "Class", "Topic", "Status"].map((h) => (
                      <th
                        key={h}
                        className="sticky top-0 z-10 bg-muted/95 px-3 py-2.5 text-left font-semibold backdrop-blur"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r) => (
                    <tr key={r.id} className="border-t border-border/60 hover:bg-muted/40">
                      <td className="px-3 py-2">
                        <Checkbox
                          aria-label="Select session"
                          checked={selected.includes(r.id)}
                          onCheckedChange={(c) =>
                            setSelected((s) => (c ? [...s, r.id] : s.filter((x) => x !== r.id)))
                          }
                        />
                      </td>
                      <td className="px-3 py-2 font-medium">{r.session_name}</td>
                      <td className="px-3 py-2">{r.class}</td>
                      <td className="px-3 py-2 text-muted-foreground">{r.topic}</td>
                      <td className="px-3 py-2">
                        <StatusSelect
                          value={r.status}
                          disabled={setStatus.isPending}
                          onChange={(status) => setStatus.mutate({ ids: [r.id], status })}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            {visible.map((r: DivisionSession) => (
              <Card key={r.id} className="space-y-3 p-4 shadow-soft">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{r.session_name}</p>
                    <p className="text-xs text-muted-foreground">
                      Class {r.class || "—"} · Division {division}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">{r.topic}</p>
                  </div>
                  <StatusBadge status={r.status} />
                </div>
                <div className="flex gap-2">
                  <Button
                    size="lg"
                    className="h-11 flex-1"
                    variant={r.status === "complete" ? "outline" : "default"}
                    disabled={setStatus.isPending}
                    onClick={() =>
                      setStatus.mutate({
                        ids: [r.id],
                        status: r.status === "complete" ? "pending" : "complete",
                      })
                    }
                  >
                    {r.status === "complete" ? "Mark Pending" : "Mark Complete"}
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      <AddSessionDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        classOptions={classOptions}
        defaultClass={klass}
        onSave={async (row) => {
          await createSessions([{ ...row, school_id: schoolId, unit }]);
          await refresh();
        }}
      />

      <SheetImportDialog<ParsedSession>
        open={importOpen}
        onOpenChange={setImportOpen}
        title={`Import sessions — ${unit}`}
        description="Session Name, Class and Topic are imported into this school and unit. Sessions apply to every division of the class; status starts as Pending."
        sample={SESSION_SAMPLE}
        parse={(rows2) =>
          rows2.map((raw, i) => {
            const name = pick(raw, "Session Name", "Session", "Name");
            const errors: string[] = [];
            if (!name) errors.push("Session Name is required");
            return {
              _row: i + 2,
              errors,
              session_name: name,
              class: normalizeClass(pick(raw, "Class", "Grade")),
              topic: pick(raw, "Topic"),
            };
          })
        }
        columns={[
          { label: "Session Name", get: (r) => r.session_name },
          { label: "Class", get: (r) => r.class },
          { label: "Topic", get: (r) => r.topic },
        ]}
        commit={async (valid) => {
          const chunk = 500;
          for (let i = 0; i < valid.length; i += chunk) {
            await createSessions(
              valid.slice(i, i + chunk).map((v) => ({
                school_id: schoolId,
                unit,
                session_name: v.session_name,
                class: v.class,
                topic: v.topic,
              })),
            );
          }
          await refresh();
          return `Imported ${valid.length} session(s) into ${unit}.`;
        }}
      />
    </Shell>
  );
}

type ParsedSession = ParsedBase & {
  session_name: string;
  class: string;
  topic: string;
};

function AddSessionDialog({
  open,
  onOpenChange,
  classOptions,
  defaultClass,
  onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  classOptions: string[];
  defaultClass: string | null;
  onSave: (row: Omit<NewSession, "school_id" | "unit">) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [topic, setTopic] = useState("");
  const [klass, setKlass] = useState(defaultClass ?? "");

  const save = useMutation({
    mutationFn: () =>
      onSave({ session_name: name.trim(), class: klass, topic: topic.trim() }),
    onSuccess: () => {
      toast.success("Session added for every division of this class");
      setName("");
      setTopic("");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add session</DialogTitle>
          <DialogDescription>
            Saved for the selected school, unit and class. It becomes available to every division
            (A–F) of that class.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="s-name">Session Name</Label>
            <Input id="s-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Class</Label>
            <Select value={klass} onValueChange={setKlass}>
              <SelectTrigger>
                <SelectValue placeholder="Select class" />
              </SelectTrigger>
              <SelectContent>
                {classOptions.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="s-topic">Topic</Label>
            <Input id="s-topic" value={topic} onChange={(e) => setTopic(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => save.mutate()}
            disabled={!name.trim() || !klass || save.isPending}
          >
            {save.isPending ? "Saving..." : "Save Session"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Shell({
  title,
  subtitle,
  onBack,
  children,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-7xl space-y-4 px-3 py-5 sm:px-6">
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3">
        {onBack ? (
          <Button variant="outline" size="icon" onClick={onBack} aria-label="Back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        ) : (
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
            <CalendarCheck className="h-5 w-5" />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="truncate font-display text-xl font-bold sm:text-2xl">{title}</h1>
          {subtitle && <p className="truncate text-sm text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-24 rounded-2xl" />
      ))}
    </div>
  );
}
