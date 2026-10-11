import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import { QueryClient, QueryObserver, hashKey } from "@tanstack/react-query";
const compile = async (path) =>
  ts.transpileModule(await readFile(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
const url = (code) => `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
const { createQueryRefreshQueue, queryAffectedByTables } = await import(
  url(await compile("src/lib/query-refresh.ts"))
);
assert(queryAffectedByTables(["exam-data", "2026"], new Set(["attendance"])));
assert(!queryAffectedByTables(["schools", "2026"], new Set(["attendance"])));
assert(queryAffectedByTables(["questions", "page"], new Set(["question_bank"])));
assert(queryAffectedByTables(["main-dashboard"], new Set(["student_enrollments"])));
assert(queryAffectedByTables(["anything"], new Set(["app_users"])));
assert(queryAffectedByTables(["anything"], new Set(["academic_years"])));
const client = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000, retry: false } },
});
let reportReads = 0;
client.setQueryData(["exam-data", "2026"], { version: 0 });
client.setQueryData(["schools", "2026"], []);
const observer = new QueryObserver(client, {
  queryKey: ["exam-data", "2026"],
  queryFn: async () => ({ version: ++reportReads }),
});
const stop = observer.subscribe(() => {});
const queue = createQueryRefreshQueue(client, 5);
for (let n = 0; n < 1000; n++) queue.enqueue("attendance");
await new Promise((resolve) => setTimeout(resolve, 30));
assert.equal(reportReads, 1, "1,000 attendance events should trigger one report refresh");
assert.equal(
  client.getQueryState(["schools", "2026"]).isInvalidated,
  false,
  "unrelated cached section stays fresh",
);
queue.enqueue("attendance");
queue.dispose();
await new Promise((resolve) => setTimeout(resolve, 15));
assert.equal(reportReads, 1, "unmounted queues must not run");
stop();
client.clear();
// Exercise the same page options used by hover prefetch and actual page hooks.
let calls = 0;
globalThis.__pageCall = () => {
  calls++;
  return Promise.resolve({ rows: [], total: 0 });
};
let source = await compile("src/lib/master-page-query.ts");
source = source
  .replace('"./academic-year"', JSON.stringify(url('export const getAcademicYear=()=>"2026";')))
  .replace('"./app-access"', JSON.stringify(url('export const getAccessToken=()=>"test-token";')))
  .replace(
    '"./performance.functions"',
    JSON.stringify(url("export const listMasterPage=()=>globalThis.__pageCall();")),
  )
  .replace('"./paging"', JSON.stringify(url(await compile("src/lib/paging.ts"))));
const { masterPageQueryOptions, initialMasterPageArgs } = await import(url(source));
for (const table of ["assessments", "questions", "clicker_records"]) {
  const defaults = initialMasterPageArgs(table);
  const hookArgs = {
    page: 0,
    pageSize: 25,
    search: "",
    sortKey: null,
    direction: "asc",
    subject: "",
    className: "",
    section: "",
    team: "",
    assessmentId: table === "clicker_records" ? "all" : undefined,
    examType: table === "questions" ? "" : undefined,
    minScore: undefined,
  };
  const warm = masterPageQueryOptions(table, defaults),
    page = masterPageQueryOptions(table, hookArgs);
  assert.equal(hashKey(warm.queryKey), hashKey(page.queryKey));
  await client.prefetchQuery(warm);
  await client.fetchQuery(page);
}
assert.equal(
  calls,
  3,
  "three section prefetches should satisfy three immediate page loads with no duplicate requests",
);
client.clear();
delete globalThis.__pageCall;
console.log(
  "Passed: 1,000 events → 1 affected refresh, unrelated caches retained, cleanup, account/year broad invalidation, and sidebar-prefetch/page request reuse.",
);
