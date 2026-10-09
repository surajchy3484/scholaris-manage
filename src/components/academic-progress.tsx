import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { academicProgressPage, academicSchools } from "@/lib/academic.functions";
import { getAccessToken } from "@/lib/app-access";
import { StudentHistory } from "./student-history";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

export function AcademicProgress() {
  const [school, setSchool] = useState("");
  const [search, setSearch] = useState("");
  const [draftSearch, setDraftSearch] = useState("");
  const [exam, setExam] = useState("all");
  const [page, setPage] = useState(0);
  const [student, setStudent] = useState<string | null>(null);
  const schools = useQuery({
    queryKey: ["academic-schools"],
    queryFn: () => academicSchools({ data: { token: getAccessToken() } }),
  });
  const report = useQuery({
    queryKey: ["academic-progress", school, search, page],
    queryFn: () =>
      academicProgressPage({
        data: { token: getAccessToken(), schoolId: school || undefined, search, page, size: 50 },
      }),
  });
  const exams = [
    ...new Set([
      "ICA",
      "MCA",
      "FCA",
      ...(report.data?.rows.flatMap((r) => r.scores.map((s) => s.exam_type)) ?? []),
    ]),
  ];
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">All Years / Progress History</h2>
      <p className="text-sm text-muted-foreground">
        Read-only year-wise comparison using the same permanent Student ID. Click a student for
        assessment, attendance and session history. New data is saved through the selected year's
        normal modules.
      </p>
      <div className="flex flex-wrap gap-3">
        <select
          aria-label="Progress school"
          className="rounded border bg-background p-2"
          value={school}
          onChange={(e) => {
            setSchool(e.target.value);
            setPage(0);
            setStudent(null);
          }}
        >
          <option value="">All permitted schools</option>
          {schools.data?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(draftSearch);
            setPage(0);
          }}
        >
          <Input
            aria-label="Search progress by student name or ID"
            value={draftSearch}
            onChange={(e) => setDraftSearch(e.target.value)}
            placeholder="Student name or ID"
          />
          <Button type="submit">Search</Button>
        </form>
        <select
          aria-label="Progress exam type"
          className="rounded border bg-background p-2"
          value={exam}
          onChange={(e) => setExam(e.target.value)}
        >
          <option value="all">All exam types</option>
          {exams.map((e) => (
            <option key={e} value={e}>
              {e === "MCA" ? "MCA / IMF" : e}
            </option>
          ))}
        </select>
      </div>
      {report.isFetching && <p role="status">Loading progress…</p>}
      {(report.error || schools.error) && (
        <p role="alert">{report.error?.message || schools.error?.message}</p>
      )}
      {report.data && (
        <>
          <p className="text-xs text-muted-foreground">
            Percentages use the mean Clicker correct rate per exam type, or the recorded manual
            score when Clicker results are unavailable. All exam types shows their mean. A dash
            means no recorded score.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="p-2 text-left">Student ID</th>
                  <th className="p-2 text-left">Student</th>
                  {report.data.years.map((y) => (
                    <th key={y.id} className="p-2 text-right">
                      {y.name}
                      {y.is_current ? " (Current)" : ""}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.data.rows.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="p-2">{r.student_code}</td>
                    <td className="p-2">
                      <button className="text-primary underline" onClick={() => setStudent(r.id)}>
                        {r.name}
                      </button>
                    </td>
                    {report.data.years.map((y) => {
                      const values = r.scores.filter(
                        (s) =>
                          s.academic_year === y.id &&
                          (exam === "all" || s.exam_type === exam) &&
                          s.percentage !== null,
                      );
                      return (
                        <td key={y.id} className="p-2 text-right">
                          {values.length
                            ? `${(values.reduce((n, s) => n + Number(s.percentage), 0) / values.length).toFixed(1)}%`
                            : "—"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!report.data.rows.length && <p>No matching student records.</p>}
          <div className="flex items-center gap-3">
            <Button disabled={page === 0 || report.isFetching} onClick={() => setPage(page - 1)}>
              Previous
            </Button>
            <span>
              {report.data.total} students · Page {page + 1}
            </span>
            <Button
              disabled={(page + 1) * 50 >= report.data.total || report.isFetching}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        </>
      )}
      {student && <StudentHistory key={student} studentId={student} allYears />}
    </section>
  );
}
