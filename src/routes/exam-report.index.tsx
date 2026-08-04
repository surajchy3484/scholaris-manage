import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  BarChart3,
  CalendarCheck,
  ClipboardCheck,
  GraduationCap,
  School as SchoolIcon,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

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
import {
  DISTRIBUTION_BUCKETS,
  STATUS_COLORS,
  avg,
  buildSchoolReports,
  distributionBucket,
  fetchExamData,
  round1,
  type PerfStatus,
} from "@/lib/exam";

export const Route = createFileRoute("/exam-report/")({
  head: () => ({
    meta: [
      { title: "Exam Report — Scholaris" },
      {
        name: "description",
        content: "Cross-school exam performance: attendance, ICA, IMF and FCA analytics.",
      },
      { property: "og:title", content: "Exam Report — Scholaris" },
      {
        property: "og:description",
        content: "Cross-school exam performance: attendance, ICA, IMF and FCA analytics.",
      },
    ],
  }),
  component: ExamReportDashboard,
});

const CHART_COLORS = ["#4F46E5", "#06B6D4", "#F59E0B", "#EF4444", "#10B981", "#A855F7"];

function ExamReportDashboard() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState("all");

  const { data, isLoading } = useQuery({ queryKey: ["exam-data"], queryFn: fetchExamData });

  const reports = useMemo(
    () => (data ? buildSchoolReports(data) : []),
    [data],
  );

  const totals = useMemo(() => {
    const ranked = [...reports].filter((r) => r.students > 0).sort((a, b) => b.performance - a.performance);
    return {
      schools: reports.length,
      students: data?.students.length ?? 0,
      attendance: avg((data?.students ?? []).map((s) => s.attendance_pct)),
      ica: avg((data?.students ?? []).filter((s) => s.ica != null).map((s) => s.ica as number)),
      imf: avg((data?.students ?? []).filter((s) => s.imf != null).map((s) => s.imf as number)),
      fca: avg((data?.students ?? []).filter((s) => s.fca != null).map((s) => s.fca as number)),
      best: ranked[0],
      worst: ranked[ranked.length - 1],
    };
  }, [reports, data]);

  const tableRows = reports.map((r) => ({
    "School Name": r.school.name,
    Students: r.students,
    "Avg Attendance %": r.attendance,
    "ICA Avg": r.ica,
    "IMF Avg": r.imf,
    "FCA Avg": r.fca,
    "Overall Performance %": r.performance,
    Status: r.status,
    _id: r.school.id,
  }));

  const distribution = DISTRIBUTION_BUCKETS.map((bucket) => ({
    name: bucket,
    value: (data?.students ?? []).filter((s) => distributionBucket(s.performance) === bucket).length,
  })).filter((d) => d.value > 0);

  const chartData = reports.map((r) => ({
    name: r.school.name.length > 14 ? `${r.school.name.slice(0, 13)}…` : r.school.name,
    students: r.students,
    attendance: r.attendance,
    ICA: r.ica,
    IMF: r.imf,
    FCA: r.fca,
  }));

  if (isLoading) {
    return (
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
        <div className="grid gap-4 [&>*]:min-w-0 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-80 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="font-display text-3xl font-bold">📊 Exam Report</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Attendance, ICA, IMF and FCA performance across every school.
        </p>
      </motion.div>

      <section className="grid gap-4 [&>*]:min-w-0 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={SchoolIcon} label="Total Schools" value={totals.schools} tone="primary" delay={0} />
        <StatCard icon={Users} label="Total Students" value={totals.students} tone="violet" delay={0.05} />
        <StatCard
          icon={CalendarCheck}
          label="Average Attendance"
          value={`${totals.attendance}%`}
          tone="cyan"
          delay={0.1}
        />
        <StatCard icon={BarChart3} label="Overall ICA Average" value={totals.ica} tone="success" delay={0.15} />
        <StatCard icon={GraduationCap} label="Overall IMF Average" value={totals.imf} tone="sunset" delay={0.2} />
        <StatCard icon={ClipboardCheck} label="Overall FCA Average" value={totals.fca} tone="cyan" delay={0.22} />
        <StatCard
          icon={TrendingUp}
          label="Best Performing School"
          value={totals.best?.school.name ?? "—"}
          hint={totals.best ? `${totals.best.performance}% overall` : "No data yet"}
          tone="success"
          delay={0.25}
        />
        <StatCard
          icon={TrendingDown}
          label="Lowest Performing School"
          value={totals.worst?.school.name ?? "—"}
          hint={totals.worst ? `${totals.worst.performance}% overall` : "No data yet"}
          tone="sunset"
          delay={0.3}
        />
        <StatCard
          icon={Sparkles}
          label="Overall Performance"
          value={`${round1((totals.ica + totals.imf + totals.fca) / 3)}%`}
          hint="(ICA + IMF + FCA) / 3"
          tone="violet"
          delay={0.35}
        />
      </section>

      {/* School filter */}
      <Card className="flex flex-col gap-3 border-border/60 p-4 shadow-soft sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1.5">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Select School
          </span>
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Schools</SelectItem>
              {reports.map((r) => (
                <SelectItem key={r.school.id} value={r.school.id}>
                  {r.school.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          className="shadow-elegant"
          disabled={selected === "all"}
          onClick={() =>
            navigate({ to: "/exam-report/$schoolId", params: { schoolId: selected } })
          }
        >
          Submit
        </Button>
      </Card>

      <ReportTable
        title="School Performance"
        filename="school-performance"
        rows={tableRows.map(({ _id, ...rest }) => rest)}
        renderCell={(col, value) =>
          col === "Status" ? (
            <Badge variant="outline" className={STATUS_COLORS[value as PerfStatus]}>
              {value}
            </Badge>
          ) : (
            value
          )
        }
        onRowClick={(row) => {
          const match = reports.find((r) => r.school.name === row["School Name"]);
          if (match) navigate({ to: "/exam-report/$schoolId", params: { schoolId: match.school.id } });
        }}
      />

      <section className="grid gap-6 lg:grid-cols-2">
        <ChartCard title="School-wise Student Count">
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
            <XAxis dataKey="name" fontSize={11} />
            <YAxis fontSize={11} allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="students" name="Students" fill={CHART_COLORS[0]} radius={[6, 6, 0, 0]} />
          </BarChart>
        </ChartCard>

        <ChartCard title="Average Attendance %">
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
            <XAxis dataKey="name" fontSize={11} />
            <YAxis fontSize={11} domain={[0, 100]} />
            <Tooltip />
            <Bar dataKey="attendance" name="Attendance %" fill={CHART_COLORS[1]} radius={[6, 6, 0, 0]} />
          </BarChart>
        </ChartCard>

        <ChartCard title="ICA vs IMF Comparison">
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
            <XAxis dataKey="name" fontSize={11} />
            <YAxis fontSize={11} domain={[0, 100]} />
            <Tooltip />
            <Legend />
            <Bar dataKey="ICA" fill={CHART_COLORS[0]} radius={[6, 6, 0, 0]} />
            <Bar dataKey="IMF" fill={CHART_COLORS[2]} radius={[6, 6, 0, 0]} />
          </BarChart>
        </ChartCard>

        <ChartCard title="Performance Distribution">
          <PieChart>
            <Tooltip />
            <Legend />
            <Pie data={distribution} dataKey="value" nameKey="name" outerRadius={100} label>
              {distribution.map((_, i) => (
                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Pie>
          </PieChart>
        </ChartCard>
      </section>
    </div>
  );
}

export function ChartCard({ title, children }: { title: string; children: React.ReactElement }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="border-border/60 p-5 shadow-soft">
        <h3 className="mb-4 font-display text-lg font-semibold">{title}</h3>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            {children}
          </ResponsiveContainer>
        </div>
      </Card>
    </motion.div>
  );
}
