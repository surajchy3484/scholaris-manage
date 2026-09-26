import assert from "node:assert/strict";
import fs from "node:fs/promises";
import ts from "typescript";
import { pathToFileURL } from "node:url";
const packageRoot = process.env.PGLITE_ROOT;
if (!packageRoot) throw new Error("Set PGLITE_ROOT to an external @electric-sql/pglite directory");
const { PGlite } = await import(pathToFileURL(`${packageRoot}/dist/index.js`));
const { pg_trgm } = await import(pathToFileURL(`${packageRoot}/dist/contrib/pg_trgm.js`));
const db = new PGlite({ extensions: { pg_trgm } });
await db.exec(
  "CREATE SCHEMA extensions; CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;",
);
// Derive fixture columns from the checked-in database types to catch schema mismatches.
const source = ts.createSourceFile(
  "types.ts",
  await fs.readFile("src/integrations/supabase/types.ts", "utf8"),
  ts.ScriptTarget.Latest,
  true,
);
const database = source.statements.find(
  (s) => ts.isTypeAliasDeclaration(s) && s.name.text === "Database",
).type;
const member = (t, key) =>
  t.members.find((m) => m.name.getText(source) === key || m.name.getText(source) === `"${key}"`)
    .type;
const tables = member(member(database, "public"), "Tables");
for (const name of [
  "schools",
  "students",
  "attendance",
  "assessments",
  "questions",
  "clicker_records",
  "exam_scores",
  "sessions",
  "school_divisions",
  "session_division_status",
]) {
  const row = member(member(tables, name), "Row");
  const fields = row.members.map((m) => {
    const key = m.name.getText(source),
      type = m.type.getText(source);
    const sqlType =
      key === "id" || key === "school_id" || key === "student_id"
        ? "uuid"
        : type.includes("number")
          ? "numeric"
          : type.includes("boolean")
            ? "boolean"
            : type.includes("Json")
              ? "jsonb"
              : "text";
    return `"${key}" ${sqlType}${key === "id" ? " PRIMARY KEY DEFAULT gen_random_uuid()" : ""}`;
  });
  await db.exec(`CREATE TABLE public.${name} (${fields.join(",")});`);
}

await db.exec(
  "CREATE FUNCTION tg_set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at=now(); RETURN NEW; END $$",
);
await db.exec(
  await fs.readFile("supabase/migrations/20260917120000_add_assessment_results.sql", "utf8"),
);
await db.exec(
  await fs.readFile("supabase/migrations/20260926120000_school_drive_sync.sql", "utf8"),
);
const school = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222",
  student = "33333333-3333-4333-8333-333333333333",
  lease = "44444444-4444-4444-8444-444444444444";
await db.query("INSERT INTO schools(id,name) VALUES($1,'A'),($2,'B')", [school, other]);
await db.query("INSERT INTO students(id,school_id,name,roll_number) VALUES($1,$2,'Asha','001')", [
  student,
  school,
]);
const snapshot = async (s = school) =>
  (await db.query("SELECT school_drive_snapshot($1) r", [s])).rows[0].r;
let row = (await snapshot()).students[0];
assert.equal((await snapshot(other)).students.length, 0);
await db.query("SELECT school_drive_acquire($1,$2)", [school, lease]);
await assert.rejects(
  () => db.query("SELECT school_drive_acquire($1,$2)", [school, lease]),
  /already running/,
);
const apply = async (changes, s = school) =>
  db.query("SELECT school_drive_apply($1,$2,$3)", [s, lease, JSON.stringify(changes)]);
const change = { table: "students", id: student, expected: row, values: { name: "Changed" } };
await apply([change]);
assert.equal((await snapshot()).students[0].name, "Changed");
await assert.rejects(() => apply([change]), /changed during sync/);
row = (await snapshot()).students[0];
await assert.rejects(
  () => apply([{ ...change, expected: row, values: { school_id: other } }]),
  /Read-only/,
);
await assert.rejects(() => apply([{ ...change, expected: row, values: { name: "" } }]), /required/);
await assert.rejects(
  () =>
    apply([
      { ...change, expected: row, values: { name: "Atomic" } },
      { ...change, id: other },
    ]),
  /changed during/,
);
assert.equal((await snapshot()).students[0].name, "Changed", "whole batch rolls back");
await db.query("SELECT school_drive_acquire($1,$2)", [other, lease]);
await assert.rejects(() => apply([{ ...change, expected: row }], other), /changed during/);
await db.exec("SET ROLE anon");
await assert.rejects(() => snapshot());
await assert.rejects(() => apply([]));
await db.exec("RESET ROLE");
await db.query("SELECT school_drive_finish($1,$2,$3,$4)", [school, lease, "file1", "{}"]);
await assert.rejects(() => apply([]), /lease expired/);
await db.close();
console.log(
  "PASS: migration, scoped snapshot, concurrent leases, optimistic updates, readonly fields, validation, atomic batch rollback, cross-school denial, anon denial, finalization.",
);
