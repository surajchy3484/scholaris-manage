import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listSchools from "./tools/list-schools";
import listStudents from "./tools/list-students";
import attendanceSummary from "./tools/attendance-summary";
import examPerformance from "./tools/exam-performance";
import listAssessments from "./tools/list-assessments";

// The OAuth issuer must be the direct Supabase host; the project ref is the one
// value that survives publish unchanged.
const projectRef = import.meta.env['VITE_SUPABASE_PROJECT_ID'] ?? "project-ref-unset";

export default defineMcp({
  name: "school-harmony",
  title: "School Harmony",
  version: "0.1.0",
  instructions:
    "Read-only tools for the School Harmony (SchoolRise) school management app. Use `list_schools` for the school roster, `list_students` to look up students, `attendance_summary` for attendance rates, `exam_performance` for ICA/MCA/FCA averages, and `list_assessments` for the assessment master. Access is limited to approved operator accounts.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listSchools, listStudents, attendanceSummary, examPerformance, listAssessments],
});
