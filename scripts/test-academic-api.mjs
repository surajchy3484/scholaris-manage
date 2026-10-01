import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
function load(path,mocks={},extra={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:name=>mocks[name]??require(name),process,Error,Headers,Request,Response,URL,URLSearchParams,AbortSignal,console,...extra});return exports;}
let transport,requests=[];
const {getSupabaseAdmin}=load('src/lib/supabase-admin.server.ts',{
 '@supabase/supabase-js':{createClient:(_url,_key,options)=>{transport=options.global.fetch;return {}; }},
 './supabase-config.server':{resolveSupabaseServerConfig:()=>({url:'https://database.invalid',key:'sb_secret_test'})},
},{fetch:async(input,init)=>{requests.push({url:new URL(input),...init});return new Response('[]',{status:200});}});
getSupabaseAdmin('2027-28');
await transport('https://database.invalid/rest/v1/students?school_id=eq.A',{});
assert.match(requests.at(-1).url.pathname,/academic_roster$/);assert.equal(requests.at(-1).headers.get('x-academic-year'),'2027-28');
await transport('https://database.invalid/rest/v1/exam_scores?student_id=eq.1',{method:'DELETE'});
assert.equal(requests.at(-1).url.searchParams.get('academic_year'),'eq.2027-28');
await transport('https://database.invalid/rest/v1/assessments',{method:'POST',body:JSON.stringify([{name:'Example'}])});
assert.equal(JSON.parse(requests.at(-1).body)[0].academic_year,'2027-28');
assert.throws(()=>transport('https://database.invalid/rest/v1/assessments',{method:'POST',body:JSON.stringify([{academic_year:'2026-27'}])}),/selected Academic Year/);
const access=load('src/lib/access-control.ts');
let profile={role:'trainer',schoolIds:['11111111-1111-4111-8111-111111111111'],allSchools:false,permissions:{students:['view'],attendance:['view']}};
let calls=[];
const {academicData}=load('src/lib/academic-data.server.ts',{
 './academic-db.server':{resolveAcademicYear:async()=> '2027-28'},
 './access-control':access,
 './app-access.server':{resolveAccess:async()=>profile,adminDb:async()=>({})},
 './supabase-config.server':{resolveSupabaseServerConfig:()=>({url:'https://database.invalid',key:'fake'})},
 './supabase-admin.server':{createAdminFetch:()=>async(input,init)=>{calls.push({url:new URL(input),init});return new Response('[]',{status:200});}},
});
const request={token:'test',table:'students',query:'select=*',method:'GET',headers:{}};
await academicData(request);assert.match(calls.at(-1).url.pathname,/academic_roster$/);assert.match(calls.at(-1).url.searchParams.get('school_id'),/11111111/);
await academicData({...request,table:'attendance'});assert.equal(calls.at(-1).url.searchParams.get('academic_year'),'eq.2027-28');
await assert.rejects(()=>academicData({...request,method:'DELETE',query:'id=eq.1'}),/Permission denied/);
await assert.rejects(()=>academicData({...request,query:'select=*,app_users(*)'}),/Unsupported selection/);
await assert.rejects(()=>academicData({...request,table:'app_users'}),/Unsupported data table/);
let existing=[],rpcCalls=0;
const query=Object.fromEntries(['select','in','order','range'].map(name=>[name,()=>query]));
const {writeClicker}=load('src/lib/universal-clicker.server.ts',{
 './academic-db.server':{academicDb:async year=>{assert.equal(year,'2027-28');return{from:()=>query,rpc:async()=>{rpcCalls++;return{data:1,error:null};}};}},
 './access-control':access,'./fetch-all':{fetchAllRows:async()=>existing},
});
await assert.rejects(()=>writeClicker({...profile,role:'admin'},'delete',[],['missing'],{},'2027-28'),/selected academic year/);assert.equal(rpcCalls,0);
existing=[{id:'exists',school_id:profile.schoolIds[0]}];await writeClicker({...profile,role:'admin'},'delete',[],['exists'],{},'2027-28');assert.equal(rpcCalls,1);
console.log('PASS: year-scoped reads/deletes/inserts, mismatched-year rejection, roster routing, school access, read-only permission and protected table denial');
