import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const code = ts.transpileModule(await readFile("src/lib/dashboard-analytics.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { sessionMetrics, completionStatus, percentage, weekStart, addDays } = await import(
  `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
);
const s = (id, school = "one", activity = null) => ({
  id,
  school_id: school,
  activity_id: activity,
  unit: "Unit-1",
  class: "5",
  session_name: "Magnets",
  topic: "",
});
const cohorts = [
  { school_id: "one", class: "5", division: "A", students: 30 },
  { school_id: "one", class: "5", division: "B", students: 20 },
  { school_id: "two", class: "5", division: "A", students: 10 },
];
const status = (
  id,
  division,
  state = "complete",
  date = "2026-10-05T00:00:00Z",
  school = "one",
) => ({ session_id: id, school_id: school, division, status: state, updated_at: date });
let m = sessionMetrics([s("a"), s("a"), s("b")], cohorts, [status("a", "A"), status("a", "A")]);
assert.equal(m.length, 2);
assert.equal(m[0].planned, 2);
assert.equal(m[0].completed, 1);
assert.equal(m[0].percentage, 50);
assert.equal(m[1].status, "Not Conducted");
m = sessionMetrics([s("a", "one", "shared"), s("b", "two", "shared")], cohorts, [
  status("a", "A"),
  status("b", "A", "complete", undefined, "two"),
]);
assert.equal(m.length, 1);
assert.equal(m[0].planned, 3);
assert.equal(m[0].completed, 2);
assert.equal(m[0].schools, 2);
assert.equal(sessionMetrics([s("a")], [], [])[0].status, "Not Planned");
assert.equal(
  sessionMetrics([s("a")], cohorts, [
    status("a", "A"),
    status("a", "A", "pending", "2026-10-06T00:00:00Z"),
  ])[0].completed,
  0,
);
assert.equal(
  sessionMetrics([s("a")], cohorts, [status("a", "A", "complete", undefined, "other")])[0]
    .completed,
  0,
);
assert.equal(
  sessionMetrics([s("a")], cohorts, [status("a", "A")], { from: "2026-10-06" })[0].completed,
  0,
);
assert.equal(
  sessionMetrics([s("a")], cohorts, [status("a", "A")], { from: "2026-10-05", to: "2026-10-05" })[0]
    .completed,
  1,
);
assert.equal(sessionMetrics([s("a")], [...cohorts, cohorts[0]], [status("a", "A")])[0].planned, 2);
assert.equal(completionStatus(75, 100), "Frequently Conducted");
assert.equal(completionStatus(100, 1000), "Less Conducted");
assert.equal(completionStatus(5, 5), "Completed");
assert.equal(percentage(0, 0), null);
assert.equal(weekStart("2026-10-11"), "2026-10-05");
assert.equal(weekStart("2026-10-12"), "2026-10-12");
assert.equal(addDays("2026-12-28", 7), "2027-01-04");
console.log(
  "Dashboard calculation tests passed: identity, duplicates, zero plans, zero completion, shared activities, latest status, school scope, dates, thresholds, week rollover.",
);
