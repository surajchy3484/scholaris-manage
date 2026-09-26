import { randomUUID } from "node:crypto";
import {
  baseline,
  decodeWorkbook,
  encodeWorkbook,
  planSync,
  type Baseline,
  type Snapshot,
} from "./school-workbook";

export const SCHOOL_DRIVE_FOLDER = "1tUpZACLsarpCEiY0-43SFCvBQnASSusY";
const GATEWAY = "https://connector-gateway.lovable.dev/google_drive";
const MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const MAX_BYTES = 20 * 1024 * 1024;
// These new RPCs are intentionally isolated until generated Supabase types are refreshed.
export type SyncDb = {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;
};
type FileMeta = {
  id: string;
  mimeType: string;
  size?: string;
  parents?: string[];
  trashed?: boolean;
  appProperties?: Record<string, string>;
};
const errorMessage = (error: unknown) => (error instanceof Error ? error.message : "Sync failed");

export async function rpc<T>(db: SyncDb, name: string, args: Record<string, unknown>): Promise<T> {
  const result = await db.rpc(name, args);
  if (result.error) {
    if (["PGRST202", "42P01", "42883"].includes(result.error.code ?? ""))
      throw new Error(
        "Drive sync needs the school_drive_sync database migration. Existing app data is unaffected.",
      );
    throw new Error(result.error.message);
  }
  return result.data as T;
}
export function driveClient() {
  const key = process.env.LOVABLE_API_KEY,
    connection = process.env.GOOGLE_DRIVE_API_KEY;
  if (!key || !connection)
    throw new Error("Connect Google Drive on the server before using school workbook sync.");
  return async (path: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${key}`);
    headers.set("X-Connection-Api-Key", connection);
    const response = await fetch(`${GATEWAY}${path}`, {
      ...init,
      headers,
      signal: AbortSignal.timeout(60000),
    });
    if (!response.ok) {
      if (response.status === 412)
        throw new Error(
          "The workbook changed in Drive during sync. Retry; your Drive edits were not overwritten.",
        );
      if (response.status === 403 || response.status === 404)
        throw new Error(
          "Cannot access the school workbook or configured Drive folder. Check the connected account’s permissions.",
        );
      throw new Error(`Google Drive request failed (${response.status}). Retry later.`);
    }
    return response;
  };
}
type Drive = ReturnType<typeof driveClient>;
async function metadata(drive: Drive, id: string) {
  const response = await drive(
    `/drive/v3/files/${encodeURIComponent(id)}?supportsAllDrives=true&fields=id,mimeType,size,parents,trashed,appProperties`,
  );
  const file = (await response.json()) as FileMeta;
  return { file, etag: response.headers.get("etag") };
}
function verify(file: FileMeta, schoolId: string) {
  if (
    file.trashed ||
    file.mimeType !== MIME ||
    !file.parents?.includes(SCHOOL_DRIVE_FOLDER) ||
    file.appProperties?.schoolriseSchoolId !== schoolId
  )
    throw new Error(
      "The original Excel workbook must remain in the configured school Drive folder. Restore it before syncing.",
    );
  if (Number(file.size ?? 0) > MAX_BYTES)
    throw new Error(
      "This workbook exceeds the 20 MB sync limit. Keep larger archives in Drive and manage live records in the app.",
    );
}
function encode(schoolId: string, data: Snapshot) {
  const bytes = encodeWorkbook(schoolId, data);
  if (bytes.byteLength > MAX_BYTES)
    throw new Error("This school workbook exceeds the 20 MB sync limit. No data was truncated.");
  return bytes;
}
export async function runSchoolSync(db: SyncDb, schoolId: string, drive: Drive = driveClient()) {
  const lease = randomUUID();
  const state = await rpc<{ file_id: string | null; baseline: Baseline }>(
    db,
    "school_drive_acquire",
    { p_school: schoolId, p_lease: lease },
  );
  let finished = false;
  try {
    let snapshot = await rpc<Snapshot>(db, "school_drive_snapshot", { p_school: schoolId });
    if (!snapshot.schools?.length) throw new Error("School not found");
    let fileId = state.file_id;
    if (!fileId) {
      const q = `'${SCHOOL_DRIVE_FOLDER}' in parents and trashed = false and appProperties has { key='schoolriseSchoolId' and value='${schoolId}' }`;
      const response = await drive(
        `/drive/v3/files?${new URLSearchParams({ q, fields: "files(id),nextPageToken", pageSize: "2", supportsAllDrives: "true", includeItemsFromAllDrives: "true" })}`,
      );
      const list = (await response.json()) as { files: { id: string }[]; nextPageToken?: string };
      if (list.files.length > 1 || list.nextPageToken)
        throw new Error(
          "Multiple workbooks found for this school. Resolve duplicates before syncing.",
        );
      fileId = list.files[0]?.id ?? null;
    }
    let imported = 0;
    if (fileId) {
      const before = await metadata(drive, fileId);
      verify(before.file, schoolId);
      if (!before.etag || before.etag.startsWith("W/"))
        throw new Error(
          "The Drive connection does not provide a strong ETag. Safe workbook updates are unavailable; no data has been changed.",
        );
      const response = await drive(
        `/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
      );
      // Limit actual streamed bytes too; Content-Length is not guaranteed by the gateway.
      const reader = response.body?.getReader();
      if (!reader) throw new Error("Empty Drive response");
      const chunks: Uint8Array[] = [];
      let size = 0;
      for (;;) {
        const item = await reader.read();
        if (item.done) break;
        size += item.value.byteLength;
        if (size > MAX_BYTES) {
          await reader.cancel();
          throw new Error("Workbook exceeds the 20 MB sync limit");
        }
        chunks.push(item.value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      const after = await metadata(drive, fileId);
      verify(after.file, schoolId);
      if (after.etag !== before.etag) throw new Error("Workbook changed while downloading. Retry.");
      const plan = planSync(snapshot, decodeWorkbook(bytes, schoolId, snapshot), state.baseline);
      if (plan.conflicts.length)
        return { fileId, imported: 0, conflicts: plan.conflicts, syncedAt: null };
      // Preflight Excel limits before importing anything.
      encode(schoolId, snapshot);
      for (let start = 0; start < plan.changes.length; start += 250)
        imported += await rpc<number>(db, "school_drive_apply", {
          p_school: schoolId,
          p_lease: lease,
          p_changes: plan.changes.slice(start, start + 250),
        });
      snapshot = await rpc<Snapshot>(db, "school_drive_snapshot", { p_school: schoolId });
      // Renew/check the lease before the remote write, including no-change syncs.
      await rpc(db, "school_drive_apply", { p_school: schoolId, p_lease: lease, p_changes: [] });
      await drive(
        `/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=media&supportsAllDrives=true`,
        {
          method: "PATCH",
          headers: { "Content-Type": MIME, "If-Match": before.etag },
          body: encode(schoolId, snapshot) as BodyInit,
        },
      );
    } else {
      const school = snapshot.schools[0];
      const name = `${String(school.code ?? schoolId)}-${String(school.name)
        .replace(/[^\p{L}\p{N} ._-]/gu, "_")
        .slice(0, 100)}.xlsx`;
      const boundary = `schoolrise_${randomUUID()}`;
      const content = encode(schoolId, snapshot);
      const body = new Blob([
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, mimeType: MIME, parents: [SCHOOL_DRIVE_FOLDER], appProperties: { schoolriseSchoolId: schoolId } })}\r\n--${boundary}\r\nContent-Type: ${MIME}\r\n\r\n`,
        content as BlobPart,
        `\r\n--${boundary}--`,
      ]);
      await rpc(db, "school_drive_apply", { p_school: schoolId, p_lease: lease, p_changes: [] });
      const response = await drive(
        "/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id",
        {
          method: "POST",
          headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
          body,
        },
      );
      fileId = ((await response.json()) as { id: string }).id;
      if (!fileId)
        throw new Error("Drive did not return a workbook ID. Retry to discover the uploaded file.");
    }
    await rpc(db, "school_drive_finish", {
      p_school: schoolId,
      p_lease: lease,
      p_file: fileId,
      p_baseline: baseline(snapshot),
    });
    finished = true;
    return { fileId, imported, conflicts: [] as string[], syncedAt: new Date().toISOString() };
  } catch (error) {
    throw new Error(
      `${errorMessage(error)} If an earlier batch was imported, it is preserved; retry reconciles it without duplicating records.`,
    );
  } finally {
    if (!finished)
      await rpc(db, "school_drive_release", { p_school: schoolId, p_lease: lease }).catch(
        () => undefined,
      );
  }
}
