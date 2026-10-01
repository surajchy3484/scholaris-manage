import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { studentAcademicHistory } from "@/lib/academic.functions";
import { getAccessToken } from "@/lib/app-access";
import { useAuth } from "@/lib/auth";
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from "recharts";
export function StudentHistory({ studentId }: { studentId: string }) {
  const { can } = useAuth();
  const [selected, setSelected] = useState<string[]>([]);
  const history = useQuery({
    queryKey: ["student-history", studentId],
    queryFn: () => studentAcademicHistory({ data: { token: getAccessToken(), studentId } }),
    enabled: can("exam_report", "view"),
  });
  if (!can("exam_report", "view")) return null;
  if (history.isLoading) return <p>Loading academic history…</p>;
  if (history.error) return <p role="alert">{history.error.message}</p>;
  const data = history.data;
  if (!data) return null;
  const years = [
    ...new Set([
      ...data.enrollments.map((e) => e.academic_year),
      ...data.results.map((r) => r.academic_year),
      ...data.scores.map((r) => r.academic_year),
    ]),
  ]
    .filter(Boolean)
    .sort();
  const chart = years
    .filter((year) => !selected.length || selected.includes(year))
    .map((year) => {
      const scores = data.scores.filter((r) => r.academic_year === year);
      const results = data.results.filter((r) => r.academic_year === year);
      const score = (type: string) => {
        const matches = results.filter((r) => r.exam_type === type);
        return matches.length
          ? Math.round(
              (matches.reduce((n, r) => n + Number(r.correct_rate), 0) / matches.length) * 10,
            ) / 10
          : (scores
              .filter((r) => r.exam_type === type || (type === "MCA" && r.exam_type === "IMF"))
              .at(-1)?.score ?? null);
      };
      return {
        year,
        ICA: score("ICA"),
        MCA: score("MCA"),
        FCA: score("FCA"),
        attendance: data.attendance.find((a) => a.academic_year === year)?.percentage ?? null,
      };
    });
  const dimensions = new Map<
    string,
    { year: string; label: string; dimension: string; total: number; correct: number }
  >();
  for (const r of data.results) {
    if (selected.length && !selected.includes(r.academic_year)) continue;
    for (const q of r.question_snapshot ?? [])
      for (const dimension of ["parameter", "chapter", "topic"] as const) {
        const label = q[dimension];
        if (!label) continue;
        const key = JSON.stringify([r.academic_year, dimension, label]);
        const item = dimensions.get(key) ?? {
          year: r.academic_year,
          label,
          dimension,
          total: 0,
          correct: 0,
        };
        item.total++;
        item.correct += Number(r.answers?.[`S${q.question_no}`] === q.correct_answer);
        dimensions.set(key, item);
      }
  }
  return (
    <section className="space-y-3 rounded-xl border p-4">
      <h3 className="font-semibold">Student History · Progress Across Years</h3>
      <p className="text-xs text-muted-foreground">
        Select years to compare. No selection shows all years. Session progress is the enrolled
        class/division’s progress.
      </p>
      <div className="flex flex-wrap gap-3">
        {years.map((year) => (
          <label key={year}>
            <input
              type="checkbox"
              checked={selected.includes(year)}
              onChange={(e) =>
                setSelected(
                  e.target.checked ? [...selected, year] : selected.filter((y) => y !== year),
                )
              }
            />{" "}
            {year}
          </label>
        ))}
      </div>
      {!years.length && <p>No academic history recorded.</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              {["Year", "School", "Class", "Division", "Roll", "Status"].map((h) => (
                <th className="p-2 text-left" key={h}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.enrollments
              .filter((e) => !selected.length || selected.includes(e.academic_year))
              .map((e) => (
                <tr key={e.id}>
                  {[
                    e.academic_year,
                    e.school_name,
                    e.class,
                    e.division,
                    e.roll_number,
                    e.status,
                  ].map((v, i) => (
                    <td className="p-2" key={i}>
                      {v || "—"}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chart}>
            <XAxis dataKey="year" />
            <YAxis domain={[0, 100]} />
            <Tooltip />
            <Legend />
            {["ICA", "MCA", "FCA", "attendance"].map((key, i) => (
              <Line
                key={key}
                dataKey={key}
                stroke={["#4f46e5", "#f97316", "#10b981", "#06b6d4"][i]}
                connectNulls={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th>Year</th>
              <th>ICA %</th>
              <th>MCA %</th>
              <th>FCA %</th>
              <th>Attendance %</th>
            </tr>
          </thead>
          <tbody>
            {chart.map((r) => (
              <tr key={r.year}>
                {[r.year, r.ICA, r.MCA, r.FCA, r.attendance].map((v, i) => (
                  <td className="p-2" key={i}>
                    {v ?? "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h4 className="font-medium">Unit/session history</h4>
      {data.sessions
        .filter((r) => !selected.length || selected.includes(r.academic_year))
        .map((r) => (
          <p key={`${r.academic_year}-${r.unit}`}>
            {r.academic_year} · {r.unit}: {r.complete}/{r.total} complete ·{" "}
            {r.total > 0 && r.complete === r.total
              ? "Completed"
              : r.complete
                ? "In Progress"
                : "Pending"}
          </p>
        ))}
      <details>
        <summary>Parameter, chapter and topic comparison</summary>
        <div className="max-h-80 overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th>Year</th>
                <th>Dimension</th>
                <th>Area</th>
                <th>Responses</th>
                <th>Correct rate</th>
              </tr>
            </thead>
            <tbody>
              {[...dimensions.entries()].map(([key, r]) => (
                <tr key={key}>
                  <td>{r.year}</td>
                  <td>{r.dimension}</td>
                  <td>{r.label}</td>
                  <td>{r.total}</td>
                  <td>{Math.round((r.correct / r.total) * 1000) / 10}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <details>
        <summary>Clicker results and preserved answer keys</summary>
        {data.results
          .filter((r) => !selected.length || selected.includes(r.academic_year))
          .map((r) => (
            <details key={r.id} className="p-2">
              <summary>
                {r.academic_year || "Unassigned year"} · {r.exam_type} · Score {r.score} · Correct{" "}
                {r.correct_rate}% · Rank {r.ranking ?? "—"}
              </summary>
              {(r.question_snapshot ?? []).map((q) => (
                <p key={q.question_no}>
                  Q{q.question_no}: Answer {r.answers?.[`S${q.question_no}`] || "Unattempted"} · Key{" "}
                  {q.correct_answer}
                </p>
              ))}
            </details>
          ))}
      </details>
    </section>
  );
}
