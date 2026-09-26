import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";
import * as XLSX from "xlsx";
const require = createRequire(import.meta.url);
function load(path, extra = {}) {
  const output = ts.transpileModule(fs.readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(output, {
    exports,
    Error,
    require: (n) => extra[n] ?? require(n),
    Buffer,
    Uint8Array,
    Blob,
    Response,
    Headers,
    AbortSignal,
    URLSearchParams,
    process,
    fetch,
  });
  return exports;
}
const w = load("src/lib/school-workbook.ts");
const school = "00000000-0000-4000-8000-000000000001",
  student = "00000000-0000-4000-8000-000000000002";
const initial = Object.fromEntries(Object.keys(w.SHEETS).map((t) => [t, []]));
initial.schools = [{ id: school, name: "School One", location: null }];
initial.students = [
  {
    id: student,
    school_id: school,
    name: "Asha",
    roll_number: "001",
    enrollment_date: "2026-09-01",
    photo_url: null,
    updated_at: "2026-09-01T00:00:00Z",
  },
];
initial.assessment_results = [
  {
    id: "r",
    score: 0,
    correct_answers: 0,
    wrong_answers: 4,
    ranking: null,
    answers: { 1: "A" },
    school_id: school,
  },
];
const clone = (x) => JSON.parse(JSON.stringify(x));
const base = w.baseline(initial);
const roundtrip = w.decodeWorkbook(w.encodeWorkbook(school, initial), school, initial);
assert.equal(JSON.stringify(w.baseline(roundtrip)), JSON.stringify(base));
assert.throws(
  () => w.decodeWorkbook(w.encodeWorkbook(school, initial), "wrong", initial),
  /original/,
);
const edited = clone(roundtrip);
edited.students[0].name = "New Name";
assert.equal(w.planSync(initial, edited, base).changes.length, 1);
assert.equal(w.planSync(edited, edited, base).changes.length, 0, "retry");
const app = clone(initial);
app.students[0].name = "App edit";
assert.equal(w.planSync(app, edited, base).conflicts.length, 1);
assert.equal(w.planSync(app, roundtrip, base).changes.length, 0, "app only");
const deleted = clone(initial);
deleted.students = [];
assert.equal(
  w.planSync(initial, deleted, base).changes.length,
  0,
  "sheet deletion does not delete app",
);
assert.equal(w.planSync(deleted, edited, base).conflicts.length, 1, "deleted app record");
const bad = clone(roundtrip);
bad.students[0].school_id = "other";
assert.equal(w.planSync(initial, bad, base).conflicts.length, 1);
bad.students[0].id = "unknown";
assert.equal(w.planSync(initial, bad, base).conflicts.length, 1);
const wb = XLSX.read(w.encodeWorkbook(school, initial), { type: "array" });
wb.Sheets.Students.A3 = { t: "s", v: "evil", f: "1+1" };
wb.Sheets.Students["!ref"] = "A1:H3";
assert.throws(
  () =>
    w.decodeWorkbook(
      new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" })),
      school,
      initial,
    ),
  /formulas/,
);

// Mocked transport: same target folder, no permissions grants, conditional write and recovery.
const server = load("src/lib/school-drive.server.ts", { "./school-workbook": w });
const events = [];
const db = {
  rpc: async (name, args) => {
    events.push(name);
    if (name === "school_drive_acquire")
      return { data: { file_id: null, baseline: {} }, error: null };
    if (name === "school_drive_snapshot") return { data: initial, error: null };
    return { data: 0, error: null };
  },
};
const transport = async (path, init = {}) => {
  events.push(path);
  assert(!path.includes("/permissions"));
  if (path.startsWith("/drive/v3/files?")) return Response.json({ files: [] });
  assert.equal(init.method, "POST");
  const body = await init.body.text();
  assert(body.includes(server.SCHOOL_DRIVE_FOLDER));
  assert(!body.includes("anyone"));
  return Response.json({ id: "file1" });
};
assert.equal((await server.runSchoolSync(db, school, transport)).fileId, "file1");
assert(events.includes("school_drive_finish"));
let patches = 0,
  applied = 0,
  finished = 0;
const db2 = {
  rpc: async (name, args) => {
    if (name === "school_drive_acquire")
      return { data: { file_id: "file1", baseline: base }, error: null };
    if (name === "school_drive_snapshot") return { data: initial, error: null };
    if (name === "school_drive_apply") applied++;
    if (name === "school_drive_finish") finished++;
    return { data: 0, error: null };
  },
};
const meta = {
  id: "file1",
  mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  parents: [server.SCHOOL_DRIVE_FOLDER],
  appProperties: { schoolriseSchoolId: school },
};
const updateTransport = async (path, init = {}) => {
  if (init.method === "PATCH") {
    patches++;
    assert.equal(init.headers["If-Match"], '"v1"');
    throw new Error("Workbook changed in Drive");
  }
  if (path.includes("alt=media")) return new Response(w.encodeWorkbook(school, initial));
  return Response.json(meta, { headers: { etag: '"v1"' } });
};
await assert.rejects(() => server.runSchoolSync(db2, school, updateTransport), /changed in Drive/);
assert.equal(patches, 1);
assert.equal(finished, 0);
applied = 0;
await assert.rejects(
  () => server.runSchoolSync(db2, school, async () => Response.json(meta)),
  /strong ETag/,
);
assert.equal(applied, 0);
console.log(
  "PASS: workbook roundtrip, typed values, IDs, formulas, app/Drive conflicts, deletions, retries, exact folder, no permission grants, conditional writes, missing ETag fail-closed.",
);
