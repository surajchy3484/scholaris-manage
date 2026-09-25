import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import ts from "typescript";
const compile = async (file) =>
  ts.transpileModule(await readFile(new URL(`../${file}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
const url = (code) => `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
const engineURL = url(await compile("src/lib/visual-analytics.ts"));
const {
  prepareAnalytics,
  buildAnalyticsView,
  buildSchoolComparison,
  areas,
  mean,
  distribution,
  classify,
  validThresholds,
  DEFAULT_THRESHOLDS,
} = await import(engineURL);
const { analyticsReport, schoolPerformanceReport } = await import(
  url(
    (await compile("src/lib/visual-analytics-report.ts")).replace(
      '"./visual-analytics"',
      JSON.stringify(engineURL),
    ),
  )
);
const student = (id, school = "school1", klass = "5", division = "A") => ({
  id,
  school_id: school,
  name: `Student ${id}`,
  roll_number: id,
  class: klass,
  division,
  student_code: id,
});
const assessment = (id, date = "2026-01-01") => ({
  id,
  assessment_id: id,
  name: id,
  total_questions: 2,
  subject: "Science",
  date,
  school_id: "school1",
});
const question = (id, no, parameter = "Reasoning") => ({
  id: `${id}-${no}`,
  assessment_id: id,
  question_no: no,
  correct_answer: "A",
  subject: null,
  parameter,
  topic: "Matter",
  chapter: "Materials",
});
const record = (id, s, aid, score, answers = { S1: "A", S2: "B" }) => ({
  id,
  student_id: s,
  assessment_id: aid,
  school_id: "school1",
  score,
  correct_rate: (score / 2) * 100,
  answers,
  updated_at: "2026-01-01",
  class: "5",
  section: "A",
  roll_number: s,
});
const students = [
  student("a"),
  student("b"),
  student("c"),
  student("other", "school2"),
  student("d", "school1", "6"),
];
const assessments = [
  assessment("Later", "2026-02-01"),
  assessment("Early"),
  assessment("Undated", null),
];
const questions = assessments.flatMap((a) => [question(a.id, 1), question(a.id, 2, "Recall")]);
const records = [
  record("1", "a", "Early", 1),
  record("2", "b", "Early", 1),
  record("3", "a", "Later", 2, { S1: "A", S2: "A" }),
  record("4", "d", "Early", 0),
  record("5", "other", "Early", 2),
  record("6", "missing", "Early", 2),
];
const data = prepareAnalytics(students, assessments, questions, records);
assert.equal(data.excluded, 2, "cross-school and missing identities excluded");
const view = buildAnalyticsView(data, "school1", "5|A");
assert.equal(view.summary.students, 3);
assert.equal(view.summary.assessed, 2);
assert.equal(view.summary.assessments, 2);
assert.equal(view.school.assessed, 3);
assert.equal(view.classes.length, 2, "context keeps other classes");
assert.equal(view.compare.length, 3, "includes unassessed students");
assert.equal(view.compare[2].score, null);
assert.deepEqual(
  view.trend.map((t) => t.assessment.id),
  ["Early", "Later"],
);
assert.equal(view.parameters.find((p) => p.name === "Reasoning").rate, 100);
assert.equal(view.parameters.find((p) => p.name === "Recall").responses, 3);
assert.equal(
  view.parameters.find((p) => p.name === "Recall").questions,
  2,
  "unique questions differ from responses",
);
assert.ok(Math.abs(view.parameters.find((p) => p.name === "Recall").rate - 100 / 3) < 1e-9);
assert.equal(
  view.attempts.find((a) => a.student.id === "a" && a.assessment.id === "Early").rank,
  1,
);
assert.equal(
  view.attempts.find((a) => a.student.id === "b").rank,
  1,
  "ties retain competition rank",
);
assert.equal(buildAnalyticsView(data, "school1", "5|A", "a").attempts.length, 2);
assert.equal(mean([]), null);
assert.equal(mean([0, null]), 0);
assert.equal(classify(85).status, "Strong");
assert.equal(classify(80).status, "Good");
assert.equal(classify(65).status, "Needs Attention");
assert.equal(classify(64).status, "Weak");
assert.equal(classify(null).status, "No data");
assert.equal(validThresholds({ strong: 70, good: 80, attention: 60 }), false);
assert.deepEqual(
  distribution([0, 39.9, 40, 60, 80, 90, 100, null]).map((r) => r.count),
  [2, 1, 1, 1, 2],
);
const dup = prepareAnalytics(students, assessments, questions, [
  records[0],
  { ...records[0], id: "new", updated_at: "2026-03-01", score: 2 },
]);
assert.equal(dup.duplicates, 1);
assert.equal(dup.attempts[0].score, 100);
const blank = prepareAnalytics(students, assessments, questions, [
  { ...records[0], answers: { " s1 ": " a ", S2: "" } },
]);
assert.equal(areas(blank.attempts, "subject")[0].rate, 50);
const summary = prepareAnalytics(students, assessments, questions, [
  { ...records[0], answers: {} },
]);
assert.equal(
  areas(summary.attempts, "subject").length,
  0,
  "summary-only imports never invent breakdowns",
);
const fallback = prepareAnalytics(students, assessments, questions, [
  { ...records[0], student_id: null },
]);
assert.equal(fallback.attempts[0].student.id, "a");
const ambiguous = prepareAnalytics(
  [...students, { ...student("duplicate"), roll_number: "a" }],
  assessments,
  questions,
  [{ ...records[0], student_id: null }],
);
assert.equal(ambiguous.excluded, 1);
const opts = {
  school: "School <script>alert(1)</script>",
  classLabel: "Class 5 · A",
  thresholds: DEFAULT_THRESHOLDS,
  remarks: "Review <img src=x onerror=alert(1)>",
  excluded: 2,
  duplicates: 0,
  sessions: [{ unit: "Unit-1", complete: 3, total: 4 }],
};
const html = analyticsReport(view, opts);
assert.ok(!html.includes("<script>"));
assert.ok(html.includes("&lt;script&gt;"));
assert.ok(html.includes("15. Teacher Remarks"));
assert.ok(html.includes("Student c"));
// Complete export and large dataset regression: no top-N student or 1,000-row truncation.
const largeStudents = Array.from({ length: 50000 }, (_, i) => student(String(i)));
const largeRecords = largeStudents.map((s, i) => record(`r${i}`, s.id, "Early", i % 3));
const start = performance.now();
const large = buildAnalyticsView(
  prepareAnalytics(largeStudents, assessments, questions, largeRecords),
  "school1",
  "5|A",
);
assert.equal(large.compare.length, 50000);
assert.equal(large.summary.assessed, 50000);
console.log(`50,000 student analytics completed in ${Math.round(performance.now() - start)}ms`);
const fixtureStudents = Array.from({ length: 42 }, (_, i) => student(`Learner-${i + 1}`));
const fixture = buildAnalyticsView(
  prepareAnalytics(
    fixtureStudents,
    assessments,
    questions,
    fixtureStudents.flatMap((s, i) => [
      record(`e${i}`, s.id, "Early", i % 3),
      record(`l${i}`, s.id, "Later", 2, { S1: "A", S2: "A" }),
    ]),
  ),
  "school1",
  "5|A",
);
const report = analyticsReport(fixture, {
  ...opts,
  school: "SchoolRise Learning Centre",
  remarks: "Review Matter in small groups. Reassess after two practice sessions.",
});
assert.ok(report.includes("Learner-42"));
assert.ok(report.includes("(continued)"));
if (process.env.ANALYTICS_PREVIEW)
  await writeFile(
    process.env.ANALYTICS_PREVIEW,
    `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:A4;margin:12mm}body{margin:0}</style></head><body>${report}</body></html>`,
  );
console.log("Analytics regression checks passed.");

const schoolRows = buildSchoolComparison(data, [
  { id: "school1", name: "Shared name", code: "ONE" },
  { id: "school2", name: "Shared name", code: "TWO" },
  { id: "empty", name: "Empty <school>", code: "EMPTY" },
]);
assert.equal(schoolRows.length, 3);
assert.equal(schoolRows[0].school.id, "school1");
assert.equal(schoolRows[0].students, 4);
assert.equal(schoolRows[0].assessed, 3);
assert.equal(schoolRows[0].score, 50);
assert.equal(schoolRows.find((r) => r.school.id === "school2").score, null);
assert.equal(schoolRows.find((r) => r.school.id === "empty").students, 0);
const schoolHtml = schoolPerformanceReport(
  schoolRows,
  DEFAULT_THRESHOLDS,
  "<script>remarks</script>",
);
assert.ok(schoolHtml.includes("Average score by school"));
assert.ok(schoolHtml.includes("Correct rate by school"));
assert.ok(schoolHtml.includes("Schools grouped by performance"));
assert.ok(schoolHtml.includes("Shared name (ONE)"));
assert.ok(schoolHtml.includes("Shared name (TWO)"));
assert.ok(schoolHtml.includes("Empty &lt;school&gt;"));
assert.ok(!schoolHtml.includes("<script>"));
assert.ok(schoolPerformanceReport([], DEFAULT_THRESHOLDS, "").includes("0 schools"));
const manySchools = Array.from({ length: 40 }, (_, i) => ({
  ...schoolRows[0],
  school: { id: `s${i}`, name: `School ${i}`, code: `C${i}` },
}));
assert.ok(schoolPerformanceReport(manySchools, DEFAULT_THRESHOLDS, "").includes("School 39 (C39)"));
console.log(
  "School comparison checks passed: complete school coverage, isolated totals, missing results, and escaping.",
);
