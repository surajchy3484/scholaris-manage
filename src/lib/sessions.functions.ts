import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { canSeeSchool, type AccessProfile } from "./access-control";
import { fetchAllRows } from "./fetch-all";
import { adminDb, requirePermission } from "./app-access.server";

const token = z.object({ token: z.string().min(1) });
const status = z.enum(["pending", "complete"]);
const unit = z.enum(["Unit-1", "Unit-2", "Unit-3", "Unit-4"]);
// Divisions / batches are admin-defined free text ("A", "Batch 1", "Morning Batch").
const division = z.string().max(60);

function checkSchool(profile: AccessProfile, schoolId: string) {
  if (!canSeeSchool(profile, schoolId)) throw new Error("School access denied");
}

async function checkedSessions(
  db: Awaited<ReturnType<typeof adminDb>>,
  profile: AccessProfile,
  ids: string[],
) {
  const rows = await fetchAllRows<{ id: string; school_id: string; unit: string; class: string }>(
    (from, to) =>
      db
        .from("sessions")
        .select("id,school_id,unit,class")
        .in("id", ids)
        .order("id")
        .range(from, to),
  );
  if (rows.length !== new Set(ids).size)
    throw new Error("A session no longer exists. Refresh and retry.");
  rows.forEach((row) => checkSchool(profile, row.school_id));
  return rows;
}

async function checkRosterPair(
  db: Awaited<ReturnType<typeof adminDb>>,
  schoolId: string,
  klass: string,
  division: string,
) {
  let query = db.from("students").select("id").eq("school_id", schoolId).eq("class", klass);
  query =
    division === "" ? query.or("division.is.null,division.eq.") : query.eq("division", division);
  const { data, error } = await query.limit(1);
  if (error) throw new Error("Unable to verify the student roster");
  if (!data?.length)
    throw new Error(
      "This class and division no longer has students in the selected school. Refresh and retry.",
    );
}

export const listSessionSchools = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => token.parse(data))
  .handler(async ({ data }) => {
    const profile = await requirePermission(data.token, "session_status", "view");
    if (profile.role !== "admin" && !profile.allSchools && !profile.schoolIds.length) return [];
    const db = await adminDb();
    return fetchAllRows<{ id: string; name: string; code: string; location: string }>(
      (from, to) => {
        let query = db.from("schools").select("id,name,code,location").order("code").order("id");
        if (profile.role !== "admin" && !profile.allSchools)
          query = query.in("id", profile.schoolIds);
        return query.range(from, to);
      },
    );
  });

export const listSessionRoster = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => token.extend({ schoolId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const profile = await requirePermission(data.token, "session_status", "view");
    checkSchool(profile, data.schoolId);
    const db = await adminDb();
    // Read only the two roster fields; page through all students, including beyond 1,000.
    const students = await fetchAllRows<{ class: string; division: string | null }>((from, to) =>
      db
        .from("students")
        .select("class,division")
        .eq("school_id", data.schoolId)
        .order("id")
        .range(from, to),
    );
    const pairs = new Map<string, { class: string; division: string }>();
    for (const row of students) {
      if (!row.class?.trim()) continue;
      const pair = { class: row.class, division: row.division ?? "" };
      pairs.set(JSON.stringify([pair.class, pair.division]), pair);
    }
    return [...pairs.values()].sort(
      (a, b) =>
        a.class.localeCompare(b.class, undefined, { numeric: true }) ||
        a.division.localeCompare(b.division, undefined, { numeric: true }),
    );
  });

/**
 * Session master rows for a school (optionally narrowed to a unit/class).
 * Divisions are NOT part of the master — every division of a class shares the
 * same session list, and only the status is tracked per division.
 */
export const listSessions = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    token
      .extend({
        schoolId: z.string().uuid().optional(),
        unit: unit.optional(),
        class: z.string().max(50).optional(),
      })
      .parse(data),
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  .handler(async ({ data }): Promise<any[]> => {
    const profile = await requirePermission(data.token, "session_status", "view");
    if (data.schoolId) checkSchool(profile, data.schoolId);
    if (profile.role !== "admin" && !profile.allSchools && !profile.schoolIds.length) return [];
    const db = await adminDb();
    const out: Record<string, unknown>[] = [];
    const batch = 1000;
    for (let from = 0; ; from += batch) {
      let q = db
        .from("sessions")
        .select("id, school_id, unit, session_name, class, topic, created_at")
        .order("created_at", { ascending: true })
        .order("id")
        .range(from, from + batch - 1);
      if (profile.role !== "admin" && !profile.allSchools) q = q.in("school_id", profile.schoolIds);
      if (data.schoolId) q = q.eq("school_id", data.schoolId);
      if (data.unit) q = q.eq("unit", data.unit);
      if (data.class) q = q.eq("class", data.class);
      const { data: rows, error } = await q;
      if (error) throw new Error("Failed to load sessions");
      const list = (rows ?? []) as Record<string, unknown>[];
      out.push(...list);
      if (list.length < batch) break;
    }
    return out;
  });

/** Sessions of one class plus the status for the requested division only. */
export const listDivisionSessions = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    token
      .extend({
        schoolId: z.string().uuid(),
        unit,
        class: z.string().max(50),
        division,
      })
      .parse(data),
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  .handler(async ({ data }): Promise<any[]> => {
    const profile = await requirePermission(data.token, "session_status", "view");
    checkSchool(profile, data.schoolId);
    const db = await adminDb();
    await checkRosterPair(db, data.schoolId, data.class, data.division);

    const rows = await fetchAllRows<{
      id: string;
      session_name: string;
      class: string;
      topic: string;
      unit: string;
      school_id: string;
    }>((from, to) =>
      db
        .from("sessions")
        .select("id, session_name, class, topic, unit, school_id")
        .eq("school_id", data.schoolId)
        .eq("unit", data.unit)
        .eq("class", data.class)
        .order("created_at", { ascending: true })
        .order("id")
        .range(from, to),
    );
    if (rows.length === 0) return [];
    const statuses = await fetchAllRows<{
      session_id: string;
      status: string;
      updated_at: string;
      updated_by: string | null;
    }>((from, to) =>
      db
        .from("session_division_status")
        .select("session_id, status, updated_at, updated_by")
        .eq("school_id", data.schoolId)
        .eq("unit", data.unit)
        .eq("class", data.class)
        .eq("division", data.division)
        .order("session_id")
        .range(from, to),
    );

    const byId = new Map((statuses ?? []).map((s) => [s.session_id as string, s] as const));
    return rows.map((r) => {
      const s = byId.get(r.id as string);
      return {
        ...r,
        division: data.division,
        status: (s?.status as string) ?? "pending",
        updated_at: s?.updated_at ?? null,
        updated_by: s?.updated_by ?? null,
      };
    });
  });

/** Lightweight per-unit counts for the unit dashboard. */
export const sessionUnitCounts = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => token.extend({ schoolId: z.string().uuid() }).parse(data))
  .handler(async ({ data }): Promise<Record<string, number>> => {
    const profile = await requirePermission(data.token, "session_status", "view");
    checkSchool(profile, data.schoolId);
    const db = await adminDb();
    const out: Record<string, number> = {};
    for (const u of ["Unit-1", "Unit-2", "Unit-3", "Unit-4"]) {
      const { count, error } = await db
        .from("sessions")
        .select("id", { count: "exact", head: true })
        .eq("school_id", data.schoolId)
        .eq("unit", u);
      if (error) throw new Error("Failed to load unit summary");
      out[u] = count ?? 0;
    }
    return out;
  });

export const insertSessions = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    token
      .extend({
        rows: z
          .array(
            z.object({
              school_id: z.string().uuid(),
              unit,
              session_name: z.string().min(1).max(200),
              class: z.string().max(50).default(""),
              topic: z.string().max(300).default(""),
            }),
          )
          .min(1)
          .max(1000),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const profile = await requirePermission(data.token, "session_status", "add");
    data.rows.forEach((row) => checkSchool(profile, row.school_id));
    const db = await adminDb();
    const { error } = await db.from("sessions").insert(data.rows);
    if (error) throw new Error("Failed to save sessions");
    return { ok: true, count: data.rows.length };
  });

export const updateSessions = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    token
      .extend({
        ids: z.array(z.string().uuid()).min(1).max(2000),
        patch: z.object({
          session_name: z.string().min(1).max(200).optional(),
          class: z.string().max(50).optional(),
          topic: z.string().max(300).optional(),
          unit: unit.optional(),
        }),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const profile = await requirePermission(data.token, "session_status", "edit");
    const db = await adminDb();
    await checkedSessions(db, profile, data.ids);
    const { error } = await db.from("sessions").update(data.patch).in("id", data.ids);
    if (error) throw new Error("Failed to update sessions");
    return { ok: true };
  });

/** Sets status for the given sessions in ONE division only. */
export const setDivisionStatus = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    token
      .extend({
        schoolId: z.string().uuid(),
        unit,
        class: z.string().max(50),
        division,
        ids: z.array(z.string().uuid()).min(1).max(2000),
        status,
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const profile = await requirePermission(data.token, "session_status", "status");
    checkSchool(profile, data.schoolId);
    const db = await adminDb();
    await checkRosterPair(db, data.schoolId, data.class, data.division);
    const sessions = await checkedSessions(db, profile, data.ids);
    if (
      sessions.some(
        (row) =>
          row.school_id !== data.schoolId || row.unit !== data.unit || row.class !== data.class,
      )
    )
      throw new Error("Selected sessions must belong to this school, unit and class");
    const rows = [...new Set(data.ids)].map((id) => ({
      session_id: id,
      school_id: data.schoolId,
      unit: data.unit,
      class: data.class,
      division: data.division,
      status: data.status,
      updated_by: profile.username,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await db
      .from("session_division_status")
      .upsert(rows, { onConflict: "session_id,division" });
    if (error) throw new Error("Failed to update session status");
    return { ok: true };
  });

export const deleteSessions = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    token.extend({ ids: z.array(z.string().uuid()).min(1).max(2000) }).parse(data),
  )
  .handler(async ({ data }) => {
    const profile = await requirePermission(data.token, "session_status", "delete");
    const db = await adminDb();
    await checkedSessions(db, profile, data.ids);
    const { error } = await db.from("sessions").delete().in("id", data.ids);
    if (error) throw new Error("Failed to delete sessions");
    return { ok: true };
  });
