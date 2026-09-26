import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { adminDb, requireAdmin } from "./app-access.server";
import { runSchoolSync, type SyncDb } from "./school-drive.server";
import { fetchAllRows } from "./fetch-all";
const token = z.object({ token: z.string().min(1) });
export const listDriveSchools = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => token.parse(data))
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const db = await adminDb();
    return fetchAllRows<{ id: string; name: string }>((from, to) =>
      db.from("schools").select("id,name").order("id").range(from, to),
    );
  });
export const syncSchoolWorkbook = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => token.extend({ schoolId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    if (process.env.SCHOOL_DRIVE_SYNC_ENABLED !== "true")
      throw new Error(
        "School Drive sync is not enabled. Apply the migration and verify the Drive connection, then enable SCHOOL_DRIVE_SYNC_ENABLED on the server.",
      );
    return runSchoolSync((await adminDb()) as unknown as SyncDb, data.schoolId);
  });
