import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const url=code=>`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
let profile={role:'admin',allSchools:false,schoolIds:[]}, allowed=true, calls=[];
const id='11111111-1111-4111-8111-111111111111';
let rows=[{id,school_id:null}];
globalThis.__assessmentGuard=async(token,module,action)=>{
 assert.equal(module,'assessments'); assert.equal(action,'delete');
 if(!allowed)throw new Error('Permission denied');return profile;
};
globalThis.__assessmentDb={from:()=>({select:()=>({in:async()=>({data:rows,error:null})})}),rpc:async(name,args)=>{calls.push({name,args});return {data:1,error:null};}};
let code=ts.transpileModule(await readFile('src/lib/master.functions.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const modules={
 '@tanstack/react-start':url('export const createServerFn=()=>({inputValidator:validate=>({handler:handler=>args=>handler({data:validate(args.data)})})});'),
 'zod':new URL('../node_modules/zod/index.js',import.meta.url).href,
 './academic-db.server':url('export const academicDb=async()=>globalThis.__assessmentDb;'),
 './app-access.server':url('export const requirePermission=(...args)=>globalThis.__assessmentGuard(...args);'),
 './access-control':url('export const canSeeSchool=(p,id)=>p.role==="admin"||p.allSchools||p.schoolIds.includes(id);'),
 './universal-clicker.server':url('export const writeClicker=()=>{throw new Error("unexpected");};'),
};
for(const [key,value] of Object.entries(modules))code=code.replaceAll(JSON.stringify(key),JSON.stringify(value));
const {deleteMasterRows}=await import(url(code));
const run=()=>deleteMasterRows({data:{token:'test',table:'assessments',ids:[id],academicYear:'2026'}});
assert.equal((await run()).count,1);
assert.equal(calls[0].name,'delete_assessments');assert.equal(calls[0].args.p_schools,null);
profile={role:'trainer',allSchools:false,schoolIds:['school-a']};
await assert.rejects(run,/School access denied/);
rows=[{id,school_id:'school-b'}];await assert.rejects(run,/School access denied/);
rows=[{id,school_id:'school-a'}];await run();assert.deepEqual(calls.at(-1).args.p_schools,['school-a']);
allowed=false;await assert.rejects(run,/Permission denied/);
assert.equal(calls.length,2);
allowed=true;rows=[];await assert.rejects(run,/selected academic year/);
console.log('PASS: admin deletes unassigned assessments; non-admin school scope, delete permission and missing/year checks enforced before RPC.');
