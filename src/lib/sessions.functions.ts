import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { fetchAllRows } from "./fetch-all";
import { adminDb, requirePermission } from "./app-access.server";

const token = z.object({ token: z.string().min(1) });
const status = z.enum(["pending", "complete"]);
const unit = z.enum(["Unit-1", "Unit-2", "Unit-3", "Unit-4"]);
// Divisions / batches are admin-defined free text ("A", "Batch 1", "Morning Batch").
const division = z.string().min(1).max(60);

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
    await requirePermission(data.token, "session_status", "view");
    const db = await adminDb();
    const out: Record<string, unknown>[] = [];
    const batch = 1000;
    for (let from = 0; ; from += batch) {
      let q = db
        .from("sessions")
        .select("id, school_id, unit, session_name, class, topic, created_at")
        .order("created_at", { ascending: true })
        .range(from, from + batch - 1);
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
    await requirePermission(data.token, "session_status", "view");
    const db = await adminDb();

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
    await requirePermission(data.token, "session_status", "view");
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
    await requirePermission(data.token, "session_status", "add");
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
    await requirePermission(data.token, "session_status", "edit");
    const db = await adminDb();
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
    await requirePermission(data.token, "session_status", "status");
    const db = await adminDb();
    const rows = data.ids.map((id) => ({
      session_id: id,
      school_id: data.schoolId,
      unit: data.unit,
      class: data.class,
      division: data.division,
      status: data.status,
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
    await requirePermission(data.token, "session_status", "delete");
    const db = await adminDb();
    const { error } = await db.from("sessions").delete().in("id", data.ids);
    if (error) throw new Error("Failed to delete sessions");
    return { ok: true };
  });
