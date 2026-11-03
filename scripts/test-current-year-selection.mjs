import assert from "node:assert/strict";
import fs from "node:fs/promises";
import ts from "typescript";
const source = await fs.readFile("src/lib/academic-year.ts", "utf8");
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { chooseAcademicYear, getAcademicYear, setAcademicYear, resetAcademicYear } = await import(
  `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`
);
const years = [
  { id: "2026", is_current: true },
  { id: "2027-28", is_current: false },
];
assert.equal(chooseAcademicYear(years), "2026");
assert.equal(chooseAcademicYear(years, "old-label", "2026"), "2026");
assert.equal(chooseAcademicYear(years, "2027-28", "2026"), "2027-28");
assert.equal(
  chooseAcademicYear(
    [
      { id: "2026", is_current: false },
      { id: "2027-28", is_current: true },
    ],
    "2026",
    "2026",
  ),
  "2027-28",
);
assert.equal(chooseAcademicYear([{ id: "2028-29", is_current: true }], "2026", "2026"), "2028-29");
assert.equal(chooseAcademicYear([]), undefined);
assert.equal(getAcademicYear(), undefined, "SSR resolves year on server");
const values = new Map();
let events = 0;
globalThis.window = {
  dispatchEvent() {
    events++;
  },
};
globalThis.sessionStorage = {
  getItem: (key) => values.get(key),
  setItem: (key, value) => values.set(key, value),
  removeItem: (key) => values.delete(key),
};
setAcademicYear("2028-29");
assert.equal(getAcademicYear(), "2028-29");
assert.equal(events, 1);
resetAcademicYear();
assert.equal(getAcademicYear(), undefined);
console.log(
  "PASS: active year default, stale selection, explicit historical selection, active-year switch and account reset",
);
