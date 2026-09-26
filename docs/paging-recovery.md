# Missing paging function recovery

The UI error "Unable to load paged data. Apply the performance migration and retry" previously represented **every** RPC failure. The merged front end depends on SQL functions which may not yet exist in a deployment's database. This repair detects missing functions (`PGRST202`, or an undefined-function error naming the requested RPC) and uses existing tables for read operations only.

The compatibility reader runs on the server after existing module and school-access guards. It pages through all relevant records rather than truncating at 1,000, applies filters/counts/score mapping, and returns only the requested page. Assigned-school scopes remain enforced, including question keys scoped through assessments. Large IN lists are split into bounded requests. No browser-facing service key or new table policy is introduced.

Installed RPCs remain the first choice and are retried on each request, so applying the migrations restores the efficient path without another deployment. Permission errors, SQL failures and network errors do not activate the fallback. Transactional student import/delete functions intentionally have no replacement composed of separate writes: if missing, they report that a database update is required without changing records.

This is compatibility recovery, not an alternative to installing migrations for scale. The fallback processes more records on the server and can be slower for large schools. Apply the two migrations from the previous PRs for full performance and transactional actions:

- `20260925090000_performance_paging.sql`
- `20260925133000_student_details_list.sql`

Validation: production build; 1,250-record fallback fixtures covering complete reads, counts, scores, filters, school isolation and question keys; missing-RPC versus permission-error routing; unchanged installed-RPC path; no mutation fallback; existing list permission tests. TypeScript retains only the previously documented errors. Production database state and deployment were not accessible from this workspace, so the actual live RPC error code is not verified.
