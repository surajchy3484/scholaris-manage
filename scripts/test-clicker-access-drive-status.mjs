import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
function load(path, mocks = {}) {
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(path, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    { exports, require: (name) => mocks[name] ?? require(name), process, Error },
  );
  return exports;
}
const access = load("src/lib/access-control.ts");
let existing = [],
  calls = [];
const query = Object.fromEntries(["select", "in", "order", "range"].map((k) => [k, () => query]));
const db = {
  from: () => query,
  rpc: async (name, args) => {
    calls.push({ name, args });
    return { data: existing.length, error: null };
  },
};
const { writeClicker } = load("src/lib/universal-clicker.server.ts", {
  "./academic-db.server": { academicDb: async () => db },
  "./app-access.server": { adminDb: async () => db },
  "./access-control": access,
  "./fetch-all": { fetchAllRows: async () => existing },
});
const admin = { role: "admin", schoolIds: [], allSchools: false, permissions: {} };
const trainer = {
  role: "trainer",
  schoolIds: ["school-a"],
  allSchools: false,
  permissions: { clicker: ["view", "delete"] },
};
const id = "00000000-0000-4000-8000-000000000001";
existing = [{ id, school_id: null, assessment_id: null }];
await writeClicker(admin, "delete", [], [id]);
assert.equal(calls.at(-1).args.p_schools, null);
assert.equal(calls.at(-1).name, "delete_clicker_records");
for (const profile of [trainer, { ...trainer, allSchools: true }]) {
  calls = [];
  await assert.rejects(writeClicker(profile, "delete", [], [id]), /School access denied/);
  assert.equal(calls.length, 0);
}
existing = [{ id, school_id: "school-b", assessment_id: "exam" }];
await assert.rejects(writeClicker(trainer, "delete", [], [id]), /School access denied/);
await writeClicker(admin, "delete", [], [id]);
existing = [{ id, school_id: "school-a", assessment_id: "exam" }];
await writeClicker(trainer, "delete", [], [id]);
assert.deepEqual(calls.at(-1).args.p_schools, ["school-a"]);
let profile = trainer;
const fn = { inputValidator: () => fn, handler: (handler) => handler };
const master = load("src/lib/master.functions.ts", {
  "./universal-clicker.server": { writeClicker },
  "./access-control": access,
  "@tanstack/react-start": { createServerFn: () => fn },
  "./academic-db.server": { academicDb: async () => db },
  "./app-access.server": {
    adminDb: async () => db,
    requirePermission: async (_, module, action) => {
      if (!access.can(profile, module, action)) throw new Error("Permission denied");
      return profile;
    },
  },
});
profile = { ...trainer, permissions: { clicker: ["view"] } };
calls = [];
await assert.rejects(
  master.deleteMasterRows({ data: { token: "test", table: "clicker_records", ids: [id] } }),
  /Permission denied/,
);
assert.equal(calls.length, 0);
profile = admin;
await master.deleteMasterRows({ data: { token: "test", table: "clicker_records", ids: [id] } });
assert.equal(calls.length, 1);

const normalRpc = db.rpc;
calls = [];
db.rpc = async (name, args) => {
  calls.push({ name, args });
  return name === "delete_clicker_records"
    ? { data: null, error: { code: "PGRST202", message: "missing function" } }
    : { data: 1, error: null };
};
await writeClicker(admin, "delete", [], [id]);
assert.deepEqual(
  calls.map((call) => call.name),
  ["delete_clicker_records", "universal_clicker_write"],
);
calls = [];
db.rpc = async (name) => {
  calls.push({ name });
  return { data: null, error: { code: "42501", message: "permission denied" } };
};
await assert.rejects(writeClicker(admin, "delete", [], [id]), /permission denied/);
assert.equal(calls.length, 1);
db.rpc = async () => ({ data: null, error: { code: "PGRST202", message: "missing function" } });
await assert.rejects(
  writeClicker(admin, "delete", [], [id]),
  /20260927180000_clicker_delete_recovery.sql.*No rows were deleted/,
);
await assert.rejects(writeClicker(admin, "insert"), /before saving Clicker data/);
db.rpc = normalRpc;

const folderId = "folder";
const { checkSchoolDriveSetup } = load("src/lib/school-drive-status.server.ts", {
  "./school-drive.server": {
    SCHOOL_DRIVE_FOLDER: folderId,
    driveClient: () => {
      throw new Error("Connect Google Drive on the server");
    },
    rpc: async (client, name, args) => {
      assert.equal(name, "school_drive_snapshot");
      assert.equal(args.p_school, null);
      return client.rpc(name, args);
    },
  },
});
const healthyDb = async () => ({ rpc: async () => ({}) });
let requests = 0;
const drive = () => async (path) => {
  requests++;
  assert.match(path, /files\/folder\?/);
  return {
    json: async () => ({
      id: folderId,
      mimeType: "application/vnd.google-apps.folder",
      capabilities: { canAddChildren: true },
    }),
  };
};
let result = await checkSchoolDriveSetup(healthyDb, drive, false);
assert.equal(result.available, false);
assert.equal(result.checks[0].ok, true);
assert.equal(result.checks[1].ok, true);
assert.equal(result.checks[2].ok, false);
result = await checkSchoolDriveSetup(healthyDb, drive, true);
assert.equal(result.available, true);
result = await checkSchoolDriveSetup(
  async () => {
    throw new Error("Migration missing");
  },
  undefined,
  false,
);
assert.equal(result.available, false);
assert.equal(result.checks.filter((c) => !c.ok).length, 3);
result = await checkSchoolDriveSetup(
  healthyDb,
  () => async () => ({
    json: async () => ({
      id: folderId,
      mimeType: "application/vnd.google-apps.folder",
      capabilities: { canAddChildren: false },
    }),
  }),
  true,
);
assert.equal(result.available, false);
assert.equal(result.checks[1].ok, false);
assert.equal(requests, 2);
console.log(
  "PASS: admin orphan deletion, scoped deletion, view-only denial, Drive migration/connection/activation checks, read-only diagnostics.",
);
