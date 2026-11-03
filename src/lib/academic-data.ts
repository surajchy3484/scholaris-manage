import { getAcademicYear } from "./academic-year";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { getAccessToken } from "./app-access";
import { requestAcademicData } from "./academic-data.functions";

// Keep the existing query-builder API; every request goes to our authorized server.
export const supabase = createClient<Database>(
  "https://schoolrise.invalid",
  "academic-data-proxy",
  {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: async (input, init) => {
        const req = new Request(input, init);
        const url = new URL(req.url);
        if (!/^\/rest\/v1\/[a-z_]+$/.test(url.pathname))
          throw new Error("Unsupported data request");
        try {
          const response = await requestAcademicData({
            data: {
              token: getAccessToken(),
              academicYear: getAcademicYear(),
              table: url.pathname.split("/").pop()!,
              query: url.search.slice(1),
              method: req.method as "GET",
              headers: Object.fromEntries(req.headers.entries()),
              body: req.method === "GET" || req.method === "HEAD" ? undefined : await req.text(),
            },
          });
          return new Response(
            response.status === 204 || req.method === "HEAD" ? null : response.body,
            { status: response.status, headers: response.headers },
          );
        } catch (error) {
          return new Response(
            JSON.stringify({ message: error instanceof Error ? error.message : "Access denied" }),
            { status: 403, headers: { "content-type": "application/json" } },
          );
        }
      },
    },
  },
);
