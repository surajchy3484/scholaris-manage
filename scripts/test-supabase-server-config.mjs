import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
function load(file, mocks = {}, globals = {}) {
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    {
      exports,
      require: (name) => {
        if (name in mocks) return mocks[name];
        throw new Error(`Unexpected import ${name}`);
      },
      Buffer,
      URL,
      Headers,
      Request,
      Response,
      ...globals,
    },
  );
  return exports;
}
const config = load("src/lib/supabase-config.server.ts");
const resolve = config.resolveSupabaseServerConfig;
const url = "https://test-project.supabase.co",
  secret = "sb_secret_synthetic_test_key";
const legacy = `header.${Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url")}.signature`;
assert.equal(resolve({ VITE_SUPABASE_URL: url, SUPABASE_SERVICE_KEY: legacy }).key, legacy);
const anon = `header.${Buffer.from(JSON.stringify({ role: "anon" })).toString("base64url")}.signature`;
assert.equal(resolve({ SUPABASE_URL: url, SUPABASE_SECRET_KEY: secret }).key, secret);
assert.equal(
  resolve({
    SUPABASE_URL: url,
    SUPABASE_SECRET_KEYS: JSON.stringify({ default: secret, other: "sb_secret_other" }),
  }).key,
  secret,
);
assert.equal(
  resolve({ SUPABASE_URL: url, SUPABASE_SECRET_KEYS: JSON.stringify({ custom: secret }) }).key,
  secret,
);
assert.equal(resolve({ SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: legacy }).key, legacy);
assert.equal(
  resolve({ SUPABASE_URL: url, SUPABASE_SECRET_KEY: secret, SUPABASE_SERVICE_ROLE_KEY: legacy })
    .key,
  secret,
);
for (const publicKey of ["sb_publishable_test", anon])
  assert.throws(
    () => resolve({ SUPABASE_URL: url, SUPABASE_SECRET_KEY: publicKey }),
    /anon\/publishable/,
  );
assert.throws(
  () => resolve({ SUPABASE_URL: url, VITE_SUPABASE_SERVICE_ROLE_KEY: secret }),
  /not configured/,
);
assert.throws(() => resolve({ SUPABASE_URL: url, SUPABASE_ANON_KEY: anon }), /not configured/);
assert.throws(
  () => resolve({ SUPABASE_URL: url, SUPABASE_SECRET_KEYS: "invalid-secret-json" }),
  /JSON object/,
);
assert.throws(
  () =>
    resolve({ SUPABASE_URL: url, SUPABASE_SECRET_KEYS: JSON.stringify({ a: secret, b: secret }) }),
  /select one key/,
);
assert.throws(() => resolve({ SUPABASE_SECRET_KEY: secret }), /SUPABASE_URL/);
assert.throws(() => resolve({ SUPABASE_URL: "bad", SUPABASE_SECRET_KEY: secret }), /valid HTTP/);
let calls = 0,
  request;
const env = { SUPABASE_URL: url };
const admin = load(
  "src/lib/supabase-admin.server.ts",
  {
    "./supabase-config.server": config,
    "@supabase/supabase-js": {
      createClient: (u, k) => {
        calls++;
        assert.equal(u, url);
        assert.equal(k, secret);
        return { marker: "client" };
      },
    },
  },
  {
    process: { env },
    fetch: async (input, init) => {
      request = init;
      return new Response("{}");
    },
  },
);
assert.throws(() => admin.getSupabaseAdmin(), /not configured/);
env.SUPABASE_SECRET_KEY = secret;
assert.equal(admin.getSupabaseAdmin().marker, "client");
assert.equal(admin.getSupabaseAdmin().marker, "client");
assert.equal(calls, 1);
await admin.createAdminFetch(secret)(url, {
  headers: { Authorization: `Bearer ${secret}`, "X-Test": "yes" },
});
assert.equal(request.headers.get("apikey"), secret);
assert.equal(request.headers.get("Authorization"), null);
assert.equal(request.headers.get("X-Test"), "yes");
await admin.createAdminFetch(legacy)(url, { headers: { Authorization: `Bearer ${legacy}` } });
assert.equal(request.headers.get("Authorization"), `Bearer ${legacy}`);
await admin.createAdminFetch(secret)(url, { headers: { Authorization: "Bearer user-token" } });
assert.equal(request.headers.get("Authorization"), "Bearer user-token");
console.log(
  "PASS: modern/legacy server keys, JSON defaults, public-key rejection, missing configuration recovery, caching, and correct request headers.",
);
