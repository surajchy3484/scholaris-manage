import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { adminDb, requireAdmin } from "./app-access.server";

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
