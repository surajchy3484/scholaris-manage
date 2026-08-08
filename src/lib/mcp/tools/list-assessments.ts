import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { jsonResult, requireApprovedOperator } from "../access";

export default defineTool({
  name: "list_assessments",
  title: "List assessments",
  description: "List assessments from the Assessment Master, optionally filtered by school name or status.",
  inputSchema: {
    school_name: z.string().optional().describe("Partial school name to filter by."),
    status: z.string().optional().describe("Assessment status, e.g. Active or Draft."),
    limit: z.number().int().optional().describe("Maximum rows to return (default 50)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    const supabase = await requireApprovedOperator(ctx);
    const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);

    let query = supabase
      .from("assessments")
      .select(
        "assessment_id, name, school_name, class, section, exam_type, date, total_questions, status, academic_year",
      )
      .order("date", { ascending: false })
      .limit(limit);
    if (input.school_name) query = query.ilike("school_name", `%${input.school_name}%`);
    if (input.status) query = query.eq("status", input.status);

    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return jsonResult({ assessments: data ?? [], limit });
  },
});
