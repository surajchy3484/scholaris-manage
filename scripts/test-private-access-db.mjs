import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { pathToFileURL } from "node:url";
const { PGlite } = await import(pathToFileURL(`${process.env.PGLITE_ROOT}/dist/index.js`));
const db = new PGlite();
await db.exec(
  "CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;",
);
const tables = [
  "schools",
  "students",
  "attendance",
  "school_clusters",
  "school_divisions",
  "app_users",
  "assessment_results",
];
for (const table of tables)
  await db.exec(
    `CREATE TABLE ${table}(id int); INSERT INTO ${table} VALUES(1); GRANT ALL ON ${table} TO anon,authenticated; ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY; CREATE POLICY public_all ON ${table} FOR ALL USING(true) WITH CHECK(true);`,
  );
const sql = await fs.readFile(
  "supabase/migrations/20260927130000_private_account_access.sql",
  "utf8",
);
await db.exec(sql);
await db.exec(sql); // Safe to retry.
for (const role of ["anon", "authenticated"]) {
  await db.exec(`SET ROLE ${role}`);
  for (const table of tables) {
    await assert.rejects(db.query(`SELECT * FROM ${table}`), /permission denied/);
    await assert.rejects(db.query(`DELETE FROM ${table}`), /permission denied/);
  }
  await db.exec("RESET ROLE");
}
await db.exec("SET ROLE service_role");
for (const table of tables)
  assert.equal((await db.query(`SELECT count(*)::int n FROM ${table}`)).rows[0].n, 1);
await db.close();
console.log(
  "PASS: database migration preserves records, denies public reads/writes, retains privileged server access and can be retried.",
);
