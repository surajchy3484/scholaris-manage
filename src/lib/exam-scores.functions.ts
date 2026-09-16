import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Exam scores are student academic records: the table is not readable or
 * writable by the Data API roles at all. Every access goes through these
 * server functions, which require the app's shared access password.
 */
import { adminDb as admin, requirePermission } from "./app-access.server";

const tokenSchema = z.object({ token: z.string().min(1) });

export type ExamScoreRow = {
  student_id: string;
  exam_type: string;
  score: number;
  remarks: string | null;
};

export const listExamScores = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => tokenSchema.parse(data))
  .handler(async ({ data }): Promise<ExamScoreRow[]> => {
    await requirePermission(data.token, "exam_report", "view");
    const db = await admin();
    const out: ExamScoreRow[] = [];
    const batch = 1000;
    for (let from = 0; ; from += batch) {
      const { data: rows, error } = await db
        .from("exam_scores")
        .select("student_id,exam_type,score,remarks")
        .range(from, from + batch - 1);
      if (error) throw new Error("Failed to load exam scores");
      const list = (rows ?? []) as ExamScoreRow[];
      out.push(...list);
      if (list.length < batch) break;
    }
    return out;
  });

const saveSchema = tokenSchema.extend({
  schoolId: z.string().uuid(),
  studentId: z.string().uuid(),
  examType: z.string().min(1).max(64),
  score: z.number().min(0).max(100).nullable(),
  remarks: z.string().max(2000).nullable().optional(),
});

export const saveExamScore = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => saveSchema.parse(data))
  .handler(async ({ data }) => {
    await requirePermission(data.token, "exam_report", "edit");
    const db = await admin();
    const { schoolId, studentId, examType, score, remarks } = data;

    if (score == null) {
      const { error } = await db
        .from("exam_scores")
        .delete()
        .eq("student_id", studentId)
        .eq("exam_type", examType);
      if (error) throw new Error("Failed to remove score");
      return { ok: true };
    }

    const { data: existing, error: selErr } = await db
      .from("exam_scores")
      .select("id")
      .eq("student_id", studentId)
      .eq("exam_type", examType)
      .limit(1);
    if (selErr) throw new Error("Failed to save score");

    if (existing && existing.length > 0) {
      const { error } = await db
        .from("exam_scores")
        .update({ score, remarks: remarks ?? null })
        .eq("id", existing[0].id);
      if (error) throw new Error("Failed to save score");
    } else {
      const { error } = await db.from("exam_scores").insert({
        school_id: schoolId,
        student_id: studentId,
        exam_type: examType,
        score,
        remarks: remarks ?? null,
      });
      if (error) throw new Error("Failed to save score");
    }
    return { ok: true };
  });

const deleteSchema = tokenSchema.extend({
  studentIds: z.array(z.string().uuid()).min(1).max(1000),
});

export const deleteScoresForStudents = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => deleteSchema.parse(data))
  .handler(async ({ data }) => {
    await requirePermission(data.token, "exam_report", "delete");
    const db = await admin();
    const { error } = await db.from("exam_scores").delete().in("student_id", data.studentIds);
    if (error) throw new Error("Failed to delete scores");
    return { ok: true };
  });
