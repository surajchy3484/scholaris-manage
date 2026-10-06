import type { StudentReport } from "./exam";

/** Count enrollment identities, never rows joined to attendance or exam activity. */
export function activeReportRoster<
  T extends Pick<
    StudentReport,
    "id" | "school_id" | "student_code" | "academic_year" | "enrollment_status"
  >,
>(rows: T[], schools: { id: string }[], academicYear?: string) {
  const validSchools = new Set(schools.map((s) => s.id));
  const identities = new Set<string>();
  const codes = new Set<string>();
  const students: T[] = [];
  let duplicateRows = 0;
  for (const row of rows) {
    if (
      !row.id ||
      !validSchools.has(row.school_id) ||
      row.enrollment_status?.trim().toLowerCase() !== "active"
    )
      continue;
    if (academicYear && row.academic_year !== academicYear) continue;
    // Human-readable codes were historically school-specific. Do not collapse
    // different schools' students merely because they reused the same code.
    const code = row.student_code?.trim().toUpperCase();
    const codeKey = code ? JSON.stringify([row.school_id, code]) : null;
    if (identities.has(row.id) || (codeKey && codes.has(codeKey))) {
      duplicateRows++;
      continue;
    }
    identities.add(row.id);
    if (codeKey) codes.add(codeKey);
    students.push(row);
  }
  return { students, duplicateRows };
}

export type ReportActivity = {
  id: string;
  school_id: string | null;
  class: string | null;
  section?: string | null;
  division?: string | null;
};
export function schoolStudentCounts(
  schools: { id: string; name: string; location: string }[],
  students: Pick<StudentReport, "id" | "school_id" | "class">[],
  sessions: ReportActivity[],
  assessments: ReportActivity[],
  classKey = "all",
) {
  const [klass, division] = classKey.split("|");
  const groups = new Map<
    string,
    { students: Set<string>; classes: Set<string>; sessions: Set<string>; assessments: Set<string> }
  >();
  for (const school of schools)
    groups.set(school.id, {
      students: new Set(),
      classes: new Set(),
      sessions: new Set(),
      assessments: new Set(),
    });
  for (const student of students) {
    const group = groups.get(student.school_id);
    if (!group) continue;
    group.students.add(student.id);
    if (student.class?.trim()) group.classes.add(student.class.trim());
  }
  for (const [records, field] of [
    [sessions, "sessions"],
    [assessments, "assessments"],
  ] as const) {
    for (const row of records) {
      const group = row.school_id ? groups.get(row.school_id) : undefined;
      if (!group) continue;
      if (
        classKey !== "all" &&
        (row.class !== klass ||
          ((row.section ?? row.division) && (row.section ?? row.division) !== division))
      )
        continue;
      group[field].add(row.id);
    }
  }
  return schools.map((school) => {
    const g = groups.get(school.id)!;
    return {
      school,
      totalStudents: g.students.size,
      classes: g.classes.size,
      sessions: g.sessions.size,
      assessments: g.assessments.size,
    };
  });
}
