import { supabase } from "@/integrations/supabase/client";
import type { School, Student } from "./types";

/**
 * Exam Report module — data layer.
 *
 * Scores live in `exam_scores` keyed by `exam_type`, so new exam types
 * (Final Exam, Unit Test, Midterm, Annual) and subject/year breakdowns can be
 * added later without a schema change.
 *
 * `ATTENDANCE` is stored as an exam_type too: it acts as a manual override of
 * the attendance percentage computed from the `attendance` table.
 */
export const EXAM_TYPES = ["ICA", "IMF"] as const;
export type ExamType = (typeof EXAM_TYPES)[number];
export const ATTENDANCE_TYPE = "ATTENDANCE";

export type PerfStatus =
  | "Excellent"
  | "Very Good"
  | "Good"
  | "Average"
  | "Needs Improvement";

export function performanceStatus(pct: number): PerfStatus {
  if (pct >= 90) return "Excellent";
  if (pct >= 75) return "Very Good";
  if (pct >= 60) return "Good";
  if (pct >= 40) return "Average";
  return "Needs Improvement";
}

export const STATUS_COLORS: Record<PerfStatus, string> = {
  Excellent: "bg-success/15 text-success border-success/30",
  "Very Good": "bg-primary/15 text-primary border-primary/30",
  Good: "bg-accent text-accent-foreground border-accent",
  Average: "bg-warm/50 text-warm-foreground border-warm",
  "Needs Improvement": "bg-destructive/15 text-destructive border-destructive/30",
};

/** Distribution buckets used by the pie chart. */
export const DISTRIBUTION_BUCKETS = [
  "Excellent",
  "Good",
  "Average",
  "Needs Improvement",
] as const;

export function distributionBucket(pct: number): (typeof DISTRIBUTION_BUCKETS)[number] {
  if (pct >= 90) return "Excellent";
  if (pct >= 75) return "Good";
  if (pct >= 40) return "Average";
  return "Needs Improvement";
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return round1(values.reduce((a, b) => a + b, 0) / values.length);
}

export type StudentReport = Student & {
  school_name: string;
  school_code: string;
  attendance_pct: number;
  attendance_override: number | null;
  ica: number | null;
  imf: number | null;
  performance: number;
  status: PerfStatus;
  remarks: string | null;
};

export type SchoolReport = {
  school: School;
  students: number;
  attendance: number;
  ica: number;
  imf: number;
  performance: number;
  status: PerfStatus;
};

export type ExamData = {
  schools: School[];
  students: StudentReport[];
};

type ScoreRow = {
  student_id: string;
  exam_type: string;
  score: number;
  remarks: string | null;
};

export async function fetchExamData(): Promise<ExamData> {
  const [schoolsRes, studentsRes, attendanceRes, scoresRes] = await Promise.all([
    supabase.from("schools").select("*").order("name"),
    supabase.from("students").select("*"),
    supabase.from("attendance").select("student_id,status"),
    supabase.from("exam_scores").select("student_id,exam_type,score,remarks"),
  ]);
  if (schoolsRes.error) throw schoolsRes.error;
  if (studentsRes.error) throw studentsRes.error;

  const schools = (schoolsRes.data ?? []) as School[];
  const schoolById = new Map(schools.map((s) => [s.id, s]));

  const attTotals = new Map<string, { present: number; total: number }>();
  for (const a of (attendanceRes.data ?? []) as { student_id: string; status: string }[]) {
    const cur = attTotals.get(a.student_id) ?? { present: 0, total: 0 };
    cur.total += 1;
    if (a.status === "present") cur.present += 1;
    attTotals.set(a.student_id, cur);
  }

  const scores = new Map<string, Map<string, ScoreRow>>();
  for (const row of (scoresRes.data ?? []) as ScoreRow[]) {
    const m = scores.get(row.student_id) ?? new Map<string, ScoreRow>();
    m.set(row.exam_type, row);
    scores.set(row.student_id, m);
  }

  const students: StudentReport[] = ((studentsRes.data ?? []) as Student[]).map((s) => {
    const school = schoolById.get(s.school_id);
    const m = scores.get(s.id);
    const ica = m?.get("ICA")?.score ?? null;
    const imf = m?.get("IMF")?.score ?? null;
    const override = m?.get(ATTENDANCE_TYPE)?.score ?? null;
    const t = attTotals.get(s.id);
    const computed = t && t.total > 0 ? round1((t.present / t.total) * 100) : 0;
    const performance = round1(((ica ?? 0) + (imf ?? 0)) / 2);
    return {
      ...s,
      school_name: school?.name ?? "—",
      school_code: school?.code ?? "—",
      attendance_override: override,
      attendance_pct: override ?? computed,
      ica,
      imf,
      performance,
      status: performanceStatus(performance),
      remarks: m?.get("ICA")?.remarks ?? null,
    };
  });

  return { schools, students };
}

export function buildSchoolReports(data: ExamData): SchoolReport[] {
  return data.schools.map((school) => {
    const list = data.students.filter((s) => s.school_id === school.id);
    const attendance = avg(list.map((s) => s.attendance_pct));
    const ica = avg(list.filter((s) => s.ica != null).map((s) => s.ica as number));
    const imf = avg(list.filter((s) => s.imf != null).map((s) => s.imf as number));
    const performance = round1((ica + imf) / 2);
    return {
      school,
      students: list.length,
      attendance,
      ica,
      imf,
      performance,
      status: performanceStatus(performance),
    };
  });
}

export type ClassReport = {
  key: string;
  class: string;
  division: string;
  students: number;
  attendance: number;
  ica: number;
  imf: number;
  performance: number;
  status: PerfStatus;
};

export function buildClassReports(students: StudentReport[]): ClassReport[] {
  const groups = new Map<string, StudentReport[]>();
  for (const s of students) {
    const key = `${s.class}|${s.division}`;
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  return [...groups.entries()]
    .map(([key, list]) => {
      const attendance = avg(list.map((s) => s.attendance_pct));
      const ica = avg(list.filter((s) => s.ica != null).map((s) => s.ica as number));
      const imf = avg(list.filter((s) => s.imf != null).map((s) => s.imf as number));
      const performance = round1((ica + imf) / 2);
      const [cls, division] = key.split("|");
      return {
        key,
        class: cls,
        division,
        students: list.length,
        attendance,
        ica,
        imf,
        performance,
        status: performanceStatus(performance),
      };
    })
    .sort((a, b) => {
      const na = Number(a.class);
      const nb = Number(b.class);
      if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb;
      return a.class.localeCompare(b.class) || a.division.localeCompare(b.division);
    });
}

/** Upsert one score row (ICA / IMF / ATTENDANCE override) for a student. */
export async function saveScore(params: {
  schoolId: string;
  studentId: string;
  examType: string;
  score: number | null;
  remarks?: string | null;
}) {
  const { schoolId, studentId, examType, score, remarks } = params;
  if (score == null) {
    const { error } = await supabase
      .from("exam_scores")
      .delete()
      .eq("student_id", studentId)
      .eq("exam_type", examType);
    if (error) throw error;
    return;
  }
  const { data: existing, error: selErr } = await supabase
    .from("exam_scores")
    .select("id")
    .eq("student_id", studentId)
    .eq("exam_type", examType)
    .limit(1);
  if (selErr) throw selErr;
  if (existing && existing.length > 0) {
    const { error } = await supabase
      .from("exam_scores")
      .update({ score, remarks: remarks ?? null })
      .eq("id", existing[0].id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("exam_scores").insert({
      school_id: schoolId,
      student_id: studentId,
      exam_type: examType,
      score,
      remarks: remarks ?? null,
    });
    if (error) throw error;
  }
}

export const CLASS_OPTIONS = Array.from({ length: 12 }, (_, i) => String(i + 1));
export const DIVISION_OPTIONS = ["A", "B", "C", "D"];
