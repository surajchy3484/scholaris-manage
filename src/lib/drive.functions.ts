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
  .inputValidator((d: { dataUrl: string; filename: string }) => {
    if (!d?.dataUrl || !d?.filename) throw new Error("Missing photo data");
    if (!/^data:image\//.test(d.dataUrl)) throw new Error("Not a valid image data URL");
    return d;
  })
  .handler(async ({ data }): Promise<UploadResult> => {
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

    const safeName = data.filename.replace(/[^\w.\-]+/g, "_");
    const headers = {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": connKey,
    };

    // Try the configured shared folder first; fall back to My Drive root if
    // the connected account lacks access under the drive.file scope.
    let fileId: string;
    try {
      const r = await tryUpload(headers, safeName, mime, bytes, [GDRIVE_FOLDER_ID]);
      fileId = r.id;
    } catch (err) {
      console.warn("Drive upload with target folder failed, retrying to root:", err);
      const r = await tryUpload(headers, safeName, mime, bytes, null);
      fileId = r.id;
    }

    // Make the file readable by anyone with the link.
    const permRes = await fetch(
      `${GATEWAY}/drive/v3/files/${fileId}/permissions?supportsAllDrives=true`,
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ role: "reader", type: "anyone" }),
      },
    );
    if (!permRes.ok) {
      const text = await permRes.text();
      // Non-fatal: file exists in Drive; owner can still access it.
      console.warn(`Setting anyone-reader permission failed [${permRes.status}]: ${text}`);
    }

    return {
      fileId,
      // lh3 serves the raw image reliably — works as <img src> in the app
      // and opens the exact image in a new browser tab when clicked.
      url: `https://lh3.googleusercontent.com/d/${fileId}=w1200`,
      viewUrl: `https://drive.google.com/file/d/${fileId}/view`,
    };
  });

export const deletePhotoFromDrive = createServerFn({ method: "POST" })
  .inputValidator((d: { fileId: string }) => d)
  .handler(async ({ data }) => {
    const lovableKey = process.env.LOVABLE_API_KEY;
    const connKey = process.env.GOOGLE_DRIVE_API_KEY;
    if (!lovableKey || !connKey) return { ok: false };
    const res = await fetch(
      `${GATEWAY}/drive/v3/files/${data.fileId}?supportsAllDrives=true`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${lovableKey}`,
          "X-Connection-Api-Key": connKey,
        },
      },
    );
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
export function toDisplayablePhotoUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const id = extractDriveFileId(url);
  if (id) return `https://lh3.googleusercontent.com/d/${id}=w800`;
  return url;
}
