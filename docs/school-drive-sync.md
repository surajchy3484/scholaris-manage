# School workbooks in Drive

This feature creates one `.xlsx` workbook per school in folder
`1tUpZACLsarpCEiY0-43SFCvBQnASSusY`. It keeps Supabase as the live database.
It does not increase Supabase capacity, move original photos, export accounts,
or delete existing records. Unassigned records (no school_id) are not assigned
by guessing a school name. Use provider backups for full recovery.

## Activate after deployment

1. Apply `supabase/migrations/20260926120000_school_drive_sync.sql` after existing
   migrations. This adds a sync-state table and service-role-only functions.
2. Configure the existing server-side `LOVABLE_API_KEY` and
   `GOOGLE_DRIVE_API_KEY` connection with writer access to the exact folder.
   Do not put credentials in browser/VITE variables. The app never falls back
   to Drive root or grants public sharing; existing folder permissions apply.
3. In a staging environment, set `SCHOOL_DRIVE_SYNC_ENABLED=true` and run the
   acceptance checks below with synthetic records. Verify that the connector
   returns a strong ETag and honors `If-Match` for media PATCH. If it does not,
   leave sync disabled until a connection supporting conditional writes is
   available. Missing ETags fail closed in code.
4. After acceptance, enable the same flag in production. Sign in as an admin
   and open Settings → School Excel files in Google Drive → Sync.

The connection and production migration have not been verified by local tests.
Merging code does not activate sync or create files in Drive.

## Editing and sync behavior

Every workbook contains School, Students, Attendance, Exam Scores, Assessments,
Questions, Sessions, Divisions, Session Status, Clicker Data and Assessment
Results sheets. The Read Me sheet lists supported editable fields:

- School: location.
- Students: name, roll_number, enrollment_date.
- Attendance: date, status.
- Exam Scores: score, remarks.
- Session Status: status.

All other fields are reference-only, including IDs, relationships, class moves,
assessment definitions, question answers and calculated results. Make those
changes in the app so its existing update/recalculation workflow runs. Add and
delete records in the app. Removed spreadsheet rows are restored on export;
they never delete app records. Preserve IDs, sheet names and hidden metadata.
Use text ISO dates (YYYY-MM-DD), text roll numbers and literal values (no formulas).

Save the original `.xlsx` in the folder, retaining its Drive file identity.
Converting it to a Google Sheet or uploading a separate copy is not supported.
Click Sync to import supported edits and refresh the export. Optional automatic
sync runs every two minutes only while this Settings page is open and visible.
It stops on an error or conflict. There is no deployed scheduler/webhook, and
changes made while the app is closed require the next sync.

A per-school lease serializes sync runs. Stored per-row hashes detect edits in
both places. Conflicts stop before importing; inspect the indicated record IDs,
resolve values in the app and workbook, then retry. Imports use optimistic
row checks and atomic batches of up to 250 edits. A later failed batch or Drive
write does not roll back earlier successful batches. Retry recognizes matching
rows without inserts or duplicates; intervening edits trigger conflicts.

Exports use one database statement snapshot. Workbook transfers are capped at
20 MiB and cells at 32,000 characters; oversized exports fail without truncating
records. Very large schools need partitioned archives or a different sync format.
Drive quota and Supabase usage must be checked in the actual provider accounts;
no storage upgrade or unlimited capacity is implied by this feature.

## Acceptance and recovery

- Confirm generated workbooks are in the specified folder and have no new
  permission grants. Confirm a non-admin cannot call sync endpoints.
- Edit a supported field in Excel, save the original file and sync: the app
  should refresh. Edit in the app and sync: the workbook should update.
- Edit the same row in both places: expect a conflict, not an overwrite.
- Delete a workbook row: the app record must remain.
- With a captured file ETag, modify the file separately, then PATCH using that
  stale ETag: the live connector must return HTTP 412 and preserve the newer
  file. Do this only with synthetic staging data before enabling production.
- Interrupt a sync and retry; verify imported batches remain and no rows duplicate.
- Move/delete the workbook: restore the original file to the configured folder
  and retry. Do not clear baselines to suppress conflicts.
- Disable `SCHOOL_DRIVE_SYNC_ENABLED` to stop writes; existing app features keep
  working. Retain sync state and workbooks for recovery. Provider database
  backups remain necessary; these spreadsheets are not a full database backup.

Local checks: `node scripts/test-school-drive.mjs`; set `PGLITE_ROOT` to an
external `@electric-sql/pglite` installation and run
`node scripts/test-school-drive-db.mjs`; `npm run build`.
