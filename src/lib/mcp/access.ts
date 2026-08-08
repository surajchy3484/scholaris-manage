import type { ToolContext } from "@lovable.dev/mcp-js";
import { ToolError } from "@lovable.dev/mcp-js";

/**
 * Scholaris keeps its academic tables reachable only by the service role, so
 * MCP tools run privileged queries. Every tool therefore has to prove the
 * caller is (a) an authenticated OAuth user and (b) on the operator-managed
 * allow list in `mcp_allowed_emails` before any data is read.
 */
export async function requireApprovedOperator(ctx: ToolContext) {
  if (!ctx.isAuthenticated()) {
    throw new ToolError("Not authenticated. Sign in through the app to use these tools.");
  }
  const email = ctx.getUserEmail()?.trim().toLowerCase();
  if (!email) {
    throw new ToolError("This account has no verified email address, so access cannot be granted.");
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("mcp_allowed_emails")
    .select("email")
    .eq("email", email)
    .maybeSingle();
  if (error) throw new ToolError(error.message);
  if (!data) {
    throw new ToolError(
      `${email} is not approved for Scholaris agent access. Ask an operator to add this address to the approved list.`,
    );
  }
  return supabaseAdmin;
}

/** Uniform text + structured MCP tool result. */
export function jsonResult(payload: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload) }],
    structuredContent: payload as Record<string, unknown>,
  };
}
