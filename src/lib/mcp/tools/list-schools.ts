import { defineTool } from "@lovable.dev/mcp-js";
import { jsonResult, requireApprovedOperator } from "../access";

export default defineTool({
  name: "list_schools",
  title: "List schools",
  description: "List the schools in Scholaris with their code, location and student count.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    const supabase = await requireApprovedOperator(ctx);
    const { data, error } = await supabase
      .from("schools")
      .select("id, code, name, location")
      .order("code");
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    const schools = data ?? [];
    const counts = await Promise.all(
      schools.map(async (s) => {
        const { count } = await supabase
          .from("students")
          .select("id", { count: "exact", head: true })
          .eq("school_id", s.id);
        return { ...s, student_count: count ?? 0 };
      }),
    );
    return jsonResult({ schools: counts });
  },
});
