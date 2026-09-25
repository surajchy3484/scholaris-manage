# Shared student details list

School → Students, School Exam Dashboard, and Student Exam Records use the same `StudentListTable` component. It has a compact table, sticky headings, vertical/horizontal scrolling, accessible row selection/actions, and server pages of 50 students. Changing filters updates queries without a page reload. Full selection and report export fetch all matching pages only on demand.

Columns: Student ID, name, class, division/section, roll number, attendance, ICA, IMF, FCA, actions. The requested IMF heading uses the app's existing middle-assessment mapping: MCA if present, otherwise legacy IMF. No saved assessment types are renamed. The latest updated score per student/type is used, with ID as a stable tie-breaker. These summary columns are not a selected academic-year or subject breakdown.

Filters: name/ID (also roll), class, actual school division values, attendance recorded/missing/below 75%/at least 75%, selected ICA/IMF/FCA score recorded/missing and optional 0–100 minimum/maximum. A zero score is recorded; missing data shows a dash. Attendance uses the manual override when present, otherwise the percentage of present attendance records. Missing attendance stays distinguishable from 0%.

Select All covers all matching pages. Changing any selection-defining filter clears selection and discards an in-flight selection response from the previous filter. View-only accounts have no Edit/Delete controls. Edit and Delete buttons are independently enabled by the relevant Students or Exam Report permission. The new save/delete/grouping endpoints re-check action permission and school assignment server-side. Deleting students and their exam scores is atomic within each batch. Existing direct-client access paths elsewhere in the app were not redesigned in this change.

## Rollout

Apply `supabase/migrations/20260925133000_student_details_list.sql` before publishing this app version. It adds an index and service-role-only functions; it does not modify existing records. It relies on the previous performance migration for school facets. Use staging and the existing migration/backup process; for large tables, create the score index concurrently outside the migration transaction before applying it.

Production build passes. Schema-derived embedded PostgreSQL tests exercise 10,000 students, pagination, zero/missing scores, IMF mapping, attendance overrides, search escaping, school isolation, role denial and score cleanup. Render tests exercise table content and independent View/Edit/Delete controls; handler tests ensure denied actions and cross-school access never reach the database. Repository-wide type checking still has the six existing errors documented in the performance audit. No live database migration or authenticated browser test was performed.

Run:

```sh
npm run build
node scripts/test-student-list-ui.mjs
PGLITE_ROOT=/path/to/node_modules/@electric-sql/pglite node scripts/test-student-list.mjs
```

The dedicated Student Exam Records page fetches just its school's requested page and facets. The School Exam Dashboard retains its existing full-data summary/charts request in addition to the paged details; converting those older summary charts to server aggregates is separate work. Selection/export of very large result sets still holds selected records in memory.
