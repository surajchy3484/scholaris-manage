# Recover Clicker deletion

The screenshot's message comes from a missing database RPC, not the image or
school permissions. An ordinary GitHub merge does not install a database RPC.

In the SQL editor of the app's actual hosting database, run the complete file:
`supabase/migrations/20260927180000_clicker_delete_recovery.sql`.
Use the database connected to this SchoolRise deployment. The script only
installs/replaces a service-role-only deletion function and refreshes the API
schema; running it does not delete any existing records. It can be rerun.

Deploy this app change, refresh Clicker Master, select the records and confirm
Delete. Deletion no longer needs the universal answer-evaluation migration. The
function supports legacy and universal Clicker schemas, checks school scope in
the transaction, removes linked assessment results, and reranks remaining rows.
It preserves manually maintained exam_scores summaries. Insert/update still need
the full Universal Question Master migration and visible exact answer keys.

The existing universal writer remains a compatibility path only when the new
function is absent. Permission or data errors never trigger a fallback. If both
functions are absent, the UI identifies the exact repair file and confirms that
nothing was deleted.

No production database connection was available in the code workspace. This
migration has been tested locally, not applied to the live database. Use the
hosting SQL editor; do not paste database passwords or private keys into chat.
