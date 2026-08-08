import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { jsonResult, requireApprovedOperator } from "../access";

export default defineTool({
  name: "list_students",
  title: "List students",
  description:
    "List students, optionally filtered by school code, class, division or a name/roll-number search.",
  inputSchema: {
    school_code: z.string().optional().describe("School code such as SCH001."),
    class: z.string().optional().describe("Class / grade to filter by."),
    division: z.string().optional().describe("Division or section to filter by."),
    search: z.string().optional().describe("Match against student name or roll number."),
    limit: z.number().int().optional().describe("Maximum rows to return (default 50)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    const supabase = await requireApprovedOperator(ctx);
    const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);

    let schoolId: string | undefined;
    if (input.school_code) {
      const { data: school } = await supabase
        .from("schools")
        .select("id")
        .ilike("code", input.school_code)
        .maybeSingle();
      if (!school) return jsonResult({ students: [], note: "No school matched that code." });
      schoolId = school.id;
    }

    let query = supabase
      .from("students")
      .select("id, student_code, name, roll_number, class, division, school_id, enrollment_date")
      .order("roll_number")
      .limit(limit);
    if (schoolId) query = query.eq("school_id", schoolId);
    if (input.class) query = query.eq("class", input.class);
    if (input.division) query = query.eq("division", input.division);
    if (input.search) query = query.or(`name.ilike.%${input.search}%,roll_number.ilike.%${input.search}%`);

    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return jsonResult({ students: data ?? [], limit });
  },
});
