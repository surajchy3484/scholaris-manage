import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Assessment / Question / Clicker data contains student-identifying academic
 * records, so these tables are not reachable by the Data API roles at all.
 * Every read and write goes through these server functions, which require the
 * app's shared access password before using privileged database access.
 */
import { adminDb as admin, requirePermission } from "./app-access.server";
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
const tokenSchema = z.object({ token: z.string().min(1) });

const listSchema = tokenSchema.extend({
  table: tableSchema,
  assessmentId: z.string().max(120).optional(),
});

export const listMasterRows = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => listSchema.parse(data))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  .handler(async ({ data }): Promise<any[]> => {
    await guard(data.token, data.table, "view");
    const db = await admin();
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
      q = q.order("id"); // Stable tie-breaker prevents skipped/repeated rows across pages.
      const { data: rows, error } = await q;
      if (error) throw new Error("Failed to load records");
      const list = (rows ?? []) as Record<string, unknown>[];
      out.push(...list);
      if (list.length < batch) break;
    }
    return out;
  });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rowSchema = z.record(z.string(), z.any());

const insertSchema = tokenSchema.extend({
  table: tableSchema,
  rows: z.array(rowSchema).min(1).max(1000),
});

export const insertMasterRows = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => insertSchema.parse(data))
  .handler(async ({ data }) => {
    await guard(data.token, data.table, "add");
    const db = await admin();
    const { error } = await db.from(data.table).insert(data.rows as never);
    if (error) {
      throw new Error(error.code === "23505" ? "DUPLICATE" : "Failed to save records");
    }
    if (data.table === "clicker_records") {
      const assessmentIds = [
        ...new Set(
          data.rows
            .map((row) => (typeof row.assessment_id === "string" ? row.assessment_id : null))
            .filter((id): id is string => !!id),
        ),
      ];
      const { data: assessmentRows, error: assessmentError } = assessmentIds.length
        ? await db
            .from("assessments")
            .select("assessment_id,exam_type")
            .in("assessment_id", assessmentIds)
        : { data: [], error: null };
      if (assessmentError) throw new Error("Failed to resolve Clicker exam type");
      const examTypes = new Map(
        (assessmentRows ?? []).map((row) => [row.assessment_id, row.exam_type]),
      );
      for (const row of data.rows) {
        const studentId = typeof row.student_id === "string" ? row.student_id : null;
        const schoolId = typeof row.school_id === "string" ? row.school_id : null;
        const score = Number(row.correct_rate ?? row.score);
        if (!studentId || !schoolId || !Number.isFinite(score)) continue;
        const examType =
          typeof row.assessment_id === "string" ? examTypes.get(row.assessment_id) || "ICA" : "ICA";
        const { data: existing, error: lookupError } = await db
          .from("exam_scores")
          .select("id")
          .eq("student_id", studentId)
          .eq("exam_type", examType)
          .limit(1);
        if (lookupError) throw new Error("Failed to synchronize Clicker score");
        if (existing?.[0]?.id) {
          const { error: syncError } = await db
            .from("exam_scores")
            .update({ score })
            .eq("id", existing[0].id);
          if (syncError) throw new Error("Failed to synchronize Clicker score");
        } else {
          const { error: syncError } = await db.from("exam_scores").insert({
            school_id: schoolId,
            student_id: studentId,
            exam_type: examType,
            score,
          });
          if (syncError) throw new Error("Failed to synchronize Clicker score");
        }
      }
    }
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
    await guard(data.token, data.table, "edit");
    const db = await admin();
    const { error } = await db
      .from(data.table)
      .update(data.patch as never)
      .in("id", data.ids);
    if (error) throw new Error("Failed to update records");
    if (
      data.table === "clicker_records" &&
      data.patch.score !== undefined &&
      data.patch.student_id
    ) {
      const score = Number(data.patch.correct_rate ?? data.patch.score);
      const schoolId = typeof data.patch.school_id === "string" ? data.patch.school_id : null;
      if (Number.isFinite(score) && schoolId) {
        const { data: assessment } =
          typeof data.patch.assessment_id === "string"
            ? await db
                .from("assessments")
                .select("exam_type")
                .eq("assessment_id", data.patch.assessment_id)
                .maybeSingle()
            : { data: null };
        const examType = assessment?.exam_type || "ICA";
        const { data: existing, error: lookupError } = await db
          .from("exam_scores")
          .select("id")
          .eq("student_id", data.patch.student_id)
          .eq("exam_type", examType)
          .limit(1);
        if (lookupError) throw new Error("Failed to synchronize Clicker score");
        if (existing?.[0]?.id) {
          const { error: syncError } = await db
            .from("exam_scores")
            .update({ score })
            .eq("id", existing[0].id);
          if (syncError) throw new Error("Failed to synchronize Clicker score");
        } else {
          const { error: syncError } = await db.from("exam_scores").insert({
            school_id: schoolId,
            student_id: data.patch.student_id,
            exam_type: examType,
            score,
          });
          if (syncError) throw new Error("Failed to synchronize Clicker score");
        }
      }
    }
    return { ok: true };
  });

const deleteSchema = tokenSchema.extend({
  table: tableSchema,
  ids: z.array(z.string().uuid()).min(1).max(1000),
});

export const deleteMasterRows = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => deleteSchema.parse(data))
  .handler(async ({ data }) => {
    await guard(data.token, data.table, "delete");
    const db = await admin();
    const { error } = await db.from(data.table).delete().in("id", data.ids);
    if (error) throw new Error("Failed to delete records");
    return { ok: true };
  });
