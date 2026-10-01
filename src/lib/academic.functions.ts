import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { adminDb, requireAdmin, requirePermission, resolveAccess } from "./app-access.server";
import { can, canSeeSchool } from "./access-control";
import { fetchAllRows } from "./fetch-all";
import type { SupabaseClient } from "@supabase/supabase-js";
const token = z.object({ token: z.string().min(1) });
const year = z.string().min(1).max(80);
const status = z.enum(["Active", "Promoted", "Transferred", "Left School", "Inactive"]);
export type AcademicYear = { id: string; name: string; is_current: boolean };
export type Enrollment = {
  id: string;
  student_id: string;
  academic_year: string;
  school_id: string;
  class: string;
  division: string;
  roll_number: string;
  status: string;
  students: { name: string; student_code: string; photo_url: string | null };
};
async function academicViewer(value: string) {
  const profile = await resolveAccess(value);
  if (
    !["students", "exam_report", "session_status", "assessments", "clicker"].some((m) =>
      can(profile, m as "students", "view"),
    )
  )
    throw new Error("Academic records access denied");
  return profile;
}
async function db() {
  return (await adminDb()) as unknown as SupabaseClient;
}
function failed(error: { message: string; code?: string } | null) {
  if (error)
    throw new Error(
      ["42P01", "PGRST205", "PGRST202"].includes(error.code ?? "")
        ? "Apply the Academic Year database migration first. Existing records are preserved."
        : error.message,
    );
}
export const listAcademicYears = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => token.parse(d))
  .handler(async ({ data }): Promise<AcademicYear[]> => {
    await resolveAccess(data.token);
    const result = await (
      await db()
    )
      .from("academic_years")
      .select("id,name,is_current")
      .order("id", { ascending: false });
    failed(result.error);
    return result.data ?? [];
  });
export const saveAcademicYear = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    token
      .extend({ id: year, name: z.string().trim().min(1).max(80), create: z.boolean() })
      .refine(
        (d) => !d.create || /^\d{4}(?:-\d{2,4})?$/.test(d.id.replace(/[–—]/g, "-")),
        "Use a year such as 2026-27 or 2026-2027",
      )
      .parse(d),
  )
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const query = (await db()).from("academic_years");
    const result = data.create
      ? await query.insert({ id: data.id.replace(/[–—]/g, "-"), name: data.name })
      : await query.update({ name: data.name }).eq("id", data.id);
    failed(result.error);
    return { ok: true };
  });
export const setCurrentAcademicYear = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => token.extend({ year }).parse(d))
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const result = await (await db()).rpc("academic_set_current", { p_year: data.year });
    failed(result.error);
    return { ok: true };
  });
export const listEnrollments = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    token
      .extend({
        year,
        schoolId: z.string().uuid().optional(),
        className: z.string().max(100).optional(),
        division: z.string().max(100).optional(),
        search: z.string().max(200).default(""),
        page: z.number().int().min(0).default(0),
        size: z.number().int().min(1).max(500).default(50),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ rows: Enrollment[]; total: number }> => {
    const profile = await academicViewer(data.token);
    if (data.schoolId && !canSeeSchool(profile, data.schoolId))
      throw new Error("School access denied");
    let q = (await db())
      .from("student_enrollments")
      .select("*,students!inner(name,student_code,photo_url)", { count: "exact" })
      .eq("academic_year", data.year);
    if (data.schoolId) q = q.eq("school_id", data.schoolId);
    if (data.className) q = q.eq("class", data.className);
    if (data.division) q = q.eq("division", data.division);
    if (profile.role !== "admin" && !profile.allSchools) q = q.in("school_id", profile.schoolIds);
    if (data.search) q = q.ilike("students.name", `%${data.search.replace(/[\\%_]/g, "\\$&")}%`);
    const result = await q
      .order("class")
      .order("division")
      .order("roll_number")
      .order("id")
      .range(data.page * data.size, (data.page + 1) * data.size - 1);
    failed(result.error);
    return { rows: (result.data ?? []) as Enrollment[], total: result.count ?? 0 };
  });
export const promoteEnrollments = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    token
      .extend({
        source: year,
        target: year,
        rows: z
          .array(
            z.object({
              source_id: z.string().uuid(),
              school_id: z.string().uuid(),
              class: z.string().trim().min(1).max(50),
              division: z.string().max(60),
              roll_number: z.string().max(100),
              status,
            }),
          )
          .min(1)
          .max(500),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const profile = await requireAdmin(data.token);
    const result = await (
      await db()
    ).rpc("academic_promote", {
      p_source: data.source,
      p_target: data.target,
      p_rows: data.rows,
      p_schools: profile.role === "admin" || profile.allSchools ? null : profile.schoolIds,
    });
    failed(result.error);
    return { count: result.data as number };
  });
export const setEnrollmentStatus = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => token.extend({ id: z.string().uuid(), status }).parse(d))
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const result = await (
      await db()
    )
      .from("student_enrollments")
      .update({ status: data.status, updated_at: new Date().toISOString() })
      .eq("id", data.id);
    failed(result.error);
    return { ok: true };
  });
export const academicSchools = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => token.parse(d))
  .handler(async ({ data }) => {
    const profile = await academicViewer(data.token);
    const client = await db();
    return fetchAllRows<{ id: string; name: string }>((from, to) => {
      let q = client.from("schools").select("id,name").order("name").order("id");
      if (profile.role !== "admin" && !profile.allSchools) q = q.in("id", profile.schoolIds);
      return q.range(from, to);
    });
  });
export const studentAcademicHistory = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => token.extend({ studentId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const profile = await requirePermission(data.token, "exam_report", "view");
    const result = await (
      await db()
    ).rpc("academic_student_history", {
      p_student: data.studentId,
      p_schools: profile.role === "admin" || profile.allSchools ? null : profile.schoolIds,
    });
    failed(result.error);
    return result.data as {
      enrollments: (Enrollment & { school_name: string })[];
      results: HistoryResult[];
      scores: { academic_year: string; exam_type: string; score: number }[];
      attendance: { academic_year: string; percentage: number }[];
      sessions: { academic_year: string; unit: string; total: number; complete: number }[];
    };
  });
export type HistoryResult = {
  id: string;
  academic_year: string;
  exam_type: string;
  score: number;
  correct_rate: number;
  ranking: number;
  answers: Record<string, string>;
  question_snapshot:
    | {
        question_no: number;
        correct_answer: string;
        parameter?: string;
        chapter?: string;
        topic?: string;
      }[]
    | null;
};
export type QuestionSetVersion = {
  id: string;
  name: string;
  exam_type: string;
  class: string;
  academic_year: string | null;
};
export const listQuestionSetVersions = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => token.parse(d))
  .handler(async ({ data }): Promise<QuestionSetVersion[]> => {
    const profile = await resolveAccess(data.token);
    if (
      !["questions", "assessments", "clicker"].some((m) => can(profile, m as "questions", "view"))
    )
      throw new Error("Permission denied");
    return fetchAllRows<QuestionSetVersion>((from, to) =>
      db().then((client) =>
        client
          .from("question_set_versions")
          .select("id,name,exam_type,class,academic_year")
          .order("created_at", { ascending: false })
          .order("id")
          .range(from, to),
      ),
    );
  });
export const saveQuestionSetVersion = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    token
      .extend({
        examType: z.string().trim().min(1).max(80),
        className: z.string().trim().min(1).max(50),
        name: z.string().trim().min(1).max(150),
        year: year.optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    await requirePermission(data.token, "questions", "add");
    const result = await (
      await db()
    ).rpc("academic_capture_question_set", {
      p_exam: data.examType,
      p_class: data.className,
      p_name: data.name,
      p_year: data.year ?? null,
    });
    failed(result.error);
    return { id: result.data as string };
  });
export const nextPermanentStudentCode = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => token.extend({ schoolId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const profile = await academicViewer(data.token);
    if (!canSeeSchool(profile, data.schoolId)) throw new Error("School access denied");
    const result = await (
      await db()
    ).rpc("academic_next_student_code", { p_school: data.schoolId });
    failed(result.error);
    return result.data as string;
  });
