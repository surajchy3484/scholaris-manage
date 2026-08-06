import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Assessment / Question / Clicker data contains student-identifying academic
 * records, so these tables are not reachable by the Data API roles at all.
 * Every read and write goes through these server functions, which require the
 * app's shared access password before using privileged database access.
 */
function assertAccess(token: string) {
  const expected = process.env['APP_ACCESS_PASSWORD'] ?? "123456";
  if (!token || token !== expected) {
    throw new Error("Unauthorized");
  }
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

const tableSchema = z.enum(["assessments", "questions", "clicker_records"]);
const tokenSchema = z.object({ token: z.string().min(1) });

const listSchema = tokenSchema.extend({
  table: tableSchema,
  assessmentId: z.string().max(120).optional(),
});

export const listMasterRows = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => listSchema.parse(data))
  .handler(async ({ data }): Promise<Record<string, unknown>[]> => {
    assertAccess(data.token);
    const db = await admin();
    const out: Record<string, unknown>[] = [];
    const batch = 1000;
    for (let from = 0; ; from += batch) {
      let q = db.from(data.table).select("*").range(from, from + batch - 1);
      if (data.table === "assessments") q = q.order("created_at", { ascending: false });
      else if (data.table === "questions") q = q.order("question_no");
      else q = q.order("ranking", { nullsFirst: false });
      if (data.assessmentId && data.assessmentId !== "all" && data.table !== "assessments") {
        q = q.eq("assessment_id", data.assessmentId);
      }
      const { data: rows, error } = await q;
      if (error) throw new Error("Failed to load records");
      const list = (rows ?? []) as Record<string, unknown>[];
      out.push(...list);
      if (list.length < batch) break;
    }
    return out;
  });

const rowSchema = z.record(z.string(), z.unknown());

const insertSchema = tokenSchema.extend({
  table: tableSchema,
  rows: z.array(rowSchema).min(1).max(1000),
});

export const insertMasterRows = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => insertSchema.parse(data))
  .handler(async ({ data }) => {
    assertAccess(data.token);
    const db = await admin();
    const { error } = await db.from(data.table).insert(data.rows as never);
    if (error) {
      throw new Error(
        error.code === "23505" ? "DUPLICATE" : "Failed to save records",
      );
    }
    return { ok: true, count: data.rows.length };
  });

const updateSchema = tokenSchema.extend({
  table: tableSchema,
  ids: z.array(z.string().uuid()).min(1).max(1000),
  patch: rowSchema,
});

export const updateMasterRows = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => updateSchema.parse(data))
  .handler(async ({ data }) => {
    assertAccess(data.token);
    const db = await admin();
    const { error } = await db
      .from(data.table)
      .update(data.patch as never)
      .in("id", data.ids);
    if (error) throw new Error("Failed to update records");
    return { ok: true };
  });

const deleteSchema = tokenSchema.extend({
  table: tableSchema,
  ids: z.array(z.string().uuid()).min(1).max(1000),
});

export const deleteMasterRows = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => deleteSchema.parse(data))
  .handler(async ({ data }) => {
    assertAccess(data.token);
    const db = await admin();
    const { error } = await db.from(data.table).delete().in("id", data.ids);
    if (error) throw new Error("Failed to delete records");
    return { ok: true };
  });
