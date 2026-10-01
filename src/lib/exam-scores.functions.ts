import { academicDb } from "./academic-db.server";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Exam scores are student academic records: the table is not readable or
 * writable by the Data API roles at all. Every access goes through these
 * server functions, which require the app's shared access password.
 */
import { requirePermission } from "./app-access.server";

import { canSeeSchool } from "./access-control";
const tokenSchema = z.object({
  academicYear: z.string().max(80).optional(),
  token: z.string().min(1),
});

export type ExamScoreRow = {
  student_id: string;
  exam_type: string;
  score: number;
  remarks: string | null;
};

export const listExamScores = createServerFn({ method: "POST" })
  .validator((data: unknown) => tokenSchema.parse(data))
  .handler(async ({ data }): Promise<ExamScoreRow[]> => {
    const profile = await requirePermission(data.token, "exam_report", "view");
    const db = await academicDb(data.academicYear);
    const out: ExamScoreRow[] = [];
    const batch = 1000;
    const pageWidth = 4;
    for (let page = 0; ; page += pageWidth) {
      const pages = await Promise.all(
        Array.from({ length: pageWidth }, (_, offset) => {
          let q = db
            .from("exam_scores")
            .select("student_id,exam_type,score,remarks")
            .order("id")
            .range((page + offset) * batch, (page + offset + 1) * batch - 1);
          if (profile.role !== "admin" && !profile.allSchools)
            q = q.in("school_id", profile.schoolIds);
          return q;
        }),
      );
      let hasMore = true;
      for (const { data: rows, error } of pages) {
        if (error) throw new Error("Failed to load exam scores");
        const list = (rows ?? []) as ExamScoreRow[];
        out.push(...list);
        if (list.length < batch) hasMore = false;
      }
      if (!hasMore) break;
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
  .validator((data: unknown) => saveSchema.parse(data))
  .handler(async ({ data }) => {
    const profile = await requirePermission(data.token, "exam_report", "edit");
    if (!canSeeSchool(profile, data.schoolId)) throw new Error("School access denied");
    const db = await academicDb(data.academicYear);
    const { schoolId, studentId, examType, score, remarks } = data;

    const enrollment = await db
      .from("students")
      .select("id")
      .eq("id", studentId)
      .eq("school_id", schoolId)
      .maybeSingle();
    if (enrollment.error || !enrollment.data)
      throw new Error("Student is not enrolled in this school and academic year");
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
  .validator((data: unknown) => deleteSchema.parse(data))
  .handler(async ({ data }) => {
    const profile = await requirePermission(data.token, "exam_report", "delete");
    const db = await academicDb(data.academicYear);
    let query = db.from("exam_scores").delete().in("student_id", data.studentIds);
    if (profile.role !== "admin" && !profile.allSchools)
      query = query.in("school_id", profile.schoolIds);
    const { error } = await query;
    if (error) throw new Error("Failed to delete scores");
    return { ok: true };
  });
