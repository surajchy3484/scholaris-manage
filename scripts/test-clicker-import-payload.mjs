import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from 'typescript';
const source = await fs.readFile('src/lib/clicker-import-payload.ts', 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { clickerImportPayload } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const row = {
  assessment_id:'ASM-0001',exam_type:'ICA',keypad_id:'1',student_id:'student',
  student_name:'Fixture',roll_number:'1',class:'Class 8',section:'A',team:null,
  answers:{S1:'A',S2:'B'}, _file:'8A_clicker.xlsx',_row:2,errors:[],duplicate:false,
  _existingId:'existing-result',_match:'update',_importSaved:false,
  score:999,correct_rate:999,ranking:999,question_snapshot:[{correct_answer:'D'}],
};
const expected = {
  assessment_id:'ASM-0001',exam_type:'ICA',keypad_id:'1',student_id:'student',
  student_name:'Fixture',roll_number:'1',class:'8',section:'A',team:null,
  answers:{S1:'A',S2:'B'},school_id:'school',school_name:'Fixture School',
};
assert.deepEqual(clickerImportPayload(row,{school_id:'school',school_name:'Fixture School'},'8'),expected);
assert.deepEqual(clickerImportPayload({...row,_existingId:null,_match:'matched',_file:'another.xlsx'}, {school_id:'school',school_name:'Fixture School'},'8'),expected);
assert.equal(clickerImportPayload(row,undefined,'8').school_id,null);
assert.equal(row.score,999);
console.log('PASS: insert/update payloads exclude filename, preview flags and calculated fields while retaining answers and assessment school context.');
