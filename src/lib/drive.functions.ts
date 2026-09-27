import { adminDb, requireAdmin, resolveAccess } from "./app-access.server";
import { can, canSeeSchool } from "./access-control";
import { createServerFn } from "@tanstack/react-start";

const GDRIVE_FOLDER_ID = "1XXKtXiKsvBxveUJo8ANHc1JKUPpW26oc";
const GATEWAY = "https://connector-gateway.lovable.dev/google_drive";

type UploadResult = {
  fileId: string;
  url: string; // direct-content URL, embeddable in <img> and Excel HYPERLINK
  viewUrl: string; // human-friendly Google Drive page
};

function buildMultipartBody(
  filename: string,
  mime: string,
  bytes: Uint8Array,
  parents: string[] | null,
): { body: Uint8Array; boundary: string } {
  const boundary = "scholarisboundary" + Math.random().toString(16).slice(2);
  const meta = parents ? { name: filename, parents } : { name: filename };
  const enc = new TextEncoder();
  const pre = enc.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`,
  );
  const post = enc.encode(`\r\n--${boundary}--\r\n`);
  const body = new Uint8Array(pre.byteLength + bytes.byteLength + post.byteLength);
  body.set(pre, 0);
  body.set(bytes, pre.byteLength);
  body.set(post, pre.byteLength + bytes.byteLength);
  return { body, boundary };
}

async function tryUpload(
  headers: Record<string, string>,
  filename: string,
  mime: string,
  bytes: Uint8Array,
  parents: string[] | null,
): Promise<{ id: string }> {
  const { body, boundary } = buildMultipartBody(filename, mime, bytes, parents);
  const res = await fetch(
    `${GATEWAY}/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id`,
    {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body: new Blob([body.buffer as ArrayBuffer]),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Drive upload failed [${res.status}]: ${text}`);
  }
  return (await res.json()) as { id: string };
}

export const uploadPhotoToDrive = createServerFn({ method: "POST" })
  .validator((d: { token: string; dataUrl: string; filename: string }) => {
    if (!d?.dataUrl || !d?.filename) throw new Error("Missing photo data");
    if (!/^data:image\//.test(d.dataUrl)) throw new Error("Not a valid image data URL");
    return d;
  })
  .handler(async ({ data }): Promise<UploadResult> => {
    const profile = await resolveAccess(data.token);
    if (
      !can(profile, "students", "add") &&
      !can(profile, "students", "edit") &&
      !can(profile, "exam_report", "edit")
    )
      throw new Error("Photo edit permission required");
    if (data.dataUrl.length > 8_000_000) throw new Error("Photo too large");
    const lovableKey = process.env.LOVABLE_API_KEY;
    const connKey = process.env.GOOGLE_DRIVE_API_KEY;
    if (!lovableKey || !connKey) {
      throw new Error("Google Drive is not connected on the server.");
    }

    const m = /^data:(image\/[a-z0-9+.-]+);base64,(.+)$/i.exec(data.dataUrl);
    if (!m) throw new Error("Invalid image data");
    const mime = m[1];
    const b64 = m[2];
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    const safeName = data.filename.replace(/[^\w.-]+/g, "_");
    const headers = {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": connKey,
    };

    // Preserve the folder's permissions; never grant public sharing or use Drive root.
    const uploaded = await tryUpload(headers, safeName, mime, bytes, [GDRIVE_FOLDER_ID]);
    const fileId = uploaded.id;

    return {
      fileId,
      // Store a stable file reference; the app reads its bytes through an authorized endpoint.
      url: `https://lh3.googleusercontent.com/d/${fileId}=w1200`,
      viewUrl: `https://drive.google.com/file/d/${fileId}/view`,
    };
  });

export const deletePhotoFromDrive = createServerFn({ method: "POST" })
  .validator((d: { token: string; fileId: string }) => d)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    if (!/^[A-Za-z0-9_-]+$/.test(data.fileId)) throw new Error("Invalid file ID");
    const lovableKey = process.env.LOVABLE_API_KEY;
    const connKey = process.env.GOOGLE_DRIVE_API_KEY;
    if (!lovableKey || !connKey) return { ok: false };
    const res = await fetch(`${GATEWAY}/drive/v3/files/${data.fileId}?supportsAllDrives=true`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": connKey,
      },
    });
    return { ok: res.ok };
  });

// Extract a Google Drive file id from any of the URLs we generate.
export function extractDriveFileId(url: string | null | undefined): string | null {
  if (!url) return null;
  const m1 = /[?&]id=([A-Za-z0-9_-]+)/.exec(url);
  if (m1) return m1[1];
  const m2 = /\/file\/d\/([A-Za-z0-9_-]+)/.exec(url);
  if (m2) return m2[1];
  const m3 = /lh3\.googleusercontent\.com\/d\/([A-Za-z0-9_-]+)/.exec(url);
  if (m3) return m3[1];
  return null;
}

// Convert any Google Drive URL variant to a URL that reliably embeds in
// <img> tags and opens the raw image in a new browser tab. Non-Drive URLs
// pass through untouched.
export function toDisplayablePhotoUrl(url: string | null | undefined, size = 800): string | null {
  if (!url) return null;
  const id = extractDriveFileId(url);
  if (id) return `https://lh3.googleusercontent.com/d/${id}=w${size}`;
  return url;
}

export const readPrivatePhoto = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string; fileId: string }) => {
    if (!d?.token || !/^[A-Za-z0-9_-]{5,200}$/.test(d.fileId))
      throw new Error("Invalid photo request");
    return d;
  })
  .handler(async ({ data }) => {
    const profile = await resolveAccess(data.token);
    if (
      !can(profile, "students", "view") &&
      !can(profile, "exam_report", "view") &&
      !can(profile, "attendance", "view")
    )
      throw new Error("Photo access denied");
    const db = await adminDb();
    let query = db
      .from("students")
      .select("school_id,photo_url")
      .ilike("photo_url", `%${data.fileId}%`);
    if (profile.role !== "admin" && !profile.allSchools)
      query = query.in("school_id", profile.schoolIds);
    const { data: rows, error } = await query.limit(100);
    if (
      error ||
      !rows?.some(
        (row) =>
          extractDriveFileId(row.photo_url) === data.fileId && canSeeSchool(profile, row.school_id),
      )
    )
      throw new Error("Photo access denied");
    const key = process.env.LOVABLE_API_KEY,
      connection = process.env.GOOGLE_DRIVE_API_KEY;
    if (!key || !connection) throw new Error("Google Drive is not connected");
    const response = await fetch(
      `${GATEWAY}/drive/v3/files/${data.fileId}?alt=media&supportsAllDrives=true`,
      {
        headers: { Authorization: `Bearer ${key}`, "X-Connection-Api-Key": connection },
        signal: AbortSignal.timeout(30000),
      },
    );
    if (!response.ok) throw new Error("Unable to load photo");
    const type = response.headers.get("content-type")?.split(";")[0] ?? "";
    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(type))
      throw new Error("Unsupported photo format");
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Empty photo");
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.length;
      if (size > 6_000_000) {
        await reader.cancel();
        throw new Error("Photo too large");
      }
      chunks.push(next.value);
    }
    return `data:${type};base64,${Buffer.concat(chunks).toString("base64")}`;
  });
