# Server database connection

The app's privileged database operations use `src/lib/supabase-admin.server.ts`.
This keeps credential validation outside the generated Supabase client.

The application server runtime (including the preview server) needs:

- `SUPABASE_URL`: the URL of the existing project (`VITE_SUPABASE_URL` is also
  accepted because the project URL is public).
- A privileged credential, resolved in this order:
  1. `SUPABASE_SECRET_KEY` (modern secret key).
  2. `SUPABASE_SECRET_KEYS` (JSON dictionary, using `default` or its sole key).
  3. `SUPABASE_SERVICE_ROLE_KEY` (legacy service-role JWT).
  4. `SUPABASE_SERVICE_KEY` (hosting alias, validated as a privileged key).

Configure credentials in the hosting provider's protected server environment.
Secrets available only to a separate Edge Function are not automatically
available to the application's Nitro/preview server. Restart the preview or
redeploy after changing runtime configuration. For a managed Lovable Cloud
backend, use the platform's database connection repair/configuration workflow;
this repository cannot obtain or create the provider's missing private key.

Never commit credentials or use `VITE_` variables for privileged keys. The
resolver deliberately rejects anon/publishable keys and does not fall back to
a browser client or weaken database permissions. Key values are never included
in configuration errors or logs. An absent or ambiguous secret remains a clear
configuration error rather than pretending data is available.

After restoring database access, apply any missing database migrations, including
`20260926150000_universal_question_bank.sql`. The server credential fix does not
apply migrations. Live hosting credentials and schema cannot be verified by the
local unit tests.

Validation: `node scripts/test-supabase-server-config.mjs`, `npx tsc --noEmit`,
`npm run build`. Tests cover new/legacy keys, named dictionaries, public-key
rejection, recovery after missing configuration, caching and request headers.
