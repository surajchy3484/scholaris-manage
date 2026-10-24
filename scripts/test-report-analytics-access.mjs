import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const url=s=>`data:text/javascript;base64,${Buffer.from(s).toString('base64')}`;
const school='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
let profile={role:'trainer',schoolIds:[school],allSchools:false},allowed=true,calls=[];
globalThis.__analyticsGuard=async(token,module,action)=>{assert.equal(module,'exam_report');assert.equal(action,'view');if(!allowed)throw Error('Permission denied');return profile;};
globalThis.__analyticsDb=async year=>{assert.equal(year,'2026-27');return {from(table){const call={table,filters:[]};calls.push(call);const q={select(){return q},order(){return q},range(){return q},in(key,values){call.filters.push([key,values]);return q},then(resolve){resolve({error:null,data:table==='assessment_evaluation_context'?[{assessment_id:'ASM-1'}]:table==='clicker_records'?[{assessment_id:'ASM-1',question_snapshot:null},{assessment_id:'ASM-OTHER',question_snapshot:null},{assessment_id:'ASM-1',question_snapshot:[]}]:[]})}};return q}}};
let code=ts.transpileModule(await readFile('src/lib/report-analytics.functions.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const modules={
 '@tanstack/react-start':url('export const createServerFn=()=>({inputValidator:validate=>({handler:handler=>args=>handler({data:validate(args.data)})})});'),
 'zod':new URL('../node_modules/zod/index.js',import.meta.url).href,
 './academic-db.server':url('export const academicDb=(...a)=>globalThis.__analyticsDb(...a);'),
 './app-access.server':url('export const requirePermission=(...a)=>globalThis.__analyticsGuard(...a);'),
 './access-control':url('export const canSeeSchool=(p,id)=>p.role==="admin"||p.allSchools||p.schoolIds.includes(id);'),
 './fetch-all':url('export const fetchAllRows=async f=>{const r=await f(0,999);if(r.error)throw r.error;return r.data};'),
};
for(const [from,to] of Object.entries(modules))code=code.replaceAll(JSON.stringify(from),JSON.stringify(to));
const {loadReportAnalytics}=await import(url(code));
const run=(schoolId='all')=>loadReportAnalytics({data:{token:'token',academicYear:'2026-27',schoolId}});
await run();assert.deepEqual(calls.map(c=>c.filters),[[['school_id',[school]]],[['school_id',[school]]],[['assessment_id',['ASM-1']]]]);
calls=[];await assert.rejects(()=>run(other),/School access denied/);assert.equal(calls.length,0);
allowed=false;await assert.rejects(()=>run(),/Permission denied/);allowed=true;
profile.schoolIds=[];assert.deepEqual(await run(),{assessments:[],questions:[],records:[]});assert.equal(calls.length,0);
profile={role:'admin',schoolIds:[],allSchools:true};await run(other);assert.deepEqual(calls[0].filters,[['school_id',[other]]]);
console.log('PASS: report-only permission, school scope, denied users, empty scope, selected-school filtering and scoped legacy question lookup.');
