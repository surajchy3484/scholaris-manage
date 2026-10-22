# Assessment deletion

Administrators can delete assessments without a school assignment. Other users still require Assessment Master delete permission and access to the assigned school. The selected academic year is enforced in both server and database.

The confirmation explains that deletion removes selected assessments, their Clicker records, results, legacy assessment-specific questions and migration issue links. Shared Question Master questions and saved question-set versions remain. A single RPC transaction removes dependent records and updates only affected student/exam/year/subject report summaries using the latest remaining evaluated assessment, or clears the summary if none remains. A failure rolls back the entire batch. Bulk selections are processed in the existing client batches.

## Deployment

Back up the database. Apply `supabase/migrations/20261022100000_delete_assessments.sql` before deploying the app changes. It creates a service-role-only function and performs no deletions during migration. Publish the updated app, then verify deletion through an authorized account in staging, including an unassigned assessment, linked results, restricted school and wrong-year cases.

Tests: `node scripts/test-assessment-delete-access.mjs`; `PGLITE_ROOT=/path/to/@electric-sql/pglite node scripts/test-academic-years.mjs`; `npx tsc --noEmit`. Production database migration and live UI verification require deployment access unavailable in this workspace.

## Rollback

Revert the app changes first, then run `DROP FUNCTION IF EXISTS public.delete_assessments(uuid[],uuid[]);`. This restores previous application behavior. Deletions already confirmed by users are permanent; restoring deleted records requires the pre-deletion database backup. No automatic data deletion occurs when installing or removing the function.
