import fs from "node:fs/promises";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import ts from "typescript";
const load = async (source) => {
  const ast = ts.createSourceFile("exam.ts", source, ts.ScriptTarget.Latest, true);
  const printer = ts.createPrinter();
  const isolated = ast.statements
    .filter((s) => !ts.isImportDeclaration(s))
    .map((s) => printer.printNode(ts.EmitHint.Unspecified, s, ast))
    .join("\n");
  const js = ts.transpileModule(isolated, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
};
const old = await load(
  execFileSync("git", ["show", "5ac65c2ddb114b3b0b8763e8b4991b1d0ba2d125:src/lib/exam.ts"], {
    encoding: "utf8",
  }),
);
const current = await load(await fs.readFile("src/lib/exam.ts", "utf8"));
const students = Array.from({ length: 20000 }, (_, i) => ({
  id: String(i),
  school_id: String(i % 200),
  class: "5",
  division: "A",
  attendance_pct: 80,
  ica: i % 101,
  mca: 75,
  fca: null,
}));
const data = { students, schools: Array.from({ length: 200 }, (_, i) => ({ id: String(i) })) };
const measure = (fn) => {
  const start = performance.now();
  const value = fn();
  return { ms: Math.round((performance.now() - start) * 100) / 100, value };
};
const results = {
  fixture: { students: students.length, schools: data.schools.length },
  measurements: {},
};
for (const [name, arg] of [
  ["buildClassReports", students],
  ["buildSchoolReports", data],
]) {
  const before = measure(() => old[name](arg)),
    after = measure(() => current[name](arg));
  assert.deepEqual(after.value, before.value);
  results.measurements[name] = { before_ms: before.ms, after_ms: after.ms };
}
console.log(JSON.stringify(results, null, 2));
