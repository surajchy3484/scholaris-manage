import type { Cohort } from "./dashboard-analytics";

/** Only absent schema objects trigger compatibility reads, never auth/network/SQL errors. */
export function missingDashboardFeature(error: unknown, feature: string, codes: string[]) {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: string; message?: string; details?: string };
  return codes.includes(e.code ?? "") && `${e.message ?? ""} ${e.details ?? ""}`.includes(feature);
}
export async function withDashboardFallback<T>(
  primary: () => Promise<T>,
  fallback: () => Promise<T>,
  isMissing: (error: unknown) => boolean,
): Promise<T> {
  try {
    return await primary();
  } catch (error) {
    if (!isMissing(error)) throw error;
    return fallback();
  }
}
export type RosterEntry = {
  student_id: string;
  school_id: string;
  class: string;
  division: string | null;
};
export type AttendanceEntry = {
  id: string;
  student_id: string;
  school_id: string;
  date: string;
  status: string;
  created_at: string;
};
export type AttendanceMetric = {
  school_id: string;
  class: string;
  division: string;
  date: string;
  present: number;
  expected: number;
  recorded: number;
};
/** Equivalent to reap_dashboard_attendance SQL, on already authorized/year-filtered rows. */
export function aggregateDashboardAttendance(roster: RosterEntry[], marks: AttendanceEntry[]) {
  const students = new Map(roster.map((r) => [r.student_id, { ...r, division: r.division ?? "" }]));
  const cohorts = new Map<string, Cohort>();
  for (const r of students.values()) {
    const key = JSON.stringify([r.school_id, r.class, r.division]);
    const c = cohorts.get(key) ?? {
      school_id: r.school_id,
      class: r.class,
      division: r.division,
      students: 0,
    };
    c.students++;
    cohorts.set(key, c);
  }
  const latest = new Map<string, AttendanceEntry>();
  for (const mark of marks) {
    const student = students.get(mark.student_id);
    if (
      !student ||
      student.school_id !== mark.school_id ||
      !["present", "absent"].includes(mark.status)
    )
      continue;
    const key = JSON.stringify([mark.student_id, mark.date]);
    const previous = latest.get(key);
    if (
      !previous ||
      Date.parse(mark.created_at) > Date.parse(previous.created_at) ||
      (Date.parse(mark.created_at) === Date.parse(previous.created_at) && mark.id > previous.id)
    )
      latest.set(key, mark);
  }
  const days = new Map<string, AttendanceMetric>();
  for (const mark of latest.values()) {
    const r = students.get(mark.student_id)!;
    const cohort = cohorts.get(JSON.stringify([r.school_id, r.class, r.division]))!;
    const key = JSON.stringify([r.school_id, r.class, r.division, mark.date]);
    const row = days.get(key) ?? {
      school_id: r.school_id,
      class: r.class,
      division: r.division,
      date: mark.date,
      present: 0,
      expected: cohort.students,
      recorded: 0,
    };
    row.recorded++;
    if (mark.status === "present") row.present++;
    days.set(key, row);
  }
  return {
    cohorts: [...cohorts.values()],
    attendance: [...days.values()].sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.school_id.localeCompare(b.school_id) ||
        a.class.localeCompare(b.class) ||
        a.division.localeCompare(b.division),
    ),
  };
}
