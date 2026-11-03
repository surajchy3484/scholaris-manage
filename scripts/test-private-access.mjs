import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { webcrypto } from "node:crypto";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
function load(path, mocks = {}, globals = {}) {
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(path, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    {
      exports,
      require: (name) => mocks[name] ?? require(name),
      crypto: webcrypto,
      TextEncoder,
      TextDecoder,
      btoa,
      atob,
      Uint8Array,
      Buffer,
      URLSearchParams,
      Headers,
      AbortSignal,
      Error,
      ...globals,
    },
  );
  return exports;
}
const access = load("src/lib/access-control.ts");
const env = { APP_SESSION_SECRET: "random-test-secret-only-012345678901234567890" };
let account = {
  id: "00000000-0000-4000-8000-000000000001",
  username: "owner",
  full_name: "Owner",
  role: "admin",
  is_active: true,
  permissions: {},
  school_ids: [],
  all_schools: true,
  password_hash: "stored-password-hash",
};
const authQuery = {
  select: () => authQuery,
  eq: () => authQuery,
  maybeSingle: async () => ({ data: account, error: null }),
};
const auth = load(
  "src/lib/app-access.server.ts",
  {
    "./access-control": access,
    "./supabase-admin.server": { getSupabaseAdmin: () => ({ from: () => authQuery }) },
  },
  { process: { env } },
);
await assert.rejects(auth.resolveAccess(""), /Unauthorized/);
await assert.rejects(auth.resolveAccess("legacy-password"), /approved account/);
await assert.rejects(auth.resolveAccess("st1.old.signature"), /approved account/);
const signed = await auth.issueToken(account.id, account.password_hash);
assert.equal((await auth.resolveAccess(signed)).role, "admin");
await assert.rejects(auth.resolveAccess(signed + "tampered"), /expired/);
account.is_active = false;
await assert.rejects(auth.resolveAccess(signed), /disabled/);
account.is_active = true;
account.password_hash = "changed-password-hash";
await assert.rejects(auth.resolveAccess(signed), /expired/);
delete env.APP_SESSION_SECRET;
await assert.rejects(auth.issueToken(account.id, account.password_hash), /APP_SESSION_SECRET/);
assert.equal(
  access.can({ role: "trainer", permissions: { users: ["add", "edit"] } }, "users", "edit"),
  false,
);

const sid = "11111111-1111-4111-8111-111111111111";
let profile = {
  role: "trainer",
  permissions: {
    students: ["view", "add", "edit"],
    schools: ["view"],
    attendance: ["view", "add", "edit"],
  },
  schoolIds: [sid],
  allSchools: false,
};
let requests = [];
const bridge = load(
  "src/lib/private-data.server.ts",
  {
    "./access-control": access,
    "./app-access.server": {
      resolveAccess: async (token) => {
        if (token !== "valid") throw new Error("Unauthorized");
        return profile;
      },
      adminDb: async () => ({ from: () => authQuery }),
    },
    "./supabase-config.server": {
      resolveSupabaseServerConfig: () => ({
        url: "https://example.supabase.co",
        key: "sb_secret_test",
      }),
    },
    "./supabase-admin.server": {
      createAdminFetch: () => async (url, init) => {
        requests.push({ url, init });
        return new Response("[]", { status: 200, headers: { "content-range": "0-0/1" } });
      },
    },
  },
  { process: { env: {} }, Response },
);
const request = {
  token: "valid",
  table: "students",
  method: "GET",
  query: "select=*",
  headers: {},
};
await assert.rejects(bridge.privateData({ ...request, token: "" }), /Unauthorized/);
await assert.rejects(bridge.privateData({ ...request, table: "app_users" }), /Unsupported/);
await assert.rejects(
  bridge.privateData({ ...request, query: "select=*,app_users(*)" }),
  /selection/,
);
await assert.rejects(
  bridge.privateData({ ...request, query: "select=*&select=*,app_users(*)" }),
  /selection/,
);
assert.equal(requests.length, 0);
await bridge.privateData({
  ...request,
  query: "select=*&school_id=eq.other&or=(name.eq.a,name.eq.b)",
  headers: { "accept-profile": "auth" },
});
assert.equal(new URL(requests[0].url).searchParams.getAll("school_id").at(-1), `in.(${sid})`);
assert.equal(requests[0].init.headers.has("accept-profile"), false);
await bridge.privateData({ ...request, table: "schools", query: "select=*,students(count)" });
await assert.rejects(
  bridge.privateData({ ...request, method: "DELETE", query: "id=eq.x" }),
  /Permission denied/,
);
await assert.rejects(
  bridge.privateData({ ...request, method: "POST", body: JSON.stringify({ school_id: "other" }) }),
  /School access denied/,
);
await assert.rejects(
  bridge.privateData({
    ...request,
    method: "PATCH",
    query: "id=eq.x",
    body: JSON.stringify({ id: "other" }),
  }),
  /IDs cannot/,
);
await assert.rejects(
  bridge.privateData({
    ...request,
    method: "POST",
    headers: { prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ school_id: sid }),
  }),
  /Use edit/,
);
profile = { ...profile, role: "admin" };
await bridge.privateData({ ...request, method: "DELETE", query: "id=eq.x" });
assert.equal(new URL(requests.at(-1).url).searchParams.has("school_id"), false);
await assert.rejects(
  bridge.privateData({ ...request, method: "DELETE", query: "" }),
  /Select records/,
);
console.log(
  "PASS: no legacy/default login, signed sessions, disable/reset revocation, missing-secret denial, admin-only account permissions, protected table proxy and school scope.",
);

// Publicly callable photo functions must authorize before any Drive request.
let photoCalls = [];
let allowed = false;
const fn = { validator: () => fn, inputValidator: () => fn, handler: (callback) => callback };
const drive = load(
  "src/lib/drive.functions.ts",
  {
    "@tanstack/react-start": { createServerFn: () => fn },
    "./app-access.server": {
      resolveAccess: async () => {
        if (!allowed) throw new Error("Unauthorized");
        return { role: "admin" };
      },
      requireAdmin: async () => {
        if (!allowed) throw new Error("Unauthorized");
      },
    },
    "./access-control": access,
  },
  {
    process: { env: { LOVABLE_API_KEY: "synthetic", GOOGLE_DRIVE_API_KEY: "synthetic" } },
    Blob,
    Response,
    fetch: async (url, init) => {
      photoCalls.push({ url, init });
      return new Response(JSON.stringify({ id: "test_photo_id" }), { status: 200 });
    },
  },
);
await assert.rejects(
  drive.uploadPhotoToDrive({
    data: { token: "", dataUrl: "data:image/jpeg;base64,YQ==", filename: "photo.jpg" },
  }),
  /Unauthorized/,
);
await assert.rejects(
  drive.deletePhotoFromDrive({ data: { token: "", fileId: "test_photo_id" } }),
  /Unauthorized/,
);
await assert.rejects(
  drive.readPrivatePhoto({ data: { token: "", fileId: "test_photo_id" } }),
  /Unauthorized/,
);
assert.equal(photoCalls.length, 0);
allowed = true;
await drive.uploadPhotoToDrive({
  data: { token: "valid", dataUrl: "data:image/jpeg;base64,YQ==", filename: "photo.jpg" },
});
assert.equal(photoCalls.length, 1);
assert.equal(
  photoCalls.some((call) => call.url.includes("/permissions")),
  false,
);
console.log("PASS: Drive endpoints require approval; uploads do not grant public sharing.");
