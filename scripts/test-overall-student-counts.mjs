import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
function load(file,mocks={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:n=>mocks[n]??require(n),Error});return exports;}
const {activeReportRoster,schoolStudentCounts}=load('src/lib/overall-student-counts.ts');
const schools=[{id:'A',name:'School A',location:'Mumbai'},{id:'B',name:'School B',location:'Pune'},{id:'C',name:'Empty',location:'Nagpur'}];
const row=(id,school='A',year='2026-27',status='Active')=>({id,student_code:id,school_id:school,academic_year:year,enrollment_status:status,class:'5',division:'A'});
const records=[];
for(const [klass,division,total] of [['5','A',30],['5','B',28],['6','A',32],['6','B',30]])for(let i=0;i<total;i++)records.push({...row(`${klass}-${division}-${i}`),class:klass,division});
let roster=activeReportRoster(records,schools,'2026-27');
const sessions=Array.from({length:500},(_,i)=>({id:`s${i}`,school_id:'A',class:'5'}));
const assessments=Array.from({length:300},(_,i)=>({id:`a${i}`,school_id:'A',class:'5',section:'A'}));
let result=schoolStudentCounts(schools,roster.students,sessions,assessments);
assert.equal(result[0].totalStudents,120);assert.equal(result[0].classes,2);assert.equal(result[0].sessions,500);assert.equal(result[0].assessments,300);assert.equal(result[2].totalStudents,0);
const dirty=[...records,records[0],{...records[0],id:'legacy-duplicate',student_code:` ${records[0].student_code.toLowerCase()} `},row('inactive','A','2026-27','Inactive'),row('left','A','2026-27','Left School'),row('past','A','2025-26'),row('invalid','missing'),row('no-school',''),row('B-student','B')];
roster=activeReportRoster(dirty,schools,'2026-27');assert.equal(roster.students.length,121);assert.equal(roster.duplicateRows,2);
const filtered=roster.students.filter(s=>s.class==='5'&&s.division==='B');result=schoolStudentCounts(schools,filtered,sessions,assessments,'5|B');assert.equal(result[0].totalStudents,28);assert.equal(result[0].classes,1);assert.equal(result[0].assessments,0);assert.equal(result[0].sessions,500);
// School-specific legacy Student IDs must not merge unrelated students across schools.
assert.equal(activeReportRoster([row('uuid1'),{...row('uuid2','B'),student_code:'uuid1'}],schools,'2026-27').students.length,2);
assert.equal(activeReportRoster([row('same'),row('same')],schools,'2026-27').students.length,1);
const moved=records.map((r,i)=>i===0?{...r,school_id:'B'}:r);result=schoolStudentCounts(schools,activeReportRoster(moved,schools,'2026-27').students,[],[]);assert.equal(result[0].totalStudents,119);assert.equal(result[1].totalStudents,1);
assert.equal(activeReportRoster(records.slice(1),schools,'2026-27').students.length,119);
assert.equal(activeReportRoster([...records,row('new')],schools,'2026-27').students.length,121);
assert.equal(activeReportRoster([row('same','A','2025-26'),row('same','B','2026-27')],schools,'2025-26').students[0].school_id,'A');
const large=Array.from({length:2305},(_,i)=>row(`large-${i}`));assert.equal(activeReportRoster(large,schools,'2026-27').students.length,2305);
// Activity summaries use report permission and the same academic-year/scoped DB.
let permitted=true,queries=[];const scopedYear='2026-27';
const from=table=>{const q={filters:[],select(){return q},order(){return q},range(a,b){q.rangeValues=[a,b];return q},in(k,v){q.filters.push([k,v]);return q},then(resolve){queries.push({table,filters:q.filters});return Promise.resolve({data:[],error:null}).then(resolve)}};return q;};
const fn={inputValidator:()=>fn,handler:h=>h};
const {overallReportActivity}=load('src/lib/overall-report.functions.ts',{
 '@tanstack/react-start':{createServerFn:()=>fn},
 './app-access.server':{requirePermission:async(_token,module,action)=>{assert.equal(module,'exam_report');assert.equal(action,'view');if(!permitted)throw new Error('Permission denied');return{role:'trainer',allSchools:false,schoolIds:['A']}}},
 './academic-db.server':{academicDb:async year=>{assert.equal(year,scopedYear);return{from}}},
 './fetch-all':load('src/lib/fetch-all.ts'),
});
await overallReportActivity({data:{token:'test',academicYear:scopedYear}});assert.equal(queries.length,2);assert.ok(queries.every(q=>q.filters.some(([k,v])=>k==='school_id'&&v[0]==='A')));
permitted=false;queries=[];await assert.rejects(()=>overallReportActivity({data:{token:'test',academicYear:scopedYear}}),/Permission denied/);assert.equal(queries.length,0);
console.log('PASS: 120 students with 500 sessions/300 assessments, filters, duplicates, invalid schools, inactive enrollments, year isolation, transfers, edits, deletion, >1000 students and scoped activity access.');
