import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const compile = async (path) =>
  ts.transpileModule(await readFile(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
const url = (code) => `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
const compatUrl = url(await compile("src/lib/dashboard-compat.ts"));
const { aggregateDashboardAttendance, missingDashboardFeature, withDashboardFallback } =
  await import(compatUrl);
const pagesUrl = url(await compile("src/lib/fetch-all.ts"));
const { loadDashboardAttendance } = await import(
  url(
    (await compile("src/lib/dashboard-data.server.ts"))
      .replace('"./dashboard-compat"', JSON.stringify(compatUrl))
      .replace('"./fetch-all"', JSON.stringify(pagesUrl)),
  )
);
const absent = {
  code: "PGRST202",
  message: "Could not find the function public.reap_dashboard_attendance in the schema cache",
};
assert.equal(
  missingDashboardFeature(absent, "reap_dashboard_attendance", ["PGRST202", "42883"]),
  true,
);
assert.equal(
  missingDashboardFeature(
    { code: "42501", message: "permission denied reap_dashboard_attendance" },
    "reap_dashboard_attendance",
    ["PGRST202"],
  ),
  false,
);
assert.equal(
  missingDashboardFeature(
    { code: "PGRST202", message: "other_function" },
    "reap_dashboard_attendance",
    ["PGRST202"],
  ),
  false,
);
let fallbackCalls = 0;
await assert.rejects(
  withDashboardFallback(
    async () => {
      throw new Error("network");
    },
    async () => {
      fallbackCalls++;
      return [];
    },
    (e) => missingDashboardFeature(e, "activity_id", ["42703"]),
  ),
  /network/,
);
assert.equal(fallbackCalls, 0);
assert.deepEqual(
  await withDashboardFallback(
    async () => {
      throw { code: "42703", message: "column sessions.activity_id does not exist" };
    },
    async () => ["legacy session"],
    (e) => missingDashboardFeature(e, "activity_id", ["42703", "PGRST204"]),
  ),
  ["legacy session"],
);
const roster = Array.from({ length: 1501 }, (_, i) => ({
  student_id: `student${i}`,
  school_id: "allowed",
  class: "5",
  division: "A",
  academic_year: "2026",
}));
roster.push(
  {
    student_id: "hidden",
    school_id: "forbidden",
    class: "5",
    division: "A",
    academic_year: "2026",
  },
  { student_id: "old", school_id: "allowed", class: "5", division: "A", academic_year: "2025" },
);
const mark = (id, student, status, date = "2026-10-05", time = "2026-10-05T10:00:00Z") => ({
  id,
  student_id: student,
  school_id: "allowed",
  status,
  date,
  created_at: time,
  academic_year: "2026",
});
const marks = [
  mark("1", "student0", "absent"),
  mark("2", "student0", "present", undefined, "2026-10-05T11:00:00Z"),
  mark("3", "student1", "absent"),
  mark("4", "student2", "present", "2026-09-05"),
  { ...mark("5", "old", "present"), academic_year: "2025" },
  { ...mark("6", "hidden", "present"), school_id: "forbidden" },
];
const reads = [];
class Query {
  constructor(table) {
    this.table = table;
    this.rows = table === "student_enrollments" ? roster : marks;
    reads.push(table);
  }
  select() {
    return this;
  }
  order() {
    return this;
  }
  eq(k, v) {
    this.rows = this.rows.filter((r) => r[k] === v);
    return this;
  }
  in(k, v) {
    this.rows = this.rows.filter((r) => v.includes(r[k]));
    return this;
  }
  gte(k, v) {
    this.rows = this.rows.filter((r) => r[k] >= v);
    return this;
  }
  lte(k, v) {
    this.rows = this.rows.filter((r) => r[k] <= v);
    return this;
  }
  range(a, b) {
    return Promise.resolve({ data: this.rows.slice(a, b + 1), error: null });
  }
}
const db = { rpc: async () => ({ data: null, error: absent }), from: (table) => new Query(table) };
const scope = {
  year: "2026",
  schoolIds: ["allowed"],
  start: "2026-10-05",
  end: "2026-10-11",
  class: "5",
  division: "A",
  includeAttendance: true,
};
const result = await loadDashboardAttendance(db, scope);
assert.equal(result.cohorts[0].students, 1501);
assert.deepEqual(result.attendance, [
  {
    school_id: "allowed",
    class: "5",
    division: "A",
    date: "2026-10-05",
    present: 1,
    expected: 1501,
    recorded: 2,
  },
]);
assert.deepEqual(await loadDashboardAttendance(db, { ...scope, schoolIds: [] }), {
  cohorts: [],
  attendance: [],
});
reads.length = 0;
assert.equal(
  (await loadDashboardAttendance(db, { ...scope, includeAttendance: false })).attendance.length,
  0,
);
assert(!reads.includes("attendance"));
await assert.rejects(
  loadDashboardAttendance(
    { ...db, rpc: async () => ({ error: { code: "42501", message: "Denied" } }) },
    scope,
  ),
  (e) => e.code === "42501",
);
reads.length = 0;
const primary = { cohorts: [], attendance: [] };
assert.deepEqual(
  await loadDashboardAttendance(
    { ...db, rpc: async () => ({ data: primary, error: null }) },
    scope,
  ),
  primary,
);
assert.equal(reads.length, 0);
// Equal timestamps use the same deterministic ID tie-break as SQL; invalid and wrong-school marks excluded.
const small = [{ student_id: "s", school_id: "allowed", class: "5", division: null }];
assert.equal(
  aggregateDashboardAttendance(small, [
    mark("1", "s", "absent"),
    mark("2", "s", "present"),
    mark("3", "s", "unknown"),
  ]).attendance[0].present,
  1,
);
console.log(
  "Dashboard compatibility tests passed: missing RPC/column, real failures preserved, paginated 1,501-student roster, school/year/week scope, duplicate marks and module permissions.",
);
