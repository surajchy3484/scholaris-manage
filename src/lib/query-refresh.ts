import type { QueryClient } from "@tanstack/react-query";

const reports = ["exam-data", "visual-analytics-source", "student-history", "academic-progress"];
/** Reports refresh through relevant writes/realtime events, never the fallback timer. */
export function shouldPollQuery(key: readonly unknown[]) {
  return ![...reports, "visual-analytics-sessions", "overall-report-activity"].includes(String(key[0]));
}
const sessionQueries = [
  "class-session-coverage",
  "session-schools",
  "session-roster",
  "session-unit-counts",
  "division-sessions",
  "session-assignment-context",
  "visual-analytics-sessions",
  "overall-report-activity",
];
const schoolQueries = [
  "schools",
  "school",
  "schools-lite",
  "academic-schools",
  "school-divisions",
  "clusters",
  "drive-sync-schools",
];
const rosterQueries = [
  "students",
  "enrollments",
  "clicker-filter-options",
  ...schoolQueries,
  ...sessionQueries,
  ...reports,
];
const tableQueries: Record<string, string[]> = {
  attendance: ["attendance", "main-dashboard", ...reports],
  schools: ["main-dashboard", ...rosterQueries],
  students: ["main-dashboard", ...rosterQueries],
  student_enrollments: ["main-dashboard", ...rosterQueries],
  school_clusters: ["main-dashboard", ...schoolQueries],
  school_divisions: ["main-dashboard", ...rosterQueries],
  sessions: ["main-dashboard", ...sessionQueries],
  session_division_status: ["main-dashboard", ...sessionQueries],
  session_catalogue: ["class-session-coverage"],
  session_coverage_settings: ["class-session-coverage"],
  session_school_assignments: ["class-session-coverage"],
  session_assignment_targets: ["main-dashboard", ...sessionQueries],
  class_session_plans: ["main-dashboard", ...sessionQueries],
  assessments: [
    "assessments",
    "evaluation-assessments",
    "clicker",
    "clicker-filter-options",
    "main-dashboard",
    "overall-report-activity",
    ...reports,
  ],
  clicker_records: ["clicker", "clicker-filter-options", "main-dashboard", ...reports],
  assessment_results: ["clicker", "main-dashboard", ...reports],
  exam_scores: ["main-dashboard", ...reports],
  questions: [
    "questions",
    "exam-types",
    "question-class-options",
    "question-migration-issues",
    "question-versions",
    "clicker-question-keys",
    "clicker",
    ...reports,
  ],
};
tableQueries.question_bank = tableQueries.questions;
tableQueries.exam_types = tableQueries.questions;
tableQueries.question_bank_migration_issues = tableQueries.questions;

export function queryAffectedByTables(key: readonly unknown[], tables: ReadonlySet<string>) {
  for (const table of tables) {
    const prefixes = tableQueries[table];
    // Account/year changes and unknown tables use broad invalidation for correctness.
    if (!prefixes || prefixes.includes(String(key[0]))) return true;
  }
  return false;
}
/** One refresh per import burst, with a bounded delay under a continuous stream. */
export function createQueryRefreshQueue(client: QueryClient, delay = 250) {
  const pending = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    enqueue(table: string) {
      pending.add(table);
      if (timer !== undefined) return;
      timer = setTimeout(() => {
        const tables = new Set(pending);
        pending.clear();
        timer = undefined;
        void client.invalidateQueries(
          { predicate: (q) => queryAffectedByTables(q.queryKey, tables) },
          { cancelRefetch: false },
        );
      }, delay);
    },
    dispose() {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      pending.clear();
    },
  };
}

/** Invalidate immediately after a successful session write, even without Realtime. */
export function refreshSessionQueries(client: QueryClient) {
  return client.invalidateQueries({
    predicate: (query) => queryAffectedByTables(query.queryKey, new Set(["sessions"])),
  });
}

/** Student deletion also removes attendance/results across years. */
export function refreshStudentDeletionQueries(client: QueryClient) {
  return client.invalidateQueries({
    predicate: (query) =>
      queryAffectedByTables(
        query.queryKey,
        new Set([
          "students",
          "student_enrollments",
          "attendance",
          "clicker_records",
          "assessment_results",
          "exam_scores",
        ]),
      ),
  });
}
