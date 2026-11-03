# Approved accounts only

This release closes anonymous application data access. Existing account and
school records remain intact. Only administrators can create, activate, disable,
reset or grant access to accounts. There is no signup or automatic first-login
administrator creation. Existing approved active accounts continue to work after
signing in again. Review Users & Access and disable accounts you no longer approve.

## Required deployment steps

1. Verify an existing active administrator account has a private password (not the
   former built-in default). Reset it through the current administrator UI before
   rollout if necessary. New/reset passwords require at least 12 characters. The
   former default password is explicitly blocked; there is no emergency shared
   login. If no administrator account is recoverable, the hosting/database owner
   must restore one through a trusted server-side maintenance process using this
   app's password hashing function, not an anonymous browser endpoint.
2. Set `APP_SESSION_SECRET` to a cryptographically random value of at least 32
   characters in the protected app-server environment. Never use a `VITE_` variable,
   commit it, or send it in chat. `openssl rand -hex 32` can generate a value in
   your own trusted terminal. Keep the same secret across server replicas.
3. Confirm the Supabase server URL and privileged server key are configured as
   described in `supabase-server-configuration.md`.
4. Deploy this app version and apply
   `20260927130000_private_account_access.sql` in a coordinated maintenance window.
   Apply the database restriction first if preventing exposure takes priority;
   the old browser data requests will stop working until the new app is deployed.
   There is no data deletion. Existing migrations should already be installed.
5. Sign in again. Old sessions and raw shared-password access are rejected. Resetting
   a password or disabling an account blocks subsequent server requests. The
   browser rechecks on focus and once per minute while visible; previously seen
   content cannot be recalled from someone who was previously approved.

Do not merge into an auto-deploying main branch until the administrator account
and server secret are ready. Without the new secret, sign-in fails closed.
The code workspace has not configured the live secret or applied the migration.

## Data and photos

Browser queries for schools, students, attendance, divisions and clusters now go
through the authenticated server. The server restricts table names, prevents
arbitrary joins, checks permissions, and adds school filters for scoped accounts.
All listed academic/account tables revoke anonymous and generic Supabase Auth
access. Existing server functions and approved MCP operators keep their own
server-side authorization. Review the MCP email allow list separately if needed.

Photo upload/delete/read endpoints require approval. New uploads no longer add
an anyone-reader permission or fall back to Drive root. In-app Drive photos load
through an authorized server request; exported links require the recipient's
Google Drive permission. Existing public file permissions and folder-inherited
sharing cannot be revoked by a GitHub merge. Review both Drive folders and old
photos in Google Drive, restrict sharing to approved people, and test the links
in a signed-out browser. Already downloaded copies cannot be revoked.

The login page, static JS/CSS and OAuth discovery/consent pages remain reachable.
To hide the entire website URL as well, enable a private/invite-only deployment
or identity-aware access gate in the actual hosting provider. An app login and
private hosting are separate controls. This repository does not configure that
hosting-level gate.

## Verification

Local tests: `node scripts/test-private-access.mjs`,
`PGLITE_ROOT=<pglite-package-path> node scripts/test-private-access-db.mjs`,
TypeScript, targeted ESLint and production build. After deployment verify an
incognito user cannot load app data, direct anonymous database reads are denied,
an approved user sees only permitted schools, disabled users cannot fetch new
data, password resets invalidate sessions, and an admin can still manage users.
