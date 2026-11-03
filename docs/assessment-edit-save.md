# Assessment edit/save repair

The database previously treated a display-code correction (e.g. ASM-2026-0120 to ASM-0120) as a change to evaluated exam context. The new migration permits this correction and atomically updates Clicker records, assessment results, legacy questions and question-bank migration issue links. Universal Question Master still matches by exam type and class. Existing snapshots, scores, answers, academic years and assessment UUIDs remain unchanged.

School, class, section, exam type, academic year and question-set version remain protected after evaluation. Name, date, status and other previously supported descriptive edits still save. Duplicate codes or codes with orphaned linked records are rejected without partial updates. Existing edit permissions and school scope checks remain in place.

## Deployment

1. Back up the database and test on staging with its normal migration runner.
2. Apply `supabase/migrations/20261021120000_assessment_code_rename.sql` after all existing migrations. It is transactional and does not rename any existing assessment by itself.
3. Edit an existing assessment ID, save, reload and confirm Clicker/results remain linked with the same counts and scores. Test a duplicate ID rejection and an authorized school-scoped user.

Local verification: `PGLITE_ROOT=/path/to/@electric-sql/pglite node scripts/test-academic-years.mjs`. This executes the migration against PostgreSQL-compatible fixtures, including evaluated results. Live production data and UI have not been verified from this workspace.

## Rollback

Renamed IDs need not be reversed: dependent links are already consistent. If a particular code must be restored, edit it back before rolling back the functions. Do not restore only the parent label.

In one transaction, drop trigger `cascade_assessment_code` on `public.assessments`, drop function `public.cascade_assessment_code()`, restore `academic_assessment_pin()` from migration `20261010100000_allow_safe_assessment_edits.sql`, and restore only `evaluate_universal_clicker()` from migration `20261001120000_academic_years.sql`. Commit after validation. Do not rerun the entire academic-years migration for rollback. This reinstates the previous ID lock without deleting data.
