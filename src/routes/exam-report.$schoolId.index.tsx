import { useMemo, useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  BarChart3,
  CalendarCheck,
  ClipboardCheck,
  GraduationCap,
  School as SchoolIcon,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, Tooltip, XAxis, YAxis } from "recharts";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatCard } from "@/components/exam/stat-card";
import { ReportTable } from "@/components/exam/report-table";
import { ChartCard } from "./exam-report.index";
import {
  CLASS_OPTIONS,
  DIVISION_OPTIONS,
  STATUS_COLORS,
  avg,
  buildClassReports,
  fetchExamData,
  type PerfStatus,
} from "@/lib/exam";

export const Route = createFileRoute("/exam-report/$schoolId/")({
  head: () => ({
    meta: [
      { title: "School Exam Dashboard — SchoolRise" },
      {
        name: "description",
        content: "Class-wise attendance, ICA, IMF and FCA performance for a single school.",
      },
      { property: "og:title", content: "School Exam Dashboard — SchoolRise" },
      {
        property: "og:description",
        content: "Class-wise attendance, ICA, IMF and FCA performance for a single school.",
      },
    ],
  }),
  component: SchoolExamDashboard,
});

function SchoolExamDashboard() {
  const { schoolId } = Route.useParams();
  const navigate = useNavigate();
  const [cls, setCls] = useState("all");
  const [division, setDivision] = useState("all");

  const { data, isLoading } = useQuery({ queryKey: ["exam-data"], queryFn: fetchExamData });

  const school = data?.schools.find((s) => s.id === schoolId);
  const students = useMemo(
    () => (data?.students ?? []).filter((s) => s.school_id === schoolId),
    [data, schoolId],
  );
  const classes = useMemo(() => buildClassReports(students), [students]);

  const stats = useMemo(() => {
    const ranked = [...classes].sort((a, b) => b.performance - a.performance);
    return {
      attendance: avg(students.map((s) => s.attendance_pct)),
      ica: avg(students.filter((s) => s.ica != null).map((s) => s.ica as number)),
      imf: avg(students.filter((s) => s.imf != null).map((s) => s.imf as number)),
      fca: avg(students.filter((s) => s.fca != null).map((s) => s.fca as number)),
      best: ranked[0],
      worst: ranked[ranked.length - 1],
    };
  }, [classes, students]);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
        <Skeleton className="h-10 w-64 rounded-lg" />
        <div className="grid gap-4 [&>*]:min-w-0 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-80 rounded-xl" />
      </div>
    );
  }

  if (!school) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="font-display text-2xl font-bold">School not found</h1>
        <Button asChild className="mt-4">
          <Link to="/exam-report">Back to Exam Report</Link>
        </Button>
      </div>
    );
  }

  const tableRows = classes.map((c) => ({
    Class: c.class,
    Division: c.division,
    Students: c.students,
    "Attendance %": c.attendance,
    "ICA Avg": c.ica,
    "IMF Avg": c.imf,
    "FCA Avg": c.fca,
    "Performance %": c.performance,
    Status: c.status,
  }));

  const chartData = classes.map((c) => ({
    name: `${c.class}-${c.division}`,
    ICA: c.ica,
    IMF: c.imf,
    FCA: c.fca,
  }));

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-center gap-3"
      >
        <Button variant="outline" size="icon" asChild>
          <Link to="/exam-report">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="font-display text-3xl font-bold">{school.name}</h1>
          <p className="text-sm text-muted-foreground">
            {school.location} · {school.code}
          </p>
        </div>
      </motion.div>

      <section className="grid gap-4 [&>*]:min-w-0 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={SchoolIcon} label="School" value={school.name} hint={school.code} tone="primary" />
        <StatCard icon={Users} label="Total Students" value={students.length} tone="violet" delay={0.05} />
        <StatCard
          icon={CalendarCheck}
          label="Average Attendance"
          value={`${stats.attendance}%`}
          tone="cyan"
          delay={0.1}
        />
        <StatCard icon={BarChart3} label="ICA Average" value={stats.ica} tone="success" delay={0.15} />
        <StatCard icon={GraduationCap} label="IMF Average" value={stats.imf} tone="sunset" delay={0.2} />
        <StatCard icon={ClipboardCheck} label="FCA Average" value={stats.fca} tone="cyan" delay={0.22} />
        <StatCard
          icon={TrendingUp}
          label="Best Class"
          value={stats.best ? `${stats.best.class}-${stats.best.division}` : "—"}
          hint={stats.best ? `${stats.best.performance}% overall` : "No data yet"}
          tone="success"
          delay={0.25}
        />
        <StatCard
          icon={TrendingDown}
          label="Lowest Class"
          value={stats.worst ? `${stats.worst.class}-${stats.worst.division}` : "—"}
          hint={stats.worst ? `${stats.worst.performance}% overall` : "No data yet"}
          tone="sunset"
          delay={0.3}
        />
      </section>

      <Card className="grid gap-3 border-border/60 p-4 shadow-soft sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div className="space-y-1.5">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Select Class
          </span>
          <Select value={cls} onValueChange={setCls}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Classes</SelectItem>
              {CLASS_OPTIONS.map((c) => (
                <SelectItem key={c} value={c}>
                  Class {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Division
          </span>
          <Select value={division} onValueChange={setDivision}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Divisions</SelectItem>
              {DIVISION_OPTIONS.map((d) => (
                <SelectItem key={d} value={d}>
                  Division {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          className="shadow-elegant"
          onClick={() =>
            navigate({
              to: "/exam-report/$schoolId/students",
              params: { schoolId },
              search: { cls, division },
            })
          }
        >
          Submit
        </Button>
      </Card>

      <ReportTable
        title="Class Performance"
        filename={`${school.name}-class-performance`}
        rows={tableRows}
        renderCell={(col, value) =>
          col === "Status" ? (
            <Badge variant="outline" className={STATUS_COLORS[value as PerfStatus]}>
              {value}
            </Badge>
          ) : (
            value
          )
        }
        onRowClick={(row) =>
          navigate({
            to: "/exam-report/$schoolId/students",
            params: { schoolId },
            search: { cls: String(row.Class), division: String(row.Division) },
          })
        }
      />

      <ChartCard title="Class Performance — ICA vs IMF vs FCA">
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
          <XAxis dataKey="name" fontSize={11} />
          <YAxis fontSize={11} domain={[0, 100]} />
          <Tooltip />
          <Legend />
          <Bar dataKey="ICA" fill="#4F46E5" radius={[6, 6, 0, 0]} />
          <Bar dataKey="IMF" fill="#F59E0B" radius={[6, 6, 0, 0]} />
          <Bar dataKey="FCA" fill="#06B6D4" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ChartCard>
    </div>
  );
}
