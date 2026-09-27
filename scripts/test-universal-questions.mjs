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
await db.exec(
  await fs.readFile("supabase/migrations/20260926150000_universal_question_bank.sql", "utf8"),
);
assert.equal(
  (await db.query("SELECT count(*)::int n FROM questions")).rows[0].n,
  4,
  "legacy preserved",
);
assert.equal(
  (await db.query("SELECT count(*)::int n FROM question_bank")).rows[0].n,
  1,
  "identical complete sets deduplicated",
);
assert.equal(
  (await db.query("SELECT count(*)::int n FROM question_bank_migration_issues")).rows[0].n,
  2,
  "conflicting class 7 sets held for review",
);
await db.exec(
  "INSERT INTO question_bank(exam_type,class,question_no,correct_answer,parameter,chapter,topic) VALUES('ICA','8',2,'B','Analytical','Force','Motion'),('ICA','8',3,'C','STEM','Energy','Heat'),('MCA','8',1,'D','Other','Other','Other'),('ICA','7',1,'D','Other','Other','Other')",
);
const write = async (mode, rows = [], ids = [], patch = {}) =>
  (
    await db.query("SELECT universal_clicker_write($1,$2,$3,$4) n", [
      mode,
      JSON.stringify(rows),
      ids,
      JSON.stringify(patch),
    ])
  ).rows[0].n;
const input = {
  assessment_id: "A",
  exam_type: "ICA",
  class: "Class 08",
  section: "A",
  keypad_id: "K1",
  student_id: student,
  student_name: "Asha",
  school_id: school,
  answers: { "1-S1": "A", "2-S2": "D" },
};
await write("insert", [input]);
let row = (await db.query("SELECT * FROM clicker_records WHERE keypad_id='K1'")).rows[0];
assert.equal(Number(row.score), 1);
assert.equal(row.total_questions, 3);
assert.equal(row.attempted_questions, 2);
assert.equal(row.correct_answers, 1);
assert.equal(row.wrong_answers, 1);
assert.equal(row.unattempted_questions, 1);
assert.equal(Number(row.correct_rate), 33.3);
assert.equal(Number(row.ranking), 1);
assert.equal(row.question_snapshot[1].parameter, "Analytical");
assert.equal((await db.query("SELECT count(*)::int n FROM assessment_results")).rows[0].n, 1);
assert.equal(Number((await db.query("SELECT score FROM exam_scores")).rows[0].score), 33.3);
await assert.rejects(
  () =>
    write("insert", [
      { ...input, keypad_id: "hidden", student_id: null, exam_type: "MCA", assessment_id: "M" },
    ]),
  /Question Set Inactive/,
);
await assert.rejects(
  () =>
    write("insert", [
      { ...input, keypad_id: "wrongexam", student_id: null, exam_type: "ICA", assessment_id: "M" },
    ]),
  /match.*exactly/,
);
await assert.rejects(
  () => write("insert", [{ ...input, keypad_id: "wrongclass", student_id: null, class: "7" }]),
  /match.*exactly/,
);
await assert.rejects(
  () => write("insert", [{ ...input, keypad_id: "wrongschool", school_id: other }]),
  /school/,
);
await assert.rejects(
  () =>
    write("insert", [{ ...input, keypad_id: "unknown", student_id: null, answers: { S4: "A" } }]),
  /No answer key/,
);
await assert.rejects(
  () =>
    write("insert", [
      { ...input, keypad_id: "badcol", student_id: null, answers: { "1-S2": "A" } },
    ]),
  /Mismatched/,
);
await assert.rejects(
  () =>
    write("insert", [{ ...input, keypad_id: "badanswer", student_id: null, answers: { S1: "E" } }]),
  /Invalid response/,
);
await assert.rejects(() => write("insert", [input]), /Duplicate/);
await write("insert", [
  { ...input, keypad_id: "K2", student_id: null, answers: { S1: "A", S2: "B", S3: "C" } },
  { ...input, keypad_id: "K3", student_id: null, answers: { S1: "A", S2: "B", S3: "C" } },
]);
assert.deepEqual(
  (await db.query("SELECT ranking FROM clicker_records ORDER BY keypad_id")).rows.map((r) =>
    Number(r.ranking),
  ),
  [3, 1, 1],
);
await write("update", [], [row.id], { answers: { S1: "A", S2: "B", S3: "C" } });
assert.deepEqual(
  (await db.query("SELECT ranking FROM clicker_records ORDER BY keypad_id")).rows.map((r) =>
    Number(r.ranking),
  ),
  [1, 1, 1],
);
await db.exec("UPDATE exam_types SET visible=false WHERE name='ICA'");
await assert.rejects(
  () => write("update", [], [row.id], { answers: { S1: "A" } }),
  /Question Set Inactive/,
);
assert.equal((await db.query("SELECT count(*)::int n FROM question_bank")).rows[0].n, 5);
await db.exec(
  "UPDATE exam_types SET visible=true WHERE name='ICA'; INSERT INTO exam_types(name,visible) VALUES('PRACTICE TEST',true); INSERT INTO question_bank(exam_type,class,question_no,correct_answer) VALUES('PRACTICE TEST','8',1,'B')",
);
await db.query(
  "INSERT INTO assessments(assessment_id,exam_type,class,school_id) VALUES('P','PRACTICE TEST','8',$1)",
  [school],
);
await write("insert", [
  {
    ...input,
    assessment_id: "P",
    exam_type: "PRACTICE TEST",
    keypad_id: "P1",
    student_id: null,
    answers: { S1: "B" },
  },
]);
assert.equal(
  Number((await db.query("SELECT score FROM clicker_records WHERE keypad_id='P1'")).rows[0].score),
  1,
);
const count = (await db.query("SELECT count(*)::int n FROM clicker_records")).rows[0].n;
await assert.rejects(
  () =>
    write("insert", [
      { ...input, keypad_id: "atomic", student_id: null },
      { ...input, keypad_id: "bad", student_id: null, answers: { S1: "X" } },
    ]),
  /Invalid/,
);
assert.equal((await db.query("SELECT count(*)::int n FROM clicker_records")).rows[0].n, count);
await db.exec(
  "UPDATE question_bank SET correct_answer='D' WHERE exam_type='ICA' AND class='8' AND question_no=1",
);
assert.equal(
  (await db.query("SELECT question_snapshot FROM clicker_records WHERE id=$1", [row.id])).rows[0]
    .question_snapshot[0].correct_answer,
  "A",
  "historical snapshot unchanged",
);
const page = (
  await db.query("SELECT universal_questions_page('ICA','8','',0,2,'question_no',false) r")
).rows[0].r;
assert.equal(page.total, 3);
assert.equal(page.rows.length, 2);

// Universal bank applies to a second school; class 7 and MCA keep independent keys.
await write("insert", [
  {
    ...input,
    assessment_id: "B",
    school_id: other,
    keypad_id: "B1",
    student_id: null,
    answers: { S1: "D", S2: "B", S3: "C" },
  },
]);
assert.equal(
  Number((await db.query("SELECT score FROM clicker_records WHERE keypad_id='B1'")).rows[0].score),
  3,
);
await db.exec("UPDATE exam_types SET visible=true WHERE name='MCA'");
await write("insert", [
  {
    ...input,
    assessment_id: "M",
    exam_type: "MCA",
    keypad_id: "M1",
    student_id: null,
    answers: { S1: "A" },
  },
]);
assert.equal(
  Number((await db.query("SELECT score FROM clicker_records WHERE keypad_id='M1'")).rows[0].score),
  0,
);
await write("insert", [
  {
    ...input,
    assessment_id: "C7",
    class: "7",
    keypad_id: "C71",
    student_id: null,
    answers: { S1: "D" },
  },
]);
assert.equal(
  Number((await db.query("SELECT score FROM clicker_records WHERE keypad_id='C71'")).rows[0].score),
  1,
);
await write("insert", [{ ...input, keypad_id: "BLANK", student_id: null, answers: {} }]);
const blank = (await db.query("SELECT * FROM clicker_records WHERE keypad_id='BLANK'")).rows[0];
assert.equal(blank.attempted_questions, 0);
assert.equal(blank.wrong_answers, 0);
assert.equal(blank.unattempted_questions, 3);
await db.exec(
  "INSERT INTO question_bank(exam_type,class,question_no,correct_answer) SELECT 'PRACTICE TEST','9',n,'A' FROM generate_series(1,1100) n",
);
await db.query(
  "INSERT INTO assessments(assessment_id,exam_type,class,school_id) VALUES('BIG','PRACTICE TEST','9',$1)",
  [school],
);
await write("insert", [
  {
    ...input,
    assessment_id: "BIG",
    exam_type: "PRACTICE TEST",
    class: "9",
    keypad_id: "BIG1",
    student_id: null,
    answers: { "1100-S1100": "A" },
  },
]);
const big = (await db.query("SELECT * FROM clicker_records WHERE keypad_id='BIG1'")).rows[0];
assert.equal(big.total_questions, 1100);
assert.equal(big.correct_answers, 1);
assert.equal(big.unattempted_questions, 1099);
await assert.rejects(
  () =>
    db.query("SELECT universal_clicker_write($1,$2,$3,$4,$5)", [
      "insert",
      JSON.stringify([{ ...input, keypad_id: "scope", student_id: null }]),
      [],
      "{}",
      [other],
    ]),
  /School access denied/,
);
await assert.rejects(() => write("update", [], [row.id], { score: 999 }), /read-only/);
await db.exec("SET ROLE anon");
await assert.rejects(() => write("insert", []));
await assert.rejects(() => db.query("SELECT * FROM question_bank"));
await db.exec("RESET ROLE");
await db.close();
console.log(
  "PASS: additive migration, safe legacy dedup/conflicts, exact exam/class matching, hidden types, future type, dynamic columns, metrics, tied ranking, snapshot reports, atomic rollback, duplicate rejection and role denial.",
);
