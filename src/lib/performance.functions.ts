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
  if (error)
    throw new Error("Unable to load paged data. Apply the performance migration and retry.");
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
    z.object({ token: z.string().min(1), schoolId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data }) => {
    const profile = await requirePermission(data.token, "students", "view");
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
