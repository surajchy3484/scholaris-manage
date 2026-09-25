# Performance audit and rollout — 25 September 2026

## Status

Code changes prepared against main commit `5ac65c2ddb114b3b0b8763e8b4991b1d0ba2d125`. Integrated subsequent main commits through `c5618d7` (bulk student actions and action-level permissions), preserving published history with a merge. Select All retrieves all matching IDs on demand; changing search/class/division clears selection, including an in-flight selection request. Bulk actions use batches of 250 and refresh data after partial failures. No production records, cloud plans, storage permissions, or hosting configuration were changed. Apply the migration before deploying this application version. Production database/hosting console access was not available for quota checks or measurement.

## Audit and changes

| Bottleneck | Change |
| --- | --- |
| Master grids fetched entire tables before client pagination/search/sort | Server pagination (25 default, 250 maximum), escaped search, whitelisted sort keys, stable ID tie-breakers, school scoping and existing module authorization |
| Student page fetched a capped request and rendered every returned student | 50 students per page; database search/sort/class/division filters; separate complete filter facets |
| Dashboard downloaded student IDs to count them | Database relationship counts, retaining complete school pagination |
| Clicker loaded questions separately for every assessment | Retrieve only question number and correct answer for assessments visible on the current page; cached by assessment set |
| Export data constructed during ordinary renders | Construct on demand; complete filtered master exports fetch all pages; student/attendance exports no longer stop at one request's limit |
| Repeated growing-array copies in grouping and scans per school | Append to map groups and group by school once; identical report results |
| Repeated attendance scans during student export | One pass attendance totals map; ZIP student lookups use a map |
| Spreadsheet parsing blocked the UI | Transfer parsing to a short-lived worker; terminate on completion/error/timeout; load export spreadsheet code on demand |
| Student import sent one unbounded insert and client-generated codes | 250-row server-authorized batches; school row lock serializes imports, database code allocation, skip existing class/division/roll identities, progress, safe retry and bounded preview |
| Manual student code lookup silently stopped at 1,000 | Read every code page; database uniqueness still handles races with other writers |
| Backup exported only the first request; restore deleted current data | Complete ordered pagination; validate all backup tables before writing; insert missing IDs in batches of 250; preserve existing records and disclose partial failure |
| Cached results survived account changes | Clear query cache when the access token changes, including cross-tab changes |

Existing visual design, photo links, score calculations and report content are retained. Attendance views still fetch the full roster on demand to preserve existing workflows. Full PDF/Excel exports still process all matching records, not only the visible page. No automatic data or file deletion was introduced.

## Measured validation

Local Node benchmark, 20,000 students, 200 schools, with all students in one class/division (a stress case). Single measured run in the current execution environment; results are not production SLAs. The benchmark compares the previous commit's actual functions with the changed functions and asserts identical output.

| Calculation | Before | After |
| --- | ---: | ---: |
| Class report grouping/aggregation | 14,108.25 ms | 20.77 ms |
| School report aggregation | 81.69 ms | 9.55 ms |

The 10,001-row embedded PostgreSQL test covers paging past 1,000, exact totals, numeric roll sorting, search escaping, assigned-school isolation, dynamic question columns, import duplicate skipping/retry, anonymous RPC denial and migration reapplication. Twenty simultaneous client requests completed in 660 ms in one local run; PGlite queues execution, so this does **not** establish production database concurrency capacity.

The existing visual analytics regression suite passed with 50,000 synthetic students (2,346 ms in this environment). A separate data-safety test verifies complete reads, restore batching, unchanged existing rows, retry safety, validation before writes and worker spreadsheet parsing.

A 10,000-student school now returns 50 student records for the first page instead of up to 1,000 in the old capped request: 95% fewer student records per initial student-list request. This is a record-count comparison, not a measured latency or byte reduction; facets and school metadata are additional requests.

Production build passes. Repository-wide TypeScript checking retains pre-existing failures in `master.functions.ts` (generated database types omit `assessment_results`) and the root route error component's `unknown`/`Error` signature. No new type errors should be accepted. Build warnings about large chart/main chunks and some ineffective dynamic imports remain. Total emitted bundle bytes include a new worker copy of the spreadsheet parser; no claim of a smaller total bundle or faster live initial navigation is made.

Reproduce:

```sh
npm run build
npx tsc --noEmit
npm run test:analytics
node scripts/test-data-safety.mjs
node scripts/benchmark-performance.mjs
# Install PGlite outside the app dependency tree, then:
PGLITE_ROOT=/absolute/path/to/node_modules/@electric-sql/pglite node scripts/test-performance.mjs
```

## Database and hosting rollout

1. Confirm a recent provider database backup and perform a restore rehearsal into a separate environment. The app JSON export covers only schools, students and attendance, not assessments, accounts, sessions, scores or Drive files.
2. Inspect real table sizes, existing indexes, extension schema, active workload and provider plan. `scripts/storage-audit.sql` contains read-only usage queries. It reports usage, not plan capacity.
3. Apply `supabase/migrations/20260925090000_performance_paging.sql` in staging and exercise admin/trainer access, filters, exports, imports and all report types. RPC execution is revoked from anonymous/authenticated client roles; server handlers require module permissions and assigned school access.
4. The migration is additive, but regular index creation can block writes. For very large live tables, have the operator create the listed indexes with `CREATE INDEX CONCURRENTLY IF NOT EXISTS` **outside a transaction**, then apply the migration during a maintenance window. The matching names cause the migration to skip existing indexes. Confirm pg_trgm lives in `extensions` before using the supplied operator classes. No live migration was run here.
5. Deploy code only after the RPCs are available. Verify worker asset delivery/CSP, desktop/mobile paging, search, sorting, selection across pages, every matching row in exports, attendance completion, and interrupted-import retries.
6. Load-test staging using realistic record sizes and concurrent authenticated admin/trainer users. Measure p50/p95 route time, first usable render, request counts/bytes, database query plans, CPU, connections and memory. No authenticated browser QA or production multi-user load test was performed in this workspace.
7. Roll back application code if needed while leaving additive indexes/functions in place. Do not restore the old destructive restore workflow over real data. A completed batch remains committed if a later batch fails; retry skips matching identities.

## Storage capacity and recovery

**Available database, object storage and Google Drive capacity: not verified. Storage increase: not performed.** Repository source does not establish purchased capacity, free space, auto-expansion settings, backup retention or recovery point guarantees. Capacity changes require the account owner/operator's provider console and plan/budget information.

The app uses Supabase/PostgreSQL. New student photos already go to Google Drive and database records keep links. Existing inline photos and school images remain intact; no automatic move or deletion was attempted. The user previously specified that school pictures are separate from Drive. Any move of school images should use a private object store with authenticated uploads and controlled downloads, plus a verified migration manifest and recovery copy. Do not change bucket permissions to public simply to improve speed.

After checking measured usage, select sufficient database disk, compute, connections and file quota; set usage alerts at agreed thresholds (for example 70/85/95%). Verify whether the chosen provider plan supports automatic disk growth and its spending cap rather than assuming it does. Enable provider backups/PITR where the plan supports them, agree retention/RPO/RTO, and test recovery in a separate project. Back up file content separately; database backups do not restore Drive files. Keep exported backups restricted to authorized operators.

## Remaining limits

- Full analytics/PDF generation, full exports, attendance rosters and assessment dropdowns can still require large datasets. Very large workloads need server aggregates and streaming/job-based exports rather than retaining all results in browser memory.
- Exact counts, broad substring searches (including numeric-to-text and JSON answer search), dynamic column discovery, and deep OFFSET pages can remain expensive. Measure production plans before adding further indexes; consider cursor pagination and cached aggregates as growth requires.
- Indexes consume disk and add write cost. Disk quota is not increased by creating indexes.
- Batches and paged exports are not a global snapshot. Concurrent edits can change offset-based results; formal backup/recovery needs a provider-consistent snapshot.
- The import lock serializes this import endpoint, not legacy manual writers. Existing unique student codes prevent silent overwrites; a race may fail a batch and require retry. Duplicate identities already in the database are not deleted or rewritten.
- Existing direct-client CRUD policies, legacy access paths and PWA offline HTML caching need a separate end-to-end security review. These changes enforce permissions on the new endpoints, but are not a claim that every existing path has been audited or secured.
