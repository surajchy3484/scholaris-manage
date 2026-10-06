import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requirePermission } from "./app-access.server";
import { academicDb } from "./academic-db.server";
import { fetchAllRows } from "./fetch-all";
import type { ReportActivity } from "./overall-student-counts";

// Report permission is sufficient for summary counts; never fetch answers or
// participant records to calculate the school roster size.
export const overallReportActivity = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) =>
    z
      .object({ token: z.string().min(1), academicYear: z.string().max(80).optional() })
      .parse(value),
  )
  .handler(
    async ({ data }): Promise<{ sessions: ReportActivity[]; assessments: ReportActivity[] }> => {
      const profile = await requirePermission(data.token, "exam_report", "view");
      const db = await academicDb(data.academicYear);
      const scoped = profile.role !== "admin" && !profile.allSchools;
      if (scoped && !profile.schoolIds.length) return { sessions: [], assessments: [] };
      const [sessions, assessments] = await Promise.all([
        fetchAllRows<ReportActivity>((from, to) => {
          let q = db.from("sessions").select("id,school_id,class").order("id").range(from, to);
          if (scoped) q = q.in("school_id", profile.schoolIds);
          return q;
        }),
        fetchAllRows<ReportActivity>((from, to) => {
          let q = db
            .from("assessments")
            .select("id,school_id,class,section")
            .order("id")
            .range(from, to);
          if (scoped) q = q.in("school_id", profile.schoolIds);
          return q;
        }),
      ]);
      return { sessions, assessments };
    },
  );
