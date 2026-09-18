import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Download, FileText, Printer, Search } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RequireModule } from "@/components/require-module";
import {
  avg,
  buildClassReports,
  buildSchoolReports,
  fetchExamData,
  performanceStatus,
  type StudentReport,
} from "@/lib/exam";

export const Route = createFileRoute("/overall-report")({
  head: () => ({
    meta: [
      { title: "Overall Report — SchoolRise" },
      { name: "description", content: "School, class, student, assessment and overall performance reports." },
    ],
  }),
  component: () => (
    <RequireModule module="exam_report">
      <OverallReport />
    </RequireModule>
  ),
});

type Mode = "overall" | "school" | "class" | "student" | "assessment";

const modeOptions: { value: Mode; label: string; description: string }[] = [
  { value: "overall", label: "Overall Summary", description: "All-school performance overview" },
  { value: "school", label: "School-wise Report", description: "Compare schools and averages" },
  { value: "class", label: "Class-wise Report", description: "Compare classes and divisions" },
  { value: "student", label: "Individual Student Report", description: "Download the complete marksheet" },
  { value: "assessment", label: "Assessment-wise Report", description: "Compare ICA, MCA and FCA" },
];

function grade(value: number) {
  if (value >= 90) return "A+";
  if (value >= 80) return "A";
  if (value >= 70) return "B+";
  if (value >= 60) return "B";
  if (value >= 50) return "C";
  if (value >= 40) return "D";
  return "E";
}

function escapeHtml(value: unknown) {
  return String(value ?? "—")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function reportShell(title: string, body: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
  @page{size:A4;margin:14mm}body{font-family:Arial,sans-serif;color:#172033;font-size:11px;line-height:1.35}h1{font-size:22px;margin:0 0 3px}h2{font-size:15px;border-bottom:2px solid #173b71;padding-bottom:5px;margin:20px 0 8px;color:#173b71}.brand{display:flex;align-items:center;gap:12px;border-bottom:3px solid #e22f39;padding-bottom:10px}.reap-logo{width:150px;height:58px;object-fit:contain;object-position:left center}.logo{width:58px;height:58px;border:2px solid #173b71;border-radius:50%;display:grid;place-items:center;color:#e22f39;font-size:16px;font-weight:800}.muted{color:#667085}.meta{margin:10px 0 16px}.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:6px 18px}.field{border-bottom:1px solid #d8dee9;padding:5px 0}.field b{display:inline-block;min-width:120px}.summary{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}.stat{border:1px solid #d8dee9;padding:9px;text-align:center}.stat b{display:block;font-size:17px;color:#173b71}table{width:100%;border-collapse:collapse;margin:7px 0 14px}th{background:#173b71;color:white;text-align:left}th,td{border:1px solid #cbd5e1;padding:6px}tr:nth-child(even){background:#f7f9fc}.right{text-align:right}.footer{margin-top:24px;border-top:1px solid #d8dee9;padding-top:10px;color:#667085;font-size:10px}
  </style></head><body><div class="brand"><img class="reap-logo" src="/reap-logo.png" alt="REAP logo"><div><h1>STUDENT PERFORMANCE REPORT</h1><div class="muted">SchoolRise · Student Learning &amp; Performance Management System</div></div></div>${body}<div class="footer">This is a computer-generated report. Academic Year: 2026–27 · REAP / SchoolRise</div></body></html>`;
}

function downloadWord(filename: string, html: string) {
  const blob = new Blob([html], { type: "application/msword" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${filename}.doc`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function downloadPdf(title: string, html: string) {
  const popup = window.open("", "_blank", "width=1000,height=800");
  if (!popup) {
    toast.error("Allow pop-ups to download the PDF.");
    return;
  }
  popup.document.write(html);
  popup.document.close();
  popup.document.title = title;
  popup.focus();
  setTimeout(() => popup.print(), 350);
}

function table(headers: string[], rows: (string | number)[][]) {
  return `<table><thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead><tbody>${rows
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
    .join("")}</tbody></table>`;
}

function OverallReport() {
  const [mode, setMode] = useState<Mode>("overall");
  const [schoolId, setSchoolId] = useState("all");
  const [classKey, setClassKey] = useState("all");
  const [studentId, setStudentId] = useState("");
  const [search, setSearch] = useState("");
  const { data, isLoading, error } = useQuery({ queryKey: ["overall-report-data"], queryFn: fetchExamData });

  const schools = data?.schools ?? [];
  const students = data?.students ?? [];
  const classes = useMemo(
    () => [...new Set(students.map((s) => `${s.class}|${s.division}`))].sort(),
    [students],
  );
  const selectedStudent = students.find((s) => s.id === studentId) ?? students[0];
  const selectedSchool = schools.find((s) => s.id === schoolId);
  const visibleStudents = students.filter((s) => {
    const matchesSchool = schoolId === "all" || s.school_id === schoolId;
    const matchesClass = classKey === "all" || `${s.class}|${s.division}` === classKey;
    const needle = search.trim().toLowerCase();
    const matchesSearch = !needle || [s.name, s.student_code, s.class, s.division, s.school_name].some((v) => String(v).toLowerCase().includes(needle));
    return matchesSchool && matchesClass && matchesSearch;
  });

  const reports = useMemo(() => buildSchoolReports(data ?? { schools: [], students: [] }), [data]);
  const classReports = useMemo(() => buildClassReports(visibleStudents), [visibleStudents]);

  const buildReport = () => {
    const schoolRows = reports.filter((r) => schoolId === "all" || r.school.id === schoolId);
    const all = schoolRows.flatMap((r) => students.filter((s) => s.school_id === r.school.id));
    const base = all.length ? all : visibleStudents;
    const total = base.length;
    const body = (() => {
      if (mode === "student") return studentHtml(selectedStudent);
      if (mode === "school") {
        return `<h2>SCHOOL-WISE REPORT</h2>${table(["School", "Students", "Attendance %", "ICA", "MCA", "FCA", "Overall %", "Grade"], schoolRows.map((r) => [r.school.name, r.students, r.attendance, r.ica, r.mca, r.fca, r.performance, grade(r.performance)]))}`;
      }
      if (mode === "class") {
        return `<h2>CLASS-WISE REPORT</h2>${table(["Class", "Division", "Students", "Attendance %", "ICA", "MCA", "FCA", "Overall %", "Grade"], classReports.map((r) => [r.class, r.division, r.students, r.attendance, r.ica, r.mca, r.fca, r.performance, grade(r.performance)]))}`;
      }
      if (mode === "assessment") {
        return `<h2>ASSESSMENT-WISE REPORT</h2>${table(["Assessment", "Students with Score", "Average Score", "Grade"], (["ICA", "MCA", "FCA"] as const).map((type) => { const values = base.map((s) => s[type.toLowerCase() as "ica" | "mca" | "fca"]).filter((v): v is number => v != null); const value = avg(values); return [type, values.length, value, grade(value)]; }))}`;
      }
      const attendance = avg(base.map((s) => s.attendance_pct));
      const ica = avg(base.filter((s) => s.ica != null).map((s) => s.ica as number));
      const mca = avg(base.filter((s) => s.mca != null).map((s) => s.mca as number));
      const fca = avg(base.filter((s) => s.fca != null).map((s) => s.fca as number));
      const performance = avg(base.map((s) => s.performance));
      return `<h2>OVERALL SUMMARY</h2><div class="summary"><div class="stat"><b>${schools.length}</b>Schools</div><div class="stat"><b>${total}</b>Students</div><div class="stat"><b>${attendance}%</b>Attendance</div><div class="stat"><b>${ica}%</b>ICA Average</div><div class="stat"><b>${performance}%</b>Overall</div></div>${table(["Metric", "Value", "Grade"], [["ICA Average", ica, grade(ica)], ["MCA Average", mca, grade(mca)], ["FCA Average", fca, grade(fca)], ["Overall Performance", performance, grade(performance)]])}`;
    })();
    return reportShell(modeOptions.find((m) => m.value === mode)?.label ?? "Overall Report", body).replace(
      'src="/reap-logo.png"',
      `src="${window.location.origin}/reap-logo.png"`,
    );
  };

  if (isLoading) return <div className="mx-auto max-w-7xl px-4 py-12">Loading reports…</div>;
  if (error) return <div className="mx-auto max-w-7xl px-4 py-12 text-destructive">Unable to load report data. Please check the database connection.</div>;

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
      <header>
        <div className="flex flex-wrap items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-full border-2 border-primary bg-primary/5 text-xs font-extrabold text-destructive">REAP</div>
          <div><h1 className="font-display text-3xl font-bold">Overall Report</h1><p className="text-sm text-muted-foreground">Five report formats with REAP-branded Word and PDF downloads.</p></div>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {modeOptions.map((option) => (
          <button key={option.value} type="button" onClick={() => setMode(option.value)} className={`rounded-xl border p-4 text-left transition ${mode === option.value ? "border-primary bg-primary/10 shadow-soft" : "border-border/60 bg-card hover:border-primary/50"}`}>
            <p className="font-semibold">{option.label}</p><p className="mt-1 text-xs text-muted-foreground">{option.description}</p>
          </button>
        ))}
      </section>

      <Card className="grid gap-3 border-border/60 p-4 shadow-soft lg:grid-cols-[1fr_1fr_1fr_auto_auto]">
        <Select value={schoolId} onValueChange={(value) => { setSchoolId(value); setStudentId(""); }}><SelectTrigger><SelectValue placeholder="All schools" /></SelectTrigger><SelectContent><SelectItem value="all">All schools</SelectItem>{schools.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select>
        <Select value={classKey} onValueChange={setClassKey}><SelectTrigger><SelectValue placeholder="All classes" /></SelectTrigger><SelectContent><SelectItem value="all">All classes</SelectItem>{classes.map((key) => { const [cls, division] = key.split("|"); return <SelectItem key={key} value={key}>Class {cls} · {division}</SelectItem>; })}</SelectContent></Select>
        <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search students..." className="pl-9" /></div>
        <Button variant="outline" onClick={() => downloadWord("schoolrise-report", buildReport())}><FileText className="h-4 w-4" /> Word</Button>
        <Button onClick={() => downloadPdf("SchoolRise Report", buildReport())}><Printer className="h-4 w-4" /> PDF</Button>
      </Card>

      {mode === "student" && <Card className="border-border/60 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Student marksheet</p><p className="font-semibold">{selectedStudent?.name ?? "Select a student"}</p></div><Select value={selectedStudent?.id ?? ""} onValueChange={setStudentId}><SelectTrigger className="w-full sm:w-80"><SelectValue placeholder="Choose student" /></SelectTrigger><SelectContent>{visibleStudents.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} · {s.class} · {s.school_name}</SelectItem>)}</SelectContent></Select></div></Card>}

      <ReportPreview mode={mode} reports={reports} classReports={classReports} students={visibleStudents} selectedSchool={selectedSchool?.name} selectedStudent={selectedStudent} />
    </main>
  );
}

function ReportPreview({ mode, reports, classReports, students, selectedSchool, selectedStudent }: { mode: Mode; reports: ReturnType<typeof buildSchoolReports>; classReports: ReturnType<typeof buildClassReports>; students: StudentReport[]; selectedSchool?: string; selectedStudent?: StudentReport }) {
  if (mode === "student") return <StudentPreview student={selectedStudent} />;
  if (mode === "school") return <PreviewTable title="School-wise Report" headers={["School", "Students", "Attendance", "ICA", "MCA", "FCA", "Overall", "Grade"]} rows={reports.filter((r) => !selectedSchool || r.school.name === selectedSchool).map((r) => [r.school.name, r.students, `${r.attendance}%`, r.ica, r.mca, r.fca, `${r.performance}%`, grade(r.performance)])} />;
  if (mode === "class") return <PreviewTable title="Class-wise Report" headers={["Class", "Division", "Students", "Attendance", "ICA", "MCA", "FCA", "Overall", "Grade"]} rows={classReports.map((r) => [r.class, r.division, r.students, `${r.attendance}%`, r.ica, r.mca, r.fca, `${r.performance}%`, grade(r.performance)])} />;
  if (mode === "assessment") return <PreviewTable title="Assessment-wise Report" headers={["Assessment", "Students", "Average", "Grade"]} rows={(["ica", "mca", "fca"] as const).map((type) => { const values = students.map((s) => s[type]).filter((v): v is number => v != null); const value = avg(values); return [type.toUpperCase(), values.length, `${value}%`, grade(value)]; })} />;
  const performance = avg(students.map((s) => s.performance));
  return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5"><Metric label="Schools" value={new Set(students.map((s) => s.school_id)).size} /><Metric label="Students" value={students.length} /><Metric label="Attendance" value={`${avg(students.map((s) => s.attendance_pct))}%`} /><Metric label="Overall" value={`${performance}%`} /><Metric label="Grade" value={grade(performance)} /></div>;
}

function PreviewTable({ title, headers, rows }: { title: string; headers: string[]; rows: (string | number)[][] }) { return <Card className="overflow-x-auto border-border/60 p-4 shadow-soft"><h2 className="mb-4 font-display text-xl font-semibold">{title}</h2><table className="w-full min-w-[720px] border-collapse text-sm"><thead><tr>{headers.map((h) => <th key={h} className="border border-border bg-primary px-3 py-2 text-left text-primary-foreground">{h}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={i} className="odd:bg-muted/30">{row.map((cell, j) => <td key={j} className="border border-border px-3 py-2">{cell}</td>)}</tr>)}</tbody></table></Card>; }
function Metric({ label, value }: { label: string; value: string | number }) { return <Card className="border-border/60 p-5 shadow-soft"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-bold text-primary">{value}</p></Card>; }
function StudentPreview({ student }: { student?: StudentReport }) { if (!student) return <Card className="p-8 text-center text-muted-foreground">Choose a student to preview the marksheet.</Card>; const scores = [["ICA", student.ica], ["MCA", student.mca], ["FCA", student.fca]] as const; const total = scores.reduce((sum, [, value]) => sum + (value ?? 0), 0); return <Card className="border-border/60 p-6 shadow-soft"><div className="flex items-start gap-3 border-b-2 border-destructive pb-4"><img src="/reap-logo.png" alt="REAP logo" className="h-14 w-28 object-contain object-left" /><div><h2 className="font-display text-2xl font-bold">STUDENT PERFORMANCE MARKSHEET</h2><p className="text-sm text-muted-foreground">Academic Year: 2026–27 · SchoolRise</p></div></div><div className="mt-5 grid gap-2 sm:grid-cols-2"><Info label="School Name" value={student.school_name} /><Info label="Student Name" value={student.name} /><Info label="Student ID" value={student.student_code} /><Info label="Roll No." value={student.roll_number} /><Info label="Class" value={student.class} /><Info label="Section / Division" value={student.division} /></div><h3 className="mt-7 border-b-2 border-primary pb-2 font-display text-lg font-semibold">ACADEMIC PERFORMANCE</h3><table className="mt-2 w-full border-collapse text-sm"><thead><tr><th className="border border-border bg-primary px-3 py-2 text-left text-primary-foreground">Sr. No.</th><th className="border border-border bg-primary px-3 py-2 text-left text-primary-foreground">Subject / Assessment</th><th className="border border-border bg-primary px-3 py-2 text-right text-primary-foreground">Total Marks</th><th className="border border-border bg-primary px-3 py-2 text-right text-primary-foreground">Marks Obtained</th><th className="border border-border bg-primary px-3 py-2 text-right text-primary-foreground">Grade</th></tr></thead><tbody>{scores.map(([name, value], index) => <tr key={name}><td className="border border-border px-3 py-2">{index + 1}</td><td className="border border-border px-3 py-2">{name}</td><td className="border border-border px-3 py-2 text-right">100</td><td className="border border-border px-3 py-2 text-right">{value ?? "—"}</td><td className="border border-border px-3 py-2 text-right">{value == null ? "—" : grade(value)}</td></tr>)}</tbody></table><div className="mt-5 grid gap-3 sm:grid-cols-5"><Metric label="Total Marks" value="300" /><Metric label="Obtained" value={total} /><Metric label="Percentage" value={`${student.performance}%`} /><Metric label="Overall Grade" value={grade(student.performance)} /><Metric label="Status" value={performanceStatus(student.performance)} /></div><p className="mt-6 rounded-lg bg-muted/50 p-4 text-sm"><b>Overall Performance:</b> {student.status}<br /><b>Class / Section Rank:</b> —</p></Card>; }
function Info({ label, value }: { label: string; value: string | number | null }) { return <div className="rounded-md border border-border/60 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="font-medium">{value || "—"}</p></div>; }
function studentHtml(student?: StudentReport) { if (!student) return "<h2>INDIVIDUAL STUDENT REPORT</h2><p>No student selected.</p>"; const rows = ([["ICA", student.ica], ["MCA", student.mca], ["FCA", student.fca]] as const).map(([name, score], i) => [i + 1, name, 100, score ?? "—", score == null ? "—" : grade(score)]); return `<h2>STUDENT DETAILS</h2><div class="grid"><div class="field"><b>Student Name:</b>${escapeHtml(student.name)}</div><div class="field"><b>Student ID:</b>${escapeHtml(student.student_code)}</div><div class="field"><b>School Name:</b>${escapeHtml(student.school_name)}</div><div class="field"><b>Roll No.:</b>${escapeHtml(student.roll_number)}</div><div class="field"><b>Class:</b>${escapeHtml(student.class)}</div><div class="field"><b>Section:</b>${escapeHtml(student.division)}</div></div><h2>ACADEMIC PERFORMANCE</h2>${table(["Sr. No.", "Subject / Assessment", "Total Marks", "Marks Obtained", "Grade"], rows)}<h2>PERFORMANCE SUMMARY</h2>${table(["Total Marks", "Obtained Marks", "Percentage", "Overall Grade", "Ranking"], [[300, (student.ica ?? 0) + (student.mca ?? 0) + (student.fca ?? 0), `${student.performance}%`, grade(student.performance), "—"]])}<h2>RESULT</h2><p><b>Overall Performance:</b> ${escapeHtml(student.status)}</p><p><b>Class / Section Rank:</b> __________________________</p><h2>TEACHER / TRAINER REMARKS</h2><p style="height:70px;border-bottom:1px solid #d8dee9"></p>`; }
