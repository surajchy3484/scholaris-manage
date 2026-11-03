# Clicker import timeout fix

The 316-result import was sent in batches of up to 300. Each write also rewrote all results for the affected assessments, and existing-row updates ran five concurrent requests against a writer that serializes access.

Clicker inserts now use at most 25 rows per request. Updates run sequentially. The preview tracks acknowledged rows and reports saved progress; retries in the same preview skip those rows. If a connection fails with an unknown commit outcome, reopen the files to rematch database records before retrying. Database duplicate protection remains enabled.

Apply `20261023100000_clicker_import_performance.sql` after previous migrations, then publish the application. The migration preserves the installed writer's authorization and evaluation rules, adds lookup indexes, writes full results only for changed rows, and synchronizes changed rankings separately. It requires the writer from `20261010110000_refresh_scores_after_clicker_delete.sql` (including later context patches). It fails atomically if the installed function has an unexpected structure.

No live database was accessed or modified during this fix. Local PGlite tests imported 316 fixture rows in 25-row batches and checked result counts, scores, ranks, updates and duplicate rejection. Existing preserved-context and deletion regressions also passed. Hosted timing still needs checking after deployment.

Before migration, retain the output of `SELECT pg_get_functiondef('public.universal_clicker_write(text,jsonb,uuid[],jsonb,uuid[])'::regprocedure);`. Rollback restores that exact definition and reverts the app commit if needed. Added indexes can remain. Do not rerun an older writer migration, because it may remove the preserved evaluation context fixes. Saved imports do not need removal for rollback.
