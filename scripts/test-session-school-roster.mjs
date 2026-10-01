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
const A = "11111111-1111-4111-8111-111111111111",
  B = "22222222-2222-4222-8222-222222222222";
const id = "33333333-3333-4333-8333-333333333333",
  other = "44444444-4444-4444-8444-444444444444";
const access = load("src/lib/access-control.ts");
let profile = {
  role: "trainer",
  username: "teacher",
  schoolIds: [A],
  allSchools: false,
  permissions: { session_status: ["view", "add", "edit", "delete", "status"] },
};
const tables = {
  schools: [
    { id: A, code: "A", name: "School A" },
    { id: B, code: "B", name: "School B" },
  ],
  students: [
    ...Array.from({ length: 1002 }, (_, i) => ({
      id: String(i).padStart(5, "0"),
      school_id: A,
      class: "5",
      division: "A",
    })),
    { id: "99999", school_id: A, class: "8", division: "Batch 1" },
    { id: "99998", school_id: B, class: "9", division: "B" },
  ],
  sessions: [
    { id, school_id: A, unit: "Unit-1", class: "5", academic_year: "2026-27", session_name: "First" },
    { id: other, school_id: B, unit: "Unit-1", class: "5", academic_year: "2026-27" },
  ],
  session_division_status: [],
};
let writes = 0;
const db = {
  from(table) {
    let filters = [],
      from = 0,
      to = Infinity,
      limit = Infinity,
      mutation,
      payload;
    const q = {
      select() {
        return q;
      },
      order() {
        return q;
      },
      eq(key, value) {
        filters.push((r) => r[key] === value);
        return q;
      },
      in(key, values) {
        filters.push((r) => values.includes(r[key]));
        return q;
      },
      or() {
        filters.push((r) => r.division == null || r.division === "");
        return q;
      },
      range(a, b) {
        from = a;
        to = b;
        return q;
      },
      limit(n) {
        limit = n;
        return q;
      },
      insert(rows) {
        mutation = "insert";
        payload = rows;
        return q;
      },
      update(patch) {
        mutation = "update";
        payload = patch;
        return q;
      },
      delete() {
        mutation = "delete";
        return q;
      },
      upsert(rows) {
        mutation = "upsert";
        payload = rows;
        return q;
      },
      then(resolve, reject) {
        try {
          let rows = tables[table].filter((r) => filters.every((f) => f(r)));
          if (mutation) {
            writes++;
            if (mutation === "upsert")
              for (const row of payload) {
                const target = tables[table].find(
                  (r) => r.session_id === row.session_id && r.division === row.division,
                );
                if (target) Object.assign(target, row);
                else tables[table].push(row);
              }
          }
          return Promise.resolve({
            data: rows.slice(from, Math.min(to + 1, from + limit)),
            error: null,
            count: rows.length,
          }).then(resolve, reject);
        } catch (error) {
          return Promise.reject(error).then(resolve, reject);
        }
      },
    };
    return q;
  },
};
const api = load("src/lib/sessions.functions.ts", {
  "@tanstack/react-start": {
    createServerFn: () => ({
      inputValidator(validate) {
        return {
          handler:
            (fn) =>
            ({ data }) =>
              fn({ data: validate(data) }),
        };
      },
    }),
  },
  "./academic-db.server": { academicDb: async () => db },
  "./app-access.server": {
    adminDb: async () => db,
    requirePermission: async (_, module, action) => {
      if (!access.can(profile, module, action)) throw new Error("Access denied");
      return profile;
    },
  },
  "./access-control": access,
  "./fetch-all": load("src/lib/fetch-all.ts"),
});
const call = (name, data = {}) => api[name]({ data: { token: "test", ...data } });
assert.equal((await call("listSessionSchools")).length, 1);
assert.deepEqual(JSON.parse(JSON.stringify(await call("listSessionRoster", { schoolId: A }))), [
  { class: "5", division: "A" },
  { class: "8", division: "Batch 1" },
]);
for (const name of ["listSessionRoster", "sessionUnitCounts", "listSessions"])
  await assert.rejects(call(name, { schoolId: B }), /School access denied/);
assert.equal((await call("listSessions")).length, 1);
await assert.rejects(
  call("insertSessions", {
    rows: [{ school_id: B, unit: "Unit-1", class: "5", session_name: "Other" }],
  }),
  /School access denied/,
);
await assert.rejects(
  call("updateSessions", { ids: [other], patch: { topic: "Changed" } }),
  /School access denied/,
);
await assert.rejects(call("deleteSessions", { ids: [other] }), /School access denied/);
const target = {
  schoolId: A,
  unit: "Unit-1",
  class: "5",
  division: "A",
  ids: [id],
  status: "complete",
};
await assert.rejects(
  call("setDivisionStatus", { ...target, ids: [other] }),
  /School access denied/,
);
await assert.rejects(
  call("setDivisionStatus", { ...target, unit: "Unit-2" }),
  /school, unit and class/,
);
await assert.rejects(
  call("setDivisionStatus", { ...target, division: "B" }),
  /no longer has students/,
);
assert.equal(writes, 0);
await call("setDivisionStatus", target);
assert.equal((await call("listDivisionSessions", target))[0].status, "complete");
tables.students.push({ school_id: A, class: "5", division: "B" });
assert.equal((await call("listSessionRoster", { schoolId: A })).length, 3);
assert.equal(
  (await call("listDivisionSessions", { ...target, division: "B" }))[0].status,
  "pending",
);
assert.equal((await call("listDivisionSessions", { ...target, unit: "Unit-2" })).length, 0);
profile = { ...profile, schoolIds: [] };
assert.equal((await call("listSessionSchools")).length, 0);
assert.equal((await call("listSessions")).length, 0);
profile = { ...profile, allSchools: true };
assert.equal((await call("listSessionSchools")).length, 2);
profile = { ...profile, allSchools: false, role: "admin" };
assert.equal((await call("listSessionSchools")).length, 2);
profile = {
  ...profile,
  role: "trainer",
  schoolIds: [A],
  permissions: { session_status: ["view"] },
};
await assert.rejects(call("setDivisionStatus", target), /Access denied/);
console.log(
  "PASS: paged school roster, custom divisions, dynamic additions, scoped schools/reads/writes, full access, no assignments, view-only denial, and division/unit status isolation.",
);
