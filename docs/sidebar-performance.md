# Sidebar loading improvements

- Route preloading starts on link intent (hover/focus), rather than waiting for navigation.
- Sidebar intent prefetches the selected section's data after 100 ms: School Dashboard, Reports, Overall Report, and the first 25-row page of Assessment, Question and Clicker Master. It does not download every section at login.
- Prefetch and mounted pages use identical query options/keys, so in-flight requests are deduplicated and fresh data is reused. Dynamic imports are checked against the initiating account token and academic year before warming any data.
- Reports and Overall Report now share one academic-year-specific report cache, including school report drilldowns. School and master page caches include the selected academic year.
- Removed forced mount/focus refetches and duplicate 30/60-second polling from report/session/dashboard views. Existing cached data remains visible during background refreshes.
- Database change notifications are coalesced in bounded 250 ms windows, refreshing only affected query families. Imports no longer trigger a global refresh per changed row. Account/year and unknown change types retain broad invalidation.
- The existing 60-second fallback refreshes active queries only while the page is visible, without cancelling in-flight fetches or marking every inactive section stale. Mutation-specific invalidations and existing account/year cache resets remain in place.

Validation: production build, TypeScript and targeted ESLint passed. `node scripts/test-query-refresh.mjs` verifies that 1,000 attendance notifications trigger one affected refresh, unrelated school data remains fresh, disposed queues do not run, account/year change families remain broad, and prefetch/page requests share cache keys for all three master lists without duplicate reads.

These changes reduce duplicate requests and repeat-navigation work. They do not guarantee zero loading time on a first visit. Large reports still require their authorized source data; production network/database latency and end-to-end browser timings were not measured in this environment. No database migration or production data writes are required. Rollback is a normal revert of this commit.
