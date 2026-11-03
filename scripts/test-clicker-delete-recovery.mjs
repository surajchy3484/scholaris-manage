import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { pathToFileURL } from "node:url";
const { PGlite } = await import(pathToFileURL(`${process.env.PGLITE_ROOT}/dist/index.js`));
const sql = await fs.readFile(
  "supabase/migrations/20260927180000_clicker_delete_recovery.sql",
  "utf8",
);
for (const schema of ["legacy", "modern", "no-results"]) {
  const db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE TABLE clicker_records(id uuid PRIMARY KEY,school_id uuid,assessment_id text,keypad_id text,class text,section text,score numeric,ranking int);
 INSERT INTO clicker_records VALUES
 ('00000000-0000-4000-8000-000000000001',null,null,'orphan','8','A',0,null),
 ('00000000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','A','K1','8','A',10,1),
 ('00000000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','A','K2','8','A',9,2),
 ('00000000-0000-4000-8000-000000000004','22222222-2222-4222-8222-222222222222','B','K1','8','A',9,1);`);
  if (schema !== "no-results")
    await db.exec(`CREATE TABLE assessment_results(assessment_id text,keypad_id text,ranking int);
 INSERT INTO assessment_results VALUES('A','K1',1),('A','K2',2),('B','K1',1);`);
  if (schema === "modern")
    await db.exec(`ALTER TABLE assessment_results ADD COLUMN clicker_id uuid;
 UPDATE assessment_results SET clicker_id='00000000-0000-4000-8000-000000000002' WHERE assessment_id='A' AND keypad_id='K1';`);
  await db.exec(sql);
  await db.exec(sql);
  const orphan = "00000000-0000-4000-8000-000000000001",
    target = "00000000-0000-4000-8000-000000000002";
  await assert.rejects(
    db.query("SELECT delete_clicker_records($1,$2)", [
      [orphan],
      ["11111111-1111-4111-8111-111111111111"],
    ]),
    /School access denied/,
  );
  assert.equal((await db.query("SELECT count(*)::int n FROM clicker_records")).rows[0].n, 4);
  await assert.rejects(
    db.query("SELECT delete_clicker_records($1,$2)", [[target], []]),
    /School access denied/,
  );
  await assert.rejects(
    db.query("SELECT delete_clicker_records($1)", [[target, target]]),
    /no longer exists/,
  );
  assert.equal(
    (await db.query("SELECT delete_clicker_records($1) n", [[orphan, target]])).rows[0].n,
    2,
  );
  assert.equal(
    (await db.query("SELECT ranking FROM clicker_records WHERE keypad_id='K2'")).rows[0].ranking,
    1,
  );
  if (schema !== "no-results") {
    assert.equal((await db.query("SELECT count(*)::int n FROM assessment_results")).rows[0].n, 2);
    assert.equal(
      (await db.query("SELECT ranking FROM assessment_results WHERE keypad_id='K2'")).rows[0]
        .ranking,
      1,
    );
  }
  await db.exec("SET ROLE anon");
  await assert.rejects(
    db.query("SELECT delete_clicker_records($1)", [[target]]),
    /permission denied/,
  );
  await db.close();
}
console.log(
  "PASS: standalone legacy/modern/missing-result schemas, atomic deletion, orphan admin cleanup, scoped denial, unrelated results preserved, ranking, retryable migration and public RPC denial.",
);
