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
  const added = [
    "exam_type",
    "total_questions",
    "attempted_questions",
    "correct_answers",
    "wrong_answers",
    "unattempted_questions",
    "question_snapshot",
    "evaluated_at",
  ];
  const fields = row.members
    .filter((m) => name !== "clicker_records" || !added.includes(m.name.getText(source)))
    .map((m) => {
      const key = m.name.getText(source),
        type = m.type.getText(source);
      const sqlType = [
        "id",
        "school_id",
        "student_id",
        "session_id",
        "class_plan_id",
        "question_set_version_id",
        "clicker_id",
      ].includes(key)
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
  "CREATE UNIQUE INDEX score_key ON exam_scores(student_id,exam_type,academic_year,coalesce(subject,''))",
);
const school = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222",
  student = "33333333-3333-4333-8333-333333333333";
await db.query("INSERT INTO schools(id,name) VALUES($1,'A'),($2,'B')", [school, other]);
await db.query(
  "INSERT INTO students(id,school_id,name,class,division) VALUES($1,$2,'Asha','8','A')",
  [student, school],
);
for (const [aid, exam, cls, sch] of [
  ["A", "ICA", "8", school],
  ["B", "ICA", "8", other],
  ["M", "MCA", "8", school],
  ["F", "FCA", "8", school],
  ["C7", "ICA", "7", school],
  ["D7", "ICA", "7", other],
])
  await db.query(
    "INSERT INTO assessments(assessment_id,exam_type,class,school_id,academic_year) VALUES($1,$2,$3,$4,'2026')",
    [aid, exam, cls, sch],
  );
for (const [aid, answer] of [
  ["A", "A"],
  ["B", "A"],
  ["C7", "A"],
  ["D7", "B"],
])
  await db.query(
    "INSERT INTO questions(assessment_id,question_no,correct_answer,parameter,marks) VALUES($1,1,$2,'Conceptual',1)",
    [aid, answer],
  );
const orphanId = "44444444-4444-4444-8444-444444444444";
await db.query(
  "INSERT INTO clicker_records(id,keypad_id,student_name) VALUES($1,'ORPHAN','Legacy')",
  [orphanId],
);
await db.exec(
  await fs.readFile("supabase/migrations/20260926150000_universal_question_bank.sql", "utf8"),
);
await db.exec(
  await fs.readFile("supabase/migrations/20260927123000_clicker_delete_results.sql", "utf8"),
);

for (const migration of [
  "20260925090000_performance_paging.sql",
  "20260925133000_student_details_list.sql",
  "20261001000000_session_assignment_plans.sql",
  "20261001120000_academic_years.sql",
]) {
  try {
    await db.exec(await fs.readFile(`supabase/migrations/${migration}`, "utf8"));
    console.log("Applied", migration);
  } catch (e) {
    console.error(migration, e.message);
    process.exit(1);
  }
}

const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
const selectYear = (year) =>
  db.query("SELECT set_config('request.headers',$1,false)", [
    JSON.stringify({ "x-academic-year": year }),
  ]);
assert.equal((await one("SELECT count(*)::int n FROM student_enrollments")).n, 1);
assert.equal(
  (await one("SELECT academic_year FROM assessments WHERE assessment_id='A'")).academic_year,
  "2026",
);
assert.equal((await one("SELECT class FROM academic_roster")).class, "8");
await db.exec("INSERT INTO academic_years(id,name) VALUES('2027-28','2027–28')");
const enrollment = await one("SELECT * FROM student_enrollments WHERE student_id=$1", [student]);
const promote = (rows, scope = null) =>
  db.query("SELECT academic_promote('2026-27','2027-28',$1,$2)", [JSON.stringify(rows), scope]);
const next = {
  source_id: enrollment.id,
  school_id: other,
  class: "9",
  division: "B",
  roll_number: "12",
  status: "Active",
};
await assert.rejects(() => promote([next], [school]), /School access denied/);
await assert.rejects(
  () => promote([next, { ...next, source_id: "99999999-9999-4999-8999-999999999999" }]),
  /Source enrollment not found/,
);
assert.equal(
  (await one("SELECT count(*)::int n FROM student_enrollments")).n,
  1,
  "failed bulk promotion rolls back earlier rows",
);
await promote([next]);
await assert.rejects(() => promote([next]), /duplicate key/);
assert.equal(
  (await one("SELECT count(*)::int n FROM students")).n,
  1,
  "promotion retains identity",
);
assert.equal(
  (await one("SELECT class FROM student_enrollments WHERE id=$1", [enrollment.id])).class,
  "8",
);
await selectYear("2027-28");
assert.deepEqual(await one("SELECT school_id,class,division FROM academic_roster"), {
  school_id: other,
  class: "9",
  division: "B",
});
assert.equal((await one("SELECT student_details_page($1) r", [other])).r.total, 1);
assert.equal((await one("SELECT student_details_page($1) r", [school])).r.total, 0);
await db.query("SELECT academic_set_current('2027-28')");
assert.equal((await one("SELECT class FROM students WHERE id=$1", [student])).class, "9");
assert.equal((await one("SELECT count(*)::int n FROM academic_years WHERE is_current")).n, 1);
await selectYear("2026-27");
await assert.rejects(
  () => db.query("UPDATE students SET class='10' WHERE id=$1", [student]),
  /current academic year/,
);
await assert.rejects(
  () => db.query("DELETE FROM students WHERE id=$1", [student]),
  /history is preserved/,
);
await db.query("SELECT academic_set_current('2026-27')");
assert.equal((await one("SELECT class FROM students WHERE id=$1", [student])).class, "8");
await db.query(
  "INSERT INTO assessments(assessment_id,exam_type,class,school_id,academic_year,status) VALUES('Y26','ICA','8',$1,'2026-27','Active')",
  [school],
);
const writer = (rows) =>
  db.query("SELECT universal_clicker_write('insert',$1,'{}','{}',NULL)", [JSON.stringify(rows)]);
await writer([
  {
    assessment_id: "Y26",
    exam_type: "ICA",
    class: "8",
    school_id: school,
    student_id: student,
    keypad_id: "K1",
    student_name: "Asha",
    section: "A",
    answers: { S1: "A" },
  },
]);
assert.equal(
  (await one("SELECT correct_answers FROM clicker_records WHERE assessment_id='Y26'"))
    .correct_answers,
  1,
);
await db.exec(
  "UPDATE question_bank SET correct_answer='C' WHERE exam_type='ICA' AND class='8' AND question_no=1",
);
await writer([
  {
    assessment_id: "Y26",
    exam_type: "ICA",
    class: "8",
    school_id: school,
    keypad_id: "K2",
    student_name: "Other",
    section: "A",
    answers: { S1: "A" },
  },
]);
assert.equal(
  (
    await one(
      "SELECT correct_answers FROM clicker_records WHERE assessment_id='Y26' AND keypad_id='K2'",
    )
  ).correct_answers,
  1,
  "assessment keeps pinned key",
);
await db.exec("UPDATE assessments SET status='Completed' WHERE assessment_id='Y26'");
await assert.rejects(
  () => db.exec("UPDATE assessments SET class='9' WHERE assessment_id='Y26'"),
  /context is preserved/,
);
const version = await one("SELECT academic_capture_question_set('ICA','8','New key','2026-27') id");
await db.query(
  "INSERT INTO assessments(assessment_id,exam_type,class,school_id,academic_year,question_set_version_id,status) VALUES('VERSION','ICA','8',$1,'2026-27',$2,'Active')",
  [school, version.id],
);
await writer([
  {
    assessment_id: "VERSION",
    exam_type: "ICA",
    class: "8",
    school_id: school,
    keypad_id: "V",
    student_name: "Version",
    answers: { S1: "C" },
  },
]);
assert.equal(
  (await one("SELECT correct_answers FROM clicker_records WHERE assessment_id='VERSION'"))
    .correct_answers,
  1,
);
await db.query(
  "INSERT INTO sessions(id,school_id,unit,class,session_name,topic) VALUES('77777777-7777-4777-8777-777777777777',$1,'Unit-1','8','Intro','STEM')",
  [school],
);
await db.query(
  "INSERT INTO session_division_status(session_id,school_id,unit,class,division,status) VALUES('77777777-7777-4777-8777-777777777777',$1,'Unit-1','8','A','complete')",
  [school],
);
const history = (await one("SELECT academic_student_history($1,NULL) r", [student])).r;
assert.equal(history.enrollments.length, 2);
assert.equal(
  history.sessions.find((r) => r.academic_year === "2026-27" && r.unit === "Unit-1").complete,
  1,
);
assert.equal(history.results[0].question_snapshot[0].correct_answer, "A");
assert.equal(
  (await one("SELECT academic_student_history($1,$2) r", [student, [other]])).r.results.length,
  0,
  "school access filters historical results",
);
await selectYear("2027-28");
assert.equal(
  (await one("SELECT performance_master_page(p_table=>'clicker_records',p_class=>'') r")).r.total,
  0,
  "paged exams never mix years",
);
await assert.rejects(
  () =>
    writer([
      {
        assessment_id: "Y26",
        exam_type: "ICA",
        class: "8",
        school_id: school,
        keypad_id: "BAD",
        student_name: "bad",
        answers: { S1: "A" },
      },
    ]),
  /selected academic year/,
);
await assert.rejects(
  () => db.exec("SET ROLE anon; SELECT * FROM student_enrollments"),
  /permission denied/,
);
await db.exec("RESET ROLE");
await selectYear("2026-27");
await db.exec(await fs.readFile("supabase/migrations/20261001120000_academic_years.sql", "utf8"));
assert.equal(
  (await one("SELECT count(*)::int n FROM student_enrollments")).n,
  2,
  "migration rerun preserves enrollments",
);
console.log(
  "PASS: migration, promotion, duplicate rejection, permanent identity, transfer, year filters, school scope, original key snapshots, named versions, session history and role denial",
);
if (process.env.TEST_CURRENT_YEAR_BASELINE === "1") {
  const baseline = await fs.readFile(
    "supabase/migrations/20261006110000_current_year_baseline.sql",
    "utf8",
  );
  const counts = await one(
    "SELECT (SELECT count(*)::int FROM students) students,(SELECT count(*)::int FROM clicker_records) clickers,(SELECT count(*)::int FROM assessments) assessments",
  );
  const before = (
    await db.query(
      "SELECT id,score,correct_rate,answers,question_snapshot FROM clicker_records ORDER BY id",
    )
  ).rows;
  const triggersBefore = (
    await db.query(
      "SELECT tgrelid,tgname,tgenabled FROM pg_trigger WHERE NOT tgisinternal ORDER BY tgrelid,tgname",
    )
  ).rows;
  await db.query(
    "INSERT INTO exam_scores(student_id,school_id,exam_type,score,academic_year) VALUES($1,$2,'MANUAL',72,'2026-27')",
    [student, school],
  );
  await selectYear("2026");
  await db.query(
    "INSERT INTO exam_scores(student_id,school_id,exam_type,score,academic_year) VALUES($1,$2,'MANUAL',81,'2026')",
    [student, school],
  );
  await assert.rejects(() => db.exec(baseline), /conflicting exam scores/);
  await db.exec("ROLLBACK");
  assert.equal(
    (await one("SELECT count(*)::int n FROM exam_scores WHERE exam_type='MANUAL'")).n,
    2,
    "conflict preserves both scores",
  );
  await db.exec("DELETE FROM exam_scores WHERE exam_type='MANUAL' AND academic_year='2026'");
  await selectYear("2026-27");
  await db.exec(baseline);
  assert.deepEqual(
    await one(
      "SELECT (SELECT count(*)::int FROM students) students,(SELECT count(*)::int FROM clicker_records) clickers,(SELECT count(*)::int FROM assessments) assessments",
    ),
    counts,
  );
  assert.deepEqual(
    (
      await db.query(
        "SELECT id,score,correct_rate,answers,question_snapshot FROM clicker_records ORDER BY id",
      )
    ).rows,
    before,
    "no score/key recomputation",
  );
  assert.deepEqual(
    (
      await db.query(
        "SELECT tgrelid,tgname,tgenabled FROM pg_trigger WHERE NOT tgisinternal ORDER BY tgrelid,tgname",
      )
    ).rows,
    triggersBefore,
    "all trigger states restored",
  );
  assert.equal(
    (await one("SELECT count(*)::int n FROM academic_years WHERE NOT is_archived")).n,
    1,
  );
  for (const table of [
    "student_enrollments",
    "assessments",
    "clicker_records",
    "assessment_results",
    "exam_scores",
    "sessions",
    "session_division_status",
    "attendance",
  ]) {
    assert.equal(
      (
        await one(
          `SELECT count(*)::int n FROM ${table} WHERE academic_year IS DISTINCT FROM '2026-27'`,
        )
      ).n,
      0,
      table,
    );
  }
  assert.equal(
    (await one("SELECT count(*)::int n FROM student_enrollments")).n,
    1,
    "one baseline enrollment per identity",
  );
  assert.equal(
    (
      await one(
        "SELECT count(*)::int n FROM academic_year_reset_backup WHERE source_table='student_enrollments'",
      )
    ).n,
    2,
    "original enrollment associations backed up",
  );
  await assert.rejects(
    () => db.exec("SET ROLE anon; SELECT * FROM academic_year_reset_backup"),
    /permission denied/,
  );
  await db.exec("RESET ROLE");
  await db.exec("INSERT INTO academic_years(id,name) VALUES('2028-29','2028–29')");
  const current = await one("SELECT id FROM student_enrollments WHERE student_id=$1", [student]);
  await db.query("SELECT academic_promote('2026-27','2028-29',$1,NULL)", [
    JSON.stringify([{ ...next, source_id: current.id }]),
  ]);
  await db.query("SELECT academic_set_current('2028-29')");
  await selectYear("2028-29");
  await db.query(
    "INSERT INTO exam_scores(student_id,school_id,exam_type,score) VALUES($1,$2,'MANUAL',88)",
    [student, other],
  );
  await db.exec(baseline);
  assert.equal(
    Number((await one("SELECT score FROM exam_scores WHERE academic_year='2028-29'")).score),
    88,
    "reapplying migration cannot reset future data",
  );
  assert.equal(
    (await one("SELECT count(*)::int n FROM student_enrollments")).n,
    2,
    "future enrollment and identity preserved",
  );
  await db.exec(
    await fs.readFile("supabase/migrations/20261006111000_academic_progress.sql", "utf8"),
  );
  const progress = (await one("SELECT academic_progress_page() r")).r;
  assert.equal(progress.total, 1);
  assert.equal(progress.rows[0].id, student);
  assert.equal(progress.years.length, 2);
  assert.equal(progress.rows[0].scores.find((r) => r.academic_year === "2028-29").percentage, 88);
  assert.equal(
    progress.rows[0].scores.find((r) => r.academic_year === "2026-27" && r.exam_type === "MANUAL")
      .percentage,
    72,
  );
  const restricted = (await one("SELECT academic_progress_page(p_schools=>$1) r", [[other]])).r;
  assert.equal(
    restricted.rows[0].scores.length,
    1,
    "historical results restricted by original school",
  );
  assert.equal((await one("SELECT academic_progress_page(p_schools=>'{}') r")).r.total, 0);
  await assert.rejects(
    () => db.query("SELECT academic_progress_page(p_school=>$1,p_schools=>$2)", [school, [other]]),
    /School access denied/,
  );
  assert.equal(
    (await one("SELECT academic_progress_page(p_search=>'no such student') r")).r.total,
    0,
  );
  assert.equal((await one("SELECT academic_progress_page(p_page=>1) r")).r.rows.length, 0);
  await assert.rejects(
    () => db.exec("SELECT academic_set_current('2026')"),
    /retired academic year/,
  );
  console.log(
    "PASS: baseline atomicity, backups, score/snapshot preservation, archived years, trigger restoration, idempotency, future promotion, progress paging and school access",
  );
}
await db.close();
