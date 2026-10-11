# Class-wise session coverage

This release replaces only Main Dashboard's four Session-wise Completion graphs. Existing KPI, attendance, unit delivery table, trainer table, Session Status workflows and assessments remain available. The new section has independent Class 5–9, centre, trainer and coverage filters. The school filter in its detail dialog only filters that dialog. Assessment Master lazily opens the same reference panel for users with both Assessments and Session Status view permission.

## Catalogue and compatibility

The existing schema has school/class `sessions` and per-division `session_division_status`; its `class_session_plans` stores counts, not a named activity catalogue. Optional `session_activities` lacks class and academic-year scope. The new `session_catalogue` gives each unique academic year + class + unit + trimmed, case-insensitive session name + topic one UUID. No fuzzy matching, invented names or session-number guessing is used. Different topics, classes and years remain separate. Review spelling/topic inconsistencies before migration: inconsistent names remain separate definitions until deliberately reconciled.

Existing `sessions` rows are retained as compatibility school assignment/delivery references, each linked by `catalogue_id`. A scope foreign key prevents linking a delivery to a different class/year/unit. Existing manual entry/import remains operational: a trigger links each inserted school assignment to its common catalogue definition; it does not create repeated catalogue entries. Existing status IDs are not replaced. Catalogue definitions remain visible with zero completion, even after an old assignment is removed. School-specific session editing that changes its name/topic intentionally links that assignment to the matching/new definition; it does not silently rename every other school's curriculum.

## Counting rules

- Eligible schools have at least one enrollment for the selected class/year in the user's authorized school scope, further narrowed by centre/trainer. All are eligible for the common class catalogue, including schools that have not submitted a session record.
- An explicit `session_school_assignments` row with `status='cancelled'` excludes that school **for that catalogue session only**. An absent assignment override defaults to active. Cancellation belongs to the year-specific catalogue ID; it cannot cancel another year's assignment. This release does not add cancellation editing to the existing assignment UI.
- Legacy records have no explicit school-wide status. The read-only `school_delivery` projection inside the RPC reports Completed only if **every distinct roster division** has a latest `complete` record for the school/common session/year. This is a conservative roll-up, not an assumption that completing one division completes the school.
- Duplicate legacy session rows/submissions collapse by common session + school + division, taking latest `updated_at`, then status UUID as a deterministic tie-breaker. A later Pending reverses that division's completion. Multiple students in one division never multiply deliveries.
- Missing any division gives school status Not Recorded; all divisions recorded but at least one Pending gives Not Completed. The detail panel shows the individual divisions so partly recorded schools are transparent.
- `eligible = completed + pending + not_recorded`. Percentage uses completed / eligible, never completed / recorded. Zero eligible schools is N/A. No date filter hides outstanding or missing schools.
- Completed-school timestamp is the latest completion status update across divisions. The existing schema does not preserve an actual delivered-on date or immutable status event history; the UI explicitly labels this timestamp. Current trainer assignments and recorded status authors are shown separately. No delivery dates or historical trainer assignments are fabricated.
- Coverage uses unrounded ratios: Fully Covered=100%; Almost All ≥80%; Partial ≥50%; Low >0%; Not Started=0%. A separate Not Recorded badge/filter accompanies any coverage category with missing records. This avoids hiding an 80%-covered topic that also has missing records. Admin settings are persisted per academic year and enforce 0 < partial < almost_all < 100.
- High coverage supports question selection; it does not establish student mastery and creates no exam automatically.

## Deployment and verification

1. Back up the database. Inspect duplicate groups with the preflight queries below. Verify the academic-year and enrollment migrations already exist. This migration is independent of the optional 20261010200000 attendance migration.
2. Apply `supabase/migrations/20261011160000_class_session_coverage.sql` with the normal database migration owner, in a staging environment first. It runs in one transaction. It adds tables, linkage, constraints, indexes and a service-role-only RPC. It does not delete or rewrite division completion statuses. Backfilling linkage fires the existing session-master update timestamp trigger; saved division status timestamps are unchanged.
3. Run `PGLITE_MODULE=/path/to/@electric-sql/pglite/dist/index.js node scripts/test-class-session-coverage.mjs`, `node scripts/test-session-coverage-access.mjs`, `node scripts/test-query-refresh.mjs`, `npx tsc --noEmit`, and `npm run build`.
4. Deploy application code only after staging passes. Compare a known school's Class 5 / Unit 1 / all divisions with Session Status; mark one pending then complete. Confirm graph counts change once, and detail dates/authors match saved records. Repeat with two schools, a restricted trainer, another year, zero eligible schools, and a cancelled override. Open ICA/MCA/FCA preparation and review the reference panel without creating an exam.
5. No live database connection was available during implementation, so production counts, staging authentication and deployment must be verified by the connected project's operator. Before the migration, only the new section shows a setup message; other modules remain available.

Refreshes reuse the existing targeted cache invalidation, Realtime listeners and active-page background refresh. Detail data is loaded only when a session is selected. Assessment planning data is loaded only when its panel is expanded. The SQL query aggregates enrollment divisions in the database and returns summary rows, not student records.

## Preflight queries (read-only)

```sql
-- Review what will be grouped as the same common definition.
SELECT academic_year,class,unit,lower(btrim(session_name)) name_key,
       lower(btrim(coalesce(topic,''))) topic_key,
       count(*) legacy_rows,count(DISTINCT school_id) schools
FROM sessions GROUP BY 1,2,3,4,5 ORDER BY 1,2,3,4;
-- Unsupported or missing scope must be corrected deliberately before migration.
SELECT id,academic_year,class,unit FROM sessions
WHERE academic_year IS NULL OR class IS NULL
   OR unit NOT IN ('Unit-1','Unit-2','Unit-3','Unit-4');
```

## Rollback

Revert the application merge commit first. Keeping the additive schema in place is the safest rollback; old workflows continue to work. If removal is necessary, export the three new tables (preserves admin settings and cancellations) and run `docs/sql/rollback-class-session-coverage.sql`. It removes only the new schema and linkage. Original session rows and division status records remain. Restoring catalogue IDs/settings/cancellations from the backup is required before re-enabling the feature; a fresh migration generates new catalogue UUIDs.
