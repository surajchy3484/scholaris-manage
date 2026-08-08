import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { jsonResult, requireApprovedOperator } from "../access";

export default defineTool({
  name: "exam_performance",
  title: "Exam performance",
  description:
    "Average exam scores by exam type (ICA, IMF, FCA) across all schools or for one school, with the overall performance average.",
  inputSchema: {
    school_code: z.string().optional().describe("School code such as SCH001."),
    academic_year: z.string().optional().describe("Academic year, e.g. 2025-26."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    const supabase = await requireApprovedOperator(ctx);

    let query = supabase.from("exam_scores").select("exam_type, score, academic_year, school_id").limit(20000);
    if (input.school_code) {
      const { data: school } = await supabase
        .from("schools")
        .select("id")
        .ilike("code", input.school_code)
        .maybeSingle();
      if (!school) return jsonResult({ note: "No school matched that code." });
      query = query.eq("school_id", school.id);
    }
    if (input.academic_year) query = query.eq("academic_year", input.academic_year);

    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    const rows = data ?? [];
    const buckets = new Map<string, number[]>();
    for (const r of rows) {
      const list = buckets.get(r.exam_type) ?? [];
      list.push(Number(r.score) || 0);
      buckets.set(r.exam_type, list);
    }
    const averages = Object.fromEntries(
      [...buckets].map(([type, list]) => [
        type,
        Math.round((list.reduce((a, b) => a + b, 0) / list.length) * 10) / 10,
      ]),
    );
    const all = rows.map((r) => Number(r.score) || 0);
    return jsonResult({
      scores: rows.length,
      averages_by_exam_type: averages,
      overall_average: all.length
        ? Math.round((all.reduce((a, b) => a + b, 0) / all.length) * 10) / 10
        : 0,
    });
  },
});
