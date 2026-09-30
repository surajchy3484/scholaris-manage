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
const academicYear = z.string().regex(/^\d{4}(?:-\d{4})?$/);
const assignmentType = z.enum(["School-wise", "Class-wise Automatic", "School-level Override"]);

function checkSchool(profile: AccessProfile, schoolId: string) {
  if (!canSeeSchool(profile, schoolId)) throw new Error("School access denied");
}

function requireAdmin(profile: AccessProfile) {
  if (profile.role !== "admin") throw new Error("Admin access required");
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
              academic_year: academicYear.optional(),
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = (await adminDb()) as any;
    const { error } = await db.from("sessions").insert(data.rows);
    if (error) throw new Error("Failed to save sessions");
    return { ok: true, count: data.rows.length };
  });

export const importSessionsToEligibleSchools = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    token
      .extend({
        academicYear,
        unit,
        schoolIds: z.array(z.string().uuid()).max(1000).optional(),
        updateExisting: z.boolean().default(false),
        rows: z
          .array(
            z.object({
              class: z.string().min(1).max(50),
              session_name: z.string().min(1).max(200),
              topic: z.string().max(300).default(""),
              division: division.default(""),
              status,
            }),
          )
          .min(1)
          .max(5000),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const profile = await requirePermission(data.token, "session_status", "add");
    requireAdmin(profile);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = (await adminDb()) as any;
    let imported = 0;
    let skipped = 0;
    let updated = 0;
    const schools = new Map<string, string>();
    for (const klass of new Set(data.rows.map((row) => row.class))) {
      const eligible = (await eligibleSchools(db, profile, klass)).filter(
        (school) => !data.schoolIds?.length || data.schoolIds.includes(school.school_id),
      );
      for (const school of eligible) schools.set(school.school_id, school.school_name);
      const classRows = data.rows.filter((row) => row.class === klass);
      for (const school of eligible) {
        const { data: existing, error: existingError } = await db
          .from("sessions")
          .select("id,session_name,topic")
          .eq("school_id", school.school_id)
          .eq("academic_year", data.academicYear)
          .eq("unit", data.unit)
          .eq("class", klass);
        if (existingError) {
          throw new Error(
            `Session assignment database migration is missing. Apply supabase/migrations/20261001000000_session_assignment_plans.sql, then retry. (${existingError.message})`,
          );
        }
        const byKey = new Map(
          (existing ?? []).map((row: { id: string; session_name: string; topic: string }) => [
            `${row.session_name.trim().toLowerCase()}\n${row.topic.trim().toLowerCase()}`,
            row.id,
          ]),
        );
        const byName = new Map<
          string,
          { id: string; session_name: string; topic: string } | null
        >();
        for (const row of existing ?? []) {
          const name = row.session_name.trim().toLowerCase();
          byName.set(name, byName.has(name) ? null : row);
        }
        const uniqueRows = [
          ...new Map(
            classRows.map((row) => [
              `${row.session_name.trim().toLowerCase()}\n${row.topic.trim().toLowerCase()}`,
              row,
            ]),
          ).values(),
        ];
        const inserts = uniqueRows
          .filter((row) => {
            const key = `${row.session_name.trim().toLowerCase()}\n${row.topic.trim().toLowerCase()}`;
            const existingRow =
              byKey.get(key) ??
              (data.updateExisting
                ? byName.get(row.session_name.trim().toLowerCase())?.id
                : undefined);
            if (existingRow) {
              if (!data.updateExisting) skipped++;
              return false;
            }
            if (byKey.has(key)) {
              skipped++;
              return false;
            }
            return true;
          })
          .map((row) => ({
            school_id: school.school_id,
            academic_year: data.academicYear,
            unit: data.unit,
            class: klass,
            session_name: row.session_name.trim(),
            topic: row.topic.trim(),
            assignment_type: "School-wise",
          }));
        if (data.updateExisting) {
          for (const row of uniqueRows) {
            const key = `${row.session_name.trim().toLowerCase()}\n${row.topic.trim().toLowerCase()}`;
            const existingId =
              byKey.get(key) ?? byName.get(row.session_name.trim().toLowerCase())?.id;
            if (!existingId) continue;
            const { error } = await db
              .from("sessions")
              .update({ session_name: row.session_name.trim(), topic: row.topic.trim() })
              .eq("id", existingId);
            if (error) throw new Error(`Failed to update sessions in ${school.school_name}`);
            byKey.set(key, existingId);
            updated++;
          }
        }
        if (inserts.length) {
          const { data: created, error } = await db
            .from("sessions")
            .insert(inserts)
            .select("id,session_name,topic");
          if (error) {
            throw new Error(
              `Failed to import sessions into ${school.school_name}. Confirm the session assignment migration is applied. (${error.message})`,
            );
          }
          for (const row of created ?? [])
            byKey.set(
              `${row.session_name.trim().toLowerCase()}\n${row.topic.trim().toLowerCase()}`,
              row.id,
            );
          imported += inserts.length;
        }
        const statusRows = classRows
          .filter((row) => row.division.trim())
          .map((row) => ({
            session_id: byKey.get(
              `${row.session_name.trim().toLowerCase()}\n${row.topic.trim().toLowerCase()}`,
            ),
            school_id: school.school_id,
            unit: data.unit,
            class: klass,
            division: row.division.trim(),
            status: row.status,
            updated_by: profile.username,
            updated_at: new Date().toISOString(),
          }))
          .filter((row): row is typeof row & { session_id: string } => Boolean(row.session_id));
        if (statusRows.length) {
          const { error } = await db
            .from("session_division_status")
            .upsert(statusRows, { onConflict: "session_id,division" });
          if (error) throw new Error("Failed to import division statuses");
        }
      }
    }
    return { ok: true, imported, updated, skipped, schools: schools.size };
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

type EligibleSchool = { school_id: string; school_name: string; class: string };

async function eligibleSchools(
  db: Awaited<ReturnType<typeof adminDb>>,
  profile: AccessProfile,
  klass: string,
): Promise<EligibleSchool[]> {
  const students = await fetchAllRows<{ school_id: string; class: string }>((from, to) => {
    let query = db
      .from("students")
      .select("school_id,class")
      .eq("class", klass)
      .order("school_id")
      .range(from, to);
    if (profile.role !== "admin" && !profile.allSchools)
      query = query.in("school_id", profile.schoolIds);
    return query;
  });
  const ids = [...new Set(students.map((row) => row.school_id))];
  if (!ids.length) return [];
  const schools = await fetchAllRows<{ id: string; name: string }>((from, to) =>
    db.from("schools").select("id,name").in("id", ids).order("name").range(from, to),
  );
  const names = new Map(schools.map((school) => [school.id, school.name]));
  return ids
    .sort((a, b) => (names.get(a) ?? "").localeCompare(names.get(b) ?? ""))
    .map((school_id) => ({
      school_id,
      school_name: names.get(school_id) ?? "Unknown school",
      class: klass,
    }));
}

async function ensureTargetSessions(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  target: {
    school_id: string;
    academic_year: string;
    unit: string;
    class: string;
    session_count: number;
    assignment_type: string;
    class_plan_id?: string | null;
  },
) {
  const { data: existing, error } = await db
    .from("sessions")
    .select("id,session_name")
    .eq("school_id", target.school_id)
    .eq("academic_year", target.academic_year)
    .eq("unit", target.unit)
    .eq("class", target.class)
    .order("created_at")
    .order("id");
  if (error) throw new Error("Failed to load existing sessions");
  const rows = existing ?? [];
  const missing = Math.max(0, target.session_count - rows.length);
  if (!missing) return;
  const names = new Set(rows.map((row: { session_name: string }) => row.session_name));
  const inserts = Array.from({ length: missing }, (_, index) => {
    let name = `Session ${rows.length + index + 1}`;
    while (names.has(name)) name = `${name}*`;
    names.add(name);
    return {
      school_id: target.school_id,
      academic_year: target.academic_year,
      unit: target.unit,
      class: target.class,
      session_name: name,
      topic: "",
      assignment_type: target.assignment_type,
      class_plan_id: target.class_plan_id ?? null,
    };
  });
  const result = await db.from("sessions").insert(inserts);
  if (result.error) throw new Error("Failed to create assigned sessions");
}

export const listAssignmentContext = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => token.parse(data))
  .handler(async ({ data }) => {
    const profile = await requirePermission(data.token, "session_status", "view");
    requireAdmin(profile);
    const db = await adminDb();
    const schools = await fetchAllRows<{ id: string; name: string }>((from, to) => {
      let query = db.from("schools").select("id,name").order("name").range(from, to);
      if (profile.role !== "admin" && !profile.allSchools)
        query = query.in("id", profile.schoolIds);
      return query;
    });
    const rows = await fetchAllRows<{ school_id: string; class: string }>((from, to) => {
      let query = db.from("students").select("school_id,class").order("school_id").range(from, to);
      if (profile.role !== "admin" && !profile.allSchools)
        query = query.in("school_id", profile.schoolIds);
      return query;
    });
    return {
      schools,
      classes: [...new Set(rows.map((row) => row.class).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true }),
      ),
      academicYears: [
        String(new Date().getFullYear()),
        `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`,
      ],
    };
  });

const planInput = token.extend({
  academicYear,
  unit,
  class: z.string().min(1).max(50),
  sessionCount: z.number().int().min(1).max(500),
});

export const previewClassAssignment = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => planInput.parse(data))
  .handler(async ({ data }) => {
    const profile = await requirePermission(data.token, "session_status", "view");
    requireAdmin(profile);
    const schools = await eligibleSchools(await adminDb(), profile, data.class);
    return {
      academic_year: data.academicYear,
      unit: data.unit,
      class: data.class,
      session_count: data.sessionCount,
      schools,
    };
  });

export const applyClassAssignment = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    planInput.extend({ syncOnly: z.boolean().optional() }).parse(data),
  )
  .handler(async ({ data }) => {
    const profile = await requirePermission(data.token, "session_status", "add");
    requireAdmin(profile);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = (await adminDb()) as any;
    const eligible = await eligibleSchools(db, profile, data.class);
    const { data: plan, error: planError } = await db
      .from("class_session_plans")
      .upsert(
        {
          academic_year: data.academicYear,
          unit: data.unit,
          class: data.class,
          session_count: data.sessionCount,
          created_by: profile.username,
        },
        { onConflict: "academic_year,unit,class" },
      )
      .select("id")
      .single();
    if (planError || !plan) throw new Error("Failed to save the class-wise session plan");
    let applied = 0;
    for (const school of eligible) {
      const { data: current } = await db
        .from("session_assignment_targets")
        .select("assignment_type,session_count")
        .match({
          academic_year: data.academicYear,
          school_id: school.school_id,
          unit: data.unit,
          class: data.class,
          division: "",
        })
        .maybeSingle();
      const target =
        current?.assignment_type === "School-level Override"
          ? { session_count: current.session_count, assignment_type: current.assignment_type }
          : { session_count: data.sessionCount, assignment_type: "Class-wise Automatic" };
      const { error } = await db.from("session_assignment_targets").upsert(
        {
          academic_year: data.academicYear,
          school_id: school.school_id,
          unit: data.unit,
          class: data.class,
          division: "",
          session_count: target.session_count,
          assignment_type: target.assignment_type,
          class_plan_id: plan.id,
          created_by: profile.username,
        },
        { onConflict: "academic_year,school_id,unit,class,division" },
      );
      if (error) throw new Error("Failed to save school assignment targets");
      await ensureTargetSessions(db, {
        school_id: school.school_id,
        academic_year: data.academicYear,
        unit: data.unit,
        class: data.class,
        session_count: target.session_count,
        assignment_type: target.assignment_type,
        class_plan_id: plan.id,
      });
      applied++;
    }
    return { ok: true, applied, eligible: eligible.length };
  });

export const overrideAssignmentTarget = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    token
      .extend({
        academicYear,
        schoolId: z.string().uuid(),
        unit,
        class: z.string().min(1).max(50),
        division: division.optional(),
        sessionCount: z.number().int().min(1).max(500),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const profile = await requirePermission(data.token, "session_status", "edit");
    requireAdmin(profile);
    checkSchool(profile, data.schoolId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = (await adminDb()) as any;
    const { data: target, error } = await db
      .from("session_assignment_targets")
      .upsert(
        {
          academic_year: data.academicYear,
          school_id: data.schoolId,
          unit: data.unit,
          class: data.class,
          division: data.division ?? "",
          session_count: data.sessionCount,
          assignment_type: "School-level Override",
          created_by: profile.username,
        },
        { onConflict: "academic_year,school_id,unit,class,division" },
      )
      .select("class_plan_id")
      .single();
    if (error) throw new Error("Failed to save school-level override");
    await ensureTargetSessions(db, {
      school_id: data.schoolId,
      academic_year: data.academicYear,
      unit: data.unit,
      class: data.class,
      session_count: data.sessionCount,
      assignment_type: "School-level Override",
      class_plan_id: target?.class_plan_id,
    });
    return { ok: true };
  });

export const applySchoolAssignment = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    planInput.extend({ schoolId: z.string().uuid(), division: division.optional() }).parse(data),
  )
  .handler(async ({ data }) => {
    const profile = await requirePermission(data.token, "session_status", "add");
    requireAdmin(profile);
    checkSchool(profile, data.schoolId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = (await adminDb()) as any;
    await checkRosterPair(db, data.schoolId, data.class, data.division ?? "");
    const { error } = await db.from("session_assignment_targets").upsert(
      {
        academic_year: data.academicYear,
        school_id: data.schoolId,
        unit: data.unit,
        class: data.class,
        division: data.division ?? "",
        session_count: data.sessionCount,
        assignment_type: "School-wise",
        created_by: profile.username,
      },
      { onConflict: "academic_year,school_id,unit,class,division" },
    );
    if (error) throw new Error("Failed to save school-wise assignment");
    await ensureTargetSessions(db, {
      school_id: data.schoolId,
      academic_year: data.academicYear,
      unit: data.unit,
      class: data.class,
      session_count: data.sessionCount,
      assignment_type: "School-wise",
    });
    return { ok: true };
  });
