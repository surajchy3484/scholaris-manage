import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { resolveSupabaseServerConfig } from "./supabase-config.server";

export function createAdminFetch(key: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) new Headers(init.headers).forEach((value, name) => headers.set(name, value));
    // Opaque secret keys belong in apikey, not in a JWT Authorization header.
    if (key.startsWith("sb_secret_") && headers.get("Authorization") === `Bearer ${key}`)
      headers.delete("Authorization");
    headers.set("apikey", key);
    return fetch(input, { ...init, headers });
  };
}
function createAdminClient() {
  const { url, key } = resolveSupabaseServerConfig(process.env);
  return createClient<Database>(url, key, {
    global: { fetch: createAdminFetch(key) },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}
let client: ReturnType<typeof createAdminClient> | undefined;
export function getSupabaseAdmin() {
  // A missing configuration is not cached; fixing secrets and retrying can recover.
  return (client ??= createAdminClient());
}
