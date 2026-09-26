import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
async function load(path,mocks){const exports={};const js=ts.transpileModule(await fs.readFile(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;vm.runInNewContext(js,{exports,require:n=>mocks[n]??require(n),Map,Set});return exports;}
const button=({children,...props})=>React.createElement('button',props,children);
const checkbox=({'aria-label':label,checked})=>React.createElement('input',{type:'checkbox','aria-label':label,checked,readOnly:true});
const {StudentListTable}=await load('src/components/student-list.tsx',{'@/components/ui/button':{Button:button},'@/components/ui/checkbox':{Checkbox:checkbox},'@/components/ui/input':{Input:props=>React.createElement('input',props)}});
const row={id:'student',student_code:'SCH-STU1',name:'Test Student',class:'5',division:'Batch',roll_number:'1',ica:0,mca:80,fca:null,attendance_pct:0,attendance_recorded:false};
const props={rows:[row],selectedIds:[],onSelect:()=>{},onView:()=>{}};
let html=renderToStaticMarkup(React.createElement(StudentListTable,props));
for(const heading of ['Student ID','Student Name','Division / Section','Attendance','ICA','IMF','FCA'])assert.ok(html.includes(heading));
assert.ok(html.includes('View Test Student'));assert.ok(!html.includes('Edit Test Student'));assert.ok(!html.includes('Delete Test Student'));
assert.ok(html.includes('overflow-auto'));assert.ok(html.includes('>0</td>'));assert.ok(html.includes('>—</td>'));
html=renderToStaticMarkup(React.createElement(StudentListTable,{...props,onEdit:()=>{}}));assert.ok(html.includes('Edit Test Student'));assert.ok(!html.includes('Delete Test Student'));
html=renderToStaticMarkup(React.createElement(StudentListTable,{...props,onDelete:()=>{}}));assert.ok(html.includes('Delete Test Student'));assert.ok(!html.includes('Edit Test Student'));
let allowed=false,visible=true,calls=0,action;
const createServerFn=()=>({inputValidator(validate){return {handler(fn){return args=>fn({data:validate(args.data)});}};}});
const handlers=await load('src/lib/performance.functions.ts',{'./paging-compat.server':{COMPAT_READS:new Set(),readWithoutPagingRpc:()=>{throw new Error('Unexpected fallback');}},'@tanstack/react-start':{createServerFn},'./app-access.server':{requirePermission:async(token,module,requested)=>{action=requested;if(!allowed)throw new Error('Denied');return {role:'trainer',schoolIds:[],allSchools:false};},adminDb:async()=>{calls++;return {rpc:async()=>({data:{rows:[],total:0},error:null})};}},'./access-control':{canSeeSchool:()=>visible}});
const school='11111111-1111-1111-1111-111111111111',id='22222222-2222-2222-2222-222222222222';
const base={token:'test',module:'students',schoolId:school};
for(const [fn,data] of [['deleteStudentDetails',{...base,ids:[id]}],['saveStudentDetails',{...base,id,values:{name:'Student',class:'5',division:'A',roll_number:'1',photo_url:null}}],['updateStudentGrouping',{token:'test',schoolId:school,ids:[id],values:{class:'6'}}]]){await assert.rejects(()=>handlers[fn]({data}));assert.equal(calls,0);}
allowed=true;visible=false;await assert.rejects(()=>handlers.deleteStudentDetails({data:{...base,ids:[id]}}));assert.equal(calls,0);
visible=true;await handlers.deleteStudentDetails({data:{...base,ids:[id]}});assert.equal(action,'delete');assert.equal(calls,1);
console.log('PASS: shared table headings/overflow, zero and missing values, View-only / Edit-only / Delete-only rendering, server action denial and assigned-school denial before database access');
