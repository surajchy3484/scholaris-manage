import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { RequireModule } from "@/components/require-module";
import { StudentReportList } from "@/components/student-report-list";
import { Button } from "@/components/ui/button";
export const Route = createFileRoute("/exam-report/$schoolId/students")({
  validateSearch: (search: Record<string, unknown>) => ({
    cls: typeof search.cls === "string" ? search.cls : "all",
    division: typeof search.division === "string" ? search.division : "all",
  }),
  head: () => ({
    meta: [
      { title: "Student Exam Records — SchoolRise" },
      {
        name: "description",
        content: "Search, edit, import and export student attendance and exam scores.",
      },
      { property: "og:title", content: "Student Exam Records — SchoolRise" },
      {
        property: "og:description",
        content: "Search, edit, import and export student attendance and exam scores.",
      },
    ],
  }),
  component: () => (
    <RequireModule module="exam_report">
      <StudentExamDashboard />
    </RequireModule>
  ),
});

function StudentExamDashboard() {
  const { schoolId } = Route.useParams();
  const { cls, division } = Route.useSearch();
  const navigate = useNavigate();
  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-8 sm:px-6">
      <Button variant="outline" asChild>
        <Link to="/exam-report/$schoolId" params={{ schoolId }}>
          Back to School Report
        </Link>
      </Button>
      <StudentReportList
        schoolId={schoolId}
        cls={cls}
        division={division}
        onClassChange={(value) => navigate({ to: ".", search: { cls: value, division: "all" } })}
        onDivisionChange={(value) => navigate({ to: ".", search: { cls, division: value } })}
      />
    </div>
  );
}
