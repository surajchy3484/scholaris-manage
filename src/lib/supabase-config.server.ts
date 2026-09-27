/** Resolve privileged credentials exclusively from server environment variables. */
export function resolveSupabaseServerConfig(env: Record<string, string | undefined>) {
  const url = env.SUPABASE_URL?.trim() || env.VITE_SUPABASE_URL?.trim();
  let key = env.SUPABASE_SECRET_KEY?.trim();
  if (!key && env.SUPABASE_SECRET_KEYS?.trim()) {
    let keys: unknown;
    try {
      keys = JSON.parse(env.SUPABASE_SECRET_KEYS);
    } catch {
      throw new Error("Server database setup: SUPABASE_SECRET_KEYS must be a JSON object.");
    }
    if (!keys || typeof keys !== "object" || Array.isArray(keys)) {
      throw new Error("Server database setup: SUPABASE_SECRET_KEYS must be a JSON object.");
    }
    const entries = Object.entries(keys).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string" && !!entry[1].trim(),
    );
    const defaultKey = entries.find(([name]) => name === "default");
    if (defaultKey) key = defaultKey[1].trim();
    else if (entries.length === 1) key = entries[0][1].trim();
    else if (entries.length > 1)
      throw new Error(
        "Server database setup: select one key using SUPABASE_SECRET_KEY or add a default entry to SUPABASE_SECRET_KEYS.",
      );
  }
  key ||= env.SUPABASE_SERVICE_ROLE_KEY?.trim() || env.SUPABASE_SERVICE_KEY?.trim();
  if (!url || !key) {
    throw new Error(
      !url
        ? "Database connection is not configured on the server. Set SUPABASE_URL in the hosting environment and restart the preview or redeploy."
        : "Database server key is not configured. Restore the hosting database connection or set SUPABASE_SECRET_KEY (or legacy SUPABASE_SERVICE_ROLE_KEY) as a server-only secret, then restart the preview or redeploy. A GitHub merge does not configure hosting secrets.",
    );
  }
  try {
    const parsed = new URL(url);
    if (!["https:", "http:"].includes(parsed.protocol)) throw new Error();
  } catch {
    throw new Error("Server database setup: SUPABASE_URL must be a valid HTTP(S) URL.");
  }
  // Never fall back to anon/publishable keys: this app authorizes users before
  // reaching service-role-only tables and RPCs, which require a privileged key.
  let isServiceRole = false;
  if (!key.startsWith("sb_secret_")) {
    try {
      isServiceRole =
        JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString("utf8")).role ===
        "service_role";
    } catch {
      /* Invalid or public keys are rejected below without logging their values. */
    }
  }
  if (!key.startsWith("sb_secret_") && !isServiceRole) {
    throw new Error(
      "Server database setup: a secret or service-role key is required. An anon/publishable key cannot be used for administrator operations.",
    );
  }
  return { url, key };
}
