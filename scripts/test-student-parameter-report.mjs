import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const url=code=>`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const compile=async path=>ts.transpileModule(await readFile(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const engine=url(await compile('src/lib/visual-analytics.ts'));
const {prepareAnalytics,buildAnalyticsView,parameterPerformance,DEFAULT_THRESHOLDS}=await import(engine);
const {analyticsReport}=await import(url((await compile('src/lib/visual-analytics-report.ts')).replace('"./visual-analytics"',JSON.stringify(engine))));
const students=['one','two'].map(id=>({id,name:id,school_id:'school',class:'5',division:'A',roll_number:id}));
const assessment={id:'a',assessment_id:'ASM-0001',name:'ICA',school_id:'school',class:'5',total_questions:4,subject:'Science'};
const snapshot=[
 {question_no:1,correct_answer:'A',parameter:'Reasoning',topic:'Force'},
 {question_no:2,correct_answer:'B',parameter:'Reasoning',topic:'Motion'},
 {question_no:3,correct_answer:'C',parameter:'Recall',topic:'Plants'},
 {question_no:4,correct_answer:'D',parameter:null,topic:'<script>unknown</script>'},
];
const record={id:'r1',student_id:'one',assessment_id:'ASM-0001',school_id:'school',score:1,correct_rate:25,total_questions:4,evaluated_at:'2026-10-22',updated_at:'2026-10-22',question_snapshot:snapshot,answers:{S1:'A',S2:'A',S3:'',S4:'A'}};
const data=prepareAnalytics(students,[assessment],[],[
 {...record,id:'old',updated_at:'2026-10-21',answers:{S1:'B'}},record,
 {...record,id:'r2',student_id:'two',answers:{S1:'A',S2:'B',S3:'C',S4:'D'}},
]);
const view=buildAnalyticsView(data,'school','5|A','one');
const rows=parameterPerformance(view.attempts);
const reasoning=rows.find(r=>r.name==='Reasoning');
assert.deepEqual([reasoning.total,reasoning.correct,reasoning.incorrect,reasoning.unanswered,reasoning.rate],[2,1,1,0,50]);
assert.deepEqual(reasoning.topics,['Science / Motion']);
assert.equal(rows.find(r=>r.name==='Recall').unanswered,1);
assert.equal(rows.find(r=>!r.mapped).name,'Parameter not recorded');
assert.equal(data.duplicates,1);
const options={school:'School',classLabel:'Class 5',student:true,thresholds:DEFAULT_THRESHOLDS,remarks:'',excluded:0,duplicates:1};
const html=analyticsReport(view,options);
for(const text of ['2. Parameter-wise Performance','3. Areas for Improvement','50.0%','flashcards','step by step','Science / Motion','Unanswered','Parameter not recorded','5. Teacher Remarks'])assert(html.includes(text),text);
assert(!html.includes('<script>'));
assert(!html.includes('Science / Force'),'correct topic is not recommended for remediation');
const empty=buildAnalyticsView(prepareAnalytics(students,[assessment],[],[{...record,evaluated_at:null,question_snapshot:null,answers:{}}]),'school','5|A','one');
assert(analyticsReport(empty,options).includes('Summary scores alone cannot identify improvement areas'));
const strong=buildAnalyticsView(data,'school','5|A','two');
assert(analyticsReport(strong,options).includes('No recorded parameter falls below'));
assert(!analyticsReport(view,{...options,student:false}).includes('3. Areas for Improvement'));
assert(analyticsReport(view,{...options,thresholds:{strong:50,good:40,attention:20}}).includes('Recall — Very High'));
console.log('PASS: parameter counts, unanswered handling, snapshots, duplicate suppression, student isolation, missed topics, guidance, configurable thresholds, escaping and empty/strong states.');
// Exercise the hook with the existing all-schools student selection.
const source=(await readFile('src/components/exam/visual-analytics.tsx','utf8')).split('export function VisualAnalytics(')[0];
let hookCode=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const reportModule=url((await compile('src/lib/visual-analytics-report.ts')).replace('"./visual-analytics"',JSON.stringify(engine)));
let queryError=false;
globalThis.__parameterQuery=options=>({data:options.queryKey[0]==='visual-analytics-source'?{assessments:[assessment],questions:[],records:[record]}:[],isFetching:false,isError:queryError});
const replacements={
 '@/lib/academic-year':url('export const getAcademicYear=()=>"2026";'),
 'react':url('export const useMemo=f=>f(); export const useState=v=>[v,()=>{}];'),
 '@tanstack/react-query':url('export const useQuery=o=>globalThis.__parameterQuery(o);'),
 '@/lib/master':url('export const fetchAssessments=()=>[];export const fetchClickerRecords=()=>[];export const fetchQuestions=()=>[];'),
 '@/lib/sessions':url('export const UNITS=[];export const fetchDivisionSessions=()=>[];'),
 '@/lib/visual-analytics':engine,
 '@/lib/visual-analytics-report':reportModule,
};
for(const [from,to] of Object.entries(replacements))hookCode=hookCode.replaceAll(JSON.stringify(from),JSON.stringify(to));
const {useVisualAnalytics}=await import(url(hookCode));
const props={students,schools:[{id:'school',name:'Actual School',code:'S'}],schoolId:'all',schoolName:'All schools',classKey:'all',studentId:'one',mode:'student'};
const result=useVisualAnalytics(props);
assert(result.ready);assert(result.html.includes('Parameter-wise Performance'));
assert(result.html.includes('Actual School'));
assert.deepEqual(result.exportView.students.map(s=>s.id),['one']);
queryError=true;assert.equal(useVisualAnalytics(props).ready,false);
console.log('PASS: all-schools student export includes isolated parameter analysis; query errors block export.');
const classHtml=analyticsReport(buildAnalyticsView(data,'school','5|A'),{...options,student:false,academicYear:'2026',schoolCode:'REAP-1',location:'Kalwa',generatedAt:'22/10/2026'});
for(const text of ['Class-wise Performance Report','2026','REAP-1','Kalwa','Executive Summary &amp; Coverage','Class &amp; Division Comparison','Assessment-wise Results &amp; Trend','Student Performance Distribution','Subject-wise Performance','Parameter-wise Performance','Topic &amp; Chapter Review','Improvement Priorities &amp; Action Plan','Session Delivery Context','Student Performance Register','Calculation Rules &amp; Data Quality','Teacher Remarks &amp; Review','Prepared by','Reviewed by'])assert(classHtml.includes(text),text);
assert(!classHtml.includes('<script>'));
const expanded=prepareAnalytics([...students,{...students[0],id:'class-six',name:'OtherClassOnly',class:'6'}],[assessment],[],[record]);
const scopedClass=analyticsReport(buildAnalyticsView(expanded,'school','5|A'),{...options,student:false});
assert(!scopedClass.includes('OtherClassOnly'),'class register never includes a different class');
assert(scopedClass.includes('1 of 2 enrolled students'));
const schoolHtml=analyticsReport(buildAnalyticsView(expanded,'school'),{...options,student:false,classLabel:'All classes'});
assert(schoolHtml.includes('School-wise Performance Report'));
assert(schoolHtml.includes('OtherClassOnly'));
assert(schoolHtml.includes('1 of 3 enrolled students'));
assert(schoolHtml.includes('Check missing results'));
const noDataHtml=analyticsReport(buildAnalyticsView(prepareAnalytics([],[],[],[]),'school'),{...options,student:false,classLabel:'All classes'});
assert(!noDataHtml.includes('NaN'));assert(!noDataHtml.includes('Infinity'));
assert(noDataHtml.includes('no valid scores'));
console.log('PASS: professional cohort fields, school/class titles, coverage counts, class isolation, complete school register, escaping and empty-state denominators.');
