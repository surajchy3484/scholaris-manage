// Run with PGLITE_MODULE pointing to an installed @electric-sql/pglite dist/index.js.
import assert from "node:assert/strict";
import ts from "typescript";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
const { PGlite } = await import(
  process.env.PGLITE_MODULE ? pathToFileURL(process.env.PGLITE_MODULE).href : "@electric-sql/pglite"
);
const db = new PGlite();
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE TABLE sessions(id uuid primary key,school_id uuid,class text,academic_year text,unit text);
CREATE TABLE student_enrollments(student_id uuid,school_id uuid,class text,division text,academic_year text);
CREATE TABLE attendance(id uuid,student_id uuid,school_id uuid,date date,status text,academic_year text,created_at timestamptz);`);
await db.exec(await readFile("supabase/migrations/20261010200000_reap_dashboard.sql", "utf8"));
const uuid = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
for (const [id, school, year, klass, division] of [
  [1, 101, "2026", "5", "A"],
  [2, 101, "2026", "5", "A"],
  [3, 101, "2026", "5", "A"],
  [4, 101, "2026", "6", "B"],
  [5, 102, "2026", "5", "A"],
  [1, 101, "2025", "5", "A"],
])
  await db.query("INSERT INTO student_enrollments VALUES($1,$2,$3,$4,$5)", [
    uuid(id),
    uuid(school),
    klass,
    division,
    year,
  ]);
const marks = [
  [1, 1, 101, "2026-10-05", "absent", "2026", "2026-10-05T09:00Z"],
  [2, 1, 101, "2026-10-05", "present", "2026", "2026-10-05T10:00Z"],
  [3, 2, 101, "2026-10-05", "absent", "2026", "2026-10-05T10:00Z"],
  [4, 1, 101, "2026-10-06", "present", "2026", "2026-10-06T10:00Z"],
  [5, 5, 102, "2026-10-05", "present", "2026", "2026-10-05T10:00Z"],
  [6, 1, 101, "2025-10-05", "present", "2025", "2025-10-05T10:00Z"],
];
for (const [id, student, school, ...v] of marks)
  await db.query("INSERT INTO attendance VALUES($1,$2,$3,$4,$5,$6,$7)", [
    uuid(id),
    uuid(student),
    uuid(school),
    ...v,
  ]);
async function get(
  schools = [uuid(101)],
  year = "2026",
  klass = null,
  division = null,
  start = "2026-10-05",
  end = "2026-10-11",
) {
  return (
    await db.query("SELECT reap_dashboard_attendance($1,$2,$3,$4,$5,$6) result", [
      year,
      schools,
      start,
      end,
      klass,
      division,
    ])
  ).rows[0].result;
}
let r = await get();
const compatCode = ts.transpileModule(await readFile("src/lib/dashboard-compat.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { aggregateDashboardAttendance } = await import(
  `data:text/javascript;base64,${Buffer.from(compatCode).toString("base64")}`
);
const sameRoster = (
  await db.query("SELECT * FROM student_enrollments WHERE academic_year='2026' AND school_id=$1", [
    uuid(101),
  ])
).rows;
const sameMarks = (
  await db.query(
    "SELECT id,student_id,school_id,date::text,status,created_at::text FROM attendance WHERE academic_year='2026' AND school_id=$1 AND date BETWEEN '2026-10-05' AND '2026-10-11'",
    [uuid(101)],
  )
).rows;
const compatibility = aggregateDashboardAttendance(sameRoster, sameMarks);
assert.deepEqual(compatibility.attendance, r.attendance);
assert.deepEqual(
  compatibility.cohorts.sort((a, b) => a.class.localeCompare(b.class)),
  r.cohorts.sort((a, b) => a.class.localeCompare(b.class)),
);

assert.equal(r.cohorts.length, 2);
assert.equal(r.attendance.length, 2);
assert.equal(r.attendance[0].present, 1);
assert.equal(r.attendance[0].expected, 3);
assert.equal(r.attendance[0].recorded, 2);
assert.equal(
  r.attendance.reduce((n, x) => n + x.expected, 0),
  6,
);
assert.equal(
  r.attendance.reduce((n, x) => n + x.present, 0),
  2,
);
assert.equal((await get([])).attendance.length, 0);
assert.equal((await get([])).cohorts.length, 0);
assert.equal((await get([uuid(102)])).attendance[0].expected, 1);
assert.equal((await get(undefined, "2026", "6", "B")).attendance.length, 0);
assert.equal(
  (await get(undefined, "2025", null, null, "2025-10-05", "2025-10-11")).attendance[0].present,
  1,
);
assert.equal(
  (await get(undefined, "2026", null, null, "2026-11-01", "2026-11-07")).attendance.length,
  0,
);
await db.exec("SET ROLE anon");
await assert.rejects(get(), /permission denied/);
await db.exec("RESET ROLE; SET ROLE authenticated");
await assert.rejects(get(), /permission denied/);
await db.exec("RESET ROLE");
// Empty mapping is deliberate; no legacy activity identity is invented by migration.
assert.equal((await db.query("SELECT count(*) FROM session_activities")).rows[0].count, 0);
console.log(
  "SQL migration and aggregation tests passed: missing/unmarked data, deduplication, weighted totals, school/class/division/year/date isolation, denied public RPC access.",
);
await db.close();
