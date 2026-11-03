# Preserved assessment edits and student deletion

## Assessment Master corrections

The user selected keeping existing marks unchanged. Saving an evaluated assessment now captures its original metadata in `assessments.preserved_context` before accepting corrections. Existing Clicker answers, question snapshots, results and score rows are not recalculated or relabelled. Reports, Clicker assessment selectors, evaluation and report-summary cleanup use the service-role-only `assessment_evaluation_context` view. The human-readable assessment ID remains a live link and uses the existing transactional rename cascade.

The Master row may change school, class, section, exam type, question-set version and configured academic year. A year correction moves the Master row into that year's list, but old results stay in their original year. Additional Clicker entries on that assessment retain the original evaluation setup; create a new assessment to grade against a different setup. If the original answer key is unavailable, additional grading is rejected rather than guessed. The edit dialog explains this distinction. Existing edit permissions remain required; restricted users must have access to both original and current schools and any new target school. Client payloads cannot replace the protected context or saved answer key.

## Confirmed student deletion

Student/Exam Report delete permissions are enforced. A selected student must belong to the requested school and selected academic year. Restricted users need access to every school containing that student's linked history; administrators can delete from any school or centre.

Deletion permanently removes the student's identity, enrollments, attendance, Clicker records, assessment results and exam-score rows across academic years, in one transaction per batch (up to 250). It updates affected remaining ranks and refreshes school/dashboard/report caches. Shared assessments, question catalogues, other students, external Drive photos and pre-existing database backups are not deleted. Direct table deletion stays guarded; only the service-role RPC opens a transaction-local allowance for the selected IDs. A failure rolls back the batch. Bulk selections can span several independently committed batches.

## Deployment

Back up the database; apply existing migrations first, particularly assessment rename, assessment deletion and plain-ID migrations. Then apply:

1. `20261022130000_edit_preserved_assessment_details.sql`
2. `20261022140000_allow_student_deletion.sql`

Publish the application after both migrations succeed. Installing either migration does not delete students or change existing marks. Production migrations and live authenticated verification cannot be performed from this workspace.

Validation commands: `PGLITE_ROOT=/path/to/@electric-sql/pglite node scripts/test-academic-years.mjs`, `node scripts/test-assessment-delete-access.mjs`, `node scripts/test-student-delete-access.mjs`, `node scripts/test-student-parameter-report.mjs`, `npx tsc --noEmit`, `npm run build`. The older `test-academic-api.mjs` has a stale Clicker-delete mock without `.delete()` and fails in that pre-existing code path; targeted access tests cover the new actions.

## Rollback

Student deletion: revert the application deletion handler to its prior guard, restore `academic_preserve_student()` from the academic-years migration, and drop `delete_students_permanently(uuid,uuid[],uuid[])`. Previously confirmed deletions require a database backup to restore.

Assessment corrections: first restore corrected Master metadata from each row's `preserved_context` in a reviewed transaction while the new correction trigger is still enabled. Preserve the current assessment ID so links remain consistent. Restore the editable fields (school_id, school_name, class, section, exam_type, academic_year, question_set_version_id, subject, name, date, total_questions, total_marks, passing_marks, status) from that snapshot. Then restore the prior definitions of `academic_assessment_pin`, `evaluate_universal_clicker`, `academic_record_year`, `universal_clicker_write` and `delete_assessments`, and revert the application changes. Retain the snapshot column as audit data. Do not simply switch reports back to corrected Master metadata: that would relabel historical results. Do not rerun entire old migrations for rollback.
