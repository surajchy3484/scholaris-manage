import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { getMainDashboard, type AttendanceMetric } from "@/lib/dashboard.functions";
import { getAccessToken } from "@/lib/app-access";
import { getAcademicYear } from "@/lib/academic-year";
import {
  addDays,
  indiaToday,
  percentage,
  weekStart,
  type SessionMetric,
} from "@/lib/dashboard-analytics";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";

const units = ["Unit-1", "Unit-2", "Unit-3", "Unit-4"] as const;
const statuses = [
  "Not Planned",
  "Not Conducted",
  "Less Conducted",
  "Frequently Conducted",
  "Completed",
];
const pct = (n: number | null) => (n === null ? "—" : `${n}%`);
function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold text-slate-900">{title}</h2>
      {children}
    </section>
  );
}
function Filter({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { id: string; name: string }[];
}) {
  return (
    <label className="grid gap-1 text-xs font-medium text-slate-600">
      {label}
      <select
        className="min-w-0 rounded-lg border border-slate-200 bg-white p-2.5 text-sm text-slate-900"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">All {label.toLowerCase()}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );
}
const sumAttendance = (rows: AttendanceMetric[]) => {
  const present = rows.reduce((n, r) => n + Number(r.present), 0),
    expected = rows.reduce((n, r) => n + Number(r.expected), 0),
    recorded = rows.reduce((n, r) => n + Number(r.recorded), 0);
  return { present, expected, recorded, percentage: percentage(present, expected) };
};
function AttendanceBars({
  rows,
  horizontal = false,
  onSchool,
}: {
  rows: { name: string; present: number; expected: number; id?: string }[];
  horizontal?: boolean;
  onSchool?: (id: string) => void;
}) {
  return (
    <div style={{ height: horizontal ? Math.max(220, rows.length * 55) : 280 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={rows}
          layout={horizontal ? "vertical" : "horizontal"}
          margin={{ left: horizontal ? 10 : 0, right: 20, bottom: 10 }}
          accessibilityLayer
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            type={horizontal ? "number" : "category"}
            dataKey={horizontal ? undefined : "name"}
            tick={{ fontSize: 11 }}
            allowDecimals={false}
          />
          <YAxis
            type={horizontal ? "category" : "number"}
            dataKey={horizontal ? "name" : undefined}
            width={horizontal ? 165 : 40}
            tick={{ fontSize: 11 }}
            allowDecimals={false}
          />
          <Tooltip />
          <Legend />
          <Bar
            dataKey="present"
            name="Students present"
            fill="#16a34a"
            radius={[3, 3, 3, 3]}
            onClick={(r) => r.id && onSchool?.(r.id)}
          />
          <Bar
            dataKey="expected"
            name="Expected (recorded cohorts)"
            fill="#3b82f6"
            radius={[3, 3, 3, 3]}
            onClick={(r) => r.id && onSchool?.(r.id)}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
function SessionChart({ rows, select }: { rows: SessionMetric[]; select: (id: string) => void }) {
  if (!rows.length)
    return (
      <p className="py-16 text-center text-sm text-slate-500">No sessions match these filters.</p>
    );
  return (
    <>
      <div className="overflow-x-auto">
        <div style={{ height: 280, minWidth: Math.max(320, rows.length * 65) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} accessibilityLayer margin={{ bottom: 25, right: 15 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="name"
                interval={0}
                tick={{ fontSize: 10 }}
                tickFormatter={(v) => (v.length > 15 ? `${v.slice(0, 13)}…` : v)}
                angle={-20}
                textAnchor="end"
                height={60}
              />
              <YAxis allowDecimals={false} width={35} />
              <Tooltip
                content={({ active, payload }) => {
                  const r = payload?.[0]?.payload as SessionMetric | undefined;
                  return active && r ? (
                    <div className="max-w-xs rounded-lg border bg-white p-3 text-xs shadow-lg">
                      <strong>{r.name}</strong>
                      <p className="break-all">ID: {r.id}</p>
                      <p>
                        {r.completed} completed / {r.planned} planned · {pct(r.percentage)}
                      </p>
                      <p>
                        {r.pending} remaining · {r.schools} schools
                      </p>
                      <p>{r.status}</p>
                    </div>
                  ) : null;
                }}
              />
              <Legend />
              <Bar
                dataKey="completed"
                stackId="delivery"
                name="Completed"
                fill="#16a34a"
                onClick={(r) => select(r.id)}
              />
              <Bar
                dataKey="pending"
                stackId="delivery"
                name="Remaining plan"
                fill="#bfdbfe"
                onClick={(r) => select(r.id)}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="max-h-72 overflow-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b text-slate-500">
              <th className="py-2">Session / ID</th>
              <th>Plan</th>
              <th>Done</th>
              <th>Remaining</th>
              <th>Schools</th>
              <th>Completion</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-slate-100">
                <td className="max-w-48 py-3 pr-2">
                  <button
                    className="text-left font-medium text-blue-700 hover:underline"
                    onClick={() => select(r.id)}
                  >
                    {r.name}
                  </button>
                  <span className="block break-all text-[10px] text-slate-400">{r.id}</span>
                </td>
                <td>{r.planned}</td>
                <td>{r.completed}</td>
                <td>{r.pending}</td>
                <td>{r.schools}</td>
                <td>
                  <strong>{pct(r.percentage)}</strong>
                  <span className="block">{r.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
export function MainDashboard() {
  const { ready, profile, session: authSession } = useAuth();
  const [today, setToday] = useState(indiaToday);
  const [chosenWeek, setChosenWeek] = useState("");
  const week = chosenWeek || weekStart(today);
  useEffect(() => {
    const id = window.setInterval(() => setToday(indiaToday()), 30_000);
    return () => clearInterval(id);
  }, []);
  const [centre, setCentre] = useState(""),
    [school, setSchool] = useState(""),
    [trainer, setTrainer] = useState(""),
    [klass, setClass] = useState(""),
    [division, setDivision] = useState(""),
    [unit, setUnit] = useState(""),
    [session, setSession] = useState(""),
    [status, setStatus] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const year = getAcademicYear();
  const filters = {
    academicYear: year,
    week,
    centre: centre || undefined,
    school: school || undefined,
    trainer: trainer || undefined,
    class: klass || undefined,
    division: division === "__blank__" ? "" : division || undefined,
    unit: (unit as (typeof units)[number]) || undefined,
    session: session || undefined,
    status: status || undefined,
    from: from || undefined,
    to: to || undefined,
  };
  const query = useQuery({
    queryKey: ["main-dashboard", profile?.userId ?? authSession?.user, filters],
    queryFn: () => getMainDashboard({ data: { ...filters, token: getAccessToken() } }),
    enabled: ready,
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: false,
  });
  const d = query.data;
  const daily = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(week, i),
      rows = d?.attendance.filter((r) => r.date === date) ?? [];
    return {
      id: date,
      name: new Date(`${date}T12:00:00Z`).toLocaleDateString("en-IN", {
        weekday: "short",
        day: "numeric",
        month: "short",
        timeZone: "Asia/Kolkata",
      }),
      ...sumAttendance(rows),
      hasRecords: rows.length > 0,
    };
  });
  const schoolRows =
    d?.selectedSchools.map((s) => ({
      id: s.id,
      name: s.name,
      ...sumAttendance(d.attendance.filter((r) => r.school_id === s.id)),
    })) ?? [];
  const weekly = sumAttendance(d?.attendance ?? []);
  const centres = [...new Set(d?.schools.map((s) => s.cluster_name || "Unassigned") ?? [])].sort();
  const classes = [...new Set(d?.cohorts.map((c) => c.class) ?? [])].sort();
  const divisions = [...new Set(d?.cohorts.map((c) => c.division || "__blank__") ?? [])].sort();
  return (
    <div className="space-y-6 rounded-2xl bg-slate-50 p-4 text-slate-900 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-green-700">
            Reach Education Action Program
          </p>
          <h1 className="mt-1 text-3xl font-bold">Main Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">
            Attendance and STEM delivery · Academic Year {year}
          </p>
        </div>
        <Button variant="outline" onClick={() => void query.refetch()} disabled={query.isFetching}>
          <RefreshCw className={query.isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          Refresh
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Filter
          label="Centres"
          value={centre}
          onChange={(v) => {
            setCentre(v);
            setSchool("");
            setClass("");
            setDivision("");
            setSession("");
          }}
          options={centres.map((id) => ({ id, name: id }))}
        />
        <Filter
          label="Schools"
          value={school}
          onChange={(v) => {
            setSchool(v);
            setClass("");
            setDivision("");
            setSession("");
          }}
          options={(d?.schools ?? [])
            .filter((s) => !centre || (s.cluster_name || "Unassigned") === centre)
            .map((s) => ({ id: s.id, name: s.name }))}
        />
        <Filter
          label="Classes"
          value={klass}
          onChange={(v) => {
            setClass(v);
            setDivision("");
          }}
          options={classes.map((id) => ({ id, name: id }))}
        />
        <Filter
          label="Divisions / sections"
          value={division}
          onChange={setDivision}
          options={divisions.map((id) => ({ id, name: id === "__blank__" ? "No division" : id }))}
        />
      </div>
      {query.error ? (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
          {query.error.message}{" "}
          <button className="underline" onClick={() => void query.refetch()}>
            Retry
          </button>
          <button
            className="ml-4 underline"
            onClick={() => {
              setCentre("");
              setSchool("");
              setTrainer("");
              setClass("");
              setDivision("");
              setUnit("");
              setSession("");
              setStatus("");
              setFrom("");
              setTo("");
            }}
          >
            Reset filters
          </button>
        </div>
      ) : !d ? (
        <p role="status" className="p-12 text-center">
          Loading authorized dashboard data…
        </p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              ["Active Centres", d.kpis.centres, "Assigned school clusters"],
              ["Enrolled Students", d.kpis.students, "Selected academic-year roster"],
              [
                "Sessions Completed",
                d.sessionsAllowed ? d.kpis.completed : "—",
                "School / class / division deliveries",
              ],
            ].map(([label, value, note]) => (
              <div key={label} className="rounded-2xl border border-green-100 bg-white p-5">
                <p className="text-sm text-slate-500">{label}</p>
                <p className="my-2 text-4xl font-bold text-green-700">
                  {typeof value === "number" ? value.toLocaleString() : value}
                </p>
                <p className="text-xs text-slate-400">{note}</p>
              </div>
            ))}
          </div>
          {d.attendanceAllowed ? (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="mr-auto text-xl font-semibold">Weekly Attendance</h2>
                <Button
                  variant="outline"
                  aria-label="Previous week"
                  onClick={() => setChosenWeek(addDays(week, -7))}
                >
                  <ChevronLeft size={16} />
                </Button>
                <label className="text-xs">
                  Week containing{" "}
                  <input
                    aria-label="Week containing"
                    type="date"
                    value={week}
                    onChange={(e) => e.target.value && setChosenWeek(weekStart(e.target.value))}
                    className="rounded-lg border bg-white p-2"
                  />
                </label>
                <Button
                  variant="outline"
                  aria-label="Next week"
                  onClick={() => setChosenWeek(addDays(week, 7))}
                >
                  <ChevronRight size={16} />
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setToday(indiaToday());
                    setChosenWeek("");
                  }}
                >
                  Current week
                </Button>
              </div>
              <div className="grid gap-5 xl:grid-cols-2">
                <Panel title="Weekly School Attendance">
                  <p className="mb-3 text-sm text-slate-500">
                    Weekly weighted attendance:{" "}
                    <strong className="text-green-700">{pct(weekly.percentage)}</strong>
                  </p>
                  <AttendanceBars rows={daily} />
                  <div className="grid gap-1 text-xs">
                    {daily.map((r) => (
                      <div
                        key={r.id}
                        className="flex justify-between border-b border-slate-100 py-1"
                      >
                        <span>{r.name}</span>
                        <span>
                          {r.hasRecords
                            ? `${r.present} / ${r.expected} · ${pct(r.percentage)} · ${r.expected - r.recorded} unmarked`
                            : "Attendance Not Recorded"}
                        </span>
                      </div>
                    ))}
                  </div>
                </Panel>
                <Panel title="School-wise Weekly Attendance">
                  <AttendanceBars rows={schoolRows} horizontal onSchool={setSchool} />
                  <div className="max-h-64 overflow-auto">
                    {schoolRows.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => {
                          setSchool(s.id);
                          setClass("");
                          setDivision("");
                        }}
                        className="flex w-full justify-between gap-3 border-b border-slate-100 py-2 text-left text-xs hover:text-blue-600"
                      >
                        <span>{s.name}</span>
                        <span>
                          {s.expected
                            ? `${s.present} / ${s.expected} · ${pct(s.percentage)}`
                            : "Attendance Not Recorded"}
                        </span>
                      </button>
                    ))}
                  </div>
                </Panel>
              </div>
              {school && (
                <Panel title="Class-wise and division-wise attendance">
                  <div className="overflow-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr>
                          <th>Class</th>
                          <th>Division</th>
                          <th>Present</th>
                          <th>Expected</th>
                          <th>Attendance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.cohorts
                          .filter((c) => c.school_id === school)
                          .map((c) => {
                            const n = sumAttendance(
                              d.attendance.filter(
                                (r) =>
                                  r.school_id === school &&
                                  r.class === c.class &&
                                  r.division === c.division,
                              ),
                            );
                            return (
                              <tr key={`${c.class}/${c.division}`} className="border-t">
                                <td className="py-2">{c.class}</td>
                                <td>{c.division || "No division"}</td>
                                <td>{n.present}</td>
                                <td>{n.expected || "—"}</td>
                                <td>
                                  {n.expected ? pct(n.percentage) : "Attendance Not Recorded"}
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                </Panel>
              )}
              <p className="text-xs text-slate-500">
                Expected = year-roster students in class/division cohorts with attendance marks that
                day. Missing cohorts and days are excluded, not treated as absent. Weekly totals are
                student-days. The database has no school calendar or daily enrollment history; this
                is recorded-cohort coverage, not a scheduled-school-days rate.
              </p>
            </>
          ) : (
            <Panel title="Weekly Attendance">
              <p>Attendance access is not assigned to your account.</p>
            </Panel>
          )}
          {d.sessionsAllowed ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Filter
                  label="Trainers"
                  value={trainer}
                  onChange={(v) => {
                    setTrainer(v);
                    setSession("");
                  }}
                  options={d.trainers}
                />
                <Filter
                  label="Units"
                  value={unit}
                  onChange={(v) => {
                    setUnit(v);
                    setSession("");
                  }}
                  options={units.map((id) => ({ id, name: id }))}
                />
                <Filter
                  label="Sessions"
                  value={session}
                  onChange={setSession}
                  options={d.sessionOptions.map((s) => ({
                    id: s.id,
                    name: `${s.unit}: ${s.name} (${s.id.slice(0, 8)})`,
                  }))}
                />
                <Filter
                  label="Session status"
                  value={status}
                  onChange={setStatus}
                  options={statuses.map((id) => ({ id, name: id }))}
                />
                <label className="grid gap-1 text-xs">
                  Completion updated from
                  <input
                    type="date"
                    value={from}
                    onChange={(e) => {
                      setFrom(e.target.value);
                      if (to && e.target.value > to) setTo("");
                    }}
                    className="rounded-lg border bg-white p-2"
                  />
                </label>
                <label className="grid gap-1 text-xs">
                  Completion updated to
                  <input
                    type="date"
                    value={to}
                    min={from}
                    onChange={(e) => setTo(e.target.value)}
                    className="rounded-lg border bg-white p-2"
                  />
                </label>
                <Button
                  variant="outline"
                  onClick={() => {
                    setCentre("");
                    setSchool("");
                    setClass("");
                    setDivision("");
                    setTrainer("");
                    setUnit("");
                    setSession("");
                    setStatus("");
                    setFrom("");
                    setTo("");
                  }}
                >
                  Reset filters
                </Button>
              </div>
              <Panel title="Unit-wise Session Completion">
                <div className="overflow-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="text-slate-500">
                        <th>Unit</th>
                        <th>Activities / records</th>
                        <th>Planned deliveries</th>
                        <th>Completed</th>
                        <th>Remaining</th>
                        <th>Completion</th>
                      </tr>
                    </thead>
                    <tbody>
                      {units
                        .filter((u) => !unit || u === unit)
                        .map((u) => {
                          const rows = d.metrics.filter((s) => s.unit === u),
                            planned = rows.reduce((n, s) => n + s.planned, 0),
                            completed = rows.reduce((n, s) => n + s.completed, 0);
                          return (
                            <tr key={u} className="border-t">
                              <td className="py-3 font-medium">{u}</td>
                              <td>{rows.length}</td>
                              <td>{planned}</td>
                              <td>{completed}</td>
                              <td>{planned - completed}</td>
                              <td>
                                {planned ? pct(percentage(completed, planned)) : "Not Planned"}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </Panel>
              <div>
                <h2 className="mb-2 text-xl font-semibold">Session-wise Completion</h2>
                <p className="mb-4 text-xs text-slate-500">
                  Green: completed · Light blue: remaining plan. Frequent = 75–99.9%; less conducted
                  = above 0–74.9%. Overdue/missed dates are not recorded in the existing system.
                </p>
                <div className="grid gap-5 lg:grid-cols-2">
                  {units.map((u) => (
                    <Panel key={u} title={`${u.replace("-", " ")} — Session-wise Completion`}>
                      <SessionChart
                        rows={d.metrics.filter((s) => s.unit === u)}
                        select={setSession}
                      />
                    </Panel>
                  ))}
                </div>
              </div>
              <Panel title="Trainer-wise Session Completion">
                <p className="mb-3 text-xs text-slate-500">
                  Based on current school assignments, not who last edited a status. Shared schools
                  may appear for multiple trainers; these rows are not additive.
                </p>
                <div className="overflow-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr>
                        <th>Trainer</th>
                        <th>Planned</th>
                        <th>Completed</th>
                        <th>Completion</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.trainerMetrics
                        .filter((t) => !trainer || t.id === trainer)
                        .map((t) => (
                          <tr key={t.id} className="border-t">
                            <td className="py-3">
                              <button
                                className="text-blue-700 hover:underline"
                                onClick={() => setTrainer(t.id)}
                              >
                                {t.name}
                              </button>
                            </td>
                            <td>{t.planned}</td>
                            <td>{t.completed}</td>
                            <td>
                              {t.planned ? pct(percentage(t.completed, t.planned)) : "Not Planned"}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                  {!d.trainerMetrics.length && (
                    <p className="py-5 text-slate-500">
                      No active trainers in the authorized scope.
                    </p>
                  )}
                </div>
              </Panel>
              <details className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-xs text-slate-600">
                <summary className="cursor-pointer font-semibold">
                  Calculation rules and data coverage
                </summary>
                <h3 className="mt-4 font-semibold">Stored assignment targets</h3>
                <p className="mt-1">
                  These are unit/class activity counts. Differences require plan reconciliation;
                  historical session rows are retained.
                </p>
                <div className="mt-2 max-h-48 overflow-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr>
                        <th>School / Unit / Class / Division</th>
                        <th>Target activities</th>
                        <th>Existing activities</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.targetCoverage.map((t) => (
                        <tr key={t.id} className="border-t">
                          <td className="py-2">
                            {t.school} · {t.unit} · {t.class} · {t.division || "All divisions"}
                          </td>
                          <td>{t.session_count}</td>
                          <td>
                            {t.materialized}
                            {t.materialized !== t.session_count ? " — reconcile" : ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!d.targetCoverage.length && (
                    <p>
                      No explicit unit/class targets in this scope. Existing session assignments
                      remain the delivery-plan source.
                    </p>
                  )}
                </div>

                <p className="mt-3">
                  One planned delivery is an existing school/class session paired with each division
                  in the selected academic-year roster. Existing unit count targets cannot identify
                  which specific activity was planned; this dashboard does not distribute those
                  counts across invented activities. Completion uses the latest saved division
                  status. No roster means Not Planned.
                </p>
                <p className="mt-2">
                  Legacy sessions without a confirmed shared activity ID remain separate; matching
                  names are never merged. {d.metrics.filter((s) => s.unmapped).length} displayed
                  session records await optional activity mapping. Mapped activities retain their
                  separate school/class/division deliveries.
                </p>
                <p className="mt-2">
                  Date filters refer to status update timestamps in UTC, not delivery dates. With a
                  date filter, remaining plan includes completions outside the selected period.
                  Status updates are snapshots, so this is not a historical as-of report. Centres
                  use stored school clusters; no centre-active flag, coordinator role, trainer
                  delivery assignment or profile photo field exists in the current schema.
                </p>
              </details>
            </>
          ) : (
            <Panel title="Session-wise Completion">
              <p>Session Status access is not assigned to your account.</p>
            </Panel>
          )}
        </>
      )}
    </div>
  );
}
