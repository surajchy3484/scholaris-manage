import { adminDb } from "./app-access.server";
import { canSeeSchool, type AccessProfile } from "./access-control";
import { fetchAllRows } from "./fetch-all";
export async function writeClicker(
  profile: AccessProfile,
  mode: "insert" | "update" | "delete",
  rows: Record<string, unknown>[] = [],
  ids: string[] = [],
  patch: Record<string, unknown> = {},
) {
  const db = await adminDb();
  const existing = ids.length
    ? await fetchAllRows((from, to) =>
        db
          .from("clicker_records")
          .select("id,school_id,assessment_id")
          .in("id", ids)
          .order("id")
          .range(from, to),
      )
    : [];
  // Administrators can clean up legacy rows that have no school assignment.
  // Restricted users must still have an explicit, authorized school on every row.
  if (
    profile.role !== "admin" &&
    existing.some((r) => !r.school_id || !canSeeSchool(profile, r.school_id))
  )
    throw new Error("School access denied");
  if (mode === "delete") {
    const { data, error } = await db.rpc(
      "delete_clicker_records" as never,
      {
        p_ids: ids,
        p_schools: profile.role === "admin" || profile.allSchools ? null : profile.schoolIds,
      } as never,
    );
    if (!error) return { ok: true, count: Number(data) };
    // Older deployments with the universal writer can keep using it.
    // Authorization/validation errors must never trigger another write path.
    if (!["PGRST202", "42883"].includes(error.code)) throw new Error(error.message);
  }
  const assessmentIds = [
    ...new Set(
      [
        ...rows.map((r) => r.assessment_id),
        ...existing.map((r) => patch.assessment_id ?? r.assessment_id),
      ].filter((v): v is string => typeof v === "string"),
    ),
  ];
  if (mode !== "delete") {
    const assessments = assessmentIds.length
      ? await fetchAllRows((from, to) =>
          db
            .from("assessments")
            .select("assessment_id,school_id")
            .in("assessment_id", assessmentIds)
            .order("id")
            .range(from, to),
        )
      : [];
    if (assessments.some((a) => !a.school_id || !canSeeSchool(profile, a.school_id)))
      throw new Error("School access denied");
    if (assessments.length !== assessmentIds.length) throw new Error("Unknown assessment");
  }
  const { data, error } = await db.rpc(
    "universal_clicker_write" as never,
    {
      p_mode: mode,
      p_rows: rows,
      p_ids: ids,
      p_patch: patch,
      p_schools: profile.role === "admin" || profile.allSchools ? null : profile.schoolIds,
    } as never,
  );
  if (error)
    throw new Error(
      ["PGRST202", "42883"].includes(error.code)
        ? mode === "delete"
          ? "Clicker deletion is not installed in the database. Apply 20260927180000_clicker_delete_recovery.sql in the hosting database SQL editor, then retry. No rows were deleted."
          : "Apply the Universal Question Master migration before saving Clicker data. No rows were saved."
        : error.message,
    );
  return { ok: true, count: Number(data) };
}
