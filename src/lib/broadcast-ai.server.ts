import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import { createLovableAiGatewayRunIdFetch } from "./ai-gateway-run-id.server.ts";

function safeGatewayError(error: unknown): string {
  const details = (error && typeof error === "object" ? error : {}) as {
    statusCode?: number;
    responseBody?: string;
  };
  let upstreamMessage = "";
  if (details.responseBody) {
    try {
      const body = JSON.parse(details.responseBody) as { message?: unknown };
      if (typeof body.message === "string") upstreamMessage = body.message;
    } catch {
      // Avoid surfacing unstructured provider output to the user.
    }
  }
  if (details.statusCode === 401) return "The AI writing service is not configured. Please contact your administrator.";
  if (details.statusCode === 402) return upstreamMessage || "AI credits are currently unavailable for this rewrite.";
  if (details.statusCode === 403) return upstreamMessage || "The AI writing service denied this request.";
  if (details.statusCode === 404) return "The AI writing service is unavailable right now.";
  if (details.statusCode === 429) return "The AI writing service is busy. Please try again shortly.";
  if (details.statusCode && details.statusCode >= 500) return "The AI writing service is temporarily unavailable.";
  if (details.statusCode === 400) return "This announcement could not be rewritten. Please review or shorten the text.";
  return "The announcement could not be rewritten. Please try again.";
}

export async function rewriteAnnouncement(message: string): Promise<string> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("The AI writing service is not configured.");

  const runIdFetch = createLovableAiGatewayRunIdFetch();
  const provider = createOpenAI({
    baseURL: "https://ai.gateway.lovable.dev/v1",
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: runIdFetch.fetch,
  });
  try {
    const result = streamText({
      model: provider.responses("openai/gpt-6-astra"),
      instructions:
        "Rewrite the administrator's draft as a clear, professional, audience-appropriate announcement for all active SchoolRise STEM Trainers. Preserve every factual detail, name, date, number, instruction, and commitment. Do not invent or remove information. Improve clarity and grammar while keeping the original meaning and a concise, respectful tone. Return only the rewritten announcement body, without a heading, quotation marks, or commentary.",
      messages: [{ role: "user", content: message }],
      maxRetries: 0,
      providerOptions: {
        openai: {
          forceReasoning: true,
          reasoningEffort: "low",
          reasoningSummary: "auto",
          store: false,
          include: ["reasoning.encrypted_content"],
        },
      },
    });
    const rewritten = (await result.text).trim();
    if (!rewritten) throw new Error("The AI returned an empty rewrite. Please try again.");
    if (rewritten.length > 20_000) throw new Error("The AI rewrite is too long to use. Please shorten the draft.");
    return rewritten;
  } catch (error) {
    if (error instanceof Error && /empty rewrite|too long to use/.test(error.message)) throw error;
    console.error("[broadcast] AI rewrite failed", { statusCode: (error as { statusCode?: number })?.statusCode });
    throw new Error(safeGatewayError(error));
  }
}