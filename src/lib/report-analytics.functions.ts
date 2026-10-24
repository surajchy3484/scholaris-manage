import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requirePermission } from "./app-access.server";
import { canSeeSchool } from "./access-control";
import { academicDb } from "./academic-db.server";
import { fetchAllRows } from "./fetch-all";
import type { Assessment, ClickerRecord, Question } from "./master";

export const loadReportAnalytics = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => z.object({
    token: z.string().min(1), academicYear: z.string().max(80).optional(),
    schoolId: z.union([z.literal("all"), z.string().uuid()]),
  }).parse(value))
  .handler(async ({ data }): Promise<{ assessments: Assessment[]; questions: Question[]; records: ClickerRecord[] }> => {
    const profile = await requirePermission(data.token, "exam_report", "view");
    if (data.schoolId !== "all" && !canSeeSchool(profile, data.schoolId)) throw new Error("School access denied");
    const scope = data.schoolId !== "all" ? [data.schoolId]
      : profile.role === "admin" || profile.allSchools ? null : profile.schoolIds;
    if (scope && !scope.length) return { assessments: [], questions: [], records: [] };
    const db = await academicDb(data.academicYear);
    const [assessments, records] = await Promise.all([
      fetchAllRows<Assessment>(async (from, to) => {
        let q = db.from("assessment_evaluation_context" as "assessments").select("*").order("id").range(from,to);
        if (scope) q=q.in("school_id",scope);
        let result = await q;
        if (result.error && ["42P01", "PGRST205"].includes(result.error.code)) {
          let fallback = db.from("assessments").select("*").order("id").range(from,to);
          if (scope) fallback = fallback.in("school_id",scope);
          result = await fallback;
          if (result.data?.some(row => row.preserved_context)) {
            throw new Error("Apply the preserved assessment context migration to load historical analytics correctly.");
          }
        }
        if (result.error) throw new Error(result.error.message);
        return { data: result.data as Assessment[] | null, error: null };
      }),
      fetchAllRows<ClickerRecord>(async (from,to) => {
        let q=db.from("clicker_records").select("*").order("id").range(from,to);
        if (scope) q=q.in("school_id",scope);
        const result = await q;
        if (result.error) throw new Error(result.error.message);
        return { data: result.data as ClickerRecord[] | null, error: null };
      }),
    ]);
    // Evaluated records carry their original question snapshots. Load fallback
    // questions only for legacy records in the authorized assessment scope.
    const allowed = new Set(assessments.map(a=>a.assessment_id));
    const legacyIds=[...new Set(records.filter(r=>!r.question_snapshot && r.assessment_id && allowed.has(r.assessment_id)).map(r=>r.assessment_id!))];
    const questions: Question[]=[];
    for(let i=0;i<legacyIds.length;i+=100) {
      questions.push(...await fetchAllRows<Question>((from,to)=>db.from("questions").select("*").in("assessment_id",legacyIds.slice(i,i+100)).order("id").range(from,to)));
    }
    return { assessments, questions, records };
  });
