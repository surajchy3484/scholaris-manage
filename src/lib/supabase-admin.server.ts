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
function createAdminClient(academicYear?: string) {
  const { url, key } = resolveSupabaseServerConfig(process.env);
  return createClient<Database>(url, key, {
    global: { fetch: academicYear ? academicFetch(key, academicYear) : createAdminFetch(key) },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}
let client: ReturnType<typeof createAdminClient> | undefined;
export function getSupabaseAdmin(academicYear?: string) {
  if (academicYear) return createAdminClient(academicYear);
  // A missing configuration is not cached; fixing secrets and retrying can recover.
  return (client ??= createAdminClient());
}

function academicFetch(key: string, year: string): typeof fetch {
  const request = createAdminFetch(key);
  const yearTables = new Set([
    "sessions",
    "session_division_status",
    "attendance",
    "assessments",
    "clicker_records",
    "assessment_results",
    "exam_scores",
  ]);
  return (input, init) => {
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
    );
    const method = (
      init?.method ?? (input instanceof Request ? input.method : "GET")
    ).toUpperCase();
    const table = url.pathname.split("/").at(-1)!;
    if (method === "GET" || method === "HEAD") {
      if (table === "students") url.pathname = url.pathname.replace(/students$/, "academic_roster");
    }
    if (yearTables.has(table) && ["GET", "HEAD", "PATCH", "DELETE"].includes(method))
      url.searchParams.append("academic_year", `eq.${year}`);
    if (yearTables.has(table) && method === "POST" && typeof init?.body === "string") {
      const body = JSON.parse(init.body);
      const assign = (row: Record<string, unknown>) => {
        if (row.academic_year && row.academic_year !== year)
          throw new Error("Record year must match the selected Academic Year");
        return { ...row, academic_year: year };
      };
      init = {
        ...init,
        body: JSON.stringify(Array.isArray(body) ? body.map(assign) : assign(body)),
      };
    }
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init?.headers).forEach((v, k) => headers.set(k, v));
    headers.set("x-academic-year", year);
    return request(url, { ...init, headers });
  };
}
