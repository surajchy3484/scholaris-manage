import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
const {PGlite}=await import(process.env.PGLITE_MODULE?pathToFileURL(process.env.PGLITE_MODULE).href:'@electric-sql/pglite');
const db=new PGlite();
await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;
CREATE TABLE academic_years(id text primary key);INSERT INTO academic_years VALUES('2026'),('2025');
CREATE TABLE schools(id uuid primary key);
CREATE TABLE sessions(id uuid primary key,school_id uuid,class text,academic_year text,unit text,session_name text,topic text);
CREATE TABLE student_enrollments(student_id uuid,school_id uuid,class text,division text,academic_year text);
CREATE TABLE session_division_status(id uuid primary key,session_id uuid,school_id uuid,division text,status text,academic_year text,updated_at timestamptz,updated_by text);`);
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
for(let n=1;n<=4;n++)await db.query('INSERT INTO schools VALUES($1)',[id(n)]);
// Existing school copies must map to one common catalogue entry; class/year/topic boundaries remain separate.
for(const [n,school,klass,year,unit,name,topic] of [
 [10,1,'5','2026','Unit-1','Magnets','Poles'],[11,2,'5','2026','Unit-1','magnets','Poles'],[12,1,'5','2026','Unit-1','Magnets','Poles'],
 [13,1,'6','2026','Unit-1','Magnets','Poles'],[14,1,'5','2025','Unit-1','Magnets','Poles'],[15,1,'5','2026','Unit-2','Air','Pressure'],
 [16,1,'5','2026','Unit-1','Magnets','Different topic'],
])await db.query('INSERT INTO sessions VALUES($1,$2,$3,$4,$5,$6,$7)',[id(n),id(school),klass,year,unit,name,topic]);
await db.query('INSERT INTO session_division_status VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id(200),id(14),id(1),'A','pending','2025','2025-10-01T10:00Z','original']);
const historicalBefore=(await db.query('SELECT * FROM session_division_status WHERE id=$1',[id(200)])).rows[0];
await db.exec(await readFile('supabase/migrations/20261011160000_class_session_coverage.sql','utf8'));
assert.deepEqual((await db.query('SELECT * FROM session_division_status WHERE id=$1',[id(200)])).rows[0],historicalBefore,'Migration preserves original status and timestamp');
assert.equal((await db.query('SELECT count(*)::int n FROM sessions')).rows[0].n,7,'Original rows retained');
assert.equal((await db.query('SELECT count(*)::int n FROM session_catalogue')).rows[0].n,5);
const catalogue=(await db.query('SELECT catalogue_id FROM sessions WHERE id=$1',[id(10)])).rows[0].catalogue_id;
assert.equal((await db.query('SELECT catalogue_id FROM sessions WHERE id=$1',[id(12)])).rows[0].catalogue_id,catalogue);
for(const [n,school,klass,division,year] of [[1,1,'5','A','2026'],[2,1,'5','B','2026'],[3,1,'5','A','2026'],[4,2,'5','A','2026'],[5,3,'5','A','2026'],[6,4,'5','A','2026'],[7,1,'5','A','2025'],[8,1,'6','A','2026']])await db.query('INSERT INTO student_enrollments VALUES($1,$2,$3,$4,$5)',[id(n+100),id(school),klass,division,year]);
async function mark(n,session,school,division,status='complete',year='2026',date='2026-10-11T10:00Z') {await db.query('INSERT INTO session_division_status VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id(n),id(session),id(school),division,status,year,date,'trainer']);}
await mark(201,10,1,'A');await mark(202,10,1,'B');await mark(203,11,2,'A','pending');await mark(204,14,1,'A','complete','2025');
async function get(schools=[1,2,3,4],year='2026',klass='5',session=null){return(await db.query('SELECT reap_class_session_coverage($1,$2,$3,$4) result',[year,klass,schools.map(id),session])).rows[0].result;}
let r=await get();let m=r.metrics.find(r=>r.id===catalogue);
assert.deepEqual([m.eligible,m.completed,m.pending,m.not_recorded],[4,1,1,2]);
assert.equal(r.metrics.length,3,'Common sessions shown once, including zero completion');assert.deepEqual(r.details,[],'Details fetched only on demand');
r=await get([1,2,3,4],'2026','5',catalogue);assert.equal(r.details.length,4);assert.equal(r.details[0].divisions.length,2);
// A newer duplicate submission overrides old Complete; it never adds another school.
await mark(205,12,1,'A','pending','2026','2026-10-11T11:00Z');
m=(await get()).metrics.find(r=>r.id===catalogue);assert.equal(m.completed,0);assert.equal(m.pending,2);
await mark(206,12,1,'A','complete','2026','2026-10-11T12:00Z');
m=(await get()).metrics.find(r=>r.id===catalogue);assert.equal(m.completed,1);
await db.query("INSERT INTO session_school_assignments VALUES($1,$2,'cancelled',now())",[catalogue,id(4)]);
m=(await get()).metrics.find(r=>r.id===catalogue);assert.deepEqual([m.eligible,m.completed,m.pending,m.not_recorded],[3,1,1,1]);
r=await get([1]);assert.equal(r.metrics.find(r=>r.id===catalogue).eligible,1,'Authorized school scope');assert.equal(r.metrics.find(r=>r.id===catalogue).completed,1);
assert.equal((await get([1],'2025')).metrics[0].completed,1,'Historical status preserved');
assert.equal((await get([1],'2026','6')).metrics[0].completed,0,'Class isolation');
m=(await get([])).metrics.find(r=>r.id===catalogue);assert.equal(m.eligible,0);
// Existing import path links future school deliveries without duplicating the catalogue.
await db.query('INSERT INTO sessions(id,school_id,class,academic_year,unit,session_name,topic) VALUES($1,$2,$3,$4,$5,$6,$7)',[id(17),id(3),'5','2026','Unit-1','Magnets','Poles']);
assert.equal((await db.query('SELECT count(*)::int n FROM session_catalogue')).rows[0].n,5);
await assert.rejects(()=>db.exec("INSERT INTO session_coverage_settings VALUES('2026',40,50)"));
await db.exec("INSERT INTO session_coverage_settings VALUES('2026',90,60)");
await db.exec('SET ROLE authenticated');await assert.rejects(()=>get());await assert.rejects(()=>db.exec('SELECT * FROM session_catalogue'));await db.exec('RESET ROLE');
const source=ts.transpileModule(await readFile('src/lib/session-coverage.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
const {coverageCategory,coveragePercentage}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const row=n=>({eligible:100,completed:n,pending:100-n,not_recorded:0});
for(const [n,label] of [[100,'Fully Covered'],[99,'Almost All Schools'],[80,'Almost All Schools'],[79,'Partially Covered'],[50,'Partially Covered'],[49,'Low Coverage'],[1,'Low Coverage'],[0,'Not Started']])assert.equal(coverageCategory(row(n)),label);
assert.equal(coverageCategory(row(85),{almost_all:90,partial:60}),'Partially Covered');assert.equal(coveragePercentage(m),null);assert.equal(coverageCategory(m),'N/A');
console.log('Passed SQL coverage: catalogue deduplication, all divisions, duplicate latest submission, missing vs pending, cancellations, school/class/year isolation, zero eligibility, future imports, RLS, thresholds.');
const savedBeforeRollback=(await db.query('SELECT * FROM session_division_status ORDER BY id')).rows;
await db.exec(await readFile('docs/sql/rollback-class-session-coverage.sql','utf8'));
assert.deepEqual((await db.query('SELECT * FROM session_division_status ORDER BY id')).rows,savedBeforeRollback);
assert.equal((await db.query('SELECT count(*)::int n FROM sessions')).rows[0].n,8);
console.log('Rollback passed: original sessions and completion statuses retained.');
await db.close();
