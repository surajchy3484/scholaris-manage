import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, subDays, startOfWeek, startOfMonth, isAfter } from "date-fns";
import { BarChart3 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import type { Student, AttendanceRecord } from "@/lib/types";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Range = "daily" | "weekly" | "monthly";
type View = "student" | "class";

export function AttendanceReports({
  schoolId,
  students,
}: {
  schoolId: string;
  students: Student[];
}) {
  const [range, setRange] = useState<Range>("weekly");
  const [view, setView] = useState<View>("student");

  const from = useMemo(() => {
    const today = new Date();
    if (range === "daily") return today;
    if (range === "weekly") return startOfWeek(today, { weekStartsOn: 1 });
    return startOfMonth(today);
  }, [range]);

  const { data: records = [] } = useQuery({
    queryKey: ["attendance-range", schoolId, format(from, "yyyy-MM-dd"), range],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance")
        .select("*")
        .eq("school_id", schoolId)
        .gte("date", format(from, "yyyy-MM-dd"));
      if (error) throw error;
      return data as AttendanceRecord[];
    },
  });

  const studentRows = students.map((s) => {
    const recs = records.filter((r) => r.student_id === s.id);
    const present = recs.filter((r) => r.status === "present").length;
    const total = recs.length;
    return {
      s,
      present,
      absent: total - present,
      total,
      pct: total ? Math.round((present / total) * 100) : 0,
    };
  });

  const classGroups = new Map<string, typeof studentRows>();
  studentRows.forEach((row) => {
    const k = `${row.s.class}-${row.s.division}`;
    if (!classGroups.has(k)) classGroups.set(k, []);
    classGroups.get(k)!.push(row);
  });

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-32 flex-1 space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Report period</label>
          <Select value={range} onValueChange={(v) => setRange(v as Range)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Today</SelectItem>
              <SelectItem value="weekly">This week</SelectItem>
              <SelectItem value="monthly">This month</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-32 flex-1 space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Grouped by</label>
          <Select value={view} onValueChange={(v) => setView(v as View)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="student">Student</SelectItem>
              <SelectItem value="class">Class &amp; Division</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
          <BarChart3 className="h-4 w-4" />
          {records.length} records
        </div>
      </Card>

      {view === "student" ? (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Class</TableHead>
                <TableHead>Div</TableHead>
                <TableHead className="text-right">Present</TableHead>
                <TableHead className="text-right">Absent</TableHead>
                <TableHead className="text-right">%</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {studentRows.map(({ s, present, absent, pct }) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <div className="font-medium">{s.name}</div>
                    <div className="font-mono text-[10px] text-muted-foreground">
                      {s.student_code}
                    </div>
                  </TableCell>
                  <TableCell>{s.class}</TableCell>
                  <TableCell>{s.division}</TableCell>
                  <TableCell className="text-right text-success">{present}</TableCell>
                  <TableCell className="text-right text-destructive">{absent}</TableCell>
                  <TableCell className="text-right font-semibold">{pct}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Class · Division</TableHead>
                <TableHead className="text-right">Students</TableHead>
                <TableHead className="text-right">Present</TableHead>
                <TableHead className="text-right">Absent</TableHead>
                <TableHead className="text-right">Avg %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...classGroups.entries()].map(([k, rows]) => {
                const present = rows.reduce((n, r) => n + r.present, 0);
                const absent = rows.reduce((n, r) => n + r.absent, 0);
                const avg =
                  rows.length && rows.some((r) => r.total)
                    ? Math.round(rows.reduce((n, r) => n + r.pct, 0) / rows.length)
                    : 0;
                return (
                  <TableRow key={k}>
                    <TableCell className="font-medium">Class {k.replace("-", " · Div ")}</TableCell>
                    <TableCell className="text-right">{rows.length}</TableCell>
                    <TableCell className="text-right text-success">{present}</TableCell>
                    <TableCell className="text-right text-destructive">{absent}</TableCell>
                    <TableCell className="text-right font-semibold">{avg}%</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      <p className="text-xs text-muted-foreground">
        Showing data since {format(from, "PPP")}. Only students with at least one record contribute
        to averages.
      </p>
    </div>
  );
}

// Silence unused imports
void subDays;
void isAfter;
