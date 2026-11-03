/** Pure calculations; the server supplies only authorized, year-scoped records. */
export type Cohort = { school_id: string; class: string; division: string; students: number };
export type SessionRow = {
  id: string;
  activity_id?: string | null;
  school_id: string;
  unit: string;
  class: string;
  session_name: string;
  topic: string;
};
export type StatusRow = {
  session_id: string;
  school_id: string;
  division: string;
  status: string;
  updated_at: string;
};
export type SessionMetric = {
  id: string;
  ids: string[];
  name: string;
  unit: string;
  planned: number;
  completed: number;
  pending: number;
  schools: number;
  percentage: number | null;
  status: string;
  unmapped: boolean;
};
export const percentage = (completed: number, planned: number) =>
  planned > 0 ? Math.round((completed / planned) * 1000) / 10 : null;
export function completionStatus(completed: number, planned: number) {
  if (!planned) return "Not Planned";
  if (!completed) return "Not Conducted";
  if (completed >= planned) return "Completed";
  return completed / planned >= 0.75 ? "Frequently Conducted" : "Less Conducted";
}
export function sessionMetrics(
  sessions: SessionRow[],
  cohorts: Cohort[],
  statuses: StatusRow[],
  range: { from?: string; to?: string } = {},
): SessionMetric[] {
  const divisions = new Map<string, Set<string>>();
  for (const c of cohorts) {
    const key = JSON.stringify([c.school_id, c.class]);
    if (!divisions.has(key)) divisions.set(key, new Set());
    divisions.get(key)!.add(c.division || "");
  }
  const latest = new Map<string, StatusRow>();
  for (const s of statuses) {
    const key = JSON.stringify([s.session_id, s.school_id, s.division || ""]);
    if (!latest.has(key) || s.updated_at > latest.get(key)!.updated_at) latest.set(key, s);
  }
  const groups = new Map<string, SessionMetric & { schoolSet: Set<string> }>();
  for (const s of new Map(sessions.map((s) => [s.id, s])).values()) {
    // Never merge on names or on class_plan_id (a plan contains multiple activities).
    const id = s.activity_id || s.id;
    const key = JSON.stringify([s.unit, id]);
    const m = groups.get(key) ?? {
      id,
      ids: [],
      name: s.session_name,
      unit: s.unit,
      planned: 0,
      completed: 0,
      pending: 0,
      schools: 0,
      percentage: null,
      status: "Not Planned",
      unmapped: !s.activity_id,
      schoolSet: new Set<string>(),
    };
    m.ids.push(s.id);
    for (const division of divisions.get(JSON.stringify([s.school_id, s.class])) ?? []) {
      m.planned++;
      const status = latest.get(JSON.stringify([s.id, s.school_id, division]));
      const date = status?.updated_at.slice(0, 10);
      if (
        status?.status === "complete" &&
        (!range.from || date! >= range.from) &&
        (!range.to || date! <= range.to)
      ) {
        m.completed++;
        m.schoolSet.add(s.school_id);
      }
    }
    groups.set(key, m);
  }
  return [...groups.values()].map(({ schoolSet, ...m }) => ({
    ...m,
    pending: m.planned - m.completed,
    schools: schoolSet.size,
    percentage: percentage(m.completed, m.planned),
    status: completionStatus(m.completed, m.planned),
  }));
}
export function weekStart(date: string) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
export function addDays(date: string, days: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function indiaToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
