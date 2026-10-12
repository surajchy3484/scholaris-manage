import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const url=s=>`data:text/javascript;base64,${Buffer.from(s).toString('base64')}`;
const compile=async path=>ts.transpileModule(await readFile(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
const accessUrl=url(await compile('src/lib/access-control.ts'));
const {can}=await import(accessUrl);
let profile={role:'trainer',permissions:{dashboard:['view']}};
globalThis.__dashboardAuth=()=>({ready:true,isAuthed:true,profile,can:(module,action)=>can(profile,module,action)});
let code=await compile('src/routes/index.tsx');
const imports={
 '@/lib/auth':url('export const useAuth=()=>globalThis.__dashboardAuth();'),
 '@/lib/access-control':accessUrl,
 '@tanstack/react-router':url('export const createFileRoute=()=>options=>options;export const Navigate=()=>null;'),
 '@/components/main-dashboard':url('export const MainDashboard=()=>null;'),
 '@/components/require-module':url('export const RequireModule=()=>null;'),
 'react/jsx-runtime':new URL('../node_modules/react/jsx-runtime.js',import.meta.url).href,
};
for(const [from,to] of Object.entries(imports))code=code.replaceAll(JSON.stringify(from),JSON.stringify(to));
const {Route}=await import(url(code));
assert.equal(Route.component().props.to,'/school-dashboard');
profile={role:'trainer',permissions:{session_status:['view']}};
assert.equal(Route.component().props.to,'/session-status');
profile={role:'trainer',permissions:{}};
assert.equal(Route.component().type,'p','No-permission user receives an explanation rather than redirect loop');
profile={role:'admin',permissions:{}};
assert.equal(Route.component().props.module,'main_dashboard');
profile={role:'trainer',permissions:{main_dashboard:['view']}};
assert.equal(Route.component().props.module,'main_dashboard','Explicit Main Dashboard grant opens the page');
profile.permissions.main_dashboard=[];
assert.equal(Route.component().type,'p','Revocation removes access');
console.log('Admin Main Dashboard and non-admin landing route checks passed.');
