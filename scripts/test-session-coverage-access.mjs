import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const url=code=>`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const compile=async path=>ts.transpileModule(await readFile(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const a='00000000-0000-0000-0000-000000000001',b='00000000-0000-0000-0000-000000000002',trainer='00000000-0000-0000-0000-000000000003';
let profile={userId:trainer,role:'trainer',schoolIds:[a],allSchools:false,fullName:'Trainer',username:'trainer',permissions:{dashboard:['view'],assessments:['view'],session_status:['view']}};
let rpcCalls=[];let writes=[];
const can=(p,module,action)=>p.role==='admin'||p.permissions[module]?.includes(action);
globalThis.__coverageRequire=async(token,module,action)=>{if(token!=='valid'||!can(profile,module,action))throw new Error('denied');return profile;};
const schoolRows=[{id:a,name:'One',location:'Kalwa',cluster_name:'Kalwa Cluster'},{id:b,name:'Two',location:'Manmad',cluster_name:'Manmad Cluster'}];
function query(table){
 let rows=table==='schools'?schoolRows:table==='app_users'?[{id:trainer,full_name:'Trainer',username:'trainer',school_ids:[a],all_schools:false}]:[];
 const q={select:()=>q,order:()=>q,eq:()=>q,in:(key,values)=>{rows=rows.filter(r=>values.includes(r[key]));return q;},range:async()=>({data:rows,error:null}),maybeSingle:async()=>({data:null,error:null}),upsert:async data=>{writes.push(data);return {error:null};}};return q;
}
globalThis.__coverageDb={from:query,rpc:async(name,args)=>{rpcCalls.push(args);return {data:{metrics:[],details:[]},error:null};}};
let code=await compile('src/lib/session-coverage.functions.ts');
const modules={
 '@tanstack/react-start':url('export const createServerFn=()=>({inputValidator:(validate)=>({handler:(handler)=>async(args)=>handler({data:validate(args.data)})})});'),
 'zod':new URL('../node_modules/zod/index.js',import.meta.url).href,
 './app-access.server':url('export const requirePermission=(...args)=>globalThis.__coverageRequire(...args);export const adminDb=async()=>globalThis.__coverageDb;'),
 './academic-db.server':url('export const resolveAcademicYear=async(year)=>year??"2026";'),
 './access-control':url(`export const can=${can.toString()};`),
 './fetch-all':url(await compile('src/lib/fetch-all.ts')),
 './organization-groups':url('export const schoolOrganizationGroup=s=>s.cluster_name;'),
 './session-coverage':url(await compile('src/lib/session-coverage.ts')),
 './dashboard-compat':url('export const missingDashboardFeature=()=>false;'),
};
for(const [specifier,target] of Object.entries(modules))code=code.replaceAll(JSON.stringify(specifier),JSON.stringify(target));
const {getSessionCoverage,saveCoverageThresholds}=await import(url(code));
const input={token:'valid',class:'5',academicYear:'2026',context:'assessments'};
await assert.rejects(()=>getSessionCoverage({data:{...input,context:'dashboard'}}), /administrators only/);
assert.equal(rpcCalls.length,0,'Non-admin dashboard blocked before database access');
let result=await getSessionCoverage({data:input});assert.deepEqual(rpcCalls.at(-1).p_schools,[a]);assert.equal(result.schools.length,1);
await getSessionCoverage({data:{...input,centre:'Manmad Cluster'}});assert.deepEqual(rpcCalls.at(-1).p_schools,[]);
await assert.rejects(()=>getSessionCoverage({data:{...input,trainer:b}}));
await assert.rejects(()=>getSessionCoverage({data:{...input,token:'bad'}}));
const count=rpcCalls.length;profile.permissions.session_status=[];await assert.rejects(()=>getSessionCoverage({data:input}));assert.equal(rpcCalls.length,count,'No database coverage query without session permission');
profile.permissions.session_status=['view'];profile.permissions.assessments=[];await assert.rejects(()=>getSessionCoverage({data:{...input,context:'assessments'}}));profile.permissions.assessments=['view'];
await assert.rejects(()=>saveCoverageThresholds({data:{token:'valid',almost_all:80,partial:50}}));assert.equal(writes.length,0);
profile={...profile,schoolIds:[]};await getSessionCoverage({data:input});assert.deepEqual(rpcCalls.at(-1).p_schools,[],'Empty assignment never grants organization scope');
profile={...profile,role:'admin'};result=await getSessionCoverage({data:{...input,context:'assessments'}});assert.equal(result.schools.length,2);
await getSessionCoverage({data:{...input,trainer}});assert.deepEqual(rpcCalls.at(-1).p_schools,[a]);
await assert.rejects(()=>saveCoverageThresholds({data:{token:'valid',almost_all:40,partial:50}}));
await saveCoverageThresholds({data:{token:'valid',academicYear:'2025',almost_all:90,partial:60}});assert.deepEqual(writes.at(-1),{academic_year:'2025',almost_all:90,partial:60});
console.log('Passed server access tests: dashboard/assessment/session permissions, trainer and centre scope, empty allowlist, admin scope and threshold writes.');

await getSessionCoverage({data:{...input,school:b}});assert.deepEqual(rpcCalls.at(-1).p_schools,[b]);
profile={...profile,role:'trainer',schoolIds:[a],permissions:{dashboard:['view'],session_status:['view'],assessments:['view']}};
await getSessionCoverage({data:{...input,school:b}});assert.deepEqual(rpcCalls.at(-1).p_schools,[], 'School filter cannot expand trainer access');
console.log('Shared school filter and restricted-school scope passed.');
