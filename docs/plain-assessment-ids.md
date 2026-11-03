# Original assessment ID format

New and duplicated assessments already generate ASM-0001-style codes. Apply `20261022110000_plain_assessment_ids.sql` after `20261021120000_assessment_code_rename.sql` to normalize existing ASM-year-number IDs and enforce the original format on new or changed IDs, including imports. Four-digit padding remains; numbers beyond 9999 naturally require more digits. Unchanged legacy IDs can still have other fields edited.

Examples: ASM-2026-0118 → ASM-0118; ASM-2026-0119 → ASM-0119; ASM-2026-0120 → ASM-0120. School, year, UUID, saved question key and results are preserved by the existing rename cascade. No shared questions are changed. Duplicate suffixes or occupied target links abort the transaction rather than merging records. A restricted backup table records each code correction.

Back up the database and apply in staging first. Production migration has not been applied from this workspace. Verify the displayed IDs and linked results, then publish the latest application.

Rollback: in a transaction, drop trigger `assessment_plain_code` on `public.assessments`; restore `assessment_id` from `assessment_code_format_backup.old_code` joined on `assessment_uuid=assessments.id`, only for rows still matching `new_code`; drop function `public.assessment_plain_code()` and commit. Keep the existing rename cascade enabled so dependent links follow the rollback. Resolve code collisions before attempting rollback; never disable data-integrity triggers. Keep the backup for audit.
