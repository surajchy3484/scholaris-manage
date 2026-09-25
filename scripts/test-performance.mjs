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
for (const name of ['schools','students','attendance','assessments','questions','clicker_records']) {
 const row = member(member(tables,name),'Row');
 const fields = row.members.map(m=>{
  const key=m.name.getText(source),type=m.type.getText(source);
  const sqlType=key==='id'||key==='school_id'||key==='student_id'?'uuid':type.includes('number')?'numeric':type.includes('boolean')?'boolean':type.includes('Json')?'jsonb':'text';
  return `"${key}" ${sqlType}${key==='id'?' PRIMARY KEY DEFAULT gen_random_uuid()':''}`;
 });
 await db.exec(`CREATE TABLE public.${name} (${fields.join(',')});`);
}
const migration=await fs.readFile('supabase/migrations/20260925090000_performance_paging.sql','utf8');
await db.exec(migration);
await db.exec(migration); // additive migration remains rerunnable
const school='11111111-1111-1111-1111-111111111111', other='22222222-2222-2222-2222-222222222222';
await db.query('INSERT INTO schools(id,code,name) VALUES ($1,\'SCH001\',\'A\'),($2,\'SCH002\',\'B\')',[school,other]);
await db.query(`INSERT INTO students(school_id,student_code,name,class,division,roll_number) SELECT $1,'SCH001-STU'||lpad(i::text,6,'0'),'Student '||i,'5','A',i::text FROM generate_series(1,10000) i`,[school]);
await db.query(`INSERT INTO students(school_id,student_code,name,class,division,roll_number) VALUES ($1,'OTHER','Other','5','A','1')`,[other]);
const page=async(page=0,search='',sort='roll-asc')=>(await db.query('SELECT performance_student_page($1,\'all\',\'all\',$2,$3,50,$4) result',[school,search,page,sort])).rows[0].result;
let result=await page();assert.equal(result.total,10000);assert.equal(result.rows.length,50);assert.equal(result.rows[0].roll_number,'1');
assert.equal((await page(1)).rows[0].roll_number,'51');
assert.equal((await page(199)).rows.at(-1).roll_number,'10000');
assert.equal((await page(0,'Other')).total,0);
assert.equal((await page(0,"%' OR true --")).total,0);
assert.equal((await page(0,'Student 10000')).total,1);
assert.equal((await page(0,'','roll-desc')).rows[0].roll_number,'10000');
assert.equal((await db.query('SELECT performance_student_facets($1) r',[school])).rows[0].r.total,10000);
for (const table of ['assessments','questions','clicker_records']) {
 await db.query('SELECT performance_master_page(p_table:=$1,p_search:=\'test\',p_schools:=$2::uuid[])',[table,[school]]);
}
await assert.rejects(()=>db.query("SELECT performance_master_page('students; DROP TABLE schools')"));
await db.query(`INSERT INTO clicker_records(assessment_id,school_id,answers,ranking) VALUES ('ASM-1',$1,'{"S1":"A","S20":"B"}',1),('ASM-2',$2,'{"S99":"C"}',2)`,[school,other]);
result=(await db.query("SELECT performance_master_page(p_table:='clicker_records',p_schools:=$1::uuid[]) r",[[school]])).rows[0].r;
assert.equal(result.total,1);assert.deepEqual(result.questionColumns,['S1','S20']);
await db.query(`INSERT INTO assessments(assessment_id,school_id) VALUES ('ASM-1',$1),('ASM-2',$2)`,[school,other]);
await db.exec(`INSERT INTO questions(assessment_id,question_no,correct_answer) VALUES ('ASM-1',1,'A'),('ASM-2',1,'B')`);
const keys=(await db.query('SELECT performance_question_keys($1::text[],$2::uuid[]) r', [['ASM-1','ASM-2'],[school]])).rows[0].r;
assert.deepEqual(keys,[{assessment_id:'ASM-1',question_no:1,correct_answer:'A'}]);
const rows=[{name:'New',class:'5',division:'A',roll_number:'10001'},{name:'Existing',class:'5',division:'A',roll_number:'1'}];
const insert=async()=>(await db.query('SELECT performance_import_students($1,$2::jsonb) n',[school,JSON.stringify(rows)])).rows[0].n;
assert.equal(await insert(),1);assert.equal(await insert(),0);
assert.equal((await page(0,'New')).rows[0].student_code,'SCH001-STU010001');
await db.exec('SET ROLE anon');
await assert.rejects(()=>db.query("SELECT performance_student_facets($1)",[school]));
await db.exec('RESET ROLE');
const begin=performance.now();await Promise.all(Array.from({length:20},(_,i)=>page(i)));const elapsed=performance.now()-begin;
console.log(JSON.stringify({fixture_students:10001,page_rows:50,simultaneous_client_requests:20,elapsed_ms:Math.round(elapsed),note:'Local embedded PostgreSQL queues requests; this is not a production concurrency benchmark.'}));
await db.close();
console.log('PASS: paging, total counts, sorting, search escaping, school isolation, column discovery, safe import retry, role denial, migration reapplication');
