import { COMPAT_READS, readWithoutPagingRpc } from "./paging-compat.server";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { adminDb, requirePermission } from "./app-access.server";
import { canSeeSchool } from "./access-control";
import type { PageResult } from "./paging";

const grid = z.object({
  page: z.number().int().min(0).max(1_000_000),
  pageSize: z.number().int().min(1).max(250),
  search: z.string().max(200),
  sortKey: z.string().max(80).nullable(),
  direction: z.enum(["asc", "desc"]),
});
const schema = grid.extend({
  token: z.string().min(1),
  table: z.enum(["assessments", "questions", "clicker_records"]),
  assessmentId: z.string().max(120).optional(),
  subject: z.string().max(200).optional(),
  minScore: z.number().finite().optional(),
});
// RPCs are service-role-only and invoker-security. All callers pass through the existing module guard.
async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const db = await adminDb();
  const { data, error } = await db.rpc(name as never, args as never);
  if (error) {
    const missing =
      error.code === "PGRST202" || (error.code === "42883" && error.message.includes(name));
    if (missing && COMPAT_READS.has(name)) return (await readWithoutPagingRpc(db, name, args)) as T;
    if (missing)
      throw new Error(
        "This action requires a database update. Please contact your administrator; no records were changed.",
      );
    throw new Error("Unable to load data. Please retry or contact your administrator.");
  }
  return data as T;
}
export const listMasterPage = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => schema.parse(d))
  .handler(async ({ data }) => {
    const profile = await requirePermission(
      data.token,
      data.table === "clicker_records" ? "clicker" : data.table,
      "view",
    );
    return rpc<
      PageResult<
        | import("./master").Assessment
        | import("./master").Question
        | import("./master").ClickerRecord
      >
    >("performance_master_page", {
      p_table: data.table,
      p_page: data.page,
      p_size: data.pageSize,
      p_search: data.search,
      p_sort: data.sortKey,
      p_desc: data.direction === "desc",
      p_assessment: data.assessmentId ?? "all",
      p_subject: data.subject ?? "",
      p_min_score: data.minScore ?? null,
      p_schools: profile.role === "admin" || profile.allSchools ? null : profile.schoolIds,
    });
  });
export const listStudentPage = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    grid
      .extend({
        token: z.string().min(1),
        schoolId: z.string().uuid(),
        klass: z.string().max(100),
        division: z.string().max(100),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const profile = await requirePermission(data.token, "students", "view");
    if (!canSeeSchool(profile, data.schoolId)) throw new Error("School access denied");
    return rpc<PageResult<import("./types").Student>>("performance_student_page", {
      p_school: data.schoolId,
      p_class: data.klass,
      p_division: data.division,
      p_search: data.search,
      p_page: data.page,
      p_size: data.pageSize,
      p_sort: data.sortKey ?? "roll-asc",
    });
  });
export const studentFacets = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        token: z.string().min(1),
        schoolId: z.string().uuid(),
        module: z.enum(["students", "exam_report"]).default("students"),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const profile = await requirePermission(data.token, data.module, "view");
    if (!canSeeSchool(profile, data.schoolId)) throw new Error("School access denied");
    return rpc<{ total: number; groups: { class: string; division: string }[] }>(
      "performance_student_facets",
      { p_school: data.schoolId },
    );
  });
export const importStudentBatch = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        token: z.string().min(1),
        schoolId: z.string().uuid(),
        rows: z
          .array(
            z.object({
              name: z.string().trim().min(1).max(300),
              class: z.string().trim().min(1).max(100),
              division: z.string().trim().min(1).max(100),
              roll_number: z.string().trim().min(1).max(100),
            }),
          )
          .min(1)
          .max(250),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const profile = await requirePermission(data.token, "students", "import");
    if (!canSeeSchool(profile, data.schoolId)) throw new Error("School access denied");
    return rpc<number>("performance_import_students", {
      p_school: data.schoolId,
      p_rows: data.rows,
    });
  });
export const listClickerQuestionKeys = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({ token: z.string().min(1), assessmentIds: z.array(z.string().max(120)).max(250) })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const profile = await requirePermission(data.token, "clicker", "view");
    return rpc<{ assessment_id: string; question_no: number; correct_answer: string }[]>(
      "performance_question_keys",
      {
        p_assessments: data.assessmentIds,
        p_schools: profile.role === "admin" || profile.allSchools ? null : profile.schoolIds,
      },
    );
  });

export const listStudentDetails = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    grid
      .extend({
        token: z.string().min(1),
        module: z.enum(["students", "exam_report"]),
        schoolId: z.string().uuid(),
        klass: z.string().max(100),
        division: z.string().max(100),
        attendance: z.enum(["all", "recorded", "missing", "below75", "atleast75"]),
        exam: z.enum(["ICA", "IMF", "FCA"]),
        status: z.enum(["all", "recorded", "missing"]),
        min: z.number().min(0).max(100).nullable(),
        max: z.number().min(0).max(100).nullable(),
      })
      .refine(
        (d) => d.min === null || d.max === null || d.min <= d.max,
        "Minimum must not exceed maximum",
      )
      .parse(d),
  )
  .handler(async ({ data }) => {
    const profile = await requirePermission(data.token, data.module, "view");
    if (!canSeeSchool(profile, data.schoolId)) throw new Error("School access denied");
    return rpc<PageResult<import("./student-list").StudentListRow>>("student_details_page", {
      p_school: data.schoolId,
      p_class: data.klass,
      p_division: data.division,
      p_search: data.search,
      p_page: data.page,
      p_size: data.pageSize,
      p_sort: data.sortKey ?? "roll-asc",
      p_attendance: data.attendance,
      p_exam: data.exam,
      p_status: data.status,
      p_min: data.min,
      p_max: data.max,
    });
  });
export const deleteStudentDetails = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        token: z.string().min(1),
        module: z.enum(["students", "exam_report"]),
        schoolId: z.string().uuid(),
        ids: z.array(z.string().uuid()).min(1).max(250),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const profile = await requirePermission(data.token, data.module, "delete");
    if (!canSeeSchool(profile, data.schoolId)) throw new Error("School access denied");
    await rpc<null>("delete_student_details", { p_school: data.schoolId, p_ids: data.ids });
    return { ok: true };
  });
export const saveStudentDetails = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        token: z.string().min(1),
        module: z.enum(["students", "exam_report"]),
        schoolId: z.string().uuid(),
        id: z.string().uuid().optional(),
        values: z.object({
          name: z.string().trim().min(1).max(300),
          class: z.string().trim().min(1).max(100),
          division: z.string().trim().min(1).max(100),
          roll_number: z.string().trim().min(1).max(100),
          student_code: z.string().trim().min(1).max(200).optional(),
          photo_url: z.string().nullable(),
          enrollment_date: z.string().nullable().optional(),
        }),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const profile = await requirePermission(data.token, data.module, data.id ? "edit" : "add");
    if (!canSeeSchool(profile, data.schoolId)) throw new Error("School access denied");
    const db = await adminDb();
    if (data.id) {
      const { data: row, error } = await db
        .from("students")
        .update(data.values)
        .eq("id", data.id)
        .eq("school_id", data.schoolId)
        .select("id")
        .single();
      if (error || !row)
        throw new Error("Unable to update student; check duplicate ID or roll number");
      return row;
    }
    if (!data.values.student_code) throw new Error("Student ID is required");
    const { data: row, error } = await db
      .from("students")
      .insert({ ...data.values, student_code: data.values.student_code, school_id: data.schoolId })
      .select("id")
      .single();
    if (error || !row) throw new Error("Unable to add student; check duplicate ID or roll number");
    return row;
  });
export const updateStudentGrouping = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        token: z.string().min(1),
        schoolId: z.string().uuid(),
        ids: z.array(z.string().uuid()).min(1).max(250),
        values: z
          .object({
            class: z.string().trim().min(1).max(100).optional(),
            division: z.string().trim().min(1).max(100).optional(),
            roll_number: z.string().trim().min(1).max(100).optional(),
          })
          .refine((v) => Object.keys(v).length > 0),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const profile = await requirePermission(data.token, "students", "edit");
    if (!canSeeSchool(profile, data.schoolId)) throw new Error("School access denied");
    const db = await adminDb();
    const { error } = await db
      .from("students")
      .update(data.values)
      .eq("school_id", data.schoolId)
      .in("id", data.ids);
    if (error) throw new Error("Unable to update students; check duplicate roll numbers");
    return { ok: true };
  });
