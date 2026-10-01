import { adminDb } from "./app-access.server";
export async function resolveAcademicYear(requested?: string) {
  const db = await adminDb();
  let query = db.from("academic_years" as never).select("id,is_current");
  query = requested ? query.eq("id", requested) : query.eq("is_current", true);
  const { data, error } = await query.single();
  if (error || !data)
    throw new Error(
      "Academic Year setup is required. Apply 20261001120000_academic_years.sql and select a configured year.",
    );
  return (data as { id: string }).id;
}

export async function academicDb(requested?: string) {
  return adminDb(await resolveAcademicYear(requested));
}
