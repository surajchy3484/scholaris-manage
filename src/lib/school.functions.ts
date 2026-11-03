import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { adminDb, requireAdmin, requirePermission } from "./app-access.server";

const divisionSchema = z.object({
  class: z.string().trim().max(100),
  name: z.string().trim().min(1).max(100),
});

export const updateSchool = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        token: z.string().min(1),
        schoolId: z.string().uuid(),
        name: z.string().trim().min(1).max(300),
        location: z.string().trim().min(1).max(500),
        clusterName: z.string().trim().max(200).nullable(),
        imageUrl: z.string().nullable(),
        divisions: z.array(divisionSchema).max(500),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const db = await adminDb();
    const { error: schoolError } = await db
      .from("schools")
      .update({
        name: data.name,
        location: data.location,
        cluster_name: data.clusterName || null,
        image_url: data.imageUrl,
      })
      .eq("id", data.schoolId);
    if (schoolError) throw new Error("Unable to update school details.");

    const { error: deleteError } = await db
      .from("school_divisions")
      .delete()
      .eq("school_id", data.schoolId);
    if (deleteError) throw new Error("Unable to update school divisions.");
    if (data.divisions.length) {
      const { error: insertError } = await db.from("school_divisions").insert(
        data.divisions.map((division, index) => ({
          school_id: data.schoolId,
          class: division.class,
          name: division.name,
          sort_order: index,
        })),
      );
      if (insertError) throw new Error("Unable to update school divisions.");
    }
    return { ok: true };
  });

export const listClusters = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ token: z.string().min(1) }).parse(data))
  .handler(async ({ data }) => {
    await requirePermission(data.token, "dashboard", "view");
    const db = await adminDb();
    const { data: rows, error } = await db.from("school_clusters").select("name").order("name");
    if (error) return { clusters: [] as string[] };
    return { clusters: (rows ?? []).map((row) => row.name).filter(Boolean) as string[] };
  });

export const saveCluster = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z.object({ token: z.string().min(1), name: z.string().trim().min(1).max(200) }).parse(data),
  )
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const db = await adminDb();
    const { data: rows } = await db.from("school_clusters").select("name");
    const duplicate = (rows ?? []).some(
      (row) => row.name.trim().toLowerCase() === data.name.toLowerCase(),
    );
    if (duplicate) throw new Error("That cluster already exists.");
    const { error } = await db.from("school_clusters").insert({ name: data.name });
    if (error) throw new Error("Unable to save the cluster.");
    return { ok: true };
  });
