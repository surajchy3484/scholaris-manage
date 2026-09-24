import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, X, CalendarIcon, CheckCheck, XCircle, Save } from "lucide-react";
import { format } from "date-fns";

import { supabase } from "@/integrations/supabase/client";
import type { Student, AttendanceRecord } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

export function AttendancePanel({ schoolId, students }: { schoolId: string; students: Student[] }) {
  const qc = useQueryClient();
  const [cls, setCls] = useState<string>("all");
  const [division, setDivision] = useState<string>("all");
  const [date, setDate] = useState<Date>(new Date());
  const [query, setQuery] = useState("");

  const classes = useMemo(
    () => Array.from(new Set(students.map((s) => s.class))).sort(),
    [students],
  );
  const divisions = useMemo(
    () =>
      Array.from(
        new Set(students.filter((s) => cls === "all" || s.class === cls).map((s) => s.division)),
      ).sort(),
    [students, cls],
  );

  const filtered = students.filter((s) => {
    if (cls !== "all" && s.class !== cls) return false;
    if (division !== "all" && s.division !== division) return false;
    if (query) {
      const q = query.toLowerCase();
      if (
        !s.name.toLowerCase().includes(q) &&
        !s.student_code.toLowerCase().includes(q) &&
        !s.roll_number.toLowerCase().includes(q)
      )
        return false;
    }
    return true;
  });

  const dateStr = format(date, "yyyy-MM-dd");

  const { data: records = [] } = useQuery({
    queryKey: ["attendance", schoolId, dateStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance")
        .select("*")
        .eq("school_id", schoolId)
        .eq("date", dateStr);
      if (error) throw error;
      return data as AttendanceRecord[];
    },
  });

  const [draft, setDraft] = useState<Record<string, "present" | "absent" | undefined>>({});

  // Merge server records + local draft
  const statusOf = (id: string): "present" | "absent" | undefined => {
    if (draft[id] !== undefined) return draft[id];
    return records.find((r) => r.student_id === id)?.status;
  };

  const setStatus = (id: string, s: "present" | "absent") =>
    setDraft((d) => ({ ...d, [id]: d[id] === s ? undefined : s }));

  const markAll = (s: "present" | "absent") => {
    const next: typeof draft = { ...draft };
    filtered.forEach((st) => (next[st.id] = s));
    setDraft(next);
  };

  const save = useMutation({
    mutationFn: async () => {
      const payload = Object.entries(draft)
        .filter(([, v]) => v !== undefined)
        .map(([student_id, status]) => ({
          school_id: schoolId,
          student_id,
          date: dateStr,
          status: status as "present" | "absent",
        }));
      if (!payload.length) throw new Error("Nothing to save");
      const { error } = await supabase
        .from("attendance")
        .upsert(payload, { onConflict: "student_id,date" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Attendance saved");
      setDraft({});
      qc.invalidateQueries({ queryKey: ["attendance", schoolId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const presentCount = filtered.filter((s) => statusOf(s.id) === "present").length;
  const absentCount = filtered.filter((s) => statusOf(s.id) === "absent").length;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card className="flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-32 flex-1 space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Class</label>
          <Select value={cls} onValueChange={setCls}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All classes</SelectItem>
              {classes.map((c) => (
                <SelectItem key={c} value={c}>
                  Class {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-32 flex-1 space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Division</label>
          <Select value={division} onValueChange={setDivision}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All divisions</SelectItem>
              {divisions.map((d) => (
                <SelectItem key={d} value={d}>
                  Div {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-40 flex-1 space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Date</label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full justify-start font-normal">
                <CalendarIcon className="h-4 w-4" />
                {format(date, "PPP")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={date}
                onSelect={(d) => d && setDate(d)}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
        </div>
        <div className="min-w-40 flex-1 space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Search</label>
          <Input
            placeholder="Name, ID, roll..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </Card>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => markAll("present")}>
          <CheckCheck className="h-4 w-4" />
          Mark all present
        </Button>
        <Button variant="outline" size="sm" onClick={() => markAll("absent")}>
          <XCircle className="h-4 w-4" />
          Mark all absent
        </Button>
        <div className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
          <span className="rounded-md bg-success/15 px-2 py-1 text-success">
            Present: {presentCount}
          </span>
          <span className="rounded-md bg-destructive/15 px-2 py-1 text-destructive">
            Absent: {absentCount}
          </span>
          <Button
            size="sm"
            onClick={() => save.mutate()}
            disabled={save.isPending || Object.keys(draft).length === 0}
          >
            <Save className="h-4 w-4" />
            Save attendance
          </Button>
        </div>
      </div>

      {/* Students */}
      {filtered.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          No students match these filters.
        </Card>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {filtered.map((s) => {
            const st = statusOf(s.id);
            return (
              <Card
                key={s.id}
                className={cn(
                  "flex items-center gap-3 p-3 transition-colors",
                  st === "present" && "border-success/50 bg-success/5",
                  st === "absent" && "border-destructive/50 bg-destructive/5",
                )}
              >
                <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full bg-muted">
                  {s.photo_url ? (
                    <img src={s.photo_url} alt={s.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="grid h-full w-full place-items-center text-xs text-muted-foreground">
                      —
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{s.name}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    Class {s.class} · Div {s.division} · Roll {s.roll_number}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button
                    size="icon"
                    variant={st === "present" ? "default" : "outline"}
                    className={cn(
                      "h-9 w-9",
                      st === "present" && "bg-success hover:bg-success/90 text-success-foreground",
                    )}
                    onClick={() => setStatus(s.id, "present")}
                    aria-label="Present"
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant={st === "absent" ? "default" : "outline"}
                    className={cn(
                      "h-9 w-9",
                      st === "absent" &&
                        "bg-destructive hover:bg-destructive/90 text-destructive-foreground",
                    )}
                    onClick={() => setStatus(s.id, "absent")}
                    aria-label="Absent"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
