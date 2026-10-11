import { supabase } from "./academic-data";
import { fetchAllRows } from "./fetch-all";
import { getAcademicYear } from "./academic-year";
import type { School } from "./types";
export type SchoolWithCount = School & { student_count: number };
async function fetchSchools(): Promise<SchoolWithCount[]> {
  // Embedded counts aggregate inside PostgreSQL; student rows never cross the network.
  const schools = await fetchAllRows<School & { students: { count: number }[] }>((from, to) =>
    supabase
      .from("schools")
      .select("*,students(count)")
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, to),
  );
  return schools.map(({ students, ...school }) => ({
    ...school,
    student_count: students[0]?.count ?? 0,
  }));
}

export function schoolDashboardQueryOptions() {
  return { queryKey: ["schools", getAcademicYear()], queryFn: fetchSchools, staleTime: 60_000 };
}
