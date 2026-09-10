/**
 * Server-only guard for the app's protected server functions.
 *
 * SchoolRise uses one shared operator login, so the password entered at login is
 * replayed to server functions and checked against APP_ACCESS_PASSWORD before
 * privileged database access is used.
 */
export function assertAccess(token: string) {
  const expected = process.env['APP_ACCESS_PASSWORD'] ?? "123456";
  if (!token || token !== expected) throw new Error("Unauthorized");
}

export async function adminDb() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}
