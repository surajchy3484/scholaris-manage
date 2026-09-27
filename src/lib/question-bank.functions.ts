import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { adminDb, requirePermission } from "./app-access.server";
import { fetchAllRows } from "./fetch-all";
const token = z.object({ token: z.string().min(1) });
// Keep normalization server-local: importing client wrappers here creates a server-function cycle.
const exam = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .transform((v) => v.toUpperCase());
const klass = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .transform((v) => {
    const c = v
      .replace(/^class\s*/i, "")
      .trim()
      .toUpperCase();
    return /^\d+$/.test(c) ? String(Number(c)) : c;
  })
  .refine((v) => v.length > 0);
const optionalText = z.string().max(10000).nullable().optional();
const question = z
  .object({
    exam_type: exam,
    class: klass,
    question_no: z.number().int().min(1).max(10000),
    question_text: optionalText,
    correct_answer: z.enum(["A", "B", "C", "D"]),
    parameter: optionalText,
    chapter: optionalText,
    topic: optionalText,
    subject: optionalText,
    marks: z.number().positive().default(1),
    difficulty: z.string().max(80).default("Medium"),
  })
  .strict();
function fail(error: { code?: string; message: string }) {
  throw new Error(
    ["PGRST205", "42P01", "PGRST202", "42883"].includes(error.code ?? "")
      ? "Universal Question Master needs its database migration. Existing records remain preserved."
      : error.code === "23505"
        ? "This Exam Type + Class + Question Number already exists."
        : error.message,
  );
}
function isMissingDatabaseObject(error: { code?: string }) {
  return ["PGRST202", "PGRST205", "42P01", "42883"].includes(error.code ?? "");
}
export const listExamTypes = createServerFn({ method: "POST" })
  .validator((d: unknown) => token.parse(d))
  .handler(async ({ data }) => {
    // Dropdowns are also required by Clicker and Assessment users without question-edit permission.
    await requirePermission(data.token, "assessments", "view").catch(() =>
      requirePermission(data.token, "questions", "view").catch(() =>
        requirePermission(data.token, "clicker", "view"),
      ),
    );
    const db = await adminDb();
    const { data: rows, error } = await db.from("exam_types").select("name,visible").order("name");
    if (error) {
      if (!isMissingDatabaseObject(error)) fail(error);
      const { data: legacy, error: legacyError } = await db
        .from("assessments")
        .select("exam_type")
        .order("exam_type");
      if (legacyError) fail(legacyError);
      return [
        ...new Set(
          (legacy ?? []).map((row) =>
            String(row.exam_type ?? "")
              .trim()
              .toUpperCase(),
          ),
        ),
      ]
        .filter(Boolean)
        .map((name) => ({ name, visible: name === "ICA" }));
    }
    return rows ?? [];
  });
export const manageExamType = createServerFn({ method: "POST" })
  .validator((d: unknown) => token.extend({ name: exam, visible: z.boolean().optional() }).parse(d))
  .handler(async ({ data }) => {
    await requirePermission(data.token, "questions", data.visible === undefined ? "add" : "edit");
    const db = await adminDb();
    const result =
      data.visible === undefined
        ? await db.from("exam_types").insert({ name: data.name, visible: false })
        : await db.from("exam_types").update({ visible: data.visible }).eq("name", data.name);
    if (result.error) fail(result.error);
    return { ok: true };
  });
export const listUniversalQuestions = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    token
      .extend({
        examType: z.string().max(80).default(""),
        className: z.string().max(40).default(""),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    await requirePermission(data.token, "questions", "view");
    const db = await adminDb();
    try {
      return await fetchAllRows((from, to) => {
        let q = db
          .from("question_bank")
          .select("*")
          .order("exam_type")
          .order("class")
          .order("question_no")
          .order("id")
          .range(from, to);
        if (data.examType) q = q.eq("exam_type", exam.parse(data.examType));
        if (data.className) q = q.eq("class", klass.parse(data.className));
        return q;
      });
    } catch (error) {
      if (!isMissingDatabaseObject(error as { code?: string })) throw error;
      const [{ data: legacy, error: legacyError }, { data: assessments, error: assessmentsError }] =
        await Promise.all([
          db.from("questions").select("*").order("question_no"),
          db.from("assessments").select("assessment_id,exam_type,class"),
        ]);
      if (legacyError) fail(legacyError);
      if (assessmentsError) fail(assessmentsError);
      const context = new Map((assessments ?? []).map((row) => [row.assessment_id, row] as const));
      return (legacy ?? [])
        .map((row) => {
          const assessment = context.get(row.assessment_id);
          if (!assessment) return null;
          try {
            return {
              ...row,
              exam_type: exam.parse(assessment.exam_type),
              class: klass.parse(assessment.class),
            };
          } catch {
            return null;
          }
        })
        .filter((row): row is Record<string, unknown> => {
          if (!row) return false;
          return (
            (!data.examType || row.exam_type === exam.parse(data.examType)) &&
            (!data.className || row.class === klass.parse(data.className))
          );
        });
    }
  });
export const writeUniversalQuestions = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    token
      .extend({
        mode: z.enum(["insert", "update", "delete"]),
        rows: z.array(z.record(z.unknown())).max(500),
        ids: z.array(z.string().uuid()).max(500),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    await requirePermission(
      data.token,
      "questions",
      data.mode === "insert" ? "add" : data.mode === "update" ? "edit" : "delete",
    );
    const db = await adminDb();
    if (data.mode === "delete") {
      const r = await db.from("question_bank").delete().in("id", data.ids);
      if (r.error) {
        if (!isMissingDatabaseObject(r.error)) fail(r.error);
        const legacy = await db.from("questions").delete().in("id", data.ids);
        if (legacy.error) fail(legacy.error);
      }
      return { ok: true };
    }
    const rows = data.rows.map((r) => question.parse(r));
    if (data.mode === "update" && (rows.length !== 1 || data.ids.length !== 1))
      throw new Error("Edit one question at a time");
    const r =
      data.mode === "insert"
        ? await db.from("question_bank").insert(rows)
        : await db.from("question_bank").update(rows[0]).eq("id", data.ids[0]);
    if (r.error) fail(r.error);
    return { ok: true };
  });
export const legacyQuestionIssues = createServerFn({ method: "POST" })
  .validator((d: unknown) => token.parse(d))
  .handler(async ({ data }) => {
    await requirePermission(data.token, "questions", "view");
    const db = await adminDb();
    try {
      return await fetchAllRows((from, to) =>
        db
          .from("question_bank_migration_issues")
          .select("*")
          .eq("resolved", false)
          .order("assessment_id")
          .range(from, to),
      );
    } catch (error) {
      if (isMissingDatabaseObject(error as { code?: string })) return [];
      throw error;
    }
  });
export const promoteLegacySet = createServerFn({ method: "POST" })
  .validator((d: unknown) => token.extend({ assessmentId: z.string().min(1).max(120) }).parse(d))
  .handler(async ({ data }) => {
    await requirePermission(data.token, "questions", "add");
    const db = await adminDb();
    const { data: issue, error } = await db
      .from("question_bank_migration_issues")
      .select("*")
      .eq("assessment_id", data.assessmentId)
      .single();
    if (error) fail(error);
    if (!issue) throw new Error("Source not found");
    const rows = (issue.questions as Record<string, unknown>[]).map((q) =>
      question.parse({ ...q, exam_type: issue.exam_type, class: issue.class }),
    );
    const { error: saveError } = await db.from("question_bank").insert(rows);
    if (saveError) fail(saveError);
    // Resolving a legacy issue does not delete or rewrite its archived source.
    await db
      .from("question_bank_migration_issues")
      .update({ resolved: true })
      .eq("exam_type", issue.exam_type!)
      .eq("class", issue.class!);
    return { ok: true };
  });
