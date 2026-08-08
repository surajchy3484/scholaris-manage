import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { adminDb, assertAccess } from "./app-access.server";

const token = z.object({ token: z.string().min(1) });
const status = z.enum(["pending", "complete"]);
const unit = z.enum(["Unit-1", "Unit-2", "Unit-3", "Unit-4"]);

export const listSessions = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    token.extend({ schoolId: z.string().uuid().optional() }).parse(data),
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  .handler(async ({ data }): Promise<any[]> => {
    assertAccess(data.token);
    const db = await adminDb();
    const out: Record<string, unknown>[] = [];
    const batch = 1000;
    for (let from = 0; ; from += batch) {
      let q = db
        .from("sessions")
        .select("*")
        .order("created_at", { ascending: true })
        .range(from, from + batch - 1);
      if (data.schoolId) q = q.eq("school_id", data.schoolId);
      const { data: rows, error } = await q;
      if (error) throw new Error("Failed to load sessions");
      const list = (rows ?? []) as Record<string, unknown>[];
      out.push(...list);
      if (list.length < batch) break;
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
              division: z.string().max(50).default(""),
              topic: z.string().max(300).default(""),
              status: status.default("pending"),
            }),
          )
          .min(1)
          .max(1000),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    assertAccess(data.token);
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
          division: z.string().max(50).optional(),
          topic: z.string().max(300).optional(),
          unit: unit.optional(),
          status: status.optional(),
        }),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    assertAccess(data.token);
    const db = await adminDb();
    const { error } = await db.from("sessions").update(data.patch).in("id", data.ids);
    if (error) throw new Error("Failed to update sessions");
    return { ok: true };
  });

export const deleteSessions = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    token.extend({ ids: z.array(z.string().uuid()).min(1).max(2000) }).parse(data),
  )
  .handler(async ({ data }) => {
    assertAccess(data.token);
    const db = await adminDb();
    const { error } = await db.from("sessions").delete().in("id", data.ids);
    if (error) throw new Error("Failed to delete sessions");
    return { ok: true };
  });
