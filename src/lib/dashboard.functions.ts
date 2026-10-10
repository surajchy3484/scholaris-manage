import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { adminDb, requirePermission } from "./app-access.server";
import { academicDb, resolveAcademicYear } from "./academic-db.server";
import { can, canSeeSchool } from "./access-control";
import { fetchAllRows } from "./fetch-all";
import {
  sessionMetrics,
  type Cohort,
  type SessionRow,
  type StatusRow,
} from "./dashboard-analytics";

const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => !Number.isNaN(Date.parse(v)));
export type AttendanceMetric = {
  school_id: string;
  class: string;
  division: string;
  date: string;
  present: number;
  expected: number;
  recorded: number;
};
type School = { id: string; name: string; cluster_name: string | null };
type AssignmentTarget = {
  id: string;
  school_id: string;
  unit: string;
  class: string;
  division: string;
  session_count: number;
};
type Trainer = {
  id: string;
  full_name: string;
  username: string;
  school_ids: string[];
  all_schools: boolean;
};
export const getMainDashboard = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) =>
    z
      .object({
        token: z.string().min(1),
        academicYear: z.string().optional(),
        week: date,
        centre: z.string().max(200).optional(),
        school: z.string().uuid().optional(),
        trainer: z.string().uuid().optional(),
        class: z.string().max(60).optional(),
        division: z.string().max(60).optional(),
        unit: z.enum(["Unit-1", "Unit-2", "Unit-3", "Unit-4"]).optional(),
        session: z.string().uuid().optional(),
        from: date.optional(),
        to: date.optional(),
        status: z.string().max(40).optional(),
      })
      .refine((v) => !v.from || !v.to || v.from <= v.to, "Start date must precede end date")
      .parse(value),
  )
  .handler(async ({ data }) => {
    const profile = await requirePermission(data.token, "dashboard", "view");
    const year = await resolveAcademicYear(data.academicYear);
    const db = await academicDb(year);
    const attendanceAllowed = can(profile, "attendance", "view");
    const sessionsAllowed = can(profile, "session_status", "view");
    const schools = await fetchAllRows<School>((from, to) => {
      let q = db.from("schools").select("id,name,cluster_name").order("id");
      if (profile.role !== "admin" && !profile.allSchools)
        q = q.in(
          "id",
          profile.schoolIds.length ? profile.schoolIds : ["00000000-0000-0000-0000-000000000000"],
        );
      return q.range(from, to);
    });
    let trainers: Trainer[] = [];
    if (sessionsAllowed && profile.role === "admin") {
      trainers = await fetchAllRows<Trainer>((from, to) =>
        db
          .from("app_users")
          .select("id,full_name,username,school_ids,all_schools")
          .eq("role", "trainer")
          .eq("is_active", true)
          .order("id")
          .range(from, to),
      );
    } else if (sessionsAllowed && profile.userId) {
      trainers = [
        {
          id: profile.userId,
          full_name: profile.fullName,
          username: profile.username,
          school_ids: profile.schoolIds,
          all_schools: profile.allSchools,
        },
      ];
    }
    const trainer = data.trainer ? trainers.find((t) => t.id === data.trainer) : undefined;
    if (data.trainer && !trainer) throw new Error("Trainer access denied");
    if (data.school && !canSeeSchool(profile, data.school)) throw new Error("School access denied");
    const selected = schools.filter(
      (s) =>
        (!data.school || s.id === data.school) &&
        (!data.centre || (s.cluster_name || "Unassigned") === data.centre) &&
        (!trainer || trainer.all_schools || trainer.school_ids.includes(s.id)),
    );
    const ids = selected.map((s) => s.id);
    const end = new Date(`${data.week}T12:00:00Z`);
    end.setUTCDate(end.getUTCDate() + 6);
    let cohorts: Cohort[] = [];
    let attendance: AttendanceMetric[] = [];
    let sessions: SessionRow[] = [];
    let statuses: StatusRow[] = [];
    let targets: AssignmentTarget[] = [];
    if (ids.length) {
      // Aggregate roster and marks in PostgreSQL; no student names or raw roster sent to browser.
      const raw = await adminDb();
      const { data: aggregate, error } = await raw.rpc(
        "reap_dashboard_attendance" as never,
        {
          p_year: year,
          p_schools: ids,
          p_start: data.week,
          p_end: end.toISOString().slice(0, 10),
          p_class: data.class ?? null,
          p_division: data.division ?? null,
        } as never,
      );
      if (error)
        throw new Error(
          "Dashboard database setup required or query failed. Apply the REAP dashboard migration and retry.",
        );
      const result = aggregate as unknown as { cohorts: Cohort[]; attendance: AttendanceMetric[] };
      cohorts = result.cohorts;
      if (attendanceAllowed) attendance = result.attendance;
      if (sessionsAllowed) {
        [sessions, statuses, targets] = await Promise.all([
          fetchAllRows<SessionRow>((from, to) => {
            let q = db
              .from("sessions")
              .select("id,activity_id,school_id,unit,class,session_name,topic")
              .in("school_id", ids)
              .order("id");
            if (data.unit) q = q.eq("unit", data.unit);
            if (data.class) q = q.eq("class", data.class);
            return q.range(from, to) as unknown as PromiseLike<{
              data: SessionRow[] | null;
              error: unknown;
            }>;
          }),
          fetchAllRows<StatusRow>((from, to) => {
            let q = db
              .from("session_division_status")
              .select("session_id,school_id,division,status,updated_at")
              .in("school_id", ids)
              .order("id");
            if (data.unit) q = q.eq("unit", data.unit);
            if (data.class) q = q.eq("class", data.class);
            if (data.division !== undefined) q = q.eq("division", data.division);
            return q.range(from, to);
          }),
          fetchAllRows<AssignmentTarget>((from, to) => {
            let q = db
              .from("session_assignment_targets")
              .select("id,school_id,unit,class,division,session_count")
              .eq("academic_year", year)
              .in("school_id", ids)
              .order("id");
            if (data.unit) q = q.eq("unit", data.unit);
            if (data.class) q = q.eq("class", data.class);
            return q.range(from, to);
          }),
        ]);
      }
    }
    const targetCoverage = targets
      .filter(
        (t) => data.division === undefined || t.division === "" || t.division === data.division,
      )
      .map((t) => ({
        ...t,
        school: schools.find((s) => s.id === t.school_id)?.name || t.school_id,
        materialized: sessions.filter(
          (s) => s.school_id === t.school_id && s.unit === t.unit && s.class === t.class,
        ).length,
      }));
    const relevant = sessions.filter(
      (s) => !data.session || s.id === data.session || s.activity_id === data.session,
    );
    const metrics = sessionMetrics(relevant, cohorts, statuses, {
      from: data.from,
      to: data.to,
    }).filter((s) => !data.status || s.status === data.status);
    const trainerMetrics = trainers.map((t) => {
      const owned = relevant.filter((s) => t.all_schools || t.school_ids.includes(s.school_id));
      const rows = sessionMetrics(owned, cohorts, statuses, {
        from: data.from,
        to: data.to,
      }).filter((s) => !data.status || s.status === data.status);
      return {
        id: t.id,
        name: t.full_name || t.username,
        planned: rows.reduce((n, s) => n + s.planned, 0),
        completed: rows.reduce((n, s) => n + s.completed, 0),
      };
    });
    return {
      year,
      schools,
      selectedSchools: selected,
      trainers: trainers.map((t) => ({ id: t.id, name: t.full_name || t.username })),
      attendanceAllowed,
      sessionsAllowed,
      cohorts,
      attendance,
      metrics,
      trainerMetrics,
      targetCoverage,
      sessionOptions: sessionMetrics(sessions, cohorts, statuses).map((s) => ({
        id: s.id,
        name: s.name,
        unit: s.unit,
      })),
      kpis: {
        centres: new Set(selected.map((s) => s.cluster_name).filter(Boolean)).size,
        students: cohorts.reduce((n, c) => n + Number(c.students), 0),
        completed: metrics.reduce((n, s) => n + s.completed, 0),
      },
    };
  });
