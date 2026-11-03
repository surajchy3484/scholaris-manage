import { adminDb } from "./app-access.server";
import { fetchAllRows } from "./fetch-all";
import {
  aggregateDashboardAttendance,
  missingDashboardFeature,
  withDashboardFallback,
  type RosterEntry,
  type AttendanceEntry,
} from "./dashboard-compat";
import type { Cohort } from "./dashboard-analytics";
import type { AttendanceMetric } from "./dashboard-compat";

type AttendanceScope = {
  year: string;
  schoolIds: string[];
  start: string;
  end: string;
  class?: string;
  division?: string;
  includeAttendance: boolean;
};
export async function loadDashboardAttendance(
  db: Awaited<ReturnType<typeof adminDb>>,
  scope: AttendanceScope,
): Promise<{ cohorts: Cohort[]; attendance: AttendanceMetric[] }> {
  if (!scope.schoolIds.length) return { cohorts: [], attendance: [] };
  const legacy = async () => {
    const [roster, marks] = await Promise.all([
      fetchAllRows<RosterEntry>((from, to) => {
        let q = db
          .from("student_enrollments")
          .select("student_id,school_id,class,division")
          .eq("academic_year", scope.year)
          .in("school_id", scope.schoolIds)
          .order("student_id");
        if (scope.class !== undefined) q = q.eq("class", scope.class);
        if (scope.division !== undefined) q = q.eq("division", scope.division);
        return q.range(from, to);
      }),
      scope.includeAttendance
        ? fetchAllRows<AttendanceEntry>((from, to) =>
            db
              .from("attendance")
              .select("id,student_id,school_id,date,status,created_at")
              .eq("academic_year", scope.year)
              .in("school_id", scope.schoolIds)
              .gte("date", scope.start)
              .lte("date", scope.end)
              .in("status", ["present", "absent"])
              .order("id")
              .range(from, to),
          )
        : Promise.resolve([]),
    ]);
    return aggregateDashboardAttendance(roster, marks);
  };
  // A dashboard-only/session-only user does not need attendance records read at all.
  if (!scope.includeAttendance) return legacy();
  return withDashboardFallback(
    async () => {
      const { data, error } = await db.rpc(
        "reap_dashboard_attendance" as never,
        {
          p_year: scope.year,
          p_schools: scope.schoolIds,
          p_start: scope.start,
          p_end: scope.end,
          p_class: scope.class ?? null,
          p_division: scope.division ?? null,
        } as never,
      );
      if (error) throw error;
      return data as unknown as { cohorts: Cohort[]; attendance: AttendanceMetric[] };
    },
    legacy,
    (error) => missingDashboardFeature(error, "reap_dashboard_attendance", ["PGRST202", "42883"]),
  );
}
