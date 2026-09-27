import { driveClient, rpc, SCHOOL_DRIVE_FOLDER, type SyncDb } from "./school-drive.server";

export async function checkSchoolDriveSetup(
  getDb: () => Promise<SyncDb>,
  getDrive = driveClient,
  enabled = process.env.SCHOOL_DRIVE_SYNC_ENABLED === "true",
) {
  const checks: { name: string; ok: boolean; message: string }[] = [];
  // NULL returns an empty snapshot: no student data or sync leases are fetched/written.
  try {
    await rpc(await getDb(), "school_drive_snapshot", { p_school: null });
    checks.push({ name: "Database", ok: true, message: "Workbook snapshot is available." });
  } catch (error) {
    checks.push({
      name: "Database",
      ok: false,
      message: error instanceof Error ? error.message : "Unable to check the database.",
    });
  }
  try {
    const response = await getDrive()(
      `/drive/v3/files/${SCHOOL_DRIVE_FOLDER}?supportsAllDrives=true&fields=id,mimeType,trashed,capabilities(canAddChildren)`,
    );
    const folder = await response.json();
    if (
      folder.id !== SCHOOL_DRIVE_FOLDER ||
      folder.trashed ||
      folder.mimeType !== "application/vnd.google-apps.folder" ||
      folder.capabilities?.canAddChildren !== true
    ) {
      throw new Error(
        "The connected Drive account needs permission to add files to your school folder.",
      );
    }
    checks.push({
      name: "Drive folder",
      ok: true,
      message: "Connected account can add files to your school folder.",
    });
  } catch (error) {
    checks.push({
      name: "Drive folder",
      ok: false,
      message: error instanceof Error ? error.message : "Unable to check Google Drive.",
    });
  }
  checks.push({
    name: "Sync activation",
    ok: enabled,
    message: enabled
      ? "School workbook sync is enabled on the server."
      : "Hosting setup required: after migration and Drive conditional-write verification, set SCHOOL_DRIVE_SYNC_ENABLED=true in the app server environment and restart or redeploy.",
  });
  return { available: checks.every((check) => check.ok), checks };
}
