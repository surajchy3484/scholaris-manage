# REAP Main Dashboard: calculations, rollout and rollback

## Scope

The existing `/` route defaults to Main Dashboard. The School Dashboard tab retains all school CRUD, clusters, imports and navigation. Existing authentication, academic-year boundary, profile menu and Session Status screens remain. The supplied REAP logo is reused. No student, attendance, session, score, assignment or academic-year data is rewritten.

## Exact attendance rules

- Timezone: Asia/Kolkata for automatic current-week selection; Monday–Sunday, inclusive. Previous/next and date selection only change read filters. Current week follows rollover while the page is open.
- Source: `attendance` joined to `student_enrollments` for the selected academic year, school, class and division. School authorization is resolved server-side before the RPC is called.
- Attendance-session identity in the current schema is `(student_id, date)` within the selected year; there is no separate attendance-session ID. A defensively duplicated mark is resolved by latest `created_at`, then `id`. Present and absent are the only recognized marks.
- Expected for a recorded class/division/day = distinct students in that year's enrolled cohort. Present = distinct students marked present. Recorded = present + absent. Unmarked = expected − recorded; unmarked students are NOT described as absent, though they remain in the denominator of a recorded cohort.
- A cohort/day with no marks contributes neither numerator nor denominator; it is not assumed to have met. Empty dates/schools show “Attendance Not Recorded.” Schools with some recorded cohorts can still have unrecorded cohorts; the class/division drilldown exposes them.
- Daily percentage = sum(present) / sum(expected) × 100. Weekly/school percentage = sum of present student-days / sum of expected student-days × 100, rounded to one decimal. This is a weighted ratio, NOT a mean of rounded daily percentages. Weekly counts are student-days, NOT distinct children.
- No school calendar, holiday calendar, effective enrollment dates or attendance session timetable exists in this schema. Consequently this is a **recorded-cohort attendance rate**, not an all-scheduled-days rate. A current-year roster edit can change a recomputed denominator. Historical marks and year associations are never overwritten.
- The denominator includes all statuses in the selected year's enrollment snapshot, consistent with the app's year roster; current enrollment status must not retrospectively erase past attendance. A true as-of denominator requires effective-dated enrollment records.

## Planned delivery source and identity

The app's existing session UI states that every division of a school/class shares its `sessions` list. Therefore the baseline plan is one existing session assignment × one distinct enrolled division of that school/class/year. Completion is the latest `session_division_status` for that assignment/division. This preserves the same delivery grain as the existing editor; it is not one global count per activity and not one count per student.

`session_assignment_targets.session_count` and `class_session_plans.session_count` store unit/class **activity counts**, not a named activity timetable. The assignment functions materialize those counts into school/class session records. Lowering a target intentionally retains existing records. The dashboard shows stored targets beside materialized counts in its calculation details so such discrepancies remain visible. It does not arbitrarily choose which historical sessions to exclude or distribute an aggregate target among invented activities. Division-specific targets are shown explicitly; the current editor still shares a class's session list across divisions. Reconcile targets before treating them as an approved delivery schedule.

- Planned = number of applicable assignment/division pairs.
- Completed = pairs with current status `complete` (optionally updated within the selected UTC date range).
- Remaining = planned − completed. With a date filter, this also includes completions outside the selected period and is labeled “remaining plan,” not a claim that all are currently pending.
- Completion % = completed/planned × 100. Zero plan → Not Planned; positive plan and zero complete → Not Conducted; 0–<75% → Less Conducted; 75–<100% → Frequently Conducted; 100% → Completed. Classification uses the unrounded ratio.
- Unique schools conducted = distinct schools with a qualifying completed division delivery. Five schools completing one mapped activity retain five or more division-level deliveries and one activity identity.
- No repeated-delivery history, actual delivery date, due date or missed state exists. `updated_at` is a status-edit timestamp, not a claimed delivery date. Date filtering is explicitly labeled accordingly. No overdue counts or red bars are fabricated.

### Optional confirmed shared activity mapping

The additive `session_activities` catalog and nullable `sessions.activity_id` allow an administrator to explicitly map confirmed copies of the same activity across schools. Legacy records are **not** merged by name, topic, position or `class_plan_id` (a class plan covers multiple activities). Unmapped rows retain their real session UUID and are marked in coverage notes. The activity/unit FK prevents cross-unit mapping; a unique index prevents duplicate mapped assignments for the same year/school/class/activity.

After reviewing the actual session records, use the database administration workflow to create a real activity and map its known assignments in a transaction. There is no automatic catalog backfill and no sample activity insertion. Roll back the transaction if the assigned units or delivery identities conflict. The application does not yet contain an activity-mapping editor; until mappings are confirmed, cross-school identity consolidation remains incomplete.

## Permissions and trainer meaning

- `dashboard:view` is required on the server. Attendance is returned only with `attendance:view`; session/trainer details only with `session_status:view`.
- Scope is intersected with existing `school_ids` / `all_schools`, centre (stored `schools.cluster_name`), school and trainer assignments. A supplied unauthorized school or trainer is rejected. Only admins can select other active trainers. User permissions are reloaded server-side per request.
- Trainers are associated through current `app_users.school_ids`; there is no separate trainer-to-delivery assignment or historical trainer roster. `updated_by` is deliberately NOT interpreted as delivery ownership. Shared schools can appear in several trainer rows; trainer totals must not be added together.
- There is no coordinator role, centre-active flag, staff photo/designation field or notification feed in this repository. Existing profile initials/name/role and menu are preserved. The dashboard does not invent personal photos, notification counts or additional permissions. “Active Centres” counts distinct stored clusters in the selected school scope.

## Performance

Roster/attendance aggregation happens in PostgreSQL. No student names or raw 50k-student roster crosses into the browser. Queries are year/school scoped and attendance is bounded to seven days. Sessions, statuses and targets use bounded concurrent pagination rather than the default 1,000-row cap. Browser queries are cached for 30 seconds and refreshed each minute; auth identity, year and all filters are in the cache key. Session charts scroll for long labels/lists. The database migration includes supporting indexes. Production-volume latency needs measurement against a staging copy before release.

## Migration and deployment

1. Back up the database and record the current application commit. Use a staging database with the existing migrations applied.
2. Apply **only** `supabase/migrations/20261010200000_reap_dashboard.sql` in a transaction. Do not replay prior academic-year reset scripts. This creates a catalog, nullable FK, indexes and a read-only aggregation function. It does not modify any existing row.
3. Run the fixture tests below. Reconcile a real school/week manually: present, absent, unmarked and expected by class/division, then sum student-days and compare the weighted percentage. Compare each unit's assignment rows, roster divisions, statuses and target audit. Verify both current and previous academic years.
4. Test admin, a trainer limited to one school, a user with no assigned schools, and a dashboard-only user. Verify denied school/trainer inputs and missing module access. Test all filters, week rollover, empty weeks, a zero-completion activity and confirmed shared-activity mapping. Verify live UI on mobile and desktop.
5. Deploy the review branch only after staging reconciliation. A missing RPC yields a setup error and a Retry action; it never silently falls back to sample/zero data. Existing School Dashboard remains accessible in its tab.

Tests executed in the development environment:

- `node scripts/test-dashboard.mjs`: pure calculation, deduplication, mapping, zero plans, dates and week rollover tests.
- `PGLITE_MODULE=/path/to/@electric-sql/pglite/dist/index.js node scripts/test-dashboard-sql.mjs`: executes the migration against an isolated PostgreSQL-compatible fixture database and verifies SQL aggregation, school/class/division/year/date isolation and denial of anonymous/authenticated RPC execution. Install PGlite in a temporary directory; no production connection is used.
- `npm run build`: successful production build.
- Targeted ESLint: successful for the new dashboard files and index route.
- `npx tsc --noEmit`: blocked by three pre-existing TS2367 errors in `src/lib/universal-clicker.server.ts` (lines 53, 83, 90); no new dashboard errors.

**Not verified:** production database totals, production-volume query latency or authenticated end-to-end browser behavior. This environment contains public Supabase configuration but no private service-role/database credentials. No production migration has been applied. This branch must remain a draft until the staging gates above are complete.

## Rollback

1. Redeploy the previous application commit, or revert the dashboard commit with a normal new commit. Do not force-push or rewrite Lovable's connected history.
2. Leave the additive database objects in place: the previous application ignores them. This is the safest rollback and preserves any confirmed mappings made after release.
3. Optional cleanup, only after exporting `session_activities` and `(sessions.id, activity_id)` mappings and confirming no caller uses the RPC: drop the RPC, its dashboard-specific indexes, `sessions_activity_unit_fk`, the nullable `activity_id` column and catalog. Never drop or alter the source attendance, enrollment, session status, assignment target or academic-year tables.
4. Recheck existing login, school management, attendance entry and Session Status workflows. A rollback does not require any historical data restoration because this migration never rewrites that data.
