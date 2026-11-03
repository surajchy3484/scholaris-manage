import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const url=s=>`data:text/javascript;base64,${Buffer.from(s).toString('base64')}`;
const school='11111111-1111-4111-8111-111111111111', other='22222222-2222-4222-8222-222222222222', student='33333333-3333-4333-8333-333333333333';
let allowed=true,profile={role:'trainer',schoolIds:[school],allSchools:false},calls=[];
globalThis.__studentDeleteGuard=async(token,module,action)=>{assert.equal(action,'delete');assert(['students','exam_report'].includes(module));if(!allowed)throw new Error('Permission denied');return profile;};
globalThis.__studentDeleteDb={rpc:async(name,args)=>{calls.push({name,args});return {data:1,error:null};}};
let code=ts.transpileModule(await readFile('src/lib/performance.functions.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const modules={
 '@tanstack/react-start':url('export const createServerFn=()=>({inputValidator:validate=>({handler:handler=>args=>handler({data:validate(args.data)})})});'),
 'zod':new URL('../node_modules/zod/index.js',import.meta.url).href,
 './academic-db.server':url('export const academicDb=async()=>globalThis.__studentDeleteDb;'),
 './app-access.server':url('export const requirePermission=(...args)=>globalThis.__studentDeleteGuard(...args);'),
 './access-control':url('export const canSeeSchool=(p,id)=>p.role==="admin"||p.allSchools||p.schoolIds.includes(id);'),
 './fetch-all':url('export const fetchAllRows=()=>[];'),
 './paging-compat.server':url('export const COMPAT_READS=[];export const readWithoutPagingRpc=()=>{};'),
};
for(const [from,to] of Object.entries(modules))code=code.replaceAll(JSON.stringify(from),JSON.stringify(to));
const {deleteStudentDetails}=await import(url(code));
const run=(schoolId=school,module='students')=>deleteStudentDetails({data:{token:'valid',schoolId,module,ids:[student],academicYear:'2026'}});
assert.equal((await run()).count,1);assert.deepEqual(calls[0].args.p_schools,[school]);
await assert.rejects(()=>run(other),/School access denied/);
allowed=false;await assert.rejects(()=>run(),/Permission denied/);assert.equal(calls.length,1);
allowed=true;profile={...profile,role:'admin'};await run(other,'exam_report');assert.equal(calls[1].args.p_schools,null);
console.log('PASS: student delete permission, school scope, restricted SQL allowlist and administrator school access.');
