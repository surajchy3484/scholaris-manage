import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { jsonResult, requireApprovedOperator } from "../access";

export default defineTool({
  name: "attendance_summary",
  title: "Attendance summary",
  description:
    "Summarise attendance (present / absent / late counts and attendance rate) for a date range, optionally for one school.",
  inputSchema: {
    school_code: z.string().optional().describe("School code such as SCH001."),
    from: z.string().optional().describe("Start date, YYYY-MM-DD."),
    to: z.string().optional().describe("End date, YYYY-MM-DD."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    const supabase = await requireApprovedOperator(ctx);

    let query = supabase.from("attendance").select("status, date, school_id").limit(20000);
    if (input.school_code) {
      const { data: school } = await supabase
        .from("schools")
        .select("id")
        .ilike("code", input.school_code)
        .maybeSingle();
      if (!school) return jsonResult({ note: "No school matched that code." });
      query = query.eq("school_id", school.id);
    }
    if (input.from) query = query.gte("date", input.from);
    if (input.to) query = query.lte("date", input.to);

    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    const rows = data ?? [];
    const tally: Record<string, number> = {};
    for (const r of rows) tally[r.status] = (tally[r.status] ?? 0) + 1;
    const present = (tally["present"] ?? 0) + (tally["late"] ?? 0);
    return jsonResult({
      records: rows.length,
      by_status: tally,
      attendance_rate_percent: rows.length ? Math.round((present / rows.length) * 1000) / 10 : 0,
    });
  },
});
