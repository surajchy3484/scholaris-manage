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
  if (existing.some((r) => !r.school_id || !canSeeSchool(profile, r.school_id)))
    throw new Error("School access denied");
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
        ? "Apply the Universal Question Master migration before saving Clicker data. No rows were saved."
        : error.message,
    );
  return { ok: true, count: Number(data) };
}
