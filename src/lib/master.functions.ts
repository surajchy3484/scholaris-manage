import { academicDb } from "./academic-db.server";
import { writeClicker } from "./universal-clicker.server";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Assessment / Question / Clicker data contains student-identifying academic
 * records, so these tables are not reachable by the Data API roles at all.
 * Every read and write goes through these server functions, which require the
 * app's shared access password before using privileged database access.
 */
import { requirePermission } from "./app-access.server";
import { canSeeSchool } from "./access-control";
import type { AppAction, AppModule } from "./access-control";

const MODULE_FOR: Record<
  "assessments" | "questions" | "clicker_records" | "assessment_results",
  AppModule
> = {
  assessments: "assessments",
  questions: "questions",
  clicker_records: "clicker",
  assessment_results: "clicker",
};

const guard = (
  token: string,
  table: "assessments" | "questions" | "clicker_records" | "assessment_results",
  action: AppAction,
) => requirePermission(token, MODULE_FOR[table], action);

const tableSchema = z.enum(["assessments", "questions", "clicker_records", "assessment_results"]);
const tokenSchema = z.object({
  academicYear: z.string().max(80).optional(),
  token: z.string().min(1),
});

const listSchema = tokenSchema.extend({
  table: tableSchema,
  assessmentId: z.string().max(120).optional(),
});

export const listMasterRows = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => listSchema.parse(data))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  .handler(async ({ data }): Promise<any[]> => {
    const profile = await guard(data.token, data.table, "view");
    const db = await academicDb(data.academicYear);
    const out: Record<string, unknown>[] = [];
    const batch = 1000;
    for (let from = 0; ; from += batch) {
      let q = db
        .from(data.table)
        .select("*")
        .range(from, from + batch - 1);
      if (data.table === "assessments") q = q.order("created_at", { ascending: false });
      else if (data.table === "questions") q = q.order("question_no");
      else if (data.table === "assessment_results") q = q.order("ranking", { nullsFirst: false });
      else q = q.order("ranking", { nullsFirst: false });
      if (data.assessmentId && data.assessmentId !== "all" && data.table !== "assessments") {
        q = q.eq("assessment_id", data.assessmentId);
      }
      if (data.table !== "questions" && profile.role !== "admin" && !profile.allSchools)
        q = q.in("school_id", profile.schoolIds);
      q = q.order("id"); // Stable tie-breaker prevents skipped/repeated rows across pages.
      const { data: rows, error } = await q;
      if (error) throw new Error("Failed to load records");
      const list = (rows ?? []) as Record<string, unknown>[];
      out.push(...list);
      if (list.length < batch) break;
    }
    return out;
  });

const rowSchema = z.record(z.string(), z.any());

const insertSchema = tokenSchema.extend({
  table: tableSchema,
  rows: z.array(rowSchema).min(1).max(1000),
});

export const insertMasterRows = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => insertSchema.parse(data))
  .handler(async ({ data }) => {
    const profile = await guard(data.token, data.table, "add");
    if (data.table === "questions")
      throw new Error("Use the universal Question Master to add questions.");
    if (data.table === "assessment_results")
      throw new Error("Results are calculated by Clicker evaluation.");
    if (data.table === "clicker_records")
      return writeClicker(profile, "insert", data.rows, [], {}, data.academicYear);
    const db = await academicDb(data.academicYear);
    if (data.rows.some((r) => !r.school_id || !canSeeSchool(profile, String(r.school_id))))
      throw new Error("School access denied");
    const { error } = await db.from(data.table).insert(data.rows.map(assessmentValues) as never);
    if (error) throw new Error(error.code === "23505" ? "DUPLICATE" : error.message);
    return { ok: true, count: data.rows.length };
  });

const updateSchema = tokenSchema.extend({
  table: tableSchema,
  ids: z.array(z.string().uuid()).min(1).max(1000),
  patch: rowSchema,
});

export const updateMasterRows = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => updateSchema.parse(data))
  .handler(async ({ data }) => {
    const profile = await guard(data.token, data.table, "edit");
    if (data.table === "questions")
      throw new Error("Use the universal Question Master to edit questions.");
    if (data.table === "assessment_results")
      throw new Error("Results are calculated by Clicker evaluation.");
    if (data.table === "clicker_records")
      return writeClicker(profile, "update", [], data.ids, data.patch, data.academicYear);
    const db = await academicDb(data.academicYear);
    await checkedAssessmentIds(db, profile, data.ids);
    if (data.patch.school_id && !canSeeSchool(profile, String(data.patch.school_id)))
      throw new Error("School access denied");
    const { error } = await db
      .from(data.table)
      .update(assessmentValues(data.patch) as never)
      .in("id", data.ids);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const deleteSchema = tokenSchema.extend({
  table: tableSchema,
  ids: z.array(z.string().uuid()).min(1).max(1000),
});

export const deleteMasterRows = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => deleteSchema.parse(data))
  .handler(async ({ data }) => {
    const profile = await guard(data.token, data.table, "delete");
    if (data.table === "questions")
      throw new Error("Legacy questions are preserved. Use the universal Question Master.");
    if (data.table === "assessment_results")
      throw new Error("Manage results through Clicker Master.");
    if (data.table === "clicker_records")
      return writeClicker(profile, "delete", [], data.ids, {}, data.academicYear);
    const db = await academicDb(data.academicYear);
    await checkedAssessmentIds(db, profile, data.ids);
    const { error } = await db.from(data.table).delete().in("id", data.ids);
    if (error) throw new Error("Failed to delete records");
    return { ok: true };
  });

async function checkedAssessmentIds(
  db: Awaited<ReturnType<typeof academicDb>>,
  profile: import("./access-control").AccessProfile,
  ids: string[],
) {
  const { data, error } = await db.from("assessments").select("id,school_id").in("id", ids);
  if (error || data?.length !== new Set(ids).size)
    throw new Error("Assessment is not in the selected academic year");
  if (data.some((r) => !r.school_id || !canSeeSchool(profile, r.school_id)))
    throw new Error("School access denied");
}

function assessmentValues(row: Record<string, unknown>) {
  const editable = new Set([
    "assessment_id",
    "exam_type",
    "name",
    "academic_year",
    "subject",
    "total_marks",
    "passing_marks",
    "date",
    "school_id",
    "school_name",
    "class",
    "section",
    "total_questions",
    "status",
    "question_set_version_id",
  ]);
  return Object.fromEntries(Object.entries(row).filter(([key]) => editable.has(key)));
}
