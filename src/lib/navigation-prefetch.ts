import type { QueryClient } from "@tanstack/react-query";
import { getAccessToken } from "./app-access";
import { getAcademicYear } from "./academic-year";
/** Data prefetch is limited to the section the user is intending to open. */
export async function prefetchSidebarData(client: QueryClient, path: string) {
  const token = getAccessToken(),
    year = getAcademicYear();
  if (!token || !year) return;
  const sameContext = () => token === getAccessToken() && year === getAcademicYear();
  if (path === "/school-dashboard") {
    const { schoolDashboardQueryOptions } = await import("./school-dashboard-data");
    if (sameContext()) await client.prefetchQuery(schoolDashboardQueryOptions());
  } else if (path === "/exam-report" || path === "/overall-report") {
    const { examDataQueryOptions } = await import("./exam");
    if (sameContext()) await client.prefetchQuery(examDataQueryOptions());
  } else if (path === "/assessments" || path === "/questions" || path === "/clicker") {
    const { masterPageQueryOptions, initialMasterPageArgs } = await import("./master-page-query");
    const table =
      path === "/assessments"
        ? "assessments"
        : path === "/questions"
          ? "questions"
          : "clicker_records";
    if (sameContext())
      await client.prefetchQuery(masterPageQueryOptions(table, initialMasterPageArgs(table)));
  }
}
