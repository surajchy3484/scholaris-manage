# Academic Year, promotion and student history

## Deployment order

This release needs a database migration before the application is merged/deployed. A GitHub merge cannot run SQL or configure hosting secrets.

1. Back up the hosting database using the hosting provider's database backup/export facility. The app's legacy three-table export is not a complete database backup.
2. On a test database with the existing data, apply the already-released Universal Question Master and performance/student-list migrations, then `20261001000000_session_assignment_plans.sql` if it has not already been applied.
3. Apply `20261001120000_academic_years.sql` once through the SQL editor or normal migration runner. It runs inside a transaction and can be retried.
4. Check the current year, enrollment totals by school, and representative historical exams/sessions. Then apply the same migration to production and deploy this application revision.
5. Verify with a restricted staff account as well as an administrator: school visibility, year switching, one promotion, an old result and an old answer-key snapshot.

Do not run old migrations again indiscriminately: some earlier migrations are not idempotent. This change does not configure a database connection or apply a live migration automatically.

## Existing data

- Existing students become enrollments in **2026-27**, the agreed initial year. Permanent UUIDs and Student IDs remain unchanged.
- Untagged sessions and attendance are assigned 2026-27. Any year labels already recorded on assessments, scores, sessions or assignment plans are preserved and registered in the year master.
- Clicker records and calculated results inherit their linked assessment's year. Unlinked legacy rows retain an unassigned year; no historical year is guessed.
- No historical enrollment is invented from an exam score or a student's current class. If older records already use a different year label, create the corresponding historical enrollment through Academic Year, with the actual class/division, to include it in that year's roster and session views.
- Student class, division, school and roll number are authoritative in `student_enrollments`. The original student columns remain a compatibility projection of the current enrollment. Promotion does not mutate the source enrollment.
- Deleting a permanent student is blocked to preserve history. Use Active, Promoted, Transferred, Left School or Inactive enrollment status instead. Student IDs cannot be edited after creation.
- Existing duplicate human-readable Student IDs are preserved. New duplicates are rejected; the permanent UUID identifies a student across schools.

## Using the feature

The sidebar Academic Year selector scopes school student lists, attendance, exam reports, assessment/clicker grids and Session Status. Switching resets the query cache and page state without a document reload. The year master offers previous years and a single Current year.

Administrators can add years, change display names, and set Current. Select source enrollments using school, class, division and name filters. Select a target year and Review promotion. Edit each new school, class, division, roll and status, then Confirm new enrollments. Up to 500 students are saved atomically per operation; a duplicate or invalid row rolls the entire operation back. For larger cohorts, repeat with the remaining students. Duplicate target enrollments are never silently overwritten.

Student profiles include Student History. With report-view permission, users can compare multiple years, schools/classes, ICA/MCA/FCA percentages, attendance, class/division session completion, parameter/chapter/topic performance and original Clicker answer keys. No year selection means all historical years accessible to that user. Unit history reports class/division completion; it is not a claim of individual attendance.

Question Master remains universal by Exam Type + Class + Question Number. Question set versions save immutable named copies, optionally tied to the selected year. Select a version in the assessment form or use the current universal bank. The first evaluation pins an assessment's key for subsequent students; existing per-student snapshots remain authoritative. Completing an assessment also preserves its key and prevents reopening or changing its exam/year/class context. Visibility still controls whether an exam type can evaluate new/edited responses.

Clicker Master includes Academic Year. Imported rows must match the selected year if that column is supplied. Matching uses the selected year's enrollment and assessment, never another year's roster or another exam type's key.

## Validation

- `npm run build` and `npx tsc --noEmit`.
- `node scripts/test-academic-api.mjs`: year propagation, scoped mutations, permissions and protected-table denial.
- `PGLITE_ROOT=/path/to/@electric-sql/pglite node scripts/test-academic-years.mjs`: migration and rerun, promotion rollback, identity/transfer, year isolation, pinned keys and named versions, session history, school scope and database role denial.
- Existing session-school-roster, Clicker access/deletion and visual analytics regression tests.

Tests use local fixtures, not live school data. Production migrations and a live user acceptance check remain hosting deployment steps.
