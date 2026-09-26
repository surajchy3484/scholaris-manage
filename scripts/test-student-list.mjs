import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from 'typescript';
import { pathToFileURL } from 'node:url';
const packageRoot = process.env.PGLITE_ROOT;
if (!packageRoot) throw new Error('Set PGLITE_ROOT to an external @electric-sql/pglite directory');
const {PGlite} = await import(pathToFileURL(`${packageRoot}/dist/index.js`));
const {pg_trgm} = await import(pathToFileURL(`${packageRoot}/dist/contrib/pg_trgm.js`));
const db = new PGlite({extensions:{pg_trgm}});
await db.exec('CREATE SCHEMA extensions; CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;');
// Derive fixture columns from the checked-in database types to catch schema mismatches.
const source = ts.createSourceFile('types.ts',await fs.readFile('src/integrations/supabase/types.ts','utf8'),ts.ScriptTarget.Latest,true);
const database = source.statements.find(s=>ts.isTypeAliasDeclaration(s)&&s.name.text==='Database').type;
const member = (t,key)=>t.members.find(m=>m.name.getText(source)===key || m.name.getText(source)===`"${key}"`).type;
const tables = member(member(database,'public'),'Tables');
for (const name of ['schools','students','attendance','assessments','questions','clicker_records','exam_scores']) {
 const row = member(member(tables,name),'Row');
 const fields = row.members.map(m=>{
  const key=m.name.getText(source),type=m.type.getText(source);
  const sqlType=key==='id'||key==='school_id'||key==='student_id'?'uuid':type.includes('number')?'numeric':type.includes('boolean')?'boolean':type.includes('Json')?'jsonb':'text';
  return `"${key}" ${sqlType}${key==='id'?' PRIMARY KEY DEFAULT gen_random_uuid()':''}`;
 });
 await db.exec(`CREATE TABLE public.${name} (${fields.join(',')});`);
}
await db.exec(await fs.readFile('supabase/migrations/20260925090000_performance_paging.sql','utf8'));
await db.exec(await fs.readFile('supabase/migrations/20260925133000_student_details_list.sql','utf8'));
const school='11111111-1111-1111-1111-111111111111', other='22222222-2222-2222-2222-222222222222';
await db.query('INSERT INTO schools(id,code,name) VALUES ($1,\'SCH001\',\'A\'),($2,\'SCH002\',\'B\')',[school,other]);
await db.query(`INSERT INTO students(school_id,student_code,name,class,division,roll_number) SELECT $1,'SCH001-STU'||lpad(i::text,6,'0'),'Student '||i,'5','A',i::text FROM generate_series(1,10000) i`,[school]);
await db.query(`INSERT INTO students(school_id,student_code,name,class,division,roll_number) VALUES ($1,'OTHER','Other','5','A','1')`,[other]);

const student=(await db.query("SELECT id FROM students WHERE school_id=$1 AND roll_number='1'",[school])).rows[0].id;
await db.query(`INSERT INTO exam_scores(school_id,student_id,exam_type,score,updated_at) VALUES ($1,$2,'ICA',0,'2026-01-01'),($1,$2,'IMF',60,'2026-01-01'),($1,$2,'MCA',80,'2026-02-01'),($1,$2,'FCA',90,'2026-01-01')`,[school,student]);
await db.query(`INSERT INTO attendance(student_id,school_id,status) VALUES ($1,$2,'present'),($1,$2,'absent')`,[student,school]);
const page=async(options={})=>(await db.query('SELECT student_details_page(p_school:=$1,p_page:=$2,p_search:=$3,p_attendance:=$4,p_exam:=$5,p_status:=$6,p_min:=$7,p_max:=$8) r',[school,options.page??0,options.search??'',options.attendance??'all',options.exam??'ICA',options.status??'all',options.min??null,options.max??null])).rows[0].r;
let result=await page();assert.equal(result.total,10000);assert.equal(result.rows.length,50);assert.equal(result.rows[0].ica,0);assert.equal(result.rows[0].mca,80);assert.equal(result.rows[0].attendance_pct,50);
assert.equal((await page({page:199})).rows.length,50);
assert.equal((await page({search:'Other'})).total,0);
assert.equal((await page({search:"%' OR true --"})).total,0);
assert.equal((await page({status:'recorded',min:0,max:0})).total,1);
assert.equal((await page({status:'missing'})).total,9999);
assert.equal((await page({exam:'IMF',min:70})).total,1);
assert.equal((await page({attendance:'below75'})).total,1);
assert.equal((await page({attendance:'missing'})).total,9999);
await db.query("INSERT INTO exam_scores(school_id,student_id,exam_type,score,updated_at) VALUES ($1,$2,'ATTENDANCE',100,'2026-01-01')",[school,student]);
assert.equal((await page({attendance:'atleast75'})).total,1);
await db.exec('SET ROLE anon');await assert.rejects(()=>page());await assert.rejects(()=>db.query('SELECT delete_student_details($1,$2::uuid[])',[school,[student]]));await db.exec('RESET ROLE');
await db.query('SELECT delete_student_details($1,$2::uuid[])',[other,[student]]);
assert.equal((await page()).total,10000,'Cross-school delete must not remove students');
await db.query('SELECT delete_student_details($1,$2::uuid[])',[school,[student]]);
assert.equal((await page()).total,9999);
assert.equal((await db.query('SELECT count(*)::int n FROM exam_scores WHERE student_id=$1',[student])).rows[0].n,0);
await db.close();console.log('PASS: 10,000 students, page boundaries, zero/missing scores, IMF fallback and MCA priority, attendance and override filters, escaped search, school isolation, RPC role denial and atomic score cleanup');
