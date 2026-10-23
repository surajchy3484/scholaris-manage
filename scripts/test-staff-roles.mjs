import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from 'typescript';
const source = await fs.readFile('src/lib/access-control.ts','utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
const {APP_ROLES,normalizeRole,defaultPermissions,can,canSeeSchool}=await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
for(const role of APP_ROLES.filter(r=>r!=='admin')) {
  assert.equal(normalizeRole(role),role);
  const p={role,permissions:defaultPermissions(role),allSchools:false,schoolIds:['assigned']};
  assert.equal(can(p,'users','delete'),false);
  assert.equal(can(p,'main_dashboard'),false);
  assert.equal(canSeeSchool(p,'other'),false);
  assert.equal(canSeeSchool(p,'assigned'),true);
  p.permissions={main_dashboard:['view'],students:['view','add']};
  assert.equal(can(p,'main_dashboard'),true);
  assert.equal(can(p,'students','add'),true);
  assert.equal(can(p,'students','delete'),false);
}
assert.equal(normalizeRole('unknown'),'trainer');
assert.equal(can({role:'admin',permissions:{}},'users','delete'),true);
console.log('PASS: all staff roles retain their identity and require explicit module and school permissions.');
